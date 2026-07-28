import type { SQLiteDatabase } from "expo-sqlite";

import { getDatabase } from "./db";
import { BACKGROUND_LOCATION_RECOVERY_GRACE_MS } from "../constants/config";
import {
  ActivityMode,
  GpsPoint,
  LifetimeStats,
  RenderedRouteSegment,
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
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  stepCount: number;
};

export type StreetExplorerBackup = {
  exportedAt: string;
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
  version: 2;
};

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

export async function getAllWalksWithPoints(activityMode: ActivityMode): Promise<WalkWithPoints[]> {
  const db = await getDatabase();
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
    ORDER BY started_at DESC
  `,
    activityMode
  );
  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length === 0) {
    return [];
  }

  const placeholders = sessionIds.map(() => "?").join(",");
  const points = await db.getAllAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE session_id IN (${placeholders})
      ORDER BY session_id, timestamp, id
    `,
    ...sessionIds
  );
  const routeSnapshots = await db.getAllAsync<RouteSnapshotRow>(
    `
      SELECT session_id, segments_json, source_point_count, source_max_point_id,
        algorithm_version, created_at
      FROM route_snapshots
      WHERE session_id IN (${placeholders})
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
    ...sessionIds
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

export async function getBackupData(): Promise<StreetExplorerBackup> {
  const db = await getDatabase();
  let backup!: StreetExplorerBackup;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const sessionRows = await transaction.getAllAsync<WalkSessionRow>(`
      SELECT id, activity_mode, display_name, started_at, ended_at,
        distance_meters, duration_seconds, step_count
      FROM walk_sessions
      ORDER BY started_at ASC
    `);
    const pendingDiscard = await transaction.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM pending_recording_discards"
    );

    if (sessionRows.some((row) => row.ended_at === row.started_at)) {
      throw new Error(
        "An active recording cannot be included in a backup."
      );
    }

    if ((pendingDiscard?.count ?? 0) > 0) {
      throw new Error(
        "A recently stopped recording is still accepting late GPS fixes."
      );
    }

    const pointRows = await transaction.getAllAsync<GpsPointRow>(`
      SELECT id, session_id, latitude, longitude, timestamp, accuracy,
        point_index
      FROM gps_points
      ORDER BY session_id, timestamp, id
    `);
    const snapshotRows = await transaction.getAllAsync<RouteSnapshotRow>(`
      SELECT session_id, segments_json, source_point_count,
        source_max_point_id, algorithm_version, created_at
      FROM route_snapshots
      ORDER BY session_id
    `);

    backup = {
      exportedAt: new Date().toISOString(),
      points: pointRows.map(mapPointRow),
      routeSnapshots: snapshotRows.flatMap((row) => {
        const segments = parseRouteSegments(row.segments_json);

        return segments
          ? [{
              algorithmVersion: row.algorithm_version,
              createdAt: row.created_at,
              segments,
              sessionId: row.session_id,
              sourceMaxPointId: row.source_max_point_id,
              sourcePointCount: row.source_point_count
            }]
          : [];
      }),
      sessions: sessionRows.map(mapSessionRow),
      version: 2
    };
  });

  return backup;
}

export async function restoreBackupData(backup: StreetExplorerBackup) {
  const db = await getDatabase();

  validateBackupData(backup);

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
      DELETE FROM gps_observations;
      DELETE FROM walk_sessions;
    `);

    for (const session of backup.sessions) {
      await transaction.runAsync(
        `
          INSERT INTO walk_sessions (
            id,
            activity_mode,
            display_name,
            started_at,
            ended_at,
            distance_meters,
            duration_seconds,
            step_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        session.id,
        "walk",
        session.displayName,
        session.startedAt,
        session.endedAt,
        session.distanceMeters,
        session.durationSeconds,
        session.stepCount ?? 0
      );

      if (
        new Date(session.endedAt).getTime() >
        new Date(session.startedAt).getTime()
      ) {
        await transaction.runAsync(
          `
            INSERT INTO pending_recording_repairs (session_id, created_at)
            VALUES (?, ?)
          `,
          session.id,
          new Date().toISOString()
        );
      }
    }

    for (const point of backup.points) {
      if (!point.id || !point.sessionId) {
        throw new Error("Backup contains a GPS point without an id or session id.");
      }

      await transaction.runAsync(
        `
          INSERT INTO gps_points (
            id,
            session_id,
            latitude,
            longitude,
            timestamp,
            accuracy,
            point_index
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        point.id,
        point.sessionId,
        point.latitude,
        point.longitude,
        point.timestamp,
        point.accuracy,
        point.pointIndex
      );
      await transaction.runAsync(
        `
          INSERT INTO gps_observations (
            session_id, latitude, longitude, timestamp, accuracy,
            processed, accepted
          )
          VALUES (?, ?, ?, ?, ?, 1, 1)
        `,
        point.sessionId,
        point.latitude,
        point.longitude,
        point.timestamp,
        point.accuracy
      );
    }

    for (const snapshot of backup.routeSnapshots) {
      await transaction.runAsync(
        `
          INSERT INTO route_snapshots (
            session_id,
            segments_json,
            source_point_count,
            source_max_point_id,
            algorithm_version,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        snapshot.sessionId,
        JSON.stringify(snapshot.segments),
        snapshot.sourcePointCount,
        snapshot.sourceMaxPointId ?? getBackupSourceMaxPointId(
          backup.points,
          snapshot.sessionId
        ),
        snapshot.algorithmVersion,
        snapshot.createdAt
      );
    }
  });
}

function validateBackupData(backup: StreetExplorerBackup) {
  const sessionIds = new Set<number>();

  for (const session of backup.sessions) {
    if (!session.id) {
      throw new Error("Backup contains a session without an id.");
    }

    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = new Date(session.endedAt).getTime();

    if (
      !Number.isFinite(startedAt) ||
      !Number.isFinite(endedAt) ||
      endedAt <= startedAt
    ) {
      throw new Error("Backup contains an unfinished recording.");
    }

    sessionIds.add(session.id);
  }

  for (const point of backup.points) {
    if (!point.id || !point.sessionId) {
      throw new Error("Backup contains a GPS point without an id or session id.");
    }

    if (!sessionIds.has(point.sessionId)) {
      throw new Error("Backup contains a GPS point for a missing session.");
    }
  }

  for (const snapshot of backup.routeSnapshots) {
    if (!sessionIds.has(snapshot.sessionId) || !areRenderedRouteSegments(snapshot.segments)) {
      throw new Error("Backup contains an invalid route snapshot.");
    }

    if (
      snapshot.sourceMaxPointId !== undefined &&
      (!Number.isInteger(snapshot.sourceMaxPointId) || snapshot.sourceMaxPointId < 0)
    ) {
      throw new Error("Backup contains an invalid route snapshot GPS generation.");
    }
  }
}

function getBackupSourceMaxPointId(points: GpsPoint[], sessionId: number) {
  return points.reduce(
    (maxPointId, point) =>
      point.sessionId === sessionId ? Math.max(maxPointId, point.id ?? 0) : maxPointId,
    0
  );
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
      )
    );
  });
}
