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
  // TODO: Add background location tracking for long walks with Expo TaskManager
  // once the MVP needs recording to continue while the app is closed.
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
    pointIndex
  };
}
