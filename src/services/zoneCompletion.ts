import {
  MapCoordinate,
  coordinateToExplorationCellKey,
  explorationCellKeyToCenterCoordinate
} from "./explorationArea";
import {
  CachedZone,
  CompletionScope,
  ExploredCellRecord,
  ExploredCellSource,
  getCachedZoneTotal,
  saveCachedZoneTotal
} from "../database/completionRepository";
import { GpsPoint } from "../types/walk";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const MAX_TOTAL_ZONE_CELLS_TO_SCAN = 350_000;

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
  completionPercent: number | null;
  directlyWalkedCells: number;
  exploredCells: number;
  inferredCells: number;
  loopFilledCells: number;
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
  const zones = relationElements
    .map((element) => mapRelationToZone(element, fetchedAt))
    .filter((zone): zone is CachedZone => Boolean(zone));

  return {
    rawElementCount: data.elements?.length ?? 0,
    relationCount: relationElements.length,
    usableZoneCount: zones.length,
    zones
  };
}

export async function calculateZoneCompletionStats(
  zone: CachedZone,
  exploredCells: ExploredCellRecord[]
): Promise<ZoneCompletionStats> {
  const exploredInside = exploredCells.filter((cell) =>
    isPointInsideZone(explorationCellKeyToCenterCoordinate(cell.cellKey), zone)
  );
  const uniqueExplored = uniqueCellCount(exploredInside);
  const directlyWalkedCells = uniqueCellCount(
    exploredInside.filter((cell) => cell.source === "gps")
  );
  const inferredCells = uniqueCellCount(exploredInside.filter((cell) => cell.source === "inferred"));
  const loopFilledCells = uniqueCellCount(exploredInside.filter((cell) => cell.source === "loop_fill"));
  const totalZoneCells = await calculateTotalZoneCells(zone);

  return {
    completionPercent:
      totalZoneCells && totalZoneCells > 0
        ? Math.min(100, Math.round((uniqueExplored / totalZoneCells) * 1000) / 10)
        : null,
    directlyWalkedCells,
    exploredCells: uniqueExplored,
    inferredCells,
    loopFilledCells,
    totalZoneCells
  };
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

function buildBoundaryQuery(latitude: number, longitude: number) {
  return `
    [out:json][timeout:35];
    is_in(${latitude},${longitude})->.containingAreas;
    area.containingAreas
      ["boundary"="administrative"]
      ["admin_level"~"^(2|8|9|10)$"]->.matchedContainingAreas;
    (
      rel(pivot.matchedContainingAreas);
      rel(around:3500,${latitude},${longitude})
        ["boundary"="administrative"]
        ["admin_level"~"^(8|9|10)$"];
    );
    out tags geom;
  `;
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

  const geometry = extractRelationGeometry(element);

  if (geometry.length === 0) {
    const fallbackGeometry = buildBoundsGeometry(element.bounds);

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
      source: "openstreetmap_bounds_fallback",
      type: scope
    };
  }

  return {
    fetchedAt,
    geometry,
    holes: extractRelationHoles(element),
    id: `relation/${element.id}`,
    name,
    parentZoneId: null,
    source: "openstreetmap",
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

function extractRelationGeometry(element: OverpassRelationElement) {
  const ways = (element.members ?? [])
    .filter((member) => member.type === "way" && member.role !== "inner")
    .map((member) => mapGeometryRing(member.geometry ?? []))
    .filter((ring) => ring.length >= 2);
  const rings = assembleWaysIntoRings(ways).filter((ring) => ring.length >= 4);

  if (rings.length > 0) {
    return rings;
  }

  return buildFallbackBoundsGeometry(ways);
}

function extractRelationHoles(element: OverpassRelationElement) {
  const ways = (element.members ?? [])
    .filter((member) => member.type === "way" && member.role === "inner")
    .map((member) => mapGeometryRing(member.geometry ?? []))
    .filter((ring) => ring.length >= 2);

  return assembleWaysIntoRings(ways).filter((ring) => ring.length >= 4);
}

function mapGeometryRing(points: OverpassGeometryPoint[]) {
  return points.map((point) => ({
    latitude: point.lat,
    longitude: point.lon
  }));
}

function assembleWaysIntoRings(ways: MapCoordinate[][]) {
  const remaining = [...ways];
  const rings: MapCoordinate[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();

    if (!seed) {
      continue;
    }

    const ring = [...seed];
    let didExtend = true;

    while (!isRingClosed(ring) && didExtend) {
      didExtend = false;
      const end = ring.at(-1);

      if (!end) {
        break;
      }

      const matchIndex = remaining.findIndex((candidate) =>
        isSameCoordinate(candidate[0], end) || isSameCoordinate(candidate.at(-1), end)
      );

      if (matchIndex < 0) {
        continue;
      }

      const match = remaining.splice(matchIndex, 1)[0];

      if (!match) {
        continue;
      }

      const oriented = isSameCoordinate(match[0], end) ? match.slice(1) : match.slice(0, -1).reverse();
      ring.push(...oriented);
      didExtend = true;
    }

    if (isRingClosed(ring)) {
      rings.push(ring);
    }
  }

  return rings;
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

async function calculateTotalZoneCells(zone: CachedZone) {
  const cachedTotal = await getCachedZoneTotal(zone.id);

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

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const center = explorationCellKeyToCenterCoordinate(`${x}:${y}`);

      if (isPointInsideZone(center, zone)) {
        count += 1;
      }
    }
  }

  await saveCachedZoneTotal(zone.id, count);

  return count;
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
