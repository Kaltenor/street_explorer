import { OsmStreetSegment } from "../types/street";
import { GpsPoint } from "../types/walk";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_FETCH_RADIUS_METERS = 1200;
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
    .map((element) => mapOverpassWay(element, fetchedAt))
    .filter((segment): segment is OsmStreetSegment => Boolean(segment));
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
  fetchedAt: string
): OsmStreetSegment | null {
  const coordinates =
    element.geometry?.map((point) => ({
      latitude: point.lat,
      longitude: point.lon
    })) ?? [];

  if (coordinates.length < 2 || !element.tags?.highway) {
    return null;
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);

  return {
    coordinates,
    fetchedAt,
    highway: element.tags.highway,
    id: `way/${element.id}`,
    maxLatitude: Math.max(...latitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    minLongitude: Math.min(...longitudes),
    name: element.tags.name ?? null
  };
}
