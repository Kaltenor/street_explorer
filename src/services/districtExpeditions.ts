import type { CachedZone } from "../database/completionRepository";
import {
  getExploredCellKeys,
  getNewExploredCellKeysSince
} from "../database/completionRepository";
import {
  countFinalizedLoopEvidence,
  ensureDailyDistrictExpeditions,
  getActiveDistrictExpeditions,
  getDailyDistrictExpeditions,
  getDistrictExpeditionSeals,
  updateDistrictExpeditionProgress
} from "../database/expeditionRepository";
import {
  getCollectedMedalsSinceInBounds,
  getUncollectedMedalsInBounds
} from "../database/medalRepository";
import { getMedalAlbumIdForZone } from "../data/medalAlbums";
import { getStreetCompletionStreetStates } from "../database/streetCompletionRepository";
import { getStreetSegmentsWithinBounds } from "../database/streetRepository";
import type {
  DistrictExpedition,
  DistrictExpeditionDashboard
} from "../types/expedition";
import type { OsmStreetSegment } from "../types/street";
import {
  buildDailyExpeditionDefinitions,
  DAILY_DISTRICT_EXPEDITION_COUNT,
  getLocalExpeditionDate
} from "./expeditionDefinitions";
import {
  calculateCellExpeditionProgress,
  countFrontierCells,
  countNewCellsInsideDistrict
} from "./expeditionProgress";
import { isPointInsideZone } from "./zoneCompletion";

export async function loadDistrictExpeditionDashboard(
  district: CachedZone
): Promise<DistrictExpeditionDashboard> {
  if (district.type !== "district" || district.adminLevel !== 9) {
    throw new Error("District expeditions require an official level-9 district.");
  }

  const localDate = getLocalExpeditionDate();
  let choices = await getDailyDistrictExpeditions(district.id, localDate);

  if (choices.length < DAILY_DISTRICT_EXPEDITION_COUNT) {
    const opportunities = await getDistrictOpportunities(district);
    const occupiedSlots = new Set(choices.map((choice) => choice.slot));
    const missingSlots = Array.from(
      { length: DAILY_DISTRICT_EXPEDITION_COUNT },
      (_, index) => index
    ).filter((slot) => !occupiedSlots.has(slot));
    await ensureDailyDistrictExpeditions({
      definitions: buildDailyExpeditionDefinitions({
        districtId: district.id,
        excludedKinds: choices.map((choice) => choice.kind),
        localDate,
        medalOpportunityCount: opportunities.medalOpportunityCount,
        slots: missingSlots,
        streetOpportunityCount: opportunities.streetOpportunityCount
      }),
      districtId: district.id,
      districtName: district.name,
      localDate
    });
    choices = await getDailyDistrictExpeditions(district.id, localDate);
  }

  let active = await getActiveDistrictExpeditions();
  const activeInDistrict = active.filter(
    (expedition) => expedition.districtId === district.id && expedition.acceptedAt
  );

  if (activeInDistrict.length > 0) {
    await Promise.all(
      activeInDistrict.map(async (expedition) => {
        const progress = await calculateDistrictExpeditionProgress(expedition, district);
        await updateDistrictExpeditionProgress(expedition.id, progress);
      })
    );
    active = await getActiveDistrictExpeditions();
    choices = await getDailyDistrictExpeditions(district.id, localDate);
  }

  return {
    active,
    choices,
    localDate,
    seals: await getDistrictExpeditionSeals()
  };
}

async function getDistrictOpportunities(district: CachedZone) {
  const albumId = getMedalAlbumIdForZone(district);
  const bounds = getZoneBounds(district);
  const [streetStates, streetSegments, medalCandidates] = await Promise.all([
    getStreetCompletionStreetStates(),
    bounds ? getStreetSegmentsWithinBounds(bounds) : Promise.resolve([]),
    albumId && bounds
      ? getUncollectedMedalsInBounds(albumId, bounds)
      : Promise.resolve([])
  ]);
  const stateByStreetId = new Map(
    streetStates.map((state) => [state.streetId, state])
  );
  const streetOpportunityCount = new Set(
    streetSegments
      .filter((segment) => {
        const state = stateByStreetId.get(getStreetId(segment));
        return state && !state.isComplete && isStreetInsideDistrict(segment, district);
      })
      .map(getStreetId)
  ).size;
  const medalOpportunityCount = medalCandidates.filter((medal) =>
    isMedalInsideDistrict(medal, district)
  ).length;

  return { medalOpportunityCount, streetOpportunityCount };
}

async function calculateDistrictExpeditionProgress(
  expedition: DistrictExpedition,
  district: CachedZone
) {
  if (!expedition.acceptedAt) {
    return 0;
  }

  switch (expedition.kind) {
    case "explore_cells":
    case "frontier_push":
    case "seal_breach":
    case "dense_survey":
    case "sector_sweep":
    case "northward_scout":
    case "southward_scout":
    case "eastward_scout":
    case "westward_scout":
    case "boundary_scout":
    case "district_heart":
    case "outer_reach": {
      const evidence = await getCellEvidence(expedition.acceptedAt);
      return calculateCellExpeditionProgress({
        ...evidence,
        district,
        kind: expedition.kind
      });
    }
    case "complete_street":
    case "complete_street_pair":
      return getCompletedStreetCount(expedition.acceptedAt, district);
    case "collect_medal":
    case "collect_medal_pair":
      return getCollectedMedalCount(expedition.acceptedAt, district);
    case "close_loop":
    case "double_loop":
      return countFinalizedLoopEvidence(expedition.id);
    case "street_and_cells": {
      const [cellEvidence, streetCount] = await Promise.all([
        getCellEvidence(expedition.acceptedAt),
        getCompletedStreetCount(expedition.acceptedAt, district)
      ]);
      const cellCount = countNewCellsInsideDistrict(cellEvidence.newCellKeys, district);
      return Number(cellCount >= 12) + Number(streetCount >= 1);
    }
    case "loop_and_cells": {
      const [cellEvidence, loopCount] = await Promise.all([
        getCellEvidence(expedition.acceptedAt),
        countFinalizedLoopEvidence(expedition.id)
      ]);
      const cellCount = countNewCellsInsideDistrict(cellEvidence.newCellKeys, district);
      return Number(cellCount >= 12) + Number(loopCount >= 1);
    }
    case "loop_and_frontier": {
      const [cellEvidence, loopCount] = await Promise.all([
        getCellEvidence(expedition.acceptedAt),
        countFinalizedLoopEvidence(expedition.id)
      ]);
      const frontierCount = countFrontierCells({ ...cellEvidence, district });
      return Number(frontierCount >= 8) + Number(loopCount >= 1);
    }
    case "street_and_loop": {
      const [streetCount, loopCount] = await Promise.all([
        getCompletedStreetCount(expedition.acceptedAt, district),
        countFinalizedLoopEvidence(expedition.id)
      ]);
      return Number(streetCount >= 1) + Number(loopCount >= 1);
    }
    case "medal_and_cells": {
      const [cellEvidence, medalCount] = await Promise.all([
        getCellEvidence(expedition.acceptedAt),
        getCollectedMedalCount(expedition.acceptedAt, district)
      ]);
      const cellCount = countNewCellsInsideDistrict(cellEvidence.newCellKeys, district);
      return Number(cellCount >= 12) + Number(medalCount >= 1);
    }
    case "field_triad": {
      const [cellEvidence, streetCount, loopCount] = await Promise.all([
        getCellEvidence(expedition.acceptedAt),
        getCompletedStreetCount(expedition.acceptedAt, district),
        countFinalizedLoopEvidence(expedition.id)
      ]);
      const cellCount = countNewCellsInsideDistrict(cellEvidence.newCellKeys, district);
      return Number(cellCount >= 15) + Number(streetCount >= 1) + Number(loopCount >= 1);
    }
    case "grand_tour": {
      const [cellEvidence, streetCount, loopCount, medalCount] = await Promise.all([
        getCellEvidence(expedition.acceptedAt),
        getCompletedStreetCount(expedition.acceptedAt, district),
        countFinalizedLoopEvidence(expedition.id),
        getCollectedMedalCount(expedition.acceptedAt, district)
      ]);
      const cellCount = countNewCellsInsideDistrict(cellEvidence.newCellKeys, district);
      return Number(cellCount >= 20) +
        Number(streetCount >= 1) +
        Number(loopCount >= 1) +
        Number(medalCount >= 1);
    }
  }
}

async function getCellEvidence(acceptedAt: string) {
  const [allCellKeys, newCellKeys] = await Promise.all([
    getExploredCellKeys("walk"),
    getNewExploredCellKeysSince("walk", acceptedAt)
  ]);
  return { allCellKeys, newCellKeys };
}

async function getCompletedStreetCount(acceptedAt: string, district: CachedZone) {
  const bounds = getZoneBounds(district);
  const [states, segments] = await Promise.all([
    getStreetCompletionStreetStates(),
    bounds ? getStreetSegmentsWithinBounds(bounds) : Promise.resolve([])
  ]);
  const completedSinceAcceptance = new Set(
    states
      .filter(
        (state) =>
          state.isComplete &&
          state.completedAt !== null &&
          state.completedAt >= acceptedAt
      )
      .map((state) => state.streetId)
  );
  return new Set(
    segments
      .filter(
        (segment) =>
          completedSinceAcceptance.has(getStreetId(segment)) &&
          isStreetInsideDistrict(segment, district)
      )
      .map(getStreetId)
  ).size;
}

async function getCollectedMedalCount(acceptedAt: string, district: CachedZone) {
  const albumId = getMedalAlbumIdForZone(district);
  const bounds = getZoneBounds(district);

  if (!albumId || !bounds) {
    return 0;
  }

  const medals = await getCollectedMedalsSinceInBounds(albumId, acceptedAt, bounds);
  return medals.filter((medal) => isMedalInsideDistrict(medal, district)).length;
}

function isStreetInsideDistrict(segment: OsmStreetSegment, district: CachedZone) {
  return segment.coordinates.some((coordinate) =>
    isPointInsideZone(coordinate, district)
  );
}

function isMedalInsideDistrict(
  medal: { latitude: number; longitude: number },
  district: CachedZone
) {
  return isPointInsideZone(
    { latitude: medal.latitude, longitude: medal.longitude },
    district
  );
}

function getZoneBounds(district: CachedZone) {
  const points = district.geometry.flat();

  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, point) => ({
      maxLatitude: Math.max(bounds.maxLatitude, point.latitude),
      maxLongitude: Math.max(bounds.maxLongitude, point.longitude),
      minLatitude: Math.min(bounds.minLatitude, point.latitude),
      minLongitude: Math.min(bounds.minLongitude, point.longitude)
    }),
    {
      maxLatitude: Number.NEGATIVE_INFINITY,
      maxLongitude: Number.NEGATIVE_INFINITY,
      minLatitude: Number.POSITIVE_INFINITY,
      minLongitude: Number.POSITIVE_INFINITY
    }
  );
}

function getStreetId(segment: OsmStreetSegment) {
  return /^(way\/[^/]+)/.exec(segment.id)?.[1] ?? segment.id;
}
