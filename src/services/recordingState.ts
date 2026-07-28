import { MODE_LOCATION_CONFIG } from "../constants/config";
import { ActiveWalk, ActivityMode, GpsPoint } from "../types/walk";
import { haversineDistanceMeters } from "./distance";
import { collectExploredCellIdsForPath } from "./explorationArea";
import {
  appendPointToLiveRoute,
  isConfirmedLiveRouteStep
} from "./liveRoute";

export const ACTIVE_RAW_POINT_LIMIT = 300;

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

export type AppendGpsPointResult = {
  acceptedPoint: GpsPoint | null;
  walk: ActiveWalk;
};

export function createActiveWalk(
  activityMode: ActivityMode,
  sessionId: number,
  startedAt = new Date().toISOString()
): ActiveWalk {
  return {
    activityMode,
    exploredCellIds: [],
    sessionId,
    startedAt,
    acceptedGpsPointCount: 0,
    points: [],
    gpsPausedEventCount: 0,
    rejectedGpsPointCount: 0,
    distanceMeters: 0,
    currentSpeedMetersPerSecond: 0,
    lastRejectedPointReason: null,
    routeChunks: [],
    stepCount: 0
  };
}
export function collectConfirmedLiveExploredCellIds(
  points: readonly GpsPoint[],
  activityMode: ActivityMode
) {
  const exploredCellIds = new Set<string>();

  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const previousPoint = points[pointIndex - 1];
    const point = points[pointIndex];

    if (
      !previousPoint ||
      !point ||
      !isConfirmedLiveRouteStep(previousPoint, point, activityMode)
    ) {
      continue;
    }

    for (const cellId of collectExploredCellIdsForPath(
      [previousPoint, point],
      activityMode
    )) {
      exploredCellIds.add(cellId);
    }
  }

  return [...exploredCellIds];
}

export function appendGpsPoint(
  activeWalk: ActiveWalk,
  rawPoint: GpsPoint
): AppendGpsPointResult {
  const previousPoint = activeWalk.points.at(-1);
  const evaluation = evaluateGpsPoint(
    activeWalk.activityMode,
    previousPoint ?? null,
    rawPoint
  );

  if (!evaluation.accepted) {
    return {
      acceptedPoint: null,
      walk: applyRejectedGpsEvaluation(activeWalk, evaluation)
    };
  }

  const acceptedPoint: GpsPoint = {
    ...rawPoint,
    pointIndex: activeWalk.acceptedGpsPointCount
  };

  return {
    acceptedPoint,
    walk: appendAcceptedGpsPoint(
      activeWalk,
      acceptedPoint,
      evaluation.speedMetersPerSecond
    )
  };
}

export function appendPersistedGpsPoint(
  activeWalk: ActiveWalk,
  point: GpsPoint
): ActiveWalk {
  const previousPoint = activeWalk.points.at(-1);

  if (
    activeWalk.points.some((existingPoint) => existingPoint.timestamp === point.timestamp) ||
    point.pointIndex !==
      (previousPoint ? previousPoint.pointIndex + 1 : 0)
  ) {
    return activeWalk;
  }

  const evaluation = evaluateGpsPoint(
    activeWalk.activityMode,
    previousPoint ?? null,
    point
  );

  return appendAcceptedGpsPoint(
    activeWalk,
    point,
    evaluation.accepted ? evaluation.speedMetersPerSecond : 0
  );
}

export function applyRejectedGpsEvaluation(
  activeWalk: ActiveWalk,
  evaluation: Extract<PointEvaluation, { accepted: false }>
): ActiveWalk {
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

function appendAcceptedGpsPoint(
  activeWalk: ActiveWalk,
  acceptedPoint: GpsPoint,
  speedMetersPerSecond: number
): ActiveWalk {
  const previousPoint = activeWalk.points.at(-1);
  const points = [...activeWalk.points, acceptedPoint].slice(-ACTIVE_RAW_POINT_LIMIT);
  const segmentCellIds =
    previousPoint &&
    isConfirmedLiveRouteStep(
      previousPoint,
      acceptedPoint,
      activeWalk.activityMode
    )
      ? collectExploredCellIdsForPath(
          [previousPoint, acceptedPoint],
          activeWalk.activityMode
        )
      : [];
  const existingExploredCellIds = new Set(activeWalk.exploredCellIds);
  const newSegmentCellIds = segmentCellIds.filter(
    (cellId) => !existingExploredCellIds.has(cellId)
  );
  const exploredCellIds =
    newSegmentCellIds.length > 0
      ? [...activeWalk.exploredCellIds, ...newSegmentCellIds]
      : activeWalk.exploredCellIds;
  const distanceMeters = previousPoint
    ? activeWalk.distanceMeters +
      haversineDistanceMeters(previousPoint, acceptedPoint)
    : activeWalk.distanceMeters;

  return {
    ...activeWalk,
    acceptedGpsPointCount: Math.max(
      activeWalk.acceptedGpsPointCount,
      acceptedPoint.pointIndex + 1
    ),
    points,
    distanceMeters,
    exploredCellIds,
    currentSpeedMetersPerSecond: speedMetersPerSecond,
    lastRejectedPointReason: null,
    routeChunks: appendPointToLiveRoute(
      activeWalk.routeChunks,
      previousPoint ?? null,
      acceptedPoint,
      activeWalk.activityMode
    )
  };
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
      reason: `GPS signal weak (${Math.round(
        rawPoint.accuracy ?? 0
      )} m); recording paused until GPS returns`
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
      countAsRejected:
        rawTimestamp < previousTimestamp || distanceFromPrevious > 1,
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

function hasUsableAccuracy(
  point: GpsPoint,
  maxAcceptedAccuracyMeters: number
) {
  if (point.accuracy === null) {
    return true;
  }

  return point.accuracy <= maxAcceptedAccuracyMeters;
}

function formatSpeed(metersPerSecond: number) {
  return `${Math.round(metersPerSecond * 3.6)} km/h`;
}
