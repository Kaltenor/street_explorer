import {
  MapCoordinate,
  collectFillableEnclosedExplorationCellIds,
  coordinateToExplorationCellKey,
  explorationCellKeyToCenterCoordinate
} from "./explorationArea";
import {
  CachedZone,
  CompletionScope,
  ExploredCellRecord,
  ExploredCellSource,
  getCachedZoneTotal,
  getZoneAchievement,
  recordZoneAchievement,
  saveCachedZoneTotal
} from "../database/completionRepository";
import { LOOP_FILL_CONFIG } from "./loopFill";
import {
  buildBoundaryQuery,
  EXACT_ZONE_BOUNDARY_SOURCE
} from "./zoneBoundaryPolicy";
import { ActivityMode, GpsPoint } from "../types/walk";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const MAX_TOTAL_ZONE_CELLS_TO_SCAN = 350_000;
const COMPLETION_SCAN_YIELD_INTERVAL = 2_048;
export const ZONE_BOUNDARY_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const renderedContourFillCache = new WeakMap<ExploredCellRecord[], ExploredCellRecord[]>();

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassRelationMember = {
  geometry?: OverpassGeometryPoint[];
  role?: string;
  type: string;
};

type OverpassRelationElement = {
  bounds?: {
    maxlat: number;
    maxlon: number;
    minlat: number;
    minlon: number;
  };
  id: number;
  members?: OverpassRelationMember[];
  tags?: {
    admin_level?: string;
    name?: string;
  };
  type: "relation";
};

type OverpassBoundaryResponse = {
  elements?: OverpassRelationElement[];
};

export type ZoneCompletionStats = {
  completedAt: string | null;
  completionPercent: number | null;
  completionStatus: "available" | "invalid_boundary" | "too_large";
  directlyWalkedCells: number;
  exploredCells: number;
  inferredCells: number;
  loopFilledCells: number;
  permanentlyCompleted: boolean;
  totalZoneCells: number | null;
};

export type ZoneFetchResult = {
  rawElementCount: number;
  relationCount: number;
  usableZoneCount: number;
  zones: CachedZone[];
};

export async function fetchNearbyOsmZones(
  center: Pick<GpsPoint, "latitude" | "longitude">
): Promise<CachedZone[]> {
  const result = await fetchNearbyOsmZonesWithDebug(center);

  return result.zones;
}

export async function fetchNearbyOsmZonesWithDebug(
  center: Pick<GpsPoint, "latitude" | "longitude">
): Promise<ZoneFetchResult> {
  const response = await fetch(OVERPASS_ENDPOINT, {
    body: buildBoundaryQuery(center.latitude, center.longitude),
    headers: {
      "Content-Type": "text/plain"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Overpass boundary request failed: ${response.status}`);
  }

  const data = (await response.json()) as OverpassBoundaryResponse;
  const fetchedAt = new Date().toISOString();
  const relationElements = (data.elements ?? []).filter((element) => element.type === "relation");
  const mappedZones = relationElements
    .map((element) => mapRelationToZone(element, fetchedAt))
    .filter((zone): zone is CachedZone => Boolean(zone));
  const zones = assignDistrictParentZones(mappedZones);

  return {
    rawElementCount: data.elements?.length ?? 0,
    relationCount: relationElements.length,
    usableZoneCount: zones.length,
    zones
  };
}

export async function calculateZoneCompletionStats(
  zone: CachedZone,
  exploredCells: ExploredCellRecord[],
  signal?: AbortSignal,
  options: { persistAchievement?: boolean } = {}
): Promise<ZoneCompletionStats> {
  throwIfCompletionCancelled(signal);
  const completionCells = includeRenderedContourFills(exploredCells);
  const exploredInside: ExploredCellRecord[] = [];

  for (let index = 0; index < completionCells.length; index += 1) {
    if (index > 0 && index % COMPLETION_SCAN_YIELD_INTERVAL === 0) {
      throwIfCompletionCancelled(signal);
      await yieldToEventLoop();
    }

    const cell = completionCells[index];

    if (
      cell &&
      isPointInsideZone(explorationCellKeyToCenterCoordinate(cell.cellKey), zone)
    ) {
      exploredInside.push(cell);
    }
  }

  throwIfCompletionCancelled(signal);
  const uniqueExplored = uniqueCellCount(exploredInside);
  const directlyWalkedCells = uniqueCellCount(
    exploredInside.filter((cell) => cell.source === "gps")
  );
  const inferredCells = uniqueCellCount(
    exploredInside.filter((cell) => cell.source === "inferred")
  );
  const loopFilledCells = uniqueCellCount(
    exploredInside.filter((cell) => cell.source === "loop_fill")
  );
  const completionEligible = isZoneCompletionEligible(zone);
  const totalZoneCells = completionEligible
    ? await calculateTotalZoneCells(zone, signal)
    : null;
  const completionPercent =
    totalZoneCells && totalZoneCells > 0
      ? Math.min(100, Math.round((uniqueExplored / totalZoneCells) * 1000) / 10)
      : null;
  const geometryFingerprint = getZoneGeometryFingerprint(zone);
  let achievement = await getZoneAchievement(zone.id);

  if (
    options.persistAchievement !== false &&
    !achievement &&
    completionPercent !== null &&
    completionPercent >= 100 &&
    totalZoneCells
  ) {
    const completedAt = new Date().toISOString();

    await recordZoneAchievement({
      boundaryFetchedAt: zone.fetchedAt,
      boundarySource: zone.source,
      completedAt,
      exploredCells: uniqueExplored,
      geometryFingerprint,
      totalZoneCells,
      zoneId: zone.id,
      zoneName: zone.name,
      zoneType: zone.type
    });
    achievement = await getZoneAchievement(zone.id);
  }

  return {
    completedAt: achievement?.completedAt ?? null,
    completionPercent,
    completionStatus: !completionEligible
      ? "invalid_boundary"
      : totalZoneCells === null
        ? "too_large"
        : "available",
    directlyWalkedCells,
    exploredCells: uniqueExplored,
    inferredCells,
    loopFilledCells,
    permanentlyCompleted: Boolean(achievement),
    totalZoneCells
  };
}

export function isBoundaryRefreshStale(
  lastSucceededAt: string | null,
  nowMs = Date.now()
) {
  if (!lastSucceededAt) {
    return true;
  }

  const lastSucceededMs = new Date(lastSucceededAt).getTime();

  return !Number.isFinite(lastSucceededMs) ||
    nowMs - lastSucceededMs >= ZONE_BOUNDARY_STALE_AFTER_MS;
}

export function isZoneCompletionEligible(zone: CachedZone) {
  return zone.source === EXACT_ZONE_BOUNDARY_SOURCE;
}

function assignDistrictParentZones(zones: CachedZone[]) {
  const cities = zones.filter(
    (zone) => zone.type === "city" && isZoneCompletionEligible(zone)
  );

  return zones.map((zone) => {
    if (zone.type !== "district") {
      return zone;
    }

    const parentCity = cities.find((city) =>
      zone.geometry.some((ring) =>
        ring.some((point) => isPointInsideZone(point, city))
      )
    );

    return parentCity
      ? { ...zone, parentZoneId: parentCity.id }
      : zone;
  });
}

export function getZoneGeometryFingerprint(zone: CachedZone) {
  const serialized = JSON.stringify({ holes: zone.holes, outer: zone.geometry });
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
export function includeRenderedContourFills(exploredCells: ExploredCellRecord[]) {
  const cached = renderedContourFillCache.get(exploredCells);

  if (cached) {
    return cached;
  }

  const result = [...exploredCells];
  const existingModeCells = new Set(
    exploredCells.map((cell) => cell.mode + ":" + cell.cellKey)
  );

  for (const mode of ["walk"] as ActivityMode[]) {
    const modeCellIds = [
      ...new Set(
        exploredCells
          .filter((cell) => cell.mode === mode)
          .map((cell) => cell.cellKey)
      )
    ];
    const fillCellIds = collectFillableEnclosedExplorationCellIds(
      modeCellIds,
      LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode[mode]
    );

    for (const cellKey of fillCellIds) {
      const modeCellKey = mode + ":" + cellKey;

      if (existingModeCells.has(modeCellKey)) {
        continue;
      }

      existingModeCells.add(modeCellKey);
      result.push({
        cellKey,
        mode,
        source: "loop_fill"
      });
    }
  }

  renderedContourFillCache.set(exploredCells, result);
  return result;
}

export function countExploredCellKeysInsideZone(zone: CachedZone, cellKeys: string[]) {
  const uniqueInside = new Set<string>();

  for (const cellKey of cellKeys) {
    if (isPointInsideZone(explorationCellKeyToCenterCoordinate(cellKey), zone)) {
      uniqueInside.add(cellKey);
    }
  }

  return uniqueInside.size;
}

export function getZoneBounds(zone: CachedZone) {
  return getGeometryBounds(zone.geometry);
}

function mapRelationToZone(
  element: OverpassRelationElement,
  fetchedAt: string
): CachedZone | null {
  const scope = getScopeFromAdminLevel(element.tags?.admin_level);
  const name = element.tags?.name ?? `Boundary ${element.id}`;

  if (!scope || !name) {
    return null;
  }

  const outerWays = getRelationWays(element, "outer");
  const innerWays = getRelationWays(element, "inner");
  const outerAssembly = assembleWaysIntoRings(outerWays);
  const innerAssembly = assembleWaysIntoRings(innerWays);
  const exactGeometry =
    outerAssembly.rings.length > 0 &&
    outerAssembly.unclosedWayCount === 0 &&
    innerAssembly.unclosedWayCount === 0;

  if (exactGeometry) {
    return {
      fetchedAt,
      geometry: outerAssembly.rings,
      holes: innerAssembly.rings,
      id: `relation/${element.id}`,
      name,
      parentZoneId: null,
      source: "openstreetmap",
      type: scope
    };
  }

  const fallbackGeometry = buildBoundsGeometry(element.bounds).length > 0
    ? buildBoundsGeometry(element.bounds)
    : buildFallbackBoundsGeometry([...outerWays, ...innerWays]);

  if (fallbackGeometry.length === 0) {
    return null;
  }

  return {
    fetchedAt,
    geometry: fallbackGeometry,
    holes: [],
    id: `relation/${element.id}`,
    name,
    parentZoneId: null,
    source: "openstreetmap_incomplete_fallback",
    type: scope
  };
}

function getScopeFromAdminLevel(adminLevel: string | undefined): CompletionScope | null {
  if (adminLevel === "2") {
    return "country";
  }

  if (adminLevel === "8") {
    return "city";
  }

  if (adminLevel === "9" || adminLevel === "10") {
    return "district";
  }

  return null;
}

function getRelationWays(
  element: OverpassRelationElement,
  role: "inner" | "outer"
) {
  return (element.members ?? [])
    .filter((member) =>
      member.type === "way" &&
      (role === "inner" ? member.role === "inner" : member.role !== "inner")
    )
    .map((member) => mapGeometryRing(member.geometry ?? []))
    .filter((way) => way.length >= 2);
}

function mapGeometryRing(points: OverpassGeometryPoint[]) {
  const coordinates = points.map((point) => ({
    latitude: point.lat,
    longitude: point.lon
  }));

  return coordinates.filter(
    (coordinate, index) => index === 0 || !isSameCoordinate(coordinate, coordinates[index - 1])
  );
}

export function assembleWaysIntoRings(ways: MapCoordinate[][]) {
  const remaining = ways.map((way) => [...way]);
  const rings: MapCoordinate[][] = [];
  let unclosedWayCount = 0;

  while (remaining.length > 0) {
    const seed = remaining.shift();

    if (!seed) {
      continue;
    }

    let ring = [...seed];
    let joinedWayCount = 1;
    let didExtend = true;

    while (!isRingClosed(ring) && didExtend) {
      didExtend = false;
      const start = ring[0];
      const end = ring.at(-1);
      const matchIndex = remaining.findIndex((candidate) => {
        const candidateStart = candidate[0];
        const candidateEnd = candidate.at(-1);

        return isSameCoordinate(candidateStart, end) ||
          isSameCoordinate(candidateEnd, end) ||
          isSameCoordinate(candidateEnd, start) ||
          isSameCoordinate(candidateStart, start);
      });

      if (matchIndex < 0 || !start || !end) {
        continue;
      }

      const match = remaining.splice(matchIndex, 1)[0];

      if (!match) {
        continue;
      }

      const matchStart = match[0];
      const matchEnd = match.at(-1);

      if (isSameCoordinate(matchStart, end)) {
        ring.push(...match.slice(1));
      } else if (isSameCoordinate(matchEnd, end)) {
        ring.push(...match.slice(0, -1).reverse());
      } else if (isSameCoordinate(matchEnd, start)) {
        ring = [...match.slice(0, -1), ...ring];
      } else if (isSameCoordinate(matchStart, start)) {
        ring = [...match.slice(1).reverse(), ...ring];
      }

      joinedWayCount += 1;
      didExtend = true;
    }

    if (isUsableRing(ring)) {
      rings.push(ring);
    } else {
      unclosedWayCount += joinedWayCount;
    }
  }

  return { rings, unclosedWayCount };
}

function isUsableRing(ring: MapCoordinate[]) {
  if (ring.length < 4 || !isRingClosed(ring)) {
    return false;
  }

  let doubledArea = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];

    if (current && next) {
      doubledArea += current.longitude * next.latitude - next.longitude * current.latitude;
    }
  }

  return Math.abs(doubledArea) > 1e-12;
}
function isRingClosed(ring: MapCoordinate[]) {
  const first = ring[0];
  const last = ring.at(-1);

  return Boolean(first && last && isSameCoordinate(first, last));
}

function isSameCoordinate(
  first: MapCoordinate | undefined,
  second: MapCoordinate | undefined
) {
  if (!first || !second) {
    return false;
  }

  return (
    Math.abs(first.latitude - second.latitude) < 0.000001 &&
    Math.abs(first.longitude - second.longitude) < 0.000001
  );
}

function buildFallbackBoundsGeometry(ways: MapCoordinate[][]) {
  const bounds = getGeometryBounds(ways);

  return buildBoundsGeometry(bounds);
}

function buildBoundsGeometry(bounds: {
  maxLatitude?: number;
  maxLongitude?: number;
  maxlat?: number;
  maxlon?: number;
  minLatitude?: number;
  minLongitude?: number;
  minlat?: number;
  minlon?: number;
} | null | undefined) {
  if (!bounds) {
    return [];
  }

  const minLatitude = bounds.minLatitude ?? bounds.minlat;
  const minLongitude = bounds.minLongitude ?? bounds.minlon;
  const maxLatitude = bounds.maxLatitude ?? bounds.maxlat;
  const maxLongitude = bounds.maxLongitude ?? bounds.maxlon;

  if (
    minLatitude === undefined ||
    minLongitude === undefined ||
    maxLatitude === undefined ||
    maxLongitude === undefined
  ) {
    return [];
  }

  return [[
    { latitude: minLatitude, longitude: minLongitude },
    { latitude: minLatitude, longitude: maxLongitude },
    { latitude: maxLatitude, longitude: maxLongitude },
    { latitude: maxLatitude, longitude: minLongitude },
    { latitude: minLatitude, longitude: minLongitude }
  ]];
}

async function calculateTotalZoneCells(zone: CachedZone, signal?: AbortSignal) {
  throwIfCompletionCancelled(signal);
  const geometryFingerprint = getZoneGeometryFingerprint(zone);
  const cachedTotal = await getCachedZoneTotal(zone.id, geometryFingerprint);

  throwIfCompletionCancelled(signal);

  if (cachedTotal !== null) {
    return cachedTotal;
  }

  const bounds = getGeometryBounds(zone.geometry);

  if (!bounds) {
    return null;
  }

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
  const estimatedCells = (maxX - minX + 1) * (maxY - minY + 1);

  if (estimatedCells > MAX_TOTAL_ZONE_CELLS_TO_SCAN) {
    return null;
  }

  let count = 0;
  let scannedCellCount = 0;

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      scannedCellCount += 1;

      if (scannedCellCount % COMPLETION_SCAN_YIELD_INTERVAL === 0) {
        throwIfCompletionCancelled(signal);
        await yieldToEventLoop();
      }

      const center = explorationCellKeyToCenterCoordinate(`${x}:${y}`);

      if (isPointInsideZone(center, zone)) {
        count += 1;
      }
    }
  }

  throwIfCompletionCancelled(signal);
  await saveCachedZoneTotal(zone.id, count, geometryFingerprint);

  return count;
}


function throwIfCompletionCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Zone completion calculation cancelled.");
  }
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function isPointInsideZone(point: MapCoordinate, zone: CachedZone) {
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(point, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(point, ring));

  return insideOuter && !insideHole;
}

function pointInPolygon(point: MapCoordinate, polygon: MapCoordinate[]) {
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
      current.latitude > point.latitude !== previous.latitude > point.latitude &&
      point.longitude <
        ((previous.longitude - current.longitude) * (point.latitude - current.latitude)) /
          (previous.latitude - current.latitude) +
          current.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getGeometryBounds(geometry: MapCoordinate[][]) {
  const points = geometry.flat();

  if (points.length === 0) {
    return null;
  }

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

function uniqueCellCount(cells: Array<{ cellKey: string; source?: ExploredCellSource }>) {
  return new Set(cells.map((cell) => cell.cellKey)).size;
}

function parseCellKey(cellKey: string) {
  const [x, y] = cellKey.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}
