# Development Build

Development builds are required for realistic background-location testing. Expo Go is useful for quick foreground testing, but it does not fully represent an app with native background location permissions.

## Why This Matters

Street Explorer needs a development build to test:

- recording while the iPhone is locked
- iOS background location permission
- iOS background location indicator
- recovery after background recording
- native modules such as `expo-task-manager` and `expo-dev-client`
- the reward-only in-app Wikipedia frame through `react-native-webview`
- Atlas page-turn navigation plus the two-second stereo medal orchestral cue and enclosure/expedition reward feedback through `expo-audio` and `expo-haptics`, including the separately persisted Sound effects and Haptics switches
- fixed 56-point seven-destination Atlas footer navigation, explicit Map selection, direct page switching without dock movement, return-triggered map-title enlargement, active-walk HUD reshuffling, map hold previews, and safe-area/Reduce Motion behavior
- automatic localized player speech for recording lifecycle, distance, exploration, revisit, stationary, GPS, and randomized cheering behavior, including the isolated continuously tracked 244-by-128 marker whose original panel and arrow move as one rigid unit, the required Apple Maps native offset that places its arrow tip on the hat, child-only hiding, elapsed-time typewriter catch-up under background load, priority, auto-dismissal, no native callout camera repositioning, and Reduce Motion
- cold-launch objective selection from the initial foreground fix, including permission and boundary-fetch fallbacks
- live and retroactive Explorer Score presentation in Details and the idle Field Log, including 200 points per permanent expedition seal and exact enclosure/expedition stamp awards
- Daylight-specific stamp lettering contrast against the unchanged navy seal artwork
- active-city loading across bundled France and the checksum-verified Belgium, Germany, Italy, Netherlands, and Spain country packs, including first-download, retry, and offline-cache behavior
- migration 31 on an affected profile with three legacy current-day expedition offers: the database must retain active/history/seals while the selected district immediately regenerates five viable choices
- migrations 32–35 and native MapKit verification for Forbidden Zones: schema-ledger collision/orphan-cell repair, idle-only Field Log selection, exclusive long-press routing, merged purple rendering, confirmed child-first removal/recreation, and immediate district/city denominator refresh
- native MapKit palette verification that walked and normal loop-filled surfaces use the original zoom-aware burnt-orange fill in both appearances, while today's cells remain gold and Forbidden Zones remain purple
- automatic all-available-city discovered-area medal awards, complete boundary-backed active-city district filters, the offline All Cities unlocked collection, and persisted concurrent expedition selection
- the lightweight React `assets/loading-screen3.jpg`, root-level presentation before database/font/map readiness gates, one launch-wide clean-background second without a repeated React-handoff delay, native-thread localized phrase reveal, delayed Press to start pulse, strictly post-press loading state, independent safe-corner version, slow map fade, and Reduce Motion behavior

Whenever a native dependency is added or changed, rebuild and reinstall the development build to exercise it. Restarting Metro updates JavaScript and assets only; it cannot add a native module to an already-installed binary. Version 0.21.0 added `react-native-webview`; the clean-cache build 159 is the validated baseline for the embedded Wikipedia frame. Version 0.21.1 made that package lazy so older clients start safely, while version 0.21.3 uses a non-throwing `RNCWebViewModule` TurboModule preflight before the guarded package load. Genuinely older binaries therefore keep the quiet default-browser fallback without surfacing a native-module LogBox. Street Explorer also treats unavailable medal/reward sound and haptics as optional.


Backup V5 compression uses the pure-JavaScript `fflate` package. After `npm install`, an already-installed compatible development client can test V5 through Metro; this feature alone does not consume another EAS build.
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
npx --yes eas-cli@latest login
npx --yes eas-cli@latest build --platform ios --profile development
```

EAS will guide you through Apple credentials and device registration.

After the build finishes, install it on the iPhone using the QR/link from Expo.

Then start the Metro server for the dev client:

```powershell
npx expo start --dev-client
```

Open the installed Street Explorer development build on the iPhone and connect to the local dev server.

## Validate The Native Launch Screen

Expo development clients can display their own startup screen and cannot reliably prove what the OS-owned preview/production launch frame contains. To validate the explicit `expo-splash-screen` configuration and `assets/mapbound-native-splash.png`, remove the older app from the phone and install a fresh preview build:

```powershell
cd W:\street_explorer
npm run build:ios:preview
```

Cold-launch that installed build directly from its icon without connecting Metro. Build 202 or newer must show Mapbound immediately and must never show the retired Street Explorer artwork. Use a production build for final release approval.

## Build For iOS Simulator

This does not test real locked-screen iPhone behavior, but it can validate that the dev client builds.

```powershell
cd W:\street_explorer
npx --yes eas-cli@latest build --platform ios --profile development-simulator
```

## What To Test

1. Install the development build on the iPhone.
2. Launch from the development build, not Expo Go.
3. Grant foreground and background location permissions if prompted.
4. Before recording, save an objective in another city and relaunch inside a known official level-9 district. Confirm the launch screen becomes tappable only after the initial fix resolves, the containing district replaces the saved objective without a selection stamp, its city is the only boundary context, the four-direction pixel character appears, and the map centers on the usable current fix. Relaunch once with location denied and once with an uncached boundary plus networking disabled; confirm both failures preserve the saved objective. Restore access and confirm a substantially more accurate fix can still recenter the player before you move the map.
5. Start a Walk while saved data is still hydrating, change direction, and confirm the matching north/east/south/west three-frame walking cycle uses its short overlap handoff continuously with no disappearing frames or lasting double silhouettes; verify each one-second location update glides instead of jumping. Confirm the fixed-size localized parchment bubble opens above the character with its arrow tip touching the top center of the hat, and catches up to elapsed 38ms-per-character progress whenever background work delays a timer instead of continuing at an extremely slow callback-count pace. Let it pause and disappear, then Stop and confirm the closing bubble retains that contact and never flashes at the upper-left corner. Pan near every edge during a message and confirm no automatic recenter occurs. Continue long enough to observe distance, new-ground, revisit, stationary, GPS-warning, and randomized cheer reactions without overlap; repeat in French and with Reduce Motion. For the long-route check, collect more than 1,000 accepted points.
6. Walk at least 200m, Stop, and immediately start another Walk. Continue for at least one minute and confirm the single player remains roughly 64 points wide, stays visible without flashing or leaving fragments, changes facing direction, and never becomes an empty annotation while distance, steps, and Good GPS continue. Confirm the app remains stable for the complete sequence.
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
14. Force-close mid-recording and confirm Recovery V2 opens full-screen with the complete saved route, start/end markers, accurate distance/point/last-fix metrics, and an Active, Interrupted, or Uncertain background-service status. Confirm the recommended action matches the status, all three actions remain available, and Finish requires an editable date/time-based name.
15. Force-close once more just after finalization, including with a delayed background event, and confirm relaunch merges the owner-bound or uniquely timestamp-matched journaled tail and repairs route/exploration caches without changing an imported frozen route that has no new GPS source.
16. Stop a very short recording near a delayed native callback and confirm a late second point within five minutes can safely promote the hidden recording instead of being lost.
17. While recording, try Backup and confirm it is blocked; after Stop, confirm V5 opens the iOS share sheet even if a too-short recording remains hidden in its late-GPS recovery window. Save the `.streetexplorer` file, select that same Files copy in the required verification picker, and confirm success is reported only after the full checksum pass. Confirm an old orphan row with identical start/end timestamps does not trigger an active-recording error. If export fails, confirm the alert names Prepare, Write, Share, or Verify and includes a technical detail.
18. Confirm the root-level portrait presentation begins before database, font, or map readiness and remains contained and completely text-free for one second from launch. On a slow development handoff that already exceeds that budget, verify the localized subtitle begins as soon as the React artwork is decoded rather than waiting another second. The subtitle must perform a smooth roughly one-second cyan Walk, gold Explore, parchment Reveal stagger, followed by a half-second quiet beat and the pulsing Press to start prompt. No spinner, loading copy, or other preparation feedback may appear before pressing. Press once while startup is deliberately unfinished: the same splash must remain, the prompt must become the localized loading row, and readiness must automatically begin a slow fade into the map. Relaunch after preparation is cached and press again: the loading row must be skipped and the slow fade must begin immediately. The half-size version must remain in the safe bottom-right corner. Repeat with Reduce Motion and expect identical state ordering, final subtitle states, a steady prompt, and the same fade. On an upgraded profile with locked landmarks already inside persisted orange discovered tiles, relaunch offline and verify those matches are automatically awarded across every bundled city and already-installed country pack without fetching an absent pack. Continue through the queued presentations, then open Medals and verify localized names retain French accents and the horizontal All/numbered-district chips remain fully visible and vertically centered. Lyon must list districts 1 through 9 and Paris 1 through 20, including any zero-medal district. Switch to All Cities and verify the launch awards are grouped by city without locked entries; relaunch again and confirm no duplicate awards or presentations.
19. Before collecting, tap a locked landmark marker and confirm its callout shows the landmark name plus localized Locked status without opening Medals. Discover that active-city anchor tile during a short valid walk without reaching 80m or closing a loop and confirm the medal unlocks live with exactly one clean two-second orchestral cue; after Continue, verify the 3D medal flies to the measured Medal tab and its marker/card remain unlocked. Then complete an 80m+ loop around a separate interior landmark and confirm enclosure collection still works. Tap either collected marker and confirm it opens the focused medal page. Open the collection and confirm permanent Unlocked and Locked sections appear in All and in the relevant numbered district.
20. Confirm the map shows exactly all nine Lyon arrondissement outlines with quiet 1.5-point copper strokes, strengthens only the selected district to 3 points, and draws one separate 3-point wine perimeter around the whole city that strengthens to 4 points for a city objective; the adjacent Oullins and Pierre-Benite delegated-commune polygons must not appear even with a pre-v0.16.11 cache. Keep the compact Lyon medal progress card and one side flag visible. Long-press Lyon districts sequentially and confirm each switches directly with no scope chooser, exactly one parchment selection wash remains, and every outline stays visible. Long-press a Villeurbanne district and confirm the District/City chooser appears because the held city differs; after choosing a scope, Lyon's native boundary polygons disappear completely before Villeurbanne becomes the sole boundary context, explored territory remains, and the medal rail/collection switch from Lyon 44 to Villeurbanne 14. Select a Villeurbanne district and confirm its parent city keeps the Villeurbanne album active; switch back to Lyon and confirm Lyon 44 returns without losing either city's progress. Confirm each selection shows the 20%-smaller hand-inked cartographer seal centered between the measured top HUD and bottom controls; fitted outlined wording must remain inside its navy center, and a cold first display must keep the whole surface hidden until artwork and text strike, compress, and rebound together with the existing sound/haptic/duration. Touch the map once and confirm the full wordmark contracts without colliding with the medal/objective HUD; confirm Map/Carte is selected in the fixed thicker footer below the Field Log, then open each bottom destination and confirm the footer stays at identical coordinates without moving or fading while only its selected tab expands to a localized label. Rapidly long-press different areas and confirm only the final selection, boundary context, album, and percentage survive. Tap the flag twice to show and hide the objective without clearing it. Verify layers remain configurable in Options, Stop and recording-summary dialogs use the compact textured Atlas treatment, and technical recording data remains available through History > Diagnostics or a recording's Technical details.

21. With a large history, switch Paths among Today, Last 7 days, Selected, and All. Confirm each scope renders the expected routes, History scrolls smoothly, and returning from History or Completion restores map gestures without a multi-second stall.
22. Zoom the idle map out to a city-wide view and move it away from the player, then tap Start. Confirm the camera returns to the normal walking-scale zoom, the persistent player is back to its previous visible size, and accepted points resume auto-following. During a long active walk with continuous GPS delivery, confirm the player and gold active route react immediately while the burnt-orange explored surface refreshes repeatedly on its roughly 650ms cadence. Close a qualifying enclosure, keep moving, and confirm it fills before Stop, remains filled immediately after Stop, and needs no restart. Medal evaluation may use the same short settle interval. Watch development logs for repeated `[perf]` slow-operation or render-count messages and capture any sustained spikes.
23. Export a large Backup V5 after Stop and confirm bounded compression, external Files verification, and restore complete without a memory warning. With more than 20 walks, confirm older physical blocks do not create merged History entries. Compare the iOS export asset list and confirm Ionicons is the only bundled `@expo/vector-icons` font family.
24. Open Completion with a boundary refresh older than 30 days and confirm one automatic refresh loads every district relation in the containing city, the last-success date updates, incomplete OSM relations remain display-only, and permanent district/city completion rollups survive cache clearing and a Backup V5 restore.
25. Finish a walk containing a suspicious GPS gap and confirm its bounded street-topology lookup does not delay ordinary continuous saves. In History, verify the Street bridges totals and per-bridge Technical details; confirm an overpass is not joined to the street below. Tap Reprocess this walk beside Export GPX and confirm only that route is refreshed before shared totals reconcile; verify the action is disabled during an active walk, that any retryable Overpass 5xx response can transparently use the independent fallback, that a selected calculation error produces failure rather than success, and that full-history Reprocess recordings remains available in Options.
26. With Saved route disabled, open a History recording and tap Focus on map. Confirm the map immediately fits that recording with Paths set to Selected and the route visible. Repeat with a walk crossing local midnight and confirm the Today scope retains it after midnight.
27. Compare the main-map HUD with Details and Completion: confirm the medal card, objective ledger, scope chooser, dock, flag, and walking field ledger share subtle navy paper grain, parchment/Cinzel identity text, restrained gold rules, and engraved active states. Confirm percentages, steps, and accuracy remain readable in the system face; the GPS border stays neutral while only its dot/label changes state color; vertical density is reduced without any bottom-dock, flag, close, or Start target dropping below 44 points.
27. On an idle upgraded build, open Completion and confirm Street Completion V2 finishes its frozen-route migration asynchronously, reports walked/loaded street distance plus percentage and completed streets, deduplicates a repeated route, rejects a perpendicular/parallel-road false match, and returns to pending without writing if a new walk starts.
28. Open Details, History, Completion, Expeditions, Medals, and Options and slowly drag right from the extreme left edge of the iPhone screen. Confirm a touch inside the first 20 points responds immediately, a horizontal drag beginning within 36 points captures after minimal movement, each page follows the finger over the map, a short drag springs back, and enough distance or a fast flick closes it. From a saved recording detail, confirm the first swipe returns to History and the second returns to the map. Confirm the Medals scope and district strips still scroll when the gesture starts outside the left edge, History cannot swipe away during a data operation, and Reduce Motion plus VoiceOver accessibility escape preserve the same Back behavior.
29. Upgrade a device with previously cached Lyon level-9/level-10 relations and wait for the automatic hierarchy refresh. Confirm Completion lists exactly the nine official Lyon arrondissements, Gerland and other level-10 neighborhoods do not appear as districts or objectives, the map draws only nine arrondissement outlines, and a long press in Gerland selects the 7th arrondissement. If Gerland was the saved objective before upgrading, confirm the objective clears without deleting other app data; disable the network during a retry and confirm legacy neighborhoods remain hidden until Refresh succeeds. Reopen and repeat after a Backup V5 restore, confirming hidden historical rows do not re-enter the visible district rollup.

30. Force-close and relaunch the map without touching it. Confirm the full wordmark is about 20% larger than the prior initial presentation, then touch the map once and confirm it returns to the established compact size. Open each Atlas destination and return with Map, Back, or the selected tab; each return must enlarge the title again until the next direct map touch, while tapping Map on the already-visible map does nothing. Start a walk and confirm the title fades/collapses completely, the medal/flag rail and objective ledger animate upward, and the Field Log settles downward against the unchanged usable navigation dock. Stop and confirm the compact title and normal spacing return. Repeat with Reduce Motion and expect immediate state changes. Confirm no content clips and every primary target remains at least 44 points high.

31. Inspect the four map stripes on an iPhone at normal and larger text sizes. Confirm each leaves the same narrow 7-point gutter at both screen edges and uses restrained 10-point corners without returning to the oversized bubble look. Tap the medal and integrated flag independently, show the objective, switch bottom destinations, and start/stop a walk; confirm the stripes remain separate, content does not clip, and touch targets remain comfortable.

32. Open Options and cycle between Explorator and Daylight. Confirm Daylight immediately changes the full Options page, status-bar foreground, all map HUD stripes, walking controls, native MapKit tiles, routes, territory, Details, History, Completion, Medals, diagnostics, recovery, and recording dialogs to the high-contrast light palette. Confirm Custom is absent and any previously stored Custom selection falls back to Explorator. Leave each available mode selected across separate force-close/relaunch cycles and confirm the checked radio state and complete visual mode persist. Toggle Sound effects and Haptics independently, verify navigation/rewards remain functional with either disabled, and confirm both values survive relaunch. Repeat the controls with VoiceOver and larger text, confirming each full row is tappable and its label, description, role, and checked state are announced without clipping.

33. In a development build with no active recording, disable networking and run **Reprocess this walk** from History. Confirm the normal failure alert appears without React Native's red LogBox overlay, the action becomes available again after dismissal, and the saved route/progress remain unchanged. Re-enable networking and retry successfully. Return to the map and confirm the integrated flag shares one uniform texture with the medal stripe while remaining independently tappable.
34. Exercise the v0.20.0 France-catalogue protocol in `docs/TESTING.md`: switch between supported top-100 communes and one unsupported commune, verify whole-city Paris/Marseille/Lyon, run the active-city historical scan twice, and verify district expedition medal availability. Confirm that only the active city's markers are mounted and that the second unchanged scan completes without walking the saved-history catalogue.

34. With no district objective selected, confirm the bottom dock permanently shows a compass Expeditions icon beside Details, History, Completion, and Medals. Tap it and verify the localized selected label, Atlas empty state, and Select a district handoff to Completion. Choose an official district, reopen Expeditions from both the compass icon and objective HUD, and confirm both paths show the same five unique daily choices from the 25-kind catalogue. Accept all five together, relaunch, and verify they remain active with independent progress; accept another mission in a second district and verify the active list retains both district names. Close once with Back and once with the iOS edge swipe; verify the selected tab collapses cleanly and no icon clips at normal or larger text sizes.
35. On clean-cache build 159 or newer, open an unlocked medal description and confirm its localized Wikipedia article morphs into the read-only in-app frame with no address bar, edit action, pop-up, external navigation, or shared browser session. Confirm locked medals expose no reader action. On a deliberately pre-WebView client, confirm the same JavaScript starts without LogBox and hands the unlocked article to the default browser.
36. Open Details on a profile with existing expedition seals and confirm each contributes 200 Explorer Points retroactively. Activate the day's three expeditions together where practical, complete them, and confirm each unique seal adds exactly 200 points and one `+200 PTS` reward stamp without a daily cap below the three available choices. Relaunch to verify no duplicate credit or lost active selection. In Daylight, trigger selection, enclosure, and expedition stamps and confirm their light gold/parchment lettering and dark outline remain readable against the navy center; switch back to Explorator and confirm its established stamp palette is unchanged.

## Expected Limitation

If running in Expo Go, the app may show that background tracking is unavailable. That is expected. Use the development build for real background testing.
