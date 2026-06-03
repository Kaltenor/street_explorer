import {
  EXPLORATION_CELL_SIZE_METERS,
  MapCoordinate,
  collectExploredCellIdsForPath,
  explorationCellKeyToCenterCoordinate
} from "./explorationArea";
import { haversineDistanceMeters } from "./distance";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint } from "../types/walk";

export const LOOP_FILL_CONFIG = {
  boundaryExpansionCells: 1,
  maxEnclosedCellCount: Math.floor(150_000 / (EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS)),
  maxPolygonAreaSquareMeters: 150_000,
  minEnclosedCellCount: 1,
  minLoopDistanceMeters: 80
};

type ProjectedPoint = {
  x: number;
  y: number;
};

type CellKey = {
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
  return analyzeLoopFills(input)[0] ?? null;
}

export function analyzeLoopFills(input: {
  activityMode: ActivityMode;
  exploredStreetIds: Set<string>;
  points: GpsPoint[];
  streetSegments: OsmStreetSegment[];
}): LoopFillResult[] {
  if (input.points.length < 4 || calculateGpsPathDistance(input.points) < LOOP_FILL_CONFIG.minLoopDistanceMeters) {
    return [];
  }

  const boundaryCellIds = collectExploredCellIdsForPath(input.points, input.activityMode);
  return analyzeLoopFillsForCells({
    activityMode: input.activityMode,
    boundaryCellIds,
    exploredStreetIds: input.exploredStreetIds,
    streetSegments: input.streetSegments
  });
}

export function analyzeLoopFillsForCells(input: {
  activityMode: ActivityMode;
  boundaryCellIds: string[];
  exploredStreetIds: Set<string>;
  streetSegments: OsmStreetSegment[];
}): LoopFillResult[] {
  const enclosedCellGroups = findEnclosedCellGroups(input.boundaryCellIds);

  if (enclosedCellGroups.length === 0) {
    return [];
  }

  return enclosedCellGroups.map((cellIds) => analyzeEnclosedCellGroup({
    activityMode: input.activityMode,
    cellIds,
    exploredStreetIds: input.exploredStreetIds,
    streetSegments: input.streetSegments
  }));
}

function analyzeEnclosedCellGroup(input: {
  activityMode: ActivityMode;
  cellIds: string[];
  exploredStreetIds: Set<string>;
  streetSegments: OsmStreetSegment[];
}): LoopFillResult {
  const polygon = getCellGroupBoundsPolygon(input.cellIds);
  const referenceLatitude = averageLatitude(polygon);
  const projectedPolygon = polygon.map((point) => coordinateToLocalMeters(point, referenceLatitude));
  const areaM2 = input.cellIds.length * EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS;

  if (input.cellIds.length < LOOP_FILL_CONFIG.minEnclosedCellCount) {
    return rejectedLoop(polygon, areaM2, "loop_area_too_small");
  }

  if (input.cellIds.length > LOOP_FILL_CONFIG.maxEnclosedCellCount) {
    return rejectedLoop(polygon, areaM2, "loop_area_too_large");
  }

  const streetAnalysis = calculateStreetLengthInsidePolygon({
    activityMode: input.activityMode,
    exploredStreetIds: input.exploredStreetIds,
    polygon: projectedPolygon,
    referenceLatitude,
    streetSegments: input.streetSegments
  });

  return {
    accepted: true,
    areaM2,
    cellIds: input.cellIds,
    polygon,
    rejectionReason: null,
    totalWalkableStreetLengthM: streetAnalysis.totalWalkableStreetLengthM,
    unwalkedWalkableStreetLengthM: streetAnalysis.unwalkedWalkableStreetLengthM
  };
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

function findEnclosedCellGroups(boundaryCellIds: string[]) {
  const boundary = new Set(boundaryCellIds);
  const detectionBoundary = expandBoundaryCells(boundary, LOOP_FILL_CONFIG.boundaryExpansionCells);
  const keys = [...detectionBoundary].map(parseCellKey);

  if (keys.length === 0) {
    return [];
  }

  const bounds = {
    maxX: Math.max(...keys.map((key) => key.x)) + 1,
    maxY: Math.max(...keys.map((key) => key.y)) + 1,
    minX: Math.min(...keys.map((key) => key.x)) - 1,
    minY: Math.min(...keys.map((key) => key.y)) - 1
  };
  const outside = floodReachableCells({
    blocked: detectionBoundary,
    bounds,
    start: { x: bounds.minX, y: bounds.minY }
  });
  const enclosed = new Set<string>();

  for (let x = bounds.minX + 1; x < bounds.maxX; x += 1) {
    for (let y = bounds.minY + 1; y < bounds.maxY; y += 1) {
      const key = cellKeyToString({ x, y });

      if (!boundary.has(key) && !outside.has(key)) {
        enclosed.add(key);
      }
    }
  }

  return collectConnectedCellGroups(enclosed);
}

function expandBoundaryCells(boundary: Set<string>, radius: number) {
  const expanded = new Set(boundary);

  for (const cellKey of boundary) {
    const cell = parseCellKey(cellKey);

    for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
      for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
        expanded.add(cellKeyToString({
          x: cell.x + xOffset,
          y: cell.y + yOffset
        }));
      }
    }
  }

  return expanded;
}

function floodReachableCells(input: {
  blocked: Set<string>;
  bounds: { maxX: number; maxY: number; minX: number; minY: number };
  start: CellKey;
}) {
  const visited = new Set<string>();
  const queue: CellKey[] = [input.start];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || !isInsideBounds(current, input.bounds)) {
      continue;
    }

    const key = cellKeyToString(current);

    if (visited.has(key) || input.blocked.has(key)) {
      continue;
    }

    visited.add(key);
    queue.push(
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    );
  }

  return visited;
}

function collectConnectedCellGroups(cells: Set<string>) {
  const remaining = new Set(cells);
  const groups: string[][] = [];

  while (remaining.size > 0) {
    const first = remaining.values().next().value;

    if (!first) {
      break;
    }

    const group: string[] = [];
    const queue = [parseCellKey(first)];

    remaining.delete(first);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      const key = cellKeyToString(current);
      group.push(key);

      for (const neighbor of getNeighborCellKeys(current)) {
        const neighborKey = cellKeyToString(neighbor);

        if (remaining.has(neighborKey)) {
          remaining.delete(neighborKey);
          queue.push(neighbor);
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

function getCellGroupBoundsPolygon(cellIds: string[]) {
  const centers = cellIds.map((cellId) => explorationCellKeyToCenterCoordinate(cellId));

  if (centers.length === 0) {
    return [];
  }

  const bounds = getCoordinateBounds(centers);

  return [
    { latitude: bounds.minLatitude, longitude: bounds.minLongitude },
    { latitude: bounds.minLatitude, longitude: bounds.maxLongitude },
    { latitude: bounds.maxLatitude, longitude: bounds.maxLongitude },
    { latitude: bounds.maxLatitude, longitude: bounds.minLongitude }
  ];
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

function cellKeyToString(key: CellKey) {
  return `${key.x}:${key.y}`;
}

function getNeighborCellKeys(key: CellKey) {
  return [
    { x: key.x + 1, y: key.y },
    { x: key.x - 1, y: key.y },
    { x: key.x, y: key.y + 1 },
    { x: key.x, y: key.y - 1 }
  ];
}

function isInsideBounds(
  key: CellKey,
  bounds: { maxX: number; maxY: number; minX: number; minY: number }
) {
  return key.x >= bounds.minX && key.x <= bounds.maxX && key.y >= bounds.minY && key.y <= bounds.maxY;
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
