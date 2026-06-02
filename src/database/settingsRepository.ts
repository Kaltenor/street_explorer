import { getDatabase } from "./db";
import { ActivityMode } from "../types/walk";

const LAST_ACTIVITY_MODE_KEY = "last_activity_mode";
const ACTIVE_RECORDING_SESSION_ID_KEY = "active_recording_session_id";
const ACTIVE_RECORDING_MODE_KEY = "active_recording_mode";
const ACTIVITY_MODES: ActivityMode[] = ["walk", "wheel", "car"];

export async function getLastActivityMode(): Promise<ActivityMode | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    LAST_ACTIVITY_MODE_KEY
  );

  if (ACTIVITY_MODES.includes(row?.value as ActivityMode)) {
    return row?.value as ActivityMode;
  }

  return null;
}

export async function saveLastActivityMode(activityMode: ActivityMode) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    LAST_ACTIVITY_MODE_KEY,
    activityMode
  );
}

export type ActiveRecordingSettings = {
  activityMode: ActivityMode;
  sessionId: number;
};

export async function getActiveRecordingSettings(): Promise<ActiveRecordingSettings | null> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
    ACTIVE_RECORDING_SESSION_ID_KEY,
    ACTIVE_RECORDING_MODE_KEY
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const sessionId = Number(values[ACTIVE_RECORDING_SESSION_ID_KEY]);
  const activityMode = values[ACTIVE_RECORDING_MODE_KEY] as ActivityMode | undefined;

  if (!Number.isFinite(sessionId) || !activityMode || !ACTIVITY_MODES.includes(activityMode)) {
    return null;
  }

  return {
    activityMode,
    sessionId
  };
}

export async function saveActiveRecordingSettings(input: ActiveRecordingSettings) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    ACTIVE_RECORDING_SESSION_ID_KEY,
    input.sessionId.toString()
  );
  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    ACTIVE_RECORDING_MODE_KEY,
    input.activityMode
  );
}

export async function clearActiveRecordingSettings() {
  const db = await getDatabase();

  await db.runAsync(
    "DELETE FROM app_settings WHERE key IN (?, ?)",
    ACTIVE_RECORDING_SESSION_ID_KEY,
    ACTIVE_RECORDING_MODE_KEY
  );
}
