import { GpsPoint, WalkWithPoints } from "../types/walk";

export type StreetCompletionSummary = {
  matchedStreetCount: number;
  status: "not_configured" | "ready";
  totalStreetCount: number;
};

export function getStreetCompletionSummary(_walks: WalkWithPoints[]): StreetCompletionSummary {
  // Street completion needs real OpenStreetMap street segment geometry and GPS map matching.
  // This foundation keeps the UI/data boundary ready without pretending grid cells are streets.
  return {
    matchedStreetCount: 0,
    status: "not_configured",
    totalStreetCount: 0
  };
}

export function matchGpsPointsToStreetSegments(_points: GpsPoint[]) {
  // TODO: Load OSM street segments for the current city and snap GPS points to nearby segments.
  return [];
}

