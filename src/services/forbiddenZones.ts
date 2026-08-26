import type { ActivityMode } from "../types/walk";
import {
  EXPLORATION_CELL_SIZE_METERS,
  buildMergedExplorationPolygons,
  coordinateToExplorationCellKey,
  findEnclosedExplorationRegionContainingCell,
  type ExplorationPolygon,
  type MapCoordinate
} from "./explorationArea";
import { classifyEnclosedAreaForLoop } from "./loopFill";

export const FORBIDDEN_ZONE_CONFIG = {
  maxAreaSquareMeters: 2_000_000
} as const;
export const FORBIDDEN_ZONE_COMMENT_MAX_LENGTH = 120;

export type ForbiddenZoneSelectionResult =
  | {
      classification: "not_enclosed";
      targetCellId: string;
    }
  | {
      areaM2: number;
      cellIds: string[];
      classification: "normal_loop_candidate";
      targetCellId: string;
    }
  | {
      areaM2: number;
      classification: "too_large";
      targetCellId: string;
    }
  | {
      areaM2: number;
      cellIds: string[];
      classification: "oversized_enclosed_area";
      polygons: ExplorationPolygon[];
      targetCellId: string;
    };

export function analyzeForbiddenZoneSelection(input: {
  activityMode: ActivityMode;
  boundaryCellIds: readonly string[];
  coordinate: MapCoordinate;
}): ForbiddenZoneSelectionResult {
  const targetCellId = coordinateToExplorationCellKey(input.coordinate);
  const cellAreaM2 =
    EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS;
  const safetyCellLimit = Math.floor(
    FORBIDDEN_ZONE_CONFIG.maxAreaSquareMeters / cellAreaM2
  );
  const region = findEnclosedExplorationRegionContainingCell({
    boundaryCells: input.boundaryCellIds,
    maxCellCount: safetyCellLimit,
    targetCellId
  });

  if (!region || region.cellIds.length === 0) {
    return { classification: "not_enclosed", targetCellId };
  }

  if (region.truncated) {
    return {
      areaM2: region.cellIds.length * cellAreaM2,
      classification: "too_large",
      targetCellId
    };
  }

  const areaM2 = region.cellIds.length * cellAreaM2;
  const loopClassification = classifyEnclosedAreaForLoop(
    input.activityMode,
    region.cellIds.length
  );

  if (loopClassification === "normal_loop_candidate") {
    return {
      areaM2,
      cellIds: region.cellIds,
      classification: "normal_loop_candidate",
      targetCellId
    };
  }

  return {
    areaM2,
    cellIds: region.cellIds,
    classification: "oversized_enclosed_area",
    polygons: buildMergedExplorationPolygons(region.cellIds),
    targetCellId
  };
}

export function formatForbiddenZoneArea(areaM2: number) {
  if (areaM2 >= 1_000_000) {
    return `${(areaM2 / 1_000_000).toFixed(2)} km²`;
  }

  return `${Math.round(areaM2).toLocaleString()} m²`;
}
