# Resilience audit follow-up — 0.34.3

Date: 2026-09-22. Previous version: 0.34.2 / build 223. New version: 0.34.3 / build 224.

Current follow-up: 0.34.4 / build 225 retires expeditions. The audit measurements below remain those captured for 0.34.3. See [the removal protocol](TESTING.md#expedition-removal--0344) for upgrade and legacy-backup checks.

## Implemented

| Area | Change | Limits |
| --- | --- | --- |
| Startup | Local readiness precedes optional medal loading; initial hydration skips pending route repairs, which resume after dismissal. Failed essential reads offer Retry. Refresh generations reject stale publications. | A map can initially show cached, incomplete derived coverage while repairs finish. Native readiness and failure presentation need device validation. |
| Network | Deadlines remain active through body consumption and support cancellation. Street requests retain retryable-error fallback. Boundary and POI requests are bounded. Country packs stream with a descriptor-sized limit and retain verification/atomic installation. | Offline restore still requires already-installed foreign-country packs referenced by the archive. |
| Restore/progression | Rebuild street completion dates from the first historical cumulative 90% threshold crossing, ordered by finalized session end time. Migration 36 invalidates previous rebuild-time dates and schedules reconstruction. Restore cancels/awaits the existing street rebuild. | Current cached street geometry determines reconstructed coverage. Expedition state is removed by the subsequent migration 37. |
| Large histories | Rebuild one session at a time. Skip raw GPS reads when only frozen routes are needed. Keep sampled topology corridors instead of every raw route. | Sampled corridors, all street segments, and aggregate coverage still grow with history; a single exceptionally large session can still be expensive. |
| Live map | Retain saved boundary edges and update active-cell neighbors. Cache saved city/countryside classification; avoid rebuilding unchanged partitions on revisits. | Initial boundary indexing, full merged polygon generation, and large-hole enumeration remain synchronous. |
| Backup | Yield between inspection, read, and write records without weakening checksum/footer validation. | Decompression, JSON parsing, and validation within an individual record are still synchronous. No format change was made. |
| Migrations | Dedicated connection, atomic schema changes plus ledger insertion, rollback on failure. Recover legacy partial loop-fill replacement tables. | Native connection lifecycle and termination require physical-device testing. |
| Completion cancellation | A new consumer cannot attach to an aborted shared calculation. | Native rapid-navigation testing remains required. |
| GPS journal | Publish delivered batches before any database await; use in-memory hints or the existing unique-session/time-window fallback. | iOS delivery guarantees and termination behavior cannot be proven by desktop tests. |

## Measurements

Synthetic Node 24 desktop fixture: a contiguous saved grid, then five adjacent active-cell additions. Both implementations produced equivalent fill sets.

| Saved cells | Full closure recomputation | Incremental update | One-time incremental initialization |
| ---: | ---: | ---: | ---: |
| 10,000 | 6.22–9.89 ms | 0.73–1.22 ms | 9.10 ms |
| 50,000 | 27.44–33.17 ms | 0.87–1.59 ms | 42.95 ms |
| 100,000 | 60.77–66.84 ms | 1.02–1.48 ms | 71.92 ms |

These figures are not iPhone frame-time or memory measurements. Sparse/disconnected territory and complex holes have different costs. The original inspection fixture (100 walks / 200,000 points) blocked the desktop event loop for 306 ms; the new regression proves inter-record timer progress, not a particular device latency or faster total import time.

## Automated validation

`npm run test:resilience` uses actual TypeScript services and synthetic inputs. It checks stalled-body timeouts/fallback, pre-cancellation, cancellation/retry, 1,200 incremental/full geometry comparisons plus resets, historical completion thresholds and SQLite writes, migration interruption/rollback/retry, legacy partial-copy recovery, complete schema initialization, and backup yielding/corruption rejection. SQLite uses an in-memory Node adapter; this does not emulate Expo's native connection implementation or process termination.

Validation completed on 2026-09-22: `npm test` passed, including typecheck, all existing regression scripts, and the new resilience suite. The final offline `npx expo export --platform ios --output-dir <temporary-directory>` passed (1,323 modules, 30 assets, 5.92 MB Hermes bundle). `git diff --check` passed. Physical-iPhone checks have not been performed. No remote EAS build is necessary solely for these changes; use a compatible SDK 54 development client for Metro testing.

## Expedition removal validation — 0.34.4

Version 0.34.3 / build 224 becomes 0.34.4 / build 225. Expeditions, score bonuses, journal/HUD/navigation, runtime queries, and unused repository helpers are removed. Migration 37 drops the three legacy tables atomically; old migrations remain for upgrade compatibility. Shared reward artwork and audio remain in use by exploration and were retained.

The complete npm test aggregate and offline iOS export passed after removal (1,317 modules, 30 assets, 5.85 MB Hermes bundle). In-memory SQLite tests exercised interrupted cleanup and retry, fresh initialization, reopening, actual legacy restore/export with walks/GPS/medals/achievements/Forbidden Zones, restore rollback, and delete-all after table removal. No real backup or app database was touched. Native iPhone checks remain outstanding, as documented in [Testing](TESTING.md).

## Remaining work, in priority order

1. **Device integrity and recovery validation:** execute the protocol below, particularly restore interruption, migration upgrades, cold background callbacks, and missing-country-pack startup. Do not claim native safety solely from desktop SQLite adapters.
2. **Real-history memory/frame-time profiling:** measure startup, restoring the user's typical history, beginning a walk, closure, and Stop. Full polygon rebuilds, boundary initialization, and aggregate street coverage are the remaining likely cost centers. Optimize against measured traces rather than broad rewrites.
3. **Large individual backup records:** adopt a compatible chunking/streaming design if per-record latency or memory is excessive on device. Current yielding does not split one huge walk or a large manifest.
4. **Offline foreign-pack restore:** archives carry medal state but not downloadable catalogues. Self-contained restore would need catalogue inclusion or a deferred unresolved-medal design; this release retains preflight failure before data replacement when required packs are unavailable.

## Physical-iPhone protocol

Prerequisites: compatible SDK 54 development client running 0.34.4; a disposable test profile/device; an externally verified V5 backup; sufficient free space; known history/medal counts. Use precise foreground and Always location permission for recording checks. Internet is needed for missing packs; repeat applicable checks offline. Keep the only copy of real walks out of interruption tests.

1. Cold-launch with a large saved history, then repeat with the network disabled. Expected: the map becomes usable from local data without waiting for optional medal downloads; pending route repairs can finish afterward.
2. On a test profile with a selected downloadable city and missing pack, use a stalled/poor connection. Expected: local map access remains available; download times out without installing partial data; the existing Retry action succeeds after connectivity returns.
3. Export a multi-record backup, verify its external Files copy, and restore it. Expected: UI continues updating between records; counts, names, frozen routes, medals, zone achievements, and Forbidden Zones match the baseline; retired expedition state does not return. Reopen offline and confirm persistence.
4. On the disposable profile, terminate during restore and reopen. Expected: either the original dataset or the complete committed replacement remains, never a mixture. Derived cache repair may still be pending.
5. Rebuild street completion twice after restore. Expected: historical completion dates and coverage remain stable; rebuilding does not invent recent progress.
6. Start a walk in a large-history area, revisit saved cells, explore new cells, close a loop across previously saved territory, and pan the map. Expected: correct fill/score with no persistent holes, duplicate awards, or route disappearance. Capture slow-path timings and device memory if visible stalls remain.
7. Lock the phone during recording, reopen, and Stop. Repeat recovery on the disposable profile after termination. Expected: delivered GPS batches recover to the correct session and finalization produces one saved walk. Inspect ambiguous/gap cases instead of assuming iOS redelivered every fix.
8. Switch completion objectives rapidly while calculations are running. Expected: the final selection obtains a result without inheriting an earlier cancellation.
9. Upgrade a disposable older-schema database, including expedition child evidence. Expected: migration completes with walks, medals, and completion preserved and retired expedition tables removed; interrupted schema work retries safely. This test needs a prepared legacy database, not a production-profile downgrade.
