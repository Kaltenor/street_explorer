import { buildPathSegments } from "./pathInference";
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

export type ExplorationPolygon = {
  coordinates: MapCoordinate[];
  id: string;
};

export type ExplorationOutlineSegment = {
  coordinates: MapCoordinate[];
  id: string;
};

type MercatorPoint = {
  x: number;
  y: number;
};

type CellKey = {
  x: number;
  y: number;
};

type GridEdge = {
  from: CellKey;
  to: CellKey;
};

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

export function buildMergedExplorationPolygons(cells: ExplorationCell[]): ExplorationPolygon[] {
  const rowIntervals = new Map<number, Array<{ endX: number; startX: number }>>();

  for (const cell of cells) {
    const key = stringToCellKey(cell.id);
    const intervals = rowIntervals.get(key.y) ?? [];

    intervals.push({ endX: key.x, startX: key.x });
    rowIntervals.set(key.y, intervals);
  }

  for (const [row, intervals] of rowIntervals) {
    intervals.sort((left, right) => left.startX - right.startX);
    rowIntervals.set(row, mergeRowIntervals(intervals));
  }

  const activeRectangles = new Map<string, { endX: number; endY: number; startX: number; startY: number }>();
  const rectangles: Array<{ endX: number; endY: number; startX: number; startY: number }> = [];
  const sortedRows = [...rowIntervals.keys()].sort((left, right) => left - right);

  for (const row of sortedRows) {
    const intervals = rowIntervals.get(row) ?? [];
    const currentKeys = new Set<string>();

    for (const interval of intervals) {
      const key = `${interval.startX}:${interval.endX}`;
      const existing = activeRectangles.get(key);

      currentKeys.add(key);

      if (existing && existing.endY + 1 === row) {
        existing.endY = row;
      } else {
        if (existing) {
          rectangles.push(existing);
        }

        activeRectangles.set(key, {
          endX: interval.endX,
          endY: row,
          startX: interval.startX,
          startY: row
        });
      }
    }

    for (const [key, rectangle] of [...activeRectangles.entries()]) {
      if (!currentKeys.has(key) && rectangle.endY < row) {
        rectangles.push(rectangle);
        activeRectangles.delete(key);
      }
    }
  }

  rectangles.push(...activeRectangles.values());

  return rectangles.map((rectangle) => buildExplorationRectangle(rectangle));
}

export function buildExplorationOutlineSegments(cells: ExplorationCell[]): ExplorationOutlineSegment[] {
  const cellKeys = new Set(cells.map((cell) => cell.id));
  const edges: GridEdge[] = [];

  for (const cell of cells) {
    const key = stringToCellKey(cell.id);

    if (!cellKeys.has(cellKeyToString({ x: key.x, y: key.y - 1 }))) {
      edges.push({
        from: { x: key.x, y: key.y },
        to: { x: key.x + 1, y: key.y }
      });
    }

    if (!cellKeys.has(cellKeyToString({ x: key.x, y: key.y + 1 }))) {
      edges.push({
        from: { x: key.x + 1, y: key.y + 1 },
        to: { x: key.x, y: key.y + 1 }
      });
    }

    if (!cellKeys.has(cellKeyToString({ x: key.x - 1, y: key.y }))) {
      edges.push({
        from: { x: key.x, y: key.y + 1 },
        to: { x: key.x, y: key.y }
      });
    }

    if (!cellKeys.has(cellKeyToString({ x: key.x + 1, y: key.y }))) {
      edges.push({
        from: { x: key.x + 1, y: key.y },
        to: { x: key.x + 1, y: key.y + 1 }
      });
    }
  }

  return traceGridOutlinePaths(edges).map((path, index) => ({
    coordinates: roundGridPathCorners(path).map(gridPointToCoordinate),
    id: `outline:${index}`
  }));
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
  _streetSegments: OsmStreetSegment[] = []
) {
  const gps = new Set<string>();

  for (const segment of buildPathSegments(points, activityMode)) {
    if (segment.type !== "confirmed") {
      continue;
    }

    for (let index = 1; index < segment.points.length; index += 1) {
      const from = segment.points[index - 1];
      const to = segment.points[index];

      if (from && to) {
        markSegmentCells(gps, from, to);
      }
    }
  }

  return {
    gps: [...gps],
    inferred: []
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

function buildExplorationRectangle(rectangle: {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
}): ExplorationPolygon {
  const minX = rectangle.startX * EXPLORATION_CELL_SIZE_METERS;
  const minY = rectangle.startY * EXPLORATION_CELL_SIZE_METERS;
  const maxX = (rectangle.endX + 1) * EXPLORATION_CELL_SIZE_METERS;
  const maxY = (rectangle.endY + 1) * EXPLORATION_CELL_SIZE_METERS;

  return {
    coordinates: [
      mercatorToCoordinate({ x: minX, y: minY }),
      mercatorToCoordinate({ x: maxX, y: minY }),
      mercatorToCoordinate({ x: maxX, y: maxY }),
      mercatorToCoordinate({ x: minX, y: maxY })
    ],
    id: `${rectangle.startX}:${rectangle.startY}:${rectangle.endX}:${rectangle.endY}`
  };
}

function mergeRowIntervals(intervals: Array<{ endX: number; startX: number }>) {
  const merged: Array<{ endX: number; startX: number }> = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);

    if (previous && previous.endX + 1 >= interval.startX) {
      previous.endX = Math.max(previous.endX, interval.endX);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
}

function traceGridOutlinePaths(edges: GridEdge[]) {
  const edgesByStart = new Map<string, GridEdge[]>();
  const unused = new Set(edges.map(gridEdgeToString));
  const paths: CellKey[][] = [];

  for (const edge of edges) {
    const key = cellKeyToString(edge.from);
    const bucket = edgesByStart.get(key) ?? [];

    bucket.push(edge);
    edgesByStart.set(key, bucket);
  }

  for (const edge of edges) {
    const edgeKey = gridEdgeToString(edge);

    if (!unused.has(edgeKey)) {
      continue;
    }

    const path: CellKey[] = [edge.from];
    const startPoint = edge.from;
    let currentEdge: GridEdge | null = edge;

    while (currentEdge) {
      unused.delete(gridEdgeToString(currentEdge));
      path.push(currentEdge.to);

      if (cellKeyToString(currentEdge.to) === cellKeyToString(startPoint)) {
        break;
      }

      const nextEdge: GridEdge | undefined = (edgesByStart.get(cellKeyToString(currentEdge.to)) ?? [])
        .find((candidate) => unused.has(gridEdgeToString(candidate)));

      currentEdge = nextEdge ?? null;
    }

    if (path.length > 2) {
      paths.push(path);
    }
  }

  return paths;
}

function roundGridPathCorners(path: CellKey[]) {
  const closedPath = isSameCellKey(path[0], path.at(-1)) ? path.slice(0, -1) : path;

  if (closedPath.length < 3) {
    return path;
  }

  const rounded: Array<{ x: number; y: number }> = [];
  const cornerRadius = 0.34;
  const curveSteps = 4;

  for (let index = 0; index < closedPath.length; index += 1) {
    const previous = closedPath[(index - 1 + closedPath.length) % closedPath.length];
    const current = closedPath[index];
    const next = closedPath[(index + 1) % closedPath.length];

    if (!previous || !current || !next) {
      continue;
    }

    const incoming = normalizeGridVector({
      x: previous.x - current.x,
      y: previous.y - current.y
    });
    const outgoing = normalizeGridVector({
      x: next.x - current.x,
      y: next.y - current.y
    });

    if (incoming.x === -outgoing.x && incoming.y === -outgoing.y) {
      rounded.push(current);
      continue;
    }

    const curveStart = {
      x: current.x + incoming.x * cornerRadius,
      y: current.y + incoming.y * cornerRadius
    };
    const curveEnd = {
      x: current.x + outgoing.x * cornerRadius,
      y: current.y + outgoing.y * cornerRadius
    };

    rounded.push(curveStart);

    for (let step = 1; step <= curveSteps; step += 1) {
      const t = step / curveSteps;
      const inverse = 1 - t;

      rounded.push({
        x: inverse * inverse * curveStart.x + 2 * inverse * t * current.x + t * t * curveEnd.x,
        y: inverse * inverse * curveStart.y + 2 * inverse * t * current.y + t * t * curveEnd.y
      });
    }
  }

  const first = rounded[0];

  if (first) {
    rounded.push(first);
  }

  return rounded;
}

function gridPointToCoordinate(point: { x: number; y: number }) {
  return mercatorToCoordinate({
    x: point.x * EXPLORATION_CELL_SIZE_METERS,
    y: point.y * EXPLORATION_CELL_SIZE_METERS
  });
}

function normalizeGridVector(vector: { x: number; y: number }) {
  const length = Math.max(1, Math.hypot(vector.x, vector.y));

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function gridEdgeToString(edge: GridEdge) {
  return `${cellKeyToString(edge.from)}>${cellKeyToString(edge.to)}`;
}

function isSameCellKey(first: CellKey | undefined, second: CellKey | undefined) {
  return Boolean(first && second && first.x === second.x && first.y === second.y);
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
