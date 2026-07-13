import { MODE_LOCATION_CONFIG } from "../constants/config";
import {
  deleteWalkSession,
  finishWalkSession,
  getGpsPointsForSession,
  getLastGpsPointForSession,
  saveGpsPointWithNextIndex
} from "../database/walkRepository";
import { calculatePathDistanceMeters, haversineDistanceMeters } from "./distance";
import { ActiveWalk, ActivityMode, GpsPoint } from "../types/walk";

const gpsPersistenceQueues = new Map<number, Promise<void>>();

export type PointEvaluation =
  | {
      accepted: true;
      speedMetersPerSecond: number;
    }
  | {
      accepted: false;
      countAsRejected: boolean;
      reason: string | null;
    };

export function createActiveWalk(
  activityMode: ActivityMode,
  sessionId: number,
  startedAt = new Date().toISOString()
): ActiveWalk {
  return {
    activityMode,
    sessionId,
    startedAt,
    acceptedGpsPointCount: 0,
    points: [],
    gpsPausedEventCount: 0,
    rejectedGpsPointCount: 0,
    distanceMeters: 0,
    currentSpeedMetersPerSecond: 0,
    lastRejectedPointReason: null,
    stepCount: 0
  };
}

export function appendGpsPoint(activeWalk: ActiveWalk, rawPoint: GpsPoint): ActiveWalk {
  const previousPoint = activeWalk.points.at(-1);
  const evaluation = evaluateGpsPoint(activeWalk.activityMode, previousPoint ?? null, rawPoint);

  if (!evaluation.accepted) {
    return {
      ...activeWalk,
      lastRejectedPointReason: evaluation.reason,
      gpsPausedEventCount:
        !evaluation.countAsRejected && evaluation.reason
          ? activeWalk.gpsPausedEventCount + 1
          : activeWalk.gpsPausedEventCount,
      rejectedGpsPointCount: evaluation.countAsRejected
        ? activeWalk.rejectedGpsPointCount + 1
        : activeWalk.rejectedGpsPointCount
    };
  }

  const point = {
    ...rawPoint,
    pointIndex: activeWalk.points.length
  };
  const points = [...activeWalk.points, point];

  return {
    ...activeWalk,
    acceptedGpsPointCount: activeWalk.acceptedGpsPointCount + 1,
    points,
    distanceMeters: calculatePathDistanceMeters(points),
    currentSpeedMetersPerSecond: evaluation.speedMetersPerSecond,
    lastRejectedPointReason: null
  };
}

export function persistAcceptedGpsPoint(
  sessionId: number,
  activityMode: ActivityMode,
  rawPoint: Omit<GpsPoint, "pointIndex">
) {
  const previousOperation = gpsPersistenceQueues.get(sessionId) ?? Promise.resolve();
  const operation = previousOperation.then(async () => {
    const previousPoint = await getLastGpsPointForSession(sessionId);
    const evaluation = evaluateGpsPoint(activityMode, previousPoint, {
      ...rawPoint,
      pointIndex: 0
    });

    if (!evaluation.accepted) {
      return null;
    }

    await saveGpsPointWithNextIndex(sessionId, rawPoint);

    return evaluation;
  });
  const settledOperation = operation.then(
    () => undefined,
    () => undefined
  );

  gpsPersistenceQueues.set(sessionId, settledOperation);
  void settledOperation.then(() => {
    if (gpsPersistenceQueues.get(sessionId) === settledOperation) {
      gpsPersistenceQueues.delete(sessionId);
    }
  });

  return operation;
}

export async function flushPendingGpsPoints(sessionId: number) {
  await gpsPersistenceQueues.get(sessionId);
}

export async function finishPersistedActiveWalk(
  activeWalk: ActiveWalk,
  endedAt: string,
  stepCount = activeWalk.stepCount
) {
  await flushPendingGpsPoints(activeWalk.sessionId);
  const points = await getGpsPointsForSession(activeWalk.sessionId);

  if (points.length < 2) {
    await deleteWalkSession(activeWalk.sessionId);
    return null;
  }

  const durationSeconds = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(activeWalk.startedAt).getTime()) / 1000)
  );
  const distanceMeters = calculatePathDistanceMeters(points);

  await finishWalkSession(activeWalk.sessionId, {
    endedAt,
    distanceMeters,
    durationSeconds,
    stepCount
  });

  return activeWalk.sessionId;
}

export function evaluateGpsPoint(
  activityMode: ActivityMode,
  previousPoint: GpsPoint | null,
  rawPoint: GpsPoint
): PointEvaluation {
  const modeConfig = MODE_LOCATION_CONFIG[activityMode];

  if (!hasUsableAccuracy(rawPoint, modeConfig.maxAcceptedAccuracyMeters)) {
    return {
      accepted: false,
      countAsRejected: false,
      reason: `GPS signal weak (${Math.round(rawPoint.accuracy ?? 0)} m); recording paused until GPS returns`
    };
  }

  if (!previousPoint) {
    return {
      accepted: true,
      speedMetersPerSecond: 0
    };
  }

  const distanceFromPrevious = haversineDistanceMeters(previousPoint, rawPoint);
  const rawTimestamp = new Date(rawPoint.timestamp).getTime();
  const previousTimestamp = new Date(previousPoint.timestamp).getTime();

  if (!Number.isFinite(rawTimestamp) || !Number.isFinite(previousTimestamp)) {
    return {
      accepted: false,
      countAsRejected: true,
      reason: "GPS point ignored: invalid timestamp"
    };
  }

  if (rawTimestamp <= previousTimestamp) {
    return {
      accepted: false,
      countAsRejected: rawTimestamp < previousTimestamp || distanceFromPrevious > 1,
      reason:
        rawTimestamp < previousTimestamp || distanceFromPrevious > 1
          ? "GPS point ignored: stale or duplicate timestamp"
          : null
    };
  }

  const secondsFromPrevious = (rawTimestamp - previousTimestamp) / 1000;

  if (distanceFromPrevious < modeConfig.minDistanceBetweenPointsMeters) {
    return {
      accepted: false,
      countAsRejected: false,
      reason: null
    };
  }

  if (secondsFromPrevious > 0) {
    const speedMetersPerSecond = distanceFromPrevious / secondsFromPrevious;

    if (speedMetersPerSecond > modeConfig.maxSpeedMetersPerSecond) {
      return {
        accepted: false,
        countAsRejected: true,
        reason: `Jump ignored: ${formatSpeed(speedMetersPerSecond)}`
      };
    }

    return {
      accepted: true,
      speedMetersPerSecond
    };
  }

  return {
    accepted: true,
    speedMetersPerSecond: 0
  };
}

function hasUsableAccuracy(point: GpsPoint, maxAcceptedAccuracyMeters: number) {
  if (point.accuracy === null) {
    return true;
  }

  return point.accuracy <= maxAcceptedAccuracyMeters;
}

function formatSpeed(metersPerSecond: number) {
  return `${Math.round(metersPerSecond * 3.6)} km/h`;
}
