import {
  getGpsObservationsForSession,
  markGpsObservationProcessed,
  replaceActiveWalkGpsPointsFromObservations,
  saveActiveGpsObservation
} from "../database/gpsObservationRepository";
import {
  finishWalkSession,
  getGpsPointForSessionTimestamp,
  getLastGpsPointForSession,
  getWalkSessionById,
  saveGpsPointWithNextIndex
} from "../database/walkRepository";
import {
  calculatePathDistanceMeters,
  haversineDistanceMeters
} from "./distance";
import { ActiveWalk, ActivityMode, GpsPoint } from "../types/walk";
import {
  ACTIVE_RAW_POINT_LIMIT,
  appendGpsPoint,
  appendPersistedGpsPoint,
  applyRejectedGpsEvaluation,
  collectConfirmedLiveExploredCellIds,
  createActiveWalk,
  evaluateGpsPoint
} from "./recordingState";

export {
  ACTIVE_RAW_POINT_LIMIT,
  appendGpsPoint,
  appendPersistedGpsPoint,
  applyRejectedGpsEvaluation,
  collectConfirmedLiveExploredCellIds,
  createActiveWalk,
  evaluateGpsPoint
};
export type { AppendGpsPointResult, PointEvaluation } from "./recordingState";

export type GpsPersistenceResult = {
  didRebuild: boolean;
  evaluation: ReturnType<typeof evaluateGpsPoint>;
  point: GpsPoint | null;
};

type GpsPersistenceJob = {
  activityMode: ActivityMode;
  arrivalSequence: number;
  eligibleAtMs: number;
  isSettled: boolean;
  rawPoint: Omit<GpsPoint, "pointIndex">;
  reject: (reason: unknown) => void;
  resolve: (result: GpsPersistenceResult) => void;
};

type GpsPersistenceQueue = {
  jobs: GpsPersistenceJob[];
  lastError: unknown;
  reorderTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  running: Promise<void> | null;
};

const GPS_PERSISTENCE_MAX_PENDING_JOBS = 4096;
const GPS_PERSISTENCE_REORDER_WINDOW_MS = 750;
const GPS_PERSISTENCE_RETRY_DELAYS_MS = [
  250,
  1000,
  2000,
  5000,
  15_000,
  30_000
] as const;
const gpsPersistenceQueues = new Map<number, GpsPersistenceQueue>();
const gpsPersistenceFullSyncGenerations =
  new Map<number, number>();
let gpsPersistenceAdmissionCloseDepth = 0;
let nextGpsPersistenceArrivalSequence = 0;

export class GpsPersistenceBacklogError extends Error {
  constructor() {
    super("GPS persistence backlog is full; recording must wait for storage recovery.");
    this.name = "GpsPersistenceBacklogError";
  }
}

class GpsPersistenceAdmissionClosedError extends Error {
  constructor() {
    super("GPS persistence admission is closed for data replacement.");
    this.name = "GpsPersistenceAdmissionClosedError";
  }
}

class GpsPersistenceSessionClosedError extends Error {
  constructor() {
    super("GPS persistence stopped because the recording is already closed.");
    this.name = "GpsPersistenceSessionClosedError";
  }
}

export function canQueueAcceptedGpsPoint(sessionId: number) {
  return (
    (gpsPersistenceQueues.get(sessionId)?.jobs.length ?? 0) <
    GPS_PERSISTENCE_MAX_PENDING_JOBS
  );
}

export function persistAcceptedGpsPoint(
  sessionId: number,
  activityMode: ActivityMode,
  rawPoint: Omit<GpsPoint, "pointIndex">
): Promise<GpsPersistenceResult> {
  if (gpsPersistenceAdmissionCloseDepth > 0) {
    return Promise.reject(new GpsPersistenceAdmissionClosedError());
  }

  const queue = getOrCreatePersistenceQueue(sessionId);

  if (queue.jobs.length >= GPS_PERSISTENCE_MAX_PENDING_JOBS) {
    return Promise.reject(new GpsPersistenceBacklogError());
  }

  let resolveJob!: (result: GpsPersistenceResult) => void;
  let rejectJob!: (reason: unknown) => void;
  const operation = new Promise<GpsPersistenceResult>((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
  });
  const job: GpsPersistenceJob = {
    activityMode,
    arrivalSequence: nextGpsPersistenceArrivalSequence++,
    eligibleAtMs: Date.now() + GPS_PERSISTENCE_REORDER_WINDOW_MS,
    isSettled: false,
    rawPoint,
    reject: rejectJob,
    resolve: resolveJob
  };
  queue.jobs.push(job);

  if (
    queue.lastError !== undefined &&
    queue.jobs[0]?.isSettled
  ) {
    job.isSettled = true;
    job.reject(queue.lastError);
  }

  schedulePersistenceDrain(sessionId, queue);
  return operation;
}

export function consumeGpsPersistenceFullSyncRequest(sessionId: number) {
  return gpsPersistenceFullSyncGenerations.get(sessionId) ?? null;
}

export function acknowledgeGpsPersistenceFullSyncRequest(
  sessionId: number,
  generation: number
) {
  if (
    gpsPersistenceFullSyncGenerations.get(sessionId) === generation
  ) {
    gpsPersistenceFullSyncGenerations.delete(sessionId);
  }
}

export function discardPendingGpsPoints(sessionId: number) {
  gpsPersistenceFullSyncGenerations.delete(sessionId);

  const queue = gpsPersistenceQueues.get(sessionId);

  if (!queue) {
    return;
  }

  gpsPersistenceQueues.delete(sessionId);

  if (queue.retryTimer) {
    clearTimeout(queue.retryTimer);
    queue.retryTimer = null;
  }

  if (queue.reorderTimer) {
    clearTimeout(queue.reorderTimer);
    queue.reorderTimer = null;
  }

  const error = new Error("GPS persistence cancelled because the recording was discarded.");

  for (const job of queue.jobs.splice(0)) {
    if (!job.isSettled) {
      job.isSettled = true;
      job.reject(error);
    }
  }
}

export function closeGpsPersistenceAdmission() {
  gpsPersistenceAdmissionCloseDepth += 1;
  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    gpsPersistenceAdmissionCloseDepth = Math.max(
      0,
      gpsPersistenceAdmissionCloseDepth - 1
    );
  };
}

export async function discardAllGpsPersistenceForDataReplacement() {
  if (gpsPersistenceAdmissionCloseDepth === 0) {
    throw new Error(
      "GPS persistence admission must be closed before replacing data."
    );
  }

  const runningOperations = [...gpsPersistenceQueues.values()]
    .flatMap((queue) => queue.running ? [queue.running] : []);
  const sessionIds = [...gpsPersistenceQueues.keys()];

  for (const sessionId of sessionIds) {
    discardPendingGpsPoints(sessionId);
  }

  await Promise.allSettled(runningOperations);
  gpsPersistenceFullSyncGenerations.clear();
}

export async function flushPendingGpsPoints(sessionId: number) {
  for (;;) {
    const queue = gpsPersistenceQueues.get(sessionId);

    if (!queue) {
      return;
    }

    if (queue.running) {
      await queue.running;
      continue;
    }

    if (queue.jobs.length > 0) {
      if (queue.reorderTimer) {
        clearTimeout(queue.reorderTimer);
        queue.reorderTimer = null;
      }

      if (queue.retryTimer) {
        clearTimeout(queue.retryTimer);
        queue.retryTimer = null;
      }

      await drainPersistenceQueue(sessionId, queue, true);

      if (queue.jobs.length > 0) {
        throw queue.lastError;
      }

      continue;
    }

    if (gpsPersistenceQueues.get(sessionId) === queue) {
      gpsPersistenceQueues.delete(sessionId);
    }

    return;
  }
}

function drainPersistenceQueue(
  sessionId: number,
  queue: GpsPersistenceQueue,
  bypassReorderWindow = false
) {
  if (queue.running) {
    return queue.running;
  }

  const running = (async () => {
    while (queue.jobs.length > 0) {
      orderPersistenceJobs(queue.jobs);
      const job = queue.jobs[0];

      if (!job) {
        break;
      }

      if (!bypassReorderWindow && job.eligibleAtMs > Date.now()) {
        break;
      }

      try {
        const result = await persistGpsPointJob(sessionId, job);
        const completedJobIndex = queue.jobs.indexOf(job);

        if (completedJobIndex >= 0) {
          queue.jobs.splice(completedJobIndex, 1);
        }

        queue.lastError = undefined;
        queue.retryAttempt = 0;

        if (!job.isSettled) {
          job.isSettled = true;
          job.resolve(result);
        }
      } catch (error) {
        queue.lastError = error;
        const sessionClosed = error instanceof GpsPersistenceSessionClosedError;

        // Retain every job for the bounded retry loop, but settle every caller.
        // Otherwise a background outbox replay queued behind the failed head can
        // wait forever even though no later job is eligible to run yet.
        for (const pendingJob of queue.jobs) {
          if (!pendingJob.isSettled) {
            pendingJob.isSettled = true;
            pendingJob.reject(error);
          }
        }

        if (sessionClosed) {
          queue.jobs.splice(0);

          if (queue.retryTimer) {
            clearTimeout(queue.retryTimer);
            queue.retryTimer = null;
          }

          if (queue.reorderTimer) {
            clearTimeout(queue.reorderTimer);
            queue.reorderTimer = null;
          }

          if (gpsPersistenceQueues.get(sessionId) === queue) {
            gpsPersistenceQueues.delete(sessionId);
          }

          break;
        }

        schedulePersistenceRetry(sessionId, queue);
        break;
      }
    }
  })();

  queue.running = running;
  void running.finally(() => {
    if (queue.running === running) {
      queue.running = null;
    }

    if (
      queue.jobs.length === 0 &&
      gpsPersistenceQueues.get(sessionId) === queue
    ) {
      gpsPersistenceQueues.delete(sessionId);
      return;
    }

    if (
      queue.jobs.length > 0 &&
      !queue.retryTimer &&
      gpsPersistenceQueues.get(sessionId) === queue
    ) {
      schedulePersistenceDrain(sessionId, queue);
    }
  });

  return running;
}

function schedulePersistenceDrain(
  sessionId: number,
  queue: GpsPersistenceQueue
) {
  if (
    queue.jobs.length === 0 ||
    queue.reorderTimer ||
    queue.retryTimer ||
    queue.running ||
    gpsPersistenceQueues.get(sessionId) !== queue
  ) {
    return;
  }

  orderPersistenceJobs(queue.jobs);
  const firstJob = queue.jobs[0];

  if (!firstJob) {
    return;
  }

  const delayMs = Math.max(0, firstJob.eligibleAtMs - Date.now());
  queue.reorderTimer = setTimeout(() => {
    queue.reorderTimer = null;

    if (gpsPersistenceQueues.get(sessionId) === queue) {
      void drainPersistenceQueue(sessionId, queue);
    }
  }, delayMs);
}

function orderPersistenceJobs(jobs: GpsPersistenceJob[]) {
  jobs.sort((left, right) => {
    const timestampDifference =
      getPersistenceTimestampMs(left) - getPersistenceTimestampMs(right);

    return timestampDifference || left.arrivalSequence - right.arrivalSequence;
  });
}

function getPersistenceTimestampMs(job: GpsPersistenceJob) {
  const timestampMs = new Date(job.rawPoint.timestamp).getTime();

  return Number.isFinite(timestampMs)
    ? timestampMs
    : Number.MAX_SAFE_INTEGER;
}

function schedulePersistenceRetry(
  sessionId: number,
  queue: GpsPersistenceQueue
) {
  if (
    queue.retryTimer ||
    gpsPersistenceQueues.get(sessionId) !== queue
  ) {
    return;
  }

  const retryIndex = Math.min(
    queue.retryAttempt,
    GPS_PERSISTENCE_RETRY_DELAYS_MS.length - 1
  );
  const retryDelay =
    GPS_PERSISTENCE_RETRY_DELAYS_MS[retryIndex] ??
    GPS_PERSISTENCE_RETRY_DELAYS_MS[
      GPS_PERSISTENCE_RETRY_DELAYS_MS.length - 1
    ];

  queue.retryAttempt += 1;
  queue.retryTimer = setTimeout(() => {
    queue.retryTimer = null;

    if (gpsPersistenceQueues.get(sessionId) === queue) {
      void drainPersistenceQueue(sessionId, queue);
    }
  }, retryDelay);
}

async function persistGpsPointJob(
  sessionId: number,
  job: GpsPersistenceJob
): Promise<GpsPersistenceResult> {
  const observationWrite = await saveActiveGpsObservation(
    sessionId,
    job.rawPoint
  );

  if (!observationWrite.observation) {
    throw new GpsPersistenceSessionClosedError();
  }

  if (observationWrite.processed) {
    const persistedPoint = observationWrite.accepted
      ? await getGpsPointForSessionTimestamp(
          sessionId,
          job.rawPoint.timestamp
        )
      : null;

    if (observationWrite.accepted && !persistedPoint) {
      throw new Error("A derived GPS observation is missing its route point.");
    }

    return {
      didRebuild: false,
      evaluation: observationWrite.accepted
        ? { accepted: true, speedMetersPerSecond: 0 }
        : { accepted: false, countAsRejected: false, reason: null },
      point: persistedPoint
    };
  }

  if (observationWrite.requiresRebuild) {
    const observations = await getGpsObservationsForSession(sessionId);
    const acceptedPoints = buildCanonicalGpsPoints(
      job.activityMode,
      observations
    );
    const replaced = await replaceActiveWalkGpsPointsFromObservations(
      sessionId,
      acceptedPoints,
      calculatePathDistanceMeters(acceptedPoints),
      observationWrite
    );

    if (!replaced) {
      throw new Error(
        "GPS observations changed before their active route could rebuild."
      );
    }

    gpsPersistenceFullSyncGenerations.set(
      sessionId,
      (gpsPersistenceFullSyncGenerations.get(sessionId) ?? 0) + 1
    );
    const persistedPoint = acceptedPoints.some(
      (point) => point.timestamp === job.rawPoint.timestamp
    )
      ? await getGpsPointForSessionTimestamp(
          sessionId,
          job.rawPoint.timestamp
        )
      : null;

    return {
      didRebuild: true,
      evaluation: persistedPoint
        ? { accepted: true, speedMetersPerSecond: 0 }
        : { accepted: false, countAsRejected: false, reason: null },
      point: persistedPoint
    };
  }

  const previousPoint = await getLastGpsPointForSession(sessionId);
  const evaluation = evaluateGpsPoint(job.activityMode, previousPoint, {
    ...job.rawPoint,
    pointIndex: 0
  });

  if (!evaluation.accepted) {
    await markGpsObservationProcessed(
      sessionId,
      job.rawPoint.timestamp,
      false
    );

    return {
      didRebuild: false,
      evaluation,
      point: null
    };
  }

  const persistedPoint = await saveGpsPointWithNextIndex(
    sessionId,
    job.rawPoint,
    previousPoint
      ? haversineDistanceMeters(previousPoint, {
          ...job.rawPoint,
          pointIndex: 0
        })
      : 0
  );

  if (!persistedPoint) {
    throw new GpsPersistenceSessionClosedError();
  }

  await markGpsObservationProcessed(
    sessionId,
    job.rawPoint.timestamp,
    true
  );

  return {
    didRebuild: false,
    evaluation,
    point: persistedPoint
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

function getOrCreatePersistenceQueue(sessionId: number) {
  const existingQueue = gpsPersistenceQueues.get(sessionId);

  if (existingQueue) {
    return existingQueue;
  }

  const queue: GpsPersistenceQueue = {
    jobs: [],
    lastError: undefined,
    reorderTimer: null,
    retryAttempt: 0,
    retryTimer: null,
    running: null
  };

  gpsPersistenceQueues.set(sessionId, queue);
  return queue;
}

export async function finishPersistedActiveWalk(
  activeWalk: ActiveWalk,
  endedAt: string,
  stepCount = activeWalk.stepCount,
  displayName?: string
) {
  await flushPendingGpsPoints(activeWalk.sessionId);
  const persistedSession = await getWalkSessionById(activeWalk.sessionId);
  const durationSeconds = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(activeWalk.startedAt).getTime()) / 1000)
  );
  const finalized = await finishWalkSession(activeWalk.sessionId, {
    endedAt,
    ...(displayName !== undefined ? { displayName } : {}),
    distanceMeters:
      persistedSession?.distanceMeters ?? activeWalk.distanceMeters,
    durationSeconds,
    stepCount
  });

  return finalized ? activeWalk.sessionId : null;
}
