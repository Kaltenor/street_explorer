import * as Location from "expo-location";

import { LOCATION_CONFIG } from "../constants/config";
import { GpsPoint } from "../types/walk";

export type LocationPermissionState = "granted" | "denied" | "unknown";

export type CurrentGpsPointOptions = {
  accuracy?: Location.Accuracy;
  allowLastKnown?: boolean;
  currentTimeoutMs?: number;
  lastKnownMaxAgeMs?: number;
  lastKnownRequiredAccuracyMeters?: number;
  lastKnownTimeoutMs?: number;
  logErrors?: boolean;
};

export type WatchGpsPointsOptions = {
  accuracy?: Location.Accuracy;
  distanceInterval?: number;
  onError?: (reason: string) => void;
  timeInterval?: number;
};

export async function getForegroundLocationPermission(): Promise<LocationPermissionState> {
  const permission = await Location.getForegroundPermissionsAsync();

  return permission.status === Location.PermissionStatus.GRANTED
    ? "granted"
    : "denied";
}

export async function requestForegroundLocationPermission(): Promise<LocationPermissionState> {
  const permission = await Location.requestForegroundPermissionsAsync();

  return permission.status === Location.PermissionStatus.GRANTED
    ? "granted"
    : "denied";
}

export async function getCurrentGpsPoint(
  options: CurrentGpsPointOptions = {}
): Promise<GpsPoint | null> {
  const {
    accuracy = Location.Accuracy.BestForNavigation,
    allowLastKnown = true,
    currentTimeoutMs = 6000,
    lastKnownMaxAgeMs = 5 * 60 * 1000,
    lastKnownRequiredAccuracyMeters = 1000,
    lastKnownTimeoutMs = 1500,
    logErrors = true
  } = options;

  try {
    const location = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy
      }),
      currentTimeoutMs
    );

    return locationToGpsPoint(location, 0);
  } catch (error) {
    if (logErrors) {
      console.warn("GPS position unavailable", error);
    }

    if (!allowLastKnown) {
      return null;
    }

    try {
      const lastKnownLocation = await withTimeout(
        Location.getLastKnownPositionAsync({
          maxAge: lastKnownMaxAgeMs,
          requiredAccuracy: lastKnownRequiredAccuracyMeters
        }),
        lastKnownTimeoutMs
      );

      return lastKnownLocation ? locationToGpsPoint(lastKnownLocation, 0) : null;
    } catch (fallbackError) {
      if (logErrors) {
        console.warn("Last known GPS position unavailable", fallbackError);
      }

      return null;
    }
  }
}

export async function watchGpsPoints(
  onPoint: (point: GpsPoint) => void,
  options: WatchGpsPointsOptions = {}
) {
  return Location.watchPositionAsync(
    {
      accuracy: options.accuracy ?? Location.Accuracy.BestForNavigation,
      distanceInterval:
        options.distanceInterval ?? LOCATION_CONFIG.locationUpdateDistanceMeters,
      timeInterval: options.timeInterval ?? LOCATION_CONFIG.locationUpdateIntervalMs
    },
    (location) => {
      onPoint(locationToGpsPoint(location, 0));
    },
    options.onError
  );
}

function locationToGpsPoint(location: Location.LocationObject, pointIndex: number): GpsPoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: new Date(location.timestamp).toISOString(),
    accuracy: location.coords.accuracy,
    heading: normalizeHeading(location.coords.heading),
    pointIndex,
    speedMetersPerSecond:
      typeof location.coords.speed === "number" && location.coords.speed >= 0
        ? location.coords.speed
        : null
  };
}

function normalizeHeading(heading: number | null) {
  if (typeof heading !== "number" || !Number.isFinite(heading) || heading < 0) {
    return null;
  }

  return ((heading % 360) + 360) % 360;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const boundedTimeoutMs = Math.max(1, timeoutMs);

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("GPS request timed out")),
          boundedTimeoutMs
        );
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
