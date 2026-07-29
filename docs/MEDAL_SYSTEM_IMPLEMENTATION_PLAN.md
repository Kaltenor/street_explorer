# Landmark Medal System Implementation Plan

## Status and scope

This document began as the pre-implementation audit and now also records the decisions implemented in v0.4.0. The original findings remain as design rationale.

Post-implementation maintenance through v0.6.3 keeps Backup V3 route snapshots and medal state intact, exports visible finalized recordings without hidden underfilled recovery tombstones, writes the shared JSON file asynchronously, preserves Unicode landmark copy, stabilizes the iOS category-chip layout, and aligns medal acquisition with normal gameplay loops.

## v0.6.3 non-medal finalization fix

v0.6.3 keeps the medal rules and persistence schema unchanged. Normal Stop now returns its report immediately after durable recording finalization, and continuous routes skip unrelated street-corridor inference; the idempotent medal safety evaluation continues asynchronously with route/exploration repair and refresh, while live awards remain immediate during the walk.

## v0.6.2 non-medal rendering fix

v0.6.2 replaces the flickering nested player-marker view with precomposed native annotation images and smooths its coordinate through `AnimatedRegion`. This changes no landmark catalogue, enclosure, award, evidence, presentation queue, or Backup V3 medal behavior.

## v0.6.1 non-medal maintenance note

v0.6.1 changes only the map player presentation and location-marker lifecycle: a CC0 four-direction walking sprite replaces the static player image, and the last trustworthy position remains visible with a stale-GPS state through interruptions and recording transitions. Medal qualification, catalogue content, evidence, collection state, and Backup V3 medal behavior are unchanged.

## v0.6.0 collection-and-presentation amendment

The collection now renders every filtered catalogue as permanent Unlocked and Locked sections rather than one sorted stream. Counts stay visible even when a section is empty, catalogue order is stable inside each section, unlocked cards show their full descriptions, and locked cards stay compact.

The map exposes album progress through a persistent city card and replaces the three duplicate layer shortcuts with one flag that toggles the saved district-objective card. Layer switches remain available in Options. The navy/gold Medal visual language now governs all primary UI surfaces, while technical Completion and History information is hidden from the default path but remains reachable through maintenance or expandable diagnostic controls.

## v0.5.1 collection-order amendment

The collection UI filters the frozen catalogue first and then performs a stable collected-first sort. Earned medals therefore appear before locked medals in All and every category, while original catalogue order is retained inside both groups.

## v0.5.0 gameplay-alignment amendment

A physical field test around Institut Lumière exposed that the shipped v0.4 strict evaluator could reject a loop that the exploration map visibly accepted. The v0.5.0 product decision supersedes the original strict-proof recommendations below wherever they conflict:

- medal enclosure uses the normal exact-contour-first, one-cell seam-tolerance loop algorithm;
- the minimum walked distance remains 80m and the area cap now matches walking gameplay at 150,000m2;
- accepted active GPS cells evaluate in real time, while finalized confirmed and validated inferred route cells are evaluated again at Stop/recovery;
- a newly walked qualifying loop can award over previously mapped or previously enclosed ground, and the unique database key still prevents duplicates;
- an award persists even if its active recording is discarded, with the acquisition event's session reference becoming null;
- the reveal rotates in 3D, shows localized description copy, and flies into the measured Medal tab after Continue;
- a one-time gameplay-v2 repair rechecks each saved recording missed by v0.4 without replacing the separate explicit cumulative historical scan.

The original audit and v0.4.0 decision record remain below as historical rationale, not as the current runtime contract.

- Audited working-tree version: `0.3.68` (`package.json:3`).
- Synchronized declarations observed: `package-lock.json:3`, `package-lock.json:9`, `app.json:5`, iOS build `68` at `app.json:18`, and Android version code `68` at `app.json:34`.
- The repository is on Expo SDK 54 with React Native, TypeScript, `expo-sqlite`, `expo-location`, `expo-task-manager`, and `react-native-maps` (`package.json`; `docs/ARCHITECTURE.md:3-13`).
- The app is walking-only at the TypeScript and UI boundary: `ActivityMode` is the singleton type `"walk"` (`src/types/walk.ts:1`) and `MapScreen` fixes the active profile to `"walk"` (`src/screens/MapScreen.tsx:373`).
- The audit itself did not increment the version; the implemented feature release synchronizes version 0.4.0 with iOS build 69 and Android version code 69.
- Existing unstaged work in the repository was treated as authoritative and preserved.

Implementation decision record for v0.4.0:

- GPS points without accuracy are excluded from medal proof only; ordinary exploration behavior is unchanged.
- SDK 54-compatible expo-audio and expo-haptics provide presentation feedback with silent/reduced-motion fallbacks.
- The final Lyon v1 roster is the reviewed 20-landmark list in assets/medals/lyon-v1.json.
- Normal collection uses cumulative policy B, explicit opt-in historical scanning uses policy D, anchors require exact strict interior, inferred cells and loop tolerance never count, and the medal enclosure cap is 100,000m2.

The non-negotiable product rule is:

> A medal is collected only when trusted walked coverage forms a valid closed enclosure whose strict interior contains the medal's reviewed capture target. Proximity is never sufficient.

The recommended default policy is:

1. Normal awards use **policy B**: a newly finalized recording may combine with trusted direct-GPS coverage from earlier recordings, but the new recording must cause the enclosure to transition from open to closed.
2. Existing historical enclosures do **not** award medals silently when a new album appears.
3. **Policy D** is offered once per frozen album version as an explicit, user-confirmed historical scan. Awards from that scan are marked `retroactive`.
4. Policy B and explicit policy D were confirmed for v0.4.0; A and C are not used.

## 1. Current architecture findings

### Application shell and navigation

- `App` initializes SQLite with `initDatabase()` and renders a single `MapScreen` after language loading (`App.tsx:15-64`).
- There is no navigation library. History, Completion, Options, Details, diagnostics, recording recovery, and result views are React Native `Modal` components. Full-screen panels use `presentationStyle="fullScreen"`, for example `OptionsModal` at `src/screens/MapScreen.tsx:3490-3595` and `DetailsModal` at `src/screens/MapScreen.tsx:3627-3734`.
- A Medals screen should initially follow this convention rather than introduce a navigation dependency.

### Shared types and configuration

- GPS points, sessions, active recording state, route segments, and lifetime statistics live in `src/types/walk.ts`.
- `RenderedRouteSegment` distinguishes `confirmed` from `inferred`; `LiveRouteChunk` is confirmed-only (`src/types/walk.ts:15-27`).
- The walking GPS profile accepts accuracy up to 30 m, speeds up to 4 m/s, and movements from 1 m (`src/constants/config.ts:17-30`).
- `APP_VERSION` is read from `package.json`, so UI version labels follow the canonical version (`src/constants/config.ts:1-5`).
- The exploration grid is a 15 m Web Mercator grid (`src/services/explorationArea.ts:5-11`).

### SQLite and repository conventions

- `getDatabase()` opens `street_explorer.db`; `initDatabase()` serializes initialization (`src/database/db.ts:7-36`).
- Initialization enables WAL and foreign keys, creates `schema_migrations`, and applies numbered migrations through `applyMigration()` (`src/database/db.ts:38-50`, `397-414`).
- Schema names are plural snake_case; column names are snake_case; TypeScript repository types are camelCase. New medal persistence should follow that convention.
- Current tables are:
  - `walk_sessions`, `gps_points` (`src/database/db.ts:52-76`);
  - `app_settings` (`src/database/db.ts:96-103`);
  - `osm_street_segments` (`src/database/db.ts:117-133`);
  - `zones`, `explored_cells`, `loop_fills` (`src/database/db.ts:142-184`);
  - `zone_cell_totals` (`src/database/db.ts:193-203`);
  - `route_snapshots` (`src/database/db.ts:262-284`);
  - `pending_recording_repairs` (`src/database/db.ts:291-299`);
  - `gps_observations` (`src/database/db.ts:324-349`);
  - `pending_recording_discards` (`src/database/db.ts:350-361`).
- Repository writes use `withExclusiveTransactionAsync()` for multi-row atomic work and batched parameterized inserts, for example `upsertStreetSegments()` (`src/database/streetRepository.ts:16-63`) and `replaceExplorationForMode()` (`src/database/completionRepository.ts:411-428`).

### Existing OpenStreetMap integration

- Nearby street ways are fetched from Overpass by `fetchNearbyOsmStreetSegments()` and corridor repair by `fetchOsmStreetSegmentsForCorridors()` (`src/services/osmStreetService.ts:42-72`).
- `fetchOverpass()` uses POST, a 35-second client abort, and an Overpass query timeout of 25 seconds (`src/services/osmStreetService.ts:74-103`, `105-130`).
- OSM ways are split into stable local fragments no longer than 35 m. IDs are based on the complete way geometry as `way/{id}/part/{index}`, independent of which request returned them (`src/services/osmStreetService.ts:132-175`, `185-246`).
- Street cache bounds and timestamps are stored in SQLite and queried by bounding-box overlap (`src/database/streetRepository.ts:64-99`).
- `MapScreen` refreshes street coverage from the player's current location, not the panned viewport. It reloads after 250 m, reads a 1,600 m cache radius, checks 200 m local freshness, fetches 800 m, treats data as fresh for seven days, and retries failures after 30 seconds (`src/screens/MapScreen.tsx:169-176`, `932-1062`).
- Administrative zones use a separate Overpass query through `fetchNearbyOsmZonesWithDebug()` (`src/services/zoneCompletion.ts:69-105`). It resolves containing or nearby administrative relations at levels 2, 8, 9, and 10 (`src/services/zoneCompletion.ts:197-212`).
- Zone rows are cached by relation ID with geometry and `fetched_at`, but the current zone fetch has no client abort and no expiry policy (`src/database/completionRepository.ts:457-533`; `src/services/zoneCompletion.ts:77-105`).
- When not recording, panning can drive district lookup through `handleVisibleRegionChange()` and the viewed-district effect (`src/screens/MapScreen.tsx:621-629`, `881-930`). That is the only current viewport-driven OSM behavior.

### Map rendering and layers

- `ExplorationMap` wraps `react-native-maps` and uses the repository's Apple POI filter patch on iOS (`src/components/ExplorationMap.tsx:83-93`, `339-354`; `scripts/patch-react-native-maps-poi-filter.js`).
- `handleRegionChangeComplete()` updates local zoom state and reports the region to `MapScreen` (`src/components/ExplorationMap.tsx:317-320`).
- Map detail levels are derived from latitude delta by `getMapRenderLevel()` (`src/components/ExplorationMap.tsx:794-804`).
- Existing start/end and active recording markers appear only when the generic Pins layer is enabled and the map is at the close render level (`src/components/ExplorationMap.tsx:157-166`, `425-465`).
- Layer state is `showExploredCells`, `showMarkers`, and `showPaths` (`src/types/mapLayers.ts:1-5`); controls are rendered by `LayerControls()` and `OptionsModal()` (`src/screens/MapScreen.tsx:2993-3022`, `3566-3588`).

## 2. Walking-only refactor residue audit

No active `Wheel` or `Car` string, label, union member, selector, branch, or configuration was found. `scripts/test-exploration-geometry.js:88-96` explicitly asserts that the configuration exposes only `walk`.

Substantial generic activity-mode residue remains:

| Area | Exact residue | Assessment |
| --- | --- | --- |
| Shared types | `ActivityMode = "walk"` and `activityMode` on sessions/active walks (`src/types/walk.ts:1`, `29-60`) | Compatibility scaffolding, not a second mode |
| GPS config | `MODE_LOCATION_CONFIG` and mode parameters (`src/constants/config.ts:17-30`) | Renameable later, but safe to retain |
| Session schema | `walk_sessions.activity_mode` plus index (`src/database/db.ts:54-61`, `79-94`) | Legacy schema; do not drop |
| Exploration schema | `explored_cells.mode` and `loop_fills.mode` (`src/database/db.ts:154-176`) | Legacy partition key; do not drop during medal work |
| Settings | `active_recording_mode` and completion objective `mode` (`src/database/settingsRepository.ts:6-18`, `48-51`, `253-306`) | Recovery/compatibility residue |
| Repository APIs | Mode-filtered session, stats, cell, loop, and rebuild queries (`src/database/walkRepository.ts:509-524`, `737-809`; `src/database/completionRepository.ts:191-430`) | Internally fixed to walk by callers |
| UI copy | `ACTIVITY_MODE_TEXT`, History's visible Mode row, `ModeProfilePanel`, Details' `{mode}` subtitle (`src/i18n.ts:10-45`; `src/components/WalkHistoryModal.tsx:232-258`; `src/components/ModeProfilePanel.tsx`; `src/screens/MapScreen.tsx:3666-3691`) | User-visible generic mode language still exists, but offers no selection |
| Completion | `const mode = "walk"`; objective persists a mode (`src/components/CompletionModal.tsx:64`; `src/database/settingsRepository.ts:15-18`) | No activity selector |
| Reprocessing | `reprocessModeExploration(mode)` and mode-keyed loops (`src/screens/MapScreen.tsx:1534-1764`) | Single-mode implementation behind a generic name |
| Backup | V2 sessions serialize `activityMode`; restore hardcodes `"walk"` (`src/database/walkRepository.ts:61-74`, `881-940`, `968-991`) | Old field accepted, original legacy value not preserved |
| Migration | Migration 18 converts all session/cell/loop modes to walk and removes old activity preferences/objective (`src/database/db.ts:362-394`) | Records survive, but prior mode provenance is lost |
| Tests/docs | Manual tests still discuss “mode” in some diagnostic rows and historical changelog entries discuss the profiles available at the time (`docs/TESTING.md:82-97`; `docs/CHANGELOG.md`) | Historical text should not be rewritten; current docs should remain walking-only |

### Recommended compatibility strategy

1. Do not drop `activity_mode`, `mode`, legacy backup fields, or historical rows as part of medals.
2. Continue writing `"walk"` for all new recordings.
3. Keep V1/V2 backup parsers tolerant of historical `activityMode` values.
4. When backup V3 is introduced, preserve an imported legacy value as optional provenance rather than exposing it as a selectable profile. The least invasive model is a nullable `legacy_activity_mode` on `walk_sessions`, populated only when an old backup supplies a non-walk value, while the operational `activity_mode` remains `walk`.
5. Export that legacy provenance in V3 so an import/export round trip does not erase it. Current UI, statistics, history, completion, medal evaluation, and GPS configuration continue to treat every restored recording as walking coverage.
6. If product policy decides that old Wheel/Car tracks must not prove walking medals, do not infer from the normalized current column. Use preserved import provenance to exclude them from medal proof. Existing installations already migrated by migration 18 may lack that provenance, so whether their pre-migration tracks are eligible is an explicit migration-policy decision.
7. Gradually remove user-facing “Mode” and “profile” wording where it adds no value, but keep schema/API cleanup separate from medal implementation to avoid a destructive compatibility refactor.
8. Add no activity-mode field to any medal table, medal TypeScript type, album JSON, POI candidate, acquisition event, or backup medal object.

## 3. Existing GPS validation pipeline

### Foreground collection

1. `useReliableForegroundLocation()` owns the managed foreground watcher, reconnect backoff, freshness filtering, and recording watchdog (`src/hooks/useReliableForegroundLocation.ts:31-345`).
2. It uses BestForNavigation, 1 m, and 1 s while recording; idle tracking is 10 m and 5 s (`src/hooks/useReliableForegroundLocation.ts:215-239`).
3. `publishPoint()` rejects non-increasing timestamps before invoking `MapScreen` (`src/hooks/useReliableForegroundLocation.ts:59-82`).
4. `MapScreen.handleLocationPoint()` updates the display location, sends an active recording point to `persistAcceptedGpsPoint()`, and journals the point to the durable background outbox if storage admission is full or persistence fails (`src/screens/MapScreen.tsx:448-557`).
5. `persistAcceptedGpsPoint()` serializes writes per session, allows a 750 ms reorder window, caps the in-memory backlog at 4,096, and retries storage failures (`src/services/walkRecorder.ts:65-150`, `235-455`).
6. Every raw fix is first retained in `gps_observations` by `saveActiveGpsObservation()` (`src/services/walkRecorder.ts:458-469`; `src/database/gpsObservationRepository.ts:48-181`).
7. `evaluateGpsPoint()` accepts:
   - accuracy `null` or at most 30 m;
   - a first point;
   - strictly newer timestamps;
   - movement at least 1 m;
   - implied speed at most 4 m/s.
   Weak accuracy pauses without counting a rejection; stale points and impossible jumps are rejected (`src/services/recordingState.ts:207-300`).
8. Accepted fixes are inserted idempotently into `gps_points` with the next point index, and the session distance increment is committed in the same exclusive transaction (`src/database/walkRepository.ts:125-195`).
9. Late or more accurate observations trigger a complete timestamp-ordered deterministic rebuild with `buildCanonicalGpsPoints()` and `replaceActiveWalkGpsPointsFromObservations()` (`src/services/walkRecorder.ts:492-530`, `581-603`; `src/database/gpsObservationRepository.ts:203-246`).

### Background collection, storage, and recovery

1. The task is registered at module load as `street-explorer-background-location` (`src/services/backgroundLocationTask.ts:13-52`).
2. Native batches are timestamp-sorted and written to a `.tmp` file, then atomically renamed to `.json` before database work (`src/services/backgroundLocationTask.ts:36-43`; `src/services/backgroundLocationOutbox.ts:146-166`).
3. Startup/drain recovers valid temporary batches, quarantines corrupt files, orders journal files, initializes SQLite, and preserves recent unmatched points for a five-minute recovery grace period (`src/services/backgroundLocationOutbox.ts:168-245`, `247-317`).
4. Points target the hinted session only if their timestamp belongs to it. Ownerless legacy batches fall back only when exactly one session intersects the timestamp (`src/services/backgroundLocationOutbox.ts:510-536`, `641-649`).
5. Active-session background points call the same `persistAcceptedGpsPoint()` used by foreground points (`src/services/backgroundLocationOutbox.ts:319-384`).
6. Points arriving after finalization are upserted into `gps_observations`, rebuilt through the same `evaluateGpsPoint()` sequence, and atomically replace `gps_points` when the canonical route changed (`src/services/backgroundLocationOutbox.ts:386-487`; `src/database/gpsObservationRepository.ts:248-385`).
7. A changed finalized route deletes stale route snapshots and per-session exploration/loop rows and creates a `pending_recording_repairs` marker (`src/database/gpsObservationRepository.ts:350-382`, `421-443`).
8. `repairPendingRecordingCaches()` recreates the frozen route and direct/inferred exploration before clearing the repair marker (`src/screens/MapScreen.tsx:267-337`; `src/database/completionRepository.ts:77-155`).
9. Stop waits for background tracking to stop, waits for task handlers, drains journal files, flushes the in-memory queue, and only then finalizes the session (`src/services/backgroundLocationTask.ts:181-209`; `src/screens/MapScreen.tsx:1791-1866`; `src/services/walkRecorder.ts:625-645`).

### Implications for medals

- Foreground and background fixes can safely share a medal pipeline only after they are canonical accepted `gps_points`.
- `gps_observations.accepted = 0`, rejected route gaps, display location, native speed/heading, and outbox payloads are never direct proof.
- Accuracy `null` is currently accepted. Before medals ship, confirm whether this remains trusted enough for acquisition or whether the medal evaluator needs a stricter accuracy rule without changing normal recording behavior.
- Medal evaluation must run after finalization and again after any late-background canonical rebuild. It must be idempotent because `repairPendingRecordingCaches()` and app startup may repeat.

## 4. Existing exploration and loop-fill algorithm

### Confirmed, inferred, and rejected path segmentation

- `buildPathSegmentsWithInference()` examines each adjacent accepted GPS pair (`src/services/pathInference.ts:68-125`).
- A segment is suspicious when it exceeds 4 m/s, or when both distance is over 15 m and elapsed time is over 6 s (`src/services/pathInference.ts:168-193`).
- With no street graph, suspicious segments are rejected. With cached OSM, `inferStreetRoute()` may return a high/medium/low-confidence street route (`src/services/pathInference.ts:141-166`, `235-316`).
- `persistStreetMatchedRouteSnapshot()` freezes only confirmed and high/medium inferred geometry with algorithm version 3 (`src/services/routeSnapshot.ts:12`, `170-236`).
- Rejected gaps are omitted. There is no straight fallback.

### Direct-GPS explored-cell generation

- `collectExploredCellIdsByRouteSegments()` rasterizes confirmed segments into `gps` cells and accepted inferred segments into `inferred` cells; direct GPS wins when both sources touch the same cell (`src/services/explorationArea.ts:320-347`).
- Segments are sampled every 3.75 m and mark nearby 15 m cells within a 10.61 m center radius (`src/services/explorationArea.ts:9-11`, `414-451`).
- `persistRecordingExplorationDelta()` freezes a route, derives source-separated cells, and atomically commits them only if the GPS generation and snapshot still match (`src/screens/MapScreen.tsx:244-302`; `src/database/completionRepository.ts:77-155`).
- `explored_cells.source` keeps `gps`, `inferred`, and `loop_fill` separate (`src/database/db.ts:154-163`).

### Boundary construction, flood fill, and persistence

- Exact grid contours come from `buildGridBoundaryEdges()`, `traceGridOutlinePaths()`, and signed contour area (`src/services/explorationArea.ts:480-624`).
- `collectEnclosedExplorationCellGroups()` identifies negative-area hole contours and enumerates unoccupied cell centers strictly inside them (`src/services/explorationArea.ts:161-228`).
- `analyzeLoopFillsForCells()` first uses those exact contour groups, then adds tolerant groups only when not already represented (`src/services/loopFill.ts:80-102`).
- The tolerant detector expands the boundary by one cell and flood-fills from outside (`src/services/loopFill.ts:206-340`).
- The flood search refuses a bounding search over 1,000,000 cells (`src/services/loopFill.ts:12-20`, `247-256`).
- Accepted enclosed areas may contain at most `150,000 / 225 = 666` cells. OSM walkable-street length is computed as metadata and does not reject the fill (`src/services/loopFill.ts:104-147`, `149-188`).
- `getCellGroupBoundsPolygon()` persists only the enclosed group's axis-aligned bounding rectangle, not the exact contour or walked boundary (`src/services/loopFill.ts:386-401`).
- `replaceExplorationForMode()` replaces the entire mode's cells and loop rows in one exclusive transaction (`src/database/completionRepository.ts:411-455`).

### Multi-recording reconstruction

- Full-history loops are rebuilt only from the explicit Reprocess recordings action (`src/screens/MapScreen.tsx:1973-2057`; `docs/TESTING.md:208-226`).
- `reprocessModeExploration()` loads all finalized walks, gathers every recording's frozen direct **and inferred** cells into one `boundaryCellIds` set, and analyzes that cumulative boundary (`src/screens/MapScreen.tsx:1534-1662`).
- Existing `loop_fill` cells are not fed into that rebuild boundary.
- Accepted interior cells are then stored as source `loop_fill` with `session_id = NULL`; loop rows also use `session_id = NULL` (`src/screens/MapScreen.tsx:1663-1721`).
- The 80 m minimum in `analyzeLoopFills(points)` applies only to the per-point API (`src/services/loopFill.ts:61-78`). Global reprocessing calls `analyzeLoopFillsForCells()` directly and therefore does not apply the 80 m precheck.
- Completion includes persisted cells and may add render-time contour fills through `includeRenderedContourFills()` (`src/services/zoneCompletion.ts:107-179`).

### Why current loops cannot directly prove a medal

The normal loop system intentionally has different trust and gameplay semantics:

- validated inferred cells may close a normal loop;
- a one-cell tolerance may close a seam;
- the global path may combine recordings;
- stored polygon JSON is a bounding rectangle;
- there is no capture algorithm version, exact proof hash, source-generation evidence, or stable enclosure identity;
- the full-history path does not apply the per-recording 80 m gate.

The medal evaluator must therefore reuse tested low-level grid primitives where appropriate, but must not query accepted `loop_fills` as proof and must not pass the normal mixed boundary into medal acquisition.

## 5. Recommended medal system architecture

Keep five domains explicit:

1. **Temporary POI candidates**: expiring, refreshable, scored, developer-only discovery data.
2. **Frozen city album versions**: reviewed immutable content shipped or imported locally.
3. **Player collection**: permanent, idempotent user state.
4. **Normal exploration**: existing `gps`, `inferred`, and `loop_fill` behavior, unchanged.
5. **Medal evaluation**: a read-only projection of canonical trusted direct walking followed by writes only to medal acquisition tables.

Recommended modules:

```text
src/types/medal.ts
src/database/medalRepository.ts
src/database/poiCandidateRepository.ts
src/services/poiCandidateService.ts
src/services/medalAlbumService.ts
src/services/medalEnclosure.ts
src/services/medalCollection.ts
src/components/MedalMarker.tsx
src/components/MedalsModal.tsx
src/components/MedalAcquisitionOverlay.tsx
assets/medals/lyon-v1.json
scripts/test-medal-enclosures.js
```

No medal type or table contains `mode` or `activityMode`.

## 6. Separation between normal mapping and medal collection

The implementation boundary should be enforced in code and tests:

- `medalEnclosure.ts` reads finalized canonical GPS sessions and constructs a **direct-only** trusted projection.
- It may call a refactored pure grid-contour helper from `explorationArea.ts`, but it must pass only confirmed direct-GPS cells.
- It must not call `includeRenderedContourFills()`, query `source = 'loop_fill'`, use `source = 'inferred'`, or consume OSM path geometry.
- `medalCollection.ts` receives enclosure results and frozen album items, then commits only medal tables.
- It must never call `saveExploredCells()`, `saveLoopFill()`, or `replaceExplorationForMode()`.
- Existing exploration finalization remains responsible for map/completion state. Medal failure must not roll it back or change percentages.
- Run before/after geometry fixtures to prove normal exploration, loop-fill cells, zone completion, and route snapshots remain byte-for-byte or set-for-set identical.

## 7. Recommended medal enclosure evaluation

### Trusted input

For each finalized eligible session:

1. Load canonical accepted `gps_points` ordered by timestamp and ID (`getAllWalksWithPoints()` currently does this at `src/database/walkRepository.ts:533-540`).
2. Re-run `buildPathSegments(points, "walk")`, which has no OSM context.
3. Keep only `type === "confirmed"`.
4. Rasterize those confirmed segments through `collectExploredCellIdsByRouteSegments()` or a direct-only wrapper.
5. Union direct cell keys across the sessions allowed by the chosen history policy.

This excludes:

- rejected `gps_observations`;
- suspicious/rejected gaps;
- all street-inferred segments;
- all existing inferred cells;
- all loop-fill cells;
- OSM roads, footways, or candidate geometry as walking evidence;
- raw imported geometries not revalidated through the canonical GPS pipeline.

### Exact topology and transition requirement

Use `collectEnclosedExplorationCellGroups()` on the direct-only boundary. Do **not** apply `findEnclosedCellGroups()` or `boundaryExpansionCells` for medal collection in V1.

For normal policy B:

1. Build `beforeCells` from eligible trusted history excluding the triggering recording's newly committed generation.
2. Build `afterCells` from that history plus the triggering recording.
3. Compute exact enclosure groups for both.
4. Only groups that are new or materially enlarged because of the trigger are acquisition candidates.
5. Require at least one trusted boundary cell from the triggering recording on the candidate's contour/component.
6. Apply deterministic validity caps before looking up medals.

This prevents an album refresh or unrelated recording from collecting every landmark in a previously closed historical polygon.

### Validity rules

Start with conservative, versioned constants:

- exact direct-cell closure; no one-cell seam tolerance;
- maximum enclosed area no greater than the existing walking cap of 150,000 m², with a recommendation to trial a stricter 100,000 m² medal cap during Lyon testing;
- maximum flood/search bounds inherited from the existing 1,000,000-cell guard;
- minimum trusted boundary length of 80 m, measured from confirmed segments participating in the component;
- the triggering recording must contribute new boundary coverage;
- reject non-finite coordinates, invalid timestamps, missing source generations, empty contours, self-contradictory geometry, or an enclosure whose proof cannot be reproduced;
- record rejection diagnostics in logs/developer tooling, not player collection rows.

To reduce accidental GPS polygons:

- preserve the existing 30 m accuracy and 4 m/s validation as the baseline;
- require exact topology and strict size/length bounds;
- require a before/after closure transition;
- optionally add a reviewed per-medal `max_capture_area_m2` for dense or sensitive locations;
- evaluate stricter medal accuracy in field tests without changing ordinary exploration.

### Anchor and geometry containment

Every approved medal has one explicit capture target:

- `anchor`: a manually reviewed public-space representative coordinate; or
- `geometry`: reviewed landmark geometry when a single anchor would be misleading.

V1 should prefer anchors. A large or inaccessible building gets a safe public viewing anchor, never an instruction to enter the property.

Deterministic rules:

- An anchor is captured only when its deterministic 15 m cell belongs to an exact enclosed interior group and is not a boundary cell.
- An anchor exactly on a grid edge follows the existing Web Mercator `floor` key rule, but it still fails if the chosen cell is boundary rather than interior.
- A geometry target requires positive-area overlap with interior cells; touching only the contour is outside.
- Holes remain outside.
- Boundary-only contact never collects a medal.

Store `capture_algorithm_version = 1` and the target rule in the acquisition evidence. Any later geometry or tolerance change increments the algorithm version and does not rewrite past collections.

### Can several recordings be combined safely?

Yes, with constraints. Canonical confirmed direct-GPS cells are durable, source-separated, and deterministic, so cumulative enclosure is technically safe. The current app already reconstructs cumulative loops, proving that the topology scales across recordings. Medal evaluation must nevertheless:

- exclude inferred and loop-filled cells;
- compare before/after coverage;
- attribute the event to the recording that closes the enclosure;
- retain the sorted source session/GPS-generation evidence;
- use the exact detector without the current one-cell tolerance.

## 8. Database schema and migration plan

Use the next numbered migration after the repository's current migration 18. The exact number must be rechecked immediately before implementation.

### `poi_candidate_fetches`

Developer-only cache coverage and partial-result ledger:

```sql
CREATE TABLE poi_candidate_fetches (
  id TEXT PRIMARY KEY NOT NULL,
  city_key TEXT NOT NULL,
  query_version INTEGER NOT NULL,
  tile_key TEXT NOT NULL,
  min_latitude REAL NOT NULL,
  max_latitude REAL NOT NULL,
  min_longitude REAL NOT NULL,
  max_longitude REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete','partial','failed')),
  response_remark TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE (city_key, query_version, tile_key)
);
```

Add a bounds/status/expiry index. A `partial` tile never counts as complete coverage.

### `poi_candidates`

```sql
CREATE TABLE poi_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  city_key TEXT NOT NULL,
  source TEXT NOT NULL,
  osm_element_type TEXT,
  osm_element_id INTEGER,
  external_identity TEXT NOT NULL,
  wikidata_id TEXT,
  wikipedia_key TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  geometry_json TEXT,
  anchor_latitude REAL,
  anchor_longitude REAL,
  min_latitude REAL NOT NULL,
  max_latitude REAL NOT NULL,
  min_longitude REAL NOT NULL,
  max_longitude REAL NOT NULL,
  score REAL NOT NULL,
  review_status TEXT NOT NULL
    CHECK (review_status IN ('pending','approved','rejected','merged')),
  rejection_reason TEXT,
  merged_into_id TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (merged_into_id) REFERENCES poi_candidates (id),
  UNIQUE (source, osm_element_type, osm_element_id)
);
```

Indexes: city/status/score, Wikidata ID, normalized name, and geographic bounds. `external_identity` uses `osm:{node|way|relation}:{id}` and may be supplemented by `wikidata:{Q-id}`.

### `city_medal_sets`

One row per immutable city album version:

```sql
CREATE TABLE city_medal_sets (
  id TEXT PRIMARY KEY NOT NULL,
  city_key TEXT NOT NULL,
  city_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','frozen','retired')),
  boundary_source_identity TEXT NOT NULL,
  boundary_json TEXT NOT NULL,
  generator_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  frozen_at TEXT,
  UNIQUE (city_key, version),
  UNIQUE (content_hash)
);
```

`id` example: `lyon:v1`. A service-layer guard rejects mutation of a frozen row or any item attached to it. At startup, bundled albums are verified against `content_hash`; they are inserted as new versions, never used to overwrite an existing frozen version.

### `medals`

Stable logical identity across album versions:

```sql
CREATE TABLE medals (
  id TEXT PRIMARY KEY NOT NULL,
  city_key TEXT NOT NULL,
  stable_key TEXT NOT NULL UNIQUE,
  canonical_external_identity TEXT,
  osm_element_type TEXT,
  osm_element_id INTEGER,
  wikidata_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Example stable key: `lyon:fourviere-basilica`. External identities may change after an OSM merge without changing the player's logical medal.

### `city_medal_set_items`

Frozen, versioned album content:

```sql
CREATE TABLE city_medal_set_items (
  city_medal_set_id TEXT NOT NULL,
  medal_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('landmark','history','culture','architecture','nature','curiosity')
  ),
  capture_target_kind TEXT NOT NULL CHECK (
    capture_target_kind IN ('anchor','geometry')
  ),
  anchor_latitude REAL NOT NULL,
  anchor_longitude REAL NOT NULL,
  qualifying_geometry_json TEXT,
  max_capture_area_m2 REAL,
  review_status TEXT NOT NULL CHECK (review_status = 'approved'),
  safety_note TEXT,
  source_attribution_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (city_medal_set_id, medal_id),
  FOREIGN KEY (city_medal_set_id) REFERENCES city_medal_sets (id),
  FOREIGN KEY (medal_id) REFERENCES medals (id)
);
```

The reviewed anchor remains mandatory even for a geometry target so UI focus and safety guidance are always defined.

### `medal_acquisition_events`

This additional table is justified because one enclosure may collect several medals transactionally and the current `loop_fills` row does not preserve a reproducible proof:

```sql
CREATE TABLE medal_acquisition_events (
  id TEXT PRIMARY KEY NOT NULL,
  city_medal_set_id TEXT NOT NULL,
  proof_hash TEXT NOT NULL UNIQUE,
  acquisition_policy TEXT NOT NULL CHECK (
    acquisition_policy IN ('current_recording','cumulative_recordings','retroactive_scan')
  ),
  acquisition_status TEXT NOT NULL CHECK (
    acquisition_status IN ('current','retroactive')
  ),
  triggering_session_id INTEGER,
  enclosure_identity TEXT NOT NULL,
  enclosure_area_m2 REAL NOT NULL,
  boundary_cell_count INTEGER NOT NULL,
  interior_cell_count INTEGER NOT NULL,
  boundary_hash TEXT NOT NULL,
  interior_hash TEXT NOT NULL,
  source_generations_json TEXT NOT NULL,
  capture_algorithm_version INTEGER NOT NULL,
  evaluated_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (city_medal_set_id) REFERENCES city_medal_sets (id),
  FOREIGN KEY (triggering_session_id) REFERENCES walk_sessions (id)
);
```

`id`, `enclosure_identity`, and `proof_hash` are deterministic hashes over the album ID, algorithm version, sorted source generations, sorted boundary/interior cells, and policy. This makes reprocessing reproducible.

### `collected_medals`

```sql
CREATE TABLE collected_medals (
  medal_id TEXT PRIMARY KEY NOT NULL,
  city_medal_set_id TEXT NOT NULL,
  acquisition_event_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  acquisition_status TEXT NOT NULL CHECK (
    acquisition_status IN ('current','retroactive')
  ),
  triggering_session_id INTEGER,
  capture_algorithm_version INTEGER NOT NULL,
  presentation_state TEXT NOT NULL CHECK (
    presentation_state IN ('pending','presenting','presented','skipped')
  ),
  presented_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (medal_id) REFERENCES medals (id),
  FOREIGN KEY (city_medal_set_id) REFERENCES city_medal_sets (id),
  FOREIGN KEY (acquisition_event_id) REFERENCES medal_acquisition_events (id),
  FOREIGN KEY (triggering_session_id) REFERENCES walk_sessions (id)
);
```

Indexes: album/captured date and presentation state/captured date. `PRIMARY KEY (medal_id)` makes acquisition idempotent across album versions.

### Transaction and reprocessing behavior

Within one `withExclusiveTransactionAsync()`:

1. Revalidate the frozen album hash and GPS source generations.
2. Determine all uncollected medals strictly inside one accepted enclosure.
3. If none are new, write nothing.
4. Insert the deterministic acquisition event.
5. Insert all enclosed medal rows with `presentation_state = 'pending'`.
6. Commit.
7. Only after success, notify UI to read the pending queue.

`INSERT OR IGNORE`/primary keys make repeat evaluation safe. If the source generations change before commit, abort and retry from current GPS. Do not delete collections when an album, geometry algorithm, or recording changes later; collections are permanent evidence snapshots.

## 9. POI fetching and caching strategy

### Driver

Use a combination with strict roles:

- **Explicit city-album generation + administrative boundary** is authoritative.
- **Viewport fetching** is optional developer preview only.
- Player runtime never refreshes POIs to mutate a frozen album.

### Lyon boundary

1. Resolve the Lyon `boundary=administrative`, `admin_level=8` relation through Overpass, preferably cross-checking `wikidata=Q456`.
2. Reuse the relation assembly approach in `fetchNearbyOsmZonesWithDebug()` but add a city-specific exact lookup, a client timeout, and no bounds fallback for album generation.
3. Manually verify the OSM relation ID, name, Wikidata ID, complete outer rings, holes, and public-domain coverage before storing it in the draft.
4. Freeze the boundary source identity and geometry hash with the album. A later OSM boundary edit creates a new draft/version.

### Request partitioning

- Tile the verified city bounds into roughly 1-2 km boxes.
- Query `nwr` candidates inside the city area and each tile; discard results outside the verified polygon.
- Split the allowlist into small category batches to keep response size bounded.
- Run one Overpass request at a time.
- Use a 25-second server timeout and approximately 35-second client abort, matching the street service.
- Debounce developer viewport preview by 500-750 ms and cancel stale request IDs, following the existing `streetLoadRequestRef` pattern (`src/screens/MapScreen.tsx:971-1047`).
- Cache each tile/query-version result for 30 days during draft work. Allow explicit force-refresh.
- On HTTP 429/502/503/504 or timeout, honor `Retry-After`, use bounded exponential backoff with jitter, and stop after three attempts.
- Treat HTTP 200 responses containing an Overpass `remark`, missing expected tiles, aborted category batches, invalid JSON, or incomplete geometry as `partial`, never `complete`.
- Keep stale complete candidates visible to developer tooling when refresh fails, clearly labeled stale.

### Wikidata and Wikipedia enrichment

- First trust explicit OSM `wikidata` and `wikipedia` tags.
- Validate Wikidata IDs with a bounded batched lookup during explicit generation, not normal map movement.
- Resolve label, short description, official website, coordinates, and instance-of values for scoring/review.
- Resolve Wikipedia language keys from OSM or Wikidata sitelinks; prefer French, with English fallback.
- Store normalized facts and provenance, not unlicensed arbitrary images.
- Enrichment failure lowers confidence but does not erase the OSM candidate.

## 10. Candidate normalization and categorization

Normalize every raw OSM element into:

- stable source identity and element type;
- original tags JSON;
- NFC-trimmed display name and case/diacritic-folded comparison name;
- language-specific names;
- valid geometry and bounds;
- a representative centroid plus a separately reviewed capture anchor;
- Wikidata/Wikipedia keys;
- one proposed category;
- access/safety flags;
- score with an explanation list;
- review state and rejection/merge reason.

Category precedence:

1. `historic=*`, monument/memorial/archaeology -> History.
2. museum/gallery/theatre/arts centre -> Culture.
3. architecturally significant building/tower/bridge -> Architecture.
4. park/garden/viewpoint/natural feature -> Nature.
5. public artwork/unusual engineering/local oddity -> Curiosity.
6. broad iconic civic place without a stronger class -> Landmark.

Manual review may override the proposed category. One medal has one primary category in V1.

## 11. Deduplication, exclusion, and scoring rules

### Explicit OSM allowlist

Candidates must be named and match at least one:

- `tourism=attraction|museum|gallery|viewpoint|artwork`;
- `historic=archaeological_site|castle|city_gate|fort|memorial|monument|ruins`;
- `heritage=*` combined with a name and a suitable physical feature;
- `amenity=arts_centre|theatre` or significant `amenity=place_of_worship`;
- `leisure=park|garden|nature_reserve`;
- `man_made=tower|obelisk`;
- significant named `building=cathedral|church|chapel|synagogue|mosque|temple|civic`;
- named public-art features with `artwork_type=*`;
- named natural features such as `natural=peak|cliff|cave_entrance|waterfall` when relevant to the city.

Religious buildings require an additional significance signal: `heritage`, `historic`, `wikidata`, `wikipedia`, `tourism`, or manual nomination. Parks/gardens require a meaningful area or known significance, not every neighborhood green.

### Hard exclusions

- missing/placeholder names;
- `access=private|no`, `foot=no`, military/restricted land, active construction, unsafe ruins, or a capture point requiring trespass;
- ordinary shops, restaurants, hotels, offices, parking, transit stops, schools, hospitals, and routine civic infrastructure;
- duplicate entrances, label nodes, building parts, and relation members already represented by one landmark;
- features outside the frozen city boundary;
- deleted/disused/abandoned features unless manually approved as safe heritage;
- objects whose only safe public route is unavailable;
- geometry too broad to yield a fair enclosure and no safe representative anchor;
- sensitive destinations where gamification is inappropriate.

### Deduplication

Merge in this order:

1. identical Wikidata ID;
2. identical Wikipedia article;
3. node/way/relation membership or shared OSM feature references;
4. same normalized name plus geometry containment/overlap;
5. same normalized name and anchors within 50 m;
6. curated parent/child merge, such as a museum relation plus its label node.

Prefer the element with complete geometry and richer provenance; retain all aliases/source identities on the canonical candidate. Mark merged rows rather than deleting them.

### Candidate score

Score is for review ordering, never automatic album admission:

- +25 explicit Wikidata;
- +15 Wikipedia;
- +15 recognized heritage/historic classification;
- +10 official tourism/museum/arts classification;
- +10 complete usable geometry;
- +10 clearly public pedestrian access;
- +5 multilingual name;
- +5 balanced-category contribution;
- -20 uncertain access or anchor;
- -20 duplicate likelihood;
- -15 overly broad geometry;
- hard exclusion -> ineligible regardless of score.

## 12. Lyon prototype scope

Target 18-22 frozen medals; the following 20 are draft proposals only. Exact OSM/Wikidata identity, category, text, geometry, and public capture anchor require manual review.

| Proposed medal | Category | Review focus |
| --- | --- | --- |
| Basilica of Notre-Dame de Fourvière | Architecture | Public plaza/viewing anchor; avoid building interior requirement |
| Ancient Theatre of Fourvière | History | Separate safely from the museum campus |
| Amphitheatre of the Three Gauls | History | Public perimeter anchor and opening/access constraints |
| Saint-Jean-Baptiste Cathedral | Architecture | Public square anchor |
| Cour des Voraces | Curiosity | Traboule opening hours and residential access; reject if not reliably public |
| Fresque des Lyonnais | Curiosity | Public street viewpoint anchor |
| Mur des Canuts | Curiosity | Public street viewpoint anchor |
| Bartholdi Fountain | Landmark | Place des Terreaux anchor and duplicate with square |
| Hôtel de Ville de Lyon | Architecture | Public square anchor, not municipal interior |
| Opéra de Lyon | Culture | Public façade anchor |
| Palais de la Bourse | Architecture | Public exterior anchor |
| Equestrian statue of Louis XIV, Place Bellecour | Landmark | Distinguish statue from the whole square |
| Musée des Beaux-Arts de Lyon | Culture | Public forecourt anchor |
| Musée des Confluences | Culture | Safe plaza anchor; large-building geometry review |
| Institut Lumière / Villa Lumière | Culture | Merge campus/building duplicates |
| Parc de la Tête d'Or | Nature | Use a reviewed public representative anchor; do not require enclosing the entire park |
| Jardin des Curiosités | Nature | Public opening hours and viewpoint anchor |
| Metallic Tower of Fourvière | Curiosity | Viewing anchor only; tower itself is inaccessible |
| Passerelle du Palais de Justice | Landmark | Pedestrian-safe anchor and bridge geometry |
| Musée Cinéma et Miniature | Culture | Old Lyon access and duplicate/source verification |

The draft should be rejected or revised if it overconcentrates on central Lyon, inaccessible interiors, religious architecture, or paid venues. Album review should seek category and neighborhood balance without weakening safety.

## 13. Album review and freezing workflow

1. Create a draft set for `lyon:v1`.
2. Resolve and lock the Lyon boundary source for that draft.
3. Fetch all tiles/category batches and require complete coverage.
4. Normalize, enrich, score, and merge candidates.
5. Review each proposed medal on a current map:
   - correct identity and name;
   - category and description;
   - public pedestrian access;
   - safe anchor/geometry;
   - realistic enclosure around public streets;
   - no encouragement to trespass;
   - licensing/provenance;
   - duplicate status.
6. Record approved/rejected/merged status and reasons.
7. Require bilingual product copy if the app continues supporting English and French.
8. Run a freeze validator: 18-22 approved items, unique stable IDs, valid coordinates, city containment, no unresolved duplicate/access flags, complete attribution, deterministic sort order.
9. Serialize canonical JSON with stable key ordering and compute a content hash.
10. Explicitly freeze. After freezing, candidate refresh cannot update the set or its items.
11. Check the frozen JSON into `assets/medals/lyon-v1.json` and seed it idempotently.
12. Future edits create `lyon:v2`. Existing collections reference stable medal IDs and the capture album version; they are never invalidated.

## 14. Medal collection state machine

```text
uncollected
  -> evaluated_not_enclosed
  -> enclosed_candidate
  -> transaction_committed / presentation_pending
  -> presenting
  -> presented | skipped
```

Rules:

- `evaluated_not_enclosed` is derived, not persisted per medal.
- `enclosed_candidate` exists in memory only while GPS generations are validated.
- Acquisition event and every enclosed medal commit atomically.
- UI never creates a collection.
- On app close while `presenting`, reset it to `pending` on next launch.
- Pending rows are ordered by `captured_at`, event ID, then album sort order.
- A completed or skipped presentation updates only presentation fields.
- Reprocessing the same proof finds the existing event/medal keys and does nothing.

## 15. Foreground and background processing

Evaluation trigger points:

1. Normal stop: after `finishPersistedActiveWalk()`, final `gps_points` load, and recording exploration repair (`src/screens/MapScreen.tsx:1833-1905`).
2. Finish recovered recording: after the same persisted finalization and repair path (`src/screens/MapScreen.tsx:2315-2379`).
3. Late finalized background merge: after `replaceFinalizedWalkGpsPointsFromObservations()` creates a repair marker and `repairPendingRecordingCaches()` reaches a stable generation (`src/database/gpsObservationRepository.ts:328-443`; `src/screens/MapScreen.tsx:304-337`).
4. App launch: idempotently scan frozen albums when pending presentation exists or trusted GPS generations have changed.

Do not evaluate raw live points for permanent acquisition. A live “loop nearly closed” hint could be added later, but collection waits for durable finalization and canonical background reconciliation.

The acquisition transaction must verify the same per-session point count/max ID evidence pattern already used by route repair (`src/database/completionRepository.ts:89-122`). For cumulative history, store a sorted JSON list of `{sessionId, pointCount, maxPointId}` and hash it.

## 16. Historical and multi-recording behavior

### Policy comparison

| Policy | Behavior | Benefit | Risk |
| --- | --- | --- | --- |
| A | Only one new recording's trusted geometry may create the enclosure | Simplest attribution | Rewalking intersections; inconsistent with cumulative exploration |
| B | Current recording can close an enclosure using older trusted direct coverage | Matches the app's cumulative map and is understandable | Requires before/after topology and multi-session evidence |
| C | New albums automatically award all historically enclosed medals | No lost credit | Surprise mass awards; album release rather than walking triggers capture |
| D | One explicitly controlled historical scan, then normal rules | Honors history without silent mutation | Needs UI consent and retroactive labeling |

### Recommendation

- Use B for normal play.
- Do not use C.
- Offer D once for each newly installed frozen album version, behind explicit confirmation. Default to “not now”; remember the decision.
- D uses the exact same direct-only, exact-contour, cap, boundary, and deterministic containment rules. It sets `triggering_session_id = NULL`, `acquisition_status = 'retroactive'`, and records all contributing source generations.
- If the player declines, already-closed historical enclosures do not collect merely because the album appeared. A later recording must create a new qualifying closure transition.

This policy requires product confirmation before code begins.

## 17. Map integration

- Add `showMedals` to `MapLayerState`; keep it separate from existing start/end Pins.
- Load only the selected city's frozen medal items and collection status.
- Use a distinct collected marker (metallic/color) and locked marker (muted silhouette).
- At close zoom, show all medals in the viewport.
- At medium zoom, show collected medals plus the selected locked medal; optionally replace others with a city count badge.
- At far zoom, show at most a city album summary marker.
- Marker presses open a small detail card with name/category/state and actions for Medals or Focus.
- Use bounds queries/indexes before rendering, and memoize marker components to protect map performance.
- Do not expose candidate score, rejection reason, or temporary POI markers outside a developer-only build path.
- Keep Apple MapKit as the visual base map; OSM attribution belongs in album/source information rather than as a proof layer.

## 18. Collection interface

Implement `MedalsModal` as a full-screen modal matching current History/Completion conventions:

- city album picker;
- collected/total count;
- category chips;
- locked/unlocked filter;
- stable album-version/source information;
- medal grid/list with locked silhouette and unlocked art;
- name, description, category, city, capture date, and current/retroactive badge;
- Focus on map;
- clear safety copy for representative anchors;
- city-completion reward when every current frozen-set medal ID is collected.

The city reward should be derived from the current set count, not stored as a second source of truth. If a later album version adds medals, preserve the historical “completed v1” achievement separately only if product wants versioned completion history.

## 19. Acquisition presentation and queue

After the collection transaction commits:

1. Query `presentation_state = 'pending'`.
2. Temporarily darken the map without disabling data persistence.
3. Rotate/reveal one medal.
4. Show landmark and city names.
5. Play a short metallic sound and one haptic cue.
6. Mark it presented and continue to the next pending medal.

Use React Native `Animated` for the initial animation. During implementation, evaluate SDK-54-compatible Expo audio and haptics packages; no dependency is added during this audit.

Accessibility:

- honor `AccessibilityInfo.isReduceMotionEnabled()`;
- reduce rotation to a fade/scale;
- provide Skip and Skip all;
- allow sound/haptic failure without blocking presentation;
- announce the unlocked medal;
- restore `presenting` to `pending` after an interrupted launch.

No separate presentation table is needed because durable state and ordering live on `collected_medals`; the acquisition event groups medals from the same enclosure.

## 20. Backup and restore changes

At audit time, Backup V2 contained sessions, points, and frozen route snapshots only. The implemented Backup V3 adds medal state while retaining those snapshots; V1/V2 imports remain compatible and restore with empty medal state. The line references below describe the original pre-implementation layout and are retained as historical design context.

Introduce backup V3:

```ts
type MedalBackupV1 = {
  schemaVersion: 1;
  albums: FrozenOrDraftAlbumSnapshot[];
  acquisitionEvents: MedalAcquisitionEventBackup[];
  collectedMedals: CollectedMedalBackup[];
  legacyActivityModeBySession?: Record<string, string>;
};
```

Rules:

- Export frozen album definitions needed to explain collected medals, including content hash and attribution.
- Export developer draft albums only in developer builds or an explicit advanced option; label them `draft` and never auto-freeze on restore.
- Export acquisition evidence and presentation state. Normalize `presenting` to `pending`.
- Restore albums by `(city_key, version, content_hash)`. If the app already has that exact frozen version, reuse it.
- If a referenced version is missing, restore the embedded immutable snapshot as a retired/frozen local archive so collection records remain explainable.
- If an existing `(city, version)` has a different hash, do not overwrite it; import the backup snapshot under a conflict-safe archive ID and report the conflict.
- Restore events by `proof_hash` and collections by `medal_id`; uniqueness prevents duplicates.
- V1/V2 backups remain valid and produce empty medal state.
- Preserve or safely ignore unknown old multi-mode fields. Never reject an otherwise valid old backup merely because it includes Wheel/Car-era mode text.
- Add medal tables to the existing exclusive replacement transaction only after validation. Do not leave half-restored collection rows.
- Update `deleteAllData()` deliberately: delete player collections/events; clear temporary candidates/fetches; preserve or reseed bundled frozen albums according to the product's “delete all data” wording.
- Future medal backup migrations dispatch on `medalSystem.schemaVersion`, independent of the top-level backup version.

## 21. Test plan

### Automated tests

Add `scripts/test-medal-enclosures.js`, following the repository's dependency-free TypeScript loading pattern in `scripts/test-exploration-geometry.js`. Add `npm run test:medals`; do not claim a Jest/lint suite that does not exist.

Required pure-geometry fixtures:

1. Walking near an anchor without enclosing its cell does not collect.
2. Exact valid direct-GPS enclosure containing the anchor collects.
3. Exact enclosure not containing the anchor does not collect.
4. Rejected GPS gap cannot close an enclosure.
5. Inferred route cannot close an enclosure.
6. Existing `loop_fill` cells cannot close or extend a boundary.
7. A valid historical direct boundary behaves according to selected policy.
8. Several recordings close an enclosure only under selected cumulative policy.
9. Trigger recording must cause before/after closure.
10. Several medals in one interior are returned in stable album order.
11. Oversized enclosure is rejected.
12. One-cell near-closure accepted by normal loop tolerance is rejected for medals.
13. Accidental/impossible-speed polygon is rejected upstream.
14. Anchor exactly on the enclosure boundary is outside.
15. Geometry touching only the boundary is outside.
16. Reordering equal input sets produces the same proof/enclosure IDs.
17. Reprocessing creates no duplicate acquisitions.
18. Equivalent canonical foreground/background point sets produce identical proof.
19. Existing normal geometry assertions still pass unchanged.
20. Walking-only configuration remains singleton and no Wheel/Car medal field exists.

Repository/integration tests or a device harness must verify:

- acquisition event plus multiple `collected_medals` rows commit atomically;
- a forced transaction failure stores none;
- UI notification happens only after commit;
- primary keys make repeated restore/evaluation idempotent;
- interrupted `presenting` returns to `pending`;
- missing album versions restore from embedded snapshots;
- V1/V2 backup import remains valid;
- old multi-mode backup fields remain importable and do not appear as UI choices.

### Manual tests

Extend `docs/TESTING.md` with:

- real outdoor single-recording enclosure;
- cumulative enclosure over separate days;
- foreground/background equivalence;
- force close after commit but before animation;
- multiple-medal queue and skip/reduced-motion;
- locked/collected markers across zoom levels;
- Medals full-screen navigation and Focus on map;
- explicit retroactive-scan consent/decline;
- offline use of a frozen Lyon album;
- candidate refresh cannot change a frozen album;
- private/inaccessible candidate never appears in the album;
- city-completion reward;
- backup/restore on device.

### Validation commands

For implementation phases:

```text
npm run typecheck
npm run test:geometry
npm run test:medals
npx expo export --platform ios --output-dir <temporary-directory>
```

Also perform the relevant manual procedures in `docs/TESTING.md`. Remote credentialed EAS builds are not required unless specifically requested or needed for release/device validation.

## 22. Performance, privacy, licensing, and abuse risks

### Performance

- Cumulative cell reconstruction may become expensive for large histories. Start by bounding work to frozen medal city boundaries plus the maximum capture area margin.
- Cache per-session direct-only cell sets keyed by GPS point count/max ID if profiling requires it; do not use normal inferred/exploration rows as a shortcut.
- Query medals by enclosure bounds before exact containment.
- Keep map marker counts bounded by zoom and viewport.
- Run candidate generation explicitly, one network request at a time.

### Privacy

- Keep GPS, albums, and collections local. No account or backend is required.
- Do not send GPS history to Overpass, Wikidata, or Wikipedia. City generation queries use city tiles/boundaries, not player routes.
- Backups contain sensitive tracks and collection dates; retain existing user-driven share/import behavior and document sensitivity.
- Do not put exact player enclosure geometry in analytics. There is currently no analytics subsystem.

### Licensing

- Maintain visible OpenStreetMap attribution and record OSM element/version provenance where available.
- OSM database-derived content is subject to ODbL attribution/share-alike considerations.
- Wikidata facts are CC0, but Wikipedia descriptions are not. Prefer original short descriptions with linked attribution rather than copying article text.
- Do not ship Wikimedia/third-party images without asset-specific license, author, and attribution records. V1 can use app-created medal art and no landmark photos.
- Preserve source attribution with each frozen album version.

### Safety and abuse

- GPS spoofing cannot be fully prevented in a local-only app; the aim is deterministic trust filtering, not anti-cheat surveillance.
- Reject impossible speed, poor-quality closure, oversized polygons, inferred bridges, and private anchors.
- A medal must never instruct entry into restricted or paid space. A safe public representative anchor is valid even when the landmark itself is inaccessible.
- Do not let OSM vandalism silently alter frozen player targets. Manual freeze and content hashes are mandatory.
- Rate-limit Overpass and retain cache to avoid abusive traffic.

## 23. Ordered implementation phases

### Phase 0: confirm product decisions

Confirm historical policy, cumulative closure, boundary semantics, medal area cap, retroactive consent, album completion versioning, and legacy-mode eligibility.

### Phase 1: version and pure-domain foundation

- Recheck canonical version.
- Because this is a new user-visible capability, plan a minor release from `0.3.68` to `0.4.0`, with iOS build number and Android version code increasing from 68 to 69.
- Add medal types without mode fields.
- Extract/refactor pure exact-contour helpers without changing existing loop behavior.
- Implement direct-only enclosure/proof hashing and automated tests.

### Phase 2: schema and repositories

- Add migrations and repositories.
- Add frozen-album integrity checks.
- Add transactional acquisition event/collection writes.
- Add backup V3 and compatibility tests.

### Phase 3: POI candidate tooling

- Add city boundary resolution, tiled Overpass fetching, fetch ledger, enrichment, normalization, scoring, merge, and review status.
- Keep it developer-only.

### Phase 4: Lyon draft and freeze

- Generate the draft.
- Review approximately 20 medals and anchors.
- Resolve safety/licensing/duplicate issues.
- Freeze and bundle `lyon:v1`.

### Phase 5: acquisition lifecycle

- Evaluate after normal/recovered finalization and late-background repair.
- Implement B plus the confirmed historical policy.
- Verify no normal exploration/completion mutation.

### Phase 6: map and collection UI

- Add medal layer/markers.
- Add full-screen Medals modal, filters, city selection, detail, Focus, and counts.
- Add current/retroactive display and city reward.

### Phase 7: presentation

- Add durable pending presentation handling.
- Add darkening, animation, audio, haptics, queue, reduced motion, skip, and recovery.

### Phase 8: validation and release documentation

- Run typecheck, geometry, medal tests, iOS export, and device procedures.
- Update README, Architecture, Project Overview, Roadmap, Testing, Changelog, and any development-build notes affected by new dependencies.
- Reconfirm all version declarations and build identifiers.

## 24. Proposed commit sequence

No commits are created by this audit. Recommended future sequence:

1. `docs: confirm medal decisions and 0.4.0 scope`
2. `test: add trusted medal enclosure fixtures`
3. `feat: add direct-only versioned medal enclosure engine`
4. `feat: add medal album and collection schema`
5. `feat: add backup v3 medal compatibility`
6. `feat: add developer POI candidate pipeline`
7. `content: freeze reviewed Lyon v1 medal album`
8. `feat: collect medals after canonical recording finalization`
9. `feat: add medal map layer and collection screen`
10. `feat: add durable acquisition presentation queue`
11. `docs: add medal validation, architecture, and release notes`

Keep each commit internally valid; do not split a required migration from the repository/types that understand it. The final feature branch must contain the synchronized `0.4.0`/build 69 release change before completion.

## 25. Historical design questions and v0.4.0 decision record

1. **Historical policy**: approve B for normal play and explicit opt-in D for existing enclosures, or choose A/C.
2. **Legacy mode eligibility**: may old recordings normalized by migration 18 prove medals when original mode provenance is unavailable?
3. **Medal enclosure cap**: reuse 150,000 m² or start at the safer proposed 100,000 m².
4. **Exact closure only**: approve no one-cell tolerance for medal V1.
5. **Boundary rule**: approve strict interior; boundary-only anchor/geometry contact does not collect.
6. **Geometry targets**: ship anchor-only in V1 where possible, or allow positive-area landmark geometry after manual review.
7. **Retroactive UX**: where and when to offer the one-time scan, and whether “not now” can be revisited.
8. **Album completion**: completion per immutable version or only against the newest active version.
9. **Draft tooling location**: hidden on-device developer screen or a repository script/build-time workflow.
10. **Accuracy-null policy**: accept current canonical behavior or require known accuracy for medal proof.
11. **Audio/haptic dependency choice**: select SDK-compatible packages during implementation; the audit installs none.
12. **Lyon roster**: approve/reject/rebalance the 20 draft nominations after identities and anchors are verified.

## 26. Residue checklist

- [x] No Wheel or Car union members found.
- [x] No Wheel or Car selector/control found.
- [x] `ActivityMode` remains as a walk-only compatibility type.
- [x] Session `activity_mode` remains in SQLite.
- [x] Explored-cell and loop `mode` columns remain in SQLite.
- [x] Active recording mode setting remains for recovery compatibility.
- [x] Completion objective still serializes a walk mode.
- [x] Repositories still accept mode parameters fixed to walk by callers.
- [x] History still shows a generic Mode row.
- [x] `ModeProfilePanel` still shows a walking profile.
- [x] Localization still uses `ACTIVITY_MODE_TEXT`.
- [x] Backup V2 still serializes session activity mode.
- [x] Restore hardcodes operational mode to walk.
- [x] Migration 18 normalized old modes and removed old activity preferences.
- [x] Current docs describe the walking-only runtime, while changelog history retains old multi-profile context.
- [x] Geometry tests assert one configured mode.
- [ ] Before medal implementation, decide whether unknown-provenance legacy tracks can prove walking medals.
- [ ] Preserve legacy backup mode provenance in V3 without exposing a selector.
- [ ] Remove redundant user-facing Mode/profile wording in a separate compatibility-safe cleanup if desired.
- [ ] Add a static/schema test ensuring medal models contain no mode field.

## Final recommendation summary

- **Exact current GPS architecture:** foreground and background fixes converge through a durable observation store and the same timestamp-ordered `evaluateGpsPoint()` pipeline; only canonical accepted `gps_points` become frozen confirmed/inferred route snapshots and source-separated exploration cells.
- **Exact current loop architecture:** explicit full-history reprocessing unions confirmed and validated inferred cells across all recordings, finds exact grid holes plus a one-cell tolerant fallback, applies an area cap, stores interiors separately as `loop_fill`, and persists only a bounding rectangle as loop polygon metadata.
- **How to determine whether a medal is surrounded now:** apply the normal gameplay enclosure analyzer to the current accepted boundary in real time and the frozen accepted route at Stop/recovery, including the normal one-cell seam tolerance; require 80m, a strict-interior anchor, and the 150,000m2 walking cap.
- **Several recordings:** normal live/Stop awards evaluate the new recording independently so old mapped ground cannot block it; the explicit historical scan may combine accepted frozen boundaries across recordings.
- **Historical awards:** do not award silently. Offer an explicit one-time policy-D scan per frozen album version, label results retroactive, and then use normal B behavior.
- **Wheel/Car residue:** no active Wheel/Car concepts remain, but generic mode types, columns, settings, filters, UI wording, backup fields, migration behavior, tests, and historical docs remain.
- **Legacy compatibility:** retain legacy columns/fields/records; normalize operational behavior to walking; preserve imported original mode as hidden provenance in Backup V3; decide explicitly whether unknown legacy provenance is medal-eligible.
- **v0.4.0 decisions implemented historically:** cumulative trigger policy B, explicit retro-scan policy D, exact strict interior, 100,000m2 cap, known accuracy only, SDK-compatible audio/haptics, frozen album versioning, review-only candidate tooling, and the final 20-item Lyon roster. **v0.5.0 supersedes the acquisition geometry and timing portions** with gameplay-equivalent closure, real-time durable awards, Stop/recovery safety evaluation, missed-award repair, and the 3D flight-to-tab presentation.
