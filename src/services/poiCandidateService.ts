import { getDatabase } from "../database/db";
import { MedalCategory } from "../types/medal";

export type PoiCandidateBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type PoiCandidate = {
  category: MedalCategory;
  externalId: number;
  externalType: "node" | "relation" | "way";
  latitude: number;
  longitude: number;
  name: string;
  tags: Record<string, string>;
};

type OverpassElement = {
  center?: { lat?: number; lon?: number };
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  type?: "node" | "relation" | "way";
};

const LYON_REVIEW_BOUNDS: PoiCandidateBounds = {
  south: 45.70,
  west: 4.75,
  north: 45.83,
  east: 4.95
};

const ALLOWED_TOURISM = new Set(["artwork", "attraction", "gallery", "museum", "viewpoint"]);
const ALLOWED_HISTORIC = new Set([
  "archaeological_site", "castle", "city_gate", "fort", "monument", "ruins", "tower"
]);
const ALLOWED_LEISURE = new Set(["garden", "nature_reserve", "park"]);
const ALLOWED_AMENITY = new Set(["arts_centre", "place_of_worship", "theatre"]);

export async function fetchLyonPoiCandidates() {
  return fetchPoiCandidatesForReview("lyon-fr", LYON_REVIEW_BOUNDS);
}

export async function fetchPoiCandidatesForReview(
  cityId: string,
  bounds: PoiCandidateBounds
) {
  const db = await getDatabase();
  const requestedAt = new Date().toISOString();
  const fetchRow = await db.runAsync(
    `INSERT INTO poi_candidate_fetches (
      city_id, bounds_json, source, requested_at, status
    ) VALUES (?, ?, 'openstreetmap-overpass', ?, 'running')`,
    cityId,
    JSON.stringify(bounds),
    requestedAt
  );

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: buildCandidateQuery(bounds)
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap candidate request failed (${response.status}).`);
    }

    const payload = await response.json() as { elements?: OverpassElement[] };
    const candidates = (payload.elements ?? [])
      .map(toPoiCandidate)
      .filter((candidate): candidate is PoiCandidate => candidate !== null)
      .sort((left, right) => left.name.localeCompare(right.name));

    await db.withExclusiveTransactionAsync(async (transaction) => {
      for (const candidate of candidates) {
        await transaction.runAsync(
          `INSERT OR REPLACE INTO poi_candidates (
            fetch_id, external_type, external_id, name, category,
            latitude, longitude, tags_json, review_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed')`,
          fetchRow.lastInsertRowId,
          candidate.externalType,
          candidate.externalId,
          candidate.name,
          candidate.category,
          candidate.latitude,
          candidate.longitude,
          JSON.stringify(candidate.tags)
        );
      }

      await transaction.runAsync(
        `UPDATE poi_candidate_fetches
        SET status = 'completed', completed_at = ?
        WHERE id = ?`,
        new Date().toISOString(),
        fetchRow.lastInsertRowId
      );
    });

    return {
      candidates,
      fetchId: fetchRow.lastInsertRowId
    };
  } catch (error) {
    await db.runAsync(
      `UPDATE poi_candidate_fetches
      SET status = 'failed', completed_at = ?, error_message = ?
      WHERE id = ?`,
      new Date().toISOString(),
      error instanceof Error ? error.message : "Unknown candidate fetch error",
      fetchRow.lastInsertRowId
    );
    throw error;
  }
}

export async function listPoiCandidatesForReview(fetchId: number) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    category: MedalCategory;
    external_id: number;
    external_type: PoiCandidate["externalType"];
    latitude: number;
    longitude: number;
    name: string;
    review_status: "approved" | "rejected" | "unreviewed";
    tags_json: string;
  }>(`
    SELECT external_type, external_id, name, category, latitude, longitude,
      tags_json, review_status
    FROM poi_candidates
    WHERE fetch_id = ?
    ORDER BY name
  `, fetchId);

  return rows.map((row) => ({
    category: row.category,
    externalId: row.external_id,
    externalType: row.external_type,
    latitude: row.latitude,
    longitude: row.longitude,
    name: row.name,
    reviewStatus: row.review_status,
    tags: parseTags(row.tags_json)
  }));
}

function buildCandidateQuery(bounds: PoiCandidateBounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  return `[out:json][timeout:45];(
    nwr["tourism"~"^(artwork|attraction|gallery|museum|viewpoint)$"](${bbox});
    nwr["historic"~"^(archaeological_site|castle|city_gate|fort|monument|ruins|tower)$"](${bbox});
    nwr["leisure"~"^(garden|nature_reserve|park)$"](${bbox});
    nwr["amenity"~"^(arts_centre|place_of_worship|theatre)$"](${bbox});
  );out center tags;`;
}

function toPoiCandidate(element: OverpassElement): PoiCandidate | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const category = classifyCandidate(tags);

  if (
    !name ||
    !element.id ||
    !element.type ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !category
  ) {
    return null;
  }

  return {
    category,
    externalId: element.id,
    externalType: element.type,
    latitude: latitude as number,
    longitude: longitude as number,
    name,
    tags
  };
}

function classifyCandidate(tags: Record<string, string>): MedalCategory | null {
  if (tags.leisure && ALLOWED_LEISURE.has(tags.leisure)) {
    return "nature";
  }

  if (tags.historic && ALLOWED_HISTORIC.has(tags.historic)) {
    return "history";
  }

  if (tags.tourism === "artwork" || tags.tourism === "gallery") {
    return "art";
  }

  if (tags.tourism && ALLOWED_TOURISM.has(tags.tourism)) {
    return "culture";
  }

  if (tags.amenity && ALLOWED_AMENITY.has(tags.amenity)) {
    return tags.amenity === "place_of_worship" ? "architecture" : "culture";
  }

  return null;
}

function parseTags(value: string) {
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    return {};
  }
}
