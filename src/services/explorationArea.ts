import { buildPathSegments, buildPathSegmentsWithInference } from "./pathInference";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint, WalkWithPoints } from "../types/walk";

export const EXPLORATION_CELL_SIZE_METERS = 15;

export type ExplorationCellSource = "gps" | "inferred" | "loop_fill";

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
  source: ExplorationCellSource;
};

export type FogCell = {
  id: string;
  coordinates: MapCoordinate[];
  opacity: number;
};

type MercatorPoint = {
  x: number;
  y: number;
};

type CellKey = {
  x: number;
  y: number;
};

const FOG_CELL_SIZE_METERS = EXPLORATION_CELL_SIZE_METERS * 8;
const FOG_VIEWPORT_PADDING_FACTOR = 0.18;
const MAX_FOG_CELLS = 900;

export function buildExplorationCells(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  activeMode: ActivityMode,
  loopFillCellIds: string[] = []
) {
  const cellKeys = collectExploredCellKeys(walks, activePoints, activeMode);
  const loopFillKeys = new Set(loopFillCellIds);

  return [
    ...[...cellKeys].map((key) => buildExplorationCell(key, "gps")),
    ...[...loopFillKeys]
      .filter((key) => !cellKeys.has(key))
      .map((key) => buildExplorationCell(key, "loop_fill"))
  ];
}

export function buildFogCells(input: {
  explorationCells: ExplorationCell[];
  visibleRegion: {
    latitude: number;
    latitudeDelta: number;
    longitude: number;
    longitudeDelta: number;
  };
}) {
  const bounds = getFogBounds(input);

  if (!bounds) {
    return [];
  }

  const exploredFogKeys = new Set(
    input.explorationCells.map((cell) => fogCellKeyToString(mercatorToFogCellKey(
      coordinateToMercator(getCellApproximateCenter(cell.coordinates))
    )))
  );
  const range = clampFogRange({
    maxX: Math.floor(bounds.maxX / FOG_CELL_SIZE_METERS),
    maxY: Math.floor(bounds.maxY / FOG_CELL_SIZE_METERS),
    minX: Math.floor(bounds.minX / FOG_CELL_SIZE_METERS),
    minY: Math.floor(bounds.minY / FOG_CELL_SIZE_METERS)
  });
  const fogCells: FogCell[] = [];

  for (let x = range.minX; x <= range.maxX; x += 1) {
    for (let y = range.minY; y <= range.maxY; y += 1) {
      const key = fogCellKeyToString({ x, y });

      if (!exploredFogKeys.has(key)) {
        fogCells.push(buildFogCell({ x, y }, getFogCellOpacity({ x, y }, range)));
      }
    }
  }

  return fogCells;
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

export function collectExploredCellIdsForPath(points: GpsPoint[], activityMode: ActivityMode) {
  const keys = new Set<string>();

  markPathCells(keys, points, activityMode);

  return [...keys];
}

export function collectExploredCellIdsBySource(
  points: GpsPoint[],
  activityMode: ActivityMode,
  streetSegments: OsmStreetSegment[] = []
) {
  const gps = new Set<string>();
  const inferred = new Set<string>();

  for (const segment of buildPathSegmentsWithInference(points, activityMode, streetSegments)) {
    if (segment.type === "rejected") {
      continue;
    }

    const targetKeys = segment.type === "inferred" ? inferred : gps;

    for (let index = 1; index < segment.points.length; index += 1) {
      const from = segment.points[index - 1];
      const to = segment.points[index];

      if (from && to) {
        markSegmentCells(targetKeys, from, to);
      }
    }
  }

  return {
    gps: [...gps],
    inferred: [...inferred].filter((cellKey) => !gps.has(cellKey))
  };
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

export function buildExplorationCell(
  keyString: string,
  source: ExplorationCellSource = "gps"
): ExplorationCell {
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
    ],
    source
  };
}

function buildFogCell(key: CellKey, opacity: number): FogCell {
  const minX = key.x * FOG_CELL_SIZE_METERS;
  const minY = key.y * FOG_CELL_SIZE_METERS;
  const maxX = minX + FOG_CELL_SIZE_METERS;
  const maxY = minY + FOG_CELL_SIZE_METERS;

  return {
    coordinates: [
      mercatorToCoordinate({ x: minX, y: minY }),
      mercatorToCoordinate({ x: maxX, y: minY }),
      mercatorToCoordinate({ x: maxX, y: maxY }),
      mercatorToCoordinate({ x: minX, y: maxY })
    ],
    id: fogCellKeyToString(key),
    opacity
  };
}

function getFogBounds(input: {
  visibleRegion: {
    latitude: number;
    latitudeDelta: number;
    longitude: number;
    longitudeDelta: number;
  };
}) {
  const latitudePadding = input.visibleRegion.latitudeDelta * FOG_VIEWPORT_PADDING_FACTOR;
  const longitudePadding = input.visibleRegion.longitudeDelta * FOG_VIEWPORT_PADDING_FACTOR;
  const northWest = coordinateToMercator({
    latitude: input.visibleRegion.latitude + input.visibleRegion.latitudeDelta / 2 + latitudePadding,
    longitude: input.visibleRegion.longitude - input.visibleRegion.longitudeDelta / 2 - longitudePadding
  });
  const southEast = coordinateToMercator({
    latitude: input.visibleRegion.latitude - input.visibleRegion.latitudeDelta / 2 - latitudePadding,
    longitude: input.visibleRegion.longitude + input.visibleRegion.longitudeDelta / 2 + longitudePadding
  });

  return {
    maxX: Math.max(northWest.x, southEast.x),
    maxY: Math.max(northWest.y, southEast.y),
    minX: Math.min(northWest.x, southEast.x),
    minY: Math.min(northWest.y, southEast.y)
  };
}

function clampFogRange(range: { maxX: number; maxY: number; minX: number; minY: number }) {
  const width = range.maxX - range.minX + 1;
  const height = range.maxY - range.minY + 1;
  const total = width * height;

  if (total <= MAX_FOG_CELLS) {
    return range;
  }

  const aspect = Math.max(0.5, Math.min(2, width / Math.max(1, height)));
  const clampedWidth = Math.max(1, Math.floor(Math.sqrt(MAX_FOG_CELLS * aspect)));
  const clampedHeight = Math.max(1, Math.floor(MAX_FOG_CELLS / clampedWidth));
  const centerX = Math.floor((range.minX + range.maxX) / 2);
  const centerY = Math.floor((range.minY + range.maxY) / 2);
  const halfWidth = Math.floor(clampedWidth / 2);
  const halfHeight = Math.floor(clampedHeight / 2);

  return {
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
    minX: centerX - halfWidth,
    minY: centerY - halfHeight
  };
}

function getFogCellOpacity(key: CellKey, range: { maxX: number; maxY: number; minX: number; minY: number }) {
  const edgeDistance = Math.min(
    key.x - range.minX,
    range.maxX - key.x,
    key.y - range.minY,
    range.maxY - key.y
  );

  if (edgeDistance <= 0) {
    return 0.28;
  }

  if (edgeDistance === 1) {
    return 0.52;
  }

  return 0.72;
}

function getCellApproximateCenter(coordinates: MapCoordinate[]) {
  return {
    latitude:
      coordinates.reduce((total, coordinate) => total + coordinate.latitude, 0) /
      Math.max(1, coordinates.length),
    longitude:
      coordinates.reduce((total, coordinate) => total + coordinate.longitude, 0) /
      Math.max(1, coordinates.length)
  };
}

export function coordinateToExplorationCellKey(point: Pick<MapCoordinate, "latitude" | "longitude">) {
  return cellKeyToString(mercatorToCellKey(coordinateToMercator(point)));
}

export function explorationCellKeyToCenterCoordinate(keyString: string) {
  return mercatorToCoordinate(cellCenterToMercator(stringToCellKey(keyString)));
}

function coordinateToMercator(point: Pick<MapCoordinate, "latitude" | "longitude">): MercatorPoint {
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

function mercatorToFogCellKey(point: MercatorPoint): CellKey {
  return {
    x: Math.floor(point.x / FOG_CELL_SIZE_METERS),
    y: Math.floor(point.y / FOG_CELL_SIZE_METERS)
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

function fogCellKeyToString(key: CellKey) {
  return `${key.x}:${key.y}`;
}

function stringToCellKey(value: string): CellKey {
  const [x, y] = value.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}
