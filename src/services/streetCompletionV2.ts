import { createStreetCompletionTimeline } from "./streetCompletionTimeline";
import {
  getStreetCompletionState,
  getStreetCompletionSummary,
  markStreetCompletionFailed,
  markStreetCompletionPending,
  markStreetCompletionProcessing,
  replaceStreetCompletionV2
} from "../database/streetCompletionRepository";
import { getAllStreetSegments } from "../database/streetRepository";
import { getAllWalksWithPoints, getWalkHistory } from "../database/walkRepository";
import {
  StreetCompletionSegmentProgress,
  StreetCompletionSessionCoverage,
  StreetCompletionSummary
} from "../types/street";
import {
  calculateCoordinatePathDistance,
  createStreetCoverageMatcher,
  getOsmStreetId,
  isWalkableStreetSegment,
  matchGpsPointsToStreetSegments,
  STREET_COMPLETION_V2_BIN_METERS
} from "./streetCompletion";
import { repairStreetCoverageForRecordings, samplePathCenters } from "./routeSnapshot";

let rebuildGeneration = 0;

export async function cancelStreetCompletionRebuild() {
  rebuildGeneration += 1;
  await activeRebuild?.catch(() => undefined);
}

let activeRebuild: Promise<StreetCompletionSummary> | null = null;

export type StreetCompletionRebuildOptions = {
  refreshStreetCoverage?: boolean;
  shouldAbort?: () => boolean;
};

export function rebuildStreetCompletionV2(
  options: StreetCompletionRebuildOptions = {}
): Promise<StreetCompletionSummary> {
  if (activeRebuild) {
    return activeRebuild;
  }

  const generation = rebuildGeneration;
  activeRebuild = performRebuild({
    ...options,
    shouldAbort: () => generation !== rebuildGeneration || Boolean(options.shouldAbort?.())
  }).finally(() => {
    activeRebuild = null;
  });

  return activeRebuild;
}

async function performRebuild(options: StreetCompletionRebuildOptions) {
  const walks = (await getWalkHistory("walk")).sort((a, b) => a.endedAt.localeCompare(b.endedAt) || a.id - b.id);

  if (options.shouldAbort?.()) {
    return getStreetCompletionSummary();
  }

  await markStreetCompletionProcessing(walks.length);

  try {
    if (options.refreshStreetCoverage && walks.length > 0) {
      const corridors = [];
      for (const session of walks) {
        if (options.shouldAbort?.()) {
          await markStreetCompletionPending();
          return getStreetCompletionSummary();
        }
        const [walk] = await getAllWalksWithPoints("walk", { kind: "selected", sessionId: session.id });
        if (walk) corridors.push({ points: samplePathCenters(walk.points, 175) });
      }
      const repair = await repairStreetCoverageForRecordings(corridors);

      if (repair.status === "failed") {
        console.warn(
          "Street Completion V2 could not refresh historical coverage; using the durable cache",
          repair.error
        );
      }
    }

    const [state, cachedSegments] = await Promise.all([
      getStreetCompletionState(),
      getAllStreetSegments()
    ]);
    const streetSegments = cachedSegments.filter(isWalkableStreetSegment);

    if (streetSegments.length === 0 && walks.length > 0) {
      await markStreetCompletionPending();
      return getStreetCompletionSummary();
    }

    const streetSegmentById = new Map(
      streetSegments.map((segment) => [segment.id, segment])
    );
    const matchFrozenRoute = createStreetCoverageMatcher(streetSegments);
    const captureLegacyEvidence =
      state.legacyCapturedAt === null && streetSegments.length > 0;
    const legacyMatchedIds = new Set<string>();
    const timeline = createStreetCompletionTimeline(streetSegments.map((segment) => ({
      segmentId: segment.id, streetId: getOsmStreetId(segment.id),
      totalDistanceMeters: calculateCoordinatePathDistance(segment.coordinates)
    })));
    const sessionCoverage: StreetCompletionSessionCoverage[] = [];
    const aggregateBinsBySegmentId = timeline.aggregateBinsBySegmentId;
    let processedRecordingCount = 0;

    for (const [walkIndex, session] of walks.entries()) {
      if (walkIndex > 0 && walkIndex % 4 === 0) {
        await yieldToEventLoop();
      }

      if (options.shouldAbort?.()) {
        await markStreetCompletionPending();
        return getStreetCompletionSummary();
      }

      const [walk] = await getAllWalksWithPoints("walk", { kind: "selected", sessionId: session.id }, { includePoints: captureLegacyEvidence });
      if (!walk) continue;
      if (captureLegacyEvidence) {
        for (const id of matchGpsPointsToStreetSegments(walk.points, streetSegments)) legacyMatchedIds.add(id);
      }
      if (!walk.routeSegments) {
        continue;
      }

      const coverage = matchFrozenRoute(walk.routeSegments);
      timeline.append(coverage, walk.endedAt);
      processedRecordingCount += 1;

      for (const segmentCoverage of coverage) {
        sessionCoverage.push({
          ...segmentCoverage,
          sessionId: walk.id
        });
      }
    }

    const segmentProgress: StreetCompletionSegmentProgress[] = streetSegments.flatMap(
      (segment) => {
        const totalDistanceMeters = calculateCoordinatePathDistance(segment.coordinates);

        if (totalDistanceMeters <= 0) {
          return [];
        }

        const totalBinCount = Math.max(1, Math.ceil(totalDistanceMeters / STREET_COMPLETION_V2_BIN_METERS));
        const coveredBinCount = aggregateBinsBySegmentId.get(segment.id)?.size ?? 0;
        const walkedDistanceMeters = Math.min(
          totalDistanceMeters,
          (coveredBinCount / totalBinCount) * totalDistanceMeters
        );
        const completionPercent = Math.min(
          100,
          Math.round((walkedDistanceMeters / totalDistanceMeters) * 1000) / 10
        );

        return [{
          completionPercent,
          highway: segment.highway,
          name: segment.name,
          segmentId: segment.id,
          streetId: getOsmStreetId(segment.id),
          totalDistanceMeters,
          walkedDistanceMeters
        }];
      }
    );

    if (options.shouldAbort?.()) {
      await markStreetCompletionPending();
      return getStreetCompletionSummary();
    }

    const replaced = await replaceStreetCompletionV2({
      completedAtByStreetId: timeline.completedAtByStreetId,
      captureLegacyEvidence,
      legacyMatchedSegments: streetSegments.filter((segment) => legacyMatchedIds.has(segment.id)),
      processedRecordingCount,
      segmentProgress,
      sessionCoverage: sessionCoverage.filter((coverage) =>
        streetSegmentById.has(coverage.segmentId)
      ),
      totalRecordingCount: walks.length
    });

    if (!replaced) {
      return getStreetCompletionSummary();
    }

    return getStreetCompletionSummary();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown street completion error";
    await markStreetCompletionFailed(message).catch((stateError) =>
      console.warn("Failed to persist Street Completion V2 error state", stateError)
    );
    throw error;
  }
}
function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
