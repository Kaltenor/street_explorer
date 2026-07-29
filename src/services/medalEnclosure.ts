import { getAllWalksWithPoints } from "../database/walkRepository";
import {
  collectMedalCandidates,
  hasCompletedMedalRecordingRepair,
  markMedalRecordingRepairCompleted,
  markMedalRetroScanCompleted
} from "../database/medalRepository";
import { BUNDLED_MEDAL_ALBUMS } from "../data/medalAlbums";
import {
  collectExploredCellIdsByRouteSegments,
  coordinateToExplorationCellKey
} from "./explorationArea";
import { analyzeLoopFillsForCells, LOOP_FILL_CONFIG } from "./loopFill";
import { buildPathSegments } from "./pathInference";
import {
  MedalAlbumDefinition,
  MedalCollectionCandidate,
  MedalCollectionResult
} from "../types/medal";
import { GpsPoint, RenderedRouteSegment, WalkWithPoints } from "../types/walk";

export const MEDAL_MAX_ENCLOSURE_AREA_SQUARE_METERS =
  LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode.walk;
export const MEDAL_MIN_BOUNDARY_LENGTH_METERS =
  LOOP_FILL_CONFIG.minLoopDistanceMeters;

type GameplayGpsEvidence = {
  boundaryCellIds: Set<string>;
  pointKeys: Set<string>;
  walkedDistanceMeters: number;
};

export type MedalCandidateEvaluationInput = {
  album: MedalAlbumDefinition;
  boundaryCellIds: ReadonlySet<string>;
  walkedDistanceMeters: number;
};

export function findMedalCollectionCandidates(
  input: MedalCandidateEvaluationInput
): MedalCollectionCandidate[] {
  if (input.walkedDistanceMeters < LOOP_FILL_CONFIG.minLoopDistanceMeters) {
    return [];
  }

  const candidates: MedalCollectionCandidate[] = [];
  const candidateMedalIds = new Set<string>();
  const loopFills = analyzeLoopFillsForCells({
    activityMode: "walk",
    boundaryCellIds: [...input.boundaryCellIds],
    exploredStreetIds: new Set(),
    streetSegments: []
  });

  for (const loopFill of loopFills) {
    if (!loopFill.accepted || loopFill.cellIds.length === 0) {
      continue;
    }

    const enclosedCellIds = new Set(loopFill.cellIds);
    const enclosureId = buildEnclosureId(loopFill.cellIds);

    for (const medal of input.album.medals) {
      if (candidateMedalIds.has(medal.id)) {
        continue;
      }

      const anchorCellId = coordinateToExplorationCellKey(medal);

      if (!enclosedCellIds.has(anchorCellId)) {
        continue;
      }

      candidateMedalIds.add(medal.id);
      candidates.push({
        albumId: input.album.id,
        medalId: medal.id,
        anchorCellId,
        enclosureAreaSquareMeters: loopFill.areaM2,
        enclosureCellIds: [...loopFill.cellIds].sort(),
        enclosureId
      });
    }
  }

  return candidates;
}

export async function evaluateLiveMedalCollection(input: {
  boundaryCellIds: readonly string[];
  sessionId: number;
  walkedDistanceMeters: number;
}): Promise<MedalCollectionResult> {
  const candidates = BUNDLED_MEDAL_ALBUMS.flatMap((album) =>
    findMedalCollectionCandidates({
      album,
      boundaryCellIds: new Set(input.boundaryCellIds),
      walkedDistanceMeters: input.walkedDistanceMeters
    })
  );
  const collected = await collectMedalCandidates({
    candidates,
    reason: "recording",
    sessionId: input.sessionId
  });

  return buildCollectionResult(collected, input.boundaryCellIds.length);
}

export async function evaluateMedalCollectionForRecording(
  sessionId: number
): Promise<MedalCollectionResult> {
  const walks = await getAllWalksWithPoints("walk");
  const triggerWalk = walks.find((walk) => walk.id === sessionId);

  if (!triggerWalk) {
    return buildCollectionResult([], 0);
  }

  const evidence = buildGameplayGpsEvidence([triggerWalk]);
  const candidates = BUNDLED_MEDAL_ALBUMS.flatMap((album) =>
    findMedalCollectionCandidates({
      album,
      boundaryCellIds: evidence.boundaryCellIds,
      walkedDistanceMeters: evidence.walkedDistanceMeters
    })
  );
  const collected = await collectMedalCandidates({
    candidates,
    reason: "recording",
    sessionId
  });

  return buildCollectionResult(collected, evidence.pointKeys.size);
}

export async function repairMissedRecordingMedals(): Promise<MedalCollectionResult> {
  if (await hasCompletedMedalRecordingRepair()) {
    return buildCollectionResult([], 0);
  }

  const walks = await getAllWalksWithPoints("walk");
  const collected = [];
  let evaluatedPointCount = 0;

  for (const walk of walks) {
    const evidence = buildGameplayGpsEvidence([walk]);
    evaluatedPointCount += evidence.pointKeys.size;
    const candidates = BUNDLED_MEDAL_ALBUMS.flatMap((album) =>
      findMedalCollectionCandidates({
        album,
        boundaryCellIds: evidence.boundaryCellIds,
        walkedDistanceMeters: evidence.walkedDistanceMeters
      })
    );
    const newlyCollected = await collectMedalCandidates({
      candidates,
      reason: "recording",
      sessionId: walk.id
    });

    collected.push(...newlyCollected);
  }

  await markMedalRecordingRepairCompleted();
  return buildCollectionResult(collected, evaluatedPointCount);
}

export async function runMedalRetroScan(): Promise<MedalCollectionResult> {
  const walks = await getAllWalksWithPoints("walk");
  const evidence = buildGameplayGpsEvidence(walks);
  const candidates = BUNDLED_MEDAL_ALBUMS.flatMap((album) =>
    findMedalCollectionCandidates({
      album,
      boundaryCellIds: evidence.boundaryCellIds,
      walkedDistanceMeters: evidence.walkedDistanceMeters
    })
  );
  const collected = await collectMedalCandidates({
    candidates,
    reason: "retro_scan",
    sessionId: null
  });

  await Promise.all(
    BUNDLED_MEDAL_ALBUMS.map((album) => markMedalRetroScanCompleted(album.id))
  );

  return buildCollectionResult(collected, evidence.pointKeys.size);
}

export function buildGameplayGpsEvidence(
  walks: readonly Pick<
    WalkWithPoints,
    "distanceMeters" | "id" | "points" | "routeSegments"
  >[]
): GameplayGpsEvidence {
  const boundaryCellIds = new Set<string>();
  const pointKeys = new Set<string>();
  let walkedDistanceMeters = 0;

  for (const walk of walks) {
    const routeSegments =
      walk.routeSegments ?? buildGameplayDirectRouteSegments(walk.points);
    const explored = collectExploredCellIdsByRouteSegments(routeSegments);

    for (const cellId of [...explored.gps, ...explored.inferred]) {
      boundaryCellIds.add(cellId);
    }

    for (const segment of routeSegments) {
      for (const point of segment.points) {
        pointKeys.add(`${walk.id}:${point.id ?? point.timestamp}:${point.pointIndex}`);
      }
    }

    walkedDistanceMeters += Math.max(0, walk.distanceMeters);
  }

  return {
    boundaryCellIds,
    pointKeys,
    walkedDistanceMeters
  };
}

export function buildGameplayDirectRouteSegments(
  points: readonly GpsPoint[]
): RenderedRouteSegment[] {
  return buildPathSegments([...points], "walk").flatMap<RenderedRouteSegment>((segment) => {
    if (segment.type !== "confirmed") {
      return [];
    }

    return [{
      points: [segment.startPoint, segment.endPoint],
      type: "confirmed"
    }];
  });
}

function buildCollectionResult(
  collected: MedalCollectionResult["collected"],
  trustedPointCount: number
): MedalCollectionResult {
  return {
    collected,
    evaluatedMedalCount: BUNDLED_MEDAL_ALBUMS.reduce(
      (total, album) => total + album.medals.length,
      0
    ),
    trustedPointCount
  };
}

function buildEnclosureId(cellIds: readonly string[]) {
  let hash = 2166136261;

  for (const character of [...cellIds].sort().join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return `gameplay-loop-v2:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
