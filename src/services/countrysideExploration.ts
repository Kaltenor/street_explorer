type BoundaryCoordinate = {
  latitude: number;
  longitude: number;
};

type CityBoundary = {
  geometry: BoundaryCoordinate[][];
  holes: BoundaryCoordinate[][];
};

type BoundaryBounds = {
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
};

export type ExplorationAreaPartition = {
  cityCellIds: string[];
  countrysideCellIds: string[];
};

export function partitionExplorationCellIdsByCity(input: {
  cellIds: readonly string[];
  cityBoundaries: readonly CityBoundary[];
  getCellCenter: (cellId: string) => BoundaryCoordinate;
}): ExplorationAreaPartition {
  const indexedBoundaries = input.cityBoundaries
    .map((zone) => ({ bounds: getGeometryBounds(zone.geometry), zone }))
    .filter((entry): entry is { bounds: BoundaryBounds; zone: CityBoundary } =>
      entry.bounds !== null
    );
  const cityCellIds: string[] = [];
  const countrysideCellIds: string[] = [];

  for (const cellId of input.cellIds) {
    const center = input.getCellCenter(cellId);
    const isInsideCity = indexedBoundaries.some(({ bounds, zone }) =>
      isPointInsideBounds(center, bounds) && isPointInsideBoundary(center, zone)
    );

    (isInsideCity ? cityCellIds : countrysideCellIds).push(cellId);
  }

  return { cityCellIds, countrysideCellIds };
}

function isPointInsideBoundary(point: BoundaryCoordinate, zone: CityBoundary) {
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(point, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(point, ring));

  return insideOuter && !insideHole;
}

function getGeometryBounds(geometry: BoundaryCoordinate[][]): BoundaryBounds | null {
  const coordinates = geometry.flat();

  if (coordinates.length === 0) {
    return null;
  }

  return coordinates.reduce<BoundaryBounds>(
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

function isPointInsideBounds(point: BoundaryCoordinate, bounds: BoundaryBounds) {
  return (
    point.latitude >= bounds.minLatitude &&
    point.latitude <= bounds.maxLatitude &&
    point.longitude >= bounds.minLongitude &&
    point.longitude <= bounds.maxLongitude
  );
}

function pointInPolygon(
  point: BoundaryCoordinate,
  polygon: readonly BoundaryCoordinate[]
) {
  if (polygon.length < 3) {
    return false;
  }

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
      current.longitude > point.longitude !== previous.longitude > point.longitude &&
      point.latitude <
        ((previous.latitude - current.latitude) *
          (point.longitude - current.longitude)) /
          (previous.longitude - current.longitude) +
        current.latitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
