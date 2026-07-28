import packageMetadata from "../../package.json";

import type { ActivityMode } from "../types/walk";

export const APP_VERSION = packageMetadata.version;

export const BACKGROUND_LOCATION_RECOVERY_GRACE_MS =
  5 * 60 * 1000;

export const LOCATION_CONFIG = {
  maxAcceptedAccuracyMeters: 100,
  minDistanceBetweenPointsMeters: 1,
  locationUpdateDistanceMeters: 1,
  locationUpdateIntervalMs: 1000
};

export const MODE_LOCATION_CONFIG: Record<
  ActivityMode,
  {
    maxAcceptedAccuracyMeters: number;
    maxSpeedMetersPerSecond: number;
    minDistanceBetweenPointsMeters: number;
  }
> = {
  walk: {
    maxAcceptedAccuracyMeters: 30,
    maxSpeedMetersPerSecond: 4,
    minDistanceBetweenPointsMeters: 1
  }
};

export const MAP_CONFIG = {
  defaultLatitude: 48.8566,
  defaultLongitude: 2.3522,
  defaultLatitudeDelta: 0.018,
  defaultLongitudeDelta: 0.018
};
