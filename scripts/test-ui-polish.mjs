import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  classifyGpsUiStatus,
  GPS_UI_THRESHOLDS
} from "../src/services/gpsStatus.ts";

const NOW = Date.parse("2026-08-02T12:00:00.000Z");

function status(overrides = {}) {
  return classifyGpsUiStatus({
    accuracyMeters: 8,
    fixTimestamp: "2026-08-02T11:59:58.000Z",
    isRecording: true,
    locationResolved: true,
    nowMs: NOW,
    permissionState: "granted",
    ...overrides
  });
}

assert.equal(status({ permissionState: "unknown" }).state, "acquiring");
assert.equal(status().state, "good");
assert.equal(status({ accuracyMeters: GPS_UI_THRESHOLDS.goodAccuracyMeters + 1 }).state, "weak-stale");
assert.equal(status({ fixTimestamp: "2026-08-02T11:59:40.000Z" }).reason, "stale-fix");
assert.equal(status({ permissionState: "denied" }).state, "denied");
assert.equal(status({ fixTimestamp: null }).state, "unavailable");
assert.equal(
  status({ fixTimestamp: null, locationResolved: false }).state,
  "acquiring"
);

const mapSource = readFileSync(new URL("../src/components/ExplorationMap.tsx", import.meta.url), "utf8");
const atlasSource = readFileSync(new URL("../src/components/AtlasCabinet.tsx", import.meta.url), "utf8");
const completionSource = readFileSync(new URL("../src/components/CompletionModal.tsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../src/components/WalkHistoryModal.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../src/screens/MapScreen.tsx", import.meta.url), "utf8");
const themeSource = readFileSync(new URL("../src/constants/theme.ts", import.meta.url), "utf8");

assert.ok(existsSync(new URL("../assets/ui/atlas-paper-texture.png", import.meta.url)));
assert.ok(existsSync(new URL("../assets/sounds/atlas-page.wav", import.meta.url)));
assert.ok(existsSync(new URL("../assets/sounds/atlas-stamp.wav", import.meta.url)));

assert.match(mapSource, /WALKING_COLORS\.activeRoute/);
assert.match(mapSource, /WALKING_COLORS\.selectedRoute/);
assert.match(historySource, /Route quality/);
assert.match(mapSource, /mapType=\{Platform\.OS === "ios" \? "mutedStandard" : "standard"\}/);
assert.match(mapSource, /userInterfaceStyle=\{Platform\.OS === "ios" \? "dark" : undefined\}/);
assert.match(mapSource, /showsPointsOfInterest=\{false\}/);
assert.match(mapSource, /showsUserLocation=\{false\}/);
assert.match(mapSource, /AtlasRouteMarker/);
assert.match(mapSource, /AtlasMedalMarker/);
assert.doesNotMatch(mapSource, /pinColor=/);
assert.match(themeSource, /exploredArea: "rgba\(251, 146, 60, 0\.46\)"/);
assert.match(themeSource, /cityBoundary: "#dc2626"/);
assert.match(themeSource, /districtBoundary: "#b45309"/);
assert.match(mapSource, /selectedZone\.type === "city"/);
assert.match(mapSource, /strokeColor="rgba\(180, 83, 9, 0\.72\)"/);
assert.match(mapSource, /strokeWidth=\{2\}/);
assert.match(mapSource, /strokeWidth=\{6\}/);
assert.match(historySource, /technicalVisible/);
assert.match(summarySource, /summaryQualityPanel/);

assert.match(atlasSource, /isReduceMotionEnabled/);
assert.match(atlasSource, /atlas-paper-texture\.png/);
assert.match(atlasSource, /atlas-page\.wav/);
assert.match(atlasSource, /atlas-stamp\.wav/);
assert.match(atlasSource, /duration: 240/);
assert.match(completionSource, /<AtlasScreen visible=\{visible\}>/);
assert.match(historySource, /<AtlasScreen visible=\{visible\}>/);
assert.match(summarySource, /N\\u00c9CESSAIRE DU CARTOGRAPHE/);
assert.match(summarySource, /CARNET DE L'EXPLORATEUR/);
assert.match(summarySource, /<AtlasStamp/);
assert.match(mapSource, /setIsInkRevealing/);
assert.match(mapSource, /highlightedRouteDrawProgress/);
assert.match(mapSource, /drawProgress=\{isHighlighted/);
console.log("PASS GPS UI classifies acquiring, good, weak/stale, denied, and unavailable states");
console.log("PASS map paths use the shared semantic walking palette");
console.log("PASS iOS map uses the Midnight Cartographer basemap, territory, and marker treatment");
console.log("PASS route details and recording summaries use summary-first quality cards");
console.log("PASS Atlas Cabinet menus, assets, Reduce Motion, stamps, and ink effects are wired");
