import { Directory, File, Paths } from "expo-file-system";

import { BACKGROUND_LOCATION_RECOVERY_GRACE_MS } from "../constants/config";
import { initDatabase } from "../database/db";
import {
  getGpsObservationsForSession,
  markFinalizedGpsObservationsDerived,
  replaceFinalizedWalkGpsPointsFromObservations,
  upsertFinalizedGpsObservations
} from "../database/gpsObservationRepository";
import {
  getGpsPointsForSession,
  getWalkSessionById,
  getWalkSessionsIntersectingRange,
  purgeExpiredUnderfilledRecordings
} from "../database/walkRepository";
import { ActivityMode, GpsPoint, WalkSession } from "../types/walk";
import { calculatePathDistanceMeters } from "./distance";
import {
  evaluateGpsPoint,
  persistAcceptedGpsPoint
} from "./walkRecorder";

type RawGpsPoint = Omit<GpsPoint, "pointIndex">;

type BackgroundLocationBatch = {
  createdAt: string;
  id: string;
  points: RawGpsPoint[];
  preferredSessionId: number | null;
  version: 2;
};

type ParsedBackgroundLocationBatch = Omit<
  BackgroundLocationBatch,
  "preferredSessionId" | "version"
> & {
  preferredSessionId: number | null;
  version: 1 | 2;
};

type PendingGpsPoint = {
  allowUniqueSessionFallback: boolean;
  createdAtMs: number;
  point: RawGpsPoint;
  preferredSessionId: number | null;
};

export type BackgroundLocationOutboxResult = {
  deferredPointCount: number;
  ignoredPointCount: number;
  persistedPointCount: number;
  processedBatchCount: number;
};

const OUTBOX_DIRECTORY_NAME = "street-explorer-background-location-outbox";
const ACTIVE_SESSION_PERSISTENCE_CHUNK_SIZE = 512;
const outboxDirectory = new Directory(Paths.document, OUTBOX_DIRECTORY_NAME);

let backgroundLocationDrainOperation: Promise<void> = Promise.resolve();
let nextBackgroundBatchSequence = 0;
let outboxAdmissionCloseDepth = 0;
const finalizedLocationChangeListeners =
  new Set<() => void>();

export function persistDeliveredBackgroundLocationBatch(
  points: RawGpsPoint[],
  preferredSessionId: number | null = null
): Promise<BackgroundLocationOutboxResult> {
  if (points.length === 0) {
    return Promise.resolve(emptyOutboxResult());
  }

  if (outboxAdmissionCloseDepth > 0) {
    return Promise.reject(
      new Error("Background GPS admission is closed for data replacement.")
    );
  }

  writeBackgroundLocationBatch(points, preferredSessionId);
  return drainPendingBackgroundLocationBatches();
}

export function drainPendingBackgroundLocationBatches() {
  return enqueueBackgroundLocationDrainOperation(
    drainBackgroundLocationOutboxFiles
  );
}

export function subscribeToFinalizedBackgroundLocationChanges(
  listener: () => void
) {
  finalizedLocationChangeListeners.add(listener);

  return () => {
    finalizedLocationChangeListeners.delete(listener);
  };
}

export function closeBackgroundLocationOutboxAdmission() {
  outboxAdmissionCloseDepth += 1;
  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    outboxAdmissionCloseDepth = Math.max(0, outboxAdmissionCloseDepth - 1);
  };
}

export function discardPendingBackgroundLocationBatches() {
  if (outboxAdmissionCloseDepth === 0) {
    return Promise.reject(
      new Error("Background GPS admission must be closed before discarding its journal.")
    );
  }

  return enqueueBackgroundLocationDrainOperation(async () => {
    ensureOutboxDirectory();

    for (const entry of outboxDirectory.list()) {
      if (
        entry.uri.endsWith(".json") ||
        entry.uri.endsWith(".tmp")
      ) {
        new File(entry.uri).delete();
      }
    }
  });
}

function enqueueBackgroundLocationDrainOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = backgroundLocationDrainOperation.then(operation, operation);
  backgroundLocationDrainOperation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function writeBackgroundLocationBatch(
  points: RawGpsPoint[],
  preferredSessionId: number | null
) {
  ensureOutboxDirectory();
  const timestamp = Date.now().toString().padStart(13, "0");
  const sequence = (nextBackgroundBatchSequence++).toString().padStart(6, "0");
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const id = `${timestamp}-${sequence}-${randomSuffix}`;
  const temporaryFile = new File(outboxDirectory, `${id}.tmp`);
  const batch: BackgroundLocationBatch = {
    createdAt: new Date().toISOString(),
    id,
    points: deduplicateRawPoints(points),
    preferredSessionId,
    version: 2
  };

  temporaryFile.write(JSON.stringify(batch));
  temporaryFile.rename(`${id}.json`);
}

async function drainBackgroundLocationOutboxFiles() {
  ensureOutboxDirectory();
  await recoverTemporaryBackgroundLocationBatches();

  const files = outboxDirectory
    .list()
    .filter((entry) => entry.uri.endsWith(".json"))
    .map((entry) => new File(entry.uri))
    .sort((left, right) => left.uri.localeCompare(right.uri));

  if (files.length === 0) {
    await initDatabase();
    await purgeExpiredUnderfilledRecordings();
    return emptyOutboxResult();
  }

  const validFiles: File[] = [];
  const batches: ParsedBackgroundLocationBatch[] = [];

  for (const file of files) {
    try {
      batches.push(parseBackgroundLocationBatch(await file.text()));
      validFiles.push(file);
    } catch (error) {
      console.error("Quarantining an invalid background GPS outbox batch", error);
      quarantineInvalidBatch(file);
    }
  }

  if (validFiles.length === 0) {
    return emptyOutboxResult();
  }

  await initDatabase();
  await purgeExpiredUnderfilledRecordings();
  const pendingPoints = batches.flatMap((batch) =>
    batch.points.map((point) => ({
      allowUniqueSessionFallback:
        batch.version === 1 ||
        batch.preferredSessionId === null,
      createdAtMs: new Date(batch.createdAt).getTime(),
      point,
      preferredSessionId: batch.preferredSessionId
    }))
  );
  const result = await persistBackgroundLocationPoints(
    pendingPoints,
    validFiles.length
  );

  if (result.deferredPointCount === 0) {
    for (const file of validFiles) {
      if (file.exists) {
        file.delete();
      }
    }
  }

  await purgeExpiredUnderfilledRecordings();
  return result;
}

async function recoverTemporaryBackgroundLocationBatches() {
  const temporaryFiles = outboxDirectory
    .list()
    .filter((entry) => entry.uri.endsWith(".tmp"))
    .map((entry) => new File(entry.uri));

  for (const file of temporaryFiles) {
    try {
      const batch = parseBackgroundLocationBatch(await file.text());
      file.rename(`${batch.id}.json`);
    } catch (error) {
      console.error("Quarantining an incomplete background GPS journal", error);
      quarantineInvalidBatch(file);
    }
  }
}

async function persistBackgroundLocationPoints(
  pendingPoints: PendingGpsPoint[],
  processedBatchCount: number
) {
  const orderedPoints = [...pendingPoints].sort((left, right) =>
    compareGpsPoints(left.point, right.point)
  );
  const firstPoint = orderedPoints[0]?.point;
  const lastPoint = orderedPoints.at(-1)?.point;

  if (!firstPoint || !lastPoint) {
    return {
      ...emptyOutboxResult(),
      processedBatchCount
    };
  }

  const sessions = await getWalkSessionsIntersectingRange(
    firstPoint.timestamp,
    lastPoint.timestamp
  );
  const pointsBySession = new Map<
    number,
    { points: RawGpsPoint[]; session: WalkSession }
  >();
  let deferredPointCount = 0;
  let ignoredPointCount = 0;

  for (const pendingPoint of orderedPoints) {
    const session = selectSessionForPoint(pendingPoint, sessions);

    if (!session) {
      if (
        Date.now() - pendingPoint.createdAtMs <=
        BACKGROUND_LOCATION_RECOVERY_GRACE_MS
      ) {
        deferredPointCount += 1;
      } else {
        ignoredPointCount += 1;
      }
      continue;
    }

    const group = pointsBySession.get(session.id) ?? {
      points: [],
      session
    };
    group.points.push(pendingPoint.point);
    pointsBySession.set(session.id, group);
  }

  let persistedPointCount = 0;

  for (const { points, session } of pointsBySession.values()) {
    const deduplicatedPoints = deduplicateRawPoints(points);
    const groupResult =
      session.endedAt === session.startedAt
        ? await persistActiveSessionPoints(session, deduplicatedPoints)
        : await persistFinalizedSessionPoints(session, deduplicatedPoints);

    ignoredPointCount += groupResult.ignoredPointCount;
    persistedPointCount += groupResult.persistedPointCount;
  }

  return {
    deferredPointCount,
    ignoredPointCount,
    persistedPointCount,
    processedBatchCount
  };
}

async function persistActiveSessionPoints(
  session: WalkSession,
  points: RawGpsPoint[]
) {
  let ignoredPointCount = 0;
  let persistedPointCount = 0;
  let firstError: unknown = null;

  for (
    let offset = 0;
    offset < points.length;
    offset += ACTIVE_SESSION_PERSISTENCE_CHUNK_SIZE
  ) {
    const chunk = points.slice(
      offset,
      offset + ACTIVE_SESSION_PERSISTENCE_CHUNK_SIZE
    );
    const results = await Promise.allSettled(
      chunk.map((point) =>
        persistAcceptedGpsPoint(session.id, session.activityMode, point)
      )
    );

    for (const result of results) {
      if (result.status === "rejected") {
        firstError ??= result.reason;
        continue;
      }

      if (result.value.point) {
        persistedPointCount += 1;
      } else {
        ignoredPointCount += 1;
      }
    }

    if (firstError) {
      break;
    }
  }

  if (firstError) {
    const currentSession = await getWalkSessionById(session.id);

    if (!currentSession) {
      return {
        ignoredPointCount: Math.max(
          0,
          points.length - persistedPointCount
        ),
        persistedPointCount
      };
    }

    if (currentSession.endedAt !== currentSession.startedAt) {
      return persistFinalizedSessionPoints(currentSession, points);
    }

    throw firstError;
  }

  return {
    ignoredPointCount,
    persistedPointCount
  };
}

async function persistFinalizedSessionPoints(
  session: WalkSession,
  rawPoints: RawGpsPoint[]
) {
  const observationGeneration = await upsertFinalizedGpsObservations(
    session.id,
    session.endedAt,
    rawPoints
  );

  if (!observationGeneration) {
    const currentSession = await getWalkSessionById(session.id);

    if (!currentSession) {
      return {
        ignoredPointCount: rawPoints.length,
        persistedPointCount: 0
      };
    }

    throw new Error(
      "Finalized background GPS target changed before its observations could merge."
    );
  }

  const [existingPoints, observations] = await Promise.all([
    getGpsPointsForSession(session.id),
    getGpsObservationsForSession(session.id)
  ]);
  const canonicalPoints = buildCanonicalGpsPoints(
    session.activityMode,
    observations
  );
  const existingTimestamps = new Set(
    existingPoints.map((point) => point.timestamp)
  );
  const deliveredTimestamps = new Set(
    rawPoints.map((point) => point.timestamp)
  );
  const acceptedNewPointCount = canonicalPoints.filter(
    (point) =>
      deliveredTimestamps.has(point.timestamp) &&
      !existingTimestamps.has(point.timestamp)
  ).length;

  const routeChanged =
    !areGpsPointSequencesEquivalent(existingPoints, canonicalPoints);
  const derivationPersisted =
    !routeChanged
      ? await markFinalizedGpsObservationsDerived(
          session.id,
          session.endedAt,
          canonicalPoints,
          observationGeneration
        )
      : await replaceFinalizedWalkGpsPointsFromObservations(
          session.id,
          session.endedAt,
          canonicalPoints,
          calculatePathDistanceMeters(canonicalPoints),
          observationGeneration
        );

  if (!derivationPersisted) {
    throw new Error(
      "Finalized background GPS observations changed before their route could rebuild."
    );
  }

  if (routeChanged) {
    notifyFinalizedBackgroundLocationChange();
  }

  return {
    ignoredPointCount: rawPoints.length - acceptedNewPointCount,
    persistedPointCount: acceptedNewPointCount
  };
}

function buildCanonicalGpsPoints(
  activityMode: ActivityMode,
  observations: GpsPoint[]
) {
  const acceptedPoints: GpsPoint[] = [];

  for (const observation of observations) {
    const evaluation = evaluateGpsPoint(
      activityMode,
      acceptedPoints.at(-1) ?? null,
      observation
    );

    if (evaluation.accepted) {
      acceptedPoints.push({
        ...observation,
        pointIndex: acceptedPoints.length
      });
    }
  }

  return acceptedPoints;
}

function areGpsPointSequencesEquivalent(
  left: readonly GpsPoint[],
  right: readonly GpsPoint[]
) {
  return (
    left.length === right.length &&
    left.every((point, index) => {
      const other = right[index];

      return (
        other !== undefined &&
        point.timestamp === other.timestamp &&
        point.latitude === other.latitude &&
        point.longitude === other.longitude &&
        point.accuracy === other.accuracy &&
        point.pointIndex === other.pointIndex
      );
    })
  );
}

function selectSessionForPoint(
  pendingPoint: PendingGpsPoint,
  sessions: WalkSession[]
) {
  if (pendingPoint.preferredSessionId !== null) {
    const preferredSession = sessions.find(
      (session) =>
        session.id === pendingPoint.preferredSessionId &&
        isPointInsideSession(pendingPoint.point, session)
    );

    if (preferredSession) {
      return preferredSession;
    }
  }

  if (!pendingPoint.allowUniqueSessionFallback) {
    return null;
  }

  const matchingSessions = sessions.filter((session) =>
    isPointInsideSession(pendingPoint.point, session)
  );

  return matchingSessions.length === 1
    ? matchingSessions[0] ?? null
    : null;
}

function ensureOutboxDirectory() {
  if (!outboxDirectory.exists) {
    outboxDirectory.create({
      idempotent: true,
      intermediates: true
    });
  }
}

function quarantineInvalidBatch(file: File) {
  const originalName = decodeURIComponent(file.uri.split("/").at(-1) ?? "batch");
  file.rename(`${originalName}.corrupt`);
}

function parseBackgroundLocationBatch(
  value: string
): ParsedBackgroundLocationBatch {
  const parsed: unknown = JSON.parse(value);

  const candidate = parsed as Partial<ParsedBackgroundLocationBatch>;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (candidate.version !== 1 && candidate.version !== 2) ||
    typeof candidate.id !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !Number.isFinite(new Date(candidate.createdAt).getTime()) ||
    !Array.isArray(candidate.points) ||
    !candidate.points.every(isRawGpsPoint)
  ) {
    throw new Error("Invalid background location outbox batch.");
  }

  const batch = parsed as Partial<BackgroundLocationBatch> & {
    points: RawGpsPoint[];
    version: 1 | 2;
  };

  return {
    createdAt: batch.createdAt as string,
    id: batch.id as string,
    points: deduplicateRawPoints(batch.points),
    preferredSessionId:
      batch.version === 2 &&
      typeof batch.preferredSessionId === "number" &&
      Number.isInteger(batch.preferredSessionId) &&
      batch.preferredSessionId > 0
        ? batch.preferredSessionId
        : null,
    version: batch.version
  };
}

function isRawGpsPoint(value: unknown): value is RawGpsPoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Partial<RawGpsPoint>;
  const timestampMs =
    typeof point.timestamp === "string"
      ? new Date(point.timestamp).getTime()
      : Number.NaN;

  return (
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude) &&
    Number.isFinite(timestampMs) &&
    (point.accuracy === null ||
      (typeof point.accuracy === "number" && Number.isFinite(point.accuracy)))
  );
}

function deduplicateRawPoints(points: RawGpsPoint[]) {
  const pointsByTimestamp = new Map<string, RawGpsPoint>();

  for (const point of points) {
    const existingPoint = pointsByTimestamp.get(point.timestamp);
    const existingAccuracy = existingPoint?.accuracy ?? Number.POSITIVE_INFINITY;
    const nextAccuracy = point.accuracy ?? Number.POSITIVE_INFINITY;

    if (!existingPoint || nextAccuracy < existingAccuracy) {
      pointsByTimestamp.set(point.timestamp, point);
    }
  }

  return [...pointsByTimestamp.values()].sort(compareGpsPoints);
}

function compareGpsPoints(
  left: Pick<GpsPoint, "timestamp">,
  right: Pick<GpsPoint, "timestamp">
) {
  return (
    new Date(left.timestamp).getTime() -
    new Date(right.timestamp).getTime()
  );
}

function isPointInsideSession(point: RawGpsPoint, session: WalkSession) {
  const pointTimestamp = new Date(point.timestamp).getTime();
  const startedAt = new Date(session.startedAt).getTime();
  const endedAt = new Date(session.endedAt).getTime();

  return (
    pointTimestamp >= startedAt &&
    (session.endedAt === session.startedAt || pointTimestamp <= endedAt)
  );
}

function notifyFinalizedBackgroundLocationChange() {
  for (const listener of finalizedLocationChangeListeners) {
    try {
      listener();
    } catch (error) {
      console.warn(
        "A finalized background GPS refresh listener failed",
        error
      );
    }
  }
}

function emptyOutboxResult(): BackgroundLocationOutboxResult {
  return {
    deferredPointCount: 0,
    ignoredPointCount: 0,
    persistedPointCount: 0,
    processedBatchCount: 0
  };
}
