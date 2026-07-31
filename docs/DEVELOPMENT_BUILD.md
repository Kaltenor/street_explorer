# Development Build

Development builds are required for realistic background-location testing. Expo Go is useful for quick foreground testing, but it does not fully represent an app with native background location permissions.

## Why This Matters

Street Explorer needs a development build to test:

- recording while the iPhone is locked
- iOS background location permission
- iOS background location indicator
- recovery after background recording
- native modules such as `expo-task-manager` and `expo-dev-client`
- medal feedback through `expo-audio` and `expo-haptics`
- the configured portrait `assets/loading-screen2.png` splash asset

Whenever a native dependency is added or changed, rebuild and reinstall the development build. Restarting Metro updates JavaScript and assets only; it cannot add a native module to an already-installed binary. Street Explorer treats unavailable medal sound and haptics as optional so an older binary can still start safely.

Keep transitive native bridges on the same Expo SDK line. `expo-asset` and `expo-constants` are direct SDK 54 dependencies because `expo-audio` otherwise permits npm to select incompatible newer peer packages. Run `npx expo install --check` before producing a new development build.

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
4. Before recording, confirm the four-direction pixel character appears and the map centers on a usable current fix, then recenters if a substantially more accurate fix arrives before you move the map.
5. Start a Walk, change direction, and confirm the matching north/east/south/west three-frame walking cycle plays continuously with no disappearing frames; verify each one-second location update glides instead of jumping. For the long-route check, collect more than 1,000 accepted points.
6. Stop and immediately start another Walk; confirm the same native player marker remains visible throughout the transition without flashing, leaving fragments, or briefly reverting to an empty native image.
7. Interrupt location service or connectivity and confirm the marker remains on the last accepted route point and keeps its last rendered sprite after ten seconds; VoiceOver should describe it as the last known stale location.
8. Restore service and confirm the stale state clears and drawing reconnects automatically without a missing segment or unsafe outage diagonal.
9. Lock or background the phone for several minutes while moving.
10. Reopen the app and allow the foreground/background tails to reconcile.
11. Confirm:
   - points increased
   - distance increased
   - explored cells increased
   - the entire route remains continuous at every zoom
   - no stale background setup restarts after the recording changes state
12. Tap Stop, choose Continue, and confirm recording continues.
13. Tap Stop again immediately after a lock/unlock handoff, hold Quit, and confirm the route saves only after entered handlers, the atomically published background outbox, and raw-observation-derived queued writes finish. Confirm the report and Start control return immediately after that durable boundary, even if route cells, exact steps, medals, and objective stats are still reconciling. For a continuous 50m route, confirm logs and timing show no surrounding street-corridor inference.
14. Force-close mid-recording and confirm recovery offers Resume, Finish, and Discard without losing the saved tail.
15. Force-close once more just after finalization, including with a delayed background event, and confirm relaunch merges the owner-bound or uniquely timestamp-matched journaled tail and repairs route/exploration caches without changing an imported frozen route that has no new GPS source.
16. Stop a very short recording near a delayed native callback and confirm a late second point within five minutes can safely promote the hidden recording instead of being lost.
17. While recording, try Backup and confirm it is blocked; after Stop, confirm the verified JSON export opens the iOS share sheet even if a too-short recording remains hidden in its late-GPS recovery window, and confirm restore cannot accept an unfinished-session backup. Confirm an old orphan row with identical start/end timestamps does not trigger an active-recording error. If export fails, confirm the alert names Prepare, Write, or Share and includes a technical detail instead of the old generic message.
18. Confirm the updated portrait splash appears before the launch overlay, then open Medals and verify localized names retain French accents and the horizontal category chips remain fully visible and vertically centered.
19. During an active 80m+ loop around a landmark, confirm the medal unlocks in real time; after Continue, verify the 3D medal flies to the measured Medal tab and its marker/card remain unlocked. Open the collection and confirm permanent Unlocked and Locked sections appear in All and in the relevant category.
20. Confirm the map shows the compact Lyon medal progress card and only one side flag. Tap the progress card to open Medals; tap the flag twice to show and hide the current district objective without clearing it. Verify layers remain configurable in Options and technical recording data remains available through History > Diagnostics or a recording's Technical details.

21. With a large history, switch Paths among Today, Last 7 days, Selected, and All. Confirm each scope renders the expected routes, History scrolls smoothly, and returning from History or Completion restores map gestures without a multi-second stall.
22. During a long active walk, confirm the player and blue/red route react immediately while the red explored surface and medal evaluation settle within roughly 650ms. Watch development logs for repeated `[perf]` slow-operation or render-count messages and capture any sustained spikes.
23. Export a large Backup V4 after Stop and confirm the share sheet opens without a memory warning. Compare the iOS export asset list and confirm Ionicons is the only bundled `@expo/vector-icons` font family.
24. Open Completion with a boundary refresh older than 30 days and confirm one automatic refresh runs, the last-success date updates, incomplete OSM relations remain display-only, and permanent district/city completion rollups survive cache clearing and a Backup V4 restore.
25. Finish a walk containing a suspicious GPS gap and confirm its bounded street-topology lookup does not delay ordinary continuous saves. In History, verify the Street bridges totals and per-bridge Technical details; confirm an overpass is not joined to the street below and that the frozen result changes only after explicit Reprocess recordings.
26. With Saved route disabled, open a History recording and tap Focus on map. Confirm the map immediately fits that recording with Paths set to Selected and the route visible. Repeat with a walk crossing local midnight and confirm the Today scope retains it after midnight.
27. On an idle upgraded build, open Completion and confirm Street Completion V2 finishes its frozen-route migration asynchronously, reports walked/loaded street distance plus percentage and completed streets, deduplicates a repeated route, rejects a perpendicular/parallel-road false match, and returns to pending without writing if a new walk starts.

## Expected Limitation

If running in Expo Go, the app may show that background tracking is unavailable. That is expected. Use the development build for real background testing.
