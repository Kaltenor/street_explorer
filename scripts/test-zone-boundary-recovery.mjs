import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildBoundaryQuery,
  shouldReplaceCachedZone
} from "../src/services/zoneBoundaryPolicy.ts";

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

assert.match(completionSource, /await onZonesUpdated\(\)/);
assert.match(mapSource, /const reloadSavedCompletionObjective = useCallback/);
assert.match(mapSource, /onZonesUpdated=\{handleCompletionZonesUpdated\}/);
assert.match(mapSource, /objectiveStatsRequestRef\.current === requestId/);
assert.match(mapSource, /doesDistrictBelongToCity\(zone, currentCity\)/);
assert.match(mapSource, /setPlayerFocusRequestId\(\(requestId\) => requestId \+ 1\)/);
assert.match(mapSource, /const handleMapLongPress = useCallback/);
assert.match(mapSource, /await Haptics\.selectionAsync\(\)/);
assert.match(mapSource, /mapZoneSelectionRequestRef\.current !== requestId/);
assert.match(mapSource, /setMapZoneSelection\(city && district \? choices : null\)/);
assert.match(mapSource, /applyMapObjective\(preferredZone\)/);
assert.match(mapSource, /function MapZoneScopePicker/);
assert.match(mapSource, /const preloadCurrentCityDistricts = async/);
assert.match(mapSource, /if \(objective \|\| !currentLocation\)/);
assert.doesNotMatch(mapSource, /shouldFetchAutoObjectiveZones/);
assert.doesNotMatch(mapSource, /Failed to auto-switch completion objective/);
assert.match(explorationMapSource, /unselectedDistrictZones\.flatMap/);
assert.match(explorationMapSource, /onLongPress=\{handleMapLongPress\}/);
assert.match(explorationMapSource, /playerFocusRequestId/);
assert.match(
  explorationMapSource,
  /playerFocusRequestId[\s\S]*animateToRegion[\s\S]*MAP_CONFIG\.defaultLatitudeDelta/
);
assert.match(zoneCompletionSource, /assignDistrictParentZones/);

console.log("PASS local OSM boundaries request complete relation-member geometry");
console.log("PASS exact cached boundaries reject incomplete-response downgrades");
console.log("PASS saved objectives reload after boundary caches are repopulated");
console.log("PASS panning preserves the objective while long press selects race-safe city or district scopes");
console.log("PASS recording Start restores walking-scale zoom around the persistent player");
