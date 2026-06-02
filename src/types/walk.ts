export type ActivityMode = "walk" | "wheel" | "car";

export type GpsPoint = {
  id?: number;
  sessionId?: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number | null;
  pointIndex: number;
};

export type WalkSession = {
  id: number;
  activityMode: ActivityMode;
  displayName: string | null;
  startedAt: string;
  endedAt: string;
  distanceMeters: number;
  durationSeconds: number;
  pointCount?: number;
};

export type WalkWithPoints = WalkSession & {
  points: GpsPoint[];
};

export type ActiveWalk = {
  sessionId: number;
  activityMode: ActivityMode;
  startedAt: string;
  points: GpsPoint[];
  distanceMeters: number;
  currentSpeedMetersPerSecond: number;
  lastRejectedPointReason: string | null;
};

export type LifetimeStats = {
  walkCount: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  approximateExploredAreaSquareMeters: number;
  exploredCellCount: number;
  latestRecordingStartedAt: string | null;
  latestRecordingDistanceMeters: number;
  longestRecordingDistanceMeters: number;
  newCellsThisRecording: number;
};
