import * as Location from "expo-location";

import { LOCATION_CONFIG } from "../constants/config";
import { GpsPoint } from "../types/walk";

export type LocationPermissionState = "granted" | "denied" | "unknown";

export async function requestForegroundLocationPermission(): Promise<LocationPermissionState> {
  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    return "denied";
  }

  return "granted";
}

export async function getCurrentGpsPoint(): Promise<GpsPoint | null> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation
    });

    return locationToGpsPoint(location, 0);
  } catch (error) {
    console.warn("GPS position unavailable", error);
    return null;
  }
}

export async function watchGpsPoints(onPoint: (point: GpsPoint) => void) {
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: LOCATION_CONFIG.locationUpdateDistanceMeters,
      timeInterval: LOCATION_CONFIG.locationUpdateIntervalMs
    },
    (location) => {
      onPoint(locationToGpsPoint(location, 0));
    }
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
