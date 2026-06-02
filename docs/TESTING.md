# Testing

## Run The App

```powershell
cd W:\street_explorer
npx expo start
```

If the phone cannot connect reliably:

```powershell
npx expo start --tunnel
```

If stale errors appear:

```powershell
npx expo start --clear
```

## Basic Recording Test

1. Open the app in Expo Go.
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
8. Tap Stop.
9. Confirm the recording appears in History.

## History Test

1. Open History.
2. Tap a recording.
3. Confirm details expand:
   - started time
   - ended time
   - distance
   - duration
4. Rename the recording.
5. Tap Save.
6. Confirm the route is highlighted on the map.
7. Delete a bad recording if needed.

## Layer Controls Test

Toggle:

- Paths
- Cells
- Pins
- Streets

Confirm each layer appears or disappears.

The Streets layer currently only shows a status panel. Real street geometry is not loaded yet.

## Recovery Test

1. Start a recording.
2. Force close or reload the app without pressing Stop.
3. Reopen the app.
4. Confirm it asks about an unfinished recording.
5. Choose Resume or Finish.

## Background Tracking Notes

Background tracking is configured but may not fully work in Expo Go on iOS.

For reliable locked-screen recording, create a development build later and test:

- iPhone locked
- app in background
- app fully reopened after a walk
- permission prompts
- iOS location indicator

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
npx expo start --clear
```

### Expo Go Says SDK Is Unsupported

This project is pinned to Expo SDK 54 because that is the supported Expo Go SDK for this setup.
