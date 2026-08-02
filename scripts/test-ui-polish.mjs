import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
const historySource = readFileSync(new URL("../src/components/WalkHistoryModal.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../src/screens/MapScreen.tsx", import.meta.url), "utf8");

assert.match(mapSource, /WALKING_COLORS\.activeRoute/);
assert.match(mapSource, /WALKING_COLORS\.selectedRoute/);
assert.match(historySource, /Route quality/);
assert.match(historySource, /technicalVisible/);
assert.match(summarySource, /summaryQualityPanel/);

console.log("PASS GPS UI classifies acquiring, good, weak/stale, denied, and unavailable states");
console.log("PASS map paths use the shared semantic walking palette");
console.log("PASS route details and recording summaries use summary-first quality cards");
