import { buildMergedExplorationPolygons, coordinateToExplorationCellKey, explorationCellKeyToCenterCoordinate } from "./explorationArea";
import { LOOP_FILL_CONFIG } from "./loopFill";
import { prepareZoneContainment } from "./zoneContainment";
import type { PlanningContext, PlanPoint } from "./routePlanning";

export function createPlanningExploration(exploredCellIds: readonly string[], forbiddenCellIds: readonly string[]): PlanningContext {
  const explored = new Set(exploredCellIds), forbidden = new Set(forbiddenCellIds);
  // Match the visible explored surface, including already-filled small enclosures.
  const polygons = buildMergedExplorationPolygons(exploredCellIds, {
    maxFilledHoleAreaSquareMeters: LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode.walk
  });
  const contains = polygons.map(p => prepareZoneContainment({ geometry: [p.coordinates], holes: p.holes }));
  const isExplored = (point: PlanPoint) => explored.has(coordinateToExplorationCellKey(point)) || contains.some(test => test(point));
  const cellCache = new Map<string, boolean>();
  return {
    explored: isExplored,
    forbidden: point => forbidden.has(coordinateToExplorationCellKey(point)),
    isNewCell: id => {
      const cached = cellCache.get(id);
      if (cached !== undefined) return cached;
      const fresh = !forbidden.has(id) && !isExplored(explorationCellKeyToCenterCoordinate(id));
      cellCache.set(id, fresh);
      return fresh;
    },
    medals: []
  };
}
