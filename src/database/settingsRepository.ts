import { getDatabase } from "./db";
import { ActivityMode, GpsPoint } from "../types/walk";
import { getCachedZoneById } from "./completionRepository";
import { AppLanguage } from "../i18n";
import { isOfficialDistrictAdminLevel } from "../services/zoneBoundaryPolicy";
import {
  APPEARANCE_MODES,
  AppearanceMode
} from "../constants/appearance";

const APP_LANGUAGE_KEY = "app_language";
const APPEARANCE_MODE_KEY = "appearance_mode";
const HAPTICS_ENABLED_KEY = "haptics_enabled";
const SOUND_ENABLED_KEY = "sound_enabled";
const ACTIVE_RECORDING_SESSION_ID_KEY = "active_recording_session_id";
const ACTIVE_RECORDING_MODE_KEY = "active_recording_mode";
const COMPLETION_OBJECTIVE_KEY = "completion_objective";
const LAST_PLAYER_LOCATION_KEY = "last_player_location";
const PLAYER_LOCATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const ACTIVITY_MODES: ActivityMode[] = ["walk"];
const APP_LANGUAGES: AppLanguage[] = ["en", "fr"];
const COMPLETION_MODES: ActivityMode[] = ["walk"];
type CompletionMode = ActivityMode;

export type SavedFeedbackPreferences = {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
};

export type SavedCompletionObjective = {
  mode: CompletionMode;
  zoneId: string;
};

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

export async function getAppearanceMode(): Promise<AppearanceMode> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    APPEARANCE_MODE_KEY
  );

  if (APPEARANCE_MODES.includes(row?.value as AppearanceMode)) {
    return row?.value as AppearanceMode;
  }

  return "explorator";
}

export async function saveAppearanceMode(mode: AppearanceMode) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    APPEARANCE_MODE_KEY,
    mode
  );
}

export async function getFeedbackPreferences(): Promise<SavedFeedbackPreferences> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
    HAPTICS_ENABLED_KEY,
    SOUND_ENABLED_KEY
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    hapticsEnabled: values[HAPTICS_ENABLED_KEY] !== "false",
    soundEnabled: values[SOUND_ENABLED_KEY] !== "false"
  };
}

async function saveBooleanSetting(key: string, enabled: boolean) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    key,
    String(enabled)
  );
}

export function saveHapticsEnabled(enabled: boolean) {
  return saveBooleanSetting(HAPTICS_ENABLED_KEY, enabled);
}

export function saveSoundEnabled(enabled: boolean) {
  return saveBooleanSetting(SOUND_ENABLED_KEY, enabled);
}

export async function getSavedPlayerLocation(): Promise<GpsPoint | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    LAST_PLAYER_LOCATION_KEY
  );

  if (!row?.value) {
    return null;
  }

  try {
    const point = JSON.parse(row.value) as Partial<GpsPoint>;
    const timestamp = new Date(point.timestamp ?? "").getTime();
    const hasValidAccuracy =
      point.accuracy === null ||
      (typeof point.accuracy === "number" &&
        Number.isFinite(point.accuracy) &&
        point.accuracy >= 0);

    if (
      typeof point.latitude !== "number" ||
      !Number.isFinite(point.latitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      typeof point.longitude !== "number" ||
      !Number.isFinite(point.longitude) ||
      point.longitude < -180 ||
      point.longitude > 180 ||
      !Number.isFinite(timestamp) ||
      timestamp > Date.now() + PLAYER_LOCATION_FUTURE_TOLERANCE_MS ||
      !hasValidAccuracy
    ) {
      return null;
    }

    return {
      accuracy: point.accuracy ?? null,
      heading:
        typeof point.heading === "number" && Number.isFinite(point.heading)
          ? point.heading
          : null,
      latitude: point.latitude,
      longitude: point.longitude,
      pointIndex: 0,
      speedMetersPerSecond:
        typeof point.speedMetersPerSecond === "number" &&
        Number.isFinite(point.speedMetersPerSecond)
          ? point.speedMetersPerSecond
          : null,
      timestamp: new Date(timestamp).toISOString()
    };
  } catch {
    return null;
  }
}

export async function savePlayerLocation(point: GpsPoint) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    LAST_PLAYER_LOCATION_KEY,
    JSON.stringify({
      accuracy: point.accuracy,
      heading: point.heading ?? null,
      latitude: point.latitude,
      longitude: point.longitude,
      speedMetersPerSecond: point.speedMetersPerSecond ?? null,
      timestamp: point.timestamp
    })
  );
}

export type ActiveRecordingSettings = {
  activityMode: ActivityMode;
  sessionId: number;
};

export type InvalidActiveRecordingDiagnostic = {
  reason: "finalized_session" | "invalid_metadata" | "missing_session" | "unsupported_mode";
  sessionId: number | null;
};

export class ActiveRecordingConflictError extends Error {
  constructor(readonly activeRecording: ActiveRecordingSettings) {
    super("An unfinished recording already exists.");
    this.name = "ActiveRecordingConflictError";
  }
}

export async function createActiveRecordingSession(input: {
  activityMode: ActivityMode;
  startedAt: string;
}) {
  const db = await getDatabase();
  let sessionId: number | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const rows = await transaction.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
      ACTIVE_RECORDING_SESSION_ID_KEY,
      ACTIVE_RECORDING_MODE_KEY
    );
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const existingSessionId = Number(values[ACTIVE_RECORDING_SESSION_ID_KEY]);
    const existingSession =
      Number.isFinite(existingSessionId) && existingSessionId > 0
        ? await transaction.getFirstAsync<{
            activity_mode: ActivityMode;
            ended_at: string;
            started_at: string;
          }>(
            `
              SELECT activity_mode, started_at, ended_at
              FROM walk_sessions
              WHERE id = ?
            `,
            existingSessionId
          )
        : null;

    if (
      existingSession &&
      existingSession.ended_at === existingSession.started_at &&
      ACTIVITY_MODES.includes(existingSession.activity_mode)
    ) {
      throw new ActiveRecordingConflictError({
        activityMode: existingSession.activity_mode,
        sessionId: existingSessionId
      });
    }

    await transaction.runAsync(
      "DELETE FROM app_settings WHERE key IN (?, ?)",
      ACTIVE_RECORDING_SESSION_ID_KEY,
      ACTIVE_RECORDING_MODE_KEY
    );

    const result = await transaction.runAsync(
      `
        INSERT INTO walk_sessions (
          activity_mode,
          started_at,
          ended_at,
          distance_meters,
          duration_seconds,
          step_count
        )
        VALUES (?, ?, ?, 0, 0, 0)
      `,
      input.activityMode,
      input.startedAt,
      input.startedAt
    );
    sessionId = result.lastInsertRowId;

    await transaction.runAsync(
      `
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      ACTIVE_RECORDING_SESSION_ID_KEY,
      sessionId.toString()
    );
    await transaction.runAsync(
      `
        INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      ACTIVE_RECORDING_MODE_KEY,
      input.activityMode
    );
  });

  if (sessionId === null) {
    throw new Error("Active recording transaction completed without a session.");
  }

  console.info("[recording] active session persisted", {
    activityMode: input.activityMode,
    sessionId,
    startedAt: input.startedAt
  });

  return sessionId;
}

export async function getActiveRecordingSettings(
  onInvalid?: (diagnostic: InvalidActiveRecordingDiagnostic) => void
): Promise<ActiveRecordingSettings | null> {
  const db = await getDatabase();
  let activeRecording: ActiveRecordingSettings | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const rows = await transaction.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
      ACTIVE_RECORDING_SESSION_ID_KEY,
      ACTIVE_RECORDING_MODE_KEY
    );
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const sessionId = Number(values[ACTIVE_RECORDING_SESSION_ID_KEY]);

    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      if (rows.length > 0) {
        onInvalid?.({ reason: "invalid_metadata", sessionId: null });
        await transaction.runAsync(
          "DELETE FROM app_settings WHERE key IN (?, ?)",
          ACTIVE_RECORDING_SESSION_ID_KEY,
          ACTIVE_RECORDING_MODE_KEY
        );
      }

      return;
    }

    const session = await transaction.getFirstAsync<{
      activity_mode: ActivityMode;
      ended_at: string;
      started_at: string;
    }>(
      `
        SELECT activity_mode, started_at, ended_at
        FROM walk_sessions
        WHERE id = ?
      `,
      sessionId
    );

    if (!session) {
      onInvalid?.({ reason: "missing_session", sessionId });
      await transaction.runAsync(
        "DELETE FROM app_settings WHERE key IN (?, ?)",
        ACTIVE_RECORDING_SESSION_ID_KEY,
        ACTIVE_RECORDING_MODE_KEY
      );
      return;
    }

    if (session.ended_at !== session.started_at) {
      onInvalid?.({ reason: "finalized_session", sessionId });
      await transaction.runAsync(
        "DELETE FROM app_settings WHERE key IN (?, ?)",
        ACTIVE_RECORDING_SESSION_ID_KEY,
        ACTIVE_RECORDING_MODE_KEY
      );
      return;
    }

    if (!ACTIVITY_MODES.includes(session.activity_mode)) {
      onInvalid?.({ reason: "unsupported_mode", sessionId });
      await transaction.runAsync(
        "DELETE FROM app_settings WHERE key IN (?, ?)",
        ACTIVE_RECORDING_SESSION_ID_KEY,
        ACTIVE_RECORDING_MODE_KEY
      );
      return;
    }

    const storedActivityMode =
      values[ACTIVE_RECORDING_MODE_KEY] as ActivityMode | undefined;

    if (storedActivityMode !== session.activity_mode) {
      await transaction.runAsync(
        `
          INSERT INTO app_settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
        ACTIVE_RECORDING_MODE_KEY,
        session.activity_mode
      );
    }

    activeRecording = {
      activityMode: session.activity_mode,
      sessionId
    };
  });

  return activeRecording;
}

export async function clearActiveRecordingSettings(
  expectedSessionId?: number
) {
  const db = await getDatabase();
  let didClear = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (expectedSessionId !== undefined) {
      const currentSession = await transaction.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = ?",
        ACTIVE_RECORDING_SESSION_ID_KEY
      );

      if (Number(currentSession?.value) !== expectedSessionId) {
        return;
      }
    }

    const result = await transaction.runAsync(
      "DELETE FROM app_settings WHERE key IN (?, ?)",
      ACTIVE_RECORDING_SESSION_ID_KEY,
      ACTIVE_RECORDING_MODE_KEY
    );
    didClear = result.changes > 0;
  });

  if (didClear) {
    console.info("[recording] active session settings cleared", {
      sessionId: expectedSessionId ?? null
    });
  }
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
    if (
      zone.type === "district" &&
      zone.adminLevel !== null &&
      zone.adminLevel !== undefined &&
      !isOfficialDistrictAdminLevel(zone.adminLevel)
    ) {
      await db.runAsync("DELETE FROM app_settings WHERE key = ?", COMPLETION_OBJECTIVE_KEY);
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
