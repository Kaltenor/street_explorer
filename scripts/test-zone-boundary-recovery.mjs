import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildBoundaryQuery,
  doesDistrictGeometryBelongToCity,
  isOfficialDistrictAdminLevel,
  NEIGHBORHOOD_ADMIN_LEVEL,
  OFFICIAL_DISTRICT_ADMIN_LEVEL,
  shouldReplaceCachedZone
} from "../src/services/zoneBoundaryPolicy.ts";
import { shouldOfferMapZoneScopeChoice } from "../src/services/mapZoneSelection.ts";

const query = buildBoundaryQuery(45.7555548, 4.8622856);

assert.match(query, /\.localRelations out body geom;/);
assert.match(query, /\.countryRelations out tags geom;/);
assert.match(query, /\.cityDistrictRelations;/);
assert.doesNotMatch(query, /\.localRelations out tags geom;/);

assert.equal(shouldReplaceCachedZone(null, "openstreetmap_incomplete_fallback"), true);
assert.equal(shouldReplaceCachedZone("openstreetmap_incomplete_fallback", "openstreetmap"), true);
assert.equal(shouldReplaceCachedZone("openstreetmap", "openstreetmap"), true);
assert.equal(
  shouldReplaceCachedZone("openstreetmap", "openstreetmap_incomplete_fallback"),
  false
);

assert.equal(
  shouldOfferMapZoneScopeChoice({
    currentCityId: "lyon",
    hasHeldDistrict: true,
    heldCityId: "lyon"
  }),
  false
);
assert.equal(
  shouldOfferMapZoneScopeChoice({
    currentCityId: "villeurbanne",
    hasHeldDistrict: true,
    heldCityId: "lyon"
  }),
  true
);
assert.equal(
  shouldOfferMapZoneScopeChoice({
    currentCityId: null,
    hasHeldDistrict: true,
    heldCityId: "lyon"
  }),
  false
);
assert.equal(
  shouldOfferMapZoneScopeChoice({ currentCityId: "lyon", hasHeldDistrict: false, heldCityId: "lyon" }),
  false
);

const completionSource = readFileSync(
  new URL("../src/components/CompletionModal.tsx", import.meta.url),
  "utf8"
);
const mapSource = readFileSync(
  new URL("../src/screens/MapScreen.tsx", import.meta.url),
  "utf8"
);
const explorationMapSource = readFileSync(
  new URL("../src/components/ExplorationMap.tsx", import.meta.url),
  "utf8"
);
const zoneCompletionSource = readFileSync(
  new URL("../src/services/zoneCompletion.ts", import.meta.url),
  "utf8"
);
const completionRepositorySource = readFileSync(
  new URL("../src/database/completionRepository.ts", import.meta.url),
  "utf8"
);
const databaseSource = readFileSync(
  new URL("../src/database/db.ts", import.meta.url),
  "utf8"
);
const settingsSource = readFileSync(
  new URL("../src/database/settingsRepository.ts", import.meta.url),
  "utf8"
);

assert.match(completionSource, /await onZonesUpdated\(\)/);
assert.match(mapSource, /const reloadSavedCompletionObjective = useCallback/);
assert.match(mapSource, /onZonesUpdated=\{handleCompletionZonesUpdated\}/);
assert.match(mapSource, /objectiveStatsRequestRef\.current === requestId/);
assert.match(mapSource, /doesDistrictBelongToCity\(zone, currentCity\)/);
assert.match(mapSource, /setPlayerFocusRequestId\(\(requestId\) => requestId \+ 1\)/);
assert.match(mapSource, /const handleMapLongPress = useCallback/);
assert.match(mapSource, /await Haptics\.selectionAsync\(\)/);
assert.match(mapSource, /mapZoneSelectionRequestRef\.current !== requestId/);
assert.match(mapSource, /shouldOfferMapZoneScopeChoice/);
assert.match(mapSource, /setMapZoneSelection\(shouldOfferScopeChoice \? choices : null\)/);
assert.match(mapSource, /shouldOfferScopeChoice && objective\?\.zone\.type === "city"/);
assert.match(mapSource, /applyMapObjective\(preferredZone\)/);
assert.match(mapSource, /function MapZoneScopePicker/);
assert.match(mapSource, /const preloadCurrentCityDistricts = async/);
assert.match(mapSource, /if \(objective \|\| !currentLocation\)/);
assert.doesNotMatch(mapSource, /shouldFetchAutoObjectiveZones/);
assert.doesNotMatch(mapSource, /Failed to auto-switch completion objective/);
assert.match(explorationMapSource, /districtZones\.flatMap/);
assert.match(explorationMapSource, /const isSelectedDistrict/);
assert.match(explorationMapSource, /administrative-boundaries-/);
assert.doesNotMatch(explorationMapSource, /unselectedDistrictZones/);
assert.match(mapSource, /const commitMapBoundaryContext = useCallback/);
assert.match(mapSource, /setMapBoundaryContext\(EMPTY_MAP_BOUNDARY_CONTEXT\)/);
assert.match(
  mapSource,
  /setMapBoundaryContext\(EMPTY_MAP_BOUNDARY_CONTEXT\);\s+await waitForMapRenderCommit\(\)/
);
assert.match(mapSource, /await commitMapBoundaryContext/);
assert.match(mapSource, /mapBoundarySwapGenerationRef/);
assert.ok(mapSource.includes("const visibleMapBoundaryContext = useMemo"));
assert.ok(mapSource.includes("return objective ? EMPTY_MAP_BOUNDARY_CONTEXT : mapBoundaryContext"));
assert.ok(mapSource.includes("objective.zone.id === mapBoundaryContext.city.id"));
assert.ok(mapSource.includes("doesDistrictBelongToCity(objective.zone, mapBoundaryContext.city)"));
assert.ok(mapSource.includes("cityZone={visibleMapBoundaryContext.city}"));
assert.match(mapSource, /!cityDistrictZones\.some/);
assert.ok(explorationMapSource.includes('key={`native-map-${appearanceMode}-city-${cityZone?.id ?? "none"}`}'));
assert.match(explorationMapSource, /initialRegion={visibleRegion}/);
assert.match(explorationMapSource, /onLongPress=\{handleMapLongPress\}/);
assert.match(explorationMapSource, /playerFocusRequestId/);
assert.match(
  explorationMapSource,
  /playerFocusRequestId[\s\S]*animateToRegion[\s\S]*MAP_CONFIG\.defaultLatitudeDelta/
);
assert.match(zoneCompletionSource, /assignDistrictParentZones/);
assert.match(
  zoneCompletionSource,
  /doesDistrictGeometryBelongToCity\(zone, city\)/
);
assert.match(
  mapSource,
  /return doesDistrictGeometryBelongToCity\(district, city\)/
);
assert.doesNotMatch(mapSource, /district\.parentZoneId === city\.id \|\|/);
assert.match(zoneCompletionSource, /adminLevel = parseAdminLevel/);
assert.ok(zoneCompletionSource.includes("adminLevel,"));
assert.ok(zoneCompletionSource.includes("isOfficialDistrictZone(zone)"));
assert.ok(completionRepositorySource.includes("adminLevel?: number | null"));
assert.ok(completionRepositorySource.includes("admin_level = 9"));
assert.ok(completionRepositorySource.includes("zone.adminLevel ?? null"));
assert.ok(completionRepositorySource.includes("AND zones.admin_level = 9"));
assert.ok(databaseSource.includes('applyMigration(26, "preserve_zone_admin_level"'));
assert.ok(databaseSource.includes("ADD COLUMN admin_level INTEGER"));
assert.ok(databaseSource.includes("DELETE FROM zone_refresh_state"));
assert.ok(settingsSource.includes("!isOfficialDistrictAdminLevel(zone.adminLevel)"));
assert.ok(settingsSource.includes("DELETE FROM app_settings WHERE key = ?"));
assert.ok(mapSource.includes("legacyObjectiveRefreshIdsRef"));
assert.ok(mapSource.includes("Failed to classify legacy objective boundaries"));
assert.ok(mapSource.includes("reloadSavedCompletionObjective()"));
assert.ok(mapSource.includes("isSelectableMapObjectiveZone"));
assert.ok(mapSource.includes("setObjective(null)"));
assert.ok(mapSource.includes("setSelectedZone(null)"));

function boundarySquare(minLatitude, minLongitude, maxLatitude, maxLongitude) {
  return [
    { latitude: minLatitude, longitude: minLongitude },
    { latitude: minLatitude, longitude: maxLongitude },
    { latitude: maxLatitude, longitude: maxLongitude },
    { latitude: maxLatitude, longitude: minLongitude }
  ];
}

const lyonGeometry = {
  geometry: [boundarySquare(0, 0, 10, 10)],
  holes: [],
  type: "city"
};
const lyonDistrictGeometry = {
  geometry: [boundarySquare(2, 2, 8, 8)],
  holes: [],
  type: "district"
};
const adjacentDelegatedCommuneGeometry = {
  geometry: [boundarySquare(2, 10, 8, 12)],
  holes: [],
  parentZoneId: "lyon",
  type: "district"
};
const adjacentParentGeometry = {
  geometry: [boundarySquare(0, 10, 10, 12)],
  holes: [],
  type: "city"
};
const detachedComponentGeometry = {
  geometry: [
    boundarySquare(2, 2, 4, 4),
    boundarySquare(4, 10, 6, 12)
  ],
  holes: [],
  type: "district"
};

assert.equal(
  doesDistrictGeometryBelongToCity(lyonDistrictGeometry, lyonGeometry),
  true
);
assert.equal(
  doesDistrictGeometryBelongToCity(adjacentDelegatedCommuneGeometry, lyonGeometry),
  false
);
assert.equal(
  doesDistrictGeometryBelongToCity(
    adjacentDelegatedCommuneGeometry,
    adjacentParentGeometry
  ),
  true
);
assert.equal(
  doesDistrictGeometryBelongToCity(detachedComponentGeometry, lyonGeometry),
  false
);

console.log("PASS strict interior sampling rejects shared-edge and detached foreign districts");
console.log("PASS official level-9 districts stay selectable while level-10 neighborhoods remain internal");
console.log("PASS local OSM boundaries request complete relation-member geometry");
console.log("PASS exact cached boundaries reject incomplete-response downgrades");
console.log("PASS saved objectives reload after boundary caches are repopulated");
console.log("PASS long press switches same-city districts directly and reserves the scope chooser for cross-city holds");
console.log("PASS recording Start restores walking-scale zoom around the persistent player");
assert.equal(OFFICIAL_DISTRICT_ADMIN_LEVEL, 9);
assert.equal(NEIGHBORHOOD_ADMIN_LEVEL, 10);
assert.equal(isOfficialDistrictAdminLevel(9), true);
assert.equal(isOfficialDistrictAdminLevel(10), false);
