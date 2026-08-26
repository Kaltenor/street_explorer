import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const prefetchSource = readFileSync(
  new URL("../src/services/launchCompletionPrefetch.ts", import.meta.url),
  "utf8"
);

assert.match(appSource, /prefetchLaunchCompletion/);
assert.match(appSource, /!isMapLaunchReady/);
assert.match(appSource, /isLaunchCompletionPrefetchReady/);
assert.match(
  appSource,
  /isReady=\{[\s\S]*isMapLaunchReady &&[\s\S]*isLaunchCompletionPrefetchReady[\s\S]*\}/
);
assert.match(prefetchSource, /getSavedCompletionObjective/);
assert.match(prefetchSource, /getSavedPlayerLocation/);
assert.match(prefetchSource, /getZoneCompletionSnapshot/);
assert.match(prefetchSource, /getZoneAchievement/);
assert.match(prefetchSource, /saveCachedZoneTotal/);
assert.match(prefetchSource, /completionPercent: 100/);
assert.match(prefetchSource, /getExploredCellRecordsWithinBounds/);
assert.doesNotMatch(prefetchSource, /fetchNearbyOsmZones/);

console.log("Launch completion prefetch regression checks passed.");
