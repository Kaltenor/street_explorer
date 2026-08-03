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
npm run test:backup
npm run test:geometry
npm run test:ui
npm run test:medals
npm run test:player
npx expo install --check
```

`test:player` verifies retained source/player assets, in-memory and durable trustworthy-location retention, all four directional idle and twelve walking frames inside one stable 64×64-point native map annotation, the 170ms opacity-only frame cadence, reliable GPS movement/heading fallback, launch gating, direct geographic anchoring during camera movement, camera-independent panning, background position flush, cold-launch restore, the native location fallback, removal of screen-space projection/auto-follow/animated coordinates/marker-image replacement, stale-GPS accessibility, and removal of the legacy player artwork. `test:geometry` also verifies that Stop presents the summary before deferred route/cache reconciliation.

`test:geometry` verifies Zone Boundary Completion V2 ring assembly, malformed-fragment rejection, refresh staleness, display-only fallback eligibility, denominator fingerprints, durable achievement/refresh schemas, rollups, and Backup V5 wiring.

`test:geometry` verifies Path Inference V3 ground-level geometric joins, rejects bridge/ground crossings, bounds compatible endpoint joins to 8m at medium confidence, and checks persisted topology/evidence wiring. It also verifies one-action saved-route focus and overlap-based Today path queries.

`test:geometry` additionally asserts the bounded performance architecture: localized duration timing, three-second/conditional tail synchronization, non-starving coalesced and memoized map surfaces, geometry-changing native polygon identities, anchor-gated medals, hidden-panel unmounting, History virtualization, scoped path SQL, migration indexes, efficient completion aggregates, concurrent startup drain, and render instrumentation.

`test:backup` verifies V5 hot/archive grouping, exact one-to-one logical session coverage, archive point limits, lossless raw/frozen/inferred route round trips including duplicate legacy point indexes, material compression versus duplicated V4 JSON, checksum corruption rejection, and consistent manifest totals.

`test:ui` verifies the five GPS presentation states and their accuracy/age boundaries, shared map path semantics, and summary-first route/report wiring.

`test:medals` verifies the configured replacement splash PNG, real-time award/repair wiring, the 3D flight-to-tab presentation, permanent Unlocked/Locked collection sections, the city medal HUD, the single objective toggle, streamlined navy/gold presentation wiring, Unicode catalogue copy, gameplay-equivalent exact and one-cell-tolerant closure, the 80m minimum, strict interior anchors, the 150,000m2 cap, missing-accuracy compatibility, and eligibility over previously mapped ground.

## Streamlined Interface Test

1. Enter the map and confirm the smaller logo leaves the map readable, the Lyon medal card shows the current collected/total count and progress bar, and the bottom destinations share one rounded navigation surface.
2. Tap the Lyon progress card and confirm Medals opens. In All and every category, confirm Unlocked and Locked headers remain visible with independent counts; unlocked cards appear first and show descriptions, while locked cards stay compact.
3. Confirm only one side flag remains. Tap it to hide and show the district or city objective card; verify the saved objective remains selected in Completion. With no objective, tap the flag and confirm Completion opens so one can be selected.
4. Open Options and confirm Paths, Explored Cells, and Pins remain independently configurable even though their three map shortcuts were removed. Confirm route-reprocessing maintenance is also available there.
5. Open Details and confirm everyday statistics and goals appear in consistent dark cards without map legends or GPS diagnostics. Open History, choose a recording, and confirm the route-quality summary is immediately visible while bridge, loop, and diagnostic evidence remains hidden until Technical details is expanded.
6. Confirm Completion keeps the compact zone measures, adds the Street Completion V2 card, and still omits fetched-source metadata and the old V1 rules explanation from the default flow.
7. With no active walk, confirm only today's steps and Start Walk are shown. During a walk, confirm distance, duration, steps, Stop, and the existing double-tap health details remain accessible.
8. Open recovery, diagnostics, stop confirmation, and recording summary surfaces and confirm the same navy/gold surfaces, rounded layout, readable contrast, and red-only destructive actions.

## UI Polish V2 Manual Test

Prerequisites: run the Street Explorer 0.12.0 JavaScript bundle in a compatible iOS development client, keep at least two saved walks including one with an inferred street section if available, enable the Paths and Explored Cells layers, and test once outdoors with location permission granted and once with permission denied. A simulator with Location set to None is useful for the Unavailable case. No network is required except when loading uncached map or OSM data.

1. Open the map with at least two saved routes. Expected: saved routes use restrained blue/teal/violet/orange variants, explored ground remains red, and today's explored overlay remains orange without competing with the navy/gold interface.
2. Open History and choose Focus on map for one route. Expected: the focused route is gold, other visible saved routes are dimmed, and starting a new recording draws its active route in green. Any topology-inferred section remains cyan rather than looking directly GPS-observed.
3. Open Details, History, and Completion in turn. Expected: every primary content card uses the same dark navy surface hierarchy, secondary cards are visibly raised without turning light, gold is reserved for selection/progress, text remains readable, and back navigation returns to the unchanged map.
4. In History, open a saved recording. Expected: the route color, name, quality badge, distance, duration, steps, loops, accepted points, hidden gaps, and inferred-section count are visible before technical details. Expand Technical details and confirm bridge evidence, loop diagnostics, frozen-route status, and the full quality score remain available.
5. Record and stop a short valid walk. Expected: the post-walk report opens at the durable save boundary, leads with its quality score and reason, keeps the four headline metrics prominent, and retains objective/loop progress plus Skip, Save, and naming actions.
6. Cold-start while the permission prompt or first fix is pending. Expected: the GPS badge says Acquiring in blue and exposes the same state to VoiceOver.
7. Grant permission and obtain an outdoor fix at 25m accuracy or better. Expected: the badge changes to Good in green and shows rounded accuracy. Move somewhere with accuracy worse than 25m but keep fixes arriving. Expected: it changes to Weak in orange; recording still follows the existing 30m acceptance safety limit.
8. While recording, interrupt fresh fixes for more than 12 seconds; while idle, repeat for more than 20 seconds. Expected: the badge changes to Stale in orange and reports the last-fix age without removing the last trustworthy player marker or existing route.
9. Deny foreground location permission. Expected: the badge says Denied in red and the existing permission guidance remains visible. Grant permission but provide no usable fix until the bounded initial lookup resolves, using simulator Location None if needed. Expected: the badge says Unavailable in gray rather than remaining indefinitely in Acquiring.
10. Force-close and reopen the app. Expected: saved routes, names, exploration, and reports remain unchanged; the GPS state is recalculated from the new permission/fix lifecycle instead of persisting a stale label. Repeat with larger text or VoiceOver and confirm badges, cards, and report actions remain readable and operable.

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
17. After a first walk of at least 200m, start another walk immediately and continue for at least one minute. Confirm the animated player remains approximately 64 points wide, faces the movement direction, cycles its three walking frames, and returns to a directional idle pose when stationary while the new distance, steps, and route continue normally.
18. Before and during that second walk, pan, zoom, and rotate the map repeatedly. Expected: the character stays attached to one geographic point and moves synchronously with the map; its offset from the native blue location dot stays constant until a new trustworthy GPS coordinate arrives. It must not freeze at an old screen position, teleport after the gesture, disappear, or recenter the camera. Pan far enough to move the player offscreen, then pan back and confirm it returns at the same map coordinate.
19. Force-close and reopen after a trustworthy fix. Expected: after the launch screen is dismissed, the player appears from the saved last position before a new fix is required. Start another walk and confirm the one-time recenter occurs, then pan and verify automatic camera following does not resume. Separately force-close during finalization, reopen, and confirm the session is either saved or offered for recovery, never silently lost.

## Player Animation V0.15.0 Manual Test

Prerequisites: run the 0.15.0 JavaScript bundle in a compatible iOS development client, grant foreground location permission, test outdoors with a fresh fix at 30m accuracy or better, and leave the native blue location indicator enabled. No network or cached OSM data is required. Use a route where several direction changes are safe and obvious.

1. Dismiss the launch screen while stationary. Expected: one approximately 64-point player appears at the restored or current coordinate in an idle pose; no walking-frame cycling occurs.
2. Without starting a recording, walk continuously for at least 15m. Expected: reliable GPS movement starts the three-frame animation at roughly 170ms per frame. Stop for at least four seconds while fixes continue; expected: animation settles to the idle pose without the marker disappearing.
3. Walk north, east, south, and west for enough distance to obtain a stable heading in each direction. Expected: the artwork changes to the matching direction and retains the most recent direction when returning to idle. A brief inaccurate heading may be corrected by the 3m displacement-bearing fallback.
4. Start a recording and repeat at least two direction changes. Expected: the same animation continues without a marker remount, while distance, steps, active route, explored cells, and objective progress continue updating normally.
5. While walking and animating, pan, zoom, and rotate the map repeatedly. Expected: the sprite remains attached to its MapKit coordinate and every frame stays the same 64-point size. It must not freeze at screen center, teleport after a gesture, disappear, or recenter the camera.
6. Stop and immediately start another recording. Expected: the existing marker survives the transition, returns to walking frames when movement resumes, and only the explicit Start action performs the one-time recenter.
7. Interrupt fresh GPS or move indoors until the fix is stale/too inaccurate. Expected: walking animation stops and the last directional idle layer remains visible with the stale-location accessibility label; the marker and existing route do not disappear.
8. Restore a reliable fix and move again. Expected: animation resumes without creating a second sprite or requiring a relaunch.
9. Force-close after a trustworthy fix, reopen, and dismiss the launch screen. Expected: one idle player appears at the durable last position before a new fix is required; a new reliable moving fix resumes the directional animation. Repeat once after travelling outside a recording to confirm animation is not recording-dependent.

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
12. During recording, keep moving through several rapid GPS fixes and confirm the player and active route move immediately while red/today contours refresh repeatedly at roughly 650ms intervals instead of waiting for GPS delivery to pause; medal collection may use the same short settle interval.
13. Confirm development logs do not show continuously increasing MapScreen/ExplorationMap render counts while the map is idle. Investigate any recurring `[perf]` operation above its printed threshold.
14. Export a large V5 backup and confirm bounded block compression completes without an iOS memory warning or empty file, then reselect the Files copy and confirm verification succeeds.

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

## Backup V5 Manual Test

Prerequisites: serve the Street Explorer 0.12.0 JavaScript bundle to the already-installed compatible development client (build 92 is sufficient; build 96 is the next release build), allow Files access, stop any active recording, keep one known-good V4 JSON backup for conversion, and ensure the device has enough free space for both the source and converted archive. For archive-block coverage, use a database with at least 25 finalized walks. Network and location permissions are not required for export or restore.

1. Start a recording, open History, and tap Backup. Expected: export is blocked and the active recording remains unchanged.
2. Stop and save the recording, reopen History, and note the walk count, names, point counts, medals, zone achievements, and one frozen route containing an inferred bridge. Expected: this is the baseline for lossless restore.
3. Tap Backup several times quickly. Expected: the first tap immediately shows Backup in progress, disables duplicate actions, and produces only one export. Choose Save to Files and save the `.streetexplorer` archive outside the app; after sharing, Files opens again for required verification and the app has not reported success yet.
4. Cancel that verification picker. Expected: Backup failed identifies the Verify stage and does not claim the cache-only file is safe.
5. Repeat Backup, save it to Files, then select that exact saved file in the verification picker. Expected: Backup verified reports its size, walk count, GPS-point count, and old-walk archive-block count.
6. Repeat once but select a different V5 file during verification. Expected: verification rejects the mismatched backup identity.
7. Force-close and reopen Street Explorer, then confirm the saved archive is still visible in Files. Expected: the external copy survives independently of the app cache.
8. Tap Restore, confirm replacement, and select the verified V5 archive. Expected: Restore in progress appears immediately after confirmation, repeated data-tool taps are disabled, and the app restores all logical walks with their original IDs/names/times/counts, frozen route geometry and inferred evidence, medals, and zone achievements; no monthly archive block appears as a fake recording.
9. Force-close and reopen after restore. Expected: the same restored history and map data persist, and derived exploration/street completion can rebuild from the exact frozen routes.
10. Duplicate and truncate or alter a V5 archive on a computer, return it to Files, and try Restore. Expected: checksum/footer verification rejects it before local data is replaced; the existing history remains intact.
11. In History, tap Convert V4, select the known-good complete V4 JSON, save the produced V5 file to Files, and reselect it for verification. Expected: conversion reports a verified V5 size/count summary without first importing V4 into the live database.
12. Restore the converted V5 archive. Expected: every V4 session and raw GPS point is present, route snapshots are unchanged, and the archive is materially smaller than the original 52 MB JSON when the source contained duplicated confirmed-route points.
13. Try Convert V4 with a V1-V3 file or incomplete JSON, and try Restore with any JSON file. Expected: both are rejected; restore accepts V5 only.
14. With at least 25 walks, repeat export/restore and inspect History. Expected: the newest 20 are stored as individual hot records, older walks share bounded monthly physical blocks, and all walks remain individually named/selectable/deletable.
15. Tap a recording and Export GPX. Expected: the existing GPX share/save flow still works.

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
6. Start recording, walk a qualifying loop that visibly closes and fills a new red area, and keep the recording active. Expected: after the closing cell is accepted, the HUD briefly calculates and then updates its percentage and remaining-cell count without Stop or relaunch. Stop and finalize the recording; expected: the same or reconciled durable percentage remains, and only durable 100% completion can create a permanent achievement.

## Explored Area Outline Test

1. Show explored cells on the map.
2. Confirm adjacent cells do not show internal borders.
3. Confirm a thin dark outline appears around every real red-to-unfilled frontier.
4. Confirm a retained oversized hole has a complete inner black outline.
5. Confirm a filled qualifying hole has no internal black outline or tiny reddish nested islands.
6. Reprocess a qualifying cumulative loop and confirm everything inside its exterior black border is a continuous solid fill with no white cracks.
7. Confirm an oversized loop remains unfilled under the walking area limit.
8. Inspect a long open walked path and confirm its red corridor is solid without internal holes.

## OpenStreetMap Analysis Test

1. Wait for GPS to locate you.
2. Open Completion and refresh boundaries if needed.
3. Confirm OSM boundary loading does not flood the main map with street lines.
4. Confirm OSM remains hidden analysis/debug data, not the primary gameplay overlay.

Notes:

- The first corridor load needs internet access; saved cached coverage remains usable offline.
- Street Completion V2 uses frozen-route overlap, nearest compatible direction, and deduplicated walked metres rather than whole-segment V1 proximity credit.
- Loaded street distance is the cached corridor denominator, not recording distance or full city street length.
- OSM streets can be refetched later; cells and confirmed/inferred saved paths remain the primary map view.

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
13. With at least 100 recordings and a large explored-cell ledger, open Completion repeatedly and confirm its full-screen transition remains smooth while aggregate values populate after the transition.
14. Confirm Completion scans still yield, cancel immediately on close, and do not block returning to the map.
15. Export Backup V5, clear data, restore it, and confirm permanent zone achievements and rollups return. Confirm V1-V3 files are rejected.
16. In Lyon 3e Arrondissement, refresh District boundaries and confirm the zone reports a percentage instead of Display-only/Unavailable, Set objective is enabled, and focusing it shows the real multipolygon rather than a rectangular bounds fallback.
17. Set Lyon 3e as the objective, clear only the boundary cache, force-close, reopen, and allow the automatic map fetch or tap Refresh. Confirm the saved objective HUD returns once the exact zone is cached. Then simulate an incomplete response for the same relation and confirm the exact cached boundary, denominator, and objective remain intact.
18. With internet and a current Lyon location, remain on the map until boundary loading settles. Confirm all nine arrondissement outlines are simultaneously visible, non-objective districts use thin muted strokes, and the objective district uses the stronger gold stroke.
19. Pan from Lyon 3e across several arrondissement boundaries and release the map. Confirm the saved objective name, gold outline, percentage, remaining-cell count, and today count never change merely because the viewport moved.
20. Long-press inside an adjacent arrondissement. Confirm haptic feedback occurs, the district immediately becomes the persisted objective, its gold outline appears, and the HUD shows Calculating until that district's percentage is ready.
21. When the held point has both district and city boundaries, confirm a compact scope picker offers separate District and City buttons. Tap City and confirm the city boundary becomes gold while all of its district outlines remain visible; repeat and choose District.
22. Rapidly long-press different districts or cities while an uncached boundary request is pending. Confirm an older lookup or percentage never restores an earlier name, scope, outline, remaining-cell count, or today count after the final selection finishes.
23. Force-close and reopen. Confirm the last long-pressed scope and area remain the saved objective and the selected city's cached district outlines return without requiring Completion to be opened.
24. Long-press inside a different city with district relations. Confirm that city's district group replaces the previous city outlines without mixing cached districts. Disable network, long-press an uncached area, and confirm an Area unavailable message appears without changing the existing objective.
25. Zoom out to a city-wide view and move the map away from the player, then tap Start with foreground location permission and a trustworthy fix. Confirm the camera recenters once at the normal walking-scale zoom and the player icon returns at its previous visible size. Pan immediately and confirm the camera stays under finger control instead of resuming follow. Repeat through Resume on a recoverable recording.
26. With a district objective selected, start a walk and extend an open red line through several new cells. Confirm the percentage HUD does not enter Calculating or change for those line-only additions. Close a qualifying loop that visibly fills new red ground and, without stopping, confirm the HUD now briefly shows Calculating and then increases the percentage/reduces remaining cells. Start another open segment, tap Stop, and confirm the finalized percentage updates once even though that segment did not close an area. Force-close before finalizing a separate closure and confirm its preview did not create a permanent 100% achievement from unfinished cells; recover or finalize it and confirm the durable percentage appears without another relaunch.

## Street Completion V2 Test

1. Upgrade an installation with several saved walks and cached OSM corridor data, wait on the idle map, then open Completion.
2. Confirm the OpenStreetMap streets card moves from calculating to ready without delaying map entry, changing recordings, or replacing frozen routes.
3. Confirm the card reports walked distance, loaded distance, percentage with up to one decimal, reached streets, and streets completed at 90%.
4. Confirm V1 evidence is shown after migration when the old proximity matcher had cached matches, but its whole-segment distance is not used as the V2 numerator.
5. Walk roughly half of one straight OSM way, Stop, reopen Completion after deferred processing, and confirm only proportional metres are credited rather than the whole way.
6. Repeat the same half in either direction and confirm walked metres do not double-count already covered bins.
7. Finish the remaining section and confirm the OSM way becomes complete once aggregate loaded coverage reaches at least 90%.
8. Walk one of two parallel streets less than 12m apart and confirm only the nearest direction-compatible street receives credit.
9. Cross a street perpendicularly at an intersection without following it and confirm the crossed street receives no directional coverage.
10. Confirm private, foot-prohibited, motorway, motorway-link, trunk, and trunk-link geometry does not enter progress.
11. Stop a walk and immediately start another while the rebuild is pending; confirm the worker returns to pending and does not calculate or replace SQLite progress during the active recording. Stop again and confirm processing resumes asynchronously.
12. Finish a recovered recording and confirm Start/map controls return without waiting for street aggregation.
13. Run Reprocess recordings and confirm the final dialog includes walked/loaded street distance, percentage, and completed-street count after route rebuilding.
14. Delete a recording and restore a Backup V5; confirm derived street progress rebuilds from the remaining/imported frozen routes while the recordings themselves remain unchanged.
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
4. Close the accepted boundary and continue moving for several GPS fixes instead of pausing. Confirm the medal still unlocks while the walk remains active within the short settle window: the map marker changes from a lock to a medal and the collection card becomes unlocked without waiting for Stop.
5. Confirm previously mapped red cells do not block the award. Repeat over an area visited before the medal feature and verify the new qualifying loop still unlocks it.
6. Confirm passing near the marker, leaving it on the boundary, walking less than 80m, leaving a gap larger than the normal seam tolerance, or exceeding 150,000m2 does not award it.
7. Confirm the metallic chime, success haptic, dark overlay, 3D rotating medal, localized title/description, and Continue control appear. Tap Continue and confirm the medal shrinks and flies into the measured Medal tab, which briefly pulses. With Reduce Motion enabled, confirm the initial reveal is static while the award remains usable.
8. Stop immediately after closing a qualifying loop and confirm the idempotent Stop-time safety evaluation still unlocks it if live evaluation did not finish. Repeat through recovered-recording finalization.
9. Unlock during an active walk, discard that walk, and confirm the medal remains earned and its acquisition event no longer depends on the deleted session.
10. Upgrade an installation containing an individually qualifying walk missed by v0.4; confirm the one-time gameplay-v2 repair awards it and presents it without requiring the walk to be repeated.
11. Open Medals on an installation with cumulative qualifying saved coverage and run Scan my walks; confirm it uses the same gameplay loop rules and the unique count does not increase when repeated.
12. Force-close while an award is presenting, reopen, enter through the launch screen, and confirm the pending award is presented again before being marked complete.
13. Export Backup V5, delete data, restore it, and confirm collection evidence, presentation state, and historical-scan state return. Confirm V1-V3 files are rejected.
14. Disable sound or haptics at the device level and confirm presentation still completes without trapping the UI.
## Loop Fill Test

1. Record a closed loop of at least 80m.
2. Stop the recording.
3. Confirm normal GPS cells still appear.
4. Confirm Stop does not automatically rebuild historical loops; open Details and run Reprocess recordings explicitly before validating loop-fill results.
5. Confirm interior loop-fill cells appear with the same visual style as normal explored cells.
6. Confirm a straight walk does not create loop fills after reprocessing.
7. Trace a qualifying enclosure while continuing to move after crossing the boundary. Confirm its red/today surface fills during the active walk without pausing for GPS, remains filled immediately after Stop, and does not require an app restart.
8. Open History, tap the recording, and confirm Loop cells and Loop result are shown.
9. Confirm a recording with a rejected GPS gap does not fill cells across that gap.
10. Record or reprocess a walk with multiple block loops and confirm History shows multiple filled loops.
11. Confirm obvious loops with tiny cell gaps still fill, unless the filled area would be too large.

## Reprocess Recordings Test

1. Connect the device to the internet and open Details.
2. Tap Reprocess recordings and confirm Details closes before the confirmation appears over the map.
3. Confirm the app explains that street coverage, frozen routes, explored cells, and loop fills will be rebuilt for walking history.
4. Tap Reprocess in the confirmation.
5. Confirm a blocking progress modal appears over the map and advances through preparation, one-time street coverage repair, route reconstruction with a completed/total counter, contour calculation, atomic saving, Street Completion V2 aggregation, and map refresh.
6. Confirm street repair uses one consolidated request rather than pausing for a download on every historical recording.
7. Confirm the successful summary reports the number of refreshed road segments.
8. Confirm routes containing plausible intervals previously hidden by the v0.3.50 legacy freeze become continuous street-matched corridors where OSM has a reliable route.
9. Confirm one deliberately malformed recording is reported as preserved while later recording calculations continue.
10. Confirm success always produces a detailed completion summary and failure always produces a visible error.
11. Confirm the summary shows checked recordings, preserved failures, filled loops, rejected loops, loop cells, direct/validated boundary cells, inferred cells, walked/loaded street distance, street percentage, completed streets, and previous/rebuilt totals.
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

## Recording Recovery V2 Test

Prerequisites: install development build 93 on a physical iPhone, grant precise foreground and Always background location, and use a test walk with at least two valid points. Internet access is optional because recovery uses persisted GPS and native task state.

1. Start a walk, travel for several minutes, lock the iPhone for part of it, then force-close or reload Street Explorer without pressing Stop.
2. Reopen the app and confirm Recovery opens automatically as a full-screen view before another walk can start.
3. Confirm the map previews the complete persisted route with start/end markers. For a recording over 300 points, confirm the preview and later Resume still retain the complete route; only rendering may be bounded.
4. Confirm distance, elapsed duration, persisted point count, and last-point time match the saved recording.
5. When the native task is verified running, confirm status is Active and Resume is the gold recommended action. When it is verified stopped, confirm status is Interrupted and Finish is recommended. If verification cannot run, confirm status is Uncertain and Finish is recommended.
6. In every status, confirm Resume, Finish, and Discard remain available.
7. Choose Resume. Confirm the old route is rebuilt into stable live chunks, distance continues from the persisted total, new points append normally, and the recovery screen closes.
8. Repeat the interruption and choose Finish. Confirm an editable date/time-based default name appears before finalization; change it and save.
9. Confirm the active marker clears only after durable finalization, the recording appears in History with the edited name, and reopening the app does not show recovery again.
10. Repeat Finish without changing the proposed name and confirm the generated name persists in History.
11. Repeat recovery and choose Discard. Confirm a destructive confirmation appears; cancel once and verify recovery remains, then confirm deletion and verify the walk disappears.
12. Induce or simulate a failed Resume, Finish, and Discard where practical. Confirm the authoritative unfinished recording remains available, background protection is restored when possible, and status updates to Active or Uncertain instead of silently losing the walk.
13. Confirm a recovered recording with fewer than two valid points follows the existing safe underfilled-recording behavior rather than appearing as a normal History walk.
14. Repeat with network disabled and confirm preview, status verification, Resume/Finish naming, and durable save do not depend on internet access.

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

## Static Player Overlay Test

1. Launch outdoors with foreground permission and confirm the CC0 top-down pixel character appears before recording.
2. Confirm the map initially centers on the current fix and the static 64×64-point character covers the native blue cursor.
3. Start recording and confirm the camera recenters once at walking scale. Immediately pan in several directions and confirm the camera never pulls back toward the player.
4. During pans, zooms, and rotations, confirm the sprite remains visible and stays attached to the same geographic position instead of sticking to screen center or disappearing. When that position leaves the viewport, the sprite should move naturally off-screen.
5. Walk and turn through several directions; confirm the single south-facing image remains stable with no frame changes, flashing, disappearance, or fragments.
6. Stop the walk and immediately start another; confirm the same overlay view returns after the one-time recenter without changing artwork.
7. Interrupt location or map connectivity and confirm the explorer stays visible at the newest trustworthy position.
8. Wait at least ten seconds without a fix and confirm the player keeps its last rendered sprite instead of disappearing; with VoiceOver, confirm the marker is announced as a stale last-known position.
9. Restore service and confirm the watcher reconnects, the accessible stale state clears, and drawing resumes automatically.
10. Briefly create a weak or noisy reading and confirm the explorer follows accepted route points instead of jumping to rejected GPS positions.
11. Run `npm run test:player` and confirm the asset/source regression checks pass.
12. With a Good fix, force-close and relaunch the app. Confirm the static sprite appears at the last trustworthy position even before a new GPS fix arrives; then Resume or start a new session and confirm the same sprite remains visible. If a newer fix arrives elsewhere, confirm the camera corrects once. Repeat while panning immediately and confirm that gesture cancels the correction without restarting auto-follow.
13. Repeat with Location temporarily denied after the first successful run. Confirm the stale last-known sprite remains visible after launch while the GPS badge reports Denied; restoring permission should update the same sprite without remounting it.

## Explored Area Performance Test

1. Load a large cumulative walking explored surface and pan and zoom the map.
2. Confirm the explored fill moves smoothly without thousands of rectangle seams flashing between cells.
3. Confirm narrow white channels do not remain inside a qualifying black discovered frontier.
4. Inspect an enclosed surface larger than the walking fill cap and confirm that it remains unfilled.
5. Start a recording and confirm each GPS update extends the combined saved/live surface without freezing or exposing seams.
6. Stop and save, then confirm the live corridor merges into the saved contour.
7. Run npm run test:geometry and confirm all contour, display-hole, loop-cap, open-path, and large-surface checks pass.
