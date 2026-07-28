import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";

import { LOCATION_CONFIG } from "../constants/config";
import {
  CurrentGpsPointOptions,
  getCurrentGpsPoint,
  watchGpsPoints
} from "../services/locationService";
import { GpsPoint } from "../types/walk";

const IDLE_DISTANCE_INTERVAL_METERS = 10;
const IDLE_TIME_INTERVAL_MS = 5000;
const INITIAL_LOCATION_TIMEOUT_MS = 6000;
const LAST_KNOWN_TIMEOUT_MS = 1500;
const RECORDING_STALE_AFTER_MS = 60_000;
const RECORDING_WATCHDOG_INTERVAL_MS = 20_000;
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000] as const;
const FRESH_POINT_MAX_AGE_MS = 30_000;

type ReliableForegroundLocationOptions = {
  enabled: boolean;
  isRecording: boolean;
  onPoint: (point: GpsPoint) => void;
};

export type RefreshCurrentLocationOptions = {
  allowLastKnown?: boolean;
};

export function useReliableForegroundLocation({
  enabled,
  isRecording,
  onPoint
}: ReliableForegroundLocationOptions) {
  const [locationResolution, setLocationResolution] = useState({
    enabled,
    resolved: !enabled
  });
  const [watchRevision, setWatchRevision] = useState(0);
  const enabledRef = useRef(enabled);
  const isRecordingRef = useRef(isRecording);
  const onPointRef = useRef(onPoint);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchGenerationRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const watchConfigurationRef = useRef<string | null>(null);
  const lastFixReceivedAtRef = useRef(0);
  const lastPublishedTimestampRef = useRef(Number.NEGATIVE_INFINITY);
  const watchdogProbeInFlightRef = useRef(false);

  enabledRef.current = enabled;
  isRecordingRef.current = isRecording;
  onPointRef.current = onPoint;

  const publishPoint = useCallback((point: GpsPoint, fresh: boolean) => {
    if (!enabledRef.current) {
      return false;
    }

    const timestamp = new Date(point.timestamp).getTime();

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= lastPublishedTimestampRef.current
    ) {
      return false;
    }

    lastPublishedTimestampRef.current = timestamp;

    if (fresh) {
      lastFixReceivedAtRef.current = Date.now();
    }

    onPointRef.current(point);
    setLocationResolution({ enabled: true, resolved: true });
    return true;
  }, []);

  const invalidateWatch = useCallback(() => {
    watchGenerationRef.current += 1;
    removeSubscription(subscriptionRef.current);
    subscriptionRef.current = null;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    watchdogProbeInFlightRef.current = false;
  }, []);

  const refreshCurrentLocation = useCallback(
    async (
      options: RefreshCurrentLocationOptions = {}
    ): Promise<GpsPoint | null> => {
      if (!enabledRef.current) {
        return null;
      }

      const lifecycleGeneration = lifecycleGenerationRef.current;
      const allowLastKnown = options.allowLastKnown ?? true;
      const requestOptions: CurrentGpsPointOptions = {
        accuracy: isRecordingRef.current
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.High,
        allowLastKnown,
        currentTimeoutMs: INITIAL_LOCATION_TIMEOUT_MS,
        lastKnownTimeoutMs: LAST_KNOWN_TIMEOUT_MS,
        logErrors: false
      };
      const point = await getCurrentGpsPoint(requestOptions);

      if (
        !enabledRef.current ||
        lifecycleGeneration !== lifecycleGenerationRef.current
      ) {
        return null;
      }

      if (point) {
        publishPoint(point, !allowLastKnown || isFreshPoint(point));
      }

      setLocationResolution({ enabled: true, resolved: true });
      return point;
    },
    [publishPoint]
  );

  useEffect(() => {
    lifecycleGenerationRef.current += 1;

    if (!enabled) {
      setLocationResolution({ enabled: false, resolved: true });
      return;
    }

    setLocationResolution({ enabled: true, resolved: false });
    refreshCurrentLocation({ allowLastKnown: true }).catch((error) => {
      console.warn("Initial foreground location lookup failed", error);
      setLocationResolution({ enabled: true, resolved: true });
    });
  }, [enabled, refreshCurrentLocation]);

  useEffect(() => {
    const configurationKey = `${enabled ? "enabled" : "disabled"}:${
      isRecording ? "recording" : "idle"
    }`;

    if (watchConfigurationRef.current !== configurationKey) {
      watchConfigurationRef.current = configurationKey;
      retryAttemptRef.current = 0;
    }

    invalidateWatch();

    if (!enabled) {
      return;
    }

    const generation = watchGenerationRef.current;
    const watchStartedAt = Date.now();
    let localSubscription: Location.LocationSubscription | null = null;
    let failed = false;

    const failWatch = (reason: unknown) => {
      if (
        failed ||
        generation !== watchGenerationRef.current ||
        !enabledRef.current
      ) {
        return;
      }

      failed = true;
      removeSubscription(localSubscription);

      if (subscriptionRef.current === localSubscription) {
        subscriptionRef.current = null;
      }

      watchGenerationRef.current += 1;

      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }

      const attempt = retryAttemptRef.current;
      const delay =
        RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ??
        RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

      retryAttemptRef.current = attempt + 1;
      console.warn("Foreground location watch unavailable; retrying", reason);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;

        if (enabledRef.current) {
          setWatchRevision((revision) => revision + 1);
        }
      }, delay);
    };

    watchGpsPoints(
      (point) => {
        if (
          failed ||
          generation !== watchGenerationRef.current ||
          !enabledRef.current
        ) {
          return;
        }

        retryAttemptRef.current = 0;
        publishPoint(point, true);
      },
      {
        accuracy: isRecording
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.High,
        distanceInterval: isRecording
          ? LOCATION_CONFIG.locationUpdateDistanceMeters
          : IDLE_DISTANCE_INTERVAL_METERS,
        onError: failWatch,
        timeInterval: isRecording
          ? LOCATION_CONFIG.locationUpdateIntervalMs
          : IDLE_TIME_INTERVAL_MS
      }
    )
      .then((subscription) => {
        if (
          failed ||
          generation !== watchGenerationRef.current ||
          !enabledRef.current
        ) {
          removeSubscription(subscription);
          return;
        }

        localSubscription = subscription;
        subscriptionRef.current = subscription;
      })
      .catch(failWatch);

    if (isRecording) {
      watchdogTimerRef.current = setInterval(() => {
        if (
          failed ||
          generation !== watchGenerationRef.current ||
          watchdogProbeInFlightRef.current
        ) {
          return;
        }

        const lastFixAt = lastFixReceivedAtRef.current || watchStartedAt;

        if (Date.now() - lastFixAt < RECORDING_STALE_AFTER_MS) {
          return;
        }

        watchdogProbeInFlightRef.current = true;
        const fixReceivedBeforeProbe = lastFixReceivedAtRef.current;

        getCurrentGpsPoint({
          accuracy: Location.Accuracy.BestForNavigation,
          allowLastKnown: false,
          currentTimeoutMs: INITIAL_LOCATION_TIMEOUT_MS,
          logErrors: false
        })
          .then((point) => {
            if (
              failed ||
              generation !== watchGenerationRef.current ||
              !enabledRef.current
            ) {
              return;
            }

            if (point) {
              retryAttemptRef.current = 0;
              publishPoint(point, true);
              invalidateWatch();
              setWatchRevision((revision) => revision + 1);
              return;
            }

            if (lastFixReceivedAtRef.current <= fixReceivedBeforeProbe) {
              failWatch("recording watchdog could not obtain a fresh GPS fix");
            }
          })
          .catch(failWatch)
          .finally(() => {
            if (generation === watchGenerationRef.current) {
              watchdogProbeInFlightRef.current = false;
            }
          });
      }, RECORDING_WATCHDOG_INTERVAL_MS);
    }

    return () => {
      failed = true;

      if (generation === watchGenerationRef.current) {
        invalidateWatch();
      } else {
        removeSubscription(localSubscription);
      }
    };
  }, [
    enabled,
    invalidateWatch,
    isRecording,
    publishPoint,
    watchRevision
  ]);

  useEffect(
    () => () => {
      enabledRef.current = false;
      lifecycleGenerationRef.current += 1;
      invalidateWatch();
    },
    [invalidateWatch]
  );

  const initialLocationResolved =
    !enabled ||
    (locationResolution.enabled && locationResolution.resolved);

  return {
    initialLocationResolved,
    refreshCurrentLocation
  };
}

function isFreshPoint(point: GpsPoint) {
  const timestamp = new Date(point.timestamp).getTime();

  return (
    Number.isFinite(timestamp) &&
    Math.abs(Date.now() - timestamp) <= FRESH_POINT_MAX_AGE_MS
  );
}

function removeSubscription(subscription: Location.LocationSubscription | null) {
  try {
    subscription?.remove();
  } catch (error) {
    console.warn("Failed to remove foreground location subscription", error);
  }
}

