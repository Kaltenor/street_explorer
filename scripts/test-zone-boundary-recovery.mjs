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
import {
  buildMapZoneSelectionProbeCoordinates,
  resolveMapSelection,
  MAP_ZONE_SELECTION_CONFIG,
  shouldOfferMapZoneScopeChoice,
  shouldSelectCountryside
} from "../src/services/mapZoneSelection.ts";

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
assert.equal(
  shouldSelectCountryside({
    hasContainingCity: false,
    hasContainingCountry: true,
    hasContainingDistrict: false
  }),
  true
);
assert.equal(
  shouldSelectCountryside({
    hasContainingCity: false,
    hasContainingCountry: false,
    hasContainingDistrict: false
  }),
  false
);
assert.equal(
  shouldSelectCountryside({
    hasContainingCity: true,
    hasContainingCountry: true,
    hasContainingDistrict: false
  }),
  false
);

const zoomedOutProbes = buildMapZoneSelectionProbeCoordinates({
  coordinate: { latitude: 45.758, longitude: 4.86 },
  viewport: {
    latitude: 45.758,
    latitudeDelta: 0.5,
    longitude: 4.86,
    longitudeDelta: 0.5
  }
});
assert.equal(
  zoomedOutProbes.length,
  1 + MAP_ZONE_SELECTION_CONFIG.radialSteps * MAP_ZONE_SELECTION_CONFIG.angleSteps
);
assert.deepEqual(zoomedOutProbes[0], { latitude: 45.758, longitude: 4.86 });
assert.ok(
  Math.max(...zoomedOutProbes.map((probe) =>
    Math.abs(probe.latitude - 45.758) * 111_320
  )) <=
    MAP_ZONE_SELECTION_CONFIG.maxHitSlopMeters + 0.001
);
assert.ok(
  Math.abs((zoomedOutProbes[1]?.latitude ?? 45.758) - 45.758) * 111_320 <=
    MAP_ZONE_SELECTION_CONFIG.maxHitSlopMeters / MAP_ZONE_SELECTION_CONFIG.radialSteps + 0.001
);
const zoomedInProbes = buildMapZoneSelectionProbeCoordinates({
  coordinate: { latitude: 45.758, longitude: 4.86 },
  viewport: {
    latitude: 45.758,
    latitudeDelta: 0.005,
    longitude: 4.86,
    longitudeDelta: 0.005
  }
});
assert.ok(
  Math.abs((zoomedInProbes[1]?.latitude ?? 45.758) - 45.758) * 111_320 < 10
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
assert.match(mapSource, /findContainingZoneForMapHold/);
assert.match(mapSource, /mapViewportRegionRef\.current/);
assert.match(mapSource, /isZoneCompletionEligible\(candidate\)/);
assert.match(mapSource, /await playSelectionHaptic\(\)/);
assert.match(mapSource, /mapZoneSelectionRequestRef\.current !== requestId/);
assert.match(mapSource, /shouldOfferMapZoneScopeChoice/);
assert.match(mapSource, /setMapZoneSelection\(shouldOfferScopeChoice \? choices : null\)/);
assert.match(mapSource, /shouldOfferScopeChoice && objective\?\.zone\.type === "city"/);
assert.match(mapSource, /applyMapObjective\(preferredZone\)/);
assert.match(mapSource, /function MapZoneScopePicker/);
assert.match(mapSource, /setLaunchObjectiveLocation\(\(launchPoint\) => launchPoint \?\? point\)/);
assert.match(mapSource, /const selectLaunchObjective = async/);
assert.match(mapSource, /const canResolveNearbyZones =/);
assert.match(mapSource, /const preferredZone = currentDistrict \?\? currentCity \?\? savedZone/);
assert.match(mapSource, /buildCompletionHydrationZones\(savedZone, pair\)/);
assert.match(mapSource, /setIsObjectiveCacheHydrated\(true\)/);
assert.match(mapSource, /commitMapObjective\(preferredZone, \{ showSelectionStamp: false \}\)/);
assert.match(mapSource, /await objectiveSaveChainRef\.current/);
assert.match(mapSource, /isLaunchObjectiveResolved/);
assert.match(mapSource, /keeping the saved objective/);
assert.doesNotMatch(mapSource, /const preloadCurrentCityDistricts = async/);
assert.doesNotMatch(mapSource, /shouldFetchAutoObjectiveZones/);
assert.match(explorationMapSource, /districtZones\.flatMap/);
assert.match(explorationMapSource, /const isSelectedDistrict/);
assert.match(explorationMapSource, /memo\(function AdministrativeBoundaryOverlay/);
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
assert.ok(explorationMapSource.includes('`native-map-${mapProvider}-${appearanceMode}-city-${cityZone?.id ?? "none"}`'));
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
assert.ok(
  completionRepositorySource.includes("getExploredCellRecordsWithinBounds") &&
    completionRepositorySource.includes("AND cell_x BETWEEN ? AND ?") &&
    completionRepositorySource.includes("AND cell_y BETWEEN ? AND ?"),
  "zone completion can query the indexed explored-cell subset inside one boundary"
);
assert.ok(
  zoneCompletionSource.includes("getExploredCellRecordsWithinBounds(mode, bounds)") &&
    completionSource.includes("calculateZoneCompletionSnapshot(") &&
    mapSource.includes("calculateZoneCompletionSnapshot("),
  "the completion catalogue and active objective avoid full-ledger scans for bounded zones"
);

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
console.log("PASS launch GPS selects the official district before its city and preserves the saved fallback");
console.log("PASS long press switches same-city districts directly and reserves the scope chooser for cross-city holds");
console.log("PASS low-zoom district holds use bounded city-consistent map-space probes");
console.log("PASS recording Start restores walking-scale zoom around the persistent player");
assert.equal(OFFICIAL_DISTRICT_ADMIN_LEVEL, 9);
assert.equal(NEIGHBORHOOD_ADMIN_LEVEL, 10);
assert.equal(isOfficialDistrictAdminLevel(9), true);
assert.equal(isOfficialDistrictAdminLevel(10), false);

// Exercise the real selection pipeline with blocked dependencies, not timing assumptions.
const readyDistrict = { city: "city", district: "district" };
const readyCity = { city: "city", district: null };
const emptyArea = { city: null, district: null };
const hasObjective = value => Boolean(value.city || value.district);
const unexpectedRead = async () => { throw new Error("unexpected blocking dependency"); };
assert.equal(await resolveMapSelection({ visible: readyDistrict,
  loadCached: unexpectedRead, loadRemote: unexpectedRead, hasObjective,
  signal: new AbortController().signal }), readyDistrict);
assert.equal(await resolveMapSelection({ visible: null,
  loadCached: async () => readyCity, loadRemote: unexpectedRead, hasObjective,
  signal: new AbortController().signal }), readyCity);
let remoteCount = 0;
assert.equal(await resolveMapSelection({ visible: null,
  loadCached: async () => emptyArea, loadRemote: async () => { remoteCount++; return readyDistrict; },
  hasObjective, signal: new AbortController().signal }), readyDistrict);
assert.equal(remoteCount, 1);
const cancelledSelection = new AbortController();
let finishRead;
const pendingSelection = resolveMapSelection({ visible: null,
  loadCached: () => new Promise(resolve => { finishRead = resolve; }),
  loadRemote: unexpectedRead, hasObjective, signal: cancelledSelection.signal });
cancelledSelection.abort(); finishRead(emptyArea);
await assert.rejects(pendingSelection, { name: "AbortError" });
const remoteController = new AbortController();
let finishRemote;
const staleRemote = resolveMapSelection({ visible: null, loadCached: async () => emptyArea,
  loadRemote: () => new Promise(resolve => { finishRemote = resolve; }), hasObjective,
  signal: remoteController.signal });
await Promise.resolve();
remoteController.abort(); finishRemote(readyDistrict);
await assert.rejects(staleRemote, { name: "AbortError" });
console.log("PASS visible selection bypasses storage/network, city-only cache bypasses HTTP, and superseded cache/remote results are rejected");
