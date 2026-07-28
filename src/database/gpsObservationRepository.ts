import type { SQLiteDatabase } from "expo-sqlite";

import { GpsPoint } from "../types/walk";
import { getDatabase } from "./db";

type GpsObservationRow = {
  accepted: number;
  accuracy: number | null;
  id: number;
  latitude: number;
  longitude: number;
  processed: number;
  session_id: number;
  timestamp: string;
};

export type GpsObservationGeneration = {
  sourceMaxObservationId: number;
  sourceObservationCount: number;
};

export type ActiveGpsObservationWriteResult =
  GpsObservationGeneration & {
    accepted: boolean;
    observation: GpsPoint | null;
    processed: boolean;
    requiresRebuild: boolean;
  };

export async function getGpsObservationsForSession(
  sessionId: number
): Promise<GpsPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<GpsObservationRow>(
    `
      SELECT id, session_id, latitude, longitude, timestamp, accuracy,
        processed, accepted
      FROM gps_observations
      WHERE session_id = ?
      ORDER BY timestamp, id
    `,
    sessionId
  );

  return rows.map(mapObservationRow);
}

export async function saveActiveGpsObservation(
  sessionId: number,
  point: Omit<GpsPoint, "pointIndex">
): Promise<ActiveGpsObservationWriteResult> {
  const db = await getDatabase();
  let writeResult: ActiveGpsObservationWriteResult = {
    accepted: false,
    observation: null,
    processed: false,
    requiresRebuild: false,
    sourceMaxObservationId: 0,
    sourceObservationCount: 0
  };

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const activeSession = await transaction.getFirstAsync<{ id: number }>(
      `
        SELECT id
        FROM walk_sessions
        WHERE id = ? AND ended_at = started_at
      `,
      sessionId
    );

    if (!activeSession) {
      return;
    }

    const existing = await transaction.getFirstAsync<GpsObservationRow>(
      `
        SELECT id, session_id, latitude, longitude, timestamp, accuracy,
          processed, accepted
        FROM gps_observations
        WHERE session_id = ? AND timestamp = ?
      `,
      sessionId,
      point.timestamp
    );
    const maxTimestampRow = await transaction.getFirstAsync<{
      max_timestamp: string | null;
    }>(
      `
        SELECT MAX(timestamp) AS max_timestamp
        FROM gps_observations
        WHERE session_id = ?
      `,
      sessionId
    );
    let observation = existing;
    let accuracyImproved = false;

    if (existing) {
      accuracyImproved =
        getAccuracyScore(point.accuracy) <
        getAccuracyScore(existing.accuracy);

      if (accuracyImproved) {
        await transaction.runAsync(
          "DELETE FROM gps_observations WHERE id = ?",
          existing.id
        );
        const insertResult = await transaction.runAsync(
          `
            INSERT INTO gps_observations (
              session_id, latitude, longitude, timestamp, accuracy,
              processed, accepted
            )
            VALUES (?, ?, ?, ?, ?, 0, 0)
          `,
          sessionId,
          point.latitude,
          point.longitude,
          point.timestamp,
          point.accuracy
        );
        observation = {
          ...existing,
          accepted: 0,
          accuracy: point.accuracy,
          id: insertResult.lastInsertRowId,
          latitude: point.latitude,
          longitude: point.longitude,
          processed: 0
        };
      }
    } else {
      const insertResult = await transaction.runAsync(
        `
          INSERT INTO gps_observations (
            session_id, latitude, longitude, timestamp, accuracy,
            processed, accepted
          )
          VALUES (?, ?, ?, ?, ?, 0, 0)
        `,
        sessionId,
        point.latitude,
        point.longitude,
        point.timestamp,
        point.accuracy
      );
      observation = {
        accepted: 0,
        accuracy: point.accuracy,
        id: insertResult.lastInsertRowId,
        latitude: point.latitude,
        longitude: point.longitude,
        processed: 0,
        session_id: sessionId,
        timestamp: point.timestamp
      };
    }

    const generation = await getGpsObservationGeneration(
      transaction,
      sessionId
    );
    const wasAlreadyPresent = existing !== null;

    writeResult = {
      ...generation,
      accepted: !accuracyImproved && existing?.accepted === 1,
      observation: observation ? mapObservationRow(observation) : null,
      processed: !accuracyImproved && existing?.processed === 1,
      requiresRebuild:
        accuracyImproved ||
        (wasAlreadyPresent && existing?.processed !== 1) ||
        (!wasAlreadyPresent &&
          maxTimestampRow?.max_timestamp !== null &&
          maxTimestampRow?.max_timestamp !== undefined &&
          point.timestamp <= maxTimestampRow.max_timestamp)
    };
  });

  return writeResult;
}

export async function markGpsObservationProcessed(
  sessionId: number,
  timestamp: string,
  accepted: boolean
) {
  const db = await getDatabase();

  await db.runAsync(
    `
      UPDATE gps_observations
      SET processed = 1, accepted = ?
      WHERE session_id = ? AND timestamp = ?
    `,
    accepted ? 1 : 0,
    sessionId,
    timestamp
  );
}

export async function replaceActiveWalkGpsPointsFromObservations(
  sessionId: number,
  points: GpsPoint[],
  distanceMeters: number,
  observationGeneration: GpsObservationGeneration
): Promise<boolean> {
  const db = await getDatabase();
  let replaced = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const source = await getSessionObservationSource(transaction, sessionId);

    if (
      !source ||
      source.ended_at !== source.started_at ||
      !matchesObservationGeneration(source, observationGeneration)
    ) {
      return;
    }

    await transaction.runAsync(
      "DELETE FROM route_snapshots WHERE session_id = ?",
      sessionId
    );
    await transaction.runAsync(
      "DELETE FROM gps_points WHERE session_id = ?",
      sessionId
    );
    await insertGpsPoints(transaction, sessionId, points);
    await transaction.runAsync(
      `
        UPDATE walk_sessions
        SET distance_meters = ?
        WHERE id = ? AND ended_at = started_at
      `,
      distanceMeters,
      sessionId
    );
    await markGpsObservationsDerived(transaction, sessionId, points);
    replaced = true;
  });

  return replaced;
}

export async function upsertFinalizedGpsObservations(
  sessionId: number,
  expectedEndedAt: string,
  points: Array<Omit<GpsPoint, "pointIndex">>
): Promise<GpsObservationGeneration | null> {
  const db = await getDatabase();
  let generation: GpsObservationGeneration | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const source = await getSessionObservationSource(transaction, sessionId);

    if (
      !source ||
      source.ended_at !== expectedEndedAt ||
      source.ended_at === source.started_at
    ) {
      return;
    }

    const existingRows = await transaction.getAllAsync<{
      accuracy: number | null;
      id: number;
      timestamp: string;
    }>(
      `
        SELECT id, timestamp, accuracy
        FROM gps_observations
        WHERE session_id = ?
      `,
      sessionId
    );
    const existingByTimestamp = new Map(
      existingRows.map((row) => [row.timestamp, row])
    );
    const replacementPoints: Array<Omit<GpsPoint, "pointIndex">> = [];
    const improvedObservationIds: number[] = [];

    for (const point of points) {
      const existing = existingByTimestamp.get(point.timestamp);
      if (!existing) {
        replacementPoints.push(point);
        continue;
      }

      if (
        getAccuracyScore(point.accuracy) <
        getAccuracyScore(existing.accuracy)
      ) {
        improvedObservationIds.push(existing.id);
        replacementPoints.push(point);
      }
    }

    for (
      let offset = 0;
      offset < improvedObservationIds.length;
      offset += 500
    ) {
      const ids = improvedObservationIds.slice(offset, offset + 500);

      if (ids.length > 0) {
        await transaction.runAsync(
          `DELETE FROM gps_observations
           WHERE id IN (${ids.map(() => "?").join(",")})`,
          ids
        );
      }
    }

    await insertGpsObservations(
      transaction,
      sessionId,
      replacementPoints
    );
    generation = await getGpsObservationGeneration(transaction, sessionId);
  });

  return generation;
}

export async function replaceFinalizedWalkGpsPointsFromObservations(
  sessionId: number,
  expectedEndedAt: string,
  points: GpsPoint[],
  distanceMeters: number,
  observationGeneration: GpsObservationGeneration
): Promise<boolean> {
  const db = await getDatabase();
  let replaced = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const source = await getSessionObservationSource(transaction, sessionId);

    if (
      !source ||
      source.ended_at !== expectedEndedAt ||
      source.ended_at === source.started_at ||
      !matchesObservationGeneration(source, observationGeneration)
    ) {
      return;
    }

    await transaction.runAsync(
      "DELETE FROM explored_cells WHERE session_id = ?",
      sessionId
    );
    await transaction.runAsync(
      "DELETE FROM loop_fills WHERE session_id = ?",
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
    await insertGpsPoints(transaction, sessionId, points);
    await transaction.runAsync(
      `
        UPDATE walk_sessions
        SET distance_meters = ?
        WHERE id = ?
      `,
      distanceMeters,
      sessionId
    );
    await markGpsObservationsDerived(transaction, sessionId, points);
    await promoteRecoveredFinalizedRecording(
      transaction,
      sessionId,
      points.length
    );
    replaced = true;
  });

  return replaced;
}

export async function markFinalizedGpsObservationsDerived(
  sessionId: number,
  expectedEndedAt: string,
  points: GpsPoint[],
  observationGeneration: GpsObservationGeneration
): Promise<boolean> {
  const db = await getDatabase();
  let marked = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const source = await getSessionObservationSource(transaction, sessionId);

    if (
      !source ||
      source.ended_at !== expectedEndedAt ||
      source.ended_at === source.started_at ||
      !matchesObservationGeneration(source, observationGeneration)
    ) {
      return;
    }

    await markGpsObservationsDerived(transaction, sessionId, points);
    await promoteRecoveredFinalizedRecording(
      transaction,
      sessionId,
      points.length
    );
    marked = true;
  });

  return marked;
}

async function promoteRecoveredFinalizedRecording(
  transaction: SQLiteDatabase,
  sessionId: number,
  pointCount: number
) {
  if (pointCount < 2) {
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
    new Date().toISOString()
  );
}

async function getSessionObservationSource(
  transaction: SQLiteDatabase,
  sessionId: number
) {
  return transaction.getFirstAsync<{
    ended_at: string;
    source_max_observation_id: number;
    source_observation_count: number;
    started_at: string;
  }>(
    `
      SELECT
        ended_at,
        started_at,
        (
          SELECT COUNT(*)
          FROM gps_observations
          WHERE session_id = walk_sessions.id
        ) AS source_observation_count,
        (
          SELECT COALESCE(MAX(id), 0)
          FROM gps_observations
          WHERE session_id = walk_sessions.id
        ) AS source_max_observation_id
      FROM walk_sessions
      WHERE id = ?
    `,
    sessionId
  );
}

async function getGpsObservationGeneration(
  transaction: SQLiteDatabase,
  sessionId: number
): Promise<GpsObservationGeneration> {
  const row = await transaction.getFirstAsync<{
    source_max_observation_id: number;
    source_observation_count: number;
  }>(
    `
      SELECT
        COUNT(*) AS source_observation_count,
        COALESCE(MAX(id), 0) AS source_max_observation_id
      FROM gps_observations
      WHERE session_id = ?
    `,
    sessionId
  );

  return {
    sourceMaxObservationId: row?.source_max_observation_id ?? 0,
    sourceObservationCount: row?.source_observation_count ?? 0
  };
}

async function insertGpsObservations(
  transaction: SQLiteDatabase,
  sessionId: number,
  points: Array<Omit<GpsPoint, "pointIndex">>
) {
  const batchSize = 100;

  for (let offset = 0; offset < points.length; offset += batchSize) {
    const batch = points.slice(offset, offset + batchSize);
    const placeholders = batch
      .map(() => "(?, ?, ?, ?, ?, 0, 0)")
      .join(", ");
    const values: Array<number | string | null> = [];

    for (const point of batch) {
      values.push(
        sessionId,
        point.latitude,
        point.longitude,
        point.timestamp,
        point.accuracy
      );
    }

    if (values.length > 0) {
      await transaction.runAsync(
        `
          INSERT INTO gps_observations (
            session_id, latitude, longitude, timestamp, accuracy,
            processed, accepted
          )
          VALUES ${placeholders}
        `,
        values
      );
    }
  }
}

async function insertGpsPoints(
  transaction: SQLiteDatabase,
  sessionId: number,
  points: GpsPoint[]
) {
  const batchSize = 100;

  for (let offset = 0; offset < points.length; offset += batchSize) {
    const batch = points.slice(offset, offset + batchSize);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const values: Array<number | string | null> = [];

    for (const point of batch) {
      values.push(
        sessionId,
        point.latitude,
        point.longitude,
        point.timestamp,
        point.accuracy,
        point.pointIndex
      );
    }

    await transaction.runAsync(
      `
        INSERT INTO gps_points (
          session_id, latitude, longitude, timestamp, accuracy, point_index
        )
        VALUES ${placeholders}
      `,
      values
    );
  }
}

async function markGpsObservationsDerived(
  transaction: SQLiteDatabase,
  sessionId: number,
  acceptedPoints: GpsPoint[]
) {
  await transaction.runAsync(
    `
      UPDATE gps_observations
      SET processed = 1, accepted = 0
      WHERE session_id = ?
    `,
    sessionId
  );

  const batchSize = 100;

  for (let offset = 0; offset < acceptedPoints.length; offset += batchSize) {
    const batch = acceptedPoints.slice(offset, offset + batchSize);
    const placeholders = batch.map(() => "?").join(", ");

    await transaction.runAsync(
      `
        UPDATE gps_observations
        SET accepted = 1
        WHERE session_id = ? AND timestamp IN (${placeholders})
      `,
      sessionId,
      ...batch.map((point) => point.timestamp)
    );
  }
}

function matchesObservationGeneration(
  source: {
    source_max_observation_id: number;
    source_observation_count: number;
  },
  generation: GpsObservationGeneration
) {
  return (
    source.source_observation_count === generation.sourceObservationCount &&
    source.source_max_observation_id === generation.sourceMaxObservationId
  );
}

function getAccuracyScore(accuracy: number | null) {
  return accuracy ?? Number.POSITIVE_INFINITY;
}

function mapObservationRow(row: GpsObservationRow): GpsPoint {
  return {
    accuracy: row.accuracy,
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    pointIndex: 0,
    sessionId: row.session_id,
    timestamp: row.timestamp
  };
}
