# Maintenance audit — 0.35.9

Date: 2026-09-29. Initial working tree was clean. Version 0.35.8 / build 238 becomes 0.35.9 / build 239 across package, lockfile and Expo metadata. No commit, staging, remote build, deployment or user-data replacement was performed.

## Baseline and scope

Reviewed geometry/exploration, GPS lifecycle and persistence, network requests, country-pack loading, preference writes, backup import/export/migrations, Wikipedia resolution and obsolete declarations. Baseline typecheck and focused suites passed except an obsolete completion-stamp UI assertion and the medal-plan current-version reference (still 0.35.7). Both now reflect the existing product contract rather than weakening validation.

## Confirmed corrections

- Large loop components: a 450 by 300 solid cell fixture (135,000 cells) exhausted the JavaScript argument stack in spread-based bounds. Iterative bounds remove that limit; flood traversal queues each cell once and scans component members instead of repeatedly scanning the entire history.
- Enclosed-cell enumeration: orthogonal scanline intersections replace point-in-polygon tests for every candidate cell. Group ordering, capped enumeration, concave/negative coordinates and islands retain regression coverage.
- Date line: two nearby positions across +/-180 degrees previously implied approximately 40,075 km of Mercator sampling (millions of iterations). Short wrapped sampling now produces two local edge polygons. Wrapped enclosure connectivity is still unsupported.
- GPS journal: transient file read/promotion errors formerly quarantined valid points. Only invalid JSON/schema is now quarantined; I/O failures retain files for retry.
- GPS validation: even the first point requires a valid date and in-range finite coordinates; accuracy must be nonnegative and finite or null. V5 raw and inferred import records apply equivalent checks before replacement, including archives with valid checksums but invalid data.
- Street network: HTTP 200 Overpass runtime-error/partial payloads no longer populate the cache as complete data; the retryable path uses the second endpoint.
- Preferences: serialized persistence precedes publishing language, appearance, sound and haptics. Failure preserves the prior displayed/global state and reports the error.
- Foreground location: React effect replay re-enables lookup/watch; stale failure callbacks cannot publish into a new lifecycle.
- Recording/data tools: the two-frame yield has a 150 ms timer fallback, background-stop rejection is observed immediately, and Start/Resume cannot overlap data tools. Restore admission rechecks recording/start/stop refs.
- Wikipedia: independent language failures retain successful articles; concurrent requests share a city-aware cache key and offline/search fallbacks are retryable.
- Country packs: validated checksum-addressed objects are reused in memory; new downloads remain fully validated. Three repeated accesses cause one read/decode in the regression harness.

## Cleanup

Removed compiler-confirmed unused imports, private formatting/geometry helpers and obsolete DetailsModal properties. No reachable feature, persisted schema, catalogue, or asset was removed. The stricter TypeScript unused-local/parameter check passes; this does not prove every exported module is reachable.

## Performance evidence

Node v24.15.0, public collectEnclosedExplorationCellGroups, 300 by 300 cell perimeter, 88,804 enclosed cells, one warm-up and median of five runs: baseline **358.9 ms**, current **14.0 ms** (approximately **25.6x** on this fixture). One hundred deterministic irregular grids preserve exact groups and order. This is a desktop algorithm benchmark, not a phone FPS/startup claim.

Reproduce current timing with node scripts/benchmark-exploration-audit.js. To compare the original source, save git show of the pre-maintenance src/services/explorationArea.ts to a temporary UTF-8 .ts file and pass --baseline followed by its path. At handoff HEAD still represents that baseline.

## Validation

- TypeScript typecheck and additional --noUnusedLocals --noUnusedParameters: passed.
- Focused geometry, UI lifecycle, backup, Wikipedia, resilience and map-provider checks: passed.
- Aggregate npm test: passed, including all configured regression suites and documentation checks.
- Offline local iOS export: passed, 1,324 modules, 5.88 MB Hermes bundle. Sandbox process spawning initially failed; an authorized local retry compiled successfully. No remote build was started.
- Physical device tests: not run. Follow [Testing](TESTING.md#maintenance-audit--0359).

## Remaining work, prioritized

1. Device validation: background/foreground Stop, native GPS journal recovery, Files restore, permission changes and actual map rendering on Apple/Google providers. Timers cannot execute while the operating system fully suspends the app; the fallback prevents dependence on frame callbacks once JavaScript runs again.
2. Real-history profiling: measure phone memory/frame times at launch, during a long walk, closure and finalization. Full polygon building and individual backup-record decompression remain synchronous.
3. Cross-date-line enclosure topology remains unsupported; this release fixes local path sampling only.
4. Follow-up: version 0.35.10 now compares the full verified manifest before yielding restore blocks, closing the earlier same-ID metadata-replacement gap.

Documentation refreshed: README, Architecture, Project Overview, Roadmap, Development Build, Testing, Changelog, Country Packs, the historical medal contract version, and Audit Followup. No new product feature was introduced.
