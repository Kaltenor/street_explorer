import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildCompletionHydrationZones,
  getPresentedCompletionPercent,
  getPresentedRemainingCells,
  getZoneCompletionRequestKey,
  isZoneCompletionSnapshotValid,
  runZoneCompletionSingleFlight,
  shouldRunExpensiveCompletionMaintenance
} from "../src/services/zoneCompletionLifecycle.ts";

const zone = {
  fetchedAt: "2026-08-27T00:00:00.000Z",
  geometry: [[]],
  holes: [],
  id: "relation/lyon-3",
  name: "Lyon 3e",
  parentZoneId: "relation/lyon",
  source: "openstreetmap",
  type: "district"
};
const city = {
  ...zone,
  id: "relation/lyon",
  name: "Lyon",
  parentZoneId: null,
  type: "city"
};
const completedStats = {
  completedAt: "2026-08-01T00:00:00.000Z",
  completionPercent: 98.3,
  completionStatus: "available",
  directlyWalkedCells: 983,
  exploredCells: 983,
  forbiddenCells: 0,
  inferredCells: 0,
  loopFilledCells: 0,
  permanentlyCompleted: true,
  totalZoneCells: 1000
};
const validSnapshot = {
  calculatedAt: "2026-08-27T00:00:00.000Z",
  explorationRevision: 12,
  geometryFingerprint: "fnv1a:12345678",
  mode: "walk",
  stats: completedStats,
  zoneId: zone.id
};

assert.equal(getPresentedCompletionPercent(completedStats), 100);
assert.equal(getPresentedRemainingCells(completedStats), 0);
console.log("PASS permanent achievements always present 100% with zero cells remaining");

assert.equal(isZoneCompletionSnapshotValid({
  explorationRevision: 12,
  geometryFingerprint: "fnv1a:12345678",
  mode: "walk",
  snapshot: validSnapshot,
  zoneId: zone.id
}), true);
console.log("PASS matching launch snapshots are authoritative without recomputation");

assert.equal(isZoneCompletionSnapshotValid({
  explorationRevision: 13,
  geometryFingerprint: "fnv1a:12345678",
  mode: "walk",
  snapshot: validSnapshot,
  zoneId: zone.id
}), false);
console.log("PASS stale exploration revisions are not authoritative");

assert.equal(shouldRunExpensiveCompletionMaintenance(true), false);
assert.equal(shouldRunExpensiveCompletionMaintenance(false), true);
console.log("PASS active recording defers expensive completion maintenance");

const requestKey = getZoneCompletionRequestKey({
  explorationRevision: 12,
  geometryFingerprint: "fnv1a:12345678",
  mode: "walk",
  zoneId: zone.id
});
let operationCount = 0;
const operation = async () => {
  operationCount += 1;
  await new Promise((resolve) => setTimeout(resolve, 5));
  return completedStats;
};
const [firstResult, secondResult] = await Promise.all([
  runZoneCompletionSingleFlight(requestKey, undefined, operation),
  runZoneCompletionSingleFlight(requestKey, undefined, operation)
]);
assert.equal(operationCount, 1);
assert.equal(firstResult, completedStats);
assert.equal(secondResult, completedStats);
console.log("PASS equivalent completion requests share one in-flight calculation");

assert.deepEqual(
  buildCompletionHydrationZones(zone, { city, district: zone }).map((item) => item.id),
  [zone.id, city.id]
);
console.log("PASS startup hydration includes the saved zone and containing city/district pair once");

assert.equal(getPresentedCompletionPercent({
  ...completedStats,
  completionPercent: 91.7,
  totalZoneCells: 1072
}), 100);
console.log("PASS denominator changes cannot visually regress a permanent achievement");

const mapSource = readFileSync(
  new URL("../src/screens/MapScreen.tsx", import.meta.url),
  "utf8"
);
const completionSource = readFileSync(
  new URL("../src/components/CompletionModal.tsx", import.meta.url),
  "utf8"
);

assert.doesNotMatch(
  mapSource,
  /\[isLaunchDismissed, loopFillCellIds, objective, objectiveClosureRevision, walks\]/
);
assert.match(
  mapSource,
  /shouldRunExpensiveCompletionMaintenance\(\s*isRecording \|\| isComputingRecording/
);
assert.match(mapSource, /hydrateObjectiveZonesIntoCache\(\s*hydrationZones/);
const launchHydrationSource = mapSource.slice(
  mapSource.indexOf("const selectLaunchObjective = async"),
  mapSource.indexOf("useEffect(() => {", mapSource.indexOf("const selectLaunchObjective = async") + 1)
);
assert.doesNotMatch(launchHydrationSource, /calculateZoneCompletionSnapshot/);
assert.doesNotMatch(launchHydrationSource, /fetchNearbyOsmZonesWithDebug/);
assert.match(completionSource, /calculateZoneCompletionSnapshot\(\s*selectedZone/);
assert.doesNotMatch(completionSource, /for \(const zone of orderedZones\)/);
console.log("PASS map and Completion source wiring avoids active-walk and all-zone scans");
