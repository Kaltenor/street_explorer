import {
  CachedZone,
  getCachedZones,
  getExplorationRevision,
  getExploredCellRecords,
  getExploredCellRecordsWithinBounds,
  getZoneAchievement,
  getZoneCompletionSnapshot,
  saveZoneCompletionSnapshot,
  type ZoneCompletionSnapshot
} from "../database/completionRepository";
import { getSavedCompletionObjective } from "../database/settingsRepository";
import {
  calculateZoneCompletionStats,
  getZoneBounds,
  getZoneGeometryFingerprint,
  isZoneCompletionEligible,
  type ZoneCompletionStats
} from "./zoneCompletion";
import { doesDistrictGeometryBelongToCity } from "./zoneBoundaryPolicy";
import type { ActivityMode } from "../types/walk";

const PREFETCH_MODE: ActivityMode = "walk";

export type LaunchCompletionPrefetchResult = {
  calculatedZoneCount: number;
  reusedZoneCount: number;
  zoneCount: number;
};

export async function prefetchLaunchCompletion(): Promise<LaunchCompletionPrefetchResult> {
  // MapScreen reports launch-ready only after it has resolved the foreground GPS
  // objective and awaited its save chain, so this is the final district/city the
  // first interactive map frame will use.
  const [savedObjective, cities, explorationRevision] = await Promise.all([
    getSavedCompletionObjective(),
    getCachedZones("city"),
    getExplorationRevision(PREFETCH_MODE)
  ]);
  const targetZones = collectLaunchZones(savedObjective?.zone ?? null, cities);
  let calculatedZoneCount = 0;
  let reusedZoneCount = 0;

  for (const zone of targetZones) {
    const result = await prefetchZoneCompletion(zone, explorationRevision);

    if (result === "calculated") {
      calculatedZoneCount += 1;
    } else {
      reusedZoneCount += 1;
    }
  }

  return {
    calculatedZoneCount,
    reusedZoneCount,
    zoneCount: targetZones.length
  };
}

function collectLaunchZones(
  savedObjectiveZone: CachedZone | null,
  cities: CachedZone[]
) {
  if (!savedObjectiveZone || !isZoneCompletionEligible(savedObjectiveZone)) {
    return [];
  }

  const zonesById = new Map<string, CachedZone>([
    [savedObjectiveZone.id, savedObjectiveZone]
  ]);

  if (savedObjectiveZone.type === "district") {
    const parentCity =
      (savedObjectiveZone.parentZoneId
        ? cities.find((city) => city.id === savedObjectiveZone.parentZoneId)
        : null) ??
      cities.find((city) =>
        isZoneCompletionEligible(city) &&
        doesDistrictGeometryBelongToCity(savedObjectiveZone, city)
      ) ??
      null;

    if (parentCity && isZoneCompletionEligible(parentCity)) {
      zonesById.set(parentCity.id, parentCity);
    }
  }

  return [...zonesById.values()];
}

async function prefetchZoneCompletion(
  zone: CachedZone,
  explorationRevision: number
): Promise<"calculated" | "reused"> {
  const geometryFingerprint = getZoneGeometryFingerprint(zone);
  const [snapshot, achievement] = await Promise.all([
    getZoneCompletionSnapshot(zone.id, PREFETCH_MODE),
    getZoneAchievement(zone.id)
  ]);

  if (achievement) {
    const permanentSnapshot: ZoneCompletionSnapshot = {
      calculatedAt: new Date().toISOString(),
      explorationRevision,
      geometryFingerprint,
      mode: PREFETCH_MODE,
      stats: buildPermanentCompletionStats(snapshot?.stats, achievement),
      zoneId: zone.id
    };

    // Completion achievements are immutable game progress. Refresh only the
    // derived snapshot here. Do not rewrite zone_cell_totals because that table
    // stores the raw geometry denominator before Forbidden Zone deductions.
    await saveZoneCompletionSnapshot(permanentSnapshot);
    return "reused";
  }

  if (
    snapshot &&
    snapshot.explorationRevision === explorationRevision &&
    snapshot.geometryFingerprint === geometryFingerprint
  ) {
    return "reused";
  }

  const bounds = getZoneBounds(zone);
  const cells = bounds
    ? await getExploredCellRecordsWithinBounds(PREFETCH_MODE, bounds)
    : await getExploredCellRecords(PREFETCH_MODE);
  const stats = await calculateZoneCompletionStats(zone, cells);
  const refreshedAchievement = stats.permanentlyCompleted
    ? await getZoneAchievement(zone.id)
    : null;
  const stableStats = refreshedAchievement
    ? buildPermanentCompletionStats(stats, refreshedAchievement)
    : stats;

  await saveZoneCompletionSnapshot({
    calculatedAt: new Date().toISOString(),
    explorationRevision,
    geometryFingerprint,
    mode: PREFETCH_MODE,
    stats: stableStats,
    zoneId: zone.id
  });
  return "calculated";
}

function buildPermanentCompletionStats(
  stats: ZoneCompletionStats | null | undefined,
  achievement: {
    completedAt: string;
    exploredCells: number;
    totalZoneCells: number;
  }
): ZoneCompletionStats {
  const exploredCells = Math.max(
    stats?.exploredCells ?? 0,
    achievement.exploredCells
  );

  return {
    completedAt: achievement.completedAt,
    completionPercent: 100,
    completionStatus: "available",
    directlyWalkedCells: stats?.directlyWalkedCells ?? 0,
    exploredCells,
    forbiddenCells: stats?.forbiddenCells ?? 0,
    inferredCells: stats?.inferredCells ?? 0,
    loopFilledCells: stats?.loopFilledCells ?? 0,
    permanentlyCompleted: true,
    totalZoneCells: achievement.totalZoneCells
  };
}
