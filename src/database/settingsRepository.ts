import { getDatabase } from "./db";
import { ActivityMode } from "../types/walk";
import { getCachedZoneById } from "./completionRepository";
import { AppLanguage } from "../i18n";

const LAST_ACTIVITY_MODE_KEY = "last_activity_mode";
const DEFAULT_ACTIVITY_MODE_KEY = "default_activity_mode";
const APP_LANGUAGE_KEY = "app_language";
const ACTIVE_RECORDING_SESSION_ID_KEY = "active_recording_session_id";
const ACTIVE_RECORDING_MODE_KEY = "active_recording_mode";
const COMPLETION_OBJECTIVE_KEY = "completion_objective";
const ACTIVITY_MODES: ActivityMode[] = ["walk", "wheel", "car"];
const APP_LANGUAGES: AppLanguage[] = ["en", "fr"];
const COMPLETION_MODES = ["walk", "wheel", "car", "all"] as const;
type CompletionMode = ActivityMode | "all";

export type SavedCompletionObjective = {
  mode: CompletionMode;
  zoneId: string;
};

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

export async function getDefaultActivityMode(): Promise<ActivityMode | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    DEFAULT_ACTIVITY_MODE_KEY
  );

  if (ACTIVITY_MODES.includes(row?.value as ActivityMode)) {
    return row?.value as ActivityMode;
  }

  return null;
}

export async function saveDefaultActivityMode(activityMode: ActivityMode) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    DEFAULT_ACTIVITY_MODE_KEY,
    activityMode
  );
}

export async function getAppLanguage(): Promise<AppLanguage> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    APP_LANGUAGE_KEY
  );

  if (APP_LANGUAGES.includes(row?.value as AppLanguage)) {
    return row?.value as AppLanguage;
  }

  return "en";
}

export async function saveAppLanguage(language: AppLanguage) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    APP_LANGUAGE_KEY,
    language
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

export async function getSavedCompletionObjective() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    COMPLETION_OBJECTIVE_KEY
  );

  if (!row?.value) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<SavedCompletionObjective>;

    if (
      typeof parsed.zoneId !== "string" ||
      !parsed.zoneId ||
      !COMPLETION_MODES.includes(parsed.mode as CompletionMode)
    ) {
      return null;
    }

    const zone = await getCachedZoneById(parsed.zoneId);

    if (!zone) {
      return null;
    }

    return {
      mode: parsed.mode as CompletionMode,
      zone
    };
  } catch {
    return null;
  }
}

export async function saveCompletionObjective(input: SavedCompletionObjective | null) {
  const db = await getDatabase();

  if (!input) {
    await db.runAsync("DELETE FROM app_settings WHERE key = ?", COMPLETION_OBJECTIVE_KEY);
    return;
  }

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    COMPLETION_OBJECTIVE_KEY,
    JSON.stringify(input)
  );
}
