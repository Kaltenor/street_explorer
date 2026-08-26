type MapZoneScopeChoiceInput = {
  currentCityId: string | null;
  hasHeldDistrict: boolean;
  heldCityId: string | null;
};

export const MAP_ZONE_SELECTION_CONFIG = {
  angleSteps: 16,
  maxHitSlopMeters: 120,
  radialSteps: 4,
  viewportFraction: 0.015
} as const;

type MapSelectionCoordinate = {
  latitude: number;
  longitude: number;
};

type MapSelectionViewport = MapSelectionCoordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

export function buildMapZoneSelectionProbeCoordinates(input: {
  coordinate: MapSelectionCoordinate;
  viewport: MapSelectionViewport | null;
}) {
  if (!input.viewport) {
    return [input.coordinate];
  }

  const latitudeRadians = input.coordinate.latitude * Math.PI / 180;
  const metersPerLongitudeDegree = Math.max(
    1,
    111_320 * Math.cos(latitudeRadians)
  );
  const latitudeOffset = Math.min(
    input.viewport.latitudeDelta * MAP_ZONE_SELECTION_CONFIG.viewportFraction,
    MAP_ZONE_SELECTION_CONFIG.maxHitSlopMeters / 111_320
  );
  const longitudeOffset = Math.min(
    input.viewport.longitudeDelta * MAP_ZONE_SELECTION_CONFIG.viewportFraction,
    MAP_ZONE_SELECTION_CONFIG.maxHitSlopMeters / metersPerLongitudeDegree
  );

  const probes: MapSelectionCoordinate[] = [input.coordinate];

  // Sample concentric screen-space rings rather than only the outer radius.
  // Otherwise a low-zoom 120 m probe can jump completely over a nearby
  // boundary that a smaller high-zoom probe happens to hit.
  for (let radialStep = 1; radialStep <= MAP_ZONE_SELECTION_CONFIG.radialSteps; radialStep += 1) {
    const radius = radialStep / MAP_ZONE_SELECTION_CONFIG.radialSteps;

    for (let angleStep = 0; angleStep < MAP_ZONE_SELECTION_CONFIG.angleSteps; angleStep += 1) {
      const angle = angleStep / MAP_ZONE_SELECTION_CONFIG.angleSteps * Math.PI * 2;
      probes.push({
        latitude: input.coordinate.latitude + Math.cos(angle) * latitudeOffset * radius,
        longitude: input.coordinate.longitude + Math.sin(angle) * longitudeOffset * radius
      });
    }
  }

  return probes;
}

export function shouldOfferMapZoneScopeChoice({
  currentCityId,
  hasHeldDistrict,
  heldCityId
}: MapZoneScopeChoiceInput) {
  return Boolean(
    currentCityId &&
    heldCityId &&
    hasHeldDistrict &&
    currentCityId !== heldCityId
  );
}
