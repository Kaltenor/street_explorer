import { MapCoordinate } from "./explorationArea";
import { haversineDistanceMeters } from "./distance";
import {
  OsmStreetSegment,
  StreetCompletionSummary,
  StreetSegmentCoverage
} from "../types/street";
import { GpsPoint, RenderedRouteSegment, WalkWithPoints } from "../types/walk";

const STREET_MATCH_THRESHOLD_METERS = 12;
const STREET_SAMPLE_STRIDE = 3;
export const STREET_COMPLETION_V2_BIN_METERS = 4;
const V2_ROUTE_SAMPLE_METERS = 3;
const V2_MIN_ROUTE_DIRECTION_METERS = 1.5;
const V2_DIRECTION_COSINE = Math.cos((50 * Math.PI) / 180);
const V2_SPATIAL_BUCKET_METERS = 20;

export type StreetCompletionResult = {
  exploredStreetIds: Set<string>;
  summary: StreetCompletionSummary;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

type IndexedStreetSegment = {
  segment: OsmStreetSegment;
  streetId: string;
  totalBinCount: number;
  totalDistanceMeters: number;
};

type IndexedStreetLine = {
  cumulativeStartMeters: number;
  from: ProjectedPoint;
  id: number;
  lengthMeters: number;
  segment: IndexedStreetSegment;
  to: ProjectedPoint;
  unitX: number;
  unitY: number;
};

export function calculateStreetCompletion(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  streetSegments: OsmStreetSegment[],
  status: StreetCompletionSummary["status"]
): StreetCompletionResult {
  if (streetSegments.length === 0) {
    return {
      exploredStreetIds: new Set(),
      summary: emptyStreetCompletionSummary(status)
    };
  }

  const gpsPoints = [...walks.flatMap((walk) => walk.points), ...activePoints];
  const exploredStreetIds = matchGpsPointsToStreetSegments(gpsPoints, streetSegments);
  const totalDistanceMeters = streetSegments.reduce(
    (distance, segment) => distance + calculateCoordinatePathDistance(segment.coordinates),
    0
  );
  const exploredDistanceMeters = streetSegments.reduce((distance, segment) => {
    if (!exploredStreetIds.has(segment.id)) {
      return distance;
    }

    return distance + calculateCoordinatePathDistance(segment.coordinates);
  }, 0);
  const exploredStreetCount = new Set(
    streetSegments
      .filter((segment) => exploredStreetIds.has(segment.id))
      .map((segment) => getOsmStreetId(segment.id))
  ).size;
  const loadedStreetCount = new Set(
    streetSegments.map((segment) => getOsmStreetId(segment.id))
  ).size;

  return {
    exploredStreetIds,
    summary: {
      completedStreetCount: exploredStreetCount,
      completionPercent:
        totalDistanceMeters > 0
          ? Math.round((exploredDistanceMeters / totalDistanceMeters) * 1000) / 10
          : 0,
      exploredDistanceMeters,
      exploredStreetCount,
      legacyMatchedStreetCount: exploredStreetCount,
      loadedStreetCount,
      processedRecordingCount: walks.length,
      status,
      totalDistanceMeters,
      updatedAt: null
    }
  };
}

export function emptyStreetCompletionSummary(
  status: StreetCompletionSummary["status"] = "empty"
): StreetCompletionSummary {
  return {
    completedStreetCount: 0,
    completionPercent: 0,
    exploredDistanceMeters: 0,
    exploredStreetCount: 0,
    legacyMatchedStreetCount: 0,
    loadedStreetCount: 0,
    processedRecordingCount: 0,
    status,
    totalDistanceMeters: 0,
    updatedAt: null
  };
}

// V1 proximity matching is retained only to capture migration evidence. V2 never
// uses this result for progress because one nearby sample credited a whole segment.
export function matchGpsPointsToStreetSegments(
  points: GpsPoint[],
  streetSegments: OsmStreetSegment[]
) {
  const exploredStreetIds = new Set<string>();
  const sampledPoints =
    points.length < 50 ? points : points.filter((_, index) => index % STREET_SAMPLE_STRIDE === 0);

  for (const segment of streetSegments) {
    if (segment.coordinates.length < 2 || !isWalkableStreetSegment(segment)) {
      continue;
    }

    for (const point of sampledPoints) {
      if (!isPointNearBounds(point, segment, STREET_MATCH_THRESHOLD_METERS)) {
        continue;
      }

      if (distanceToPolylineMeters(point, segment.coordinates) <= STREET_MATCH_THRESHOLD_METERS) {
        exploredStreetIds.add(segment.id);
        break;
      }
    }
  }

  return exploredStreetIds;
}

export type StreetCoverageMatcher = (
  routeSegments: RenderedRouteSegment[]
) => StreetSegmentCoverage[];

export function createStreetCoverageMatcher(
  streetSegments: OsmStreetSegment[]
): StreetCoverageMatcher {
  const usableSegments = streetSegments.filter(
    (segment) => segment.coordinates.length >= 2 && isWalkableStreetSegment(segment)
  );

  if (usableSegments.length === 0) {
    return () => [];
  }

  const referenceLatitude = usableSegments[0]?.coordinates[0]?.latitude ?? 0;
  const { buckets, indexedSegments, lines } = buildStreetSpatialIndex(
    usableSegments,
    referenceLatitude
  );

  return (routeSegments) => calculateStreetCoverageWithIndex(
    routeSegments,
    referenceLatitude,
    buckets,
    indexedSegments,
    lines
  );
}

export function calculateStreetCoverageForRouteSegments(
  routeSegments: RenderedRouteSegment[],
  streetSegments: OsmStreetSegment[]
): StreetSegmentCoverage[] {
  return createStreetCoverageMatcher(streetSegments)(routeSegments);
}

function calculateStreetCoverageWithIndex(
  routeSegments: RenderedRouteSegment[],
  referenceLatitude: number,
  buckets: Map<string, number[]>,
  indexedSegments: Map<string, IndexedStreetSegment>,
  lines: IndexedStreetLine[]
): StreetSegmentCoverage[] {
  if (routeSegments.length === 0) {
    return [];
  }

  const coveredBinsBySegmentId = new Map<string, Set<number>>();

  for (const routeSegment of routeSegments) {
    for (let pointIndex = 1; pointIndex < routeSegment.points.length; pointIndex += 1) {
      const fromPoint = routeSegment.points[pointIndex - 1];
      const toPoint = routeSegment.points[pointIndex];

      if (!fromPoint || !toPoint) {
        continue;
      }

      const from = coordinateToLocalMeters(fromPoint, referenceLatitude);
      const to = coordinateToLocalMeters(toPoint, referenceLatitude);
      const routeX = to.x - from.x;
      const routeY = to.y - from.y;
      const routeLength = Math.hypot(routeX, routeY);

      if (routeLength < V2_MIN_ROUTE_DIRECTION_METERS) {
        continue;
      }

      const routeUnitX = routeX / routeLength;
      const routeUnitY = routeY / routeLength;
      const sampleCount = Math.max(1, Math.ceil(routeLength / V2_ROUTE_SAMPLE_METERS));

      for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        const progress = sampleIndex / sampleCount;
        const sample = {
          x: from.x + routeX * progress,
          y: from.y + routeY * progress
        };
        const bucketKey = getSpatialBucketKey(sample);
        const candidateLineIds = buckets.get(bucketKey) ?? [];
        let best: { binIndex: number; distance: number; segmentId: string } | null = null;

        for (const lineId of candidateLineIds) {
          const line = lines[lineId];

          if (!line) {
            continue;
          }

          const directionCosine = Math.abs(routeUnitX * line.unitX + routeUnitY * line.unitY);

          if (directionCosine < V2_DIRECTION_COSINE) {
            continue;
          }

          const projection = projectPointToLine(sample, line.from, line.to);

          if (projection.distance > STREET_MATCH_THRESHOLD_METERS) {
            continue;
          }

          const distanceAlongSegment =
            line.cumulativeStartMeters + projection.progress * line.lengthMeters;
          const binIndex = Math.min(
            line.segment.totalBinCount - 1,
            Math.floor(
              (distanceAlongSegment / Math.max(0.001, line.segment.totalDistanceMeters)) *
                line.segment.totalBinCount
            )
          );

          if (!best || projection.distance < best.distance) {
            best = {
              binIndex,
              distance: projection.distance,
              segmentId: line.segment.segment.id
            };
          }
        }

        if (best) {
          const coveredBins = coveredBinsBySegmentId.get(best.segmentId) ?? new Set<number>();
          coveredBins.add(best.binIndex);
          coveredBinsBySegmentId.set(best.segmentId, coveredBins);
        }
      }
    }
  }

  return [...coveredBinsBySegmentId.entries()].flatMap(([segmentId, coveredBins]) => {
    const indexed = indexedSegments.get(segmentId);

    if (!indexed || coveredBins.size === 0) {
      return [];
    }

    const coveredBinIndexes = [...coveredBins].sort((left, right) => left - right);
    const walkedDistanceMeters = Math.min(
      indexed.totalDistanceMeters,
      (coveredBinIndexes.length / indexed.totalBinCount) * indexed.totalDistanceMeters
    );

    return [{
      coveredBinIndexes,
      segmentId,
      streetId: indexed.streetId,
      totalBinCount: indexed.totalBinCount,
      totalDistanceMeters: indexed.totalDistanceMeters,
      walkedDistanceMeters
    }];
  });
}
export function isWalkableStreetSegment(segment: OsmStreetSegment) {
  if (["motorway", "motorway_link", "trunk", "trunk_link"].includes(segment.highway)) {
    return false;
  }

  const access = segment.access?.toLowerCase() ?? null;
  const foot = segment.foot?.toLowerCase() ?? null;
  const explicitlyWalkable = ["designated", "permissive", "yes"].includes(foot ?? "");

  if (["no", "private"].includes(foot ?? "")) {
    return false;
  }

  return !(["no", "private"].includes(access ?? "") && !explicitlyWalkable);
}

export function addStreetCoverageToAggregate(
  aggregateBinsBySegmentId: Map<string, Set<number>>,
  coverage: StreetSegmentCoverage[]
) {
  for (const segmentCoverage of coverage) {
    const aggregateBins =
      aggregateBinsBySegmentId.get(segmentCoverage.segmentId) ?? new Set<number>();

    for (const binIndex of segmentCoverage.coveredBinIndexes) {
      aggregateBins.add(binIndex);
    }

    aggregateBinsBySegmentId.set(segmentCoverage.segmentId, aggregateBins);
  }
}

export function getOsmStreetId(segmentId: string) {
  const match = /^(way\/[^/]+)/.exec(segmentId);
  return match?.[1] ?? segmentId;
}

function buildStreetSpatialIndex(
  streetSegments: OsmStreetSegment[],
  referenceLatitude: number
) {
  const buckets = new Map<string, number[]>();
  const indexedSegments = new Map<string, IndexedStreetSegment>();
  const lines: IndexedStreetLine[] = [];

  for (const segment of streetSegments) {
    const totalDistanceMeters = calculateCoordinatePathDistance(segment.coordinates);

    if (totalDistanceMeters <= 0) {
      continue;
    }

    const indexedSegment: IndexedStreetSegment = {
      segment,
      streetId: getOsmStreetId(segment.id),
      totalBinCount: Math.max(1, Math.ceil(totalDistanceMeters / STREET_COMPLETION_V2_BIN_METERS)),
      totalDistanceMeters
    };
    indexedSegments.set(segment.id, indexedSegment);
    let cumulativeStartMeters = 0;

    for (let coordinateIndex = 1; coordinateIndex < segment.coordinates.length; coordinateIndex += 1) {
      const fromCoordinate = segment.coordinates[coordinateIndex - 1];
      const toCoordinate = segment.coordinates[coordinateIndex];

      if (!fromCoordinate || !toCoordinate) {
        continue;
      }

      const from = coordinateToLocalMeters(fromCoordinate, referenceLatitude);
      const to = coordinateToLocalMeters(toCoordinate, referenceLatitude);
      const lineX = to.x - from.x;
      const lineY = to.y - from.y;
      const lengthMeters = Math.hypot(lineX, lineY);

      if (lengthMeters <= 0) {
        continue;
      }

      const line: IndexedStreetLine = {
        cumulativeStartMeters,
        from,
        id: lines.length,
        lengthMeters,
        segment: indexedSegment,
        to,
        unitX: lineX / lengthMeters,
        unitY: lineY / lengthMeters
      };
      lines.push(line);
      addLineToSpatialBuckets(buckets, line);
      cumulativeStartMeters += lengthMeters;
    }
  }

  return { buckets, indexedSegments, lines };
}

function addLineToSpatialBuckets(
  buckets: Map<string, number[]>,
  line: IndexedStreetLine
) {
  const minimumX = Math.floor(
    (Math.min(line.from.x, line.to.x) - STREET_MATCH_THRESHOLD_METERS) /
      V2_SPATIAL_BUCKET_METERS
  );
  const maximumX = Math.floor(
    (Math.max(line.from.x, line.to.x) + STREET_MATCH_THRESHOLD_METERS) /
      V2_SPATIAL_BUCKET_METERS
  );
  const minimumY = Math.floor(
    (Math.min(line.from.y, line.to.y) - STREET_MATCH_THRESHOLD_METERS) /
      V2_SPATIAL_BUCKET_METERS
  );
  const maximumY = Math.floor(
    (Math.max(line.from.y, line.to.y) + STREET_MATCH_THRESHOLD_METERS) /
      V2_SPATIAL_BUCKET_METERS
  );

  for (let x = minimumX; x <= maximumX; x += 1) {
    for (let y = minimumY; y <= maximumY; y += 1) {
      const key = `${x}:${y}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(line.id);
      buckets.set(key, bucket);
    }
  }
}

function getSpatialBucketKey(point: ProjectedPoint) {
  return `${Math.floor(point.x / V2_SPATIAL_BUCKET_METERS)}:${Math.floor(
    point.y / V2_SPATIAL_BUCKET_METERS
  )}`;
}

function projectPointToLine(point: ProjectedPoint, from: ProjectedPoint, to: ProjectedPoint) {
  const segmentX = to.x - from.x;
  const segmentY = to.y - from.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const progress = segmentLengthSquared === 0
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          ((point.x - from.x) * segmentX + (point.y - from.y) * segmentY) /
            segmentLengthSquared
        )
      );
  const projectedX = from.x + progress * segmentX;
  const projectedY = from.y + progress * segmentY;

  return {
    distance: Math.hypot(point.x - projectedX, point.y - projectedY),
    progress
  };
}

function distanceToPolylineMeters(point: GpsPoint, coordinates: MapCoordinate[]) {
  const projectedPoint = coordinateToLocalMeters(point, point.latitude);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];

    if (!from || !to) {
      continue;
    }

    const projectedFrom = coordinateToLocalMeters(from, point.latitude);
    const projectedTo = coordinateToLocalMeters(to, point.latitude);
    const distance = projectPointToLine(projectedPoint, projectedFrom, projectedTo).distance;
    bestDistance = Math.min(bestDistance, distance);
  }

  return bestDistance;
}

function coordinateToLocalMeters(
  coordinate: Pick<MapCoordinate, "latitude" | "longitude">,
  referenceLatitude: number
): ProjectedPoint {
  const latitudeRadians = (referenceLatitude * Math.PI) / 180;

  return {
    x: coordinate.longitude * 111_320 * Math.cos(latitudeRadians),
    y: coordinate.latitude * 111_320
  };
}

function isPointNearBounds(point: GpsPoint, segment: OsmStreetSegment, thresholdMeters: number) {
  const latitudeDelta = thresholdMeters / 111_320;
  const longitudeDelta =
    thresholdMeters / Math.max(1, 111_320 * Math.cos((point.latitude * Math.PI) / 180));

  return (
    point.latitude >= segment.minLatitude - latitudeDelta &&
    point.latitude <= segment.maxLatitude + latitudeDelta &&
    point.longitude >= segment.minLongitude - longitudeDelta &&
    point.longitude <= segment.maxLongitude + longitudeDelta
  );
}

export function calculateCoordinatePathDistance(coordinates: MapCoordinate[]) {
  return coordinates.reduce((distance, coordinate, index) => {
    const previous = coordinates[index - 1];

    if (!previous) {
      return distance;
    }

    return distance + haversineDistanceMeters(toGpsPoint(previous), toGpsPoint(coordinate));
  }, 0);
}

function toGpsPoint(coordinate: MapCoordinate): GpsPoint {
  return {
    accuracy: null,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    pointIndex: 0,
    timestamp: ""
  };
}
