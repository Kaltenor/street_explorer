# Development Build

Development builds are required for realistic background-location testing. Expo Go is useful for quick foreground testing, but it does not fully represent an app with native background location permissions.

## Why This Matters

Street Explorer needs a development build to test:

- recording while the iPhone is locked
- iOS background location permission
- iOS background location indicator
- recovery after background recording
- native modules such as `expo-task-manager` and `expo-dev-client`

## Prerequisites

- Expo account
- EAS CLI
- Apple Developer Program membership for physical iPhone builds
- iPhone registered for internal distribution if EAS asks for it

Expo's docs note that installing a development build on a physical iOS device requires an active Apple Developer Program subscription.

## Profiles

Configured in `eas.json`:

- `development`: physical iOS development build
- `development-simulator`: iOS simulator development build
- `preview`: internal distribution
- `production`: production build placeholder

## Build For Physical iPhone

```powershell
cd W:\street_explorer
npx eas-cli login
npx eas-cli build --platform ios --profile development
```

EAS will guide you through Apple credentials and device registration.

After the build finishes, install it on the iPhone using the QR/link from Expo.

Then start the Metro server for the dev client:

```powershell
npx expo start --dev-client
```

Open the installed Street Explorer development build on the iPhone and connect to the local dev server.

## Build For iOS Simulator

This does not test real locked-screen iPhone behavior, but it can validate that the dev client builds.

```powershell
cd W:\street_explorer
npx eas-cli build --platform ios --profile development-simulator
```

## What To Test

1. Install the development build on the iPhone.
2. Launch from the development build, not Expo Go.
3. Grant foreground and background location permissions if prompted.
4. Before recording, confirm the player icon appears and the map centers on a usable current fix, then recenters if a substantially more accurate fix arrives before you move the map.
5. Start a Walk and, for the long-route check, collect more than 1,000 accepted points.
6. Interrupt location service or connectivity and confirm the marker remains on the last accepted route point, settles its movement animation, and keeps the existing route visible.
7. Restore service and confirm drawing reconnects automatically without a missing segment or unsafe outage diagonal.
8. Lock or background the phone for several minutes while moving.
9. Reopen the app and allow the foreground/background tails to reconcile.
10. Confirm:
   - points increased
   - distance increased
   - explored cells increased
   - the entire route remains continuous at every zoom
   - no stale background setup restarts after the recording changes state
11. Tap Stop, choose Continue, and confirm recording continues.
12. Tap Stop again immediately after a lock/unlock handoff, hold Quit, and confirm the route saves only after entered handlers, the atomically published background outbox, and raw-observation-derived queued writes finish.
13. Force-close mid-recording and confirm recovery offers Resume, Finish, and Discard without losing the saved tail.
14. Force-close once more just after finalization, including with a delayed background event, and confirm relaunch merges the owner-bound or uniquely timestamp-matched journaled tail and repairs route/exploration caches without changing an imported frozen route that has no new GPS source.
15. Stop a very short recording near a delayed native callback and confirm a late second point within five minutes can safely promote the hidden recording instead of being lost.
16. While recording, try Backup and confirm it is blocked; after Stop has fully settled, confirm export succeeds and restore cannot accept an unfinished-session backup.

## Expected Limitation

If running in Expo Go, the app may show that background tracking is unavailable. That is expected. Use the development build for real background testing.
