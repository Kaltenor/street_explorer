import { getStreetSegmentsNear, upsertStreetSegments } from "../database/streetRepository";
import { saveRouteSnapshot } from "../database/walkRepository";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint, RenderedRouteSegment } from "../types/walk";
import { haversineDistanceMeters } from "./distance";
import { fetchNearbyOsmStreetSegments } from "./osmStreetService";
import { buildPathSegments, buildPathSegmentsWithInference } from "./pathInference";

const ROUTE_SNAPSHOT_ALGORITHM_VERSION = 2;
const STREET_CORRIDOR_RADIUS_METERS = 450;
const STREET_SAMPLE_SPACING_METERS = 250;
const STREET_REFRESH_SAMPLE_SPACING_METERS = 600;
const STREET_REFRESH_PROBE_RADIUS_METERS = 175;
const STREET_REFRESH_FETCH_RADIUS_METERS = 700;
const STREET_REFRESH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

let streetRefreshDisabledUntil = 0;

export async function createConfirmedRouteSnapshotIfMissing(
  sessionId: number,
  activityMode: ActivityMode,
  points: GpsPoint[]
) {
  const routeSegments = buildPathSegments(
    points,
    activityMode
  ).flatMap<RenderedRouteSegment>((segment) =>
    segment.type === "confirmed"
      ? [{ points: segment.points, type: "confirmed" }]
      : []
  );

  await saveRouteSnapshot(
    sessionId,
    routeSegments,
    points.length,
    ROUTE_SNAPSHOT_ALGORITHM_VERSION
  );

  return routeSegments;
}

export async function createRouteSnapshotIfMissing(
  sessionId: number,
  activityMode: ActivityMode,
  points: GpsPoint[]
) {
  return persistStreetMatchedRouteSnapshot({
    activityMode,
    persist: true,
    points,
    refreshStreetCoverage: false,
    replaceExisting: false,
    sessionId,
    supplementalStreetSegments: []
  });
}

export async function rebuildRouteSnapshot(
  sessionId: number,
  activityMode: ActivityMode,
  points: GpsPoint[],
  supplementalStreetSegments: OsmStreetSegment[] = [],
  options: {
    persist?: boolean;
    refreshStreetCoverage?: boolean;
  } = {}
) {
  return persistStreetMatchedRouteSnapshot({
    activityMode,
    persist: options.persist ?? true,
    points,
    refreshStreetCoverage: options.refreshStreetCoverage ?? false,
    replaceExisting: true,
    sessionId,
    supplementalStreetSegments
  });
}

export async function replaceRouteSnapshot(
  sessionId: number,
  points: GpsPoint[],
  routeSegments: RenderedRouteSegment[]
) {
  await saveRouteSnapshot(
    sessionId,
    routeSegments,
    points.length,
    ROUTE_SNAPSHOT_ALGORITHM_VERSION,
    { replaceExisting: true }
  );
}

async function persistStreetMatchedRouteSnapshot(input: {
  activityMode: ActivityMode;
  persist: boolean;
  points: GpsPoint[];
  refreshStreetCoverage: boolean;
  replaceExisting: boolean;
  sessionId: number;
  supplementalStreetSegments: OsmStreetSegment[];
}) {
  if (input.replaceExisting && input.refreshStreetCoverage) {
    await refreshMissingStreetCoverage(input.points);
  }

  const cachedStreetSegments = await getCachedStreetCorridor(input.points);
  const streetSegmentsById = new Map<string, OsmStreetSegment>();

  for (const segment of [...cachedStreetSegments, ...input.supplementalStreetSegments]) {
    streetSegmentsById.set(segment.id, segment);
  }

  const routeSegments = buildPathSegmentsWithInference(
    input.points,
    input.activityMode,
    [...streetSegmentsById.values()]
  ).flatMap<RenderedRouteSegment>((segment) => {
    if (segment.type === "rejected" || segment.points.length < 2) {
      return [];
    }

    if (segment.type === "inferred" && !["high", "medium"].includes(segment.confidence)) {
      return [];
    }

    if (segment.type === "inferred") {
      return [{
        confidence: segment.confidence === "high" ? "high" : "medium",
        points: segment.points,
        type: "inferred"
      }];
    }

    return [{
      points: segment.points,
      type: "confirmed"
    }];
  });

  if (input.persist) {
    await saveRouteSnapshot(
      input.sessionId,
      routeSegments,
      input.points.length,
      ROUTE_SNAPSHOT_ALGORITHM_VERSION,
      { replaceExisting: input.replaceExisting }
    );
  }

  return routeSegments;
}

async function refreshMissingStreetCoverage(points: GpsPoint[]) {
  if (Date.now() < streetRefreshDisabledUntil) {
    return;
  }

  const centers = samplePathCenters(points, STREET_REFRESH_SAMPLE_SPACING_METERS);

  for (const center of centers) {
    const nearbySegments = await getStreetSegmentsNear(
      center.latitude,
      center.longitude,
      STREET_REFRESH_PROBE_RADIUS_METERS
    );

    if (nearbySegments.length > 0) {
      continue;
    }

    try {
      const fetchedSegments = await fetchNearbyOsmStreetSegments(
        center,
        STREET_REFRESH_FETCH_RADIUS_METERS
      );
      await upsertStreetSegments(fetchedSegments);
    } catch (error) {
      // A reprocess remains usable offline with whatever stable cache is available.
      // Stop retrying every historical route when Overpass or the network is down.
      streetRefreshDisabledUntil = Date.now() + STREET_REFRESH_FAILURE_COOLDOWN_MS;
      console.warn("Unable to refresh historical street coverage", error);
      return;
    }
  }
}

async function getCachedStreetCorridor(points: GpsPoint[]) {
  const centers = samplePathCenters(points);
  const segmentsById = new Map<string, OsmStreetSegment>();

  for (const center of centers) {
    const segments = await getStreetSegmentsNear(
      center.latitude,
      center.longitude,
      STREET_CORRIDOR_RADIUS_METERS
    );

    for (const segment of segments) {
      segmentsById.set(segment.id, segment);
    }
  }

  return [...segmentsById.values()];
}

function samplePathCenters(
  points: GpsPoint[],
  spacingMeters = STREET_SAMPLE_SPACING_METERS
) {
  const firstPoint = points[0];

  if (!firstPoint) {
    return [];
  }

  const centers = [firstPoint];
  let previousCenter = firstPoint;

  for (const point of points.slice(1)) {
    if (haversineDistanceMeters(previousCenter, point) < spacingMeters) {
      continue;
    }

    centers.push(point);
    previousCenter = point;
  }

  const lastPoint = points.at(-1);

  if (lastPoint && centers.at(-1) !== lastPoint) {
    centers.push(lastPoint);
  }

  return centers;
}
