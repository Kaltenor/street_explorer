import { getAllWalksWithPoints } from "../database/walkRepository";
import {
  collectMedalCandidates,
  markMedalRetroScanCompleted
} from "../database/medalRepository";
import { BUNDLED_MEDAL_ALBUMS } from "../data/medalAlbums";
import {
  collectEnclosedExplorationCellGroups,
  collectExploredCellIdsByRouteSegments,
  coordinateToExplorationCellKey,
  EXPLORATION_CELL_SIZE_METERS
} from "./explorationArea";
import { buildPathSegments } from "./pathInference";
import { MODE_LOCATION_CONFIG } from "../constants/config";
import {
  MedalAlbumDefinition,
  MedalCollectionCandidate,
  MedalCollectionResult
} from "../types/medal";
import { GpsPoint, RenderedRouteSegment, WalkWithPoints } from "../types/walk";

export const MEDAL_MAX_ENCLOSURE_AREA_SQUARE_METERS = 100_000;
export const MEDAL_MIN_BOUNDARY_LENGTH_METERS = 80;

type TrustedGpsEvidence = {
  boundaryCellIds: Set<string>;
  cellIds: Set<string>;
  trustedPointKeys: Set<string>;
};

export type MedalCandidateEvaluationInput = {
  album: MedalAlbumDefinition;
  afterCellIds: ReadonlySet<string>;
  beforeCellIds?: ReadonlySet<string>;
  triggerCellIds?: ReadonlySet<string>;
};

export function findMedalCollectionCandidates(
  input: MedalCandidateEvaluationInput
): MedalCollectionCandidate[] {
  const maxCellCount = Math.floor(
    MEDAL_MAX_ENCLOSURE_AREA_SQUARE_METERS /
      (EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS)
  );
  const minimumBoundaryCellCount = Math.ceil(
    MEDAL_MIN_BOUNDARY_LENGTH_METERS / EXPLORATION_CELL_SIZE_METERS
  );
  const beforeEnclosedCellIds = new Set(
    input.beforeCellIds
      ? collectEnclosedExplorationCellGroups([...input.beforeCellIds]).flat()
      : []
  );
  const candidates: MedalCollectionCandidate[] = [];

  for (const group of collectEnclosedExplorationCellGroups([...input.afterCellIds])) {
    if (group.length === 0 || group.length > maxCellCount) {
      continue;
    }

    const boundaryCellIds = collectAdjacentOccupiedBoundaryCells(
      group,
      input.afterCellIds
    );

    if (boundaryCellIds.size < minimumBoundaryCellCount) {
      continue;
    }

    if (
      input.triggerCellIds &&
      ![...boundaryCellIds].some((cellId) => input.triggerCellIds?.has(cellId))
    ) {
      continue;
    }

    const groupCellIds = new Set(group);
    const enclosureId = buildEnclosureId(group);
    const enclosureAreaSquareMeters =
      group.length * EXPLORATION_CELL_SIZE_METERS * EXPLORATION_CELL_SIZE_METERS;

    for (const medal of input.album.medals) {
      const anchorCellId = coordinateToExplorationCellKey(medal);

      if (
        groupCellIds.has(anchorCellId) &&
        !beforeEnclosedCellIds.has(anchorCellId)
      ) {
        candidates.push({
          albumId: input.album.id,
          medalId: medal.id,
          anchorCellId,
          enclosureAreaSquareMeters,
          enclosureCellIds: [...group].sort(),
          enclosureId
        });
      }
    }
  }

  return candidates;
}

export async function evaluateMedalCollectionForRecording(
  sessionId: number
): Promise<MedalCollectionResult> {
  const walks = await getAllWalksWithPoints("walk");
  const triggerWalk = walks.find((walk) => walk.id === sessionId);

  if (!triggerWalk) {
    return {
      collected: [],
      evaluatedMedalCount: 0,
      trustedPointCount: 0
    };
  }

  const beforeEvidence = buildTrustedGpsEvidence(
    walks.filter((walk) => walk.id !== sessionId)
  );
  const triggerEvidence = buildTrustedGpsEvidence([triggerWalk]);
  const afterCellIds = new Set(beforeEvidence.cellIds);

  for (const cellId of triggerEvidence.cellIds) {
    afterCellIds.add(cellId);
  }

  const candidates = BUNDLED_MEDAL_ALBUMS.flatMap((album) =>
    findMedalCollectionCandidates({
      album,
      afterCellIds,
      beforeCellIds: beforeEvidence.cellIds,
      triggerCellIds: triggerEvidence.cellIds
    })
  );
  const collected = await collectMedalCandidates({
    candidates,
    reason: "recording",
    sessionId
  });

  return {
    collected,
    evaluatedMedalCount: BUNDLED_MEDAL_ALBUMS.reduce(
      (total, album) => total + album.medals.length,
      0
    ),
    trustedPointCount:
      beforeEvidence.trustedPointKeys.size + triggerEvidence.trustedPointKeys.size
  };
}

export async function runMedalRetroScan(): Promise<MedalCollectionResult> {
  const walks = await getAllWalksWithPoints("walk");
  const evidence = buildTrustedGpsEvidence(walks);
  const candidates = BUNDLED_MEDAL_ALBUMS.flatMap((album) =>
    findMedalCollectionCandidates({
      album,
      afterCellIds: evidence.cellIds
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

  return {
    collected,
    evaluatedMedalCount: BUNDLED_MEDAL_ALBUMS.reduce(
      (total, album) => total + album.medals.length,
      0
    ),
    trustedPointCount: evidence.trustedPointKeys.size
  };
}

export function buildTrustedGpsEvidence(
  walks: readonly Pick<WalkWithPoints, "id" | "points">[]
): TrustedGpsEvidence {
  const cellIds = new Set<string>();
  const trustedPointKeys = new Set<string>();

  for (const walk of walks) {
    const routeSegments = buildTrustedDirectRouteSegments(walk.points);
    const explored = collectExploredCellIdsByRouteSegments(routeSegments);

    for (const cellId of explored.gps) {
      cellIds.add(cellId);
    }

    for (const segment of routeSegments) {
      for (const point of segment.points) {
        trustedPointKeys.add(`${walk.id}:${point.id ?? point.timestamp}:${point.pointIndex}`);
      }
    }
  }

  return {
    boundaryCellIds: cellIds,
    cellIds,
    trustedPointKeys
  };
}

export function buildTrustedDirectRouteSegments(
  points: readonly GpsPoint[]
): RenderedRouteSegment[] {
  return buildPathSegments([...points], "walk").flatMap<RenderedRouteSegment>((segment) => {
    if (
      segment.type !== "confirmed" ||
      !isTrustedAccuracy(segment.startPoint.accuracy) ||
      !isTrustedAccuracy(segment.endPoint.accuracy)
    ) {
      return [];
    }

    return [{
      points: [segment.startPoint, segment.endPoint],
      type: "confirmed"
    }];
  });
}

function isTrustedAccuracy(accuracy: number | null) {
  return (
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= MODE_LOCATION_CONFIG.walk.maxAcceptedAccuracyMeters
  );
}

function collectAdjacentOccupiedBoundaryCells(
  enclosedCellIds: readonly string[],
  occupiedCellIds: ReadonlySet<string>
) {
  const boundaryCellIds = new Set<string>();

  for (const cellId of enclosedCellIds) {
    const cell = parseCellId(cellId);

    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        if (deltaX === 0 && deltaY === 0) {
          continue;
        }

        const adjacentCellId = `${cell.x + deltaX}:${cell.y + deltaY}`;

        if (occupiedCellIds.has(adjacentCellId)) {
          boundaryCellIds.add(adjacentCellId);
        }
      }
    }
  }

  return boundaryCellIds;
}

function buildEnclosureId(cellIds: readonly string[]) {
  let hash = 2166136261;

  for (const character of [...cellIds].sort().join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return `direct-gps-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function parseCellId(cellId: string) {
  const [x, y] = cellId.split(":").map(Number);

  return {
    x: x ?? 0,
    y: y ?? 0
  };
}
