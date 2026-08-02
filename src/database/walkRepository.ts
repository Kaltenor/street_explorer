import type { SQLiteDatabase } from "expo-sqlite";

import { getDatabase } from "./db";
import type { CompletionScope, ZoneAchievement } from "./completionRepository";
import { APP_VERSION } from "../constants/config";
import type {
  BackupV5Manifest,
  BackupV5Metadata,
  BackupV5SessionData
} from "../services/backupV5";
import { BACKGROUND_LOCATION_RECOVERY_GRACE_MS } from "../constants/config";
import {
  ActivityMode,
  GpsPoint,
  LifetimeStats,
  RenderedRouteSegment,
  RouteBridgeEvidence,
  WalkSession,
  WalkWithPoints
} from "../types/walk";

type WalkSessionRow = {
  id: number;
  activity_mode: ActivityMode;
  display_name: string | null;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  point_count?: number;
  step_count: number;
};

type GpsPointRow = {
  id: number;
  session_id: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number | null;
  point_index: number;
};

type RouteSnapshotRow = {
  algorithm_version: number;
  created_at: string;
  segments_json: string;
  session_id: number;
  source_max_point_id: number;
  source_point_count: number;
};

type CreateWalkInput = {
  activityMode: ActivityMode;
  startedAt: string;
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  stepCount?: number;
};

type FinishWalkInput = {
  displayName?: string | null;
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  stepCount: number;
};

export type StreetExplorerBackup = {
  exportedAt: string;
  medalSystem: {
    acquisitionEvents: Array<{
      id: number;
      albumId: string;
      medalId: string;
      sessionId: number | null;
      reason: "recording" | "retro_scan";
      enclosureId: string;
      anchorCellId: string;
      enclosureAreaSquareMeters: number;
      enclosureCellIds: string[];
      acquiredAt: string;
    }>;
    collectedMedals: Array<{
      albumId: string;
      medalId: string;
      acquisitionEventId: number;
      presentationState: "pending" | "presenting" | "presented";
      presentedAt: string | null;
    }>;
    retroScanSettings: Array<{
      key: string;
      value: string;
    }>;
  };
  points: GpsPoint[];
  routeSnapshots: Array<{
    algorithmVersion: number;
    createdAt: string;
    segments: RenderedRouteSegment[];
    sessionId: number;
    sourceMaxPointId?: number;
    sourcePointCount: number;
  }>;
  sessions: WalkSession[];
  zoneAchievements: ZoneAchievement[];
  version: 4;
};
export function validateLegacyBackupV4(backup: StreetExplorerBackup) {
  validateBackupData(backup);
}


export async function createWalkSession(input: CreateWalkInput) {
  const db = await getDatabase();
  const result = await db.runAsync(
    `
      INSERT INTO walk_sessions (
        activity_mode,
        started_at,
        ended_at,
        distance_meters,
        duration_seconds,
        step_count
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    input.activityMode,
    input.startedAt,
    input.endedAt,
    input.distanceMeters,
    input.durationSeconds,
    input.stepCount ?? 0
  );

  return result.lastInsertRowId;
}

export async function saveGpsPoint(sessionId: number, point: GpsPoint) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO gps_points (
        session_id,
        latitude,
        longitude,
        timestamp,
        accuracy,
        point_index
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    sessionId,
    point.latitude,
    point.longitude,
    point.timestamp,
    point.accuracy,
    point.pointIndex
  );
}

export async function saveGpsPointWithNextIndex(
  sessionId: number,
  point: Omit<GpsPoint, "pointIndex">,
  distanceIncrementMeters = 0
) {
  const db = await getDatabase();
  let persistedPoint: GpsPoint | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const result = await transaction.runAsync(
      `
        INSERT OR IGNORE INTO gps_points (
          session_id,
          latitude,
          longitude,
          timestamp,
          accuracy,
          point_index
        )
        SELECT
          ?,
          ?,
          ?,
          ?,
          ?,
          COALESCE(
            (SELECT MAX(point_index) + 1 FROM gps_points WHERE session_id = ?),
            0
          )
        WHERE EXISTS (
          SELECT 1
          FROM walk_sessions
          WHERE id = ? AND ended_at = started_at
        )
      `,
      sessionId,
      point.latitude,
      point.longitude,
      point.timestamp,
      point.accuracy,
      sessionId,
      sessionId
    );

    if (result.changes > 0 && distanceIncrementMeters > 0) {
      await transaction.runAsync(
        `
          UPDATE walk_sessions
          SET distance_meters = distance_meters + ?
          WHERE id = ? AND ended_at = started_at
        `,
        distanceIncrementMeters,
        sessionId
      );
    }

    const persistedRow = await transaction.getFirstAsync<GpsPointRow>(
      `
        SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
        FROM gps_points
        WHERE session_id = ? AND timestamp = ?
        LIMIT 1
      `,
      sessionId,
      point.timestamp
    );
    persistedPoint = persistedRow ? mapPointRow(persistedRow) : null;
  });

  return persistedPoint;
}

export async function getLastGpsPointForSession(sessionId: number): Promise<GpsPoint | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE session_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
    `,
    sessionId
  );

  return row ? mapPointRow(row) : null;
}

export async function getGpsPointsForSession(sessionId: number): Promise<GpsPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE session_id = ?
      ORDER BY timestamp, id
    `,
    sessionId
  );

  return rows.map(mapPointRow);
}

export async function getGpsPointForSessionTimestamp(
  sessionId: number,
  timestamp: string
): Promise<GpsPoint | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE session_id = ? AND timestamp = ?
      LIMIT 1
    `,
    sessionId,
    timestamp
  );

  return row ? mapPointRow(row) : null;
}

export async function getGpsPointsAfterIndex(
  sessionId: number,
  pointIndex: number
): Promise<GpsPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE session_id = ? AND point_index > ?
      ORDER BY point_index, id
    `,
    sessionId,
    pointIndex
  );

  return rows.map(mapPointRow);
}

export async function getWalkSessionById(sessionId: number): Promise<WalkSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WalkSessionRow>(
    `
      SELECT id, activity_mode, display_name, started_at, ended_at, distance_meters, duration_seconds, step_count
      FROM walk_sessions
      WHERE id = ?
    `,
    sessionId
  );

  return row ? mapSessionRow(row) : null;
}

export async function getWalkSessionsIntersectingRange(
  startedAt: string,
  endedAt: string
): Promise<WalkSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WalkSessionRow>(
    `
      SELECT id, activity_mode, display_name, started_at, ended_at,
        distance_meters, duration_seconds, step_count
      FROM walk_sessions
      WHERE started_at <= ?
        AND (
          ended_at = started_at
          OR ended_at >= ?
        )
      ORDER BY
        CASE WHEN ended_at = started_at THEN 0 ELSE 1 END,
        started_at DESC
    `,
    endedAt,
    startedAt
  );

  return rows.map(mapSessionRow);
}

export async function getPendingRecordingRepairSessionIds(): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ session_id: number }>(
    `
      SELECT pending_recording_repairs.session_id
      FROM pending_recording_repairs
      JOIN walk_sessions
        ON walk_sessions.id = pending_recording_repairs.session_id
      WHERE walk_sessions.ended_at > walk_sessions.started_at
        AND NOT EXISTS (
          SELECT 1
          FROM pending_recording_discards
          WHERE session_id = walk_sessions.id
        )
      ORDER BY pending_recording_repairs.created_at
    `
  );

  return rows.map((row) => row.session_id);
}

export async function clearPendingRecordingRepair(sessionId: number) {
  const db = await getDatabase();

  await db.runAsync(
    "DELETE FROM pending_recording_repairs WHERE session_id = ?",
    sessionId
  );
}


export async function getGpsPointCountForSession(sessionId: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM gps_points
      WHERE session_id = ?
    `,
    sessionId
  );

  return row?.count ?? 0;
}

export async function finishWalkSession(
  sessionId: number,
  input: FinishWalkInput
): Promise<boolean> {
  const db = await getDatabase();
  let finalized = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const session = await transaction.getFirstAsync<{
      ended_at: string;
      point_count: number;
      started_at: string;
    }>(
      `
        SELECT
          ended_at,
          started_at,
          (
            SELECT COUNT(*)
            FROM gps_points
            WHERE session_id = walk_sessions.id
          ) AS point_count
        FROM walk_sessions
        WHERE id = ?
      `,
      sessionId
    );

    if (!session) {
      return;
    }

    let sessionClosed = session.ended_at !== session.started_at;
    const finalizedAt = sessionClosed
      ? session.ended_at
      : normalizeFinalizedAt(session.started_at, input.endedAt);
    if (session.ended_at === session.started_at) {
      const result = await transaction.runAsync(
        `
          UPDATE walk_sessions
          SET
            ended_at = ?,
            distance_meters = MAX(distance_meters, ?),
            duration_seconds = ?,
            step_count = ?
          WHERE id = ? AND ended_at = started_at
        `,
        finalizedAt,
        input.distanceMeters,
        input.durationSeconds,
        input.stepCount,
        sessionId
      );
      sessionClosed = result.changes > 0;
    }

    if (!sessionClosed) {
      return;
    }

    if (session.point_count < 2) {
      await transaction.runAsync(
        `
          INSERT INTO pending_recording_discards (session_id, discard_after)
          VALUES (?, ?)
          ON CONFLICT(session_id) DO NOTHING
        `,
        sessionId,
        new Date(
          Date.now() + BACKGROUND_LOCATION_RECOVERY_GRACE_MS
        ).toISOString()
      );
      return;
    }

    if (input.displayName !== undefined) {
      const normalizedName = input.displayName?.trim()
        ? input.displayName.trim()
        : null;
      await transaction.runAsync(
        "UPDATE walk_sessions SET display_name = ? WHERE id = ?",
        normalizedName,
        sessionId
      );
    }

    await transaction.runAsync(
      "DELETE FROM pending_recording_discards WHERE session_id = ?",
      sessionId
    );
    await transaction.runAsync(
      `
        INSERT INTO pending_recording_repairs (session_id, created_at)
        VALUES (?, ?)
        ON CONFLICT(session_id) DO UPDATE SET created_at = excluded.created_at
      `,
      sessionId,
      finalizedAt
    );
    finalized = true;
  });

  return finalized;
}

export async function purgeExpiredUnderfilledRecordings(
  now = new Date().toISOString()
) {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const recoveredRows = await transaction.getAllAsync<{
      session_id: number;
    }>(
      `
        SELECT pending_recording_discards.session_id
        FROM pending_recording_discards
        JOIN walk_sessions
          ON walk_sessions.id = pending_recording_discards.session_id
        WHERE walk_sessions.ended_at > walk_sessions.started_at
          AND (
            SELECT COUNT(*)
            FROM gps_points
            WHERE session_id = pending_recording_discards.session_id
          ) >= 2
      `
    );

    for (const row of recoveredRows) {
      await transaction.runAsync(
        `
          INSERT INTO pending_recording_repairs (session_id, created_at)
          VALUES (?, ?)
          ON CONFLICT(session_id) DO UPDATE SET created_at = excluded.created_at
        `,
        row.session_id,
        now
      );
    }

    await transaction.runAsync(
      `
        DELETE FROM pending_recording_discards
        WHERE (
          SELECT COUNT(*)
          FROM gps_points
          WHERE session_id = pending_recording_discards.session_id
        ) >= 2
      `
    );
    await transaction.runAsync(
      `
        DELETE FROM walk_sessions
        WHERE id IN (
          SELECT session_id
          FROM pending_recording_discards
          WHERE discard_after <= ?
        )
          AND (
            SELECT COUNT(*)
            FROM gps_points
            WHERE session_id = walk_sessions.id
          ) < 2
      `,
      now
    );
  });
}

export type WalkPointLoadScope =
  | { kind: "all" }
  | { kind: "selected"; sessionId: number }
  | { kind: "since"; startedAt: string }
  | { endedAfter: string; kind: "range"; startedBefore: string };

export async function getAllWalksWithPoints(
  activityMode: ActivityMode,
  scope: WalkPointLoadScope = { kind: "all" }
): Promise<WalkWithPoints[]> {
  const db = await getDatabase();
  const scopeSql =
    scope.kind === "selected"
      ? "AND walk_sessions.id = ?"
      : scope.kind === "since"
        ? "AND walk_sessions.started_at >= ?"
        : scope.kind === "range"
          ? "AND walk_sessions.ended_at > ? AND walk_sessions.started_at < ?"
          : "";
  const scopeParameters =
    scope.kind === "selected"
      ? [scope.sessionId]
      : scope.kind === "since"
        ? [scope.startedAt]
        : scope.kind === "range"
          ? [scope.endedAfter, scope.startedBefore]
          : [];
  const sessions = await db.getAllAsync<WalkSessionRow>(
    `
    SELECT id, activity_mode, display_name, started_at, ended_at, distance_meters, duration_seconds, step_count
    FROM walk_sessions
    WHERE activity_mode = ?
      AND ended_at > started_at
      AND NOT EXISTS (
        SELECT 1
        FROM pending_recording_discards
        WHERE session_id = walk_sessions.id
      )
      ${scopeSql}
    ORDER BY started_at DESC
  `,
    activityMode,
    ...scopeParameters
  );
  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length === 0) {
    return [];
  }

  const points = await db.getAllAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE EXISTS (
        SELECT 1
        FROM walk_sessions
        WHERE walk_sessions.id = gps_points.session_id
          AND walk_sessions.activity_mode = ?
          AND walk_sessions.ended_at > walk_sessions.started_at
          AND NOT EXISTS (
            SELECT 1
            FROM pending_recording_discards
            WHERE session_id = walk_sessions.id
          )
          ${scopeSql}
      )
      ORDER BY session_id, timestamp, id
    `,
    activityMode,
    ...scopeParameters
  );
  const routeSnapshots = await db.getAllAsync<RouteSnapshotRow>(
    `
      SELECT session_id, segments_json, source_point_count, source_max_point_id,
        algorithm_version, created_at
      FROM route_snapshots
      WHERE EXISTS (
        SELECT 1
        FROM walk_sessions
        WHERE walk_sessions.id = route_snapshots.session_id
          AND walk_sessions.activity_mode = ?
          AND walk_sessions.ended_at > walk_sessions.started_at
          AND NOT EXISTS (
            SELECT 1
            FROM pending_recording_discards
            WHERE session_id = walk_sessions.id
          )
          ${scopeSql}
      )
        AND source_point_count = (
          SELECT COUNT(*)
          FROM gps_points
          WHERE gps_points.session_id = route_snapshots.session_id
        )
        AND source_max_point_id = (
          SELECT COALESCE(MAX(id), 0)
          FROM gps_points
          WHERE gps_points.session_id = route_snapshots.session_id
        )
    `,
    activityMode,
    ...scopeParameters
  );
  const pointsBySession = new Map<number, GpsPoint[]>();
  const routeSegmentsBySession = new Map<number, RenderedRouteSegment[]>();

  for (const row of points) {
    const sessionPoints = pointsBySession.get(row.session_id) ?? [];
    sessionPoints.push(mapPointRow(row));
    pointsBySession.set(row.session_id, sessionPoints);
  }

  for (const snapshot of routeSnapshots) {
    const segments = parseRouteSegments(snapshot.segments_json);

    if (segments) {
      routeSegmentsBySession.set(snapshot.session_id, segments);
    }
  }

  return sessions.map((row) => ({
    ...mapSessionRow(row),
    points: pointsBySession.get(row.id) ?? [],
    routeSegments: routeSegmentsBySession.get(row.id) ?? null
  }));
}

export async function saveRouteSnapshot(
  sessionId: number,
  segments: RenderedRouteSegment[],
  sourcePointCount: number,
  algorithmVersion: number,
  options: {
    expectedSourceMaxPointId?: number | null;
    replaceExisting?: boolean;
  } = {}
): Promise<RenderedRouteSegment[] | null> {
  const db = await getDatabase();
  const insertMode = options.replaceExisting ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
  const expectedSourceMaxPointId = options.expectedSourceMaxPointId ?? null;
  let storedSegments: RenderedRouteSegment[] | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    if (!options.replaceExisting) {
      await transaction.runAsync(
        `
          DELETE FROM route_snapshots
          WHERE session_id = ?
            AND EXISTS (
              SELECT 1
              FROM walk_sessions
              WHERE id = ?
                AND (
                  SELECT COUNT(*)
                  FROM gps_points
                  WHERE session_id = walk_sessions.id
                ) = ?
                AND (
                  ? IS NULL OR (
                    SELECT COALESCE(MAX(id), 0)
                    FROM gps_points
                    WHERE session_id = walk_sessions.id
                  ) = ?
                )
            )
            AND (
              source_point_count <> ?
              OR source_max_point_id <> (
                SELECT COALESCE(MAX(id), 0)
                FROM gps_points
                WHERE gps_points.session_id = route_snapshots.session_id
              )
            )
        `,
        sessionId,
        sessionId,
        sourcePointCount,
        expectedSourceMaxPointId,
        expectedSourceMaxPointId,
        sourcePointCount
      );
    }

    await transaction.runAsync(
      `
        ${insertMode} INTO route_snapshots (
          session_id,
          segments_json,
          source_point_count,
          source_max_point_id,
          algorithm_version,
          created_at
        )
        SELECT ?, ?, ?, (
          SELECT COALESCE(MAX(id), 0)
          FROM gps_points
          WHERE session_id = ?
        ), ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM walk_sessions
          WHERE id = ?
            AND (
              SELECT COUNT(*)
              FROM gps_points
              WHERE session_id = walk_sessions.id
            ) = ?
            AND (
              ? IS NULL OR (
                SELECT COALESCE(MAX(id), 0)
                FROM gps_points
                WHERE session_id = walk_sessions.id
              ) = ?
            )
        )
      `,
      sessionId,
      JSON.stringify(segments),
      sourcePointCount,
      sessionId,
      algorithmVersion,
      new Date().toISOString(),
      sessionId,
      sourcePointCount,
      expectedSourceMaxPointId,
      expectedSourceMaxPointId
    );

    const row = await transaction.getFirstAsync<
      Pick<RouteSnapshotRow, "segments_json">
    >(
      `
        SELECT route_snapshots.segments_json
        FROM route_snapshots
        WHERE route_snapshots.session_id = ?
          AND route_snapshots.source_point_count = (
            SELECT COUNT(*)
            FROM gps_points
            WHERE gps_points.session_id = route_snapshots.session_id
          )
          AND route_snapshots.source_max_point_id = (
            SELECT COALESCE(MAX(id), 0)
            FROM gps_points
            WHERE gps_points.session_id = route_snapshots.session_id
          )
      `,
      sessionId
    );
    storedSegments = row ? parseRouteSegments(row.segments_json) : null;
  });

  return storedSegments;
}

export async function getRouteSnapshot(sessionId: number) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Pick<RouteSnapshotRow, "segments_json">>(
    `
      SELECT route_snapshots.segments_json
      FROM route_snapshots
      JOIN walk_sessions ON walk_sessions.id = route_snapshots.session_id
      WHERE route_snapshots.session_id = ?
        AND route_snapshots.source_point_count = (
          SELECT COUNT(*)
          FROM gps_points
          WHERE gps_points.session_id = route_snapshots.session_id
        )
        AND route_snapshots.source_max_point_id = (
          SELECT COALESCE(MAX(id), 0)
          FROM gps_points
          WHERE gps_points.session_id = route_snapshots.session_id
        )
    `,
    sessionId
  );

  return row ? parseRouteSegments(row.segments_json) : null;
}

export async function getLifetimeStats(activityMode: ActivityMode): Promise<LifetimeStats> {
  const db = await getDatabase();
  const stats = await db.getFirstAsync<{
    walk_count: number;
    total_distance_meters: number | null;
    total_duration_seconds: number | null;
    today_step_count: number | null;
  }>(`
    SELECT
      COUNT(*) AS walk_count,
      SUM(distance_meters) AS total_distance_meters,
      SUM(duration_seconds) AS total_duration_seconds,
      SUM(
        CASE
          WHEN date(started_at) = date('now', 'localtime') THEN step_count
          ELSE 0
        END
      ) AS today_step_count
    FROM walk_sessions
    WHERE activity_mode = ?
      AND ended_at > started_at
      AND NOT EXISTS (
        SELECT 1
        FROM pending_recording_discards
        WHERE session_id = walk_sessions.id
      )
  `,
    activityMode
  );

  return {
    walkCount: stats?.walk_count ?? 0,
    totalDistanceMeters: stats?.total_distance_meters ?? 0,
    totalDurationSeconds: stats?.total_duration_seconds ?? 0,
    approximateExploredAreaSquareMeters: 0,
    exploredCellCount: 0,
    latestRecordingStartedAt: null,
    latestRecordingDistanceMeters: 0,
    longestRecordingDistanceMeters: 0,
    newCellsThisRecording: 0,
    todayDistanceMeters: 0,
    todayRecordingCount: 0,
    todayStepCount: stats?.today_step_count ?? 0
  };
}

export async function getWalkHistory(activityMode: ActivityMode): Promise<WalkSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WalkSessionRow>(
    `
      SELECT
        walk_sessions.id,
        walk_sessions.activity_mode,
        walk_sessions.display_name,
        walk_sessions.started_at,
        walk_sessions.ended_at,
        walk_sessions.distance_meters,
        walk_sessions.duration_seconds,
        walk_sessions.step_count,
        COUNT(gps_points.id) AS point_count
      FROM walk_sessions
      LEFT JOIN gps_points ON gps_points.session_id = walk_sessions.id
      WHERE walk_sessions.activity_mode = ?
        AND walk_sessions.ended_at > walk_sessions.started_at
        AND NOT EXISTS (
          SELECT 1
          FROM pending_recording_discards
          WHERE session_id = walk_sessions.id
        )
      GROUP BY walk_sessions.id
      ORDER BY walk_sessions.started_at DESC
    `,
    activityMode
  );

  return rows.map(mapSessionRow);
}

export async function deleteWalkSession(sessionId: number) {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync((transaction) =>
    deleteWalkSessionRows(transaction, sessionId)
  );
}

async function deleteWalkSessionRows(
  transaction: SQLiteDatabase,
  sessionId: number
) {
  await transaction.runAsync(
    "DELETE FROM explored_cells WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM loop_fills WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM pending_recording_repairs WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM pending_recording_discards WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM route_snapshots WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM gps_points WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM gps_observations WHERE session_id = ?",
    sessionId
  );
  await transaction.runAsync(
    "DELETE FROM walk_sessions WHERE id = ?",
    sessionId
  );
}

export async function updateWalkSessionStepCount(sessionId: number, stepCount: number) {
  const db = await getDatabase();

  await db.runAsync(
    "UPDATE walk_sessions SET step_count = ? WHERE id = ?",
    Math.max(0, Math.round(stepCount)),
    sessionId
  );
}
export async function updateWalkSessionName(sessionId: number, displayName: string | null) {
  const db = await getDatabase();
  const normalizedName = displayName?.trim() ? displayName.trim() : null;

  await db.runAsync(
    "UPDATE walk_sessions SET display_name = ? WHERE id = ?",
    normalizedName,
    sessionId
  );
}

export type BackupV5SnapshotSource = {
  loadSessions: (sessionIds: readonly number[]) => Promise<BackupV5SessionData[]>;
  metadata: BackupV5Metadata;
};

export async function withBackupV5Snapshot<T>(
  operation: (source: BackupV5SnapshotSource) => Promise<T>
): Promise<T> {
  const db = await getDatabase();
  let result!: T;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const activeSession = await transaction.getFirstAsync<{ id: number }>(`
      SELECT walk_sessions.id
      FROM app_settings
      JOIN walk_sessions
        ON walk_sessions.id = CAST(app_settings.value AS INTEGER)
      WHERE app_settings.key = 'active_recording_session_id'
        AND walk_sessions.ended_at = walk_sessions.started_at
    `);

    if (activeSession) {
      throw new Error(
        "An active recording cannot be included in a backup."
      );
    }

    const sessionRows = await transaction.getAllAsync<
      WalkSessionRow & { point_count: number }
    >(`
      SELECT
        walk_sessions.id,
        walk_sessions.activity_mode,
        walk_sessions.display_name,
        walk_sessions.started_at,
        walk_sessions.ended_at,
        walk_sessions.distance_meters,
        walk_sessions.duration_seconds,
        walk_sessions.step_count,
        (
          SELECT COUNT(*)
          FROM gps_points
          WHERE gps_points.session_id = walk_sessions.id
        ) AS point_count
      FROM walk_sessions
      WHERE ended_at > started_at
        AND NOT EXISTS (
          SELECT 1
          FROM pending_recording_discards
          WHERE session_id = walk_sessions.id
        )
      ORDER BY started_at ASC
    `);
    const medalEventRows = await transaction.getAllAsync<{
      id: number;
      album_id: string;
      medal_id: string;
      session_id: number | null;
      reason: "recording" | "retro_scan";
      enclosure_id: string;
      anchor_cell_id: string;
      enclosure_area_m2: number;
      enclosure_cells_json: string;
      acquired_at: string;
    }>(`
      SELECT id, album_id, medal_id, session_id, reason, enclosure_id,
        anchor_cell_id, enclosure_area_m2, enclosure_cells_json, acquired_at
      FROM medal_acquisition_events
      WHERE session_id IS NULL
        OR session_id IN (
          SELECT id
          FROM walk_sessions
          WHERE ended_at > started_at
            AND NOT EXISTS (
              SELECT 1 FROM pending_recording_discards
              WHERE session_id = walk_sessions.id
            )
        )
      ORDER BY id
    `);
    const collectedMedalRows = await transaction.getAllAsync<{
      album_id: string;
      medal_id: string;
      acquisition_event_id: number;
      presentation_state: "pending" | "presenting" | "presented";
      presented_at: string | null;
    }>(`
      SELECT album_id, medal_id, acquisition_event_id, presentation_state, presented_at
      FROM collected_medals AS collected
      WHERE EXISTS (
        SELECT 1
        FROM medal_acquisition_events AS event
        WHERE event.id = collected.acquisition_event_id
          AND (
            event.session_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM walk_sessions
              WHERE walk_sessions.id = event.session_id
                AND walk_sessions.ended_at > walk_sessions.started_at
                AND NOT EXISTS (
                  SELECT 1 FROM pending_recording_discards
                  WHERE session_id = walk_sessions.id
                )
            )
          )
      )
      ORDER BY album_id, medal_id
    `);
    const retroScanSettings = await transaction.getAllAsync<{
      key: string;
      value: string;
    }>(`
      SELECT key, value FROM app_settings
      WHERE key LIKE 'medal_retro_scan:%'
      ORDER BY key
    `);
    const zoneAchievementRows = await transaction.getAllAsync<{
      boundary_fetched_at: string;
      boundary_source: string;
      completed_at: string;
      explored_cells: number;
      geometry_fingerprint: string;
      total_zone_cells: number;
      zone_id: string;
      zone_name: string;
      zone_type: CompletionScope;
    }>(`
      SELECT zone_id, zone_type, zone_name, completed_at, explored_cells,
        total_zone_cells, boundary_fetched_at, boundary_source,
        geometry_fingerprint
      FROM zone_achievements
      ORDER BY completed_at
    `);

    const metadata: BackupV5Metadata = {
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      medalSystem: {
        acquisitionEvents: medalEventRows.map((row) => ({
          acquiredAt: row.acquired_at,
          albumId: row.album_id,
          anchorCellId: row.anchor_cell_id,
          enclosureAreaSquareMeters: row.enclosure_area_m2,
          enclosureCellIds: parseStringArray(row.enclosure_cells_json),
          enclosureId: row.enclosure_id,
          id: row.id,
          medalId: row.medal_id,
          reason: row.reason,
          sessionId: row.session_id
        })),
        collectedMedals: collectedMedalRows.map((row) => ({
          acquisitionEventId: row.acquisition_event_id,
          albumId: row.album_id,
          medalId: row.medal_id,
          presentationState: row.presentation_state,
          presentedAt: row.presented_at
        })),
        retroScanSettings
      },
      sessions: sessionRows.map((row) => ({
        ...mapSessionRow(row),
        pointCount: row.point_count
      })),
      zoneAchievements: zoneAchievementRows.map((row) => ({
        boundaryFetchedAt: row.boundary_fetched_at,
        boundarySource: row.boundary_source,
        completedAt: row.completed_at,
        exploredCells: row.explored_cells,
        geometryFingerprint: row.geometry_fingerprint,
        totalZoneCells: row.total_zone_cells,
        zoneId: row.zone_id,
        zoneName: row.zone_name,
        zoneType: row.zone_type
      }))
    };

    const loadSessions = async (
      sessionIds: readonly number[]
    ): Promise<BackupV5SessionData[]> => {
      if (sessionIds.length === 0) {
        return [];
      }

      const placeholders = sessionIds.map(() => "?").join(",");
      const pointRows = await transaction.getAllAsync<GpsPointRow>(
        `
          SELECT id, session_id, latitude, longitude, timestamp, accuracy,
            point_index
          FROM gps_points
          WHERE session_id IN (${placeholders})
          ORDER BY session_id, point_index, id
        `,
        ...sessionIds
      );
      const snapshotRows = await transaction.getAllAsync<RouteSnapshotRow>(
        `
          SELECT session_id, segments_json, source_point_count,
            source_max_point_id, algorithm_version, created_at
          FROM route_snapshots
          WHERE session_id IN (${placeholders})
          ORDER BY session_id
        `,
        ...sessionIds
      );
      const pointsBySession = new Map<number, GpsPoint[]>();
      const snapshotBySession = new Map<number, RouteSnapshotRow>();

      for (const row of pointRows) {
        const points = pointsBySession.get(row.session_id) ?? [];
        points.push(mapPointRow(row));
        pointsBySession.set(row.session_id, points);
      }

      for (const row of snapshotRows) {
        snapshotBySession.set(row.session_id, row);
      }

      return sessionIds.map((sessionId) => {
        const snapshot = snapshotBySession.get(sessionId);
        const segments = snapshot
          ? parseRouteSegments(snapshot.segments_json)
          : null;

        return {
          points: pointsBySession.get(sessionId) ?? [],
          routeSnapshot:
            snapshot && segments
              ? {
                  algorithmVersion: snapshot.algorithm_version,
                  createdAt: snapshot.created_at,
                  segments,
                  sessionId,
                  sourceMaxPointId: snapshot.source_max_point_id,
                  sourcePointCount: snapshot.source_point_count
                }
              : null,
          sessionId
        };
      });
    };

    result = await operation({ loadSessions, metadata });
  });

  return result;

}
export async function restoreBackupV5Data(
  manifest: BackupV5Manifest,
  blocks: AsyncIterable<BackupV5SessionData[]>
) {
  const db = await getDatabase();
  const expectedSessionIds = new Set(manifest.sessions.map((session) => session.id));
  const restoredSessionIds = new Set<number>();
  let restoredPointCount = 0;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      DELETE FROM app_settings
      WHERE key IN (
        'active_recording_session_id',
        'active_recording_mode'
      );
      DELETE FROM app_settings WHERE key LIKE 'medal_retro_scan:%';
      DELETE FROM collected_medals;
      DELETE FROM medal_acquisition_events;
      DELETE FROM zone_achievements;
      DELETE FROM street_completion_session_coverage;
      DELETE FROM street_completion_segments;
      DELETE FROM street_completion_v1_evidence;
      UPDATE street_completion_state
      SET status = 'pending',
        needs_rebuild = 1,
        processed_recording_count = 0,
        total_recording_count = 0,
        legacy_captured_at = NULL,
        last_error = NULL,
        updated_at = NULL
      WHERE id = 1;
      DELETE FROM pending_recording_repairs;
      DELETE FROM pending_recording_discards;
      DELETE FROM explored_cells;
      DELETE FROM loop_fills;
      DELETE FROM route_snapshots;
      DELETE FROM gps_points;
      DELETE FROM gps_observations;
      DELETE FROM walk_sessions;
    `);

    for (const session of manifest.sessions) {
      if (
        !Number.isInteger(session.id) ||
        !Number.isInteger(session.pointCount) ||
        new Date(session.endedAt).getTime() <=
          new Date(session.startedAt).getTime()
      ) {
        throw new Error("V5 backup contains invalid session metadata.");
      }

      await transaction.runAsync(
        `
          INSERT INTO walk_sessions (
            id, activity_mode, display_name, started_at, ended_at,
            distance_meters, duration_seconds, step_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        session.id,
        session.activityMode,
        session.displayName,
        session.startedAt,
        session.endedAt,
        session.distanceMeters,
        session.durationSeconds,
        session.stepCount ?? 0
      );
      await transaction.runAsync(
        `
          INSERT INTO pending_recording_repairs (session_id, created_at)
          VALUES (?, ?)
        `,
        session.id,
        new Date().toISOString()
      );
    }

    for await (const blockSessions of blocks) {
      for (const sessionData of blockSessions) {
        if (
          !expectedSessionIds.has(sessionData.sessionId) ||
          restoredSessionIds.has(sessionData.sessionId)
        ) {
          throw new Error("V5 backup contains a duplicate or unexpected session block.");
        }

        for (
          let offset = 0;
          offset < sessionData.points.length;
          offset += BACKUP_V5_POINT_INSERT_BATCH_SIZE
        ) {
          const pointBatch = sessionData.points.slice(
            offset,
            offset + BACKUP_V5_POINT_INSERT_BATCH_SIZE
          );
          const placeholders = pointBatch
            .map(() => "(?, ?, ?, ?, ?, ?, ?)")
            .join(",");
          const values: Array<number | string | null> = [];

          for (const point of pointBatch) {
            if (
              !Number.isInteger(point.id) ||
              point.sessionId !== sessionData.sessionId
            ) {
              throw new Error("V5 backup contains an invalid GPS point.");
            }

            values.push(
              point.id as number,
              sessionData.sessionId,
              point.latitude,
              point.longitude,
              point.timestamp,
              point.accuracy,
              point.pointIndex
            );
          }

          if (pointBatch.length > 0) {
            await transaction.runAsync(
              `
                INSERT INTO gps_points (
                  id, session_id, latitude, longitude, timestamp, accuracy,
                  point_index
                )
                VALUES ${placeholders}
              `,
              ...values
            );
          }
        }

        restoredPointCount += sessionData.points.length;

        if (sessionData.routeSnapshot) {
          await transaction.runAsync(
            `
              INSERT INTO route_snapshots (
                session_id, segments_json, source_point_count,
                source_max_point_id, algorithm_version, created_at
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `,
            sessionData.sessionId,
            JSON.stringify(sessionData.routeSnapshot.segments),
            sessionData.routeSnapshot.sourcePointCount,
            sessionData.routeSnapshot.sourceMaxPointId,
            sessionData.routeSnapshot.algorithmVersion,
            sessionData.routeSnapshot.createdAt
          );
        }

        restoredSessionIds.add(sessionData.sessionId);
      }
    }

    if (
      restoredSessionIds.size !== expectedSessionIds.size ||
      restoredPointCount !== manifest.totals.pointCount
    ) {
      throw new Error("V5 backup did not restore every expected session and point.");
    }

    await transaction.execAsync(`
      INSERT INTO gps_observations (
        session_id, latitude, longitude, timestamp, accuracy, processed, accepted
      )
      SELECT
        session_id, latitude, longitude, timestamp, accuracy, 1, 1
      FROM gps_points
      ORDER BY session_id, point_index, id;
    `);

    for (const event of manifest.medalSystem.acquisitionEvents) {
      await transaction.runAsync(
        `INSERT INTO medal_acquisition_events (
          id, album_id, medal_id, session_id, reason, enclosure_id,
          anchor_cell_id, enclosure_area_m2, enclosure_cells_json, acquired_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id,
        event.albumId,
        event.medalId,
        event.sessionId,
        event.reason,
        event.enclosureId,
        event.anchorCellId,
        event.enclosureAreaSquareMeters,
        JSON.stringify(event.enclosureCellIds),
        event.acquiredAt
      );
    }

    for (const medal of manifest.medalSystem.collectedMedals) {
      await transaction.runAsync(
        `INSERT INTO collected_medals (
          album_id, medal_id, acquisition_event_id, presentation_state, presented_at
        ) VALUES (?, ?, ?, ?, ?)`,
        medal.albumId,
        medal.medalId,
        medal.acquisitionEventId,
        medal.presentationState === "presenting"
          ? "pending"
          : medal.presentationState,
        medal.presentedAt
      );
    }

    for (const setting of manifest.medalSystem.retroScanSettings) {
      if (!setting.key.startsWith("medal_retro_scan:")) {
        continue;
      }

      await transaction.runAsync(
        `INSERT INTO app_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        setting.key,
        setting.value
      );
    }

    for (const achievement of manifest.zoneAchievements) {
      await transaction.runAsync(
        `INSERT INTO zone_achievements (
          zone_id, zone_type, zone_name, completed_at, explored_cells,
          total_zone_cells, boundary_fetched_at, boundary_source,
          geometry_fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        achievement.zoneId,
        achievement.zoneType,
        achievement.zoneName,
        achievement.completedAt,
        achievement.exploredCells,
        achievement.totalZoneCells,
        achievement.boundaryFetchedAt,
        achievement.boundarySource,
        achievement.geometryFingerprint
      );
    }
  });
}

const BACKUP_V5_POINT_INSERT_BATCH_SIZE = 100;
function validateBackupData(backup: StreetExplorerBackup) {
  const sessionIds = new Set<number>();

  for (const session of backup.sessions) {
    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = new Date(session.endedAt).getTime();

    if (
      !Number.isInteger(session.id) ||
      session.id <= 0 ||
      sessionIds.has(session.id) ||
      session.activityMode !== "walk" ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(endedAt) ||
      endedAt <= startedAt ||
      !Number.isFinite(session.distanceMeters) ||
      session.distanceMeters < 0 ||
      !Number.isFinite(session.durationSeconds) ||
      session.durationSeconds < 0 ||
      !Number.isInteger(session.stepCount) ||
      session.stepCount < 0
    ) {
      throw new Error("Backup contains invalid session metadata.");
    }

    sessionIds.add(session.id);
  }

  const pointIds = new Set<number>();

  for (const point of backup.points) {
    if (
      !Number.isInteger(point.id) ||
      (point.id ?? 0) <= 0 ||
      pointIds.has(point.id as number) ||
      !Number.isInteger(point.sessionId) ||
      !sessionIds.has(point.sessionId as number) ||
      !Number.isInteger(point.pointIndex) ||
      point.pointIndex < 0 ||
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      !Number.isFinite(new Date(point.timestamp).getTime()) ||
      (point.accuracy !== null && !Number.isFinite(point.accuracy))
    ) {
      throw new Error("Backup contains an invalid or duplicate GPS point.");
    }

    pointIds.add(point.id as number);
  }

  const snapshotSessionIds = new Set<number>();

  for (const snapshot of backup.routeSnapshots) {
    if (
      snapshotSessionIds.has(snapshot.sessionId) ||
      !sessionIds.has(snapshot.sessionId) ||
      !areRenderedRouteSegments(snapshot.segments) ||
      !Number.isInteger(snapshot.sourcePointCount) ||
      snapshot.sourcePointCount < 0 ||
      !Number.isInteger(snapshot.algorithmVersion) ||
      !Number.isFinite(new Date(snapshot.createdAt).getTime())
    ) {
      throw new Error("Backup contains an invalid route snapshot.");
    }

    if (
      snapshot.sourceMaxPointId !== undefined &&
      (!Number.isInteger(snapshot.sourceMaxPointId) || snapshot.sourceMaxPointId < 0)
    ) {
      throw new Error("Backup contains an invalid route snapshot GPS generation.");
    }

    snapshotSessionIds.add(snapshot.sessionId);
  }

  const eventIds = new Set<number>();

  for (const event of backup.medalSystem.acquisitionEvents) {
    if (
      !Number.isInteger(event.id) ||
      event.id <= 0 ||
      eventIds.has(event.id) ||
      !event.albumId ||
      !event.medalId ||
      (event.sessionId !== null && !sessionIds.has(event.sessionId)) ||
      !Array.isArray(event.enclosureCellIds)
    ) {
      throw new Error("Backup contains an invalid medal acquisition event.");
    }

    eventIds.add(event.id);
  }

  for (const medal of backup.medalSystem.collectedMedals) {
    if (
      !medal.albumId ||
      !medal.medalId ||
      !eventIds.has(medal.acquisitionEventId) ||
      !["pending", "presenting", "presented"].includes(medal.presentationState)
    ) {
      throw new Error("Backup contains an invalid collected medal.");
    }
  }

  for (const setting of backup.medalSystem.retroScanSettings) {
    if (typeof setting.key !== "string" || typeof setting.value !== "string") {
      throw new Error("Backup contains invalid medal scan settings.");
    }
  }

  for (const achievement of backup.zoneAchievements) {
    if (
      !achievement.zoneId ||
      !achievement.zoneName ||
      !["country", "city", "district"].includes(achievement.zoneType) ||
      !Number.isInteger(achievement.exploredCells) ||
      achievement.exploredCells < 0 ||
      !Number.isInteger(achievement.totalZoneCells) ||
      achievement.totalZoneCells <= 0 ||
      !Number.isFinite(new Date(achievement.completedAt).getTime()) ||
      !achievement.geometryFingerprint
    ) {
      throw new Error("Backup contains an invalid zone achievement.");
    }
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function deleteAllData() {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      DELETE FROM app_settings
      WHERE key IN (
        'active_recording_session_id',
        'active_recording_mode'
      );
      DELETE FROM pending_recording_repairs;
      DELETE FROM pending_recording_discards;
      DELETE FROM explored_cells;
      DELETE FROM loop_fills;
      DELETE FROM route_snapshots;
      DELETE FROM gps_points;
      DELETE FROM app_settings WHERE key LIKE 'medal_retro_scan:%';
      DELETE FROM collected_medals;
      DELETE FROM medal_acquisition_events;
      DELETE FROM zone_achievements;
      DELETE FROM street_completion_session_coverage;
      DELETE FROM street_completion_segments;
      DELETE FROM street_completion_v1_evidence;
      UPDATE street_completion_state
      SET status = 'pending',
        needs_rebuild = 1,
        processed_recording_count = 0,
        total_recording_count = 0,
        legacy_captured_at = NULL,
        last_error = NULL,
        updated_at = NULL
      WHERE id = 1;
      DELETE FROM gps_observations;
      DELETE FROM walk_sessions;
    `);
  });
}

function normalizeFinalizedAt(startedAt: string, endedAt: string) {
  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();
  const safeStartedAtMs = Number.isFinite(startedAtMs)
    ? startedAtMs
    : Date.now();
  const safeEndedAtMs = Number.isFinite(endedAtMs)
    ? endedAtMs
    : Date.now();

  return new Date(
    Math.max(safeEndedAtMs, safeStartedAtMs + 1)
  ).toISOString();
}

function mapSessionRow(row: WalkSessionRow): WalkSession {
  return {
    id: row.id,
    activityMode: row.activity_mode,
    displayName: row.display_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    pointCount: row.point_count,
    stepCount: row.step_count ?? 0
  };
}

function mapPointRow(row: GpsPointRow): GpsPoint {
  return {
    id: row.id,
    sessionId: row.session_id,
    latitude: row.latitude,
    longitude: row.longitude,
    timestamp: row.timestamp,
    accuracy: row.accuracy,
    pointIndex: row.point_index
  };
}

function parseRouteSegments(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);

    return areRenderedRouteSegments(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function areRenderedRouteSegments(value: unknown): value is RenderedRouteSegment[] {
  return Array.isArray(value) && value.every((segment) => {
    if (!segment || typeof segment !== "object") {
      return false;
    }

    const candidate = segment as Partial<RenderedRouteSegment>;

    return (
      (candidate.type === "confirmed" || candidate.type === "inferred") &&
      Array.isArray(candidate.points) &&
      candidate.points.length >= 2 &&
      candidate.points.every((point) =>
        Boolean(point) &&
        typeof point.latitude === "number" &&
        Number.isFinite(point.latitude) &&
        typeof point.longitude === "number" &&
        Number.isFinite(point.longitude)
      ) &&
      (candidate.bridgeEvidence === undefined ||
        isRouteBridgeEvidence(candidate.bridgeEvidence))
    );
  });
}

function isRouteBridgeEvidence(value: unknown): value is RouteBridgeEvidence {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RouteBridgeEvidence>;
  const numericValues = [
    candidate.endSnapDistanceMeters,
    candidate.endpointJoinCount,
    candidate.gapDistanceMeters,
    candidate.gapDurationSeconds,
    candidate.inferredCellCount,
    candidate.intersectionJoinCount,
    candidate.maxEndpointJoinDistanceMeters,
    candidate.routeDistanceMeters,
    candidate.sourceStreetSegmentCount,
    candidate.startSnapDistanceMeters,
    candidate.straightDistanceMeters
  ];

  return (
    candidate.schemaVersion === 1 &&
    ["exact_topology", "geometric_crossing", "near_endpoint_join"].includes(
      candidate.acceptanceReason ?? ""
    ) &&
    numericValues.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}
