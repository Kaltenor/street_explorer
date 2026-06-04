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
2. On the launch screen, choose Walk, Wheel, or Car if needed.
3. Tap Press to start.
4. Confirm the version number appears under the transparent logo.
5. Tap Start.
6. Wait for GPS to become ready.
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
3. Confirm a thin dark outline appears only around the outside edge of explored areas.

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

1. View or reprocess a route with sparse but plausible GPS updates.
2. Confirm normal walked sections still render and create explored cells.
3. View a route with an extreme GPS outage or impossible jump.
4. Confirm the app does not draw a straight diagonal across the missing section.
5. Confirm no inferred street path is shown in the normal gameplay map.
6. Confirm Completion does not gain inferred cells from OSM routing.

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
2. Tap Reprocess recordings.
3. Confirm the app asks before rebuilding saved exploration data for the current mode.
4. Tap Reprocess.
5. Confirm the summary shows checked recordings, filled loops, rejected loops, and loop cells added.
6. Confirm areas enclosed by cells from multiple recordings can fill.

## GPS Gap Safety Test

1. Record normally and confirm short GPS segments still draw as paths.
2. If a recording has a long GPS gap, confirm the app does not draw a straight diagonal across it.
3. Confirm explored cells are not filled along the missing diagonal.
4. Confirm inferred paths are not shown in normal gameplay.

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
