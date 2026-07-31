import { MapCoordinate } from "../services/explorationArea";

export type OsmStreetSegment = {
  access: string | null;
  bridge: boolean;
  coordinates: MapCoordinate[];
  fetchedAt: string;
  foot: string | null;
  highway: string;
  id: string;
  layer: number;
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
  name: string | null;
  tunnel: boolean;
};

export type StreetCompletionSummary = {
  completedStreetCount: number;
  completionPercent: number;
  exploredDistanceMeters: number;
  exploredStreetCount: number;
  legacyMatchedStreetCount: number;
  loadedStreetCount: number;
  processedRecordingCount: number;
  status: "empty" | "pending" | "loading" | "ready" | "error";
  totalDistanceMeters: number;
  updatedAt: string | null;
};

export type StreetSegmentCoverage = {
  coveredBinIndexes: number[];
  segmentId: string;
  streetId: string;
  totalBinCount: number;
  totalDistanceMeters: number;
  walkedDistanceMeters: number;
};

export type StreetCompletionSessionCoverage = StreetSegmentCoverage & {
  sessionId: number;
};

export type StreetCompletionSegmentProgress = {
  completionPercent: number;
  highway: string;
  name: string | null;
  segmentId: string;
  streetId: string;
  totalDistanceMeters: number;
  walkedDistanceMeters: number;
};
