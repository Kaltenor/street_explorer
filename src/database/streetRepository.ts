import { getDatabase } from "./db";
import { OsmStreetSegment } from "../types/street";

type OsmStreetSegmentRow = {
  id: string;
  name: string | null;
  highway: string;
  coordinates_json: string;
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
  fetched_at: string;
};

export async function upsertStreetSegments(segments: OsmStreetSegment[]) {
  if (segments.length === 0) {
    return;
  }

  const db = await getDatabase();
  const batchSize = 75;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (let offset = 0; offset < segments.length; offset += batchSize) {
      const batch = segments.slice(offset, offset + batchSize);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<number | string | null> = [];

      for (const segment of batch) {
        values.push(
          segment.id,
          segment.name,
          segment.highway,
          JSON.stringify(segment.coordinates),
          segment.minLatitude,
          segment.maxLatitude,
          segment.minLongitude,
          segment.maxLongitude,
          segment.fetchedAt
        );
      }

      await transaction.runAsync(
        "INSERT INTO osm_street_segments (" +
          "id, name, highway, coordinates_json, min_latitude, max_latitude, " +
          "min_longitude, max_longitude, fetched_at" +
          ") VALUES " +
          placeholders +
          " ON CONFLICT(id) DO UPDATE SET " +
          "name = excluded.name, " +
          "highway = excluded.highway, " +
          "coordinates_json = excluded.coordinates_json, " +
          "min_latitude = excluded.min_latitude, " +
          "max_latitude = excluded.max_latitude, " +
          "min_longitude = excluded.min_longitude, " +
          "max_longitude = excluded.max_longitude, " +
          "fetched_at = excluded.fetched_at",
        values
      );
    }
  });
}
export async function getStreetSegmentsNear(
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<OsmStreetSegment[]> {
  const db = await getDatabase();
  const latitudeDelta = metersToLatitudeDelta(radiusMeters);
  const longitudeDelta = metersToLongitudeDelta(radiusMeters, latitude);
  const rows = await db.getAllAsync<OsmStreetSegmentRow>(
    `
      SELECT
        id,
        name,
        highway,
        coordinates_json,
        min_latitude,
        max_latitude,
        min_longitude,
        max_longitude,
        fetched_at
      FROM osm_street_segments
      WHERE max_latitude >= ?
        AND min_latitude <= ?
        AND max_longitude >= ?
        AND min_longitude <= ?
        AND id LIKE 'way/%/part/%'
      ORDER BY name IS NULL, name, id
    `,
    latitude - latitudeDelta,
    latitude + latitudeDelta,
    longitude - longitudeDelta,
    longitude + longitudeDelta
  );

  return rows.map(mapStreetSegmentRow);
}

export async function deleteAllStreetSegments() {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM osm_street_segments");
}

function mapStreetSegmentRow(row: OsmStreetSegmentRow): OsmStreetSegment {
  return {
    coordinates: JSON.parse(row.coordinates_json),
    fetchedAt: row.fetched_at,
    highway: row.highway,
    id: row.id,
    maxLatitude: row.max_latitude,
    maxLongitude: row.max_longitude,
    minLatitude: row.min_latitude,
    minLongitude: row.min_longitude,
    name: row.name
  };
}

function metersToLatitudeDelta(meters: number) {
  return meters / 111_320;
}

function metersToLongitudeDelta(meters: number, latitude: number) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const metersPerDegree = Math.max(1, 111_320 * Math.cos(latitudeRadians));

  return meters / metersPerDegree;
}
