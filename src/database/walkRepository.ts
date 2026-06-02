import { getDatabase } from "./db";
import {
  ActivityMode,
  GpsPoint,
  LifetimeStats,
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

type CreateWalkInput = {
  activityMode: ActivityMode;
  startedAt: string;
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
};

type FinishWalkInput = {
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
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
        duration_seconds
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    input.activityMode,
    input.startedAt,
    input.endedAt,
    input.distanceMeters,
    input.durationSeconds
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

export async function saveGpsPointWithNextIndex(sessionId: number, point: Omit<GpsPoint, "pointIndex">) {
  const db = await getDatabase();
  const existingPoint = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM gps_points WHERE session_id = ? AND timestamp = ? LIMIT 1",
    sessionId,
    point.timestamp
  );

  if (existingPoint) {
    return;
  }

  const row = await db.getFirstAsync<{ next_index: number | null }>(
    "SELECT COALESCE(MAX(point_index) + 1, 0) AS next_index FROM gps_points WHERE session_id = ?",
    sessionId
  );

  await saveGpsPoint(sessionId, {
    ...point,
    pointIndex: row?.next_index ?? 0
  });
}

export async function getLastGpsPointForSession(sessionId: number): Promise<GpsPoint | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<GpsPointRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy, point_index
      FROM gps_points
      WHERE session_id = ?
      ORDER BY point_index DESC
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
      ORDER BY point_index
    `,
    sessionId
  );

  return rows.map(mapPointRow);
}

export async function getWalkSessionById(sessionId: number): Promise<WalkSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WalkSessionRow>(
    `
      SELECT id, activity_mode, display_name, started_at, ended_at, distance_meters, duration_seconds
      FROM walk_sessions
      WHERE id = ?
    `,
    sessionId
  );

  return row ? mapSessionRow(row) : null;
}

export async function finishWalkSession(sessionId: number, input: FinishWalkInput) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE walk_sessions
      SET ended_at = ?, distance_meters = ?, duration_seconds = ?
      WHERE id = ?
    `,
    input.endedAt,
    input.distanceMeters,
    input.durationSeconds,
    sessionId
  );
}

export async function getAllWalksWithPoints(activityMode: ActivityMode): Promise<WalkWithPoints[]> {
  const db = await getDatabase();
  const sessions = await db.getAllAsync<WalkSessionRow>(
    `
    SELECT id, activity_mode, display_name, started_at, ended_at, distance_meters, duration_seconds
    FROM walk_sessions
    WHERE activity_mode = ?
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
      ORDER BY session_id, point_index
    `,
    ...sessionIds
  );
  const pointsBySession = new Map<number, GpsPoint[]>();

  for (const row of points) {
    const sessionPoints = pointsBySession.get(row.session_id) ?? [];
    sessionPoints.push(mapPointRow(row));
    pointsBySession.set(row.session_id, sessionPoints);
  }

  return sessions.map((row) => ({
    ...mapSessionRow(row),
    points: pointsBySession.get(row.id) ?? []
  }));
}

export async function getLifetimeStats(activityMode: ActivityMode): Promise<LifetimeStats> {
  const db = await getDatabase();
  const stats = await db.getFirstAsync<{
    walk_count: number;
    total_distance_meters: number | null;
    total_duration_seconds: number | null;
  }>(`
    SELECT
      COUNT(*) AS walk_count,
      SUM(distance_meters) AS total_distance_meters,
      SUM(duration_seconds) AS total_duration_seconds
    FROM walk_sessions
    WHERE activity_mode = ?
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
    todayRecordingCount: 0
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
        COUNT(gps_points.id) AS point_count
      FROM walk_sessions
      LEFT JOIN gps_points ON gps_points.session_id = walk_sessions.id
      WHERE walk_sessions.activity_mode = ?
      GROUP BY walk_sessions.id
      ORDER BY walk_sessions.started_at DESC
    `,
    activityMode
  );

  return rows.map(mapSessionRow);
}

export async function deleteWalkSession(sessionId: number) {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM gps_points WHERE session_id = ?", sessionId);
  await db.runAsync("DELETE FROM walk_sessions WHERE id = ?", sessionId);
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

export async function deleteAllData() {
  const db = await getDatabase();

  await db.execAsync(`
    DELETE FROM gps_points;
    DELETE FROM walk_sessions;
  `);
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
    pointCount: row.point_count
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
