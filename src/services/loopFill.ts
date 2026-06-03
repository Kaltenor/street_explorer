import {
  MapCoordinate,
  coordinateToExplorationCellKey,
  explorationCellKeyToCenterCoordinate
} from "./explorationArea";
import { haversineDistanceMeters } from "./distance";
import { buildPathSegments } from "./pathInference";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint } from "../types/walk";

export const LOOP_FILL_CONFIG = {
  closeDistanceMeters: 25,
  maxPolygonAreaSquareMeters: 1_000_000,
  maxUnwalkedStreetLengthMeters: 50,
  maxUnwalkedStreetRatio: 0.1,
  minLoopDistanceMeters: 150,
  minLoopElapsedSeconds: 60,
  minPolygonAreaSquareMeters: 2_000
};

type ProjectedPoint = {
  x: number;
  y: number;
};

export type LoopFillResult = {
  accepted: boolean;
  areaM2: number;
  cellIds: string[];
  polygon: MapCoordinate[];
  rejectionReason: string | null;
  totalWalkableStreetLengthM: number;
  unwalkedWalkableStreetLengthM: number;
};

const WALKABLE_HIGHWAYS = new Set([
  "footway",
  "living_street",
  "path",
  "pedestrian",
  "residential",
  "service",
  "steps"
]);

export function analyzeLoopFill(input: {
  activityMode: ActivityMode;
  exploredStreetIds: Set<string>;
  points: GpsPoint[];
  streetSegments: OsmStreetSegment[];
}): LoopFillResult | null {
  const confirmedPoints = flattenTrustedPathPoints(input.points, input.activityMode);

  if (confirmedPoints.length < 4) {
    return null;
  }

  const candidate = findLoopCandidate(confirmedPoints);

  if (!candidate) {
    return null;
  }

  const polygon = candidate.points.map(toCoordinate);
  const referenceLatitude = averageLatitude(polygon);
  const projectedPolygon = polygon.map((point) => coordinateToLocalMeters(point, referenceLatitude));
  const areaM2 = calculatePolygonAreaSquareMeters(projectedPolygon);

  if (areaM2 < LOOP_FILL_CONFIG.minPolygonAreaSquareMeters) {
    return rejectedLoop(polygon, areaM2, "loop_area_too_small");
  }

  if (areaM2 > LOOP_FILL_CONFIG.maxPolygonAreaSquareMeters) {
    return rejectedLoop(polygon, areaM2, "loop_area_too_large");
  }

  if (hasSelfIntersection(projectedPolygon)) {
    return rejectedLoop(polygon, areaM2, "loop_self_intersects");
  }

  const streetAnalysis = calculateStreetLengthInsidePolygon({
    activityMode: input.activityMode,
    exploredStreetIds: input.exploredStreetIds,
    polygon: projectedPolygon,
    referenceLatitude,
    streetSegments: input.streetSegments
  });
  const unwalkedRatio =
    streetAnalysis.totalWalkableStreetLengthM === 0
      ? 0
      : streetAnalysis.unwalkedWalkableStreetLengthM /
        streetAnalysis.totalWalkableStreetLengthM;
  const accepted =
    streetAnalysis.unwalkedWalkableStreetLengthM <=
      LOOP_FILL_CONFIG.maxUnwalkedStreetLengthMeters ||
    unwalkedRatio <= LOOP_FILL_CONFIG.maxUnwalkedStreetRatio;

  return {
    accepted,
    areaM2,
    cellIds: accepted ? collectCellsInsidePolygon(polygon, projectedPolygon, referenceLatitude) : [],
    polygon,
    rejectionReason: accepted ? null : "too_many_unwalked_streets_inside_loop",
    totalWalkableStreetLengthM: streetAnalysis.totalWalkableStreetLengthM,
    unwalkedWalkableStreetLengthM: streetAnalysis.unwalkedWalkableStreetLengthM
  };
}

function flattenTrustedPathPoints(points: GpsPoint[], activityMode: ActivityMode) {
  const trustedPoints: GpsPoint[] = [];

  for (const segment of buildPathSegments(points, activityMode)) {
    if (segment.type === "rejected") {
      continue;
    }

    for (const point of segment.points) {
      const previous = trustedPoints.at(-1);

      if (!previous || previous.timestamp !== point.timestamp) {
        trustedPoints.push(point);
      }
    }
  }

  return trustedPoints;
}

function findLoopCandidate(points: GpsPoint[]) {
  for (let currentIndex = points.length - 1; currentIndex >= 3; currentIndex -= 1) {
    const currentPoint = points[currentIndex];

    if (!currentPoint) {
      continue;
    }

    for (let earlierIndex = 0; earlierIndex < currentIndex - 2; earlierIndex += 1) {
      const earlierPoint = points[earlierIndex];

      if (!earlierPoint) {
        continue;
      }

      if (
        haversineDistanceMeters(earlierPoint, currentPoint) >
        LOOP_FILL_CONFIG.closeDistanceMeters
      ) {
        continue;
      }

      const loopPoints = points.slice(earlierIndex, currentIndex + 1);
      const distanceMeters = calculateGpsPathDistance(loopPoints);
      const elapsedSeconds = calculateElapsedSeconds(loopPoints);

      if (
        distanceMeters >= LOOP_FILL_CONFIG.minLoopDistanceMeters &&
        elapsedSeconds >= LOOP_FILL_CONFIG.minLoopElapsedSeconds
      ) {
        return {
          distanceMeters,
          elapsedSeconds,
          points: loopPoints
        };
      }
    }
  }

  return null;
}

function calculateStreetLengthInsidePolygon(input: {
  activityMode: ActivityMode;
  exploredStreetIds: Set<string>;
  polygon: ProjectedPoint[];
  referenceLatitude: number;
  streetSegments: OsmStreetSegment[];
}) {
  let totalWalkableStreetLengthM = 0;
  let unwalkedWalkableStreetLengthM = 0;

  for (const segment of input.streetSegments) {
    if (!isWalkableForMode(segment, input.activityMode)) {
      continue;
    }

    const midpoint = getPolylineMidpoint(segment.coordinates);

    if (!midpoint) {
      continue;
    }

    const projectedMidpoint = coordinateToLocalMeters(midpoint, input.referenceLatitude);

    if (!pointInPolygon(projectedMidpoint, input.polygon)) {
      continue;
    }

    const length = calculateCoordinatePathDistance(segment.coordinates);
    totalWalkableStreetLengthM += length;

    if (!input.exploredStreetIds.has(segment.id)) {
      unwalkedWalkableStreetLengthM += length;
    }
  }

  return {
    totalWalkableStreetLengthM,
    unwalkedWalkableStreetLengthM
  };
}

function collectCellsInsidePolygon(
  polygon: MapCoordinate[],
  projectedPolygon: ProjectedPoint[],
  referenceLatitude: number
) {
  const bounds = getCoordinateBounds(polygon);
  const cornerKeys = [
    coordinateToExplorationCellKey({ latitude: bounds.minLatitude, longitude: bounds.minLongitude }),
    coordinateToExplorationCellKey({ latitude: bounds.minLatitude, longitude: bounds.maxLongitude }),
    coordinateToExplorationCellKey({ latitude: bounds.maxLatitude, longitude: bounds.minLongitude }),
    coordinateToExplorationCellKey({ latitude: bounds.maxLatitude, longitude: bounds.maxLongitude })
  ].map(parseCellKey);
  const minX = Math.min(...cornerKeys.map((key) => key.x));
  const maxX = Math.max(...cornerKeys.map((key) => key.x));
  const minY = Math.min(...cornerKeys.map((key) => key.y));
  const maxY = Math.max(...cornerKeys.map((key) => key.y));
  const cellIds: string[] = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const cellId = `${x}:${y}`;
      const center = explorationCellKeyToCenterCoordinate(cellId);
      const projectedCenter = coordinateToLocalMeters(center, referenceLatitude);

      if (pointInPolygon(projectedCenter, projectedPolygon)) {
        cellIds.push(cellId);
      }
    }
  }

  return cellIds;
}

function rejectedLoop(
  polygon: MapCoordinate[],
  areaM2: number,
  rejectionReason: string
): LoopFillResult {
  return {
    accepted: false,
    areaM2,
    cellIds: [],
    polygon,
    rejectionReason,
    totalWalkableStreetLengthM: 0,
    unwalkedWalkableStreetLengthM: 0
  };
}

function isWalkableForMode(segment: OsmStreetSegment, activityMode: ActivityMode) {
  if (activityMode === "car") {
    return !["footway", "path", "pedestrian", "steps"].includes(segment.highway);
  }

  if (activityMode === "wheel") {
    return !["steps"].includes(segment.highway) && WALKABLE_HIGHWAYS.has(segment.highway);
  }

  return WALKABLE_HIGHWAYS.has(segment.highway);
}

function calculatePolygonAreaSquareMeters(points: ProjectedPoint[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];

    if (current && next) {
      area += current.x * next.y - next.x * current.y;
    }
  }

  return Math.abs(area) / 2;
}

function hasSelfIntersection(points: ProjectedPoint[]) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstA = points[firstIndex];
    const firstB = points[(firstIndex + 1) % points.length];

    if (!firstA || !firstB) {
      continue;
    }

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      if (Math.abs(firstIndex - secondIndex) <= 1) {
        continue;
      }

      if (firstIndex === 0 && secondIndex === points.length - 1) {
        continue;
      }

      const secondA = points[secondIndex];
      const secondB = points[(secondIndex + 1) % points.length];

      if (secondA && secondB && segmentsIntersect(firstA, firstB, secondA, secondB)) {
        return true;
      }
    }
  }

  return false;
}

function segmentsIntersect(
  a: ProjectedPoint,
  b: ProjectedPoint,
  c: ProjectedPoint,
  d: ProjectedPoint
) {
  const directionA = orientation(a, b, c);
  const directionB = orientation(a, b, d);
  const directionC = orientation(c, d, a);
  const directionD = orientation(c, d, b);

  return directionA * directionB < 0 && directionC * directionD < 0;
}

function orientation(a: ProjectedPoint, b: ProjectedPoint, c: ProjectedPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInPolygon(point: ProjectedPoint, polygon: ProjectedPoint[]) {
  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (!current || !previous) {
      continue;
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function calculateGpsPathDistance(points: GpsPoint[]) {
  return points.reduce((distance, point, index) => {
    const previous = points[index - 1];

    return previous ? distance + haversineDistanceMeters(previous, point) : distance;
  }, 0);
}

function calculateCoordinatePathDistance(points: MapCoordinate[]) {
  return points.reduce((distance, point, index) => {
    const previous = points[index - 1];

    return previous
      ? distance + haversineDistanceMeters(toGpsPoint(previous), toGpsPoint(point))
      : distance;
  }, 0);
}

function calculateElapsedSeconds(points: GpsPoint[]) {
  const first = points[0];
  const last = points.at(-1);

  if (!first || !last) {
    return 0;
  }

  return Math.max(
    0,
    (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000
  );
}

function getPolylineMidpoint(points: MapCoordinate[]) {
  return points[Math.floor(points.length / 2)] ?? null;
}

function getCoordinateBounds(points: MapCoordinate[]) {
  return points.reduce(
    (bounds, point) => ({
      maxLatitude: Math.max(bounds.maxLatitude, point.latitude),
      maxLongitude: Math.max(bounds.maxLongitude, point.longitude),
      minLatitude: Math.min(bounds.minLatitude, point.latitude),
      minLongitude: Math.min(bounds.minLongitude, point.longitude)
    }),
    {
      maxLatitude: Number.NEGATIVE_INFINITY,
      maxLongitude: Number.NEGATIVE_INFINITY,
      minLatitude: Number.POSITIVE_INFINITY,
      minLongitude: Number.POSITIVE_INFINITY
    }
  );
}

function coordinateToLocalMeters(
  coordinate: Pick<MapCoordinate, "latitude" | "longitude">,
  referenceLatitude: number
) {
  const latitudeRadians = (referenceLatitude * Math.PI) / 180;

  return {
    x: coordinate.longitude * 111_320 * Math.cos(latitudeRadians),
    y: coordinate.latitude * 111_320
  };
}

function averageLatitude(points: MapCoordinate[]) {
  return points.reduce((total, point) => total + point.latitude, 0) / Math.max(1, points.length);
}

function parseCellKey(cellKey: string) {
  const [x, y] = cellKey.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}

function toCoordinate(point: GpsPoint): MapCoordinate {
  return {
    latitude: point.latitude,
    longitude: point.longitude
  };
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
