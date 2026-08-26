import {
  CachedZone,
  getCachedZones,
  getExplorationRevision,
  getExploredCellRecords,
  getExploredCellRecordsWithinBounds,
  getZoneAchievement,
  getZoneCompletionSnapshot,
  saveCachedZoneTotal,
  saveZoneCompletionSnapshot,
  type ZoneCompletionSnapshot
} from "../database/completionRepository";
import {
  getSavedCompletionObjective,
  getSavedPlayerLocation
} from "../database/settingsRepository";
import {
  calculateZoneCompletionStats,
  getZoneBounds,
  getZoneGeometryFingerprint,
  isPointInsideZone,
  isZoneCompletionEligible,
  type ZoneCompletionStats
} from "./zoneCompletion";
import { doesDistrictGeometryBelongToCity } from "./zoneBoundaryPolicy";
import type { ActivityMode, GpsPoint } from "../types/walk";

const PREFETCH_MODE: ActivityMode = "walk";

export type LaunchCompletionPrefetchResult = {
  calculatedZoneCount: number;
  reusedZoneCount: number;
  zoneCount: number;
};

export async function prefetchLaunchCompletion(): Promise<LaunchCompletionPrefetchResult> {
  const [savedObjective, savedLocation, cities, districts, explorationRevision] =
    await Promise.all([
      getSavedCompletionObjective(),
      getSavedPlayerLocation(),
      getCachedZones("city"),
      getCachedZones("district"),
      getExplorationRevision(PREFETCH_MODE)
    ]);
  const targetZones = collectLaunchZones({
    cities,
    districts,
    savedLocation,
    savedObjectiveZone: savedObjective?.zone ?? null
  });
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

function collectLaunchZones(input: {
  cities: CachedZone[];
  districts: CachedZone[];
  savedLocation: GpsPoint | null;
  savedObjectiveZone: CachedZone | null;
}) {
  const zonesById = new Map<string, CachedZone>();
  const citiesById = new Map(input.cities.map((city) => [city.id, city]));
  const addZone = (zone: CachedZone | null | undefined) => {
    if (zone && isZoneCompletionEligible(zone)) {
      zonesById.set(zone.id, zone);
    }
  };
  const addCityPair = (city: CachedZone | null, district?: CachedZone | null) => {
    addZone(city);
    addZone(district);
  };

  const savedZone = input.savedObjectiveZone;

  if (savedZone) {
    addZone(savedZone);

    if (savedZone.type === "district") {
      const savedCity =
        (savedZone.parentZoneId ? citiesById.get(savedZone.parentZoneId) : null) ??
        input.cities.find((city) => doesDistrictGeometryBelongToCity(savedZone, city)) ??
        null;
      addCityPair(savedCity, savedZone);
    } else if (savedZone.type === "city") {
      addZone(savedZone);
    }
  }

  if (input.savedLocation) {
    const locationCity = findContainingZone(input.savedLocation, input.cities);
    const locationDistrict = locationCity
      ? findContainingZone(
          input.savedLocation,
          input.districts.filter((district) =>
            doesDistrictGeometryBelongToCity(district, locationCity)
          )
        )
      : null;
    addCityPair(locationCity, locationDistrict);
  }

  return [...zonesById.values()];
}

function findContainingZone(
  point: Pick<GpsPoint, "latitude" | "longitude">,
  zones: CachedZone[]
) {
  return zones.find(
    (zone) => isZoneCompletionEligible(zone) && isPointInsideZone(point, zone)
  ) ?? null;
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
    const permanentStats = buildPermanentCompletionStats(snapshot?.stats, achievement);
    const permanentSnapshot: ZoneCompletionSnapshot = {
      calculatedAt: new Date().toISOString(),
      explorationRevision,
      geometryFingerprint,
      mode: PREFETCH_MODE,
      stats: permanentStats,
      zoneId: zone.id
    };

    // A completed administrative area is an earned permanent state. Freeze the
    // denominator at the earned value under the current geometry fingerprint so
    // later unrelated exploration or a boundary refresh cannot visually demote it.
    await saveCachedZoneTotal(
      zone.id,
      achievement.totalZoneCells,
      geometryFingerprint
    );
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
  const totalZoneCells = Math.min(
    exploredCells,
    stats?.totalZoneCells ?? achievement.totalZoneCells
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
    totalZoneCells
  };
}
