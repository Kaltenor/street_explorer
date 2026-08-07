import type { SQLiteDatabase } from "expo-sqlite";

import { EXPLORATION_CELL_SIZE_METERS } from "../services/explorationArea";
import { MapCoordinate } from "../services/explorationArea";
import { ActivityMode, RenderedRouteSegment } from "../types/walk";
import { shouldReplaceCachedZone } from "../services/zoneBoundaryPolicy";
import { getDatabase } from "./db";

export type CompletionScope = "country" | "city" | "district";
export type ExploredCellSource = "gps" | "inferred" | "loop_fill";

export type CachedZone = {
  adminLevel?: number | null;
  fetchedAt: string;
  geometry: MapCoordinate[][];
  holes: MapCoordinate[][];
  id: string;
  name: string;
  parentZoneId: string | null;
  source: string;
  type: CompletionScope;
};
export type ZoneAchievement = {
  boundaryFetchedAt: string;
  boundarySource: string;
  completedAt: string;
  exploredCells: number;
  geometryFingerprint: string;
  totalZoneCells: number;
  zoneId: string;
  zoneName: string;
  zoneType: CompletionScope;
};

export type ZoneAchievementRollup = {
  city: number;
  district: number;
};

export type ZoneRefreshState = {
  errorMessage: string | null;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  status: "failed" | "idle" | "refreshing" | "succeeded";
};

export type CompletionStats = {
  directlyWalkedCells: number;
  exploredCells: number;
  inferredCells: number;
  loopFilledCells: number;
  walkedDistanceMeters: number;
  recordingCount: number;
};

export type LoopFillSessionSummary = {
  accepted: boolean;
  filledLoopCount: number;
  areaM2: number;
  loopFilledCellCount: number;
  rejectedLoopCount: number;
  rejectionReason: string | null;
  totalWalkableStreetLengthM: number;
  unwalkedWalkableStreetLengthM: number;
};

export type ExploredCellInput = {
  cellKey: string;
  mode: ActivityMode;
  sessionId: number | null;
  source: ExploredCellSource;
};

type ZoneRow = {
  admin_level: number | null;
  fetched_at: string;
  geometry_json: string;
  id: string;
  name: string;
  parent_zone_id: string | null;
  source: string;
  type: CompletionScope;
};

export type ExploredCellRecord = {
  cellKey: string;
  mode: ActivityMode;
  source: ExploredCellSource;
};

export type CachedZoneCompletionStats = {
  completedAt: string | null;
  completionPercent: number | null;
  completionStatus: "available" | "invalid_boundary" | "too_large";
  directlyWalkedCells: number;
  exploredCells: number;
  inferredCells: number;
  loopFilledCells: number;
  permanentlyCompleted: boolean;
  totalZoneCells: number | null;
};

export type ZoneCompletionSnapshot = {
  calculatedAt: string;
  explorationRevision: number;
  geometryFingerprint: string;
  mode: ActivityMode;
  stats: CachedZoneCompletionStats;
  zoneId: string;
};

export async function saveExploredCells(cells: ExploredCellInput[]) {
  if (cells.length === 0) {
    return;
  }

  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await insertExploredCells(transaction, cells, new Date().toISOString());
  });
}

export async function commitPendingRecordingRepair(input: {
  activityMode: ActivityMode;
  expectedSourceMaxPointId: number;
  expectedSourcePointCount: number;
  expectedRouteSegments: RenderedRouteSegment[];
  gpsCellIds: string[];
  inferredCellIds: string[];
  sessionId: number;
}): Promise<boolean> {
  const db = await getDatabase();
  let committed = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const repair = await transaction.getFirstAsync<{ session_id: number }>(
      `
        SELECT pending_recording_repairs.session_id
        FROM pending_recording_repairs
        JOIN walk_sessions
          ON walk_sessions.id = pending_recording_repairs.session_id
        JOIN route_snapshots
          ON route_snapshots.session_id = pending_recording_repairs.session_id
        WHERE pending_recording_repairs.session_id = ?
          AND walk_sessions.activity_mode = ?
          AND walk_sessions.ended_at > walk_sessions.started_at
          AND route_snapshots.source_point_count = ?
          AND route_snapshots.source_max_point_id = ?
          AND route_snapshots.segments_json = ?
          AND ? = (
            SELECT COUNT(*)
            FROM gps_points
            WHERE gps_points.session_id = pending_recording_repairs.session_id
          )
          AND ? = (
            SELECT COALESCE(MAX(id), 0)
            FROM gps_points
            WHERE gps_points.session_id = pending_recording_repairs.session_id
          )
      `,
      input.sessionId,
      input.activityMode,
      input.expectedSourcePointCount,
      input.expectedSourceMaxPointId,
      JSON.stringify(input.expectedRouteSegments),
      input.expectedSourcePointCount,
      input.expectedSourceMaxPointId
    );

    if (!repair) {
      return;
    }

    await insertExploredCells(
      transaction,
      [
        ...input.gpsCellIds.map((cellKey) => ({
          cellKey,
          mode: input.activityMode,
          sessionId: input.sessionId,
          source: "gps" as const
        })),
        ...input.inferredCellIds.map((cellKey) => ({
          cellKey,
          mode: input.activityMode,
          sessionId: input.sessionId,
          source: "inferred" as const
        }))
      ],
      new Date().toISOString()
    );

    const result = await transaction.runAsync(
      "DELETE FROM pending_recording_repairs WHERE session_id = ?",
      input.sessionId
    );
    committed = result.changes > 0;
  });

  return committed;
}

async function insertExploredCells(
  transaction: SQLiteDatabase,
  cells: ExploredCellInput[],
  createdAt: string
) {
  const batchSize = 100;

  for (let offset = 0; offset < cells.length; offset += batchSize) {
    const batch = cells.slice(offset, offset + batchSize);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values: Array<number | string | null> = [];

    for (const cell of batch) {
      const parsed = parseCellKey(cell.cellKey);

      values.push(
        cell.mode,
        EXPLORATION_CELL_SIZE_METERS,
        parsed.x,
        parsed.y,
        cell.source,
        cell.sessionId,
        createdAt
      );
    }

    await transaction.runAsync(
      "INSERT OR IGNORE INTO explored_cells " +
        "(mode, cell_size_m, cell_x, cell_y, source, session_id, created_at) VALUES " +
        placeholders,
      values
    );
  }
}
export async function getLoopFillCellKeys(mode: ActivityMode) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ cell_x: number; cell_y: number }>(
    `
      SELECT DISTINCT cell_x, cell_y
      FROM explored_cells
      WHERE cell_size_m = ?
        AND source = 'loop_fill'
        AND mode = ?
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode
  );

  return rows.map((row) => `${row.cell_x}:${row.cell_y}`);
}

export async function getLoopFillSessionSummaries(mode: ActivityMode) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    accepted_count: number;
    area_m2: number;
    loop_count: number;
    loop_filled_cell_count: number;
    rejected_count: number;
    rejection_reasons: string | null;
    session_id: number;
    total_walkable_street_length_m: number;
    unwalked_walkable_street_length_m: number;
  }>(
    `
      WITH loop_summary AS (
        SELECT
          session_id,
          COUNT(id) AS loop_count,
          SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted_count,
          SUM(CASE WHEN accepted = 0 THEN 1 ELSE 0 END) AS rejected_count,
          MAX(area_m2) AS area_m2,
          SUM(total_walkable_street_length_m) AS total_walkable_street_length_m,
          SUM(unwalked_walkable_street_length_m) AS unwalked_walkable_street_length_m,
          GROUP_CONCAT(DISTINCT rejection_reason) AS rejection_reasons,
          MAX(created_at) AS latest_created_at
        FROM loop_fills
        WHERE mode = ?
        GROUP BY session_id
      ),
      cell_summary AS (
        SELECT session_id, COUNT(*) AS loop_filled_cell_count
        FROM (
          SELECT session_id, cell_x, cell_y
          FROM explored_cells
          WHERE source = 'loop_fill'
            AND cell_size_m = ?
            AND mode = ?
          GROUP BY session_id, cell_x, cell_y
        )
        GROUP BY session_id
      )
      SELECT
        loop_summary.session_id,
        loop_summary.loop_count,
        loop_summary.accepted_count,
        loop_summary.rejected_count,
        loop_summary.area_m2,
        loop_summary.total_walkable_street_length_m,
        loop_summary.unwalked_walkable_street_length_m,
        loop_summary.rejection_reasons,
        COALESCE(cell_summary.loop_filled_cell_count, 0) AS loop_filled_cell_count
      FROM loop_summary
      LEFT JOIN cell_summary
        ON cell_summary.session_id = loop_summary.session_id
      ORDER BY loop_summary.latest_created_at DESC
    `,
    mode,
    EXPLORATION_CELL_SIZE_METERS,
    mode
  );

  return Object.fromEntries(
    rows.map((row) => [
      row.session_id,
      {
        accepted: row.accepted_count > 0,
        areaM2: row.area_m2,
        filledLoopCount: row.accepted_count,
        loopFilledCellCount: row.loop_filled_cell_count,
        rejectedLoopCount: row.rejected_count,
        rejectionReason: row.rejection_reasons,
        totalWalkableStreetLengthM: row.total_walkable_street_length_m,
        unwalkedWalkableStreetLengthM: row.unwalked_walkable_street_length_m
      } satisfies LoopFillSessionSummary
    ])
  );
}

export async function getCompletionStats(mode: ActivityMode): Promise<CompletionStats> {
  const db = await getDatabase();
  const sourceRows = await db.getAllAsync<{ source: ExploredCellSource; count: number }>(
    `
      SELECT source, COUNT(*) AS count
      FROM (
        SELECT source, cell_x, cell_y
        FROM explored_cells
        WHERE cell_size_m = ?
          AND mode = ?
        GROUP BY source, cell_x, cell_y
      )
      GROUP BY source
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode
  );
  const totalRow = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM (
        SELECT cell_x, cell_y
        FROM explored_cells
        WHERE cell_size_m = ?
          AND mode = ?
        GROUP BY cell_x, cell_y
      )
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode
  );
  const walkRow = await db.getFirstAsync<{
    recording_count: number;
    walked_distance_meters: number | null;
  }>(
    `
      SELECT COUNT(*) AS recording_count, SUM(distance_meters) AS walked_distance_meters
      FROM walk_sessions
      WHERE activity_mode = ?
        AND ended_at > started_at
    `,
    mode
  );
  const counts = Object.fromEntries(sourceRows.map((row) => [row.source, row.count]));

  return {
    directlyWalkedCells: counts.gps ?? 0,
    exploredCells: totalRow?.count ?? 0,
    inferredCells: counts.inferred ?? 0,
    loopFilledCells: counts.loop_fill ?? 0,
    recordingCount: walkRow?.recording_count ?? 0,
    walkedDistanceMeters: walkRow?.walked_distance_meters ?? 0
  };
}

export async function getExploredCellRecords(mode: ActivityMode) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    cell_x: number;
    cell_y: number;
    mode: ActivityMode;
    source: ExploredCellSource;
  }>(
    `
      SELECT DISTINCT cell_x, cell_y, mode, source
      FROM explored_cells
      WHERE cell_size_m = ?
        AND mode = ?
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode
  );

  return rows.map((row) => ({
    cellKey: `${row.cell_x}:${row.cell_y}`,
    mode: row.mode,
    source: row.source
  }));
}


export async function getExplorationRevision(mode: ActivityMode) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ revision: number }>(
    "SELECT revision FROM exploration_revisions WHERE mode = ?",
    mode
  );

  return row?.revision ?? 0;
}
export async function getExploredCellKeys(mode: ActivityMode) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ cell_x: number; cell_y: number }>(
    `
      SELECT DISTINCT cell_x, cell_y
      FROM explored_cells
      WHERE cell_size_m = ?
        AND mode = ?
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode
  );

  return rows.map((row) => `${row.cell_x}:${row.cell_y}`);
}

export async function getTodayNewExploredCellKeys(mode: ActivityMode) {
  const db = await getDatabase();
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const tomorrowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
  const todayStartIso = todayStart.toISOString();
  const rows = await db.getAllAsync<{ cell_x: number; cell_y: number }>(
    `
      SELECT DISTINCT current_cells.cell_x, current_cells.cell_y
      FROM explored_cells current_cells
      JOIN walk_sessions current_sessions
        ON current_sessions.id = current_cells.session_id
      WHERE current_cells.cell_size_m = ?
        AND current_cells.mode = ?
        AND current_sessions.started_at >= ?
        AND current_sessions.started_at < ?
        AND NOT EXISTS (
          SELECT 1
          FROM explored_cells previous_cells
          JOIN walk_sessions previous_sessions
            ON previous_sessions.id = previous_cells.session_id
          WHERE previous_cells.cell_size_m = current_cells.cell_size_m
            AND previous_cells.mode = current_cells.mode
            AND previous_cells.cell_x = current_cells.cell_x
            AND previous_cells.cell_y = current_cells.cell_y
            AND previous_sessions.started_at < ?
        )
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
    todayStartIso,
    tomorrowStart.toISOString(),
    todayStartIso
  );

  return rows.map((row) => `${row.cell_x}:${row.cell_y}`);
}

export async function getNewExploredCellKeysSince(
  mode: ActivityMode,
  acceptedAt: string
) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ cell_x: number; cell_y: number }>(
    `SELECT DISTINCT current_cells.cell_x, current_cells.cell_y
    FROM explored_cells current_cells
    JOIN walk_sessions current_sessions
      ON current_sessions.id = current_cells.session_id
    WHERE current_cells.cell_size_m = ?
      AND current_cells.mode = ?
      AND current_sessions.started_at >= ?
      AND current_sessions.ended_at > current_sessions.started_at
      AND NOT EXISTS (
        SELECT 1
        FROM explored_cells previous_cells
        JOIN walk_sessions previous_sessions
          ON previous_sessions.id = previous_cells.session_id
        WHERE previous_cells.cell_size_m = current_cells.cell_size_m
          AND previous_cells.mode = current_cells.mode
          AND previous_cells.cell_x = current_cells.cell_x
          AND previous_cells.cell_y = current_cells.cell_y
          AND previous_sessions.started_at < ?
      )`,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
    acceptedAt,
    acceptedAt
  );

  return rows.map((row) => `${row.cell_x}:${row.cell_y}`);
}

export async function deleteLoopFillDataForMode(mode: ActivityMode) {
  const db = await getDatabase();

  await db.runAsync(
    `
      DELETE FROM explored_cells
      WHERE mode = ?
        AND source = 'loop_fill'
    `,
    mode
  );
  await db.runAsync(
    `
      DELETE FROM loop_fills
      WHERE mode = ?
    `,
    mode
  );
}

export type LoopFillInput = {
  accepted: boolean;
  areaM2: number;
  mode: ActivityMode;
  polygonJson: string;
  rejectionReason: string | null;
  sessionId: number | null;
  totalWalkableStreetLengthM: number;
  unwalkedWalkableStreetLengthM: number;
};

export async function replaceExplorationForMode(
  mode: ActivityMode,
  cells: ExploredCellInput[],
  loopFills: LoopFillInput[]
) {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync("DELETE FROM explored_cells WHERE mode = ?", mode);
    await transaction.runAsync("DELETE FROM loop_fills WHERE mode = ?", mode);
    await insertExploredCells(transaction, cells, createdAt);

    for (const input of loopFills) {
      await insertLoopFill(transaction, input, createdAt);
    }
  });
}

export async function saveLoopFill(input: LoopFillInput) {
  const db = await getDatabase();
  await insertLoopFill(db, input, new Date().toISOString());
}

async function insertLoopFill(
  transaction: SQLiteDatabase,
  input: LoopFillInput,
  createdAt: string
) {
  await transaction.runAsync(
    "INSERT INTO loop_fills (" +
      "session_id, mode, polygon_json, area_m2, " +
      "total_walkable_street_length_m, unwalked_walkable_street_length_m, " +
      "accepted, rejection_reason, created_at" +
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    input.sessionId,
    input.mode,
    input.polygonJson,
    input.areaM2,
    input.totalWalkableStreetLengthM,
    input.unwalkedWalkableStreetLengthM,
    input.accepted ? 1 : 0,
    input.rejectionReason,
    createdAt
  );
}
export async function getCachedZones(type: CompletionScope): Promise<CachedZone[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ZoneRow>(
    `
      SELECT id, type, name, parent_zone_id, admin_level, source, geometry_json, fetched_at
      FROM zones
      WHERE type = ?
        AND (type <> 'district' OR admin_level = 9)
      ORDER BY name
    `,
    type
  );

  return rows.map(mapZoneRow);
}

export async function getCachedZoneById(id: string): Promise<CachedZone | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ZoneRow>(
    `
      SELECT id, type, name, parent_zone_id, admin_level, source, geometry_json, fetched_at
      FROM zones
      WHERE id = ?
    `,
    id
  );

  return row ? mapZoneRow(row) : null;
}

function mapZoneRow(row: ZoneRow): CachedZone {
  return {
    adminLevel: row.admin_level,
    fetchedAt: row.fetched_at,
    ...parseZoneGeometry(row.geometry_json),
    id: row.id,
    name: row.name,
    parentZoneId: row.parent_zone_id,
    source: row.source,
    type: row.type
  };
}

export async function upsertZones(zones: CachedZone[]) {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const zone of zones) {
      const geometryJson = JSON.stringify({
        holes: zone.holes,
        outer: zone.geometry
      });
      const existing = await transaction.getFirstAsync<{
        geometry_json: string;
        source: string;
      }>(
        "SELECT geometry_json, source FROM zones WHERE id = ?",
        zone.id
      );

      if (!shouldReplaceCachedZone(existing?.source ?? null, zone.source)) {
        continue;
      }

      if (existing && existing.geometry_json !== geometryJson) {
        await transaction.runAsync(
          "DELETE FROM zone_cell_totals WHERE zone_id = ?",
          zone.id
        );
        await transaction.runAsync(
          "DELETE FROM zone_completion_snapshots WHERE zone_id = ?",
          zone.id
        );
      }

      await transaction.runAsync(
        `
          INSERT OR REPLACE INTO zones (
            id,
            type,
            name,
            parent_zone_id,
            admin_level,
            source,
            geometry_json,
            fetched_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        zone.id,
        zone.type,
        zone.name,
        zone.parentZoneId,
        zone.adminLevel ?? null,
        zone.source,
        geometryJson,
        zone.fetchedAt
      );
    }
  });
}

export async function deleteCachedZones() {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM zone_completion_snapshots");
  await db.runAsync("DELETE FROM zones");
  await db.runAsync("DELETE FROM zone_cell_totals");
  await db.runAsync("DELETE FROM zone_refresh_state");
}


export async function getZoneCompletionSnapshot(
  zoneId: string,
  mode: ActivityMode
): Promise<ZoneCompletionSnapshot | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    calculated_at: string;
    exploration_revision: number;
    geometry_fingerprint: string;
    mode: ActivityMode;
    stats_json: string;
    zone_id: string;
  }>(
    `
      SELECT zone_id, mode, geometry_fingerprint, exploration_revision,
        stats_json, calculated_at
      FROM zone_completion_snapshots
      WHERE zone_id = ?
        AND mode = ?
    `,
    zoneId,
    mode
  );

  if (!row) {
    return null;
  }

  try {
    return {
      calculatedAt: row.calculated_at,
      explorationRevision: row.exploration_revision,
      geometryFingerprint: row.geometry_fingerprint,
      mode: row.mode,
      stats: JSON.parse(row.stats_json) as CachedZoneCompletionStats,
      zoneId: row.zone_id
    };
  } catch {
    await db.runAsync(
      "DELETE FROM zone_completion_snapshots WHERE zone_id = ? AND mode = ?",
      zoneId,
      mode
    );
    return null;
  }
}

export async function saveZoneCompletionSnapshot(input: ZoneCompletionSnapshot) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT OR REPLACE INTO zone_completion_snapshots (
        zone_id, mode, geometry_fingerprint, exploration_revision,
        stats_json, calculated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    input.zoneId,
    input.mode,
    input.geometryFingerprint,
    input.explorationRevision,
    JSON.stringify(input.stats),
    input.calculatedAt
  );
}
export async function getCachedZoneTotal(
  zoneId: string,
  geometryFingerprint: string
) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total_cells: number }>(
    `
      SELECT total_cells
      FROM zone_cell_totals
      WHERE zone_id = ?
        AND cell_size_m = ?
        AND geometry_fingerprint = ?
    `,
    zoneId,
    EXPLORATION_CELL_SIZE_METERS,
    geometryFingerprint
  );

  return row?.total_cells ?? null;
}

export async function saveCachedZoneTotal(
  zoneId: string,
  totalCells: number,
  geometryFingerprint: string
) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT OR REPLACE INTO zone_cell_totals (
        zone_id,
        cell_size_m,
        total_cells,
        calculated_at,
        geometry_fingerprint
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    zoneId,
    EXPLORATION_CELL_SIZE_METERS,
    totalCells,
    new Date().toISOString(),
    geometryFingerprint
  );
}

export async function getZoneAchievement(zoneId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ZoneAchievementRow>(
    `
      SELECT zone_id, zone_type, zone_name, completed_at, explored_cells,
        total_zone_cells, boundary_fetched_at, boundary_source,
        geometry_fingerprint
      FROM zone_achievements
      WHERE zone_id = ?
    `,
    zoneId
  );

  return row ? mapZoneAchievementRow(row) : null;
}

export async function getZoneAchievements() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ZoneAchievementRow>(`
    SELECT zone_id, zone_type, zone_name, completed_at, explored_cells,
      total_zone_cells, boundary_fetched_at, boundary_source,
      geometry_fingerprint
    FROM zone_achievements
    ORDER BY completed_at DESC
  `);

  return rows.map(mapZoneAchievementRow);
}

export async function getZoneAchievementRollup(): Promise<ZoneAchievementRollup> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ count: number; zone_type: CompletionScope }>(`
    SELECT achievements.zone_type, COUNT(*) AS count
    FROM zone_achievements AS achievements
    LEFT JOIN zones ON zones.id = achievements.zone_id
    WHERE achievements.zone_type = 'city'
      OR (
        achievements.zone_type = 'district'
        AND zones.admin_level = 9
      )
    GROUP BY achievements.zone_type
  `);
  const counts = Object.fromEntries(rows.map((row) => [row.zone_type, row.count]));

  return {
    city: counts.city ?? 0,
    district: counts.district ?? 0
  };
}

export async function recordZoneAchievement(input: ZoneAchievement) {
  const db = await getDatabase();
  const result = await db.runAsync(
    `
      INSERT OR IGNORE INTO zone_achievements (
        zone_id, zone_type, zone_name, completed_at, explored_cells,
        total_zone_cells, boundary_fetched_at, boundary_source,
        geometry_fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    input.zoneId,
    input.zoneType,
    input.zoneName,
    input.completedAt,
    input.exploredCells,
    input.totalZoneCells,
    input.boundaryFetchedAt,
    input.boundarySource,
    input.geometryFingerprint
  );

  return result.changes > 0;
}

export async function getZoneRefreshState(): Promise<ZoneRefreshState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    error_message: string | null;
    last_attempted_at: string | null;
    last_succeeded_at: string | null;
    status: ZoneRefreshState["status"];
  }>(`
    SELECT status, last_attempted_at, last_succeeded_at, error_message
    FROM zone_refresh_state
    WHERE id = 1
  `);

  return row
    ? {
        errorMessage:
          row.status === "refreshing"
            ? "The previous boundary refresh was interrupted."
            : row.error_message,
        lastAttemptedAt: row.last_attempted_at,
        lastSucceededAt: row.last_succeeded_at,
        status: row.status === "refreshing" ? "failed" : row.status
      }
    : {
        errorMessage: null,
        lastAttemptedAt: null,
        lastSucceededAt: null,
        status: "idle"
      };
}

export async function saveZoneRefreshState(state: ZoneRefreshState) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO zone_refresh_state (
        id, status, last_attempted_at, last_succeeded_at, error_message
      )
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        last_attempted_at = excluded.last_attempted_at,
        last_succeeded_at = excluded.last_succeeded_at,
        error_message = excluded.error_message
    `,
    state.status,
    state.lastAttemptedAt,
    state.lastSucceededAt,
    state.errorMessage
  );
}

type ZoneAchievementRow = {
  boundary_fetched_at: string;
  boundary_source: string;
  completed_at: string;
  explored_cells: number;
  geometry_fingerprint: string;
  total_zone_cells: number;
  zone_id: string;
  zone_name: string;
  zone_type: CompletionScope;
};

function mapZoneAchievementRow(row: ZoneAchievementRow): ZoneAchievement {
  return {
    boundaryFetchedAt: row.boundary_fetched_at,
    boundarySource: row.boundary_source,
    completedAt: row.completed_at,
    exploredCells: row.explored_cells,
    geometryFingerprint: row.geometry_fingerprint,
    totalZoneCells: row.total_zone_cells,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    zoneType: row.zone_type
  };
}
function parseCellKey(cellKey: string) {
  const [x, y] = cellKey.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}

function parseZoneGeometry(value: string): Pick<CachedZone, "geometry" | "holes"> {
  try {
    const parsed = JSON.parse(value) as MapCoordinate[][] | {
      holes?: MapCoordinate[][];
      outer?: MapCoordinate[][];
    };

    if (Array.isArray(parsed)) {
      return {
        geometry: parsed,
        holes: []
      };
    }

    if (parsed && "outer" in parsed && Array.isArray(parsed.outer)) {
      return {
        geometry: parsed.outer,
        holes: Array.isArray(parsed.holes) ? parsed.holes : []
      };
    }
  } catch {
    return {
      geometry: [],
      holes: []
    };
  }

  return {
    geometry: [],
    holes: []
  };
}
