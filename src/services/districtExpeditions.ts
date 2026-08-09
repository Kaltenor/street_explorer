import type { CachedZone } from "../database/completionRepository";
import { getNewExploredCellKeysSince } from "../database/completionRepository";
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
import { getAllStreetSegments } from "../database/streetRepository";
import type {
  DistrictExpedition,
  DistrictExpeditionDashboard
} from "../types/expedition";
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
    getAllStreetSegments(),
    albumId && bounds
      ? getUncollectedMedalsInBounds(albumId, bounds)
      : Promise.resolve([])
  ]);
  const stateByStreetId = new Map(
    streetStates.map((state) => [state.streetId, state])
  );
  const hasStreetOpportunity = streetSegments.some((segment) => {
    const state = stateByStreetId.get(getStreetId(segment));
    return state && !state.isComplete && isStreetInsideDistrict(segment, district);
  });
  const hasMedalOpportunity = medalCandidates.some((medal) =>
    isMedalInsideDistrict(medal, district)
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
      const albumId = getMedalAlbumIdForZone(district);
      const bounds = getZoneBounds(district);

      if (!albumId || !bounds) {
        return 0;
      }

      const medals = await getCollectedMedalsSinceInBounds(
        albumId,
        expedition.acceptedAt,
        bounds
      );
      return medals.filter((medal) => isMedalInsideDistrict(medal, district)).length;
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
