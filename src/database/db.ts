import * as SQLite from "expo-sqlite";
import { BUNDLED_MEDAL_ALBUMS } from "../data/medalAlbums";

let database: SQLite.SQLiteDatabase | null = null;
let databaseOpenPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let databaseInitializationPromise: Promise<void> | null = null;

export async function getDatabase() {
  if (database) {
    return database;
  }

  if (!databaseOpenPromise) {
    databaseOpenPromise = SQLite.openDatabaseAsync("street_explorer.db")
      .then((openedDatabase) => {
        database = openedDatabase;
        return openedDatabase;
      })
      .catch((error) => {
        databaseOpenPromise = null;
        throw error;
      });
  }

  return databaseOpenPromise;
}

export function initDatabase() {
  if (!databaseInitializationPromise) {
    databaseInitializationPromise = initializeDatabase().catch((error) => {
      databaseInitializationPromise = null;
      throw error;
    });
  }

  return databaseInitializationPromise;
}

async function initializeDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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

  await applyMigration(11, "add_step_count_to_walk_sessions", async () => {
    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(walk_sessions)");
    const hasStepCount = columns.some((column) => column.name === "step_count");

    if (!hasStepCount) {
      await db.execAsync(`
        ALTER TABLE walk_sessions
          ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0;
      `);
    }
  });

  await applyMigration(12, "freeze_rendered_routes_and_deduplicate_gps", async () => {
    await db.execAsync(`
      DELETE FROM gps_points
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM gps_points
        GROUP BY session_id, timestamp
      );

      CREATE UNIQUE INDEX IF NOT EXISTS gps_points_session_timestamp_index
        ON gps_points (session_id, timestamp);

      CREATE TABLE IF NOT EXISTS route_snapshots (
        session_id INTEGER PRIMARY KEY NOT NULL,
        segments_json TEXT NOT NULL,
        source_point_count INTEGER NOT NULL,
        source_max_point_id INTEGER NOT NULL DEFAULT 0,
        algorithm_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE CASCADE
      );
    `);
  });
  await applyMigration(13, "reset_unstable_osm_segment_ids", async () => {
    // Older fetches numbered only the locally returned pieces of each OSM way.
    // Overlapping fetch windows could therefore overwrite an unrelated road piece
    // under the same ID and leave gaps in the routing graph.
    await db.execAsync("DELETE FROM osm_street_segments;");
  });
  await applyMigration(14, "track_pending_recording_repairs", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_recording_repairs (
        session_id INTEGER PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE CASCADE
      );
    `);
  });
  await applyMigration(15, "track_route_snapshot_gps_generation", async () => {
    const columns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(route_snapshots)"
    );
    const hasSourceMaxPointId = columns.some(
      (column) => column.name === "source_max_point_id"
    );

    if (!hasSourceMaxPointId) {
      await db.execAsync(`
        ALTER TABLE route_snapshots
          ADD COLUMN source_max_point_id INTEGER NOT NULL DEFAULT 0;
      `);
    }

    await db.execAsync(`
      UPDATE route_snapshots
      SET source_max_point_id = COALESCE((
        SELECT MAX(gps_points.id)
        FROM gps_points
        WHERE gps_points.session_id = route_snapshots.session_id
      ), 0);
    `);
  });
  await applyMigration(16, "retain_order-independent_gps_observations", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS gps_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp TEXT NOT NULL,
        accuracy REAL,
        processed INTEGER NOT NULL DEFAULT 0,
        accepted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE CASCADE,
        UNIQUE (session_id, timestamp)
      );

      CREATE INDEX IF NOT EXISTS gps_observations_session_timestamp_index
        ON gps_observations (session_id, timestamp);

      INSERT OR IGNORE INTO gps_observations (
        session_id, latitude, longitude, timestamp, accuracy, processed, accepted
      )
      SELECT
        session_id, latitude, longitude, timestamp, accuracy, 1, 1
      FROM gps_points;
    `);
  });
  await applyMigration(17, "retain_underfilled_recordings_for_late_gps", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_recording_discards (
        session_id INTEGER PRIMARY KEY NOT NULL,
        discard_after TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS pending_recording_discards_after_index
        ON pending_recording_discards (discard_after);
    `);
  });
  await applyMigration(18, "consolidate_exploration_into_walks", async () => {
    await db.execAsync(`
      UPDATE walk_sessions
      SET activity_mode = 'walk'
      WHERE activity_mode <> 'walk';

      INSERT OR IGNORE INTO explored_cells (
        mode, cell_size_m, cell_x, cell_y, source, session_id, created_at
      )
      SELECT
        'walk', cell_size_m, cell_x, cell_y, source, session_id, created_at
      FROM explored_cells
      WHERE mode <> 'walk';

      DELETE FROM explored_cells
      WHERE mode <> 'walk';

      UPDATE loop_fills
      SET mode = 'walk'
      WHERE mode <> 'walk';

      DELETE FROM app_settings
      WHERE key IN (
        'last_activity_mode',
        'default_activity_mode',
        'completion_objective'
      );

      UPDATE app_settings
      SET value = 'walk'
      WHERE key = 'active_recording_mode';
    `);
  });

  await applyMigration(19, "create_landmark_medal_tables", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medal_albums (
        id TEXT PRIMARY KEY NOT NULL,
        city_id TEXT NOT NULL,
        city_name_json TEXT NOT NULL,
        definition_version INTEGER NOT NULL,
        published_at TEXT NOT NULL,
        source_attribution TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS medals (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        name_json TEXT NOT NULL,
        description_json TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        external_source TEXT NOT NULL,
        external_type TEXT NOT NULL,
        external_id INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS medal_album_items (
        album_id TEXT NOT NULL,
        medal_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (album_id, medal_id),
        FOREIGN KEY (album_id) REFERENCES medal_albums (id) ON DELETE CASCADE,
        FOREIGN KEY (medal_id) REFERENCES medals (id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS medal_acquisition_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id TEXT NOT NULL,
        medal_id TEXT NOT NULL,
        session_id INTEGER,
        reason TEXT NOT NULL,
        enclosure_id TEXT NOT NULL,
        anchor_cell_id TEXT NOT NULL,
        enclosure_area_m2 REAL NOT NULL,
        enclosure_cells_json TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        FOREIGN KEY (album_id) REFERENCES medal_albums (id),
        FOREIGN KEY (medal_id) REFERENCES medals (id),
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS collected_medals (
        album_id TEXT NOT NULL,
        medal_id TEXT NOT NULL,
        acquisition_event_id INTEGER NOT NULL,
        presentation_state TEXT NOT NULL DEFAULT 'pending',
        presented_at TEXT,
        PRIMARY KEY (album_id, medal_id),
        FOREIGN KEY (album_id) REFERENCES medal_albums (id) ON DELETE CASCADE,
        FOREIGN KEY (medal_id) REFERENCES medals (id) ON DELETE CASCADE,
        FOREIGN KEY (acquisition_event_id) REFERENCES medal_acquisition_events (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS collected_medals_presentation_index
        ON collected_medals (presentation_state);
      CREATE INDEX IF NOT EXISTS medal_acquisition_events_session_index
        ON medal_acquisition_events (session_id, acquired_at);
    `);
  });

  await applyMigration(20, "create_poi_candidate_review_tables", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS poi_candidate_fetches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        city_id TEXT NOT NULL,
        bounds_json TEXT NOT NULL,
        source TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        error_message TEXT
      );
      CREATE TABLE IF NOT EXISTS poi_candidates (
        fetch_id INTEGER NOT NULL,
        external_type TEXT NOT NULL,
        external_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        tags_json TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'unreviewed',
        PRIMARY KEY (fetch_id, external_type, external_id),
        FOREIGN KEY (fetch_id) REFERENCES poi_candidate_fetches (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS poi_candidates_review_index
        ON poi_candidates (review_status, category);
    `);
  });

  await applyMigration(21, "add_exploration_query_indexes", async () => {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS explored_cells_coordinate_cover_index
        ON explored_cells (
          mode, cell_size_m, cell_x, cell_y, source, session_id, created_at
        );
      CREATE INDEX IF NOT EXISTS walk_sessions_mode_started_ended_index
        ON walk_sessions (activity_mode, started_at, ended_at);
    `);
  });

  await applyMigration(22, "add_zone_completion_v2", async () => {
    const totalColumns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(zone_cell_totals)"
    );
    const hasGeometryFingerprint = totalColumns.some(
      (column) => column.name === "geometry_fingerprint"
    );

    if (!hasGeometryFingerprint) {
      await db.execAsync(`
        ALTER TABLE zone_cell_totals
          ADD COLUMN geometry_fingerprint TEXT NOT NULL DEFAULT '';
      `);
    }

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS zone_achievements (
        zone_id TEXT PRIMARY KEY NOT NULL,
        zone_type TEXT NOT NULL,
        zone_name TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        explored_cells INTEGER NOT NULL,
        total_zone_cells INTEGER NOT NULL,
        boundary_fetched_at TEXT NOT NULL,
        boundary_source TEXT NOT NULL,
        geometry_fingerprint TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS zone_achievements_type_completed_index
        ON zone_achievements (zone_type, completed_at);

      CREATE TABLE IF NOT EXISTS zone_refresh_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        status TEXT NOT NULL,
        last_attempted_at TEXT,
        last_succeeded_at TEXT,
        error_message TEXT
      );
    `);
  });

  await applyMigration(23, "add_street_topology_metadata", async () => {
    const columns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(osm_street_segments)"
    );
    const additions = [
      { definition: "TEXT", name: "access" },
      { definition: "INTEGER NOT NULL DEFAULT 0", name: "bridge" },
      { definition: "TEXT", name: "foot" },
      { definition: "INTEGER NOT NULL DEFAULT 0", name: "layer" },
      { definition: "INTEGER NOT NULL DEFAULT 0", name: "tunnel" }
    ];

    for (const addition of additions) {
      if (!columns.some((column) => column.name === addition.name)) {
        await db.execAsync(
          `ALTER TABLE osm_street_segments ADD COLUMN ${addition.name} ${addition.definition};`
        );
      }
    }

    // Old rows do not contain grade-separation or access metadata. Clearing only
    // this derived cache prevents V3 from treating an overpass as an intersection.
    await db.execAsync("DELETE FROM osm_street_segments;");
  });

  await applyMigration(24, "add_street_completion_v2", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS street_completion_v1_evidence (
        segment_id TEXT PRIMARY KEY NOT NULL,
        street_id TEXT NOT NULL,
        name TEXT,
        total_distance_m REAL NOT NULL,
        captured_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS street_completion_session_coverage (
        session_id INTEGER NOT NULL,
        segment_id TEXT NOT NULL,
        street_id TEXT NOT NULL,
        covered_bins_json TEXT NOT NULL,
        total_bin_count INTEGER NOT NULL,
        total_distance_m REAL NOT NULL,
        walked_distance_m REAL NOT NULL,
        processed_at TEXT NOT NULL,
        PRIMARY KEY (session_id, segment_id),
        FOREIGN KEY (session_id) REFERENCES walk_sessions (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS street_completion_session_segment_index
        ON street_completion_session_coverage (segment_id, session_id);

      CREATE TABLE IF NOT EXISTS street_completion_segments (
        segment_id TEXT PRIMARY KEY NOT NULL,
        street_id TEXT NOT NULL,
        name TEXT,
        highway TEXT NOT NULL,
        walked_distance_m REAL NOT NULL,
        total_distance_m REAL NOT NULL,
        completion_percent REAL NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS street_completion_segments_street_index
        ON street_completion_segments (street_id, completion_percent);

      CREATE TABLE IF NOT EXISTS street_completion_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        algorithm_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        needs_rebuild INTEGER NOT NULL,
        processed_recording_count INTEGER NOT NULL,
        total_recording_count INTEGER NOT NULL,
        legacy_captured_at TEXT,
        last_error TEXT,
        updated_at TEXT
      );

      INSERT OR IGNORE INTO street_completion_state (
        id,
        algorithm_version,
        status,
        needs_rebuild,
        processed_recording_count,
        total_recording_count,
        legacy_captured_at,
        last_error,
        updated_at
      ) VALUES (1, 2, 'pending', 1, 0, 0, NULL, NULL, NULL);
    `);
  });

  await applyMigration(25, "cache_zone_completion_snapshots", async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS exploration_revisions (
        mode TEXT PRIMARY KEY NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
      );

      INSERT OR IGNORE INTO exploration_revisions (mode, revision)
      SELECT mode, COUNT(*) FROM explored_cells GROUP BY mode;
      INSERT OR IGNORE INTO exploration_revisions (mode, revision)
      VALUES ('walk', 0);

      CREATE TRIGGER IF NOT EXISTS explored_cells_revision_after_insert
      AFTER INSERT ON explored_cells
      BEGIN
        INSERT OR IGNORE INTO exploration_revisions (mode, revision)
        VALUES (NEW.mode, 0);
        UPDATE exploration_revisions SET revision = revision + 1
        WHERE mode = NEW.mode;
      END;

      CREATE TRIGGER IF NOT EXISTS explored_cells_revision_after_delete
      AFTER DELETE ON explored_cells
      BEGIN
        INSERT OR IGNORE INTO exploration_revisions (mode, revision)
        VALUES (OLD.mode, 0);
        UPDATE exploration_revisions SET revision = revision + 1
        WHERE mode = OLD.mode;
      END;

      CREATE TRIGGER IF NOT EXISTS explored_cells_revision_after_update
      AFTER UPDATE ON explored_cells
      BEGIN
        INSERT OR IGNORE INTO exploration_revisions (mode, revision)
        VALUES (OLD.mode, 0);
        INSERT OR IGNORE INTO exploration_revisions (mode, revision)
        VALUES (NEW.mode, 0);
        UPDATE exploration_revisions SET revision = revision + 1
        WHERE mode IN (OLD.mode, NEW.mode);
      END;

      CREATE TABLE IF NOT EXISTS zone_completion_snapshots (
        zone_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        geometry_fingerprint TEXT NOT NULL,
        exploration_revision INTEGER NOT NULL,
        stats_json TEXT NOT NULL,
        calculated_at TEXT NOT NULL,
        PRIMARY KEY (zone_id, mode),
        FOREIGN KEY (zone_id) REFERENCES zones (id) ON DELETE CASCADE
      );
    `);
  });

  await seedBundledMedalAlbums(db);
  await db.runAsync(`
    UPDATE collected_medals
    SET presentation_state = 'pending'
    WHERE presentation_state = 'presenting'
  `);
}

async function seedBundledMedalAlbums(db: SQLite.SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const album of BUNDLED_MEDAL_ALBUMS) {
      await transaction.runAsync(
        `INSERT INTO medal_albums (
          id, city_id, city_name_json, definition_version, published_at, source_attribution
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          city_id = excluded.city_id,
          city_name_json = excluded.city_name_json,
          definition_version = excluded.definition_version,
          published_at = excluded.published_at,
          source_attribution = excluded.source_attribution`,
        album.id,
        album.cityId,
        JSON.stringify(album.cityName),
        album.version,
        album.publishedAt,
        album.sourceAttribution
      );

      for (let index = 0; index < album.medals.length; index += 1) {
        const medal = album.medals[index];

        if (!medal) {
          continue;
        }

        await transaction.runAsync(
          `INSERT INTO medals (
            id, category, name_json, description_json, latitude, longitude,
            external_source, external_type, external_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            name_json = excluded.name_json,
            description_json = excluded.description_json,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            external_source = excluded.external_source,
            external_type = excluded.external_type,
            external_id = excluded.external_id`,
          medal.id,
          medal.category,
          JSON.stringify(medal.name),
          JSON.stringify(medal.description),
          medal.latitude,
          medal.longitude,
          medal.externalIdentity.source,
          medal.externalIdentity.type,
          medal.externalIdentity.id
        );
        await transaction.runAsync(
          `INSERT INTO medal_album_items (album_id, medal_id, sort_order)
          VALUES (?, ?, ?)
          ON CONFLICT(album_id, medal_id) DO UPDATE SET sort_order = excluded.sort_order`,
          album.id,
          medal.id,
          index
        );
      }
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
