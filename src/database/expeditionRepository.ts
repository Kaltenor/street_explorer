import type { SQLiteDatabase } from "expo-sqlite";

import { getDatabase } from "./db";
import type {
  DistrictExpedition,
  DistrictExpeditionDefinition,
  DistrictExpeditionKind,
  DistrictExpeditionLoopEvidence,
  DistrictExpeditionSeal
} from "../types/expedition";

type ExpeditionRow = {
  abandoned_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  district_id: string;
  district_name: string;
  id: string;
  kind: DistrictExpeditionKind;
  local_date: string;
  progress: number;
  slot: number;
  target: number;
  updated_at: string;
};

type SealRow = {
  district_id: string;
  district_name: string;
  earned_at: string;
  expedition_id: string;
  id: string;
  kind: DistrictExpeditionKind;
  local_date: string;
};

export async function ensureDailyDistrictExpeditions(input: {
  definitions: readonly DistrictExpeditionDefinition[];
  districtId: string;
  districtName: string;
  localDate: string;
}) {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const definition of input.definitions) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO district_expeditions (
          id, district_id, district_name, local_date, slot, kind, target,
          progress, accepted_at, abandoned_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?)`,
        buildExpeditionId(input.districtId, input.localDate, definition.slot),
        input.districtId,
        input.districtName,
        input.localDate,
        definition.slot,
        definition.kind,
        definition.target,
        updatedAt
      );
    }
  });
}

export async function getDailyDistrictExpeditions(
  districtId: string,
  localDate: string
) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExpeditionRow>(
    `SELECT * FROM district_expeditions
    WHERE district_id = ? AND local_date = ?
    ORDER BY slot`,
    districtId,
    localDate
  );

  return rows.map(mapExpeditionRow);
}

export async function getActiveDistrictExpedition() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ExpeditionRow>(`
    SELECT * FROM district_expeditions
    WHERE accepted_at IS NOT NULL
      AND abandoned_at IS NULL
      AND completed_at IS NULL
    ORDER BY accepted_at DESC
    LIMIT 1
  `);

  return row ? mapExpeditionRow(row) : null;
}

export async function acceptDistrictExpedition(expeditionId: string) {
  const db = await getDatabase();
  let accepted: DistrictExpedition | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const expedition = await getExpeditionRow(transaction, expeditionId);

    if (!expedition || expedition.completed_at) {
      throw new Error("This expedition is no longer available.");
    }

    const active = await transaction.getFirstAsync<{ id: string }>(`
      SELECT id FROM district_expeditions
      WHERE accepted_at IS NOT NULL
        AND abandoned_at IS NULL
        AND completed_at IS NULL
      LIMIT 1
    `);

    if (active && active.id !== expeditionId) {
      throw new Error("Finish or abandon the active expedition first.");
    }

    const acceptedAt = new Date().toISOString();
    await transaction.runAsync(
      `UPDATE district_expeditions
      SET accepted_at = ?, abandoned_at = NULL, progress = 0, updated_at = ?
      WHERE id = ?`,
      acceptedAt,
      acceptedAt,
      expeditionId
    );
    await transaction.runAsync(
      "DELETE FROM district_expedition_loop_evidence WHERE expedition_id = ?",
      expeditionId
    );
    accepted = mapExpeditionRow({
      ...expedition,
      abandoned_at: null,
      accepted_at: acceptedAt,
      progress: 0,
      updated_at: acceptedAt
    });
  });

  return accepted;
}

export async function abandonDistrictExpedition(expeditionId: string) {
  const db = await getDatabase();
  const abandonedAt = new Date().toISOString();

  await db.runAsync(
    `UPDATE district_expeditions
    SET abandoned_at = ?, updated_at = ?
    WHERE id = ? AND completed_at IS NULL`,
    abandonedAt,
    abandonedAt,
    expeditionId
  );
}

export async function updateDistrictExpeditionProgress(
  expeditionId: string,
  progress: number
) {
  const db = await getDatabase();
  let completed = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await getExpeditionRow(transaction, expeditionId);

    if (!row || !row.accepted_at || row.abandoned_at) {
      return;
    }

    const boundedProgress = Math.max(0, Math.floor(progress));
    const completedAt = row.completed_at ?? (
      boundedProgress >= row.target ? new Date().toISOString() : null
    );
    const updatedAt = new Date().toISOString();
    await transaction.runAsync(
      `UPDATE district_expeditions
      SET progress = ?, completed_at = ?, updated_at = ?
      WHERE id = ?`,
      boundedProgress,
      completedAt,
      updatedAt,
      expeditionId
    );

    if (completedAt && !row.completed_at) {
      await transaction.runAsync(
        `INSERT OR IGNORE INTO district_expedition_seals (
          id, expedition_id, district_id, district_name, local_date, kind, earned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        `seal:${row.id}`,
        row.id,
        row.district_id,
        row.district_name,
        row.local_date,
        row.kind,
        completedAt
      );
      completed = true;
    }
  });

  return completed;
}

export async function recordDistrictExpeditionLoopEvidence(
  expeditionId: string,
  sessionId: number
) {
  const db = await getDatabase();
  const detectedAt = new Date().toISOString();

  await db.runAsync(
    `INSERT OR IGNORE INTO district_expedition_loop_evidence (
      expedition_id, session_id, detected_at
    ) SELECT id, ?, ?
      FROM district_expeditions
      WHERE id = ?
        AND kind = 'close_loop'
        AND accepted_at IS NOT NULL
        AND abandoned_at IS NULL
        AND completed_at IS NULL`,
    sessionId,
    detectedAt,
    expeditionId
  );
}

export async function countFinalizedLoopEvidence(expeditionId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
    FROM district_expedition_loop_evidence evidence
    JOIN walk_sessions sessions ON sessions.id = evidence.session_id
    WHERE evidence.expedition_id = ?
      AND sessions.ended_at > sessions.started_at`,
    expeditionId
  );

  return row?.count ?? 0;
}

export async function getDistrictExpeditionSeals() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SealRow>(
    `SELECT * FROM district_expedition_seals
    ORDER BY earned_at DESC`
  );

  return rows.map(mapSealRow);
}

export function mapExpeditionRow(row: ExpeditionRow): DistrictExpedition {
  return {
    abandonedAt: row.abandoned_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    districtId: row.district_id,
    districtName: row.district_name,
    id: row.id,
    kind: row.kind,
    localDate: row.local_date,
    progress: row.progress,
    slot: row.slot,
    target: row.target,
    updatedAt: row.updated_at
  };
}

export function mapSealRow(row: SealRow): DistrictExpeditionSeal {
  return {
    districtId: row.district_id,
    districtName: row.district_name,
    earnedAt: row.earned_at,
    expeditionId: row.expedition_id,
    id: row.id,
    kind: row.kind,
    localDate: row.local_date
  };
}

export function mapLoopEvidenceRow(row: {
  detected_at: string;
  expedition_id: string;
  session_id: number;
}): DistrictExpeditionLoopEvidence {
  return {
    detectedAt: row.detected_at,
    expeditionId: row.expedition_id,
    sessionId: row.session_id
  };
}

function buildExpeditionId(districtId: string, localDate: string, slot: number) {
  return `district-expedition:${districtId}:${localDate}:${slot}`;
}

async function getExpeditionRow(
  transaction: SQLiteDatabase,
  expeditionId: string
) {
  return transaction.getFirstAsync<ExpeditionRow>(
    "SELECT * FROM district_expeditions WHERE id = ?",
    expeditionId
  );
}
