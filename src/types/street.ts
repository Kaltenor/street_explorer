import { MapCoordinate } from "../services/explorationArea";

export type OsmStreetSegment = {
  id: string;
  name: string | null;
  highway: string;
  coordinates: MapCoordinate[];
  fetchedAt: string;
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};

export type StreetCompletionSummary = {
  exploredDistanceMeters: number;
  exploredStreetCount: number;
  loadedStreetCount: number;
  status: "empty" | "loading" | "ready" | "error";
  totalDistanceMeters: number;
};
