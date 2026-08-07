import { getDatabase } from "./db";
import {
  OsmStreetSegment,
  StreetCompletionSegmentProgress,
  StreetCompletionSessionCoverage,
  StreetCompletionSummary
} from "../types/street";

const STREET_COMPLETION_ALGORITHM_VERSION = 2;

type StreetCompletionStateRow = {
  legacy_captured_at: string | null;
  needs_rebuild: number;
  status: StreetCompletionSummary["status"];
};

export type StreetCompletionRebuildInput = {
  captureLegacyEvidence: boolean;
  legacyMatchedSegments: OsmStreetSegment[];
  processedRecordingCount: number;
  segmentProgress: StreetCompletionSegmentProgress[];
  sessionCoverage: StreetCompletionSessionCoverage[];
  totalRecordingCount: number;
};

export async function getStreetCompletionState() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<StreetCompletionStateRow>(`
    SELECT legacy_captured_at, needs_rebuild, status
    FROM street_completion_state
    WHERE id = 1
  `);

  return {
    legacyCapturedAt: row?.legacy_captured_at ?? null,
    needsRebuild: row?.needs_rebuild !== 0,
    status: row?.status ?? "pending"
  };
}

export async function markStreetCompletionProcessing(totalRecordingCount: number) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE street_completion_state
      SET algorithm_version = ?,
        status = 'loading',
        needs_rebuild = 1,
        total_recording_count = ?,
        last_error = NULL
      WHERE id = 1
    `,
    STREET_COMPLETION_ALGORITHM_VERSION,
    totalRecordingCount
  );
}

export async function markStreetCompletionPending() {
  const db = await getDatabase();

  await db.runAsync(`
    UPDATE street_completion_state
    SET status = 'pending',
      needs_rebuild = 1,
      last_error = NULL
    WHERE id = 1
  `);
}

export async function markStreetCompletionFailed(error: string) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE street_completion_state
      SET status = 'error',
        needs_rebuild = 1,
        last_error = ?,
        updated_at = ?
      WHERE id = 1
    `,
    error,
    new Date().toISOString()
  );
}

export async function replaceStreetCompletionV2(input: StreetCompletionRebuildInput) {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  let replaced = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const activeRecording = await transaction.getFirstAsync<{ value: string }>(`
      SELECT value
      FROM app_settings
      WHERE key = 'active_recording_session_id'
      LIMIT 1
    `);

    if (activeRecording) {
      await transaction.runAsync(`
        UPDATE street_completion_state
        SET status = 'pending',
          needs_rebuild = 1,
          last_error = NULL
        WHERE id = 1
      `);
      return;
    }

    const existingAchievements = await transaction.getAllAsync<{
      completed_at: string;
      street_id: string;
    }>(`
      SELECT street_id, MIN(completed_at) AS completed_at
      FROM street_completion_segments
      WHERE completed_at IS NOT NULL
      GROUP BY street_id
    `);
    const completedAtByStreetId = new Map(
      existingAchievements.map((row) => [row.street_id, row.completed_at])
    );
    const totalsByStreetId = new Map<
      string,
      { totalDistanceMeters: number; walkedDistanceMeters: number }
    >();

    for (const progress of input.segmentProgress) {
      const totals = totalsByStreetId.get(progress.streetId) ?? {
        totalDistanceMeters: 0,
        walkedDistanceMeters: 0
      };
      totals.totalDistanceMeters += progress.totalDistanceMeters;
      totals.walkedDistanceMeters += progress.walkedDistanceMeters;
      totalsByStreetId.set(progress.streetId, totals);
    }

    if (input.captureLegacyEvidence) {
      const legacyBatchSize = 75;

      for (
        let offset = 0;
        offset < input.legacyMatchedSegments.length;
        offset += legacyBatchSize
      ) {
        const batch = input.legacyMatchedSegments.slice(offset, offset + legacyBatchSize);
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const values: Array<number | string | null> = [];

        for (const segment of batch) {
          values.push(
            segment.id,
            getOsmStreetId(segment.id),
            segment.name,
            calculateCoordinatePathDistance(segment),
            updatedAt
          );
        }

        await transaction.runAsync(
          `INSERT OR IGNORE INTO street_completion_v1_evidence (
            segment_id, street_id, name, total_distance_m, captured_at
          ) VALUES ${placeholders}`,
          values
        );
      }
    }

    await transaction.runAsync("DELETE FROM street_completion_session_coverage");
    await transaction.runAsync("DELETE FROM street_completion_segments");

    const sessionBatchSize = 100;

    for (let offset = 0; offset < input.sessionCoverage.length; offset += sessionBatchSize) {
      const batch = input.sessionCoverage.slice(offset, offset + sessionBatchSize);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<number | string> = [];

      for (const coverage of batch) {
        values.push(
          coverage.sessionId,
          coverage.segmentId,
          coverage.streetId,
          JSON.stringify(coverage.coveredBinIndexes),
          coverage.totalBinCount,
          coverage.totalDistanceMeters,
          coverage.walkedDistanceMeters,
          updatedAt
        );
      }

      await transaction.runAsync(
        `INSERT INTO street_completion_session_coverage (
          session_id,
          segment_id,
          street_id,
          covered_bins_json,
          total_bin_count,
          total_distance_m,
          walked_distance_m,
          processed_at
        ) VALUES ${placeholders}`,
        values
      );
    }

    const segmentBatchSize = 75;

    for (let offset = 0; offset < input.segmentProgress.length; offset += segmentBatchSize) {
      const batch = input.segmentProgress.slice(offset, offset + segmentBatchSize);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const values: Array<number | string | null> = [];

      for (const progress of batch) {
        const streetTotals = totalsByStreetId.get(progress.streetId);
        const streetIsComplete = Boolean(
          streetTotals &&
            streetTotals.totalDistanceMeters > 0 &&
            streetTotals.walkedDistanceMeters >= streetTotals.totalDistanceMeters * 0.9
        );
        const completedAt =
          completedAtByStreetId.get(progress.streetId) ??
          (streetIsComplete ? updatedAt : null);
        values.push(
          progress.segmentId,
          progress.streetId,
          progress.name,
          progress.highway,
          progress.walkedDistanceMeters,
          progress.totalDistanceMeters,
          progress.completionPercent,
          completedAt,
          updatedAt
        );
      }

      await transaction.runAsync(
        `INSERT INTO street_completion_segments (
          segment_id,
          street_id,
          name,
          highway,
          walked_distance_m,
          total_distance_m,
          completion_percent,
          completed_at,
          updated_at
        ) VALUES ${placeholders}`,
        values
      );
    }

    await transaction.runAsync(
      `
        UPDATE street_completion_state
        SET algorithm_version = ?,
          status = 'ready',
          needs_rebuild = 0,
          processed_recording_count = ?,
          total_recording_count = ?,
          legacy_captured_at = CASE
            WHEN ? = 1 THEN COALESCE(legacy_captured_at, ?)
            ELSE legacy_captured_at
          END,
          last_error = NULL,
          updated_at = ?
        WHERE id = 1
      `,
      STREET_COMPLETION_ALGORITHM_VERSION,
      input.processedRecordingCount,
      input.totalRecordingCount,
      input.captureLegacyEvidence ? 1 : 0,
      updatedAt,
      updatedAt
    );
    replaced = true;
  });

  return replaced;
}
export async function getStreetCompletionSummary(): Promise<StreetCompletionSummary> {
  const db = await getDatabase();
  const summary = await db.getFirstAsync<{
    completed_street_count: number;
    explored_distance_m: number;
    explored_street_count: number;
    legacy_matched_street_count: number;
    loaded_street_count: number;
    processed_recording_count: number;
    status: StreetCompletionSummary["status"];
    total_distance_m: number;
    updated_at: string | null;
  }>(`
    WITH street_rollup AS (
      SELECT
        street_id,
        SUM(walked_distance_m) AS walked_distance_m,
        SUM(total_distance_m) AS total_distance_m
      FROM street_completion_segments
      GROUP BY street_id
    ), street_totals AS (
      SELECT
        COALESCE(SUM(walked_distance_m), 0) AS explored_distance_m,
        COALESCE(SUM(CASE WHEN walked_distance_m > 0 THEN 1 ELSE 0 END), 0)
          AS explored_street_count,
        COUNT(*) AS loaded_street_count,
        COALESCE(SUM(total_distance_m), 0) AS total_distance_m,
        COALESCE(SUM(
          CASE
            WHEN walked_distance_m >= total_distance_m * 0.9 THEN 1
            ELSE 0
          END
        ), 0) AS completed_street_count
      FROM street_rollup
    )
    SELECT
      state.processed_recording_count,
      state.status,
      state.updated_at,
      street_totals.explored_distance_m,
      street_totals.explored_street_count,
      street_totals.loaded_street_count,
      street_totals.total_distance_m,
      street_totals.completed_street_count,
      (
        SELECT COUNT(DISTINCT street_id)
        FROM street_completion_v1_evidence
      ) AS legacy_matched_street_count
    FROM street_completion_state AS state
    CROSS JOIN street_totals
    WHERE state.id = 1
  `);
  const exploredDistanceMeters = summary?.explored_distance_m ?? 0;
  const totalDistanceMeters = summary?.total_distance_m ?? 0;
  const status = summary?.status ?? (totalDistanceMeters > 0 ? "ready" : "empty");

  return {
    completedStreetCount: summary?.completed_street_count ?? 0,
    completionPercent:
      totalDistanceMeters > 0
        ? Math.round((exploredDistanceMeters / totalDistanceMeters) * 1000) / 10
        : 0,
    exploredDistanceMeters,
    exploredStreetCount: summary?.explored_street_count ?? 0,
    legacyMatchedStreetCount: summary?.legacy_matched_street_count ?? 0,
    loadedStreetCount: summary?.loaded_street_count ?? 0,
    processedRecordingCount: summary?.processed_recording_count ?? 0,
    status,
    totalDistanceMeters,
    updatedAt: summary?.updated_at ?? null
  };
}
function getOsmStreetId(segmentId: string) {
  const match = /^(way\/[^/]+)/.exec(segmentId);
  return match?.[1] ?? segmentId;
}

export async function getStreetCompletionStreetStates() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    completed_at: string | null;
    street_id: string;
    total_distance_m: number;
    walked_distance_m: number;
  }>(`
    SELECT
      street_id,
      MIN(completed_at) AS completed_at,
      SUM(walked_distance_m) AS walked_distance_m,
      SUM(total_distance_m) AS total_distance_m
    FROM street_completion_segments
    GROUP BY street_id
  `);

  return rows.map((row) => ({
    completedAt: row.completed_at,
    isComplete:
      row.total_distance_m > 0 &&
      row.walked_distance_m >= row.total_distance_m * 0.9,
    streetId: row.street_id
  }));
}

function calculateCoordinatePathDistance(segment: OsmStreetSegment) {
  let distance = 0;

  for (let index = 1; index < segment.coordinates.length; index += 1) {
    const from = segment.coordinates[index - 1];
    const to = segment.coordinates[index];

    if (!from || !to) {
      continue;
    }

    const latitudeRadians = (((from.latitude + to.latitude) / 2) * Math.PI) / 180;
    const x = (to.longitude - from.longitude) * 111_320 * Math.cos(latitudeRadians);
    const y = (to.latitude - from.latitude) * 111_320;
    distance += Math.hypot(x, y);
  }

  return distance;
}
