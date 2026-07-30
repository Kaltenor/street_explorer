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
  exploredDistanceMeters: number;
  exploredStreetCount: number;
  loadedStreetCount: number;
  status: "empty" | "loading" | "ready" | "error";
  totalDistanceMeters: number;
};
