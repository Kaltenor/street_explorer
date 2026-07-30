import { OsmStreetSegment } from "../types/street";
import { GpsPoint } from "../types/walk";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_FETCH_RADIUS_METERS = 650;
const MAX_SEGMENT_LENGTH_METERS = 35;
const OVERPASS_TIMEOUT_MS = 35_000;
const EXCLUDED_HIGHWAYS = [
  "bus_stop",
  "construction",
  "corridor",
  "elevator",
  "escape",
  "platform",
  "proposed",
  "raceway",
  "services",
  "steps"
];

type StreetCenter = Pick<GpsPoint, "latitude" | "longitude">;

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassWayElement = {
  geometry?: OverpassGeometryPoint[];
  id: number;
  tags?: {
    access?: string;
    bridge?: string;
    foot?: string;
    highway?: string;
    layer?: string;
    name?: string;
    tunnel?: string;
  };
  type: "way";
};

type OverpassResponse = {
  elements?: OverpassWayElement[];
};

export async function fetchNearbyOsmStreetSegments(
  center: StreetCenter,
  radiusMeters = DEFAULT_FETCH_RADIUS_METERS
) {
  const data = await fetchOverpass(buildOverpassQuery(center.latitude, center.longitude, radiusMeters));
  const fetchedAt = new Date().toISOString();

  return (data.elements ?? [])
    .filter((element) => element.type === "way")
    .flatMap((element) => mapOverpassWay(element, center, radiusMeters, fetchedAt));
}

export async function fetchOsmStreetSegmentsForCorridors(
  corridors: StreetCenter[][],
  radiusMeters = DEFAULT_FETCH_RADIUS_METERS
) {
  const usableCorridors = sanitizeCorridors(corridors);

  if (usableCorridors.length === 0) {
    return [];
  }

  const data = await fetchOverpass(buildCorridorOverpassQuery(usableCorridors, radiusMeters));
  const fetchedAt = new Date().toISOString();

  return (data.elements ?? [])
    .filter((element) => element.type === "way")
    .flatMap((element) =>
      mapOverpassWayForCorridors(element, usableCorridors, radiusMeters, fetchedAt)
    );
}

async function fetchOverpass(query: string) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OVERPASS_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(OVERPASS_ENDPOINT, {
      body: query,
      headers: {
        "Content-Type": "text/plain"
      },
      method: "POST",
      signal: abortController.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OpenStreetMap street refresh timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status}`);
  }

  return (await response.json()) as OverpassResponse;
}

function buildOverpassQuery(latitude: number, longitude: number, radiusMeters: number) {
  return `
    [out:json][timeout:25];
    way(around:${Math.round(radiusMeters)},${latitude},${longitude})
      ["highway"]
      ["highway"!~"^(${EXCLUDED_HIGHWAYS.join("|")})$"];
    out geom;
  `;
}

function buildCorridorOverpassQuery(corridors: StreetCenter[][], radiusMeters: number) {
  const searches = corridors.map((corridor) => {
    const coordinates = corridor.flatMap((center) => [center.latitude, center.longitude]).join(",");

    return `
      way(around:${Math.round(radiusMeters)},${coordinates})
        ["highway"]
        ["highway"!~"^(${EXCLUDED_HIGHWAYS.join("|")})$"];`;
  }).join("");

  return `
    [out:json][timeout:25];
    (${searches}
    );
    out geom;
  `;
}
function mapOverpassWay(
  element: OverpassWayElement,
  center: StreetCenter,
  radiusMeters: number,
  fetchedAt: string
): OsmStreetSegment[] {
  const coordinates = getWayCoordinates(element);

  if (coordinates.length < 2 || !element.tags?.highway) {
    return [];
  }

  return splitWayIntoStableLocalSegments(coordinates, center, radiusMeters).map((segment) =>
    buildStreetSegment({
      ...getTopologyMetadata(element),
      coordinates: segment.coordinates,
      fetchedAt,
      highway: element.tags?.highway ?? "road",
      id: `way/${element.id}/part/${segment.partIndex}`,
      name: element.tags?.name ?? null
    })
  );
}

function mapOverpassWayForCorridors(
  element: OverpassWayElement,
  corridors: StreetCenter[][],
  radiusMeters: number,
  fetchedAt: string
): OsmStreetSegment[] {
  const coordinates = getWayCoordinates(element);

  if (coordinates.length < 2 || !element.tags?.highway) {
    return [];
  }

  return splitWayIntoStableCorridorSegments(coordinates, corridors, radiusMeters).map((segment) =>
    buildStreetSegment({
      ...getTopologyMetadata(element),
      coordinates: segment.coordinates,
      fetchedAt,
      highway: element.tags?.highway ?? "road",
      id: `way/${element.id}/part/${segment.partIndex}`,
      name: element.tags?.name ?? null
    })
  );
}

function getWayCoordinates(element: OverpassWayElement) {
  return element.geometry?.map((point) => ({
    latitude: point.lat,
    longitude: point.lon
  })) ?? [];
}

export function splitWayIntoStableLocalSegments(
  coordinates: StreetCenter[],
  center: StreetCenter,
  radiusMeters: number
) {
  return splitWayIntoStableSegments(
    coordinates,
    (midpoint) => haversineDistanceMeters(center, midpoint) <= radiusMeters
  );
}

export function splitWayIntoStableCorridorSegments(
  coordinates: StreetCenter[],
  corridors: StreetCenter[][],
  radiusMeters: number
) {
  return splitWayIntoStableSegments(
    coordinates,
    (midpoint) => corridors.some((corridor) =>
      distanceToCorridorMeters(midpoint, corridor) <= radiusMeters
    )
  );
}

function splitWayIntoStableSegments(
  coordinates: StreetCenter[],
  includesMidpoint: (midpoint: StreetCenter) => boolean
) {
  const segments: {
    coordinates: StreetCenter[];
    partIndex: number;
  }[] = [];
  let partIndex = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];

    if (!from || !to) {
      continue;
    }

    const distanceMeters = haversineDistanceMeters(from, to);
    const splitCount = Math.max(1, Math.ceil(distanceMeters / MAX_SEGMENT_LENGTH_METERS));

    for (let splitIndex = 0; splitIndex < splitCount; splitIndex += 1) {
      const start = interpolateCoordinate(from, to, splitIndex / splitCount);
      const end = interpolateCoordinate(from, to, (splitIndex + 1) / splitCount);
      const midpoint = interpolateCoordinate(start, end, 0.5);

      if (includesMidpoint(midpoint)) {
        segments.push({ coordinates: [start, end], partIndex });
      }

      // Advance even outside the requested corridor. The identity must depend on
      // full OSM way geometry, never on which coverage request returned the part.
      partIndex += 1;
    }
  }

  return segments;
}

function sanitizeCorridors(corridors: StreetCenter[][]) {
  return corridors
    .map((corridor) => corridor.filter((center, index) => {
      const previous = corridor[index - 1];
      return !previous || previous.latitude !== center.latitude || previous.longitude !== center.longitude;
    }))
    .filter((corridor) => corridor.length > 0);
}

function distanceToCorridorMeters(point: StreetCenter, corridor: StreetCenter[]) {
  if (corridor.length === 1 && corridor[0]) {
    return haversineDistanceMeters(point, corridor[0]);
  }

  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < corridor.length; index += 1) {
    const from = corridor[index - 1];
    const to = corridor[index];

    if (!from || !to) {
      continue;
    }

    minimumDistance = Math.min(minimumDistance, distanceToSegmentMeters(point, from, to));
  }

  return minimumDistance;
}

function distanceToSegmentMeters(point: StreetCenter, from: StreetCenter, to: StreetCenter) {
  const latitudeRadians = (point.latitude * Math.PI) / 180;
  const longitudeScale = Math.max(1, 111_320 * Math.cos(latitudeRadians));
  const fromX = (from.longitude - point.longitude) * longitudeScale;
  const fromY = (from.latitude - point.latitude) * 111_320;
  const toX = (to.longitude - point.longitude) * longitudeScale;
  const toY = (to.latitude - point.latitude) * 111_320;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const progress = lengthSquared > 0
    ? Math.max(0, Math.min(1, -(fromX * deltaX + fromY * deltaY) / lengthSquared))
    : 0;
  const projectedX = fromX + deltaX * progress;
  const projectedY = fromY + deltaY * progress;

  return Math.sqrt(projectedX * projectedX + projectedY * projectedY);
}
function getTopologyMetadata(element: OverpassWayElement) {
  const bridge = isTruthyOsmTag(element.tags?.bridge);
  const tunnel = isTruthyOsmTag(element.tags?.tunnel);
  const parsedLayer = Number(element.tags?.layer);

  return {
    access: element.tags?.access ?? null,
    bridge,
    foot: element.tags?.foot ?? null,
    layer: Number.isFinite(parsedLayer) ? parsedLayer : bridge ? 1 : tunnel ? -1 : 0,
    tunnel
  };
}

function isTruthyOsmTag(value: string | undefined) {
  return value === "yes" || value === "true" || value === "1";
}

function buildStreetSegment(input: {
  access: string | null;
  bridge: boolean;
  coordinates: StreetCenter[];
  fetchedAt: string;
  foot: string | null;
  highway: string;
  id: string;
  layer: number;
  name: string | null;
  tunnel: boolean;
}): OsmStreetSegment {
  const latitudes = input.coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = input.coordinates.map((coordinate) => coordinate.longitude);

  return {
    access: input.access,
    bridge: input.bridge,
    coordinates: input.coordinates,
    fetchedAt: input.fetchedAt,
    foot: input.foot,
    highway: input.highway,
    id: input.id,
    layer: input.layer,
    maxLatitude: Math.max(...latitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    minLongitude: Math.min(...longitudes),
    name: input.name,
    tunnel: input.tunnel
  };
}

function interpolateCoordinate(from: StreetCenter, to: StreetCenter, progress: number) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress
  };
}

function haversineDistanceMeters(from: StreetCenter, to: StreetCenter) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}