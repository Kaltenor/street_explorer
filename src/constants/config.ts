import packageMetadata from "../../package.json";

import type { ActivityMode } from "../types/walk";

export const APP_VERSION = packageMetadata.version;

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
  },
  wheel: {
    maxAcceptedAccuracyMeters: 40,
    maxSpeedMetersPerSecond: 16,
    minDistanceBetweenPointsMeters: 2
  },
  car: {
    maxAcceptedAccuracyMeters: 60,
    maxSpeedMetersPerSecond: 55,
    minDistanceBetweenPointsMeters: 5
  }
};

export const MAP_CONFIG = {
  defaultLatitude: 48.8566,
  defaultLongitude: 2.3522,
  defaultLatitudeDelta: 0.018,
  defaultLongitudeDelta: 0.018
};
