export type ActivityMode = "walk";

export type GpsPoint = {
  id?: number;
  sessionId?: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number | null;
  heading?: number | null;
  pointIndex: number;
  speedMetersPerSecond?: number | null;
};

export type RouteBridgeEvidence = {
  acceptanceReason: "exact_topology" | "geometric_crossing" | "near_endpoint_join";
  endSnapDistanceMeters: number;
  endpointJoinCount: number;
  gapDistanceMeters: number;
  gapDurationSeconds: number;
  inferredCellCount: number;
  intersectionJoinCount: number;
  maxEndpointJoinDistanceMeters: number;
  routeDistanceMeters: number;
  schemaVersion: 1;
  sourceStreetSegmentCount: number;
  startSnapDistanceMeters: number;
  straightDistanceMeters: number;
};

export type RenderedRouteSegment = {
  bridgeEvidence?: RouteBridgeEvidence;
  confidence?: "medium" | "high";
  points: GpsPoint[];
  type: "confirmed" | "inferred";
};

export type LiveRouteChunk = {
  id: string;
  isFrozen: boolean;
  points: GpsPoint[];
  rawPointCount: number;
  type: "confirmed";
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
  stepCount: number;
};

export type WalkWithPoints = WalkSession & {
  points: GpsPoint[];
  routeSegments: RenderedRouteSegment[] | null;
};

export type ActiveWalk = {
  sessionId: number;
  activityMode: ActivityMode;
  startedAt: string;
  acceptedGpsPointCount: number;
  rejectedGpsPointCount: number;
  gpsPausedEventCount: number;
  points: GpsPoint[];
  distanceMeters: number;
  currentSpeedMetersPerSecond: number;
  exploredCellIds: string[];
  lastRejectedPointReason: string | null;
  routeChunks: LiveRouteChunk[];
  stepCount: number;
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
  todayDistanceMeters: number;
  todayRecordingCount: number;
  todayStepCount: number;
};
