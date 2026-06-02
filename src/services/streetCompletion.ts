import { MapCoordinate } from "./explorationArea";
import { haversineDistanceMeters } from "./distance";
import { OsmStreetSegment, StreetCompletionSummary } from "../types/street";
import { GpsPoint, WalkWithPoints } from "../types/walk";

const STREET_MATCH_THRESHOLD_METERS = 18;
const STREET_SAMPLE_STRIDE = 3;

export type StreetCompletionResult = {
  exploredStreetIds: Set<string>;
  summary: StreetCompletionSummary;
};

type ProjectedPoint = {
  x: number;
  y: number;
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
      summary: {
        exploredDistanceMeters: 0,
        exploredStreetCount: 0,
        loadedStreetCount: 0,
        status,
        totalDistanceMeters: 0
      }
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

  return {
    exploredStreetIds,
    summary: {
      exploredDistanceMeters,
      exploredStreetCount: exploredStreetIds.size,
      loadedStreetCount: streetSegments.length,
      status,
      totalDistanceMeters
    }
  };
}

export function matchGpsPointsToStreetSegments(
  points: GpsPoint[],
  streetSegments: OsmStreetSegment[]
) {
  const exploredStreetIds = new Set<string>();
  const sampledPoints =
    points.length < 50 ? points : points.filter((_, index) => index % STREET_SAMPLE_STRIDE === 0);

  for (const segment of streetSegments) {
    if (segment.coordinates.length < 2) {
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
    const distance = distanceToProjectedSegment(projectedPoint, projectedFrom, projectedTo);

    bestDistance = Math.min(bestDistance, distance);
  }

  return bestDistance;
}

function distanceToProjectedSegment(
  point: ProjectedPoint,
  from: ProjectedPoint,
  to: ProjectedPoint
) {
  const segmentX = to.x - from.x;
  const segmentY = to.y - from.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }

  const progress = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * segmentX + (point.y - from.y) * segmentY) / segmentLengthSquared)
  );
  const projected = {
    x: from.x + progress * segmentX,
    y: from.y + progress * segmentY
  };

  return Math.hypot(point.x - projected.x, point.y - projected.y);
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

function calculateCoordinatePathDistance(coordinates: MapCoordinate[]) {
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
