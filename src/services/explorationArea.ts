import { buildPathSegments } from "./pathInference";
import { ActivityMode, GpsPoint, WalkWithPoints } from "../types/walk";

export const EXPLORATION_CELL_SIZE_METERS = 10;

const EARTH_RADIUS_METERS = 6378137;
const SAMPLE_SPACING_METERS = EXPLORATION_CELL_SIZE_METERS / 4;
const CELL_CAPTURE_RADIUS_METERS = EXPLORATION_CELL_SIZE_METERS / Math.SQRT2;

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type ExplorationCell = {
  id: string;
  coordinates: MapCoordinate[];
};

type MercatorPoint = {
  x: number;
  y: number;
};

type CellKey = {
  x: number;
  y: number;
};

export function buildExplorationCells(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  activeMode: ActivityMode
) {
  const cellKeys = collectExploredCellKeys(walks, activePoints, activeMode);

  return [...cellKeys].map((key) => buildExplorationCell(key));
}

export function calculateExploredAreaSquareMeters(walks: WalkWithPoints[]) {
  return calculateExploredCellCount(walks) * EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS;
}

export function calculateExploredCellCount(walks: WalkWithPoints[]) {
  const cellKeys = collectExploredCellKeys(walks, [], "walk");

  return cellKeys.size;
}

export function calculateNewCellsForActivePath(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  activeMode: ActivityMode
) {
  const savedKeys = collectExploredCellKeys(walks, [], activeMode);
  const activeKeys = collectExploredCellKeys([], activePoints, activeMode);
  let newCellCount = 0;

  for (const key of activeKeys) {
    if (!savedKeys.has(key)) {
      newCellCount += 1;
    }
  }

  return newCellCount;
}

function collectExploredCellKeys(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  activeMode: ActivityMode
) {
  const keys = new Set<string>();

  for (const walk of walks) {
    markPathCells(keys, walk.points, walk.activityMode);
  }

  markPathCells(keys, activePoints, activeMode);

  return keys;
}

function markPathCells(keys: Set<string>, points: GpsPoint[], activityMode: ActivityMode) {
  for (const segment of buildPathSegments(points, activityMode)) {
    if (segment.type === "rejected") {
      continue;
    }

    for (let index = 1; index < segment.points.length; index += 1) {
      const from = segment.points[index - 1];
      const to = segment.points[index];

      if (from && to) {
        markSegmentCells(keys, from, to);
      }
    }
  }
}

function markSegmentCells(keys: Set<string>, from: GpsPoint, to: GpsPoint) {
  const fromPoint = coordinateToMercator(from);
  const toPoint = coordinateToMercator(to);
  const delta = {
    x: toPoint.x - fromPoint.x,
    y: toPoint.y - fromPoint.y
  };
  const distance = Math.hypot(delta.x, delta.y);
  const sampleCount = Math.max(1, Math.ceil(distance / SAMPLE_SPACING_METERS));

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
    const progress = sampleIndex / sampleCount;
    const sample = {
      x: fromPoint.x + delta.x * progress,
      y: fromPoint.y + delta.y * progress
    };

    markNearbyCells(keys, sample);
  }
}

function markNearbyCells(keys: Set<string>, sample: MercatorPoint) {
  const centerCell = mercatorToCellKey(sample);

  for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      const key = {
        x: centerCell.x + xOffset,
        y: centerCell.y + yOffset
      };
      const center = cellCenterToMercator(key);
      const distanceToCenter = Math.hypot(center.x - sample.x, center.y - sample.y);

      if (distanceToCenter <= CELL_CAPTURE_RADIUS_METERS) {
        keys.add(cellKeyToString(key));
      }
    }
  }
}

function buildExplorationCell(keyString: string): ExplorationCell {
  const key = stringToCellKey(keyString);
  const minX = key.x * EXPLORATION_CELL_SIZE_METERS;
  const minY = key.y * EXPLORATION_CELL_SIZE_METERS;
  const maxX = minX + EXPLORATION_CELL_SIZE_METERS;
  const maxY = minY + EXPLORATION_CELL_SIZE_METERS;

  return {
    id: keyString,
    coordinates: [
      mercatorToCoordinate({ x: minX, y: minY }),
      mercatorToCoordinate({ x: maxX, y: minY }),
      mercatorToCoordinate({ x: maxX, y: maxY }),
      mercatorToCoordinate({ x: minX, y: maxY })
    ]
  };
}

function coordinateToMercator(point: GpsPoint): MercatorPoint {
  const latitudeRadians = (point.latitude * Math.PI) / 180;
  const longitudeRadians = (point.longitude * Math.PI) / 180;

  return {
    x: EARTH_RADIUS_METERS * longitudeRadians,
    y: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))
  };
}

function mercatorToCoordinate(point: MercatorPoint): MapCoordinate {
  return {
    latitude: (Math.atan(Math.exp(point.y / EARTH_RADIUS_METERS)) * 2 - Math.PI / 2) * (180 / Math.PI),
    longitude: (point.x / EARTH_RADIUS_METERS) * (180 / Math.PI)
  };
}

function mercatorToCellKey(point: MercatorPoint): CellKey {
  return {
    x: Math.floor(point.x / EXPLORATION_CELL_SIZE_METERS),
    y: Math.floor(point.y / EXPLORATION_CELL_SIZE_METERS)
  };
}

function cellCenterToMercator(key: CellKey): MercatorPoint {
  return {
    x: key.x * EXPLORATION_CELL_SIZE_METERS + EXPLORATION_CELL_SIZE_METERS / 2,
    y: key.y * EXPLORATION_CELL_SIZE_METERS + EXPLORATION_CELL_SIZE_METERS / 2
  };
}

function cellKeyToString(key: CellKey) {
  return `${key.x}:${key.y}`;
}

function stringToCellKey(value: string): CellKey {
  const [x, y] = value.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}
