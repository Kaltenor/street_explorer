import type { CachedZone } from "../database/completionRepository";
import type { DistrictExpeditionKind } from "../types/expedition";
import type { MapCoordinate } from "./explorationArea";
import { explorationCellKeyToCenterCoordinate } from "./explorationArea";

const CARDINAL_NEIGHBORS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
] as const;
const BOUNDARY_SCOUT_DISTANCE_METERS = 45;

export function calculateCellExpeditionProgress(input: {
  allCellKeys: readonly string[];
  district: CachedZone;
  kind: DistrictExpeditionKind;
  newCellKeys: readonly string[];
}) {
  const newInside = input.newCellKeys.filter((cellKey) =>
    isPointInsideZone(explorationCellKeyToCenterCoordinate(cellKey), input.district)
  );
  const newSet = new Set(input.newCellKeys);
  const oldSet = new Set(input.allCellKeys.filter((cellKey) => !newSet.has(cellKey)));
  const bounds = getZoneBounds(input.district);

  switch (input.kind) {
    case "explore_cells":
      return newInside.length;
    case "frontier_push":
      return countCellsWithNeighbors(newInside, oldSet, 1);
    case "seal_breach":
      return countCellsWithNeighbors(newInside, oldSet, 3);
    case "dense_survey":
      return countCellsWithNeighbors(newInside, new Set(newInside), 2);
    case "sector_sweep":
      return bounds ? countOccupiedSectors(newInside, bounds) : 0;
    case "northward_scout":
      return bounds
        ? countDirectionalCells(newInside, (point) => point.latitude >= bounds.center.latitude)
        : 0;
    case "southward_scout":
      return bounds
        ? countDirectionalCells(newInside, (point) => point.latitude < bounds.center.latitude)
        : 0;
    case "eastward_scout":
      return bounds
        ? countDirectionalCells(newInside, (point) => point.longitude >= bounds.center.longitude)
        : 0;
    case "westward_scout":
      return bounds
        ? countDirectionalCells(newInside, (point) => point.longitude < bounds.center.longitude)
        : 0;
    case "boundary_scout":
      return newInside.filter((cellKey) =>
        isNearDistrictBoundary(
          explorationCellKeyToCenterCoordinate(cellKey),
          input.district,
          BOUNDARY_SCOUT_DISTANCE_METERS
        )
      ).length;
    case "district_heart":
      return bounds
        ? countDirectionalCells(
            newInside,
            (point) =>
              Math.abs(point.latitude - bounds.center.latitude) <= bounds.latitudeSpan * 0.2 &&
              Math.abs(point.longitude - bounds.center.longitude) <= bounds.longitudeSpan * 0.2
          )
        : 0;
    case "outer_reach":
      return bounds
        ? countDirectionalCells(newInside, (point) => {
            const latitudeRatio = Math.abs(point.latitude - bounds.center.latitude) /
              Math.max(bounds.latitudeSpan / 2, Number.EPSILON);
            const longitudeRatio = Math.abs(point.longitude - bounds.center.longitude) /
              Math.max(bounds.longitudeSpan / 2, Number.EPSILON);
            return Math.max(latitudeRatio, longitudeRatio) >= 0.65;
          })
        : 0;
    default:
      return newInside.length;
  }
}

export function countNewCellsInsideDistrict(
  cellKeys: readonly string[],
  district: CachedZone
) {
  return cellKeys.filter((cellKey) =>
    isPointInsideZone(explorationCellKeyToCenterCoordinate(cellKey), district)
  ).length;
}

export function countFrontierCells(input: {
  allCellKeys: readonly string[];
  district: CachedZone;
  newCellKeys: readonly string[];
}) {
  return calculateCellExpeditionProgress({ ...input, kind: "frontier_push" });
}

function countCellsWithNeighbors(
  cellKeys: readonly string[],
  neighborSet: ReadonlySet<string>,
  minimumNeighborCount: number
) {
  return cellKeys.filter((cellKey) => {
    const { x, y } = parseCellKey(cellKey);
    const neighborCount = CARDINAL_NEIGHBORS.filter(([xOffset, yOffset]) =>
      neighborSet.has(`${x + xOffset}:${y + yOffset}`)
    ).length;
    return neighborCount >= minimumNeighborCount;
  }).length;
}

function countDirectionalCells(
  cellKeys: readonly string[],
  predicate: (point: MapCoordinate) => boolean
) {
  return cellKeys.filter((cellKey) =>
    predicate(explorationCellKeyToCenterCoordinate(cellKey))
  ).length;
}

function countOccupiedSectors(
  cellKeys: readonly string[],
  bounds: NonNullable<ReturnType<typeof getZoneBounds>>
) {
  const sectors = new Set<string>();

  for (const cellKey of cellKeys) {
    const point = explorationCellKeyToCenterCoordinate(cellKey);
    const row = Math.min(
      2,
      Math.max(0, Math.floor(((point.latitude - bounds.minLatitude) / bounds.latitudeSpan) * 3))
    );
    const column = Math.min(
      2,
      Math.max(0, Math.floor(((point.longitude - bounds.minLongitude) / bounds.longitudeSpan) * 3))
    );
    sectors.add(`${row}:${column}`);
  }

  return sectors.size;
}

function isNearDistrictBoundary(
  point: MapCoordinate,
  district: CachedZone,
  maximumDistanceMeters: number
) {
  return district.geometry.some((ring) => {
    for (let index = 0; index < ring.length; index += 1) {
      const from = ring[index];
      const to = ring[(index + 1) % ring.length];

      if (from && to && distanceToSegmentMeters(point, from, to) <= maximumDistanceMeters) {
        return true;
      }
    }

    return false;
  });
}

function distanceToSegmentMeters(
  point: MapCoordinate,
  from: MapCoordinate,
  to: MapCoordinate
) {
  const latitudeRadians = (point.latitude * Math.PI) / 180;
  const longitudeScale = 111_320 * Math.cos(latitudeRadians);
  const latitudeScale = 110_540;
  const fromX = (from.longitude - point.longitude) * longitudeScale;
  const fromY = (from.latitude - point.latitude) * latitudeScale;
  const toX = (to.longitude - point.longitude) * longitudeScale;
  const toY = (to.latitude - point.latitude) * latitudeScale;
  const segmentX = toX - fromX;
  const segmentY = toY - fromY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(fromX, fromY);
  }

  const projection = Math.max(
    0,
    Math.min(1, -(fromX * segmentX + fromY * segmentY) / segmentLengthSquared)
  );
  return Math.hypot(fromX + projection * segmentX, fromY + projection * segmentY);
}

function getZoneBounds(district: CachedZone) {
  const points = district.geometry.flat();

  if (points.length === 0) {
    return null;
  }

  const bounds = points.reduce(
    (result, point) => ({
      maxLatitude: Math.max(result.maxLatitude, point.latitude),
      maxLongitude: Math.max(result.maxLongitude, point.longitude),
      minLatitude: Math.min(result.minLatitude, point.latitude),
      minLongitude: Math.min(result.minLongitude, point.longitude)
    }),
    {
      maxLatitude: Number.NEGATIVE_INFINITY,
      maxLongitude: Number.NEGATIVE_INFINITY,
      minLatitude: Number.POSITIVE_INFINITY,
      minLongitude: Number.POSITIVE_INFINITY
    }
  );
  const latitudeSpan = Math.max(bounds.maxLatitude - bounds.minLatitude, Number.EPSILON);
  const longitudeSpan = Math.max(bounds.maxLongitude - bounds.minLongitude, Number.EPSILON);

  return {
    ...bounds,
    center: {
      latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
      longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
    },
    latitudeSpan,
    longitudeSpan
  };
}

function parseCellKey(cellKey: string) {
  const [x = 0, y = 0] = cellKey.split(":").map(Number);
  return { x, y };
}

function isPointInsideZone(point: MapCoordinate, zone: CachedZone) {
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(point, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(point, ring));
  return insideOuter && !insideHole;
}

function pointInPolygon(point: MapCoordinate, polygon: readonly MapCoordinate[]) {
  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (!current || !previous) {
      continue;
    }

    const intersects =
      current.latitude > point.latitude !== previous.latitude > point.latitude &&
      point.longitude <
        ((previous.longitude - current.longitude) * (point.latitude - current.latitude)) /
          (previous.latitude - current.latitude) +
          current.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
