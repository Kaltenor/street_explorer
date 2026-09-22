import type {
  CachedZone,
  ZoneCompletionSnapshot
} from "../database/completionRepository";
import type { ActivityMode } from "../types/walk";
import type { ZoneCompletionStats } from "./zoneCompletion";

export type CompletionZonePair = {
  city: CachedZone | null;
  district: CachedZone | null;
};

export function getPresentedCompletionPercent(
  stats: ZoneCompletionStats | null
) {
  if (stats?.permanentlyCompleted) {
    return 100;
  }

  return stats?.completionPercent ?? null;
}

export function getPresentedRemainingCells(
  stats: ZoneCompletionStats | null
) {
  if (stats?.permanentlyCompleted) {
    return 0;
  }

  if (!stats || stats.totalZoneCells === null) {
    return null;
  }

  return Math.max(0, stats.totalZoneCells - stats.exploredCells);
}

export function isZoneCompletionSnapshotValid(input: {
  explorationRevision: number;
  geometryFingerprint: string;
  mode: ActivityMode;
  snapshot: ZoneCompletionSnapshot | null;
  zoneId: string;
}) {
  const { explorationRevision, geometryFingerprint, mode, snapshot, zoneId } = input;

  return Boolean(
    snapshot &&
    snapshot.zoneId === zoneId &&
    snapshot.mode === mode &&
    snapshot.explorationRevision === explorationRevision &&
    snapshot.geometryFingerprint === geometryFingerprint
  );
}

export function buildCompletionHydrationZones(
  savedZone: CachedZone | null,
  pair: CompletionZonePair | null
) {
  return [savedZone, pair?.city, pair?.district].filter(
    (zone, index, zones): zone is CachedZone =>
      Boolean(zone) &&
      zones.findIndex((candidate) => candidate?.id === zone?.id) === index
  );
}

export function shouldRunExpensiveCompletionMaintenance(isRecording: boolean) {
  return !isRecording;
}

type SingleFlightEntry<T> = {
  controller: AbortController;
  consumers: number;
  promise: Promise<T>;
  settled: boolean;
};

const completionFlights = new Map<string, SingleFlightEntry<unknown>>();

export function getZoneCompletionRequestKey(input: {
  explorationRevision: number;
  geometryFingerprint: string;
  mode: ActivityMode;
  zoneId: string;
}) {
  return [
    input.mode,
    input.zoneId,
    input.explorationRevision,
    input.geometryFingerprint
  ].join(":");
}

export function runZoneCompletionSingleFlight<T>(
  key: string,
  signal: AbortSignal | undefined,
  operation: (sharedSignal: AbortSignal) => Promise<T>
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(createCompletionAbortError());
  }

  let entry = completionFlights.get(key) as SingleFlightEntry<T> | undefined;

  if (entry?.controller.signal.aborted) {
    completionFlights.delete(key);
    entry = undefined;
  }

  if (!entry) {
    const controller = new AbortController();
    const nextEntry: SingleFlightEntry<T> = {
      controller,
      consumers: 0,
      promise: Promise.resolve(undefined as T),
      settled: false
    };
    nextEntry.promise = operation(controller.signal).finally(() => {
      nextEntry.settled = true;

      if (completionFlights.get(key) === nextEntry) {
        completionFlights.delete(key);
      }
    });
    completionFlights.set(key, nextEntry as SingleFlightEntry<unknown>);
    entry = nextEntry;
  }

  entry.consumers += 1;

  return new Promise<T>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) {
        return;
      }

      released = true;
      signal?.removeEventListener("abort", handleAbort);
      entry!.consumers = Math.max(0, entry!.consumers - 1);

      if (entry!.consumers === 0 && !entry!.settled) {
        entry!.controller.abort();
      }
    };
    const handleAbort = () => {
      release();
      reject(createCompletionAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    entry!.promise.then(
      (result) => {
        if (!released) {
          release();
          resolve(result);
        }
      },
      (error) => {
        if (!released) {
          release();
          reject(error);
        }
      }
    );
  });
}

function createCompletionAbortError() {
  const error = new Error("Zone completion calculation cancelled.");
  error.name = "AbortError";
  return error;
}
