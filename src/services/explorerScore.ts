import { AREA_COMPARISONS, type AreaComparison } from "../data/areaComparisons";
import type { AppLanguage } from "../i18n";
import {
  EXPLORATION_CELL_SIZE_METERS,
  collectFillableEnclosedExplorationCellIds
} from "./explorationArea";

export const EXPLORER_POINTS_PER_DISCOVERED_TILE = 1;
export const EXPLORER_ENCLOSURE_BONUS_PER_TILE = 1;
export const EXPLORATION_CELL_AREA_SQUARE_METERS =
  EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS;

export type ExplorerScore = {
  discoveredCellCount: number;
  enclosedCellCount: number;
  points: number;
  surfaceAreaSquareMeters: number;
  walkedCellCount: number;
};

export type AreaComparisonProgress = {
  current: AreaComparison | null;
  currentMultiple: number;
  next: AreaComparison | null;
  nextProgress: number;
};

export function calculateExplorerScore(input: {
  exploredCellIds: readonly string[];
  loopFillCellIds?: readonly string[];
  maxEnclosedAreaSquareMeters: number;
}): ExplorerScore {
  const persistedEnclosedCellIds = new Set(input.loopFillCellIds ?? []);
  const walkedCellIds = new Set(input.exploredCellIds);

  for (const cellId of persistedEnclosedCellIds) {
    walkedCellIds.delete(cellId);
  }

  const contourCellIds = new Set([...walkedCellIds, ...persistedEnclosedCellIds]);
  const derivedEnclosedCellIds = collectFillableEnclosedExplorationCellIds(
    [...contourCellIds],
    input.maxEnclosedAreaSquareMeters
  );
  const enclosedCellIds = new Set([
    ...persistedEnclosedCellIds,
    ...derivedEnclosedCellIds
  ]);
  const discoveredCellIds = new Set([...walkedCellIds, ...enclosedCellIds]);

  return {
    discoveredCellCount: discoveredCellIds.size,
    enclosedCellCount: enclosedCellIds.size,
    points:
      discoveredCellIds.size * EXPLORER_POINTS_PER_DISCOVERED_TILE +
      enclosedCellIds.size * EXPLORER_ENCLOSURE_BONUS_PER_TILE,
    surfaceAreaSquareMeters:
      discoveredCellIds.size * EXPLORATION_CELL_AREA_SQUARE_METERS,
    walkedCellCount: walkedCellIds.size
  };
}

export function getAreaComparisonProgress(
  surfaceAreaSquareMeters: number
): AreaComparisonProgress {
  const area = Math.max(0, surfaceAreaSquareMeters);
  const currentIndex = AREA_COMPARISONS.findLastIndex(
    (comparison) => comparison.areaSquareMeters <= area
  );
  const current = currentIndex >= 0 ? AREA_COMPARISONS[currentIndex] ?? null : null;
  const next = AREA_COMPARISONS[currentIndex + 1] ?? null;

  return {
    current,
    currentMultiple: current ? area / current.areaSquareMeters : 0,
    next,
    nextProgress: next ? Math.min(1, area / next.areaSquareMeters) : 1
  };
}

export function formatExplorerPoints(points: number, language: AppLanguage) {
  return Math.max(0, Math.round(points)).toLocaleString(
    language === "fr" ? "fr-FR" : "en-US"
  );
}

export function formatExploredSurface(areaSquareMeters: number, language: AppLanguage) {
  const locale = language === "fr" ? "fr-FR" : "en-US";

  if (areaSquareMeters < 1_000_000) {
    return `${Math.round(areaSquareMeters).toLocaleString(locale)} m²`;
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    areaSquareMeters / 1_000_000
  )} km²`;
}

export function formatAreaMultiple(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: value >= 10 ? 0 : value >= 2 ? 1 : 2
  }).format(value);
}
