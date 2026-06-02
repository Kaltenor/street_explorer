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
