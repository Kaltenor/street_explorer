import type { CachedZone } from "../database/completionRepository";
import { getNewExploredCellKeysSince } from "../database/completionRepository";
import {
  countFinalizedLoopEvidence,
  ensureDailyDistrictExpeditions,
  getActiveDistrictExpedition,
  getDailyDistrictExpeditions,
  getDistrictExpeditionSeals,
  updateDistrictExpeditionProgress
} from "../database/expeditionRepository";
import { getAllMedalAlbumProgress } from "../database/medalRepository";
import { getStreetCompletionStreetStates } from "../database/streetCompletionRepository";
import { getAllStreetSegments } from "../database/streetRepository";
import type {
  DistrictExpedition,
  DistrictExpeditionDashboard
} from "../types/expedition";
import type { CollectedMedal } from "../types/medal";
import type { OsmStreetSegment } from "../types/street";
import { explorationCellKeyToCenterCoordinate } from "./explorationArea";
import {
  buildDailyExpeditionDefinitions,
  getLocalExpeditionDate
} from "./expeditionDefinitions";
import { isPointInsideZone } from "./zoneCompletion";

export async function loadDistrictExpeditionDashboard(
  district: CachedZone
): Promise<DistrictExpeditionDashboard> {
  if (district.type !== "district" || district.adminLevel !== 9) {
    throw new Error("District expeditions require an official level-9 district.");
  }

  const localDate = getLocalExpeditionDate();
  let choices = await getDailyDistrictExpeditions(district.id, localDate);

  if (choices.length === 0) {
    const opportunities = await getDistrictOpportunities(district);
    await ensureDailyDistrictExpeditions({
      definitions: buildDailyExpeditionDefinitions({
        districtId: district.id,
        hasMedalOpportunity: opportunities.hasMedalOpportunity,
        hasStreetOpportunity: opportunities.hasStreetOpportunity,
        localDate
      }),
      districtId: district.id,
      districtName: district.name,
      localDate
    });
    choices = await getDailyDistrictExpeditions(district.id, localDate);
  }

  let active = await getActiveDistrictExpedition();

  if (active?.districtId === district.id && active.acceptedAt) {
    const progress = await calculateDistrictExpeditionProgress(active, district);
    await updateDistrictExpeditionProgress(active.id, progress);
    active = await getActiveDistrictExpedition();
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
  const [streetStates, streetSegments, medalAlbums] = await Promise.all([
    getStreetCompletionStreetStates(),
    getAllStreetSegments(),
    getAllMedalAlbumProgress()
  ]);
  const stateByStreetId = new Map(
    streetStates.map((state) => [state.streetId, state])
  );
  const hasStreetOpportunity = streetSegments.some((segment) => {
    const state = stateByStreetId.get(getStreetId(segment));
    return state && !state.isComplete && isStreetInsideDistrict(segment, district);
  });
  const hasMedalOpportunity = medalAlbums.some((album) =>
    album.medals.some(
      (medal) => !medal.isCollected && isMedalInsideDistrict(medal, district)
    )
  );

  return { hasMedalOpportunity, hasStreetOpportunity };
}

async function calculateDistrictExpeditionProgress(
  expedition: DistrictExpedition,
  district: CachedZone
) {
  if (!expedition.acceptedAt) {
    return 0;
  }

  switch (expedition.kind) {
    case "explore_cells": {
      const cellKeys = await getNewExploredCellKeysSince("walk", expedition.acceptedAt);
      return cellKeys.filter((cellKey) =>
        isPointInsideZone(explorationCellKeyToCenterCoordinate(cellKey), district)
      ).length;
    }
    case "complete_street": {
      const [states, segments] = await Promise.all([
        getStreetCompletionStreetStates(),
        getAllStreetSegments()
      ]);
      const completedSinceAcceptance = new Set(
        states
          .filter(
            (state) =>
              state.isComplete &&
              state.completedAt !== null &&
              state.completedAt >= expedition.acceptedAt!
          )
          .map((state) => state.streetId)
      );
      const completedInDistrict = new Set(
        segments
          .filter(
            (segment) =>
              completedSinceAcceptance.has(getStreetId(segment)) &&
              isStreetInsideDistrict(segment, district)
          )
          .map(getStreetId)
      );
      return completedInDistrict.size;
    }
    case "collect_medal": {
      const albums = await getAllMedalAlbumProgress();
      return albums
        .flatMap((album) => album.medals)
        .filter(
          (medal) =>
            medal.collectedAt !== null &&
            medal.collectedAt >= expedition.acceptedAt! &&
            isMedalInsideDistrict(medal, district)
        ).length;
    }
    case "close_loop":
      return countFinalizedLoopEvidence(expedition.id);
  }
}

function isStreetInsideDistrict(segment: OsmStreetSegment, district: CachedZone) {
  return segment.coordinates.some((coordinate) =>
    isPointInsideZone(coordinate, district)
  );
}

function isMedalInsideDistrict(medal: CollectedMedal, district: CachedZone) {
  return isPointInsideZone(
    { latitude: medal.latitude, longitude: medal.longitude },
    district
  );
}

function getStreetId(segment: OsmStreetSegment) {
  return /^(way\/[^/]+)/.exec(segment.id)?.[1] ?? segment.id;
}
