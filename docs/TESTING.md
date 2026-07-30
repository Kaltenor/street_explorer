# Testing

## Run The App

```powershell
cd W:\street_explorer
npx expo start --dev-client --lan
```

If the phone cannot connect reliably:

```powershell
npx expo start --dev-client --tunnel
```

If stale errors appear:

```powershell
npx expo start --dev-client --clear
```

For development-build setup, see [Development Build](DEVELOPMENT_BUILD.md).

## Automated Checks

```powershell
npm run typecheck
npm run test:geometry
npm run test:medals
npm run test:player
npx expo install --check
```

`test:player` verifies the sixteen active native idle/walking frames plus retained source/stale assets, trustworthy-location and last-rendered-sprite retention, the stable native marker identifier, `AnimatedRegion` coordinate smoothing, disabled custom-view snapshot tracking, stale-GPS accessibility, and removal of fragile legacy marker rendering. `test:geometry` also verifies that Stop presents the summary before deferred route/cache reconciliation.

`test:geometry` verifies Zone Boundary Completion V2 ring assembly, malformed-fragment rejection, refresh staleness, display-only fallback eligibility, denominator fingerprints, durable achievement/refresh schemas, rollups, and Backup V4 wiring.

`test:geometry` verifies Path Inference V3 ground-level geometric joins, rejects bridge/ground crossings, bounds compatible endpoint joins to 8m at medium confidence, and checks persisted topology/evidence wiring. It also verifies one-action saved-route focus and overlap-based Today path queries.

`test:geometry` additionally asserts the bounded performance architecture: localized duration timing, three-second/conditional tail synchronization, debounced and memoized map surfaces, anchor-gated medals, hidden-panel unmounting, History virtualization, scoped path SQL, migration indexes, efficient completion aggregates, concurrent startup drain, streamed backup output, and render instrumentation.

`test:medals` verifies the configured replacement splash PNG, real-time award/repair wiring, the 3D flight-to-tab presentation, permanent Unlocked/Locked collection sections, the city medal HUD, the single objective toggle, streamlined navy/gold presentation wiring, Unicode catalogue copy, gameplay-equivalent exact and one-cell-tolerant closure, the 80m minimum, strict interior anchors, the 150,000m2 cap, missing-accuracy compatibility, and eligibility over previously mapped ground.

## Streamlined Interface Test

1. Enter the map and confirm the smaller logo leaves the map readable, the Lyon medal card shows the current collected/total count and progress bar, and the bottom destinations share one rounded navigation surface.
2. Tap the Lyon progress card and confirm Medals opens. In All and every category, confirm Unlocked and Locked headers remain visible with independent counts; unlocked cards appear first and show descriptions, while locked cards stay compact.
3. Confirm only one side flag remains. Tap it to hide and show the district objective card; verify the saved objective remains selected in Completion. With no objective, tap the flag and confirm Completion opens so one can be selected.
4. Open Options and confirm Paths, Explored Cells, and Pins remain independently configurable even though their three map shortcuts were removed. Confirm route-reprocessing maintenance is also available there.
5. Open Details and confirm everyday statistics and goals appear without map legends or GPS diagnostics. Open History, choose a recording, and confirm route-quality reports remain hidden until Technical details is expanded.
6. Confirm Completion shows four primary measures and omits fetched-source metadata and the V1 rules explanation from the default flow.
7. With no active walk, confirm only today's steps and Start Walk are shown. During a walk, confirm distance, duration, steps, Stop, and the existing double-tap health details remain accessible.
8. Open recovery, diagnostics, stop confirmation, and recording summary surfaces and confirm the same navy/gold surfaces, rounded layout, readable contrast, and red-only destructive actions.

## Basic Recording Test

Startup regressions: when testing an older development binary against the current JavaScript bundle, confirm startup succeeds even if medal sound or haptics are unavailable. In a diagnostic build where database initialization is deliberately made to fail, confirm a dark retry screen appears instead of an indefinite white screen.

1. Open the Street Explorer development build.
2. Confirm the `loading-screen2.png` artwork appears for the native splash and remains as the branded loading overlay while the native map, saved records, unfinished-recording check, permission state, and bounded initial-location attempt are pending.
3. Confirm `Press here to start` appears only after preloading completes and the launch screen remains visible until it is tapped.
4. Tap `Press here to start` and confirm the preloaded map opens immediately.
5. Open and close Details, History, Completion, and Options in turn; after each one, confirm the map gestures and bottom controls still respond.
6. With foreground permission granted, confirm the player icon appears before recording and the map centers on the current location.
7. If no fix is available, confirm startup resolves after the bounded attempt; a later fix may center the map unless you already moved it.
8. Confirm the version number appears under the transparent `title.png` logo.
9. Tap Start and confirm the button immediately shows Starting, then changes to Stop without waiting for step or background-service setup.
10. Confirm repeated taps while Starting do not create duplicate recordings.
11. Move at least 20-30 meters.
12. Confirm:
   - duration increases
   - steps today is visible for walking recordings
   - distance increases
   - the complete active path appears
   - explored cells appear
   - bottom controls show distance, duration, and Stop
13. Tap Stop.
14. Confirm the Stop dialog offers Continue and a hold-to-quit action; choose Continue and confirm recording and drawing continue. With VoiceOver, confirm the Quit control exposes its confirmation action.
15. Tap Stop again, hold Quit, and confirm the UI enters Finishing only while tracking is quiesced and queued GPS is durably finalized.
16. Confirm the recording report, History row, saved live cells, and Start control appear immediately at that durable boundary; route inference, exact steps, medals, objectives, and full cache refresh may finish afterward without blocking input.
17. Start another short walk immediately and confirm the player remains visible and the new recording begins normally while the previous derived work settles.
18. Force close during finalization, reopen, and confirm the session is either saved or offered for recovery, never silently lost.

## Startup And Large-History Performance Test

1. Use a device database with many long recordings and a large explored-cell ledger.
2. Cold-launch the app and confirm the native map appears before saved red exploration contours.
3. Confirm startup does not freeze while route history is unopened and the Paths layer is off.
4. Open History and confirm the list appears without loading every route; tap one recording and confirm only that recording's detailed GPS and route data loads.
5. Close History, restart, enable Paths, and confirm detailed routes load on demand.
6. Start a recording and confirm live distance, cells, and the complete route advance without progressively worsening input lag.
7. Stop and confirm the report and Start control return after the durable session save, without waiting for route inference, exact step reconciliation, medals, objectives, or the complete saved-history refresh. For a continuous short route, confirm the direct snapshot fast path avoids street-corridor graph work.
8. Run Reprocess recordings explicitly and confirm that is the only workflow that performs full-history route, street, contour, and loop rebuilding.
9. Repeatedly open and close History and Completion with a large explored-cell ledger; confirm Back returns control to the map immediately while unfinished Completion scans are cancelled.
10. Scroll a history containing at least 100 recordings and confirm rows stay responsive instead of mounting the complete list at once.
11. Switch Paths through Today, Last 7 days, Selected, and All and confirm only that scope is loaded and displayed.
12. During recording, confirm the player and active route move immediately while red/today contours settle within roughly 650ms; medal collection may use the same short settle interval.
13. Confirm development logs do not show continuously increasing MapScreen/ExplorationMap render counts while the map is idle. Investigate any recurring `[perf]` operation above its printed threshold.
14. Export a large backup and confirm incremental file writing completes without an iOS memory warning or empty file.

## Long Recording And Reconnect Test

1. Start outdoors with a reliable fix and record more than 1,000 accepted points.
2. Confirm the beginning of the route stays visible, including when zoomed far out, while distance and explored cells continue increasing.
3. Confirm stable chunk boundaries do not create visual holes in a continuous observed route.
4. Temporarily disable location services or otherwise interrupt fixes.
5. Confirm the player icon remains at the newest accepted route position and the already-drawn route remains intact.
6. Restore location service and leave the app active.
7. Confirm the foreground watcher reconnects automatically and the path resumes without restarting the recording.
8. Confirm the pre-outage route is retained and no unsafe straight diagonal is drawn across a genuinely unobserved interval.
9. Tap Stop, choose Continue once, then hold Quit and confirm the entire route is saved.

## Full-Screen Navigation Test

1. Tap the Details icon above the Start/Stop panel.
2. Confirm Details opens full screen with a back button.
3. Tap back and confirm the map returns.
4. Tap History and confirm it opens full screen with the same back-button layout as Completion.
5. Tap Completion and confirm it opens full screen with a back button.

## History Test

1. Open History.
2. Tap a recording.
3. Confirm a recording detail view opens:
   - started time
   - ended time
   - distance
   - duration
   - mode
   - point count
4. Rename the recording.
5. Tap Save.
6. Turn the Saved route layer off and select Today or All. Tap Focus on map and confirm History closes, the chosen route is fitted and highlighted, Paths is now Selected, and Saved route is enabled without another Options action.
7. Save a recording that begins shortly before midnight and ends shortly after midnight. Confirm it appears in Today on both affected dates, while recordings entirely outside the local day remain excluded.
8. Export GPX for a recording.
9. Delete a bad recording if needed.

## Data Tools Test

1. Start a recording, open History, and tap Backup.
2. Confirm export is blocked while the recording is active.
3. Stop and save the recording, then reopen History.
4. Tap Backup.
5. Confirm iOS shows a share/save sheet for a non-empty JSON backup, including when the database contains an invisible orphan row whose start and end timestamps match. Confirm that orphan and its dependent points/routes/medal events are absent from the JSON. If sharing does not open, record the stage-specific Prepare, Write, or Share message and its technical detail.
6. Tap a recording.
7. Tap Export GPX.
8. Confirm iOS shows a share/save sheet for a GPX file.
9. Return to History.
10. Tap Restore.
11. Pick a Street Explorer JSON backup.
12. Confirm recordings reload after restore.
13. Confirm an imported backup containing an unfinished active session is rejected instead of creating an invisible orphan.
14. Repeat Backup immediately after stopping a recording too short to appear in History; confirm the hidden late-GPS recovery tombstone does not block the export and is not included in the file.
15. Restore a V4 file and confirm frozen route snapshots remain available without reprocessing.

## Layer Controls Test

Toggle:

- Paths
- Cells
- Pins

Confirm each layer appears or disappears.

## Path Display Scope Test

1. Open Details.
2. Under Paths, switch between Today, 7 days, All, and Selected.
3. Confirm the path lines change while explored cells remain visible.
4. Select a recording from History and confirm Selected shows only that route.

## Objective HUD Test

1. Open Completion.
2. Refresh/load nearby boundaries if needed.
3. Select a zone such as a district.
4. Tap Set objective.
5. Confirm the map HUD shows the objective name and completion percentage.
6. Record or reprocess exploration and confirm the objective percentage updates.

## Explored Area Outline Test

1. Show explored cells on the map.
2. Confirm adjacent cells do not show internal borders.
3. Confirm a thin dark outline appears around every real red-to-unfilled frontier.
4. Confirm a retained oversized hole has a complete inner black outline.
5. Confirm a filled qualifying hole has no internal black outline or tiny reddish nested islands.
6. Reprocess a qualifying cumulative loop and confirm everything inside its exterior black border is a continuous solid fill with no white cracks.
7. Confirm an oversized loop remains unfilled under the walking area limit.
8. Inspect a long open walked path and confirm its red corridor is solid without internal holes.

## OpenStreetMap Debug Matching Test

1. Wait for GPS to locate you.
2. Open Completion and refresh boundaries if needed.
3. Confirm OSM boundary loading does not flood the main map with street lines.
4. Confirm OSM remains hidden analysis/debug data, not the primary gameplay overlay.

Notes:

- The first load needs internet access.
- Nearby means a smaller local radius around your current position.
- Matched is the number of short OSM street segments close to your GPS path.
- Street dist. is matched OSM segment distance, not the same thing as recording distance.
- Matching is V1 proximity matching, so it can be imperfect near parallel roads.
- OSM streets are cached locally and can be refetched later.
- OSM is hidden analysis data; cells and confirmed GPS paths are still the main exploration view.

## Completion Screen Test

1. Open Completion with a known successful boundary fetch less than 30 days old and confirm no automatic network refresh starts.
2. Set the stored success date to at least 30 days old, reopen Completion with GPS available, and confirm one automatic refresh starts while manual Refresh remains disabled only during the request.
3. Confirm the permanent-achievement panel shows separate district and city counts plus the last successful boundary date and 30-day policy.
4. Tap Refresh and confirm the app loads nearby OSM boundaries, or persists and displays a clear failure while retaining the previous successful date.
5. Change Scope between Country, City, and District and select each available zone.
6. Confirm exact multi-ring zones report walking-only progress, exclude inner holes, and show a percentage when the denominator is small enough to scan locally.
7. Use a fixture whose outer ways are unordered/reversed and contains multiple outer rings; confirm it remains exact and every component contributes to the denominator.
8. Use an incomplete or degenerate relation fixture and confirm it is labeled display-only/unavailable, cannot become an objective, and cannot grant an achievement.
9. Reach 100% on an exact district and city fixture; confirm each creates one permanent achievement and increments the respective rollup only once.
10. Refresh either completed zone with changed geometry and clear the zone cache; confirm its permanent achievement and rollup remain earned.
11. Confirm a changed exact geometry receives a new denominator instead of reusing the previous geometry fingerprint's total.
12. Tap Focus on map and confirm both exact and display-only selected boundaries can still be inspected on the map.
13. Confirm Completion scans still yield, cancel immediately on close, and do not block returning to the map.
14. Export Backup V4, clear data, restore it, and confirm permanent zone achievements and rollups return. Restore a V1-V3 backup and confirm it imports with no zone achievements.
## Street Inference Safety Test

1. View or reprocess a route with sparse but plausible GPS updates and cached OSM streets.
2. Confirm normal walked sections still render and create direct GPS cells.
3. Confirm a high- or medium-confidence frozen street bridge creates a continuous red corridor.
4. Confirm Completion reports inferred cells and includes them in the completion percentage.
5. Confirm loop analysis can use the same inferred bridge cells as boundaries.
6. View a route with an extreme GPS outage, impossible jump, or no valid street route.
7. Confirm the app does not draw or fill a straight diagonal across the missing section.
8. Pan away and return; confirm the frozen corridor does not move when the OSM cache changes.

## Landmark Medal Test

1. Open the map in Lyon with Markers enabled and confirm the 20 album landmarks appear as locked medal pins.
2. Open Medals and confirm the Lyon count is shown out of 20, collected medals appear before locked medals in All and every category filter, French accents such as `Fourvière` render correctly, all six category chips are vertically centered and unclipped, every filter works, and tapping any card focuses its exact anchor on the map.
3. Start a walk and trace at least 80m around a landmark, returning close enough for the normal one-cell gameplay seam tolerance. Keep the anchor strictly inside and the enclosed area below 150,000m2.
4. Confirm the medal unlocks while the walk is still active as soon as the accepted boundary closes: the map marker changes from a lock to a medal and the collection card becomes unlocked without waiting for Stop.
5. Confirm previously mapped red cells do not block the award. Repeat over an area visited before the medal feature and verify the new qualifying loop still unlocks it.
6. Confirm passing near the marker, leaving it on the boundary, walking less than 80m, leaving a gap larger than the normal seam tolerance, or exceeding 150,000m2 does not award it.
7. Confirm the metallic chime, success haptic, dark overlay, 3D rotating medal, localized title/description, and Continue control appear. Tap Continue and confirm the medal shrinks and flies into the measured Medal tab, which briefly pulses. With Reduce Motion enabled, confirm the initial reveal is static while the award remains usable.
8. Stop immediately after closing a qualifying loop and confirm the idempotent Stop-time safety evaluation still unlocks it if live evaluation did not finish. Repeat through recovered-recording finalization.
9. Unlock during an active walk, discard that walk, and confirm the medal remains earned and its acquisition event no longer depends on the deleted session.
10. Upgrade an installation containing an individually qualifying walk missed by v0.4; confirm the one-time gameplay-v2 repair awards it and presents it without requiring the walk to be repeated.
11. Open Medals on an installation with cumulative qualifying saved coverage and run Scan my walks; confirm it uses the same gameplay loop rules and the unique count does not increase when repeated.
12. Force-close while an award is presenting, reopen, enter through the launch screen, and confirm the pending award is presented again before being marked complete.
13. Export Backup V4, delete data, restore it, and confirm collection evidence, presentation state, and historical-scan state return. Restore a V1/V2 backup and confirm recordings restore with an empty medal collection.
14. Disable sound or haptics at the device level and confirm presentation still completes without trapping the UI.
## Loop Fill Test

1. Record a closed loop of at least 80m.
3. Stop the recording.
4. Confirm normal GPS cells still appear.
5. Confirm Stop does not automatically rebuild historical loops; open Details and run Reprocess recordings explicitly before validating loop-fill results.
6. Confirm interior loop-fill cells appear with the same visual style as normal explored cells.
7. Confirm a straight walk does not create loop fills after reprocessing.
8. Open History, tap the recording, and confirm Loop cells and Loop result are shown.
9. Confirm a recording with a rejected GPS gap does not fill cells across that gap.
10. Record or reprocess a walk with multiple block loops and confirm History shows multiple filled loops.
11. Confirm obvious loops with tiny cell gaps still fill, unless the filled area would be too large.

## Reprocess Recordings Test

1. Connect the device to the internet and open Details.
2. Tap Reprocess recordings and confirm Details closes before the confirmation appears over the map.
3. Confirm the app explains that street coverage, frozen routes, explored cells, and loop fills will be rebuilt for walking history.
4. Tap Reprocess in the confirmation.
5. Confirm a blocking progress modal appears over the map and advances through preparation, one-time street coverage repair, route reconstruction with a completed/total counter, contour calculation, atomic saving, and map refresh.
6. Confirm street repair uses one consolidated request rather than pausing for a download on every historical recording.
7. Confirm the successful summary reports the number of refreshed road segments.
8. Confirm routes containing plausible intervals previously hidden by the v0.3.50 legacy freeze become continuous street-matched corridors where OSM has a reliable route.
9. Confirm one deliberately malformed recording is reported as preserved while later recording calculations continue.
10. Confirm success always produces a detailed completion summary and failure always produces a visible error.
11. Confirm the summary shows checked recordings, preserved failures, filled loops, rejected loops, loop cells, direct/validated boundary cells, inferred cells, and previous/rebuilt totals.
12. Confirm independently enclosed qualifying areas count toward completion immediately and that the percentage matches the solid red surface.
13. If the rebuilt total is below the previous total, confirm the summary reports a safety stop and the existing percentage does not decrease.
14. Confirm areas enclosed by direct and inferred cells from multiple recordings can fill.
15. Confirm high-confidence street matches close only short endpoint seams and unmatched gaps never draw a straight building shortcut.
16. Pan or reload without reprocessing and confirm accepted rebuilt routes stay frozen.
17. Repeat while offline and confirm the consolidated street-repair phase fails visibly within its timeout while existing frozen routes and progress remain unchanged.
## GPS Gap Safety Test

1. Record normally and confirm short GPS segments still draw as paths.
2. If a recording has a long GPS gap, confirm finalization performs only a bounded topology lookup around that gap and the frozen bridge follows walkable streets.
3. Test a normal ground-level intersection whose OSM ways cross without sharing an exact node; confirm the bridge can turn through it.
4. Test visually crossing bridge/tunnel or different-layer geometry; confirm the graph does not join the two ways.
5. Test two compatible fragment endpoints less than 8m apart; confirm the bridge may be accepted at medium confidence. Repeat above 8m and confirm rejection.
6. Confirm explicitly private or foot-prohibited ways are not used.
7. Open History and confirm Street bridges shows accepted, cell, high, and medium totals. Expand Technical details and confirm each new bridge shows distance, inferred cells, and its topology reason.
8. Pan, reload, or refresh OSM data without reprocessing and confirm the accepted frozen route and evidence remain unchanged.
9. Confirm low-confidence, implausible, and unmatched gaps draw no straight diagonal and contribute no explored cells.
10. Repeat finalization offline and confirm cached coverage remains usable; a failed topology refresh must not delete or replace existing data.
## Recovery Test

1. Start a recording.
2. Force close or reload the app without pressing Stop.
3. Reopen the app.
4. Confirm it asks about an unfinished recording.
5. Confirm the recovery modal shows:
   - full persisted distance
   - duration
   - complete persisted point count
   - last GPS point time
6. Use a recovered recording longer than 300 points, choose Resume, and confirm its complete persisted route is rebuilt into stable live chunks.
7. Confirm only the newest 300 raw points are kept in diagnostic/movement state; this limit must not truncate the drawn or saved route.
8. Confirm distance resumes from the persisted total and new points append after a complete database reload.
9. Repeat the test and choose Finish & Save; confirm a failed finalization preserves the recovery record for retry.
10. On success, confirm the active recovery marker clears only after durable session finalization and the recording appears in History.
11. Repeat with Discard; a failed database delete must keep the recovery prompt, while a successful delete clears it.

## Background Tracking Notes

Background tracking requires the development build. Expo Go is no longer the right target for realistic recording tests.

Test:

- iPhone locked
- app in background
- app fully reopened after a walk
- permission prompts
- iOS location indicator
- recording health panel says background recording is on
- distance and saved point count catch up after reopening the app

## Common Issues

### Distance Does Not Increase

Possible causes:

- GPS is not ready yet.
- Location permission is denied.
- GPS accuracy is too weak.
- The walking speed filter rejected a jump.
- The phone is indoors.

### App Shows Old Errors

Restart Expo with:

```powershell
npx expo start --dev-client --clear
```

### Expo Go Says SDK Is Unsupported

This project is pinned to Expo SDK 54 because that is the supported Expo Go SDK for this setup.

## Frozen Route Integrity Test

1. Record a route that includes a turn around a building and, if possible, briefly interrupt GPS.
2. Stop the recording and wait for the report.
3. Open History and confirm Route geometry shows Frozen.
4. Note the displayed route, then pan the map far enough to load another OSM area and return.
5. Reopen the route and run Reprocess recordings.
6. Confirm the saved line remains identical and does not cut the building corner.
7. Confirm suspicious gaps are either street-matched or hidden; they must never fall back to a straight connector.
8. Export and re-import a backup, then confirm the route is still Frozen and unchanged.

## GPS Finalization Race Test

1. Record while repeatedly backgrounding and foregrounding the app.
2. Use several quick lock/unlock handoffs while moving so foreground fixes and an out-of-order native background batch arrive close together.
3. Confirm the short reorder fast path produces canonical timestamp/index order and the live line fills without a skipped middle segment.
4. Stop immediately after returning to the foreground, while a delivered background handler may still be journaling or entering database work.
5. Confirm Finishing waits for entered handlers, drains the durable background outbox, and then flushes canonical writes before saving.
6. Confirm the final point, distance, explored surface, and saved route agree with the live trace, with no doubled points or backward indexes.
7. Temporarily make SQLite writes fail through multiple retry intervals and confirm a delivered batch remains as an outbox file, then persists after the fault clears.
8. Force close while Finishing and confirm the session is saved or recoverable on next launch.
9. Repeat with a task event entering just after the session finalizes; confirm its journaled fixes merge into timestamp order and relaunch repairs the invalidated route/exploration cache.
10. Repeat with a force close immediately after the session saves but before the map refresh; relaunch and confirm the pending route/exploration repair completes automatically.
11. Import a backup with a frozen route, trigger its pending repair, and confirm its explored cells follow that exact stored geometry instead of a newly inferred route.
12. Delete a recording while pending repair refresh is running and confirm neither route snapshots nor explored cells remain for the deleted session.
13. Start and stop while step/background setup is still completing; confirm no late watcher or background task restarts after Stop.
14. Replace a finalized session's GPS rows with the same point count but new auto-increment ids while its repair is running; confirm the old snapshot/cells do not commit and the next repair freezes the new generation.
15. Deliver a valid older fix after the reorder window and confirm raw observations re-derive contiguous indexes, the three-second idle synchronizer reloads the full live route, and no middle segment remains missing.
16. Interrupt journal publication after the temporary file write, relaunch, and confirm the valid temporary batch is promoted and drained; an incomplete temporary file must be quarantined without blocking other batches.
17. Begin a delayed background callback while restoring a backup and confirm restore first closes admission and stops tracking; after commit, no pre-import point may appear in an unrelated restored session.
18. Replay more than 4,096 pending active points and confirm chunked admission eventually persists the tail instead of rejecting the same tail forever.
19. Relaunch into a cold background callback with no in-memory session hint and confirm its journaled points attach only when exactly one session contains each timestamp.
20. Stop a recording with one accepted point, deliver its second valid point after the handler quiet period but within five minutes, and confirm the hidden session is promoted, repaired, and shown without a hole.
21. Replace a frozen route while an older repair calculation for the same GPS generation is still running; confirm the older cells cannot clear the marker against the newer route geometry.

## Animated Player Marker Test

1. Launch outdoors with foreground permission and confirm the CC0 top-down pixel character appears before recording.
2. Confirm the map initially centers on the current fix without replacing it with the native blue cursor.
3. Start recording, walk straight for several metres, and confirm the three-frame walking cycle plays continuously without the player flashing, disappearing, or leaving partial fragments.
4. Turn through north, east, south, and west; confirm the character changes to the corresponding directional artwork and glides between GPS updates instead of jumping or rotating the same image.
5. Stop moving and confirm the character settles on the matching directional idle frame.
6. Stop the walk and immediately start another; confirm the native annotation remains continuously visible during active-route teardown and recreation.
7. Interrupt location or map connectivity and confirm the explorer stays visible at the newest trustworthy position.
8. Wait at least ten seconds without a fix and confirm the player keeps its last rendered sprite instead of disappearing; with VoiceOver, confirm the marker is announced as a stale last-known position.
9. Restore service and confirm the watcher reconnects, the accessible stale state clears, and drawing resumes automatically.
10. Briefly create a weak or noisy reading and confirm the explorer follows accepted route points instead of jumping to rejected GPS positions.
11. Run `npm run test:player` and confirm the asset/source regression checks pass.

## Explored Area Performance Test

1. Load a large cumulative walking explored surface and pan and zoom the map.
2. Confirm the explored fill moves smoothly without thousands of rectangle seams flashing between cells.
3. Confirm narrow white channels do not remain inside a qualifying black discovered frontier.
4. Inspect an enclosed surface larger than the walking fill cap and confirm that it remains unfilled.
5. Start a recording and confirm each GPS update extends the combined saved/live surface without freezing or exposing seams.
6. Stop and save, then confirm the live corridor merges into the saved contour.
7. Run npm run test:geometry and confirm all contour, display-hole, loop-cap, open-path, and large-surface checks pass.
