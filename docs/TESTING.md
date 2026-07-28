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

## Basic Recording Test

1. Open the Street Explorer development build.
2. Confirm the `loading-screen2.png` artwork appears for the native splash and remains as the branded loading overlay while the native map, saved records, unfinished-recording check, permission state, and bounded initial-location attempt are pending.
3. Confirm there is no Press to start prompt.
4. With foreground permission granted, confirm the player icon appears before recording and the map centers on the current location.
5. If no fix is available, confirm startup resolves after the bounded attempt; a later fix may center the map unless you already moved it.
6. Confirm the version number appears under the transparent `title.png` logo.
7. Tap Start and confirm the button immediately shows Starting, then changes to Stop without waiting for step or background-service setup.
8. Confirm repeated taps while Starting do not create duplicate recordings.
9. Move at least 20-30 meters.
10. Confirm:
   - duration increases
   - steps today is visible for walking recordings
   - distance increases
   - the complete active path appears
   - explored cells appear
   - bottom controls show distance, duration, and Stop
11. Tap Stop.
12. Confirm the Stop dialog offers Continue and a hold-to-quit action; choose Continue and confirm recording and drawing continue. With VoiceOver, confirm the Quit control exposes its confirmation action.
13. Tap Stop again, hold Quit, and confirm the UI enters Finishing without a blocking Computing dialog.
14. Force close during finalization, reopen, and confirm the session is either saved or offered for recovery, never silently lost.
15. Confirm the recording report appears after the bounded single-recording cache write.
16. Confirm the recording appears in History.

## Startup And Large-History Performance Test

1. Use a device database with many long recordings and a large explored-cell ledger.
2. Cold-launch the app and confirm the native map appears before saved red exploration contours.
3. Confirm startup does not freeze while route history is unopened and the Paths layer is off.
4. Open History and confirm detailed route points load only then.
5. Close History, restart, enable Paths, and confirm detailed routes load on demand.
6. Start a recording and confirm live distance, cells, and the complete route advance without progressively worsening input lag.
7. Stop and confirm finalization time depends on the active recording, not the complete saved history.
8. Run Reprocess recordings explicitly and confirm that is the only workflow that performs full-history route, street, contour, and loop rebuilding.

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
6. Tap Focus on map and confirm the route is highlighted on the map.
7. Export GPX for a recording.
8. Delete a bad recording if needed.

## Data Tools Test

1. Start a recording, open History, and tap Backup.
2. Confirm export is blocked while the recording is active.
3. Stop and save the recording, then reopen History.
4. Tap Backup.
5. Confirm iOS shows a share/save sheet for a JSON backup.
6. Tap a recording.
7. Tap Export GPX.
8. Confirm iOS shows a share/save sheet for a GPX file.
9. Return to History.
10. Tap Restore.
11. Pick a Street Explorer JSON backup.
12. Confirm recordings reload after restore.
13. Confirm an imported backup containing an unfinished active session is rejected instead of creating an invisible orphan.

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

1. Tap Completion.
2. Tap Refresh.
3. Confirm the app loads nearby OSM boundaries, or shows a clear load failure if Overpass is unavailable.
4. Change Scope between Country, City, and District.
5. Select each available zone.
6. Confirm Completion has no activity selector and reports walking exploration only.
7. Confirm stats load without crashing even when district zones are unavailable.
8. Confirm explored cells, direct GPS cells, loop-filled cells, distance, and recordings are shown.
9. Tap Focus on map and confirm the selected zone outline appears on the map.
10. For city or district zones, confirm Completion shows a percentage when the zone is small enough to scan locally.
11. Confirm each zone shows Exact polygon or Approx bounds.
12. Tap Clear and confirm cached zones disappear while recordings remain.

## Street Inference Safety Test

1. View or reprocess a route with sparse but plausible GPS updates and cached OSM streets.
2. Confirm normal walked sections still render and create direct GPS cells.
3. Confirm a high- or medium-confidence frozen street bridge creates a continuous red corridor.
4. Confirm Completion reports inferred cells and includes them in the completion percentage.
5. Confirm loop analysis can use the same inferred bridge cells as boundaries.
6. View a route with an extreme GPS outage, impossible jump, or no valid street route.
7. Confirm the app does not draw or fill a straight diagonal across the missing section.
8. Pan away and return; confirm the frozen corridor does not move when the OSM cache changes.

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
2. If a recording has a long GPS gap with a reliable cached street route, confirm the frozen bridge follows streets and creates inferred cells.
3. If no reliable street route exists, confirm the app does not draw or fill a straight diagonal across the gap.
4. Confirm low-confidence and unmatched gaps contribute no explored cells.

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
15. Deliver a valid older fix after the reorder window and confirm raw observations re-derive contiguous indexes, the one-second synchronizer reloads the full live route, and no middle segment remains missing.
16. Interrupt journal publication after the temporary file write, relaunch, and confirm the valid temporary batch is promoted and drained; an incomplete temporary file must be quarantined without blocking other batches.
17. Begin a delayed background callback while restoring a backup and confirm restore first closes admission and stops tracking; after commit, no pre-import point may appear in an unrelated restored session.
18. Replay more than 4,096 pending active points and confirm chunked admission eventually persists the tail instead of rejecting the same tail forever.
19. Relaunch into a cold background callback with no in-memory session hint and confirm its journaled points attach only when exactly one session contains each timestamp.
20. Stop a recording with one accepted point, deliver its second valid point after the handler quiet period but within five minutes, and confirm the hidden session is promoted, repaired, and shown without a hole.
21. Replace a frozen route while an older repair calculation for the same GPS generation is still running; confirm the older cells cannot clear the marker against the newer route geometry.

## Animated Player Marker Test

1. Launch outdoors with foreground permission and confirm the top-down explorer marker appears before recording.
2. Confirm the map initially centers on the current fix without replacing it with the native blue cursor.
3. Start recording, walk straight for several metres, and confirm the explorer gently animates and faces the direction of travel.
4. Turn through north (359 to 0 degrees) and confirm the explorer takes the short rotation without spinning backward.
5. Stop moving and confirm the movement animation settles while the last reliable heading is retained.
6. Interrupt location or map connectivity and confirm the explorer stays visible at the newest accepted route position.
7. Restore service and confirm the watcher reconnects and drawing resumes automatically.
8. Briefly create a weak or noisy reading and confirm the explorer follows accepted route points instead of jumping to rejected GPS positions.

## Explored Area Performance Test

1. Load a large cumulative walking explored surface and pan and zoom the map.
2. Confirm the explored fill moves smoothly without thousands of rectangle seams flashing between cells.
3. Confirm narrow white channels do not remain inside a qualifying black discovered frontier.
4. Inspect an enclosed surface larger than the walking fill cap and confirm that it remains unfilled.
5. Start a recording and confirm each GPS update extends the combined saved/live surface without freezing or exposing seams.
6. Stop and save, then confirm the live corridor merges into the saved contour.
7. Run npm run test:geometry and confirm all contour, display-hole, loop-cap, open-path, and large-surface checks pass.
