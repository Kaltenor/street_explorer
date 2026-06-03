import { haversineDistanceMeters } from "./distance";
import { ActivityMode, GpsPoint } from "../types/walk";

const MODE_PATH_GAP_CONFIG: Record<
  ActivityMode,
  {
    maxConfirmedStraightLineMeters: number;
    maxDisplaySpeedMetersPerSecond: number;
    maxUninferredGapSeconds: number;
  }
> = {
  walk: {
    maxConfirmedStraightLineMeters: 1000,
    maxDisplaySpeedMetersPerSecond: 15,
    maxUninferredGapSeconds: 900
  },
  wheel: {
    maxConfirmedStraightLineMeters: 2500,
    maxDisplaySpeedMetersPerSecond: 40,
    maxUninferredGapSeconds: 600
  },
  car: {
    maxConfirmedStraightLineMeters: 6000,
    maxDisplaySpeedMetersPerSecond: 120,
    maxUninferredGapSeconds: 600
  }
};

export type ConfirmedPathSegment = {
  distanceMeters: number;
  endPoint: GpsPoint;
  points: GpsPoint[];
  startPoint: GpsPoint;
  type: "confirmed";
};

export type InferredPathSegment = {
  confidence: "low" | "medium" | "high";
  distanceMeters: number;
  endPoint: GpsPoint;
  points: GpsPoint[];
  source: "inferred";
  startPoint: GpsPoint;
  type: "inferred";
};

export type RejectedPathGap = {
  distanceMeters: number;
  endPoint: GpsPoint;
  reason: string;
  startPoint: GpsPoint;
  type: "rejected";
};

export type PathSegment = ConfirmedPathSegment | InferredPathSegment | RejectedPathGap;

export type InferredPathResult =
  | {
      reason: string;
      status: "not_configured";
    }
  | {
      segment: InferredPathSegment;
      status: "inferred";
    }
  | {
      reason: string;
      status: "rejected";
    };

export function buildPathSegments(points: GpsPoint[], activityMode: ActivityMode): PathSegment[] {
  const segments: PathSegment[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const startPoint = points[index - 1];
    const endPoint = points[index];

    if (!startPoint || !endPoint) {
      continue;
    }

    const distanceMeters = haversineDistanceMeters(startPoint, endPoint);
    const suspiciousReason = getSuspiciousGapReason(
      startPoint,
      endPoint,
      activityMode,
      distanceMeters
    );

    if (!suspiciousReason) {
      segments.push({
        distanceMeters,
        endPoint,
        points: [startPoint, endPoint],
        startPoint,
        type: "confirmed"
      });
      continue;
    }

    const inferredPath = inferPathBetweenPoints(startPoint, endPoint, activityMode);

    if (inferredPath.status === "inferred") {
      segments.push(inferredPath.segment);
      continue;
    }

    segments.push({
      distanceMeters,
      endPoint,
      reason: `${suspiciousReason}; inference ${inferredPath.status}`,
      startPoint,
      type: "rejected"
    });
  }

  return segments;
}

export function inferPathBetweenPoints(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  _activityMode: ActivityMode
): InferredPathResult {
  // Future OSM routing boundary:
  // 1. snap startPoint/endPoint to nearest valid OSM street segment
  // 2. run shortest-path routing through the local OSM street graph
  // 3. reject routes with impossible speed or extreme detours
  // 4. return lower-confidence inferred geometry with source = "inferred"
  //
  // Important: do not use a straight-line fallback here. If street routing is not
  // configured, suspicious gaps must stay rejected so we do not create fake
  // diagonal paths through buildings.
  void startPoint;
  void endPoint;

  return {
    reason: "street graph routing is not configured",
    status: "not_configured"
  };
}

function getSuspiciousGapReason(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  activityMode: ActivityMode,
  distanceMeters: number
) {
  const gapConfig = MODE_PATH_GAP_CONFIG[activityMode];
  const seconds = getSecondsBetweenPoints(startPoint, endPoint);

  if (seconds > 0) {
    const speedMetersPerSecond = distanceMeters / seconds;

    if (speedMetersPerSecond > gapConfig.maxDisplaySpeedMetersPerSecond) {
      return `impossible ${activityMode} speed`;
    }
  }

  if (
    distanceMeters > gapConfig.maxConfirmedStraightLineMeters &&
    seconds > gapConfig.maxUninferredGapSeconds
  ) {
    return `large GPS gap ${Math.round(distanceMeters)} m over ${Math.round(seconds)} s`;
  }

  return null;
}

function getSecondsBetweenPoints(startPoint: GpsPoint, endPoint: GpsPoint) {
  return Math.max(
    0,
    (new Date(endPoint.timestamp).getTime() - new Date(startPoint.timestamp).getTime()) / 1000
  );
}
