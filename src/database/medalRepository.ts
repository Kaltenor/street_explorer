import { getDatabase } from "./db";
import { getMedalAlbumDefinition } from "../services/medalCountryPackStore";
import {
  CollectedMedal,
  CollectedMedalCity,
  LocalizedMedalText,
  MedalAcquisitionReason,
  MedalAlbumProgress,
  MedalCollectionCandidate,
  MedalExternalIdentity,
  MedalPresentationState
} from "../types/medal";

type CollectedMedalRow = {
  album_id: string;
  medal_id: string;
  acquired_at: string;
  enclosure_area_m2: number;
  enclosure_id: string;
  presentation_state: MedalPresentationState;
  reason: MedalAcquisitionReason;
  session_id: number | null;
};

const RETRO_SCAN_SETTING_PREFIX = "medal_retro_scan:";
const RECORDING_REPAIR_SETTING_KEY = "medal_recording_repair:gameplay-v2";

type MedalCoordinateRow = {
  acquired_at?: string;
  latitude: number;
  longitude: number;
  medal_id: string;
};

type CollectedMedalCityRow = CollectedMedalRow & {
  category: CollectedMedal["category"];
  city_name_json: string;
  description_json: string;
  external_id: string | number;
  external_source: MedalExternalIdentity["source"];
  external_type: MedalExternalIdentity["type"];
  latitude: number;
  longitude: number;
  name_json: string;
  source_attribution: string;
};

type MedalRetroScanCursor = {
  albumVersion: number;
  completedAt: string;
  lastSessionId: number;
};

export async function ensureMedalAlbumSeeded(albumId: string) {
  const album = await getMedalAlbumDefinition(albumId);

  if (!album) {
    return null;
  }

  const db = await getDatabase();
  const existing = await db.getFirstAsync<{
    city_zone_id: string | null;
    definition_version: number;
    min_latitude: number | null;
  }>(
    `SELECT definition_version, city_zone_id, min_latitude
    FROM medal_albums WHERE id = ?`,
    album.id
  );

  if (
    existing?.definition_version === album.version &&
    existing.city_zone_id === album.cityZoneId &&
    existing.min_latitude !== null
  ) {
    return album;
  }

  const latitudes = album.medals.map((medal) => medal.latitude);
  const longitudes = album.medals.map((medal) => medal.longitude);

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO medal_albums (
        id, city_id, city_zone_id, city_name_json, definition_version, published_at,
        source_attribution, min_latitude, max_latitude, min_longitude, max_longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        city_id = excluded.city_id,
        city_zone_id = excluded.city_zone_id,
        city_name_json = excluded.city_name_json,
        definition_version = excluded.definition_version,
        published_at = excluded.published_at,
        source_attribution = excluded.source_attribution,
        min_latitude = excluded.min_latitude,
        max_latitude = excluded.max_latitude,
        min_longitude = excluded.min_longitude,
        max_longitude = excluded.max_longitude`,
      album.id,
      album.cityId,
      album.cityZoneId,
      JSON.stringify(album.cityName),
      album.version,
      album.publishedAt,
      album.sourceAttribution,
      Math.min(...latitudes),
      Math.max(...latitudes),
      Math.min(...longitudes),
      Math.max(...longitudes)
    );
    await transaction.runAsync(
      "DELETE FROM medal_album_items WHERE album_id = ?",
      album.id
    );

    for (let index = 0; index < album.medals.length; index += 1) {
      const medal = album.medals[index];

      if (!medal) {
        continue;
      }

      await transaction.runAsync(
        `INSERT INTO medals (
          id, category, name_json, description_json, latitude, longitude,
          external_source, external_type, external_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category = excluded.category,
          name_json = excluded.name_json,
          description_json = excluded.description_json,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          external_source = excluded.external_source,
          external_type = excluded.external_type,
          external_id = excluded.external_id`,
        medal.id,
        medal.category,
        JSON.stringify(medal.name),
        JSON.stringify(medal.description),
        medal.latitude,
        medal.longitude,
        medal.externalIdentity.source,
        medal.externalIdentity.type,
        String(medal.externalIdentity.id)
      );
      await transaction.runAsync(
        `INSERT INTO medal_album_items (album_id, medal_id, sort_order)
        VALUES (?, ?, ?)`,
        album.id,
        medal.id,
        index
      );
    }
  });

  return album;
}

export async function getMedalAlbumProgress(
  albumId: string
): Promise<MedalAlbumProgress | null> {
  const album = await ensureMedalAlbumSeeded(albumId);

  if (!album) {
    return null;
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<CollectedMedalRow>(
    `SELECT
      collected_medals.album_id,
      collected_medals.medal_id,
      collected_medals.presentation_state,
      medal_acquisition_events.acquired_at,
      medal_acquisition_events.enclosure_area_m2,
      medal_acquisition_events.enclosure_id,
      medal_acquisition_events.reason,
      medal_acquisition_events.session_id
    FROM collected_medals
    JOIN medal_acquisition_events
      ON medal_acquisition_events.id = collected_medals.acquisition_event_id
    WHERE collected_medals.album_id = ?`,
    albumId
  );
  const collectedByMedalId = new Map(rows.map((row) => [row.medal_id, row]));
  const medals: CollectedMedal[] = album.medals.map((medal) => {
    const row = collectedByMedalId.get(medal.id);

    return {
      ...medal,
      albumId,
      collectedAt: row?.acquired_at ?? null,
      collectionReason: row?.reason ?? null,
      enclosureAreaSquareMeters: row?.enclosure_area_m2 ?? null,
      enclosureId: row?.enclosure_id ?? null,
      isCollected: Boolean(row),
      presentationState: row?.presentation_state ?? null,
      sessionId: row?.session_id ?? null
    };
  });

  return {
    album,
    collectedCount: rows.length,
    medals
  };
}

export async function getCollectedMedalCities(): Promise<CollectedMedalCity[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CollectedMedalCityRow>(`
    SELECT
      collected_medals.album_id,
      collected_medals.medal_id,
      collected_medals.presentation_state,
      medal_albums.city_name_json,
      medal_albums.source_attribution,
      medals.category,
      medals.name_json,
      medals.description_json,
      medals.latitude,
      medals.longitude,
      medals.external_source,
      medals.external_type,
      medals.external_id,
      medal_acquisition_events.acquired_at,
      medal_acquisition_events.enclosure_area_m2,
      medal_acquisition_events.enclosure_id,
      medal_acquisition_events.reason,
      medal_acquisition_events.session_id
    FROM collected_medals
    JOIN medal_albums ON medal_albums.id = collected_medals.album_id
    JOIN medals ON medals.id = collected_medals.medal_id
    JOIN medal_acquisition_events
      ON medal_acquisition_events.id = collected_medals.acquisition_event_id
    ORDER BY medal_albums.city_name_json, medal_acquisition_events.acquired_at DESC
  `);
  const cities = new Map<string, CollectedMedalCity>();

  for (const row of rows) {
    let city = cities.get(row.album_id);

    if (!city) {
      city = {
        albumId: row.album_id,
        cityName: JSON.parse(row.city_name_json) as LocalizedMedalText,
        medals: [],
        sourceAttribution: row.source_attribution
      };
      cities.set(row.album_id, city);
    }

    city.medals.push({
      albumId: row.album_id,
      category: row.category,
      collectedAt: row.acquired_at,
      collectionReason: row.reason,
      description: JSON.parse(row.description_json) as LocalizedMedalText,
      enclosureAreaSquareMeters: row.enclosure_area_m2,
      enclosureId: row.enclosure_id,
      externalIdentity: {
        id: row.external_id,
        source: row.external_source,
        type: row.external_type
      },
      id: row.medal_id,
      isCollected: true,
      latitude: row.latitude,
      longitude: row.longitude,
      name: JSON.parse(row.name_json) as LocalizedMedalText,
      presentationState: row.presentation_state,
      sessionId: row.session_id
    });
  }

  return [...cities.values()];
}

export async function getPendingMedalPresentations() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ album_id: string }>(
    `SELECT DISTINCT album_id FROM collected_medals
    WHERE presentation_state = 'pending'`
  );
  const albums = await Promise.all(
    rows.map(async (row) => {
      try {
        return await getMedalAlbumProgress(row.album_id);
      } catch (error) {
        console.warn(
          `Pending medal album ${row.album_id} is not available yet`,
          error
        );
        return null;
      }
    })
  );

  return albums.flatMap((album) =>
    album?.medals.filter((medal) => medal.presentationState === "pending") ?? []
  );
}

export async function getUncollectedMedalsInBounds(
  albumId: string,
  bounds: {
    maxLatitude: number;
    maxLongitude: number;
    minLatitude: number;
    minLongitude: number;
  }
) {
  const album = await ensureMedalAlbumSeeded(albumId);

  if (!album) {
    return [];
  }

  const db = await getDatabase();
  return db.getAllAsync<MedalCoordinateRow>(
    `SELECT medals.id AS medal_id, medals.latitude, medals.longitude
    FROM medal_album_items
    JOIN medals ON medals.id = medal_album_items.medal_id
    LEFT JOIN collected_medals
      ON collected_medals.album_id = medal_album_items.album_id
      AND collected_medals.medal_id = medal_album_items.medal_id
    WHERE medal_album_items.album_id = ?
      AND collected_medals.medal_id IS NULL
      AND medals.latitude BETWEEN ? AND ?
      AND medals.longitude BETWEEN ? AND ?`,
    albumId,
    bounds.minLatitude,
    bounds.maxLatitude,
    bounds.minLongitude,
    bounds.maxLongitude
  );
}

export async function getCollectedMedalsSinceInBounds(
  albumId: string,
  since: string,
  bounds: {
    maxLatitude: number;
    maxLongitude: number;
    minLatitude: number;
    minLongitude: number;
  }
) {
  const album = await ensureMedalAlbumSeeded(albumId);

  if (!album) {
    return [];
  }

  const db = await getDatabase();
  return db.getAllAsync<MedalCoordinateRow & { acquired_at: string }>(
    `SELECT medals.id AS medal_id, medals.latitude, medals.longitude,
      medal_acquisition_events.acquired_at
    FROM medal_acquisition_events
    JOIN medals ON medals.id = medal_acquisition_events.medal_id
    WHERE medal_acquisition_events.album_id = ?
      AND medal_acquisition_events.acquired_at >= ?
      AND medals.latitude BETWEEN ? AND ?
      AND medals.longitude BETWEEN ? AND ?`,
    albumId,
    since,
    bounds.minLatitude,
    bounds.maxLatitude,
    bounds.minLongitude,
    bounds.maxLongitude
  );
}

export async function collectMedalCandidates(input: {
  candidates: MedalCollectionCandidate[];
  reason: MedalAcquisitionReason;
  sessionId: number | null;
}) {
  if (input.candidates.length === 0) {
    return [];
  }

  await Promise.all(
    [...new Set(input.candidates.map((candidate) => candidate.albumId))].map(
      ensureMedalAlbumSeeded
    )
  );
  const db = await getDatabase();
  const collectedIds: string[] = [];
  const acquiredAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const candidate of input.candidates) {
      const existing = await transaction.getFirstAsync<{ medal_id: string }>(
        `SELECT medal_id FROM collected_medals
        WHERE album_id = ? AND medal_id = ?`,
        candidate.albumId,
        candidate.medalId
      );

      if (existing) {
        continue;
      }

      const event = await transaction.runAsync(
        `INSERT INTO medal_acquisition_events (
          album_id, medal_id, session_id, reason, enclosure_id, anchor_cell_id,
          enclosure_area_m2, enclosure_cells_json, acquired_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        candidate.albumId,
        candidate.medalId,
        input.sessionId,
        input.reason,
        candidate.enclosureId,
        candidate.anchorCellId,
        candidate.enclosureAreaSquareMeters,
        JSON.stringify(candidate.enclosureCellIds),
        acquiredAt
      );
      const collected = await transaction.runAsync(
        `INSERT OR IGNORE INTO collected_medals (
          album_id, medal_id, acquisition_event_id, presentation_state
        ) VALUES (?, ?, ?, 'pending')`,
        candidate.albumId,
        candidate.medalId,
        event.lastInsertRowId
      );

      if (collected.changes > 0) {
        collectedIds.push(candidate.medalId);
      } else {
        await transaction.runAsync(
          "DELETE FROM medal_acquisition_events WHERE id = ?",
          event.lastInsertRowId
        );
      }
    }
  });

  if (collectedIds.length === 0) {
    return [];
  }

  const albumIds = [...new Set(input.candidates.map((candidate) => candidate.albumId))];
  const albums = await Promise.all(albumIds.map(getMedalAlbumProgress));
  const collectedIdSet = new Set(collectedIds);

  return albums.flatMap((album) =>
    album?.medals.filter((medal) => collectedIdSet.has(medal.id)) ?? []
  );
}

export async function markMedalPresentationState(
  albumId: string,
  medalId: string,
  state: MedalPresentationState
) {
  const db = await getDatabase();

  await db.runAsync(
    `UPDATE collected_medals
    SET presentation_state = ?,
        presented_at = CASE WHEN ? = 'presented' THEN ? ELSE presented_at END
    WHERE album_id = ? AND medal_id = ?`,
    state,
    state,
    new Date().toISOString(),
    albumId,
    medalId
  );
}

export async function hasCompletedMedalRecordingRepair() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    RECORDING_REPAIR_SETTING_KEY
  );

  return Boolean(row?.value);
}

export async function markMedalRecordingRepairCompleted() {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    RECORDING_REPAIR_SETTING_KEY,
    new Date().toISOString()
  );
}

export async function hasCompletedMedalRetroScan(albumId: string) {
  const album = await getMedalAlbumDefinition(albumId);

  if (!album) {
    return false;
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    RETRO_SCAN_SETTING_PREFIX + albumId
  );

  const cursor = parseMedalRetroScanCursor(row?.value);
  const latest = await db.getFirstAsync<{ latest_session_id: number | null }>(
    `SELECT MAX(id) AS latest_session_id FROM walk_sessions
    WHERE activity_mode = 'walk' AND ended_at > started_at`
  );

  return cursor?.albumVersion === album.version &&
    cursor.lastSessionId >= (latest?.latest_session_id ?? 0);
}

export async function getMedalRetroScanCursor(albumId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    RETRO_SCAN_SETTING_PREFIX + albumId
  );

  return parseMedalRetroScanCursor(row?.value);
}

export async function markMedalRetroScanCompleted(
  albumId: string,
  albumVersion: number,
  lastSessionId: number
) {
  const db = await getDatabase();
  const completedAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    RETRO_SCAN_SETTING_PREFIX + albumId,
    JSON.stringify({ albumVersion, completedAt, lastSessionId })
  );
}

function parseMedalRetroScanCursor(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MedalRetroScanCursor>;

    if (
      Number.isInteger(parsed.albumVersion) &&
      typeof parsed.completedAt === "string" &&
      Number.isInteger(parsed.lastSessionId)
    ) {
      return parsed as MedalRetroScanCursor;
    }
  } catch {
    // Legacy timestamp markers intentionally restart against the active album.
  }

  return null;
}

export async function clearAllCollectedMedals() {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync("DELETE FROM collected_medals");
    await transaction.runAsync("DELETE FROM medal_acquisition_events");
    await transaction.runAsync(
      "DELETE FROM app_settings WHERE key LIKE ?",
      RETRO_SCAN_SETTING_PREFIX + "%"
    );
    await transaction.runAsync(
      "DELETE FROM app_settings WHERE key = ?",
      RECORDING_REPAIR_SETTING_KEY
    );
  });
}
