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

export type PointEvaluation =
  | {
      accepted: true;
      speedMetersPerSecond: number;
    }
  | {
      accepted: false;
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
      rejectedGpsPointCount: activeWalk.rejectedGpsPointCount + 1
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

export async function persistAcceptedGpsPoint(
  sessionId: number,
  activityMode: ActivityMode,
  rawPoint: Omit<GpsPoint, "pointIndex">
) {
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
}

export async function finishPersistedActiveWalk(
  activeWalk: ActiveWalk,
  endedAt: string,
  stepCount = activeWalk.stepCount
) {
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
      reason: `Weak GPS: ${Math.round(rawPoint.accuracy ?? 0)} m accuracy`
    };
  }

  if (!previousPoint) {
    return {
      accepted: true,
      speedMetersPerSecond: 0
    };
  }

  const distanceFromPrevious = haversineDistanceMeters(previousPoint, rawPoint);
  const secondsFromPrevious = Math.max(
    0,
    (new Date(rawPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime()) / 1000
  );

  if (distanceFromPrevious < modeConfig.minDistanceBetweenPointsMeters) {
    return {
      accepted: false,
      reason: null
    };
  }

  if (secondsFromPrevious > 0) {
    const speedMetersPerSecond = distanceFromPrevious / secondsFromPrevious;

    if (speedMetersPerSecond > modeConfig.maxSpeedMetersPerSecond) {
      return {
        accepted: false,
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
