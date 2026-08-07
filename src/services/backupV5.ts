import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

import type { ZoneAchievement } from "../database/completionRepository";
import type {
  GpsPoint,
  RenderedRouteSegment,
  RouteBridgeEvidence,
  WalkSession
} from "../types/walk";
import type { BackupDistrictExpeditionSystem } from "../types/expedition";

export const BACKUP_V5_EXTENSION = "streetexplorer";
export const BACKUP_V5_FORMAT = "street-explorer";
export const BACKUP_V5_MAGIC = strToU8("STREET-EXPLORER-V5\n");
export const BACKUP_V5_RECORD_HEADER_BYTES = 13;
export const BACKUP_V5_HOT_SESSION_COUNT = 20;
export const BACKUP_V5_ARCHIVE_SESSION_LIMIT = 20;
export const BACKUP_V5_ARCHIVE_POINT_LIMIT = 25_000;

export const BACKUP_V5_RECORD_KIND = {
  archiveBlock: 3,
  footer: 255,
  hotBlock: 2,
  manifest: 1
} as const;

export type BackupMedalSystem = {
  acquisitionEvents: Array<{
    id: number;
    albumId: string;
    medalId: string;
    sessionId: number | null;
    reason: "recording" | "retro_scan";
    enclosureId: string;
    anchorCellId: string;
    enclosureAreaSquareMeters: number;
    enclosureCellIds: string[];
    acquiredAt: string;
  }>;
  collectedMedals: Array<{
    albumId: string;
    medalId: string;
    acquisitionEventId: number;
    presentationState: "pending" | "presenting" | "presented";
    presentedAt: string | null;
  }>;
  retroScanSettings: Array<{
    key: string;
    value: string;
  }>;
};

export type BackupV5Metadata = {
  appVersion: string;
  expeditionSystem?: BackupDistrictExpeditionSystem;
  exportedAt: string;
  medalSystem: BackupMedalSystem;
  sessions: WalkSession[];
  zoneAchievements: ZoneAchievement[];
};

export type BackupV5BlockPlan = {
  expectedPointCount: number;
  id: string;
  kind: "archive" | "hot";
  label: string;
  sessionIds: number[];
};

export type BackupV5Manifest = BackupV5Metadata & {
  backupId: string;
  blocks: BackupV5BlockPlan[];
  format: typeof BACKUP_V5_FORMAT;
  totals: {
    archiveBlockCount: number;
    blockCount: number;
    hotSessionCount: number;
    pointCount: number;
    sessionCount: number;
  };
  version: 5;
};

export type BackupV5RouteSnapshot = {
  algorithmVersion: number;
  createdAt: string;
  segments: RenderedRouteSegment[];
  sessionId: number;
  sourceMaxPointId: number;
  sourcePointCount: number;
};

export type BackupV5SessionData = {
  points: GpsPoint[];
  routeSnapshot: BackupV5RouteSnapshot | null;
  sessionId: number;
};

export type BackupV5Footer = {
  backupId: string;
  blockChecksums: number[];
  manifestChecksum: number;
  recordCount: number;
  totalPointCount: number;
};

type CompactRawPoint = [
  id: number,
  latitude: number,
  longitude: number,
  timestamp: string,
  accuracy: number | null,
  pointIndex: number
];

type CompactRoutePoint = [
  latitude: number,
  longitude: number,
  timestamp: string,
  accuracy: number | null,
  pointIndex: number,
  id: number | null,
  sessionId: number | null,
  heading: number | null,
  speedMetersPerSecond: number | null
];

type CompactConfirmedSegment = [
  type: "c",
  pointPositionRuns: Array<[start: number, count: number]>,
  confidence: "high" | "medium" | null,
  bridgeEvidence: RouteBridgeEvidence | null
];

type CompactInferredSegment = [
  type: "i",
  points: CompactRoutePoint[],
  confidence: "high" | "medium" | null,
  bridgeEvidence: RouteBridgeEvidence | null
];

type CompactRouteSnapshot = [
  algorithmVersion: number,
  createdAt: string,
  sourceMaxPointId: number,
  sourcePointCount: number,
  segments: Array<CompactConfirmedSegment | CompactInferredSegment>
];

type CompactSessionData = [
  sessionId: number,
  points: CompactRawPoint[],
  routeSnapshot: CompactRouteSnapshot | null
];

type CompactBackupV5Block = {
  id: string;
  sessions: CompactSessionData[];
};

export type EncodedBackupV5Record = {
  bytes: Uint8Array;
  checksum: number;
  compressedSize: number;
  rawSize: number;
};

export type BackupV5RecordHeader = {
  checksum: number;
  compressedSize: number;
  kind: number;
  rawSize: number;
};

export function createBackupV5Manifest(
  metadata: BackupV5Metadata
): BackupV5Manifest {
  const sessions = [...metadata.sessions].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt)
  );
  const blocks = buildBackupV5BlockPlans(sessions);
  const pointCount = sessions.reduce(
    (total, session) => total + (session.pointCount ?? 0),
    0
  );
  const exportedAt = metadata.exportedAt;

  return {
    ...metadata,
    backupId: [
      exportedAt,
      sessions.length,
      pointCount,
      sessions.at(-1)?.id ?? 0
    ].join(":"),
    blocks,
    exportedAt,
    format: BACKUP_V5_FORMAT,
    sessions,
    totals: {
      archiveBlockCount: blocks.filter((block) => block.kind === "archive").length,
      blockCount: blocks.length,
      hotSessionCount: Math.min(BACKUP_V5_HOT_SESSION_COUNT, sessions.length),
      pointCount,
      sessionCount: sessions.length
    },
    version: 5
  };
}

export function buildBackupV5BlockPlans(
  sessions: readonly WalkSession[]
): BackupV5BlockPlan[] {
  const ordered = [...sessions].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt)
  );
  const hotStartIndex = Math.max(0, ordered.length - BACKUP_V5_HOT_SESSION_COUNT);
  const archived = ordered.slice(0, hotStartIndex);
  const hot = ordered.slice(hotStartIndex);
  const archivePlans: BackupV5BlockPlan[] = [];
  let currentMonth = "";
  let currentSessions: WalkSession[] = [];
  let currentPointCount = 0;
  let monthPart = 1;

  const flushArchive = () => {
    if (currentSessions.length === 0) {
      return;
    }

    archivePlans.push({
      expectedPointCount: currentPointCount,
      id: `archive-${currentMonth}-${String(monthPart).padStart(2, "0")}`,
      kind: "archive",
      label: currentMonth,
      sessionIds: currentSessions.map((session) => session.id)
    });
    currentSessions = [];
    currentPointCount = 0;
    monthPart += 1;
  };

  for (const session of archived) {
    const month = getSessionMonth(session.startedAt);
    const pointCount = session.pointCount ?? 0;
    const startsNewMonth = currentSessions.length > 0 && month !== currentMonth;
    const exceedsSessionLimit =
      currentSessions.length >= BACKUP_V5_ARCHIVE_SESSION_LIMIT;
    const exceedsPointLimit =
      currentSessions.length > 0 &&
      currentPointCount + pointCount > BACKUP_V5_ARCHIVE_POINT_LIMIT;

    if (startsNewMonth || exceedsSessionLimit || exceedsPointLimit) {
      flushArchive();
    }

    if (month !== currentMonth) {
      currentMonth = month;
      monthPart = 1;
    }

    currentSessions.push(session);
    currentPointCount += pointCount;
  }

  flushArchive();

  return [
    ...archivePlans,
    ...hot.map((session) => ({
      expectedPointCount: session.pointCount ?? 0,
      id: `hot-${session.id}`,
      kind: "hot" as const,
      label: session.startedAt,
      sessionIds: [session.id]
    }))
  ];
}

export function createBackupV5BlockPayload(
  plan: BackupV5BlockPlan,
  sessions: readonly BackupV5SessionData[]
): CompactBackupV5Block {
  const bySessionId = new Map(sessions.map((session) => [session.sessionId, session]));
  const compactSessions = plan.sessionIds.map((sessionId) => {
    const session = bySessionId.get(sessionId);

    if (!session) {
      throw new Error(`Backup block ${plan.id} is missing session ${sessionId}.`);
    }

    return compactSessionData(session);
  });
  const pointCount = sessions.reduce(
    (total, session) => total + session.points.length,
    0
  );

  if (
    sessions.length !== plan.sessionIds.length ||
    pointCount !== plan.expectedPointCount
  ) {
    throw new Error(`Backup block ${plan.id} does not match its manifest counts.`);
  }

  return {
    id: plan.id,
    sessions: compactSessions
  };
}

export function decodeBackupV5BlockPayload(
  value: unknown,
  plan: BackupV5BlockPlan
): BackupV5SessionData[] {
  if (!isRecord(value) || value.id !== plan.id || !Array.isArray(value.sessions)) {
    throw new Error(`Backup block ${plan.id} is invalid.`);
  }

  const sessions = value.sessions.map(expandSessionData);
  const actualSessionIds = sessions.map((session) => session.sessionId);

  if (
    actualSessionIds.length !== plan.sessionIds.length ||
    actualSessionIds.some((sessionId, index) => sessionId !== plan.sessionIds[index])
  ) {
    throw new Error(`Backup block ${plan.id} has unexpected sessions.`);
  }

  const pointCount = sessions.reduce(
    (total, session) => total + session.points.length,
    0
  );

  if (pointCount !== plan.expectedPointCount) {
    throw new Error(`Backup block ${plan.id} has an unexpected point count.`);
  }

  return sessions;
}

export function encodeBackupV5Record(
  kind: number,
  value: unknown
): EncodedBackupV5Record {
  const raw = strToU8(JSON.stringify(value));
  const checksum = crc32(raw);
  const compressed = gzipSync(raw, { level: 3 });
  const bytes = new Uint8Array(BACKUP_V5_RECORD_HEADER_BYTES + compressed.length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  view.setUint8(0, kind);
  view.setUint32(1, compressed.length, true);
  view.setUint32(5, raw.length, true);
  view.setUint32(9, checksum, true);
  bytes.set(compressed, BACKUP_V5_RECORD_HEADER_BYTES);

  return {
    bytes,
    checksum,
    compressedSize: compressed.length,
    rawSize: raw.length
  };
}

export function decodeBackupV5RecordHeader(
  bytes: Uint8Array
): BackupV5RecordHeader {
  if (bytes.length !== BACKUP_V5_RECORD_HEADER_BYTES) {
    throw new Error("Backup record header is truncated.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  return {
    checksum: view.getUint32(9, true),
    compressedSize: view.getUint32(1, true),
    kind: view.getUint8(0),
    rawSize: view.getUint32(5, true)
  };
}

export function decodeBackupV5RecordPayload(
  header: BackupV5RecordHeader,
  compressed: Uint8Array
): unknown {
  if (compressed.length !== header.compressedSize) {
    throw new Error("Backup record payload is truncated.");
  }

  if (compressed.length < 4) {
    throw new Error("Backup record payload is invalid.");
  }

  const gzipSizeView = new DataView(
    compressed.buffer,
    compressed.byteOffset + compressed.length - 4,
    4
  );
  if (gzipSizeView.getUint32(0, true) !== header.rawSize) {
    throw new Error("Backup record expanded size does not match its header.");
  }

  const raw = gunzipSync(compressed, {
    out: new Uint8Array(header.rawSize)
  });

  if (raw.length !== header.rawSize || crc32(raw) !== header.checksum) {
    throw new Error("Backup record checksum does not match.");
  }

  return JSON.parse(strFromU8(raw));
}

export function assertBackupV5Manifest(
  value: unknown
): asserts value is BackupV5Manifest {
  if (
    !isRecord(value) ||
    value.format !== BACKUP_V5_FORMAT ||
    value.version !== 5 ||
    typeof value.backupId !== "string" ||
    value.backupId.length === 0 ||
    typeof value.appVersion !== "string" ||
    typeof value.exportedAt !== "string" ||
    !Number.isFinite(new Date(value.exportedAt).getTime()) ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.blocks) ||
    !isRecord(value.medalSystem) ||
    !Array.isArray(value.medalSystem.acquisitionEvents) ||
    !Array.isArray(value.medalSystem.collectedMedals) ||
    !Array.isArray(value.medalSystem.retroScanSettings) ||
    !Array.isArray(value.zoneAchievements) ||
    !isRecord(value.totals)
  ) {
    throw new Error("This file is not a valid Street Explorer V5 backup.");
  }

  const sessions = value.sessions as WalkSession[];
  const sessionIds = new Set<number>();

  for (const session of sessions) {
    if (
      !isRecord(session) ||
      !Number.isInteger(session.id) ||
      session.id <= 0 ||
      session.activityMode !== "walk" ||
      (session.displayName !== null && typeof session.displayName !== "string") ||
      typeof session.startedAt !== "string" ||
      typeof session.endedAt !== "string" ||
      !Number.isFinite(new Date(session.startedAt).getTime()) ||
      !Number.isFinite(new Date(session.endedAt).getTime()) ||
      new Date(session.endedAt).getTime() <= new Date(session.startedAt).getTime() ||
      !isFiniteNumber(session.distanceMeters) ||
      session.distanceMeters < 0 ||
      !isFiniteNumber(session.durationSeconds) ||
      session.durationSeconds < 0 ||
      !Number.isInteger(session.stepCount) ||
      session.stepCount < 0 ||
      !Number.isInteger(session.pointCount) ||
      (session.pointCount ?? -1) < 0 ||
      sessionIds.has(session.id)
    ) {
      throw new Error("V5 backup contains invalid session metadata.");
    }

    sessionIds.add(session.id);
  }

  const plannedSessionIds: number[] = [];
  const blockIds = new Set<string>();
  let plannedPointCount = 0;

  for (const block of value.blocks as BackupV5BlockPlan[]) {
    if (
      !isBackupV5BlockPlan(block) ||
      blockIds.has(block.id) ||
      block.sessionIds.some((sessionId) => !sessionIds.has(sessionId))
    ) {
      throw new Error("V5 backup contains an invalid archive block plan.");
    }

    blockIds.add(block.id);
    plannedPointCount += block.expectedPointCount;
    plannedSessionIds.push(...block.sessionIds);
  }

  if (
    plannedSessionIds.length !== sessionIds.size ||
    new Set(plannedSessionIds).size !== sessionIds.size
  ) {
    throw new Error("V5 backup archive blocks do not cover every session exactly once.");
  }

  const totals = value.totals;
  const sessionPointCount = sessions.reduce(
    (total, session) => total + (session.pointCount ?? 0),
    0
  );
  const archiveBlockCount = value.blocks.filter(
    (block: BackupV5BlockPlan) => block.kind === "archive"
  ).length;
  const hotSessionCount = value.blocks.filter(
    (block: BackupV5BlockPlan) => block.kind === "hot"
  ).length;

  if (
    ![
      totals.archiveBlockCount,
      totals.blockCount,
      totals.hotSessionCount,
      totals.pointCount,
      totals.sessionCount
    ].every((total) => Number.isInteger(total) && total >= 0) ||
    totals.sessionCount !== sessions.length ||
    totals.blockCount !== value.blocks.length ||
    totals.pointCount !== sessionPointCount ||
    plannedPointCount !== sessionPointCount ||
    totals.archiveBlockCount !== archiveBlockCount ||
    totals.hotSessionCount !== hotSessionCount
  ) {
    throw new Error("V5 backup manifest totals are inconsistent.");
  }

  assertBackupV5MedalSystem(value.medalSystem, sessionIds);
  assertBackupV5ZoneAchievements(value.zoneAchievements);
  assertBackupV5ExpeditionSystem(value.expeditionSystem, sessionIds);
}

export function assertBackupV5Footer(
  value: unknown,
  manifest: BackupV5Manifest,
  manifestChecksum: number,
  blockChecksums: readonly number[]
): asserts value is BackupV5Footer {
  if (
    !isRecord(value) ||
    value.backupId !== manifest.backupId ||
    value.manifestChecksum !== manifestChecksum ||
    value.recordCount !== manifest.blocks.length + 2 ||
    value.totalPointCount !== manifest.totals.pointCount ||
    !Array.isArray(value.blockChecksums) ||
    value.blockChecksums.length !== blockChecksums.length ||
    value.blockChecksums.some(
      (checksum, index) => checksum !== blockChecksums[index]
    )
  ) {
    throw new Error("V5 backup footer verification failed.");
  }
}

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function compactSessionData(session: BackupV5SessionData): CompactSessionData {
  const pointPositionsById = new Map<number, number>();
  const points = session.points.map((point, position) => {
    if (
      !Number.isInteger(point.id) ||
      pointPositionsById.has(point.id as number) ||
      !Number.isInteger(point.sessionId) ||
      point.sessionId !== session.sessionId ||
      !Number.isInteger(point.pointIndex)
    ) {
      throw new Error(`Session ${session.sessionId} contains an invalid GPS point.`);
    }

    pointPositionsById.set(point.id as number, position);

    return [
      point.id,
      point.latitude,
      point.longitude,
      point.timestamp,
      point.accuracy,
      point.pointIndex
    ] as CompactRawPoint;
  });

  return [
    session.sessionId,
    points,
    session.routeSnapshot
      ? compactRouteSnapshot(session.routeSnapshot, pointPositionsById)
      : null
  ];
}

function compactRouteSnapshot(
  snapshot: BackupV5RouteSnapshot,
  pointPositionsById: ReadonlyMap<number, number>
): CompactRouteSnapshot {
  return [
    snapshot.algorithmVersion,
    snapshot.createdAt,
    snapshot.sourceMaxPointId,
    snapshot.sourcePointCount,
    snapshot.segments.map((segment) => {
      const confidence = segment.confidence ?? null;
      const evidence = segment.bridgeEvidence ?? null;

      if (segment.type === "confirmed") {
        const positions = segment.points.map((point) => {
          const position = Number.isInteger(point.id)
            ? pointPositionsById.get(point.id as number)
            : undefined;

          if (position === undefined) {
            throw new Error(
              `Route snapshot ${snapshot.sessionId} references a missing confirmed point.`
            );
          }

          return position;
        });

        return [
          "c",
          encodePointPositionRuns(positions),
          confidence,
          evidence
        ] as CompactConfirmedSegment;
      }

      return [
        "i",
        segment.points.map(compactRoutePoint),
        confidence,
        evidence
      ] as CompactInferredSegment;
    })
  ];
}

function expandSessionData(value: unknown): BackupV5SessionData {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !Number.isInteger(value[0]) ||
    !Array.isArray(value[1])
  ) {
    throw new Error("V5 backup contains invalid compact session data.");
  }

  const sessionId = value[0] as number;
  const points = value[1].map((point) => expandRawPoint(point, sessionId));

  return {
    points,
    routeSnapshot:
      value[2] === null
        ? null
        : expandRouteSnapshot(value[2], sessionId, points),
    sessionId
  };
}

function expandRawPoint(value: unknown, sessionId: number): GpsPoint {
  if (
    !Array.isArray(value) ||
    value.length !== 6 ||
    !Number.isInteger(value[0]) ||
    !isFiniteNumber(value[1]) ||
    !isFiniteNumber(value[2]) ||
    typeof value[3] !== "string" ||
    (value[4] !== null && !isFiniteNumber(value[4])) ||
    !Number.isInteger(value[5])
  ) {
    throw new Error(`V5 backup session ${sessionId} contains an invalid GPS point.`);
  }

  return {
    accuracy: value[4],
    id: value[0],
    latitude: value[1],
    longitude: value[2],
    pointIndex: value[5],
    sessionId,
    timestamp: value[3]
  };
}

function expandRouteSnapshot(
  value: unknown,
  sessionId: number,
  rawPoints: readonly GpsPoint[]
): BackupV5RouteSnapshot {
  if (
    !Array.isArray(value) ||
    value.length !== 5 ||
    !Number.isInteger(value[0]) ||
    typeof value[1] !== "string" ||
    !Number.isInteger(value[2]) ||
    !Number.isInteger(value[3]) ||
    !Array.isArray(value[4])
  ) {
    throw new Error(`V5 backup session ${sessionId} contains an invalid route snapshot.`);
  }

  return {
    algorithmVersion: value[0],
    createdAt: value[1],
    segments: value[4].map((segment) =>
      expandRouteSegment(segment, rawPoints)
    ),
    sessionId,
    sourceMaxPointId: value[2],
    sourcePointCount: value[3]
  };
}

function expandRouteSegment(
  value: unknown,
  rawPoints: readonly GpsPoint[]
): RenderedRouteSegment {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !["c", "i"].includes(value[0]) ||
    (value[2] !== null && !["high", "medium"].includes(value[2])) ||
    (value[3] !== null && !isBackupV5RouteBridgeEvidence(value[3]))
  ) {
    throw new Error("V5 backup contains an invalid route segment.");
  }

  const points =
    value[0] === "c"
      ? decodePointPositionRuns(value[1], rawPoints.length).map(
          (position) => {
            const point = rawPoints[position];

            if (!point) {
              throw new Error("V5 route snapshot references a missing raw point.");
            }

            return point;
          }
        )
      : Array.isArray(value[1])
        ? value[1].map(expandRoutePoint)
        : (() => {
            throw new Error("V5 backup contains invalid inferred route points.");
          })();

  return {
    ...(value[3] ? { bridgeEvidence: value[3] as RouteBridgeEvidence } : {}),
    ...(value[2] ? { confidence: value[2] as "high" | "medium" } : {}),
    points,
    type: value[0] === "c" ? "confirmed" : "inferred"
  };
}

function compactRoutePoint(point: GpsPoint): CompactRoutePoint {
  return [
    point.latitude,
    point.longitude,
    point.timestamp,
    point.accuracy,
    point.pointIndex,
    point.id ?? null,
    point.sessionId ?? null,
    point.heading ?? null,
    point.speedMetersPerSecond ?? null
  ];
}

function expandRoutePoint(value: unknown): GpsPoint {
  if (
    !Array.isArray(value) ||
    value.length !== 9 ||
    !isFiniteNumber(value[0]) ||
    !isFiniteNumber(value[1]) ||
    typeof value[2] !== "string" ||
    (value[3] !== null && !isFiniteNumber(value[3])) ||
    !Number.isInteger(value[4]) ||
    (value[5] !== null && !Number.isInteger(value[5])) ||
    (value[6] !== null && !Number.isInteger(value[6])) ||
    (value[7] !== null && !isFiniteNumber(value[7])) ||
    (value[8] !== null && !isFiniteNumber(value[8]))
  ) {
    throw new Error("V5 backup contains an invalid inferred route point.");
  }

  return {
    accuracy: value[3],
    heading: value[7],
    ...(value[5] !== null ? { id: value[5] } : {}),
    latitude: value[0],
    longitude: value[1],
    pointIndex: value[4],
    ...(value[6] !== null ? { sessionId: value[6] } : {}),
    speedMetersPerSecond: value[8],
    timestamp: value[2]
  };
}

function encodePointPositionRuns(positions: readonly number[]) {
  const runs: Array<[number, number]> = [];
  let start: number | null = null;
  let previous: number | null = null;
  let count = 0;

  const flush = () => {
    if (start !== null && count > 0) {
      runs.push([start, count]);
    }
  };

  for (const position of positions) {
    if (!Number.isInteger(position) || position < 0) {
      throw new Error("Route snapshot contains an invalid point reference.");
    }

    if (start === null) {
      start = position;
      previous = position;
      count = 1;
      continue;
    }

    if (previous !== null && position === previous + 1) {
      previous = position;
      count += 1;
      continue;
    }

    flush();
    start = position;
    previous = position;
    count = 1;
  }

  flush();
  return runs;
}

function decodePointPositionRuns(value: unknown, rawPointCount: number) {
  if (!Array.isArray(value)) {
    throw new Error("V5 backup contains invalid confirmed point references.");
  }

  const positions: number[] = [];

  for (const run of value) {
    if (
      !Array.isArray(run) ||
      run.length !== 2 ||
      !Number.isInteger(run[0]) ||
      run[0] < 0 ||
      !Number.isInteger(run[1]) ||
      run[1] <= 0 ||
      run[0] + run[1] > rawPointCount
    ) {
      throw new Error("V5 backup contains an invalid confirmed point range.");
    }

    if (positions.length + run[1] > rawPointCount) {
      throw new Error(
        "V5 backup confirmed point references exceed the session point count."
      );
    }

    for (let offset = 0; offset < run[1]; offset += 1) {
      positions.push(run[0] + offset);
    }
  }

  return positions;
}

function isBackupV5BlockPlan(value: unknown): value is BackupV5BlockPlan {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    ["archive", "hot"].includes(String(value.kind)) &&
    typeof value.label === "string" &&
    Array.isArray(value.sessionIds) &&
    value.sessionIds.every((sessionId) => Number.isInteger(sessionId)) &&
    Number.isInteger(value.expectedPointCount) &&
    value.expectedPointCount >= 0
  );
}

function assertBackupV5MedalSystem(
  medalSystem: Record<string, any>,
  sessionIds: ReadonlySet<number>
) {
  const eventIds = new Set<number>();

  for (const event of medalSystem.acquisitionEvents as unknown[]) {
    if (
      !isRecord(event) ||
      !Number.isInteger(event.id) ||
      event.id <= 0 ||
      eventIds.has(event.id) ||
      typeof event.albumId !== "string" ||
      typeof event.medalId !== "string" ||
      (event.sessionId !== null && !sessionIds.has(event.sessionId)) ||
      !["recording", "retro_scan"].includes(event.reason) ||
      typeof event.enclosureId !== "string" ||
      typeof event.anchorCellId !== "string" ||
      !isFiniteNumber(event.enclosureAreaSquareMeters) ||
      event.enclosureAreaSquareMeters < 0 ||
      !Array.isArray(event.enclosureCellIds) ||
      !event.enclosureCellIds.every((cellId) => typeof cellId === "string") ||
      typeof event.acquiredAt !== "string" ||
      !Number.isFinite(new Date(event.acquiredAt).getTime())
    ) {
      throw new Error("V5 backup contains invalid medal acquisition data.");
    }

    eventIds.add(event.id);
  }

  for (const medal of medalSystem.collectedMedals as unknown[]) {
    if (
      !isRecord(medal) ||
      typeof medal.albumId !== "string" ||
      typeof medal.medalId !== "string" ||
      !eventIds.has(medal.acquisitionEventId) ||
      !["pending", "presenting", "presented"].includes(medal.presentationState) ||
      (medal.presentedAt !== null &&
        (typeof medal.presentedAt !== "string" ||
          !Number.isFinite(new Date(medal.presentedAt).getTime())))
    ) {
      throw new Error("V5 backup contains invalid collected medal data.");
    }
  }

  for (const setting of medalSystem.retroScanSettings as unknown[]) {
    if (
      !isRecord(setting) ||
      typeof setting.key !== "string" ||
      typeof setting.value !== "string"
    ) {
      throw new Error("V5 backup contains invalid medal scan settings.");
    }
  }
}

function assertBackupV5ZoneAchievements(achievements: unknown[]) {
  for (const achievement of achievements) {
    if (
      !isRecord(achievement) ||
      typeof achievement.zoneId !== "string" ||
      !["country", "city", "district"].includes(achievement.zoneType) ||
      typeof achievement.zoneName !== "string" ||
      typeof achievement.completedAt !== "string" ||
      !Number.isFinite(new Date(achievement.completedAt).getTime()) ||
      !Number.isInteger(achievement.exploredCells) ||
      achievement.exploredCells < 0 ||
      !Number.isInteger(achievement.totalZoneCells) ||
      achievement.totalZoneCells <= 0 ||
      typeof achievement.boundaryFetchedAt !== "string" ||
      typeof achievement.boundarySource !== "string" ||
      typeof achievement.geometryFingerprint !== "string"
    ) {
      throw new Error("V5 backup contains invalid zone achievement data.");
    }
  }
}

function assertBackupV5ExpeditionSystem(
  expeditionSystem: unknown,
  sessionIds: ReadonlySet<number>
) {
  if (expeditionSystem === undefined) {
    return;
  }

  if (
    !isRecord(expeditionSystem) ||
    !Array.isArray(expeditionSystem.expeditions) ||
    !Array.isArray(expeditionSystem.loopEvidence) ||
    !Array.isArray(expeditionSystem.seals)
  ) {
    throw new Error("V5 backup contains invalid expedition data.");
  }

  const kinds = new Set([
    "close_loop",
    "collect_medal",
    "complete_street",
    "explore_cells"
  ]);
  const expeditionIds = new Set<string>();
  let activeCount = 0;

  for (const expedition of expeditionSystem.expeditions as unknown[]) {
    if (
      !isRecord(expedition) ||
      typeof expedition.id !== "string" ||
      expeditionIds.has(expedition.id) ||
      typeof expedition.districtId !== "string" ||
      typeof expedition.districtName !== "string" ||
      typeof expedition.localDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expedition.localDate) ||
      !kinds.has(expedition.kind) ||
      !Number.isInteger(expedition.slot) ||
      expedition.slot < 0 ||
      !Number.isInteger(expedition.target) ||
      expedition.target <= 0 ||
      !Number.isInteger(expedition.progress) ||
      expedition.progress < 0 ||
      !isNullableBackupDate(expedition.acceptedAt) ||
      !isNullableBackupDate(expedition.abandonedAt) ||
      !isNullableBackupDate(expedition.completedAt) ||
      typeof expedition.updatedAt !== "string" ||
      !Number.isFinite(new Date(expedition.updatedAt).getTime())
    ) {
      throw new Error("V5 backup contains an invalid district expedition.");
    }

    if (
      expedition.acceptedAt !== null &&
      expedition.abandonedAt === null &&
      expedition.completedAt === null
    ) {
      activeCount += 1;
    }
    expeditionIds.add(expedition.id);
  }

  if (activeCount > 1) {
    throw new Error("V5 backup contains multiple active expeditions.");
  }

  const sealIds = new Set<string>();
  const sealedExpeditionIds = new Set<string>();

  for (const seal of expeditionSystem.seals as unknown[]) {
    if (
      !isRecord(seal) ||
      typeof seal.id !== "string" ||
      sealIds.has(seal.id) ||
      typeof seal.expeditionId !== "string" ||
      !expeditionIds.has(seal.expeditionId) ||
      sealedExpeditionIds.has(seal.expeditionId) ||
      typeof seal.districtId !== "string" ||
      typeof seal.districtName !== "string" ||
      typeof seal.localDate !== "string" ||
      !kinds.has(seal.kind) ||
      typeof seal.earnedAt !== "string" ||
      !Number.isFinite(new Date(seal.earnedAt).getTime())
    ) {
      throw new Error("V5 backup contains an invalid expedition seal.");
    }

    sealIds.add(seal.id);
    sealedExpeditionIds.add(seal.expeditionId);
  }

  const evidenceKeys = new Set<string>();

  for (const evidence of expeditionSystem.loopEvidence as unknown[]) {
    const key = isRecord(evidence)
      ? `${String(evidence.expeditionId)}:${String(evidence.sessionId)}`
      : "";

    if (
      !isRecord(evidence) ||
      typeof evidence.expeditionId !== "string" ||
      !expeditionIds.has(evidence.expeditionId) ||
      !Number.isInteger(evidence.sessionId) ||
      !sessionIds.has(evidence.sessionId) ||
      evidenceKeys.has(key) ||
      typeof evidence.detectedAt !== "string" ||
      !Number.isFinite(new Date(evidence.detectedAt).getTime())
    ) {
      throw new Error("V5 backup contains invalid expedition loop evidence.");
    }

    evidenceKeys.add(key);
  }
}

function isNullableBackupDate(value: unknown) {
  return value === null || (
    typeof value === "string" && Number.isFinite(new Date(value).getTime())
  );
}

function isBackupV5RouteBridgeEvidence(
  value: unknown
): value is RouteBridgeEvidence {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return false;
  }

  const numericValues = [
    value.endSnapDistanceMeters,
    value.endpointJoinCount,
    value.gapDistanceMeters,
    value.gapDurationSeconds,
    value.inferredCellCount,
    value.intersectionJoinCount,
    value.maxEndpointJoinDistanceMeters,
    value.routeDistanceMeters,
    value.sourceStreetSegmentCount,
    value.startSnapDistanceMeters,
    value.straightDistanceMeters
  ];

  return (
    [
      "exact_topology",
      "geometric_crossing",
      "near_endpoint_join"
    ].includes(value.acceptanceReason) &&
    numericValues.every(isFiniteNumber)
  );
}

function getSessionMonth(startedAt: string) {
  const parsed = new Date(startedAt);

  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Backup session has an invalid start date.");
  }

  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0")
  ].join("-");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
