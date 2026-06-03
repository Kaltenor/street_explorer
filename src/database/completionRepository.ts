import { EXPLORATION_CELL_SIZE_METERS } from "../services/explorationArea";
import { MapCoordinate } from "../services/explorationArea";
import { ActivityMode } from "../types/walk";
import { getDatabase } from "./db";

export type CompletionScope = "country" | "city" | "district";
export type ExploredCellSource = "gps" | "inferred" | "loop_fill";

export type CachedZone = {
  fetchedAt: string;
  geometry: MapCoordinate[][];
  holes: MapCoordinate[][];
  id: string;
  name: string;
  parentZoneId: string | null;
  source: string;
  type: CompletionScope;
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

type ExploredCellInput = {
  cellKey: string;
  mode: ActivityMode;
  sessionId: number | null;
  source: ExploredCellSource;
};

type ZoneRow = {
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

export async function saveExploredCells(cells: ExploredCellInput[]) {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();

  for (const cell of cells) {
    const parsed = parseCellKey(cell.cellKey);

    await db.runAsync(
      `
        INSERT OR IGNORE INTO explored_cells (
          mode,
          cell_size_m,
          cell_x,
          cell_y,
          source,
          session_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      cell.mode,
      EXPLORATION_CELL_SIZE_METERS,
      parsed.x,
      parsed.y,
      cell.source,
      cell.sessionId,
      createdAt
    );
  }
}

export async function getLoopFillCellKeys(mode: ActivityMode | "all") {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ cell_x: number; cell_y: number }>(
    `
      SELECT DISTINCT cell_x, cell_y
      FROM explored_cells
      WHERE cell_size_m = ?
        AND source = 'loop_fill'
        AND (? = 'all' OR mode = ?)
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
    mode
  );

  return rows.map((row) => `${row.cell_x}:${row.cell_y}`);
}

export async function getLoopFillSessionSummaries(mode: ActivityMode | "all") {
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
      SELECT
        lf.session_id,
        COUNT(lf.id) AS loop_count,
        SUM(CASE WHEN lf.accepted = 1 THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN lf.accepted = 0 THEN 1 ELSE 0 END) AS rejected_count,
        MAX(lf.area_m2) AS area_m2,
        SUM(lf.total_walkable_street_length_m) AS total_walkable_street_length_m,
        SUM(lf.unwalked_walkable_street_length_m) AS unwalked_walkable_street_length_m,
        GROUP_CONCAT(DISTINCT lf.rejection_reason) AS rejection_reasons,
        COUNT(DISTINCT ec.cell_x || ':' || ec.cell_y) AS loop_filled_cell_count
      FROM loop_fills lf
      LEFT JOIN explored_cells ec
        ON ec.session_id = lf.session_id
        AND ec.source = 'loop_fill'
        AND ec.cell_size_m = ?
      WHERE (? = 'all' OR lf.mode = ?)
      GROUP BY lf.session_id
      ORDER BY MAX(lf.created_at) DESC
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
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

export async function getCompletionStats(mode: ActivityMode | "all"): Promise<CompletionStats> {
  const db = await getDatabase();
  const sourceRows = await db.getAllAsync<{ source: ExploredCellSource; count: number }>(
    `
      SELECT source, COUNT(DISTINCT cell_x || ':' || cell_y) AS count
      FROM explored_cells
      WHERE cell_size_m = ?
        AND (? = 'all' OR mode = ?)
      GROUP BY source
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
    mode
  );
  const totalRow = await db.getFirstAsync<{ count: number }>(
    `
      SELECT COUNT(DISTINCT cell_x || ':' || cell_y) AS count
      FROM explored_cells
      WHERE cell_size_m = ?
        AND (? = 'all' OR mode = ?)
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
    mode
  );
  const walkRow = await db.getFirstAsync<{
    recording_count: number;
    walked_distance_meters: number | null;
  }>(
    `
      SELECT COUNT(*) AS recording_count, SUM(distance_meters) AS walked_distance_meters
      FROM walk_sessions
      WHERE (? = 'all' OR activity_mode = ?)
    `,
    mode,
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

export async function getExploredCellRecords(mode: ActivityMode | "all") {
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
        AND (? = 'all' OR mode = ?)
    `,
    EXPLORATION_CELL_SIZE_METERS,
    mode,
    mode
  );

  return rows.map((row) => ({
    cellKey: `${row.cell_x}:${row.cell_y}`,
    mode: row.mode,
    source: row.source
  }));
}

export async function deleteExploredCellsForSession(sessionId: number) {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM explored_cells WHERE session_id = ?", sessionId);
  await db.runAsync("DELETE FROM loop_fills WHERE session_id = ?", sessionId);
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

export async function saveLoopFill(input: {
  accepted: boolean;
  areaM2: number;
  mode: ActivityMode;
  polygonJson: string;
  rejectionReason: string | null;
  sessionId: number | null;
  totalWalkableStreetLengthM: number;
  unwalkedWalkableStreetLengthM: number;
}) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT INTO loop_fills (
        session_id,
        mode,
        polygon_json,
        area_m2,
        total_walkable_street_length_m,
        unwalked_walkable_street_length_m,
        accepted,
        rejection_reason,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    input.sessionId,
    input.mode,
    input.polygonJson,
    input.areaM2,
    input.totalWalkableStreetLengthM,
    input.unwalkedWalkableStreetLengthM,
    input.accepted ? 1 : 0,
    input.rejectionReason,
    new Date().toISOString()
  );
}

export async function getCachedZones(type: CompletionScope): Promise<CachedZone[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ZoneRow>(
    `
      SELECT id, type, name, parent_zone_id, source, geometry_json, fetched_at
      FROM zones
      WHERE type = ?
      ORDER BY name
    `,
    type
  );

  return rows.map((row) => ({
    fetchedAt: row.fetched_at,
    ...parseZoneGeometry(row.geometry_json),
    id: row.id,
    name: row.name,
    parentZoneId: row.parent_zone_id,
    source: row.source,
    type: row.type
  }));
}

export async function upsertZones(zones: CachedZone[]) {
  const db = await getDatabase();

  for (const zone of zones) {
    await db.runAsync(
      `
        INSERT OR REPLACE INTO zones (
          id,
          type,
          name,
          parent_zone_id,
          source,
          geometry_json,
          fetched_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      zone.id,
      zone.type,
      zone.name,
      zone.parentZoneId,
      zone.source,
      JSON.stringify({
        holes: zone.holes,
        outer: zone.geometry
      }),
      zone.fetchedAt
    );
  }
}

export async function deleteCachedZones() {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM zones");
  await db.runAsync("DELETE FROM zone_cell_totals");
}

export async function getCachedZoneTotal(zoneId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total_cells: number }>(
    `
      SELECT total_cells
      FROM zone_cell_totals
      WHERE zone_id = ?
        AND cell_size_m = ?
    `,
    zoneId,
    EXPLORATION_CELL_SIZE_METERS
  );

  return row?.total_cells ?? null;
}

export async function saveCachedZoneTotal(zoneId: string, totalCells: number) {
  const db = await getDatabase();

  await db.runAsync(
    `
      INSERT OR REPLACE INTO zone_cell_totals (
        zone_id,
        cell_size_m,
        total_cells,
        calculated_at
      )
      VALUES (?, ?, ?, ?)
    `,
    zoneId,
    EXPLORATION_CELL_SIZE_METERS,
    totalCells,
    new Date().toISOString()
  );
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
