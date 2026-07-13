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

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassWayElement = {
  geometry?: OverpassGeometryPoint[];
  id: number;
  tags?: {
    highway?: string;
    name?: string;
  };
  type: "way";
};

type OverpassResponse = {
  elements?: OverpassWayElement[];
};

export async function fetchNearbyOsmStreetSegments(
  center: Pick<GpsPoint, "latitude" | "longitude">,
  radiusMeters = DEFAULT_FETCH_RADIUS_METERS
) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), OVERPASS_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(OVERPASS_ENDPOINT, {
      body: buildOverpassQuery(center.latitude, center.longitude, radiusMeters),
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

  const data = (await response.json()) as OverpassResponse;
  const fetchedAt = new Date().toISOString();

  return (data.elements ?? [])
    .filter((element) => element.type === "way")
    .flatMap((element) => mapOverpassWay(element, center, radiusMeters, fetchedAt));
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

function mapOverpassWay(
  element: OverpassWayElement,
  center: Pick<GpsPoint, "latitude" | "longitude">,
  radiusMeters: number,
  fetchedAt: string
): OsmStreetSegment[] {
  const coordinates =
    element.geometry?.map((point) => ({
      latitude: point.lat,
      longitude: point.lon
    })) ?? [];

  if (coordinates.length < 2 || !element.tags?.highway) {
    return [];
  }

  return splitWayIntoStableLocalSegments(coordinates, center, radiusMeters).map((segment) =>
    buildStreetSegment({
      coordinates: segment.coordinates,
      fetchedAt,
      highway: element.tags?.highway ?? "road",
      id: `way/${element.id}/part/${segment.partIndex}`,
      name: element.tags?.name ?? null
    })
  );
}

export function splitWayIntoStableLocalSegments(
  coordinates: Pick<GpsPoint, "latitude" | "longitude">[],
  center: Pick<GpsPoint, "latitude" | "longitude">,
  radiusMeters: number
) {
  const segments: {
    coordinates: Pick<GpsPoint, "latitude" | "longitude">[];
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

      if (haversineDistanceMeters(center, midpoint) <= radiusMeters) {
        segments.push({ coordinates: [start, end], partIndex });
      }

      // Advance even when this fetch window excludes the part. The identity must
      // depend on the OSM way geometry, never on which nearby fetch returned it.
      partIndex += 1;
    }
  }

  return segments;
}

function buildStreetSegment(input: {
  coordinates: Pick<GpsPoint, "latitude" | "longitude">[];
  fetchedAt: string;
  highway: string;
  id: string;
  name: string | null;
}): OsmStreetSegment {
  const latitudes = input.coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = input.coordinates.map((coordinate) => coordinate.longitude);

  return {
    coordinates: input.coordinates,
    fetchedAt: input.fetchedAt,
    highway: input.highway,
    id: input.id,
    maxLatitude: Math.max(...latitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    minLongitude: Math.min(...longitudes),
    name: input.name
  };
}

function interpolateCoordinate(
  from: Pick<GpsPoint, "latitude" | "longitude">,
  to: Pick<GpsPoint, "latitude" | "longitude">,
  progress: number
) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress
  };
}

function haversineDistanceMeters(
  from: Pick<GpsPoint, "latitude" | "longitude">,
  to: Pick<GpsPoint, "latitude" | "longitude">
) {
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
