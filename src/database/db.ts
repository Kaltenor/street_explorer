import * as SQLite from "expo-sqlite";

let database: SQLite.SQLiteDatabase | null = null;

export async function getDatabase() {
  if (!database) {
    database = await SQLite.openDatabaseAsync("street_explorer.db");
  }

  return database;
}

export async function initDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  await applyMigration(1, "create_walk_tables", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS walk_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_mode TEXT NOT NULL DEFAULT 'walk',
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        distance_meters REAL NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS gps_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp TEXT NOT NULL,
        accuracy REAL,
        point_index INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS gps_points_session_index
        ON gps_points (session_id, point_index);
    `);
  });

  await applyMigration(2, "add_activity_mode_to_walk_sessions", async () => {
    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(walk_sessions)");
    const hasActivityMode = columns.some((column) => column.name === "activity_mode");

    if (!hasActivityMode) {
      await db.execAsync(`
        ALTER TABLE walk_sessions
          ADD COLUMN activity_mode TEXT NOT NULL DEFAULT 'walk';
      `);
    }

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS walk_sessions_activity_mode_index
      ON walk_sessions (activity_mode, started_at);
    `);
  });

  await applyMigration(3, "add_app_settings", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  });

  await applyMigration(4, "add_walk_session_display_name", async () => {
    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(walk_sessions)");
    const hasDisplayName = columns.some((column) => column.name === "display_name");

    if (!hasDisplayName) {
      await db.execAsync(`
        ALTER TABLE walk_sessions
          ADD COLUMN display_name TEXT;
      `);
    }
  });

  await applyMigration(5, "create_osm_street_segments", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS osm_street_segments (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        highway TEXT NOT NULL,
        coordinates_json TEXT NOT NULL,
        min_latitude REAL NOT NULL,
        max_latitude REAL NOT NULL,
        min_longitude REAL NOT NULL,
        max_longitude REAL NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS osm_street_segments_bounds_index
        ON osm_street_segments (min_latitude, max_latitude, min_longitude, max_longitude);
    `);
  });

  await applyMigration(6, "clear_oversized_osm_street_cache", async () => {
    await db.execAsync(`
      DELETE FROM osm_street_segments;
    `);
  });

  await applyMigration(7, "create_completion_tables", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_zone_id TEXT,
        source TEXT NOT NULL,
        geometry_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS explored_cells (
        mode TEXT NOT NULL,
        cell_size_m INTEGER NOT NULL,
        cell_x INTEGER NOT NULL,
        cell_y INTEGER NOT NULL,
        source TEXT NOT NULL,
        session_id INTEGER,
        created_at TEXT NOT NULL,
        PRIMARY KEY (mode, cell_size_m, cell_x, cell_y, source, session_id)
      );

      CREATE TABLE IF NOT EXISTS loop_fills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        mode TEXT NOT NULL,
        polygon_json TEXT NOT NULL,
        area_m2 REAL NOT NULL,
        total_walkable_street_length_m REAL NOT NULL,
        unwalked_walkable_street_length_m REAL NOT NULL,
        accepted INTEGER NOT NULL,
        rejection_reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS explored_cells_mode_index
        ON explored_cells (mode, cell_size_m, source);

      CREATE INDEX IF NOT EXISTS zones_type_index
        ON zones (type, name);
    `);
  });

  await applyMigration(8, "reset_explored_cells_for_15m_grid", async () => {
    await db.execAsync(`
      DELETE FROM explored_cells;
      DELETE FROM loop_fills;
    `);
  });

  await applyMigration(9, "create_zone_cell_totals", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS zone_cell_totals (
        zone_id TEXT NOT NULL,
        cell_size_m INTEGER NOT NULL,
        total_cells INTEGER NOT NULL,
        calculated_at TEXT NOT NULL,
        PRIMARY KEY (zone_id, cell_size_m)
      );
    `);
  });

  await applyMigration(10, "allow_global_loop_fills", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS loop_fills_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        mode TEXT NOT NULL,
        polygon_json TEXT NOT NULL,
        area_m2 REAL NOT NULL,
        total_walkable_street_length_m REAL NOT NULL,
        unwalked_walkable_street_length_m REAL NOT NULL,
        accepted INTEGER NOT NULL,
        rejection_reason TEXT,
        created_at TEXT NOT NULL
      );

      INSERT INTO loop_fills_next (
        id,
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
      SELECT
        id,
        session_id,
        mode,
        polygon_json,
        area_m2,
        total_walkable_street_length_m,
        unwalked_walkable_street_length_m,
        accepted,
        rejection_reason,
        created_at
      FROM loop_fills;

      DROP TABLE loop_fills;
      ALTER TABLE loop_fills_next RENAME TO loop_fills;
    `);
  });
}

async function applyMigration(id: number, name: string, migration: () => Promise<void>) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM schema_migrations WHERE id = ?",
    id
  );

  if (existing) {
    return;
  }

  await migration();
  await db.runAsync(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
    id,
    name,
    new Date().toISOString()
  );
}
