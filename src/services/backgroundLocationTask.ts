import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { MODE_LOCATION_CONFIG } from "../constants/config";
import {
  drainPendingBackgroundLocationBatches,
  persistDeliveredBackgroundLocationBatch
} from "./backgroundLocationOutbox";
import { ActivityMode, GpsPoint } from "../types/walk";

export { drainPendingBackgroundLocationBatches };

export const BACKGROUND_LOCATION_TASK_NAME = "street-explorer-background-location";
const BACKGROUND_HANDLER_QUIET_PERIOD_MS = 100;

let backgroundLocationHandlerGeneration = 0;
let inFlightBackgroundLocationHandlers = 0;
const backgroundLocationHandlerIdleWaiters = new Set<() => void>();

TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error", error);
    return;
  }

  const locations =
    (data as { locations?: Location.LocationObject[] } | undefined)
      ?.locations ?? [];

  if (locations.length === 0) {
    return;
  }

  beginBackgroundLocationHandler();

  try {
    const orderedLocations = [...locations].sort(
      (left, right) => left.timestamp - right.timestamp
    );
    await persistDeliveredBackgroundLocationBatch(
      orderedLocations.map(locationToGpsPoint),
      getBackgroundTrackingSessionId()
    );
  } catch (error) {
    console.warn(
      "Background GPS outbox could not drain; any journaled batch remains queued",
      error
    );
  } finally {
    endBackgroundLocationHandler();
  }
});

function beginBackgroundLocationHandler() {
  inFlightBackgroundLocationHandlers += 1;
  backgroundLocationHandlerGeneration += 1;
}

function endBackgroundLocationHandler() {
  inFlightBackgroundLocationHandlers = Math.max(
    0,
    inFlightBackgroundLocationHandlers - 1
  );
  backgroundLocationHandlerGeneration += 1;

  if (inFlightBackgroundLocationHandlers === 0) {
    for (const resolve of backgroundLocationHandlerIdleWaiters) {
      resolve();
    }

    backgroundLocationHandlerIdleWaiters.clear();
  }
}

export async function waitForBackgroundLocationHandlers() {
  for (;;) {
    if (inFlightBackgroundLocationHandlers > 0) {
      await new Promise<void>((resolve) =>
        backgroundLocationHandlerIdleWaiters.add(resolve)
      );
    }

    const quietGeneration = backgroundLocationHandlerGeneration;
    await wait(BACKGROUND_HANDLER_QUIET_PERIOD_MS);

    if (
      inFlightBackgroundLocationHandlers === 0 &&
      quietGeneration === backgroundLocationHandlerGeneration
    ) {
      return;
    }
  }
}

export type BackgroundPermissionResult = {
  backgroundCanAskAgain: boolean;
  backgroundStatus: Location.PermissionStatus;
  foregroundStatus: Location.PermissionStatus;
  granted: boolean;
};

export async function requestBackgroundLocationPermission(): Promise<BackgroundPermissionResult> {
  const foregroundPermission = await Location.getForegroundPermissionsAsync();
  const currentBackgroundPermission = await Location.getBackgroundPermissionsAsync();

  if (currentBackgroundPermission.status === Location.PermissionStatus.GRANTED) {
    return {
      backgroundCanAskAgain: currentBackgroundPermission.canAskAgain,
      backgroundStatus: currentBackgroundPermission.status,
      foregroundStatus: foregroundPermission.status,
      granted: true
    };
  }

  if (foregroundPermission.status !== Location.PermissionStatus.GRANTED) {
    return {
      backgroundCanAskAgain: currentBackgroundPermission.canAskAgain,
      backgroundStatus: currentBackgroundPermission.status,
      foregroundStatus: foregroundPermission.status,
      granted: false
    };
  }

  const requestedBackgroundPermission = await Location.requestBackgroundPermissionsAsync();

  return {
    backgroundCanAskAgain: requestedBackgroundPermission.canAskAgain,
    backgroundStatus: requestedBackgroundPermission.status,
    foregroundStatus: foregroundPermission.status,
    granted: requestedBackgroundPermission.status === Location.PermissionStatus.GRANTED
  };
}

let activeBackgroundTrackingOwner: string | null = null;
let desiredBackgroundTrackingOwner: string | null = null;
let lastBackgroundTrackingSessionId: number | null = null;
let backgroundTrackingOperation: Promise<void> = Promise.resolve();

export function startBackgroundLocationTracking(
  activityMode: ActivityMode,
  owner: string
): Promise<boolean> {
  desiredBackgroundTrackingOwner = owner;

  return enqueueBackgroundTrackingOperation(async () => {
    if (desiredBackgroundTrackingOwner !== owner) {
      return false;
    }

    await stopNativeBackgroundLocationTracking();
    activeBackgroundTrackingOwner = null;

    if (desiredBackgroundTrackingOwner !== owner) {
      return false;
    }

    const modeConfig = MODE_LOCATION_CONFIG[activityMode];

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.OtherNavigation,
      deferredUpdatesDistance: modeConfig.minDistanceBetweenPointsMeters,
      distanceInterval: modeConfig.minDistanceBetweenPointsMeters,
      foregroundService: {
        killServiceOnDestroy: false,
        notificationBody: "Street Explorer is recording your current exploration.",
        notificationTitle: "Recording exploration"
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      timeInterval: 1000
    });
    activeBackgroundTrackingOwner = owner;
    lastBackgroundTrackingSessionId =
      parseBackgroundTrackingSessionId(owner);

    return desiredBackgroundTrackingOwner === owner;
  });
}

export function stopBackgroundLocationTracking(owner?: string): Promise<void> {
  if (
    owner !== undefined &&
    desiredBackgroundTrackingOwner !== owner &&
    activeBackgroundTrackingOwner !== owner
  ) {
    return Promise.resolve();
  }

  if (owner === undefined || desiredBackgroundTrackingOwner === owner) {
    desiredBackgroundTrackingOwner = null;
  }

  return enqueueBackgroundTrackingOperation(async () => {
    if (
      owner !== undefined &&
      activeBackgroundTrackingOwner !== owner
    ) {
      return;
    }

    await stopNativeBackgroundLocationTracking();
    lastBackgroundTrackingSessionId =
      parseBackgroundTrackingSessionId(activeBackgroundTrackingOwner) ??
      lastBackgroundTrackingSessionId;
    activeBackgroundTrackingOwner = null;
    await waitForBackgroundLocationHandlers();
    await drainPendingBackgroundLocationBatches();
  });
}

export function clearBackgroundLocationSessionHint() {
  activeBackgroundTrackingOwner = null;
  desiredBackgroundTrackingOwner = null;
  lastBackgroundTrackingSessionId = null;
}

function getBackgroundTrackingSessionId() {
  return (
    parseBackgroundTrackingSessionId(activeBackgroundTrackingOwner) ??
    parseBackgroundTrackingSessionId(desiredBackgroundTrackingOwner) ??
    lastBackgroundTrackingSessionId
  );
}

function parseBackgroundTrackingSessionId(owner: string | null) {
  if (!owner) {
    return null;
  }

  const sessionId = Number(owner.split(":")[0]);

  return Number.isInteger(sessionId) && sessionId > 0
    ? sessionId
    : null;
}

function enqueueBackgroundTrackingOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = backgroundTrackingOperation.then(operation, operation);
  backgroundTrackingOperation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function stopNativeBackgroundLocationTracking() {
  const retryDelaysMs = [0, 250, 1000] as const;
  let lastError: unknown = null;

  for (const retryDelayMs of retryDelaysMs) {
    if (retryDelayMs > 0) {
      await wait(retryDelayMs);
    }

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK_NAME
      );

      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK_NAME
        );
      }

      const stillStarted = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK_NAME
      );

      if (!stillStarted) {
        return;
      }

      lastError = new Error("Background location task is still active.");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Background location task could not be stopped.");
}

export type BackgroundLocationRecoveryStatus =
  | "active"
  | "interrupted"
  | "uncertain";

export async function getBackgroundLocationRecoveryStatus():
  Promise<BackgroundLocationRecoveryStatus> {
  try {
    if (!(await TaskManager.isAvailableAsync())) {
      return "uncertain";
    }

    return (await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK_NAME
    ))
      ? "active"
      : "interrupted";
  } catch (error) {
    console.warn("Could not verify background location recovery status", error);
    return "uncertain";
  }
}

export async function isBackgroundLocationTaskAvailable() {
  return TaskManager.isAvailableAsync();
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function locationToGpsPoint(location: Location.LocationObject): Omit<GpsPoint, "pointIndex"> {
  return {
    accuracy: location.coords.accuracy,
    heading:
      typeof location.coords.heading === "number" && location.coords.heading >= 0
        ? location.coords.heading % 360
        : null,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    speedMetersPerSecond:
      typeof location.coords.speed === "number" && location.coords.speed >= 0
        ? location.coords.speed
        : null,
    timestamp: new Date(location.timestamp).toISOString()
  };
}
