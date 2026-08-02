import { buildPathSegments, buildPathSegmentsWithInference } from "./pathInference";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint, RenderedRouteSegment, WalkWithPoints } from "../types/walk";

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
  holes: MapCoordinate[][];
  id: string;
};

export type ExplorationPolygonOptions = {
  maxFilledHoleAreaSquareMeters?: number;
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

type ExplorationCellReference = ExplorationCell | string;

type GridContour = {
  area: number;
  path: CellKey[];
};

export function collectExplorationCellIds(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  activeMode: ActivityMode,
  loopFillCellIds: string[] = []
) {
  const cellKeys = collectExploredCellKeys(walks, activePoints, activeMode);

  for (const cellId of loopFillCellIds) {
    cellKeys.add(cellId);
  }

  return [...cellKeys];
}

export function buildExplorationCells(
  walks: WalkWithPoints[],
  activePoints: GpsPoint[],
  activeMode: ActivityMode,
  loopFillCellIds: string[] = []
) {
  const loopFillKeys = new Set(loopFillCellIds);

  return collectExplorationCellIds(walks, activePoints, activeMode, loopFillCellIds).map((key) =>
    buildExplorationCell(key, loopFillKeys.has(key) ? "loop_fill" : "gps")
  );
}

export function buildMergedExplorationPolygons(
  cells: readonly ExplorationCellReference[],
  options: ExplorationPolygonOptions = {}
): ExplorationPolygon[] {
  const contours = buildGridContours(cells);
  const holeContours = contours.filter((contour) => contour.area < 0);
  const filledHoleContours = new Set(
    holeContours.filter((contour) =>
      isHoleWithinFillLimit(contour, options.maxFilledHoleAreaSquareMeters)
    )
  );
  const exteriorContours = contours
    .filter((contour) => contour.area > 0)
    .filter((contour) => {
      const sample = getGridContourInteriorPoint(contour);

      return !sample || ![...filledHoleContours].some((holeContour) =>
        isPointInsideGridPath(sample, holeContour.path)
      );
    })
    .sort((left, right) => right.area - left.area);
  const polygons: ExplorationPolygon[] = exteriorContours.map((contour) => {
    const first = contour.path[0];

    return {
      coordinates: gridPathToCoordinates(contour.path, false),
      holes: [],
      id:
        "area:" +
        (first?.x ?? 0) +
        ":" +
        (first?.y ?? 0) +
        ":" +
        Math.round(contour.area)
    };
  });

  for (const holeContour of holeContours) {
    if (filledHoleContours.has(holeContour)) {
      continue;
    }

    const sample = getGridContourInteriorPoint(holeContour);

    if (!sample) {
      continue;
    }

    let ownerIndex = -1;
    let ownerArea = Number.POSITIVE_INFINITY;

    for (let index = 0; index < exteriorContours.length; index += 1) {
      const exterior = exteriorContours[index];

      if (
        exterior &&
        exterior.area < ownerArea &&
        isPointInsideGridPath(sample, exterior.path)
      ) {
        ownerArea = exterior.area;
        ownerIndex = index;
      }
    }

    if (ownerIndex >= 0) {
      polygons[ownerIndex]?.holes.push(gridPathToCoordinates(holeContour.path, false));
    }
  }

  // MapKit can retain the previous native polygon when only its holes change.
  // Include the complete rendered geometry in the identity so closing a loop
  // remounts that polygon instead of leaving a stale transparent interior.
  for (const polygon of polygons) {
    polygon.id += ":geometry:" + hashExplorationPolygonGeometry(polygon);
  }

  return polygons;
}

function hashExplorationPolygonGeometry(polygon: ExplorationPolygon) {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  };
  const mixPath = (path: MapCoordinate[]) => {
    mix(path.length);

    for (const coordinate of path) {
      mix(Math.round(coordinate.latitude * 10_000_000));
      mix(Math.round(coordinate.longitude * 10_000_000));
    }
  };

  mixPath(polygon.coordinates);
  mix(polygon.holes.length);

  for (const hole of polygon.holes) {
    mixPath(hole);
  }

  return (hash >>> 0).toString(36);
}

export function collectEnclosedExplorationCellGroups(
  cells: readonly ExplorationCellReference[]
) {
  const occupiedCellIds = new Set(cells.map(getExplorationCellId));

  const claimedCellIds = new Set<string>();
  const groups: string[][] = [];
  const holeContours = buildGridContours(cells)
    .filter((contour) => contour.area < 0)
    .sort((left, right) => Math.abs(right.area) - Math.abs(left.area));

  for (const contour of holeContours) {
    const group = collectUnoccupiedCellsInsideGridContour(contour, occupiedCellIds)
      .filter((cellId) => !claimedCellIds.has(cellId));

    if (group.length === 0) {
      continue;
    }

    groups.push(group);

    for (const cellId of group) {
      claimedCellIds.add(cellId);
    }
  }

  return groups;
}

export function collectFillableEnclosedExplorationCellIds(
  cells: readonly ExplorationCellReference[],
  maxFilledAreaSquareMeters: number
) {
  const maxCellCount = Math.floor(
    maxFilledAreaSquareMeters /
      (EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS)
  );

  return collectEnclosedExplorationCellGroups(cells)
    .filter((group) => group.length <= maxCellCount)
    .flat();
}
function collectUnoccupiedCellsInsideGridContour(
  contour: GridContour,
  occupiedCellIds: Set<string>
) {
  const xValues = contour.path.map((point) => point.x);
  const yValues = contour.path.map((point) => point.y);
  const minX = Math.floor(Math.min(...xValues));
  const maxX = Math.ceil(Math.max(...xValues));
  const minY = Math.floor(Math.min(...yValues));
  const maxY = Math.ceil(Math.max(...yValues));
  const enclosedCellIds: string[] = [];

  for (let x = minX; x < maxX; x += 1) {
    for (let y = minY; y < maxY; y += 1) {
      const cellId = cellKeyToString({ x, y });

      if (
        !occupiedCellIds.has(cellId) &&
        isPointInsideGridPath({ x: x + 0.5, y: y + 0.5 }, contour.path)
      ) {
        enclosedCellIds.push(cellId);
      }
    }
  }

  return enclosedCellIds;
}
export function buildExplorationPolygonOutlineSegments(
  polygons: readonly ExplorationPolygon[]
): ExplorationOutlineSegment[] {
  return polygons.flatMap((polygon) => [
    {
      coordinates: closeCoordinatePath(polygon.coordinates),
      id: polygon.id + ":exterior"
    },
    ...polygon.holes.map((hole, index) => ({
      coordinates: closeCoordinatePath(hole),
      id: polygon.id + ":hole:" + index
    }))
  ]);
}

export function buildExplorationOutlineSegments(
  cells: readonly ExplorationCellReference[],
  options: ExplorationPolygonOptions = {}
): ExplorationOutlineSegment[] {
  return buildExplorationPolygonOutlineSegments(
    buildMergedExplorationPolygons(cells, options)
  );
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
  const routeSegments = buildPathSegmentsWithInference(
    points,
    activityMode,
    streetSegments
  ).flatMap<RenderedRouteSegment>((segment) => {
    if (
      segment.type === "rejected" ||
      (segment.type === "inferred" && segment.confidence === "low")
    ) {
      return [];
    }

    return [{
      confidence:
        segment.type === "inferred"
          ? segment.confidence === "high" ? "high" : "medium"
          : undefined,
      points: segment.points,
      type: segment.type
    }];
  });

  return collectExploredCellIdsByRouteSegments(routeSegments);
}

export function collectExploredCellIdsByRouteSegments(
  routeSegments: readonly RenderedRouteSegment[]
) {
  const gps = new Set<string>();
  const inferred = new Set<string>();

  for (const segment of routeSegments) {
    if (!isValidatedExplorationRouteSegment(segment)) {
      continue;
    }

    const target = segment.type === "inferred" ? inferred : gps;

    for (let index = 1; index < segment.points.length; index += 1) {
      const from = segment.points[index - 1];
      const to = segment.points[index];

      if (from && to) {
        markSegmentCells(target, from, to);
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
    if (walk.routeSegments !== null) {
      markRouteSegmentCells(keys, walk.routeSegments);
    } else {
      markPathCells(keys, walk.points, walk.activityMode);
    }
  }

  markPathCells(keys, activePoints, activeMode);

  return keys;
}

function isValidatedExplorationRouteSegment(segment: RenderedRouteSegment) {
  return (
    segment.type === "confirmed" ||
    segment.confidence === "high" ||
    segment.confidence === "medium"
  );
}

function markRouteSegmentCells(
  keys: Set<string>,
  routeSegments: readonly RenderedRouteSegment[]
) {
  for (const segment of routeSegments) {
    if (!isValidatedExplorationRouteSegment(segment)) {
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

function getExplorationCellId(cell: ExplorationCellReference) {
  return typeof cell === "string" ? cell : cell.id;
}

function buildGridContours(cells: readonly ExplorationCellReference[]): GridContour[] {
  const edges = buildGridBoundaryEdges(cells);

  return traceGridOutlinePaths(edges)
    .map((path) => ({
      area: calculateSignedGridPathArea(path),
      path
    }))
    .filter((contour) => contour.area !== 0);
}

function buildGridBoundaryEdges(cells: readonly ExplorationCellReference[]) {
  const cellKeys = new Set(cells.map(getExplorationCellId));
  const edges: GridEdge[] = [];

  for (const cellId of cellKeys) {
    const key = stringToCellKey(cellId);

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

  return edges;
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

      const candidates = (edgesByStart.get(cellKeyToString(currentEdge.to)) ?? [])
        .filter((candidate) => unused.has(gridEdgeToString(candidate)));
      currentEdge = chooseNextGridEdge(currentEdge, candidates);
    }

    if (path.length > 2) {
      paths.push(path);
    }
  }

  return paths;
}

function chooseNextGridEdge(current: GridEdge, candidates: GridEdge[]) {
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const currentDirection = getGridEdgeDirection(current);
  const turnPriority = [1, 0, 3, 2];

  return (
    [...candidates].sort((left, right) => {
      const leftTurn = (getGridEdgeDirection(left) - currentDirection + 4) % 4;
      const rightTurn = (getGridEdgeDirection(right) - currentDirection + 4) % 4;

      return turnPriority.indexOf(leftTurn) - turnPriority.indexOf(rightTurn);
    })[0] ?? null
  );
}

function getGridEdgeDirection(edge: GridEdge) {
  const deltaX = edge.to.x - edge.from.x;
  const deltaY = edge.to.y - edge.from.y;

  if (deltaX > 0) {
    return 0;
  }

  if (deltaY > 0) {
    return 1;
  }

  if (deltaX < 0) {
    return 2;
  }

  return 3;
}

function calculateSignedGridPathArea(path: CellKey[]) {
  let twiceArea = 0;

  for (let index = 0; index < path.length; index += 1) {
    const current = path[index];
    const next = path[(index + 1) % path.length];

    if (current && next) {
      twiceArea += current.x * next.y - next.x * current.y;
    }
  }

  return twiceArea / 2;
}

function isHoleWithinFillLimit(
  contour: GridContour,
  maxFilledHoleAreaSquareMeters: number | undefined
) {
  if (maxFilledHoleAreaSquareMeters === undefined) {
    return false;
  }

  const holeAreaSquareMeters =
    Math.abs(contour.area) *
    EXPLORATION_CELL_SIZE_METERS *
    EXPLORATION_CELL_SIZE_METERS;

  return holeAreaSquareMeters <= maxFilledHoleAreaSquareMeters;
}

function getGridContourInteriorPoint(contour: GridContour): CellKey | null {
  const from = contour.path[0];
  const to = contour.path[1];

  if (!from || !to) {
    return null;
  }

  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.max(1, Math.hypot(deltaX, deltaY));
  const orientation = contour.area > 0 ? 1 : -1;

  return {
    x: (from.x + to.x) / 2 + (-deltaY / length) * 0.25 * orientation,
    y: (from.y + to.y) / 2 + (deltaX / length) * 0.25 * orientation
  };
}

function simplifyGridPath(path: CellKey[]) {
  const last = path.at(-1);
  const first = path[0];
  const openPath =
    first && last && first.x === last.x && first.y === last.y ? path.slice(0, -1) : path;

  if (openPath.length < 3) {
    return openPath;
  }

  return openPath.filter((current, index) => {
    const previous = openPath[(index - 1 + openPath.length) % openPath.length];
    const next = openPath[(index + 1) % openPath.length];

    if (!previous || !next) {
      return true;
    }

    return (
      current.x - previous.x !== next.x - current.x ||
      current.y - previous.y !== next.y - current.y
    );
  });
}

function gridPathToCoordinates(path: CellKey[], closePath: boolean) {
  const simplified = simplifyGridPath(path);
  const first = simplified[0];
  const output = closePath && first ? [...simplified, first] : simplified;

  return output.map(gridPointToCoordinate);
}

function closeCoordinatePath(path: MapCoordinate[]) {
  const first = path[0];

  if (!first) {
    return path;
  }

  return [...path, first];
}

function isPointInsideGridPath(point: CellKey, path: CellKey[]) {
  let inside = false;

  for (
    let index = 0, previousIndex = path.length - 1;
    index < path.length;
    previousIndex = index, index += 1
  ) {
    const current = path[index];
    const previous = path[previousIndex];

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

function gridPointToCoordinate(point: { x: number; y: number }) {
  return mercatorToCoordinate({
    x: point.x * EXPLORATION_CELL_SIZE_METERS,
    y: point.y * EXPLORATION_CELL_SIZE_METERS
  });
}

function gridEdgeToString(edge: GridEdge) {
  return `${cellKeyToString(edge.from)}>${cellKeyToString(edge.to)}`;
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
