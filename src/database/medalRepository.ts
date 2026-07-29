import { getDatabase } from "./db";
import { BUNDLED_MEDAL_ALBUMS, getBundledMedalAlbum } from "../data/medalAlbums";
import {
  CollectedMedal,
  MedalAcquisitionReason,
  MedalAlbumProgress,
  MedalCollectionCandidate,
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

export async function getMedalAlbumProgress(
  albumId: string
): Promise<MedalAlbumProgress | null> {
  const album = getBundledMedalAlbum(albumId);

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

export async function getAllMedalAlbumProgress() {
  const albums = await Promise.all(
    BUNDLED_MEDAL_ALBUMS.map((album) => getMedalAlbumProgress(album.id))
  );

  return albums.filter((album): album is MedalAlbumProgress => album !== null);
}

export async function getPendingMedalPresentations() {
  const albums = await getAllMedalAlbumProgress();

  return albums.flatMap((album) =>
    album.medals.filter((medal) => medal.presentationState === "pending")
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
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    RETRO_SCAN_SETTING_PREFIX + albumId
  );

  return Boolean(row?.value);
}

export async function markMedalRetroScanCompleted(albumId: string) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    RETRO_SCAN_SETTING_PREFIX + albumId,
    new Date().toISOString()
  );
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
