import type { SQLiteDatabase } from "expo-sqlite";

import { EXPLORATION_CELL_SIZE_METERS } from "../services/explorationArea";
import type { ExplorationPolygon } from "../services/explorationArea";
import { FORBIDDEN_ZONE_COMMENT_MAX_LENGTH } from "../services/forbiddenZones";
import { getDatabase, initDatabase } from "./db";

const FORBIDDEN_ZONE_CELL_INSERT_BATCH_SIZE = 50;
const FORBIDDEN_ZONE_WRITE_RETRY_DELAYS_MS = [0, 100, 300, 750] as const;

export type ForbiddenZone = {
  areaM2: number;
  cellIds: string[];
  comment: string | null;
  createdAt: string;
  id: number;
  polygons: ExplorationPolygon[];
  updatedAt: string;
};

export type ForbiddenZoneSnapshot = Omit<ForbiddenZone, "comment"> & {
  comment?: string | null;
};

type ForbiddenZoneJoinRow = {
  area_m2: number;
  cell_x: number | null;
  cell_y: number | null;
  comment: string | null;
  created_at: string;
  geometry_json: string;
  id: number;
  updated_at: string;
};

export async function getForbiddenZones(database?: SQLiteDatabase) {
  const db = database ?? await getInitializedDatabase();
  const rows = await db.getAllAsync<ForbiddenZoneJoinRow>(`
    SELECT forbidden_zones.id, forbidden_zones.geometry_json,
      forbidden_zones.area_m2, forbidden_zones.created_at,
      forbidden_zones.updated_at, forbidden_zones.comment,
      forbidden_zone_cells.cell_x,
      forbidden_zone_cells.cell_y
    FROM forbidden_zones
    LEFT JOIN forbidden_zone_cells
      ON forbidden_zone_cells.forbidden_zone_id = forbidden_zones.id
    ORDER BY forbidden_zones.id, forbidden_zone_cells.cell_x,
      forbidden_zone_cells.cell_y
  `);

  return mapForbiddenZoneRows(rows);
}

export async function createForbiddenZone(input: {
  areaM2: number;
  cellIds: readonly string[];
  polygons: readonly ExplorationPolygon[];
}) {
  if (input.cellIds.length === 0) {
    throw new Error("A Forbidden Zone requires at least one grid cell.");
  }

  const expectedAreaM2 =
    new Set(input.cellIds).size *
    EXPLORATION_CELL_SIZE_METERS *
    EXPLORATION_CELL_SIZE_METERS;

  if (Math.abs(input.areaM2 - expectedAreaM2) > 0.001) {
    throw new Error("Forbidden Zone area does not match its exact cell snapshot.");
  }

  const db = await getInitializedDatabase();
  const createdAt = new Date().toISOString();
  let zoneId = 0;

  await runForbiddenZoneWriteTransaction(db, async (transaction) => {
    // Repair cell rows left by older builds whose SQLite schema did not
    // actually enforce the declared ON DELETE CASCADE relationship.
    await deleteOrphanedForbiddenZoneCells(transaction);
    const result = await transaction.runAsync(
      `INSERT INTO forbidden_zones (
        geometry_json, area_m2, created_at, updated_at
      ) VALUES (?, ?, ?, ?)`,
      JSON.stringify(input.polygons),
      input.areaM2,
      createdAt,
      createdAt
    );
    zoneId = result.lastInsertRowId;
    await insertForbiddenZoneCells(transaction, zoneId, input.cellIds);
    await invalidateCompletionSnapshots(transaction);
  });

  return {
    areaM2: input.areaM2,
    cellIds: [...input.cellIds],
    comment: null,
    createdAt,
    id: zoneId,
    polygons: [...input.polygons],
    updatedAt: createdAt
  } satisfies ForbiddenZone;
}

export async function updateForbiddenZoneComment(id: number, comment: string) {
  const db = await getInitializedDatabase();
  const normalizedComment = normalizeForbiddenZoneComment(comment);
  const updatedAt = new Date().toISOString();

  await runForbiddenZoneWriteTransaction(db, async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE forbidden_zones
      SET comment = ?, updated_at = ?
      WHERE id = ?`,
      normalizedComment,
      updatedAt,
      id
    );

    if (result.changes !== 1) {
      throw new Error(`Forbidden Zone ${id} does not exist.`);
    }
  });

  return { comment: normalizedComment, updatedAt };
}

export async function deleteForbiddenZone(id: number) {
  const db = await getInitializedDatabase();

  await runForbiddenZoneWriteTransaction(db, async (transaction) => {
    // Keep this explicit rather than relying on PRAGMA foreign_keys or the
    // historical shape of an upgraded development database.
    await transaction.runAsync(
      "DELETE FROM forbidden_zone_cells WHERE forbidden_zone_id = ?",
      id
    );
    await transaction.runAsync("DELETE FROM forbidden_zones WHERE id = ?", id);
    await invalidateCompletionSnapshots(transaction);
  });
}

export async function getForbiddenCellKeysWithinBounds(input: {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}) {
  const db = await getInitializedDatabase();
  const rows = await db.getAllAsync<{ cell_x: number; cell_y: number }>(
    `SELECT cell_x, cell_y
    FROM forbidden_zone_cells
    WHERE cell_x BETWEEN ? AND ?
      AND cell_y BETWEEN ? AND ?
    ORDER BY cell_x, cell_y`,
    input.minX,
    input.maxX,
    input.minY,
    input.maxY
  );

  return rows.map((row) => `${row.cell_x}:${row.cell_y}`);
}

export async function replaceForbiddenZonesFromBackup(
  transaction: SQLiteDatabase,
  zones: readonly ForbiddenZoneSnapshot[]
) {
  await transaction.runAsync("DELETE FROM forbidden_zone_cells");
  await transaction.runAsync("DELETE FROM forbidden_zones");

  for (const zone of zones) {
    await transaction.runAsync(
      `INSERT INTO forbidden_zones (
        id, geometry_json, area_m2, comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      zone.id,
      JSON.stringify(zone.polygons),
      zone.areaM2,
      normalizeForbiddenZoneComment(zone.comment ?? ""),
      zone.createdAt,
      zone.updatedAt
    );
    await insertForbiddenZoneCells(transaction, zone.id, zone.cellIds);
  }

  await invalidateCompletionSnapshots(transaction);
}

async function deleteOrphanedForbiddenZoneCells(transaction: SQLiteDatabase) {
  await transaction.runAsync(`
    DELETE FROM forbidden_zone_cells
    WHERE NOT EXISTS (
      SELECT 1
      FROM forbidden_zones
      WHERE forbidden_zones.id = forbidden_zone_cells.forbidden_zone_id
    )
  `);
}

async function insertForbiddenZoneCells(
  transaction: SQLiteDatabase,
  zoneId: number,
  cellIds: readonly string[]
) {
  const uniqueCells = [...new Set(cellIds)].map(parseCellKey);

  for (
    let offset = 0;
    offset < uniqueCells.length;
    offset += FORBIDDEN_ZONE_CELL_INSERT_BATCH_SIZE
  ) {
    const batch = uniqueCells.slice(
      offset,
      offset + FORBIDDEN_ZONE_CELL_INSERT_BATCH_SIZE
    );
    const placeholders = batch.map(() => "(?, ?, ?, ?)").join(",");
    const values: number[] = [];

    for (const cell of batch) {
      values.push(zoneId, EXPLORATION_CELL_SIZE_METERS, cell.x, cell.y);
    }

    await transaction.runAsync(
      `INSERT INTO forbidden_zone_cells (
        forbidden_zone_id, cell_size_m, cell_x, cell_y
      ) VALUES ${placeholders}`,
      ...values
    );
  }
}

async function getInitializedDatabase() {
  await initDatabase();
  return getDatabase();
}

async function runForbiddenZoneWriteTransaction(
  database: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>
) {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt < FORBIDDEN_ZONE_WRITE_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    const delayMs = FORBIDDEN_ZONE_WRITE_RETRY_DELAYS_MS[attempt] ?? 0;

    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      await database.withExclusiveTransactionAsync(task);
      return;
    } catch (error) {
      lastError = error;

      if (!isTransientSqliteWriteContention(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function getForbiddenZonePersistenceFailureReason(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  if (isTransientSqliteWriteContention(error)) {
    return "database_busy" as const;
  }

  if (message.includes("no such table")) {
    return "schema_unavailable" as const;
  }

  if (
    message.includes("unique constraint") ||
    message.includes("constraint failed")
  ) {
    return "overlapping_zone" as const;
  }

  return "unknown" as const;
}

function isTransientSqliteWriteContention(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("database is locked") ||
    message.includes("database table is locked") ||
    message.includes("sqlite_busy")
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function invalidateCompletionSnapshots(transaction: SQLiteDatabase) {
  await transaction.runAsync("DELETE FROM zone_completion_snapshots");
  await transaction.runAsync(
    `UPDATE exploration_revisions
    SET revision = revision + 1
    WHERE mode = 'walk'`
  );
}

function mapForbiddenZoneRows(rows: ForbiddenZoneJoinRow[]) {
  const zones = new Map<number, ForbiddenZone>();

  for (const row of rows) {
    let zone = zones.get(row.id);

    if (!zone) {
      zone = {
        areaM2: row.area_m2,
        cellIds: [],
        comment: row.comment,
        createdAt: row.created_at,
        id: row.id,
        polygons: parsePolygons(row.geometry_json),
        updatedAt: row.updated_at
      };
      zones.set(row.id, zone);
    }

    if (row.cell_x !== null && row.cell_y !== null) {
      zone.cellIds.push(`${row.cell_x}:${row.cell_y}`);
    }
  }

  return [...zones.values()];
}

function normalizeForbiddenZoneComment(comment: string) {
  const normalized = comment.trim();

  if (/\r|\n/.test(normalized)) {
    throw new Error("Forbidden Zone comments must use one line.");
  }

  if (normalized.length > FORBIDDEN_ZONE_COMMENT_MAX_LENGTH) {
    throw new Error(
      `Forbidden Zone comments are limited to ${FORBIDDEN_ZONE_COMMENT_MAX_LENGTH} characters.`
    );
  }

  return normalized || null;
}

function parsePolygons(value: string): ExplorationPolygon[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed) ? parsed as ExplorationPolygon[] : [];
  } catch {
    return [];
  }
}

function parseCellKey(cellId: string) {
  const [x, y] = cellId.split(":").map(Number);

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Invalid Forbidden Zone cell key: ${cellId}`);
  }

  return { x: x as number, y: y as number };
}
