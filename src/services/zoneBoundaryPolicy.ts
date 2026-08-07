export const EXACT_ZONE_BOUNDARY_SOURCE = "openstreetmap";
export const OFFICIAL_DISTRICT_ADMIN_LEVEL = 9;
export const NEIGHBORHOOD_ADMIN_LEVEL = 10;

type BoundaryCoordinate = {
  latitude: number;
  longitude: number;
};

type BoundaryZoneGeometry = {
  geometry: BoundaryCoordinate[][];
  holes: BoundaryCoordinate[][];
  type: string;
};

export function isOfficialDistrictAdminLevel(adminLevel: number | null | undefined) {
  return adminLevel === OFFICIAL_DISTRICT_ADMIN_LEVEL;
}

export function doesDistrictGeometryBelongToCity(
  district: BoundaryZoneGeometry,
  city: BoundaryZoneGeometry
) {
  if (
    district.type !== "district" ||
    city.type !== "city" ||
    district.geometry.length === 0
  ) {
    return false;
  }

  return district.geometry.every((ring) => {
    const samples = getRingInteriorSamples(ring, district.holes);

    return samples.length > 0 &&
      samples.every((point) => isPointInsideBoundaryZone(point, city));
  });
}

function getRingInteriorSamples(
  ring: BoundaryCoordinate[],
  holes: BoundaryCoordinate[][]
) {
  const bounds = getBoundaryGeometryBounds(ring);

  if (!bounds) {
    return [];
  }

  const samples: BoundaryCoordinate[] = [];
  const gridSize = 9;

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const point = {
        latitude: bounds.minLatitude +
          ((row + 0.5) / gridSize) * (bounds.maxLatitude - bounds.minLatitude),
        longitude: bounds.minLongitude +
          ((column + 0.5) / gridSize) * (bounds.maxLongitude - bounds.minLongitude)
      };

      if (
        pointInBoundaryPolygon(point, ring) &&
        !holes.some((hole) => pointInBoundaryPolygon(point, hole))
      ) {
        samples.push(point);
      }
    }
  }

  return samples;
}

function isPointInsideBoundaryZone(
  point: BoundaryCoordinate,
  zone: BoundaryZoneGeometry
) {
  const insideOuter = zone.geometry.some((ring) =>
    pointInBoundaryPolygon(point, ring)
  );
  const insideHole = zone.holes.some((ring) =>
    pointInBoundaryPolygon(point, ring)
  );

  return insideOuter && !insideHole;
}

function pointInBoundaryPolygon(
  point: BoundaryCoordinate,
  polygon: BoundaryCoordinate[]
) {
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
        ((previous.longitude - current.longitude) *
          (point.latitude - current.latitude)) /
          (previous.latitude - current.latitude) +
          current.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getBoundaryGeometryBounds(ring: BoundaryCoordinate[]) {
  if (ring.length === 0) {
    return null;
  }

  return ring.reduce(
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


export function buildBoundaryQuery(latitude: number, longitude: number) {
  return `
    [out:json][timeout:35];
    is_in(${latitude},${longitude})->.containingAreas;
    area.containingAreas
      ["boundary"="administrative"]
      ["admin_level"="2"]->.countryAreas;
    area.containingAreas
      ["boundary"="administrative"]
      ["admin_level"="8"]->.cityAreas;
    area.containingAreas
      ["boundary"="administrative"]
      ["admin_level"~"^(8|9|10)$"]->.localAreas;
    rel(pivot.countryAreas)->.countryRelations;
    rel(pivot.localAreas)->.containingLocalRelations;
    rel(around:3500,${latitude},${longitude})
      ["boundary"="administrative"]
      ["admin_level"~"^(8|9|10)$"]->.nearbyLocalRelations;
    rel(area.cityAreas)
      ["boundary"="administrative"]
      ["admin_level"~"^(9|10)$"]->.cityDistrictRelations;
    (
      .containingLocalRelations;
      .nearbyLocalRelations;
      .cityDistrictRelations;
    )->.localRelations;
    .countryRelations out tags geom;
    .localRelations out body geom;
  `;
}

export function shouldReplaceCachedZone(
  existingSource: string | null,
  incomingSource: string
) {
  return !(
    existingSource === EXACT_ZONE_BOUNDARY_SOURCE &&
    incomingSource !== EXACT_ZONE_BOUNDARY_SOURCE
  );
}
