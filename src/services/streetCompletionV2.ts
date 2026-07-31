import {
  getStreetCompletionState,
  getStreetCompletionSummary,
  markStreetCompletionFailed,
  markStreetCompletionPending,
  markStreetCompletionProcessing,
  replaceStreetCompletionV2
} from "../database/streetCompletionRepository";
import { getAllStreetSegments } from "../database/streetRepository";
import { getAllWalksWithPoints } from "../database/walkRepository";
import {
  StreetCompletionSegmentProgress,
  StreetCompletionSessionCoverage,
  StreetCompletionSummary
} from "../types/street";
import {
  addStreetCoverageToAggregate,
  calculateCoordinatePathDistance,
  createStreetCoverageMatcher,
  getOsmStreetId,
  isWalkableStreetSegment,
  matchGpsPointsToStreetSegments,
  STREET_COMPLETION_V2_BIN_METERS
} from "./streetCompletion";
import { repairStreetCoverageForRecordings } from "./routeSnapshot";

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

  activeRebuild = performRebuild(options).finally(() => {
    activeRebuild = null;
  });

  return activeRebuild;
}

async function performRebuild(options: StreetCompletionRebuildOptions) {
  const walks = await getAllWalksWithPoints("walk");

  if (options.shouldAbort?.()) {
    return getStreetCompletionSummary();
  }

  await markStreetCompletionProcessing(walks.length);

  try {
    if (options.refreshStreetCoverage && walks.length > 0) {
      const repair = await repairStreetCoverageForRecordings(walks);

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
    const legacyMatchedIds = captureLegacyEvidence
      ? matchGpsPointsToStreetSegments(
          walks.flatMap((walk) => walk.points),
          streetSegments
        )
      : new Set<string>();
    const sessionCoverage: StreetCompletionSessionCoverage[] = [];
    const aggregateBinsBySegmentId = new Map<string, Set<number>>();
    let processedRecordingCount = 0;

    for (const [walkIndex, walk] of walks.entries()) {
      if (walkIndex > 0 && walkIndex % 4 === 0) {
        await yieldToEventLoop();
      }

      if (options.shouldAbort?.()) {
        await markStreetCompletionPending();
        return getStreetCompletionSummary();
      }

      if (!walk.routeSegments) {
        continue;
      }

      const coverage = matchFrozenRoute(walk.routeSegments);
      processedRecordingCount += 1;

      for (const segmentCoverage of coverage) {
        sessionCoverage.push({
          ...segmentCoverage,
          sessionId: walk.id
        });
      }
      addStreetCoverageToAggregate(aggregateBinsBySegmentId, coverage);
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
