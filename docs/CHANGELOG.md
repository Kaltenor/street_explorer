# Changelog

## v0.6.6

Optimized:

- Kept player movement and the active route immediate while debouncing expensive red exploration/today contours and live medal enclosure analysis by 650ms; medal evaluation first checks whether an eligible landmark anchor is inside the boundary bounds.
- Memoized the large exploration overlay, added development-only render/timing counters, moved the one-second duration clock into Walk Controls, reduced inactive tail polling to three seconds, and avoided the session query when no new GPS point exists.
- Unmounted hidden full-screen panels and virtualized History rows so returning to the map no longer reconciles inactive menus or every saved recording card.
- Scoped Paths database loading to All, Today, Last 7 days, or Selected; removed history-sized SQL placeholder lists; added exploration/session covering indexes; and replaced expensive string/date distinct queries plus row-multiplying loop aggregates.
- Mounted the map once database/language initialization completes while the background outbox drain continues concurrently behind the existing recovery gate.
- Streamed Backup V3 arrays to the cache file to avoid a second monolithic JSON allocation, and imported Ionicons directly so Expo does not bundle unused icon families.
- Added focused performance regression assertions while preserving GPS accuracy, route safety, exploration geometry, and medal qualification rules.
- Synchronized the app version to 0.6.6, iOS build 83, and Android version code 83.

## v0.6.5

Fixed:

- Backup snapshot preparation now identifies an active walk from the authoritative active-recording setting inside the same exclusive transaction instead of treating every row whose start and end timestamps match as active.
- Orphan unfinished rows that are not visible in History are excluded consistently with their GPS points, frozen routes, and recording-linked medal events, while every visible finalized recording remains in the backup.
- Added regression coverage for the exact device-reported false-positive active-recording failure.
- Synchronized the app version to 0.6.5, iOS build 82, and Android version code 82.

## v0.6.4

Fixed:

- Backup export now uses Expo's current file API and its supported cache directory instead of the legacy file-system bridge that could fail before opening the iOS share sheet.
- The exporter verifies that a non-empty JSON file exists before sharing it.
- Backup failures now identify the preparation, file-write, or iOS-sharing stage and include the underlying technical detail, replacing the unactionable generic error.
- Added regression coverage for the modern verified backup path and synchronized the app version to 0.6.4, iOS build 81, and Android version code 81.

## v0.6.3

Fixed:

- Stop now returns the recording summary and Start control immediately after native tracking shutdown, queued GPS flush, durable session finalization, and recovery-setting cleanup.
- Route inference, exact step reconciliation, medal safety evaluation, objective recalculation, and full saved-data refresh now continue asynchronously through the existing durable repair outbox instead of blocking short walks for several seconds. Continuous routes with no suspicious GPS gap also skip the unnecessary 450m street-corridor lookup and graph inference.
- Confirmed live exploration cells, History, and headline statistics transfer into saved UI state at the durable boundary, so the route does not blink out while derived caches finish.
- The native player annotation keeps its last already-rendered sprite when a fix becomes stale during Stop and uses a stable MapKit identifier, preventing the cursor from disappearing across Stop and the next Start.
- Added regression coverage for the immediate/deferred Stop boundary and persistent native sprite behavior.
- Synchronized the app version to 0.6.3, iOS build 80, and Android version code 80.

## v0.6.2

Fixed:

- Reproduced the reported player flicker from the 14-second garden screen recording: the GPS coordinate remained available while iOS intermittently dropped the nested animated custom-marker snapshot.
- Replaced the nested React Native marker subtree with precomposed 64x64 native annotation images for every idle, walking, and stale direction state; native snapshot tracking is now disabled.
- Added `Marker.Animated` coordinate interpolation so accepted one-second GPS updates glide for 250-900ms instead of visibly jumping. Moves above 60m still snap to avoid an unrealistic map-spanning animation.
- Preserved the last-trustworthy-position, Stop/Start continuity, four-direction walking animation, gold halo, and stale clock presentation.
- Expanded player regression checks to cover all native marker assets, `AnimatedRegion` smoothing, native image rendering, and removal of the fragile custom view.
- Synchronized the app version to `0.6.2`, iOS build `79`, and Android version code `79`.

## v0.6.1

Added:

- A freely licensed CC0 64x64 top-down pixel-art character with dedicated north, east, south, and west idle frames plus three-frame walking cycles.
- A subdued stale-location state with a slate halo, lower character opacity, clock badge, and accessible last-known-location label.
- A focused `npm run test:player` source/asset regression check and retained asset provenance in `assets/player/README.md`.

Fixed:

- The player marker now retains the newest trustworthy location through GPS interruptions and the Stop/Start recording transition instead of disappearing with active-route teardown.
- Reliable accepted route endpoints remain authoritative over weak raw fixes, while fresh non-recording movement can still update direction and animation.
- Native custom-marker view tracking remains enabled for the single animated player marker so iOS cannot cache or drop an empty/stale snapshot during frame and recording-state changes.
- Synchronized the app version to `0.6.1`, iOS build `78`, and Android version code `78`.

## v0.6.0

Added:

- Permanent Unlocked and Locked sections inside every Medal category, including compact empty states and counts.
- A persistent, tappable Lyon medal-progress card on the map with collected/total count and a gold progress bar.
- One map-side objective flag that toggles the current district-objective card and opens Completion when no objective exists.

Changed:

- Reworked the complete app presentation around the Medal screen navy/gold language, rounded cards, consistent spacing, and quieter borders.
- Reduced the map logo and consolidated bottom navigation into one pill-shaped control surface.
- Removed the three duplicate map-side layer buttons; Paths, Explored Cells, and Pins remain available in Options.
- Removed the objective-card close/clear button; the flag now hides and restores the card without deleting the saved objective.
- Simplified idle walk controls, the recording summary, Details, Completion, and History defaults while retaining maintenance and diagnostics behind Options or Technical details.
- Locked medal cards no longer reveal full descriptions; collected cards retain the richer description.
- Expanded focused source checks for the new collection sections, city HUD, single objective toggle, and streamlined presentation hierarchy.
- Synchronized the app version to `0.6.0`, iOS build `77`, and Android version code `77`.

## v0.5.1

Changed:

- Medal collection lists now place collected medals before locked medals in the full album and every category filter, while preserving catalogue order inside each group.
- Added a regression assertion for collected-first collection ordering.
- Synchronized the app version to `0.5.1`, iOS build `76`, and Android version code `76`.

## v0.5.0

Added:

- Real-time medal evaluation whenever an active walk's accepted boundary grows, with immediate marker and collection-state updates before Stop.
- A 3D medal reveal whose Continue action flies the medal into the measured Medal tab and briefly pulses the destination.
- A one-time gameplay-v2 repair that rechecks each finalized recording missed by the older strict evaluator, including the reported Institut Lumière walk.
- Regression coverage proving the updated 1320x2868 portrait PNG is the configured Expo splash asset.

Changed:

- Medal enclosure now uses the same 80m minimum, exact-contour-first one-cell seam tolerance, accepted route geometry, and 150,000m2 cap as normal gameplay.
- Previously mapped or previously enclosed ground no longer blocks a newly walked qualifying loop, and medals earned live remain durable if that active recording is later discarded.
- Stop and recovery evaluation remain idempotent safety nets, while the explicit cumulative historical scan uses the same gameplay loop rules.
- Preserved and bundled the user-updated `assets/loading-screen2.png` splash image.
- Synchronized the app version to `0.5.0`, iOS build `75`, and Android version code `75`.

## v0.4.5

Fixed:

- Restored every corrupted French accent and ligature in the bundled Lyon landmark catalogue, including `Fourvière`, `Théâtre`, `Musée`, and `œ`.
- Gave the Medals category scroller and chips explicit heights, centered alignment, and stable line height so iOS no longer clips their labels.
- Added medal-catalog regression checks for corrupted placeholder characters and representative Unicode names.
- Synchronized the app version to `0.4.5`, iOS build `74`, and Android version code `74`.

## v0.4.4

Documentation:

- Synchronized every product/developer Markdown source with the asynchronous Backup V3, lazy History, memoized map, and cancellable Completion behavior introduced by the v0.4.3 fixes.
- Corrected stale development-build and historical medal-plan wording about underfilled recovery tombstones and the current backup format.
- Synchronized the app version to `0.4.4`, iOS build `73`, and Android version code `73`.


## v0.4.3

Fixed:

- Backup now omits hidden underfilled late-GPS recovery tombstones instead of rejecting the whole export, writes compact JSON asynchronously to the share cache, and supplies the correct JSON share metadata.
- Backup V3 restore now retains frozen route snapshots instead of accepting them only from V2 files.
- History loads detailed GPS and route data only for the recording the user opens; opening History no longer loads every saved point or competes with Backup.
- The native map subtree is memoized with stable empty data and callbacks, so closing a full-screen menu does not reconcile every polygon, route, and marker.
- Completion zone scans run after transitions, yield periodically, stop when the menu closes, and no longer calculate the selected zone twice.
- Synchronized the app version to `0.4.3`, iOS build `72`, and Android version code `72`.


## v0.4.2

Fixed:

- Pinned `expo-asset` and `expo-constants` to their Expo SDK 54 versions so `expo-audio` cannot resolve Expo 57 native bridge packages in the SDK 54 runtime.
- Updated Expo to the dependency checker's expected SDK 54 patch release.
- Synchronized the app version to `0.4.2`, iOS build `71`, and Android version code `71`.


## v0.4.1

Fixed:

- Medal audio and haptics now load only when a collection celebration begins. An older development binary that does not yet contain the new native modules can launch normally and falls back silently until it is rebuilt.
- Database startup failures now show a dark, actionable retry screen instead of leaving the app on an indefinite white loading view.
- Synchronized the app version to `0.4.1`, iOS build `70`, and Android version code `70`.

## v0.4.0

Added:

- A frozen Lyon v1 album of 20 reviewed landmark medals with localized names, categories, descriptions, OpenStreetMap identities, and safe map anchors.
- Exact direct-GPS enclosure proof across recordings. A newly finalized recording must contribute to the closing boundary, the anchor must transition into the strict interior, the boundary must be at least 80m, and the enclosure must not exceed 100,000m2.
- A full-screen Medals collection with counts, category filters, locked/collected states, landmark map focus, and distinct map pins.
- Recoverable medal presentation with a bundled metallic chime, success haptic, reduced-motion-aware rotation, accessibility announcement, and silent failure fallback.
- Explicit, confirmed historical scanning for each frozen album version; albums never grant historical medals silently.
- Backup V3 support for medal acquisition evidence, collection state, presentation state, and retro-scan state, with V1/V2 import compatibility.
- Developer-only allowlisted OpenStreetMap POI candidate fetching and review persistence. Fetched candidates cannot mutate the frozen album automatically.
- Focused medal enclosure regression checks through `npm run test:medals`.

Changed:

- GPS points without numeric accuracy remain usable by ordinary exploration where existing behavior allows them, but are excluded from medal acquisition proof.
- Added SDK 54-compatible `expo-audio` and `expo-haptics` native dependencies.
- Synchronized the app version to `0.4.0`, iOS build `69`, and Android version code `69`.

## v0.3.68

Fixed:

- The launch entry control now uses the same touch handling as the app menus and lets the native press finish before removing the launch overlay, preventing input from becoming unresponsive after opening and closing a full-screen menu.

## v0.3.67

Changed:

- The branded launch screen now remains visible after map, saved-data, recovery, permission, and initial-location preloading completes, then opens the map only when the user taps the discreet `Press here to start` control.

## v0.3.66

Changed:

- Native splash and in-app launch presentation now use `assets/loading-screen2.png`.
- The in-game map logo now uses `assets/title.png`.

## v0.3.65

Changed:

- Street Explorer is now walking-only. Launch, Options, Completion, GPS filtering, path inference, background tracking, loop fill, labels, and persisted preferences no longer expose alternate activity choices.
- Existing recordings, explored cells, loop fills, and active recovery markers are consolidated into walking history without deleting recorded data. Older backup sessions are normalized to walks during restore.
- The walking loop-fill cap remains 150,000m2.

Removed:

- Activity-selection screens, launch/settings pickers, default activity persistence, alternate tracking profiles, and alternate completion filters.

## v0.3.64

Fixed:

- The player marker remains rendered at the last accepted route position while location or map connectivity is interrupted. Rejected reconnect fixes cannot jump the icon or auto-follow camera, stale motion settles, and native marker snapshot tracking stops after the image is ready.
- Startup now keeps an idle foreground watcher, waits for the initial location attempt, centers on a usable current fix, accepts a substantially more accurate follow-up fix, and rechecks permission after returning from Settings.
- Details calculates weekly distance from already-loaded session history instead of showing zero until detailed routes are loaded.
- A failed saved-data refresh can no longer leave valid explored surfaces hidden for the rest of the app session.
- Foreground location watches report native errors, retry with bounded backoff, and are actively replaced when the recording watchdog detects a silent stall.
- Live routes retain the complete recording in stable bounded chunks instead of losing the beginning after 300 accepted points or disappearing when auto-follow zooms out.
- Active, saved, and today exploration surfaces use consistent loop-hole rules and edge coverage; saved and active cells are merged before polygon construction to remove transient seams.
- Stop once again opens the Continue / hold-to-quit confirmation. Durable session finalization and queued GPS writes now complete before the recovery marker is cleared; a core failure restores the recording.
- Recording start creates the session and active recovery marker in one SQLite transaction. Recovery actions verify ownership, stop stale native tracking, and restore background or foreground protection if synchronization fails.
- Transient GPS persistence failures retain their queued point for retry instead of permanently poisoning every later flush.
- Foreground and background fixes now retain raw SQLite observations and share one canonical contiguous route stream. The short reorder queue is only a fast path: a truly late or more accurate fix re-derives the route from all observations, requests a full live sync, and cannot leave a permanent hole.
- Active exploration cells use only confirmed live intervals; a long outage never paints an unverified diagonal while recording.
- Background start/stop operations are serialized and recording-owned, preventing stale callbacks from affecting a newer session. Every delivered native batch is atomically published before session lookup; a cold headless callback can recover only through one unambiguous timestamp match, unmatched batches remain for a bounded grace window, and 512-point admission chunks prevent backlogs larger than the queue cap from starving.
- Stop retains an underfilled recording as a hidden five-minute recovery tombstone, allowing a delayed native callback to provide its final point before cleanup. Closed-session queue jobs are terminally removed and pivot to finalized canonical merge instead of retrying forever.
- Database initialization, foreign-key enforcement, active-marker cleanup, session finalization, discard, history deletion, and backup replacement are transaction-safe. Backup export rejects active or settling recordings and reads one exclusive snapshot. Import closes both file-journal and in-memory GPS admission, quiesces tracking and old queue writes, commits the replacement, then clears old journals.
- Finalization atomically records a pending derived-data repair. Startup and refresh reuse an authoritative route bound to the source GPS count and maximum point id, replace stale generations, then commit explored cells and clear the repair marker only while that exact generation still exists. A late journaled batch safely rebuilds canonical point order, invalidates stale derived data, and reopens the repair marker.
- Nearby street downloads retry after a cooldown when a stationary request fails.

Changed:

- Only the most recent 300 raw points stay in the diagnostic state; full live drawing is preserved separately in stable 256-vertex route chunks.
- Saved route overlays coalesce adjacent confirmed intervals into bounded polylines, reducing native map overlay count without changing stored or inferred geometry.
- Finalized late-GPS merges load existing observations once and batch deletes/inserts, avoiding per-point lookup overhead on large journals.
- Removed unused per-fix live street matching and duplicate History route loading.

## v0.3.63

Fixed:

- Stop now removes the live recording state, halts foreground sensors, and clears the persisted active-session marker before any statistics, route, or exploration work begins.
- Normal Stop finalization processes only the recording that just ended; it no longer launches a full-history exploration rebuild or shows a blocking computing modal.
- The native map mounts before saved exploration contours are enabled, so historical geometry cannot delay initial map availability.
- Normal startup reads distinct cached explored-cell ids directly and no longer loads every saved GPS point, creates route snapshots, or rebuilds the explored-cell cache.
- Unfinished sessions are excluded from normal lifetime stats and saved-history route loading until they are actually finalized.
- Saved exploration cells and live recording cells are separate cached layers; only the active recording's incremental cell delta is calculated during recording.
- Recording distance is accumulated when each unique GPS point is persisted, and live street matching evaluates only newly accepted points.
- Live and recovered routes are capped at the most recent 300 points; the recovery prompt still reports the complete persisted point count.
- Saved routes load on demand when History or the Paths layer is opened.

Changed:

- Full-history route, street, contour, and loop work is reserved for the explicit Reprocess recordings action.
- Automatic post-recording loop rebuilding is deferred to explicit Reprocess so Stop remains bounded and responsive.
## v0.3.62

Fixed:

- The launch overlay no longer waits indefinitely for a fresh high-accuracy GPS fix; the map opens after map, saved-record, and permission initialization, then centers when location arrives.
- Historical route-snapshot and explored-cell cache backfills now run after the first map render instead of extending the launch screen.
- A fresh GPS request now times out after six seconds and falls back to a recent last-known position.
- Starting a recording registers foreground GPS first and initializes step counting and background tracking independently, so a slow auxiliary service cannot stall the Start action.
- The Start button now prevents duplicate sessions and displays visible progress while permission and session persistence complete.
## v0.3.61

Fixed:

- Corrected the v0.3.50 legacy-route regression: explicit Reprocess now repairs OSM coverage around all saved raw recording corridors before rebuilding and freezing historical snapshots.
- Historical street coverage is downloaded in one consolidated Overpass linestring request instead of hundreds of per-recording requests; it has a 35-second client timeout and never commits a partial-cache rebuild after a repair failure.
- OSM street-cache inserts are now batched in one transaction, avoiding thousands of individual writes during coverage repair.
- Reprocess progress now exposes the street-repair phase and its completion dialog reports the number of refreshed road segments.
- Added regressions proving that a plausible legacy interval rejected by the v0.3.50 cache-less freeze becomes a validated inferred route after coverage repair, while unmatched gaps still receive no straight-line fallback.
## v0.3.60

Fixed:

- Zone completion now includes the exact qualifying enclosed contour cells that the map renders as solid red, eliminating the remaining display-versus-percentage mismatch without requiring those cells to be rediscovered.
- Reprocess is cache-only and performs no per-recording network downloads.
- A street graph is built once per recording and reused across all suspicious gaps instead of being reconstructed for every GPS interval.
- Rebuilt GPS, inferred, and loop-fill cells are written in one atomic database transaction instead of separate transactions per recording and source.
- An individual recording failure preserves that recording's frozen route and allows the remaining recordings to continue.
- Details, History, Completion, and Diagnostics close before the confirmation and progress UI appears directly over the map.
- The launch overlay now dismisses automatically as soon as the map, saved data, permissions, and initial location are ready; no press-to-start step remains.
## v0.3.59

Fixed:

- Reprocess now shows a blocking progress modal with the active phase, completed/total recording count, and a progress bar from preparation through refresh.
- Reprocess errors are caught and shown explicitly instead of silently leaving completion unchanged.
- Historical OSM refresh requests time out after 35 seconds. After the first network failure, further historical refresh attempts pause for five minutes and the rebuild continues from cache instead of repeating long stalls.
- The existing non-destructive safety check continues to protect both route snapshots and exploration progress while feedback is visible.
## v0.3.58

Fixed:

- Loop persistence now consumes the same enclosed grid contours used by the red renderer, so every qualifying visually filled contour contributes the identical cells to completion.
- Nested contour cells are deduplicated, keeping solid areas and their completion counts synchronized.
- GPS endpoints are projected onto the actual OSM street segment instead of only its 35m fragment endpoints, eliminating false 15-20m snap gaps. High-confidence matches then close only short safe endpoint seams up to 12m; unmatched and longer snaps receive no straight fallback.
- Reprocess now builds and evaluates the complete candidate before replacing route snapshots or deleting explored cells. A weaker candidate is rejected instead of reducing earned progress or freezing a gappier route.
- The Reprocess result reports previous and rebuilt totals, direct/validated boundary cells, inferred cells, and whether the safety stop preserved existing progress.
## v0.3.57

Fixed:

- Reprocessing now persists each genuinely enclosed cell area separately before applying the one-cell GPS seam tolerance, so completion percentage matches the solid discovered surface instead of dropping valid loop-fill cells.
- Overlapping OSM fetches now give every physical way fragment a stable geometry-derived part index; nearby refreshes can no longer overwrite a different part of the same street and break the routing graph.
- The one-time street-cache migration removes fragments stored with the old unstable identities.
- Explicit historical reprocessing refreshes missing street coverage along saved routes before rebuilding frozen high/medium-confidence bridges, while still falling back safely to available cache when offline.
- Added regressions for independent neighboring loop fills and stable street-fragment identities across overlapping fetch windows.

## v0.3.56

Fixed:

- Previously explored corridors can now use frozen high- and medium-confidence street-matched bridges instead of remaining split by rejected GPS intervals.
- Validated bridge cells are persisted as inferred exploration, included in completion percentage and cumulative loop boundaries, and rendered from the same immutable geometry.
- Gaps without a reliable street route remain hidden and contribute no cells; there is still no straight-line fallback through buildings.

Changed:

- The explicit Reprocess recordings action now rebuilds historical route snapshots with cached/current street data, replaces the old snapshot once, recalculates explored cells and loops, and freezes the result again.
- Normal recording finalization, map movement, OSM cache changes, and routine recalculation never replace an existing snapshot.

## v0.3.55

Fixed:

- Filling a qualifying hole now removes redundant nested explored-island contours, eliminating the tiny reddish regions and stray black boxes visible inside solid discovered zones.
- Retained unfilled holes now receive complete black frontier outlines instead of only the outer explored contour being outlined.
- Walked open corridors are regression-tested as solid bands without internal holes.

## v0.3.54

Fixed:

- Small enclosed gaps inside a discovered frontier no longer remain as white polygon holes after loop rendering.
- The display now applies the active mode's existing maximum fill area to each enclosed contour, keeping oversized surfaces unfilled while making qualifying discovered zones visually solid.

## v0.3.53

Fixed:

- Validated cumulative loops now render as completely solid surfaces without MapKit seams between adjacent cells.
- Loop detection no longer mistakes the outside expansion halo for a valid small fill, so the existing configured area caps cannot be bypassed.
- Every in-app version label now reads from the canonical package version instead of a stale hardcoded constant.

Changed:

- Explored cells now collapse into contour polygons with explicit real holes, drastically reducing native map overlays and eliminating internal rendering cracks.
- Live recording cells render separately from saved exploration so adding a GPS point no longer rebuilds the entire historical surface.
- Explored-cell database writes now use batched exclusive transactions.

## v0.3.52

Fixed:

- Explored-area outlines now ignore enclosed interior gaps again, removing the dense black hole contours while preserving the outside edge of every explored island.

## v0.3.51

Added:

- Repository-wide agent instructions now enforce version synchronization, exactly three clarifying questions for non-trivial features, documentation updates, and explicit completion validation.

## v0.3.50

Added:

- The native location cursor is replaced by a top-down explorer marker that turns smoothly toward reliable GPS course data, falls back to accepted-route bearing, and animates only while moving.
- Immutable route snapshots now freeze finalized display geometry so later OSM cache loads, map renders, and exploration recalculations cannot move an already saved trace.
- Nearby OSM street coverage now refreshes automatically and rejects stale async results.
- Recording history now reports whether geometry is frozen and how many sections were street-matched.
- Backup format V2 preserves frozen route snapshots while remaining compatible with V1 imports.

Fixed:

- Foreground and background GPS writes are serialized, deduplicated, ordered by timestamp, and flushed before final distance and route calculation.
- Inferred gaps no longer draw straight endpoint connectors that can cross buildings; only validated street-graph geometry is displayed.
- Close-zoom inferred geometry is no longer simplified into corner-cutting diagonals.
- Invalid, stale, and conflicting GPS timestamps are rejected.
- Street routing now uses stricter endpoint snapping, detour limits, and a faster priority-queue shortest-path search.

Changed:

- GPS accuracy and suspicious-gap thresholds are more conservative in every activity mode.
- Legacy saved routes are frozen on first load using stable confirmed-GPS geometry and never change at render time.

## v0.3.49

Changed:

- Preview build version for phone testing.

## v0.3.48

Fixed:

- Suspicious GPS gaps now try display-only street routing before being drawn, and are hidden when they cannot be refined safely.
- Path gap filtering now uses the same mode speed limits as recording so delayed GPS points are less likely to draw diagonal shortcuts.

## v0.3.47

Added:

- Stop recording now opens a confirmation popup with Continue and a hold-to-quit action to prevent accidental stops.

## v0.3.46

Fixed:

- Post-recording explored surface updates now avoid redundant saved-map rebuilds and memoize rendered map geometry so the red overlay is ready behind the result screen.

## v0.3.45

Added:

- Apple Maps POIs are now filtered to landmark-style categories so restaurants and most commercial clutter stay off the map.
- Current city/district objectives now follow the user's containing zone, refreshing nearby boundaries when cached zones do not cover the current location.
- Post-walk report now shows objective progress delta, GPS clean/paused state, loop-fill result, and earned walk milestones.
- Today’s newly explored cells now render as a brighter overlay on the map.
- Objective HUD now includes a compact progress bar.
- Goals and badges now cover 5 km, 10 km, 25 km, 1000 cells, district 5%, and longest-walk progress.

Changed:

- Loop-fill caps were introduced for the activity profiles available at that time.

## v0.3.43

Fixed:

- Explored-area boundaries now outline every red/non-red edge, including internal holes and cutouts.

## v0.3.42

Fixed:

- Explored-area boundaries now use contour nesting so outside edges match the red surface while fully enclosed internal holes are not outlined.

## v0.3.41

Fixed:

- Stop recording now waits for the regenerated explored surface to commit before showing the result report.
- Temporary GPS loss now pauses route/cell calculation instead of failing the recording.
- Explored-area rendering no longer overlaps merged rectangles or draws heavy outlines around internal holes.

## v0.3.40

Changed:

- Details now opens as a full-screen app view with a back button.
- History header now uses the same safe top spacing/layout as Completion.
- Details content moved out of the map HUD to reduce map clutter.

## v0.3.39

Changed:

- History and Completion now open as full-screen app views.
- Added clear back buttons to return from History and Completion to the map.
- Updated their headers/backgrounds to better match the dark HUD style.

## v0.3.38

Changed:

- Replaced top Details/History/Completion text buttons with icon-only tabs.
- Attached those three tabs to the top-left edge of the Start/Stop recording panel.
- Enlarged the transparent logo overlay using the freed top HUD space.

## v0.3.37

Added:

- Blocking `Computing information` dialog while stopping a recording and rebuilding map data.

Changed:

- Recording report confirmation button now says `Add new data on map`.

## v0.3.36

Changed:

- Reduced Path/Cells/Pins layer buttons and icons by about 30%.

## v0.3.35

Changed:

- Moved Path/Cells/Pins layer buttons into the same HUD row as the objective card.
- Objective card now stretches to the available space before the layer buttons.
- Layer buttons are vertically centered with the objective card instead of being map-positioned.

## v0.3.34

Changed:

- Centered the transparent logo overlay across the screen.
- Enlarged the logo overlay to roughly three times the previous width.

## v0.3.33

Fixed:

- Restored valid sparse GPS path sections by removing the paused street-inference gap threshold from normal GPS path validation.
- Reprocessing should now keep normal walked sections unless they imply impossible speed or a very large missing GPS gap.

## v0.3.32

Changed:

- Paused street-aware inferred paths for normal map rendering and explored-cell generation.
- Suspicious GPS gaps are hidden again instead of contributing inferred cells.
- Post-recording summary now reports hidden/rejected gaps and notes that street inference is paused.

## v0.3.31

Changed:

- Replaced the text title with the transparent logo overlay.
- Moved layer buttons upward so Path/Cells/Pins align with the objective HUD.
- Extended objective HUD width to use the space before the floating layer buttons.

## v0.3.30

Changed:

- Removed the legacy on-map activity button.
- Added activity switching to the launch loading screen before entering the map.
- Removed center-on-me and fit-to-path map buttons.
- Moved Diagnostics access into the History modal tools row.
- Started a dark HUD pass for the main map buttons, objective HUD, layer toggles, and recording controls.

## v0.3.29

Added:

- Post-recording trust summary with GPS accepted/rejected counts, inferred/rejected gaps, steps, distance source, background status, and quality reason.
- Objective HUD now emphasizes selected zone, completion percent, cells remaining, and cells added today.

Changed:

- Rejected GPS gaps no longer draw fake dashed straight lines on the map.
- Street-aware inference now attempts credible OSM routes for suspicious GPS gaps when cached streets are available.
- Explored-area fill and outline opacity now adapt more strongly by zoom level.
- Cached local street radius increased so street-aware gap filling has more nearby geometry available.

## v0.3.28

Changed:

- Native splash config now points to the repository `assets/splash.png` artwork.
- Confirmed in-game loading overlay uses the same `assets/splash.png` image.
- Confirmed splash artwork is 1170x2532 and the in-game loading overlay stretches it to the full screen.

## v0.3.27

Changed:

- Loading artwork now uses contained sizing instead of cover sizing to avoid zoom/crop.
- Native splash config now uses contained sizing.
- Existing city or district objectives auto-switch when GPS enters another cached city/district.

## v0.3.26

Added:

- Branded loading screen overlay using the Street Explorer artwork style.
- Loading screen waits for saved map data, location readiness, and native map readiness before showing `Press to start`.

Changed:

- Native Expo splash image now points to the portrait loading artwork.

## v0.3.25

Added:

- Splash image asset and Expo splash configuration.
- Recording quality score: Good, OK, or Poor.
- Quality score shown in the recording HUD and diagnostics.
- Render-only route simplification at lower zoom levels while preserving raw GPS points in SQLite and exports.
- Objective progress for today, shown as `+N cells today`.
- Nearby incomplete area suggestion in Completion.

Changed:

- Street-aware gap inference now filters usable streets by mode before routing.
- Inferred street paths can be marked medium confidence when the route closely matches the GPS gap.

## v0.3.24

Changed:

- Completion dropdown now shows completion percentage for the selected area and each dropdown item.

## v0.3.23

Changed:

- Completion now auto-selects the cached zone containing the current GPS position when possible.
- Cached zones are sorted by current location, with containing zones first and nearest zones next.
- Completion area selection now uses a compact dropdown instead of showing all city or district buttons by default.

## v0.3.22

Added:

- Recording diagnostics screen and details panel with accepted GPS count, rejected GPS count, step count, GPS accuracy, GPS distance, and background status.
- Current objective card in Completion.
- Objective HUD details for explored and remaining cells.
- Clearer loop-fill explanation in history detail.

Changed:

- Saved path lines are hidden by default so explored area is the primary map layer.
- Active recording path still renders while recording.
- Explored-area fill and outline opacity adapt to map zoom to reduce low-zoom jaggedness.
- Stop-walk loop-fill alert now explains enclosed-area cells more clearly.

## v0.3.21

Added:

- Device pedometer support through Expo Sensors for Walk recordings.
- Saved step counts per recording, with today’s cumulative steps shown in the HUD.
- Persisted Completion objective so the selected goal is restored on next launch.

Changed:

- The main recording card now shows steps instead of GPS point count.
- Completion defaults to District scope and Walk mode.

## v0.3.20

Changed:

- Moved path, cell, and pin layer toggles into compact map-side icon buttons.
- Removed duplicate layer controls from the expanded details panel.
- Removed the visible OSM debug overlay control from the main UI; OSM data remains available as hidden analysis data.

## v0.3.19

Changed:

- Completed/explored area fill changed from green to a less-transparent red.

## v0.3.18

Fixed:

- Path display filtering no longer filters the explored-cell layer.
- Explored cells now always render from all saved walks in the current mode, while path lines can still be scoped to Today, 7 days, All, or Selected.

## v0.3.17

Changed:

- Explored-area outline now traces continuous contour paths.
- Outline corners are geometrically rounded with curve points instead of relying on line join styling.

## v0.3.16

Changed:

- Explored-area outline now uses rounded caps and joins for a softer edge.

## v0.3.15

Changed:

- Explored-area outside outline is now much darker and thicker.

## v0.3.14

Changed:

- Explored cells now render as green fill without internal borders.
- Added a thin dark outline only around the outside edge of the explored area.
- Adjacent explored cells should read more like one continuous explored shape.

## v0.3.13

Added:

- Path display scope control: Today, 7 days, All, and Selected.
- Completion objective selection from the Completion screen.
- Objective HUD on the map showing selected zone and completion percentage.

Notes:

- Raw recordings and GPS points are still preserved; path scope only changes what is drawn on the map.

## v0.3.12

Changed:

- Reprocess now analyzes the whole current mode's explored-cell map instead of each recording separately.
- Stop Walk also refreshes global loop fills for the current mode.
- Loop-fill cells can now come from boundaries created across multiple recordings.
- Global loop fills are stored separately from individual recording loop summaries.

## v0.3.11

Changed:

- Loop-fill detection now uses a one-cell expanded boundary to close tiny GPS/cell sampling gaps.
- Maximum loop-fill area is reduced to about 150,000m2.
- Valid enclosed areas should fill more reliably when they look closed on the map.

## v0.3.10

Changed:

- Auto-follow/auto-fit pauses when the user touches or pans the map during recording.
- The center-on-me button resumes auto-follow and is highlighted while auto-follow is active.
- Fit-all-paths now leaves auto-follow paused so the user can inspect the map.

## v0.3.9

Changed:

- Loop fill now uses enclosed explored cells instead of GPS point proximity loops.
- Straight walks should no longer generate many false loop detections.
- Multiple loop fills are now counted from connected enclosed cell groups.
- Visually closed cell boundaries can fill even when the raw GPS polygon is imperfect.

## v0.3.8

Changed:

- Loop detection can now find multiple loops inside one recording.
- Loop closing is more tolerant for real GPS traces.
- Self-intersection no longer rejects loop fill in V1.
- Loop fill thresholds are more gameplay-oriented: 80m minimum loop distance, 120m2 minimum area, no minimum duration.
- History now summarizes filled and rejected loop counts per recording.

## v0.3.7

Changed:

- Loop fill now prioritizes gameplay: valid GPS loops fill by default.
- OSM street analysis is kept as metadata and no longer blocks loop fills.
- Loop fill thresholds are more forgiving: 500m2 minimum area and 30s minimum elapsed time.

## v0.3.6

Added:

- Reprocess recordings action under Show details.
- Saved recordings can now rebuild explored cells and loop-fill results using the current rules.
- Reprocess summary reports filled loops, rejected loops, recordings without loops, and added loop cells.

## v0.3.5

Changed:

- Loop-filled cells now render exactly like directly walked explored cells.
- Explored cells are merged into larger rectangular polygons before rendering to reduce map load.
- Closed-loop detection is more tolerant for real GPS walks with a 35m close threshold.

Added:

- Stop-walk loop result alert showing filled, rejected, or not detected.
- History detail loop summary with loop-filled cell count and rejection reason.

## v0.3.4

Removed:

- Fog of War map layer, toggle, legend item, and rendering helpers.
- Fog documentation and manual test steps.

## v0.3.3

Changed:

- Fog of War now renders only the visible map viewport plus a small buffer.
- Added faded edge fog tiles for a softer visual boundary.
- Reduced fog render load to avoid map instability from large-radius fog.

## v0.3.2

Changed:

- Fog of War is darker so unrevealed map labels are obscured.
- Fog now covers a 10km radius around the current player location.
- Fog tiles are larger for performance over the wider radius.

## v0.3.1

Added:

- Fog of War map layer, enabled by default.
- Fog layer toggle and legend entry.

Notes:

- V1 uses larger 60m fog tiles around the active exploration area for map performance.
- Explored cells clear matching fog tiles, giving a first real exploration-game reveal effect.

## v0.3.0

Added:

- Zone Completion polish with exact polygon vs approximate bounds labels.
- Last fetched date on cached zones.
- Clear cached zones action.
- Cached zone cell totals for faster repeated Completion stats.
- Inner boundary holes are excluded when OSM relation geometry provides them.
- Street-aware path inference V1 using loaded OSM street segments.
- Inferred exploration cells are saved separately from direct GPS cells.

Notes:

- Street inference only runs when nearby OSM streets are loaded.
- Inferred paths are low confidence and still reject if no reliable street route is found.
- Approximate boundary zones still avoid misleading exact wording.

## v0.2.3

Fixed:

- Boundary refresh now keeps OSM relation bounds as a fallback when detailed relation geometry cannot be parsed.
- Boundary relations without a name no longer get discarded.

## v0.2.2

Added:

- Boundary refresh diagnostics showing raw OSM element count, relation count, and usable zone count when no zones are cached.

## v0.2.1

Fixed:

- Improved OSM boundary refresh so containing administrative areas are queried through a cleaner area pivot.
- Added a fallback polygon for fragmented OSM boundary geometry so usable zones are not discarded.

## v0.2.0

Added:

- OSM boundary fetching for nearby country, city, and district administrative zones.
- Local SQLite cache for zone polygons.
- Zone-specific completion stats in the Completion screen.
- Refresh boundaries action in Completion.
- Focus on map action for cached zones.
- Light optional zone outline on the map when focused.

Notes:

- Zone completion is cell-based and local-only.
- Very large zones can show a pending denominator to avoid expensive country-scale scans.
- District availability depends on local OSM boundary data.

## v0.1.4

Fixed:

- Made saved-path gap rejection much more conservative so real walked sections with sparse GPS points render normally and create cells.
- Kept dashed GPS gaps for only extreme outages or impossible movement.

## v0.1.3

Fixed:

- Saved path rendering now uses more tolerant display-only speed thresholds.
- Live GPS filtering remains strict, but real saved walks are less likely to show false GPS gaps.

## v0.1.2

Fixed:

- Rejected GPS gaps now render as thin dashed amber connectors so old recordings do not look broken.
- GPS gap connectors remain visually distinct from confirmed paths and do not mark explored cells.

## v0.1.1

Fixed:

- Relaxed path gap rejection so older sparse-but-plausible GPS recordings do not show large missing sections.
- Kept rejection for impossible speeds and large time-plus-distance GPS gaps.

## v0.1.0

Initial MVP and exploration prototype.

Added:

- Expo React Native TypeScript app.
- SQLite persistence.
- Initial activity recording profiles.
- Foreground GPS recording.
- Best-effort background tracking setup.
- Apple MapKit-based map through `react-native-maps`.
- Saved and active path rendering.
- 15m x 15m deduplicated explored cells.
- Activity-aware GPS filtering.
- GPS status and current speed.
- History with details, rename, delete, and route highlight.
- Last selected activity persistence.
- Recording recovery.
- Layer controls.
- Street completion service foundation.
- Development-build background recording support.
- Active recording health panel.
- Foreground re-sync of background-saved GPS points.
- Recovery modal with resume, finish/save, and discard actions.
- Expanded exploration stats with today, latest, longest, cells, and total duration.
- Map legend and clearer activity controls.
- Expanded route details in history.
- Compact live recording controls with expandable details.
- Recording detail view from History.
- GPX export for individual recordings.
- Full JSON backup and restore.
- OpenStreetMap street segment fetching through Overpass.
- Local SQLite cache for OSM street segments.
- GPS-to-street proximity matching.
- Optional OSM debug street overlay on the map.
- Short local OSM segment splitting to avoid whole long streets turning green.
- Clearer street completion labels and lighter map overlays.
- Path processing boundary for confirmed, inferred, and rejected segments.
- Rejected GPS gaps no longer draw straight lines or mark exploration cells.
- Completion screen foundation with scope and activity selectors.
- SQLite completion tables for zones, explored cells, and loop fills.
- Conservative closed-loop fill analysis using hidden OSM street-length checks.
- OSM overlays hidden by default so the main map stays readable.
