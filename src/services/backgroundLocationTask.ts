import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { MODE_LOCATION_CONFIG } from "../constants/config";
import { getActiveRecordingSettings } from "../database/settingsRepository";
import { initDatabase } from "../database/db";
import { persistAcceptedGpsPoint } from "./walkRecorder";
import { GpsPoint } from "../types/walk";

export const BACKGROUND_LOCATION_TASK_NAME = "street-explorer-background-location";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error", error);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] }).locations ?? [];

  if (locations.length === 0) {
    return;
  }

  await initDatabase();
  const activeRecording = await getActiveRecordingSettings();

  if (!activeRecording) {
    return;
  }

  for (const location of locations) {
    await persistAcceptedGpsPoint(
      activeRecording.sessionId,
      activeRecording.activityMode,
      locationToGpsPoint(location)
    );
  }
});

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

export async function startBackgroundLocationTracking(activityMode: "walk" | "wheel" | "car") {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
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
}

export async function stopBackgroundLocationTracking() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);

  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  }
}

export async function isBackgroundLocationTaskAvailable() {
  return TaskManager.isAvailableAsync();
}

function locationToGpsPoint(location: Location.LocationObject): Omit<GpsPoint, "pointIndex"> {
  return {
    accuracy: location.coords.accuracy,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: new Date(location.timestamp).toISOString()
  };
}
