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
2. Choose Walk, Wheel, or Car.
3. Confirm the version number appears under the app name.
4. Tap Start.
5. Wait for GPS to become ready.
6. Move at least 20-30 meters.
7. Confirm:
   - duration increases
   - points increase
   - distance increases
   - current speed appears
   - active path appears
   - explored cells appear
   - bottom controls show distance, duration, and Stop
   - recording details can be expanded to show points, speed, and GPS
8. Tap Stop.
9. Confirm the recording appears in History.

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
- OSM

Confirm each layer appears or disappears.

## OpenStreetMap Debug Matching Test

1. Wait for GPS to locate you.
2. Tap Show details.
3. Turn on OSM.
4. Tap Load in the OSM debug matching panel.
5. Confirm unmatched OSM street segments do not flood the map.
6. Record or view a route near loaded streets.
7. Confirm matched street segments can appear as green debug lines.
8. Restart the app and confirm loaded streets can reappear from the local cache.

Notes:

- The first load needs internet access.
- Nearby means a smaller local radius around your current position.
- Matched is the number of short OSM street segments close to your GPS path.
- Street dist. is matched OSM segment distance, not the same thing as recording distance.
- Matching is V1 proximity matching, so it can be imperfect near parallel roads.
- OSM streets are cached locally and can be refetched later.
- OSM is hidden analysis/debug data; cells and paths are still the main exploration view.

## Completion Screen Test

1. Tap Completion.
2. Change Scope between Country, City, and District.
3. Change Mode between Walk, Wheel, Car, and All.
4. Confirm stats load without crashing even when no cached zones exist.
5. Confirm explored cells, direct GPS cells, loop-filled cells, distance, and recordings are shown.

## Loop Fill Test

1. Load nearby OSM data from the OSM debug layer.
2. Record a closed loop of at least 150m.
3. Stop the recording.
4. Confirm normal GPS cells still appear.
5. If the loop contains little unwalked walkable street length, confirm subtle loop-fill cells appear inside the polygon.
6. If the loop contains many unwalked streets, confirm the polygon is not filled.
7. Confirm a recording with a rejected GPS gap does not fill cells across that gap.

## GPS Gap Safety Test

1. Record normally and confirm short GPS segments still draw as paths.
2. If a recording has a long GPS gap, confirm the app does not draw a straight diagonal across it.
3. Confirm explored cells are not filled along the missing diagonal.
4. Confirm future inferred paths are not shown unless street routing is configured.

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
