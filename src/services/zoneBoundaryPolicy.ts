export const EXACT_ZONE_BOUNDARY_SOURCE = "openstreetmap";

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
