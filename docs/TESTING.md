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
2. Confirm the branded loading overlay remains while required map, saved-data, permission, and initial-location work is pending.
3. Confirm there is no Press to start prompt.
4. Confirm the app opens the map automatically as soon as loading completes.
5. Confirm the version number appears under the transparent logo.
6. Tap Start and wait for GPS to become ready.
7. Move at least 20-30 meters.
8. Confirm:
   - duration increases
   - steps today is visible for Walk mode
   - distance increases
   - active path appears
   - explored cells appear
   - bottom controls show distance, duration, and Stop
9. Tap Stop.
10. Confirm a blocking Computing information dialog appears.
11. Confirm the recording report appears with the Add new data on map button.
12. Confirm the recording appears in History.

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

1. Open History.
2. Tap Backup.
3. Confirm iOS shows a share/save sheet for a JSON backup.
4. Tap a recording.
5. Tap Export GPX.
6. Confirm iOS shows a share/save sheet for a GPX file.
7. Return to History.
8. Tap Restore.
9. Pick a Street Explorer JSON backup.
10. Confirm recordings reload after restore.

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
7. Confirm an oversized loop remains unfilled under the existing activity-mode limit.
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
6. Change Mode between Walk, Wheel, Car, and All.
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
5. Confirm the stop-walk report mentions whether loops were filled, rejected, or not detected.
6. Confirm interior loop-fill cells appear with the same visual style as normal explored cells.
7. Confirm a straight walk does not create loop fills after reprocessing.
8. Open History, tap the recording, and confirm Loop cells and Loop result are shown.
9. Confirm a recording with a rejected GPS gap does not fill cells across that gap.
10. Record or reprocess a walk with multiple block loops and confirm History shows multiple filled loops.
11. Confirm obvious loops with tiny cell gaps still fill, unless the filled area would be too large.

## Reprocess Recordings Test

1. Open Details.
2. Tap Reprocess recordings and confirm Details closes before the confirmation appears over the map.
3. Confirm the app explains that frozen routes, explored cells, and loop fills will be rebuilt for the current mode.
4. Tap Reprocess in the confirmation.
5. Confirm a blocking progress modal appears over the map and advances through preparation, cache-only route reconstruction with a completed/total counter, contour calculation, atomic saving, and map refresh.
6. Confirm Reprocess performs no historical network download and completes substantially faster than the previous per-recording refresh workflow.
7. Confirm one deliberately malformed/unavailable recording is reported as preserved while later recordings continue.
8. Confirm success always produces a detailed completion summary and failure always produces a visible error.
9. Confirm historical high/medium street-matched gaps become continuous inferred corridors where a reliable cached route exists.
10. Confirm the summary shows checked recordings, preserved failures, filled loops, rejected loops, loop cells, direct/validated boundary cells, inferred cells, and previous/rebuilt totals.
11. Confirm independently enclosed qualifying areas count toward completion immediately and that the percentage matches the solid red surface.
12. If the rebuilt total is below the previous total, confirm the summary reports a safety stop and the existing percentage does not decrease.
13. Confirm areas enclosed by direct and inferred cells from multiple recordings can fill.
14. Confirm high-confidence street matches close only short endpoint seams and unmatched gaps never draw a straight building shortcut.
15. Pan or reload without reprocessing and confirm accepted rebuilt routes stay frozen.
16. Repeat offline and confirm cache-only reprocessing behaves identically.
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
   - mode
   - distance
   - duration
   - point count
   - last GPS point time
6. Choose Resume and confirm recording continues.
7. Repeat the test and choose Finish & Save.
8. Repeat the test and choose Discard.

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
- Mode speed filter rejected a jump.
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
2. Stop immediately after returning to the foreground.
3. Confirm the final point, distance, and saved route agree with the live trace.
4. Confirm History contains no doubled points or backward timestamp jumps.

## Animated Player Marker Test

1. Start a recording outdoors with a good GPS signal.
2. Confirm the native blue location cursor is replaced by the top-down explorer marker.
3. Walk straight for several metres and confirm the explorer gently animates and faces the direction of travel.
4. Turn through north (359 to 0 degrees) and confirm the explorer takes the short rotation without spinning backward.
5. Stop moving and confirm the movement animation settles while the last reliable heading is retained.
6. Briefly create a weak or noisy reading and confirm the explorer follows accepted route points instead of jumping to rejected GPS positions.
## Explored Area Performance Test

1. Load a mode with a large cumulative explored surface and pan and zoom the map.
2. Confirm the explored fill moves smoothly without thousands of rectangle seams flashing between cells.
3. Confirm narrow white channels do not remain inside a qualifying black discovered frontier.
4. Inspect an enclosed surface larger than the current mode's fill cap and confirm that it remains unfilled.
5. Start a recording and confirm each GPS update adds the live corridor without freezing or rebuilding the full saved surface.
6. Stop and save, then confirm the live corridor merges into the saved contour.
7. Run npm run test:geometry and confirm all contour, display-hole, loop-cap, open-path, and large-surface checks pass.
