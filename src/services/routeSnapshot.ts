import { getStreetSegmentsNear, upsertStreetSegments } from "../database/streetRepository";
import { getRouteSnapshot, saveRouteSnapshot } from "../database/walkRepository";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint, RenderedRouteSegment } from "../types/walk";
import { haversineDistanceMeters } from "./distance";
import {
  fetchNearbyOsmStreetSegments,
  fetchOsmStreetSegmentsForCorridors
} from "./osmStreetService";
import { collectExploredCellIdsForPath } from "./explorationArea";
import { buildPathSegments, buildPathSegmentsWithInference } from "./pathInference";

const ROUTE_SNAPSHOT_ALGORITHM_VERSION = 4;
const GAP_TOPOLOGY_FETCH_RADIUS_METERS = 120;
const GAP_TOPOLOGY_PROBE_RADIUS_METERS = 70;
const GAP_TOPOLOGY_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;
const STREET_CORRIDOR_RADIUS_METERS = 450;
const STREET_SAMPLE_SPACING_METERS = 250;
const STREET_REFRESH_SAMPLE_SPACING_METERS = 600;
const STREET_REFRESH_PROBE_RADIUS_METERS = 175;
const STREET_REFRESH_FETCH_RADIUS_METERS = 700;
const STREET_REFRESH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const STREET_REPAIR_CORRIDOR_RADIUS_METERS = 250;
const STREET_REPAIR_SAMPLE_SPACING_METERS = 175;

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

  const storedRouteSegments = await saveRouteSnapshot(
    sessionId,
    routeSegments,
    points.length,
    ROUTE_SNAPSHOT_ALGORITHM_VERSION,
    {
      expectedSourceMaxPointId: getExpectedSourceMaxPointId(points)
    }
  );

  if (!storedRouteSegments) {
    throw new Error("Route snapshot session no longer exists.");
  }

  return storedRouteSegments;
}

export async function createRouteSnapshotIfMissing(
  sessionId: number,
  activityMode: ActivityMode,
  points: GpsPoint[]
) {
  const existingRouteSegments = await getRouteSnapshot(sessionId);

  if (existingRouteSegments) {
    return existingRouteSegments;
  }

  const hasSuspiciousGap = buildPathSegments(points, activityMode).some(
    (segment) => segment.type === "rejected"
  );

  if (!hasSuspiciousGap) {
    return createConfirmedRouteSnapshotIfMissing(
      sessionId,
      activityMode,
      points
    );
  }

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

export type StreetCoverageRepairResult = {
  corridorCount: number;
  error: string | null;
  segmentCount: number;
  status: "failed" | "not_needed" | "refreshed";
};

export async function repairStreetCoverageForRecordings(
  recordings: Array<{ points: GpsPoint[] }>
): Promise<StreetCoverageRepairResult> {
  const corridors = recordings
    .map((recording) => samplePathCenters(
      recording.points,
      STREET_REPAIR_SAMPLE_SPACING_METERS
    ))
    .filter((corridor) => corridor.length > 0);

  if (corridors.length === 0) {
    return {
      corridorCount: 0,
      error: null,
      segmentCount: 0,
      status: "not_needed"
    };
  }

  try {
    const segments = await fetchOsmStreetSegmentsForCorridors(
      corridors,
      STREET_REPAIR_CORRIDOR_RADIUS_METERS
    );
    await upsertStreetSegments(segments);

    return {
      corridorCount: corridors.length,
      error: null,
      segmentCount: segments.length,
      status: "refreshed"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown street coverage error";
    console.warn("Unable to repair historical street coverage; continuing from cache", error);

    return {
      corridorCount: corridors.length,
      error: message,
      segmentCount: 0,
      status: "failed"
    };
  }
}
export async function replaceRouteSnapshot(
  sessionId: number,
  points: GpsPoint[],
  routeSegments: RenderedRouteSegment[]
) {
  const storedRouteSegments = await saveRouteSnapshot(
    sessionId,
    routeSegments,
    points.length,
    ROUTE_SNAPSHOT_ALGORITHM_VERSION,
    {
      expectedSourceMaxPointId: getExpectedSourceMaxPointId(points),
      replaceExisting: true
    }
  );

  if (!storedRouteSegments) {
    throw new Error("Route snapshot session no longer exists.");
  }
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

  if (!input.replaceExisting) {
    await refreshSuspiciousGapTopology(input.points, input.activityMode);
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
        bridgeEvidence: {
          ...segment.bridgeEvidence,
          inferredCellCount: collectExploredCellIdsForPath(
            segment.points,
            input.activityMode
          ).length
        },
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
    const storedRouteSegments = await saveRouteSnapshot(
      input.sessionId,
      routeSegments,
      input.points.length,
      ROUTE_SNAPSHOT_ALGORITHM_VERSION,
      {
        expectedSourceMaxPointId: getExpectedSourceMaxPointId(input.points),
        replaceExisting: input.replaceExisting
      }
    );

    if (!storedRouteSegments) {
      throw new Error("Route snapshot session no longer exists.");
    }

    return storedRouteSegments;
  }

  return routeSegments;
}

async function refreshSuspiciousGapTopology(
  points: GpsPoint[],
  activityMode: ActivityMode
) {
  if (Date.now() < streetRefreshDisabledUntil) {
    return;
  }

  const suspiciousGaps = buildPathSegments(points, activityMode).filter(
    (segment) => segment.type === "rejected"
  );
  const corridors: GpsPoint[][] = [];
  const freshnessCutoff = Date.now() - GAP_TOPOLOGY_FRESHNESS_MS;

  for (const gap of suspiciousGaps) {
    const midpoint: GpsPoint = {
      accuracy: null,
      latitude: (gap.startPoint.latitude + gap.endPoint.latitude) / 2,
      longitude: (gap.startPoint.longitude + gap.endPoint.longitude) / 2,
      pointIndex: gap.startPoint.pointIndex,
      timestamp: gap.startPoint.timestamp
    };
    const nearbySegments = await getStreetSegmentsNear(
      midpoint.latitude,
      midpoint.longitude,
      GAP_TOPOLOGY_PROBE_RADIUS_METERS
    );
    const hasFreshTopology = nearbySegments.some(
      (segment) => Date.parse(segment.fetchedAt) >= freshnessCutoff
    );

    if (!hasFreshTopology) {
      corridors.push([gap.startPoint, midpoint, gap.endPoint]);
    }
  }

  if (corridors.length === 0) {
    return;
  }

  try {
    const fetchedSegments = await fetchOsmStreetSegmentsForCorridors(
      corridors,
      GAP_TOPOLOGY_FETCH_RADIUS_METERS
    );
    await upsertStreetSegments(fetchedSegments);
  } catch (error) {
    // Snapshot creation remains usable offline with cached coverage. The cooldown
    // prevents every finalization from immediately retrying a failed Overpass call.
    streetRefreshDisabledUntil = Date.now() + STREET_REFRESH_FAILURE_COOLDOWN_MS;
    console.warn("Unable to refresh suspicious-gap street topology", error);
  }
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

function getExpectedSourceMaxPointId(points: GpsPoint[]) {
  let maxPointId = 0;

  for (const point of points) {
    if (
      typeof point.id !== "number" ||
      !Number.isInteger(point.id) ||
      point.id <= 0
    ) {
      return null;
    }

    maxPointId = Math.max(maxPointId, point.id);
  }

  return maxPointId;
}
