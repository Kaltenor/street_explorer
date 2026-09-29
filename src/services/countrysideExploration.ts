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
    .map((zone) => ({
      bounds: getGeometryBounds(zone.geometry),
      geometry: indexBoundaryRings(zone.geometry),
      holes: indexBoundaryRings(zone.holes)
    }));
  const cityCellIds: string[] = [];
  const countrysideCellIds: string[] = [];

  for (const cellId of input.cellIds) {
    const center = input.getCellCenter(cellId);
    const isInsideCity = indexedBoundaries.some((zone) =>
      zone.bounds && isPointInsideBounds(center, zone.bounds) && isPointInsideBoundary(center, zone)
    );

    (isInsideCity ? cityCellIds : countrysideCellIds).push(cellId);
  }

  return { cityCellIds, countrysideCellIds };
}

type IndexedBoundaryRing = { bounds: BoundaryBounds; ring: BoundaryCoordinate[] };

function indexBoundaryRings(rings: BoundaryCoordinate[][]): IndexedBoundaryRing[] {
  return rings.flatMap((ring) => {
    const bounds = getGeometryBounds([ring]);
    return bounds ? [{ bounds, ring }] : [];
  });
}

function isPointInsideBoundary(
  point: BoundaryCoordinate,
  zone: { geometry: IndexedBoundaryRing[]; holes: IndexedBoundaryRing[] }
) {
  const insideOuter = zone.geometry.some(({ bounds, ring }) =>
    isPointInsideBounds(point, bounds) && pointInPolygon(point, ring)
  );
  if (!insideOuter) return false;
  const insideHole = zone.holes.some(({ bounds, ring }) =>
    isPointInsideBounds(point, bounds) && pointInPolygon(point, ring)
  );

  return insideOuter && !insideHole;
}

function getGeometryBounds(geometry: BoundaryCoordinate[][]): BoundaryBounds | null {
  let bounds: BoundaryBounds | null = null;
  for (const ring of geometry) {
    for (const point of ring) {
      if (!bounds) {
        bounds = {
          maxLatitude: point.latitude, maxLongitude: point.longitude,
          minLatitude: point.latitude, minLongitude: point.longitude
        };
      } else {
        bounds.maxLatitude = Math.max(bounds.maxLatitude, point.latitude);
        bounds.maxLongitude = Math.max(bounds.maxLongitude, point.longitude);
        bounds.minLatitude = Math.min(bounds.minLatitude, point.latitude);
        bounds.minLongitude = Math.min(bounds.minLongitude, point.longitude);
      }
    }
  }
  return bounds;
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
