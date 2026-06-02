import { OsmStreetSegment } from "../types/street";
import { GpsPoint } from "../types/walk";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_FETCH_RADIUS_METERS = 650;
const MAX_SEGMENT_LENGTH_METERS = 35;
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
  const response = await fetch(OVERPASS_ENDPOINT, {
    body: buildOverpassQuery(center.latitude, center.longitude, radiusMeters),
    headers: {
      "Content-Type": "text/plain"
    },
    method: "POST"
  });

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

  return splitWayIntoLocalSegments(coordinates, center, radiusMeters).map((segment, index) =>
    buildStreetSegment({
      coordinates: segment,
      fetchedAt,
      highway: element.tags?.highway ?? "road",
      id: `way/${element.id}/part/${index}`,
      name: element.tags?.name ?? null
    })
  );
}

function splitWayIntoLocalSegments(
  coordinates: Pick<GpsPoint, "latitude" | "longitude">[],
  center: Pick<GpsPoint, "latitude" | "longitude">,
  radiusMeters: number
) {
  const segments: Pick<GpsPoint, "latitude" | "longitude">[][] = [];

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
        segments.push([start, end]);
      }
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
