import { ActivityMode, GpsPoint, LiveRouteChunk } from "../types/walk";
import { buildPathSegments } from "./pathInference";
import { simplifyGpsPointsForRender } from "./routeSimplification";

export const LIVE_ROUTE_MAX_RAW_VERTICES = 256;
export const LIVE_ROUTE_SIMPLIFICATION_TOLERANCE_METERS = 1;

export function isConfirmedLiveRouteStep(
  previousPoint: GpsPoint,
  point: GpsPoint,
  activityMode: ActivityMode
) {
  const segment = buildPathSegments([previousPoint, point], activityMode)[0];
  return segment?.type === "confirmed";
}

export function buildLiveRouteChunks(
  points: readonly GpsPoint[],
  activityMode: ActivityMode
): LiveRouteChunk[] {
  let chunks: LiveRouteChunk[] = [];
  let previousPoint: GpsPoint | null = null;

  for (const point of points) {
    chunks = appendPointToLiveRoute(chunks, previousPoint, point, activityMode);
    previousPoint = point;
  }

  return chunks;
}

export function appendPointToLiveRoute(
  chunks: readonly LiveRouteChunk[],
  previousPoint: GpsPoint | null,
  point: GpsPoint,
  activityMode: ActivityMode
): LiveRouteChunk[] {
  if (!previousPoint) {
    return [...chunks, createOpenChunk([point])];
  }

  if (!isConfirmedLiveRouteStep(previousPoint, point, activityMode)) {
    return [...freezeOpenTail(chunks), createOpenChunk([point])];
  }

  const tail = chunks.at(-1);

  if (!tail || tail.isFrozen) {
    return [...chunks, createOpenChunk([previousPoint, point])];
  }

  if (!areSameRoutePoint(tail.points.at(-1), previousPoint)) {
    return [
      ...freezeOpenTail(chunks),
      createOpenChunk([previousPoint, point])
    ];
  }

  const extendedTail: LiveRouteChunk = {
    ...tail,
    points: [...tail.points, point],
    rawPointCount: tail.rawPointCount + 1
  };
  const nextTail =
    extendedTail.rawPointCount >= LIVE_ROUTE_MAX_RAW_VERTICES
      ? freezeChunk(extendedTail)
      : extendedTail;

  return [...chunks.slice(0, -1), nextTail];
}

function freezeOpenTail(chunks: readonly LiveRouteChunk[]) {
  const tail = chunks.at(-1);

  if (!tail || tail.isFrozen) {
    return [...chunks];
  }

  const prefix = chunks.slice(0, -1);
  return tail.rawPointCount >= 2 ? [...prefix, freezeChunk(tail)] : prefix;
}

function createOpenChunk(points: GpsPoint[]): LiveRouteChunk {
  const firstPoint = points[0];

  return {
    id: firstPoint
      ? `confirmed-${firstPoint.pointIndex}-${firstPoint.timestamp}`
      : "confirmed-empty",
    isFrozen: false,
    points,
    rawPointCount: points.length,
    type: "confirmed"
  };
}

function freezeChunk(chunk: LiveRouteChunk): LiveRouteChunk {
  if (chunk.isFrozen) {
    return chunk;
  }

  return {
    ...chunk,
    isFrozen: true,
    points: simplifyGpsPointsForRender(
      chunk.points,
      LIVE_ROUTE_SIMPLIFICATION_TOLERANCE_METERS
    )
  };
}

function areSameRoutePoint(left: GpsPoint | undefined, right: GpsPoint) {
  return (
    left?.pointIndex === right.pointIndex &&
    left.timestamp === right.timestamp &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude
  );
}
