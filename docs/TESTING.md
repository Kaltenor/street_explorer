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

`test:player` verifies retained source/player assets, in-memory and durable trustworthy-location retention, all four directional idle and twelve walking frames inside one stable 64×64-point native map annotation, the 170ms opacity-only frame cadence, reliable GPS movement/heading fallback, launch gating, direct geographic anchoring during camera movement, camera-independent panning, background position flush, cold-launch restore, the disabled native location cursor and game-owned player presentation, removal of screen-space projection/auto-follow/animated coordinates/marker-image replacement, stale-GPS accessibility, and removal of the legacy player artwork. `test:geometry` also verifies that Stop presents the summary before deferred route/cache reconciliation.

`test:geometry` verifies Zone Boundary Completion V2 ring assembly, malformed-fragment rejection, refresh staleness, display-only fallback eligibility, denominator fingerprints, durable achievement/refresh schemas, rollups, and Backup V5 wiring.
`test:zones` additionally verifies persisted admin levels, level-9 district eligibility, strict interior parent sampling for shared-edge and detached-component relations, level-10 neighborhood retention/exclusion, automatic legacy-objective classification, hidden historical rollups, refresh invalidation, direct same-city district switching, and cross-city scope-choice decisions.

`test:geometry` verifies Path Inference V3 ground-level geometric joins, rejects bridge/ground crossings, bounds compatible endpoint joins to 8m at medium confidence, and checks persisted topology/evidence wiring. Its GPX-derived Cours Lafayette case verifies a valid underpass outage survives parallel `foot=use_sidepath` geometry and GPS snap correction without relaxing genuinely impossible-speed rejection. It also checks encoded identifiable Overpass requests, primary-504 failover to the independent public instance, immediate stop for non-retryable errors, selected-walk reprocessing with shared-total reconciliation, active-recording blocking, one-action saved-route focus, and overlap-based Today path queries.

`test:geometry` additionally asserts the bounded performance architecture: localized duration timing, three-second/conditional tail synchronization, non-starving coalesced and memoized map surfaces, geometry-changing native polygon identities, anchor-gated medals, hidden-panel unmounting, History virtualization, scoped path SQL, migration indexes, efficient completion aggregates, concurrent startup drain, and render instrumentation.

`test:backup` verifies V5 hot/archive grouping, exact one-to-one logical session coverage, archive point limits, lossless raw/frozen/inferred route round trips including duplicate legacy point indexes, material compression versus duplicated V4 JSON, checksum corruption rejection, and consistent manifest totals.

`test:ui` verifies the five GPS presentation states and their accuracy/age boundaries, shared map path semantics, all three persisted appearance choices, the Explorator/Daylight native-map switch, app-wide paired style wiring, accessible radio semantics, custom atlas markers, burnt-orange/gold territory, single-pass district selection, two-phase MapKit city teardown, muted copper/wine administrative hierarchy, the bundled Cinzel display font and license, roughly 20%-enlarged first-launch wordmark and unchanged compact endpoint, four separate Atlas HUD stripes with 7px side gutters and 10px corners, the uniformly textured flag action integrated into the medal stripe, handled reprocess failures kept out of development LogBox, caller-owned street-repair logging, Cinzel identity/system-data typography separation, engraved selected tabs and objective controls, neutral GPS framing, compact 44-point-safe walking controls, quiet ordinary-card borders, textured recording dialogs, the bundled hand-inked seal, 20%-smaller measured presentations, fitted 7.5/7-point wording, per-message image-load gating, synchronized attached-text strike sequence, the player contrast halo, the shared Medals Atlas shell, interactive iOS edge-swipe activation/completion/cancellation thresholds and all five modal bindings, and summary-first route/report wiring.

`test:medals` verifies the configured replacement splash PNG, real-time award/repair wiring, the 3D flight-to-tab presentation, permanent Unlocked/Locked collection sections, the city medal HUD, the single objective toggle, streamlined navy/gold presentation wiring, Unicode catalogue copy, gameplay-equivalent exact and one-cell-tolerant closure, the 80m minimum, strict interior anchors, the 150,000m2 cap, missing-accuracy compatibility, and eligibility over previously mapped ground.


## Reprocess Failure Presentation V0.16.21 iPhone Manual Test

Prerequisites: run the 0.16.21 development build on an iPhone with no active recording, keep one saved walk available, and temporarily disable networking after opening its History detail.

1. Start **Reprocess this walk** while offline and wait for both Overpass attempts to fail. Expected: the normal **Reprocess failed** alert explains that existing progress was preserved; React Native's red Console Error/LogBox screen does not appear.
2. Dismiss the alert and inspect the same recording. Expected: its frozen route, explored cells, bridge evidence, and completion totals remain unchanged, and the reprocess action is enabled for a later retry.
3. Re-enable networking and retry. Expected: a successful result replaces the failure alert normally and no stale failure overlay remains behind it.
4. Return to the map and inspect the integrated objective flag. Expected: the complete medal rail has uniform paper grain, with no visibly denser rectangular texture over the flag action; medal and flag touch targets remain independent.

Automated coverage rejects reprocess-specific `console.error` calls, the duplicate service fallback warning, and the former flag-only texture. Physical-device verification remains required for native Alert/LogBox interaction and perceived texture uniformity.
## Underpass Bridge And Individual Reprocess V0.16.19 iPhone Manual Test

Prerequisites: run the 0.16.19 development build on an iPhone with no active recording, a stable network connection, and the supplied 07 Aug 2026 Cours Lafayette walk present in History. Keep a Backup V5 copy before testing if the device contains irreplaceable data. The selected walk should initially show one hidden gap and zero street-matched sections.

1. Open History, select the Cours Lafayette recording, and inspect Route quality and Technical details. Expected: the detail page shows **Reprocess this walk** beside **Export GPX**; the full-history maintenance action remains in Options.
2. Tap **Reprocess this walk**, read the confirmation, and cancel once. Expected: no route, cells, bridge totals, or street totals change.
3. Start a new walk, return to the saved recording detail, and inspect the action. Expected: per-walk reprocessing is disabled while recording. Stop and save the test walk before continuing.
4. Tap **Reprocess this walk** and confirm. Expected: progress covers one selected recording rather than the complete history; the control shows a busy state and cannot be triggered twice. Other saved route snapshots remain unchanged while shared exploration, loop-fill, and Street Completion totals are reconciled from all frozen routes.
5. Wait for the result alert. Expected: it reports one detected gap, at least one accepted bridge, recovered inferred cells, and the refreshed Street Completion percentage. Route quality now reports a street-matched section, and Technical details contain high- or medium-confidence bridge evidence rather than a hidden diagonal.
6. Tap **Focus on map** and inspect the railway underpass. Expected: the walked surface remains continuous along the pedestrian corridor through the approximately 30m GPS-loss area; it does not snap onto the parallel T1 service geometry or connect to a grade-separated crossing.
7. Force-close and relaunch, reopen the same recording, and focus it again. Expected: the accepted frozen bridge, inferred cells, Route quality totals, and reconciled completion state persist.
8. Simulate or observe a primary-instance HTTP 504 while the device remains online. Expected: the app automatically tries the independent fallback and continues without showing a failure if that response succeeds. Then disable networking so both attempts fail; expected: the alert distinguishes busy OSM servers from connection trouble and the existing frozen route/exploration progress remains unchanged. Re-enable networking and confirm a retry can proceed.

Automated coverage already validates the exact supplied GPX endpoints against the corrected matcher, the nearby parallel-sidepath regression, impossible-speed rejection, Overpass request format and 504 failover, non-retryable request handling, targeted route scope, aggregate reconciliation wiring, and active-walk disabling. Physical-device validation is still required for the actual network request, progress/alert presentation, MapKit rendering, SQLite persistence across relaunch, and failure recovery.
## Appearance Modes V0.16.18 iPhone Manual Test

Prerequisites: run the 0.16.18 bundle on an iPhone with foreground location allowed and at least one saved route. Keep network access for uncached MapKit tiles, then repeat the core switch once offline with an already cached area. Test at normal and larger text sizes and enable VoiceOver for the accessibility step.

1. Launch an upgraded install and open Options. Expected: Appearance offers Explorator, Daylight, and Custom as radio choices; Explorator is selected unless another valid mode was previously saved, and its map/HUD remain visually identical to the established dark atlas.
2. Choose Daylight without closing Options. Expected: the Options page immediately becomes a warm high-contrast light surface, the status bar and every label remain readable, and returning to the map shows light standard MapKit with darker high-contrast routes, exploration fills, boundaries, controls, and markers.
3. Open Details, History and a saved recording, Completion, Medals, diagnostics, Stop confirmation, and the post-recording summary where practical. Expected: every screen, card, button, text hierarchy, loading state, and dialog uses the Daylight palette; semantic red/green/orange GPS and destructive states remain distinct and legible.
4. Return to Options and choose Custom. Expected: Custom is marked selected and its explanation says the palette will be defined later; the app intentionally displays Explorator visuals rather than an incomplete third color scheme. Switch among all three modes repeatedly and confirm there is no stale mixed light/dark surface.
5. Leave Custom selected, force-close, and relaunch. Expected: Custom remains selected and the Explorator fallback renders from the first mounted map screen. Select Daylight, force-close again, and confirm Daylight and the light native map are restored on the next launch.
6. Enable VoiceOver and revisit Appearance. Expected: each choice is announced as a radio control with its label, description, and checked state; the complete row is tappable. With larger text, descriptions wrap without clipping or overlapping the checkmark.
7. Disable network access over a cached map area and switch modes. Expected: all app-owned UI and cached map presentation still switch immediately; missing uncached tiles may remain a normal MapKit/network limitation, but the selector stays responsive and the saved choice survives reopening.

Automated coverage checks the three-mode contract, SQLite persistence wiring, app-wide paired style registration, accessible selector semantics, and native map mode/remount logic. Physical-device verification remains required for direct-sunlight readability, native MapKit tile appearance, texture contrast, font rasterization, and relaunch behavior.

## Lightly Inset Map Stripes V0.16.17 iPhone Manual Test

Prerequisites: run the 0.16.17 bundle on an iPhone with medal progress and a district objective available. Test once at normal text size and once with larger accessibility text.

1. Open the map and inspect all four persistent stripes. Expected: the medal rail, objective ledger, navigation, and field log each keep a consistent narrow gutter of about 7 points from both screen edges and share restrained 10-point corners.
2. Compare the stripes vertically. Expected: they remain separate surfaces with their prior heights and spacing; the softer corners do not recreate the oversized floating-bubble appearance.
3. Tap the medal body and its right-side flag independently. Expected: Medals and objective actions remain separate, the internal divider stays straight, and the outer medal rail alone supplies the rounded corners.
4. Open each bottom destination, then start and stop a walk. Expected: the selected tab alone expands, content remains unclipped, and all primary controls retain at least 44-point touch targets.
5. Repeat with larger text and VoiceOver. Expected: stripe content stays within the new gutters, medal and flag actions are announced independently, and no edge or corner treatment blocks interaction.

Automated coverage verifies the shared 7px inset and 10px radius across all four stripe containers. Physical-device verification remains required for perceived spacing, edge compositing, and touch comfort.
## Full-Width Map Stripes V0.16.16 iPhone Manual Test

Prerequisites: run the 0.16.16 bundle on an iPhone with the Cinzel font and Atlas paper texture bundled, allow foreground location, keep medal progress and a district objective available, and test once with normal text size and once with larger accessibility text. Network is required only for uncached MapKit tiles or boundaries.

1. Force-close and relaunch the app, enter the map, and do not touch it. Expected: the complete Street Explorer wordmark is about 20% larger than in v0.16.15, remains inside the safe area, and does not overlap the medal stripe.
2. Tap, pan, or begin a zoom gesture directly on the map. Expected: the wordmark contracts once to the same compact size used before this release; later touches do not replay or reverse it. Force-close and reopen; expected: the enlarged initial state returns for the new session.
3. Inspect the top medal rail. Expected: it spans the full screen width with square corners, its height remains compact, and the flag is integrated at the right behind a restrained vertical divider. Tapping the medal body opens Medals; tapping the flag independently shows or hides the objective, or opens objective selection when none exists.
4. Show the objective ledger. Expected: it is a separate square edge-to-edge stripe below the medal rail, retains the existing information and height, and does not merge into the medal rail.
5. Inspect the bottom navigation and walking field log before and during a walk. Expected: each is its own square edge-to-edge stripe with visible separation, unchanged information density, and no clipping at either screen edge. The selected tab alone expands; Start and Stop remain at least 44 points high.
6. Repeat with larger text, VoiceOver, and Reduce Motion. Expected: medal and flag actions are announced separately, key copy remains unclipped, the first interaction publishes the compact title immediately with Reduce Motion, and no stripe blocks map, tab, GPS, Start, or Stop interaction.

Automated coverage verifies the initial and compact title dimensions, all four square full-width stripe offsets, the integrated objective action, texture reuse, and the existing 44-point Start minimum. Physical-device verification remains required for safe-area compositing, font rasterization, edge clipping, and actual touch comfort.
## Atlas Main-Map HUD V0.16.15 iPhone Manual Test

Prerequisites: run the 0.16.15 bundle on an iPhone with the Cinzel font and Atlas paper texture bundled, allow foreground location, keep one district objective and Lyon medal progress available, and test once with normal text size and once with larger accessibility text. Network is required only for uncached MapKit tiles or boundaries.

1. Open the map and compare the medal card, objective ledger, flag, navigation dock, and walking card with Details or Completion. Expected: all share quiet navy paper grain, parchment/Cinzel identity text, restrained gold rules, neutral card borders, and the same Atlas authorship without hiding map detail.
2. Inspect the medal city name, objective label/name, selected dock label, scope chooser, and FIELD LOG/CARNET marker. Expected: identity copy uses Cinzel, while percentage, medal count, steps, GPS accuracy, and other changing values remain crisp in the system face.
3. Toggle the objective and open each bottom destination. Expected: the flag and selected destination use engraved translucent-gold surfaces and gold icons rather than flat yellow blocks; inactive 44-point icons remain visually quiet and every target still responds across its complete area.
4. Inspect the idle walking card, then start and stop a walk. Expected: its vertical density is modestly reduced, the Start target remains at least 44 points high, live metrics do not crowd the FIELD LOG marker, and the destructive Stop state remains unmistakably red.
5. Observe Good, Acquiring, Weak/Stale, and Denied GPS states when practical. Expected: the inset panel border remains neutral in every state; only the dot and status label change semantic color, while accuracy/supporting text stays muted and readable.
6. Trigger a cross-city long press so the loading pill and scope chooser appear. Expected: transient controls match the Atlas HUD; the selected District/City option is engraved rather than flat gold, names remain legible, and Close retains a comfortable touch target.
7. Repeat with larger text, VoiceOver, and Reduce Motion. Expected: key copy remains unclipped, VoiceOver labels/actions are unchanged, the map remains the dominant surface, and no visual treatment affects navigation or gameplay state. Force-close and reopen; expected: the same HUD treatment returns with the saved objective and recording state intact.

Automated coverage verifies texture/divider reuse, five MapScreen textured surfaces plus the walking ledger, both ornamental dividers, Cinzel bindings, engraved selection colors, neutral GPS framing, and the 44-point Start minimum. Physical-device verification remains required for MapKit compositing, perceived texture strength, font rasterization, and actual touch comfort.

## Official District Hierarchy V0.16.7 iPhone Manual Test

Prerequisites: run the 0.16.7 bundle on an iPhone upgraded from a build that cached Lyon boundaries, allow foreground location in Lyon, enable administrative/exploration layers, and use a network connection for the first hierarchy refresh. For the migration edge case, save Gerland as the objective on the older build before upgrading when possible.

1. Launch the upgraded app and leave the map open while the automatic boundary request settles. Expected: legacy rows remain hidden during loading and are replaced by classified relations without manually clearing the cache.
2. Open Completion and inspect District. Expected: the list contains exactly Lyon's nine municipal arrondissements; Gerland and every other level-10 neighborhood are absent.
3. Return to the map and zoom across Lyon. Expected: exactly nine muted copper arrondissement outlines appear inside the single restrained wine Lyon perimeter; no Gerland neighborhood outline is drawn.
4. Long-press inside Gerland. Expected: the 7th arrondissement is selected directly without a scope chooser, not Gerland, and only the 7th arrondissement receives the parchment selection wash.
5. Repeat the upgrade with Gerland saved as the old objective when possible. Expected: after classification, the Gerland objective, selection fill, and HUD clear automatically; recordings, explored surfaces, medals, and unrelated settings remain unchanged.
6. Reopen Completion and inspect permanent achievements. Expected: level-10 historical rows do not increase the visible District count, while prior level-9 arrondissement and city achievements remain.
7. Force-close and reopen. Expected: the nine-arrondissement list and outlines persist, no neighborhood objective returns, and a valid saved arrondissement restores normally.
8. Disable the network before a legacy refresh and relaunch. Expected: unclassified legacy district rows stay hidden rather than exposing neighborhoods; after restoring the network and using Refresh, the nine official arrondissements appear.

Automated coverage verifies the level constants, persisted schema/upsert field, strict district query, completion eligibility, filtered refresh counts and rollups, automatic legacy classification, defensive objective clearing, and preservation of internal level-10 rows. Physical-device verification remains required for live OSM data, migration timing, and MapKit outlines.


## Forgiving Edge Swipe and Objective Boundary Isolation V0.16.6 iPhone Manual Test

Prerequisites: run the 0.16.6 bundle on an iPhone, allow foreground location in Lyon, cache exact Lyon and Villeurbanne boundaries, keep at least one saved recording, and enable Explored Cells. Network is required only for uncached boundaries or MapKit tiles.

1. Open Details, place a finger at the extreme left edge, pause briefly, then drag right very slowly. Expected: the page begins following the finger without requiring a quick flick and reveals the live map underneath.
2. Cancel one short drag, complete one deliberate drag beyond roughly one-third of the screen, and complete one short fast flick. Expected: the short drag springs back while both committed gestures return to the map.
3. Begin a mostly vertical scroll more than 36 points from the edge in each long page, and horizontally scroll Medals categories from their normal content area. Expected: content scrolls normally without triggering Back.
4. Open a saved recording detail in History and repeat the slow edge drag twice. Expected: the first completed swipe returns to History and the second returns to the map.
5. While physically located in Lyon, select Villeurbanne as the city objective. Expected: every Lyon wine perimeter and copper district outline disappears; only Villeurbanne's wine city perimeter and its eligible district outlines render, while explored surfaces remain.
6. Observe the map camera during that switch, then alternate Lyon and Villeurbanne several times, including rapid selections. Expected: MapKit may refresh once per city identity, but it returns at the same visible center/zoom and never displays both city contexts or resurrects a superseded one.
7. Select two districts within the same city. Expected: the native map does not refresh, all quiet copper district outlines remain, and only the newest district has the parchment selection wash and stronger 3-point stroke.
8. Force-close with Villeurbanne selected and reopen while still physically in Lyon. Expected: Villeurbanne restores as the sole administrative context; Lyon must not appear merely because it contains the current GPS position.

Automated coverage verifies immediate/expanded edge recognition, preserved flick completion, objective-to-city gating, native-map city identity, preserved remount region, and the existing latest-only boundary swap. Physical-device verification remains required for slow-gesture feel and MapKit's native polygon lifecycle.



## Interactive Atlas Edge Swipe V0.16.5 iPhone Manual Test

Prerequisites: run the 0.16.5 bundle on an iPhone with the map loaded, make all five Atlas pages accessible, and keep at least one saved recording for the nested History check. No location permission or network connection is required once the app and map are loaded.

1. Open Details, begin within 28 points of the left edge, and drag slowly to the right. Expected: the entire textured page follows the finger and reveals the live map beneath it.
2. Release that drag before reaching roughly one-third of the screen. Expected: the page springs fully back into place and Details remains open.
3. Repeat with a drag beyond roughly one-third of the screen, then repeat with a short fast flick after crossing the edge zone. Expected: either committed gesture completes the same Back action as the button and returns to the map.
4. Repeat the cancel and completion checks in History, Completion, Medals, and Options. Expected: all five pages behave consistently and no stale page remains over the map.
5. In Medals, horizontally scroll the category strip from its normal content area. Expected: the categories scroll without dismissing the page; a deliberate swipe beginning at the left edge still returns to the map.
6. Open a saved recording's detail from History and swipe back. Expected: the first swipe returns to the History list and a second swipe returns to the map.
7. Start a History backup, restore, conversion, or other data operation when available and try the edge gesture while its Back control is disabled. Expected: the page cannot be dismissed until the operation finishes.
8. Enable iOS Reduce Motion and repeat one cancelled and one completed swipe. Expected: the page still tracks the finger, cancellation remains usable, and a completed release closes without extra completion travel.
9. With VoiceOver enabled, perform the iOS accessibility escape gesture on an Atlas page. Expected: it invokes the same Back action, including the one-level History-detail behavior.
10. Force-close, reopen, and revisit the pages. Expected: recordings, objectives, layers, and other persisted state are unchanged; the navigation gesture does not alter app data.

Automated coverage verifies gesture thresholds, iOS gating, finger-follow translation, accessibility escape, transparent modal presentation, all five Back bindings, and History's nested/disabled behavior. Physical-device verification remains required for native iOS gesture feel, modal compositing, VoiceOver, Reduce Motion, and scroll-conflict behavior.



## Native City Boundary Teardown V0.16.4 iPhone Manual Test

Prerequisites: run the 0.16.4 bundle on an iPhone with exact Lyon and Villeurbanne boundaries cached, enable Explored Cells, and keep at least one explored surface visible. Network is not required after boundaries and MapKit tiles are cached.

1. Select Lyon as the city objective and zoom out until its complete 4-point wine perimeter is visible. Expected: Lyon is the sole emphasized city polygon and its arrondissement outlines remain muted copper.
2. While Lyon is selected, long-press inside Villeurbanne and use the cross-city chooser to select City. Expected: Lyon's wine perimeter and arrondissement outlines disappear completely, then only Villeurbanne's compact wine perimeter appears; no Lyon segments remain beneath or beside it.
3. Inspect the orange explored surfaces before and after the switch. Expected: visited territory remains unchanged throughout the administrative-overlay teardown.
4. Switch back to Lyon, then alternate Lyon and Villeurbanne several times, including rapid long presses. Expected: each completed switch shows exactly one city boundary context, and a superseded request never reappears.
5. Force-close while Villeurbanne is selected and reopen. Expected: Villeurbanne restores as the only wine perimeter after the saved objective loads.

Automated coverage verifies the serialized latest-only swap, explicit empty boundary context, two-frame native teardown, and delayed mount of the replacement context. Physical-device verification remains required because retained MapKit polygons are an iOS native rendering behavior.

## Atomic Boundary Switching and Large Stamp V0.16.3 iPhone Manual Test

Prerequisites: run the 0.16.3 bundle on an iPhone, allow foreground location, enable Explored Cells, cache boundaries for Lyon and Villeurbanne, and keep some explored territory visible in Lyon. Network is required only for uncached OSM boundaries or MapKit tiles.

1. Select a Lyon district, then select a second Lyon district. Expected: every unselected district keeps its quiet 1.5-point copper outline, only the second district has the parchment selection wash and stronger 3-point stroke, and no trace of the first selection remains.
2. Repeat rapid long presses across three Lyon districts. Expected: only the final district is selected after loading settles; no overlapping selected polygons or stale fills remain.
3. While a Lyon objective is active, long-press Villeurbanne and choose its district or city scope from the cross-city chooser. Expected: Lyon's wine city perimeter and copper district outlines disappear as one group, only Villeurbanne's administrative overlays remain, and previously explored Lyon territory stays visible.
4. Switch back to Lyon. Expected: Villeurbanne's administrative overlays disappear, Lyon returns as the sole active boundary context, and visited surfaces in both areas remain unchanged.
5. Switch districts while the full top objective panel and bottom walking controls are visible, including once immediately after a cold launch. Expected: the complete seal remains invisible while its keyed local artwork loads, then artwork and wording become visible on exactly the same strike frame, descend together, compress, and rebound without any detached or early text.
6. Inspect the longest available title and district/city name over both light and dark map regions. Expected: both two-line limits fit wholly inside the quiet navy center without touching the dotted inner ring; the tight white halo improves the gold/parchment edges and the slight navy offset remains a restrained shadow rather than doubled wording.
7. Enable iOS Reduce Motion and select another district. Expected: the same compact centered seal appears immediately at its final attached-text state without strike or spring motion, then dismisses normally.
8. Force-close and reopen. Expected: the saved objective restores with exactly one selected district and one active city boundary group; explored territory remains durable.

Automated coverage verifies one polygon per district, exactly one conditional selection fill, keyed administrative context replacement, atomic city/district state, and measured 3x stamp wiring. Physical-device verification remains required for MapKit native-overlay teardown, exact safe-space placement across iPhone sizes, haptics, sound, and Reduce Motion.

## Boundary, Player, and Medals Consistency V0.16.2 iPhone Manual Test

Prerequisites: run the 0.16.2 bundle on an iPhone, allow foreground location, enable Explored Cells and Markers, cache one city with at least two districts, and keep a saved district/city objective available. Network is required only if the zone boundaries or MapKit tiles are not cached.

1. Select a district objective and inspect both contours. Expected: the selected district has a 3-point copper outline and parchment selection wash; neighboring districts remain at 1.5 points and the containing city uses one quiet 3-point wine perimeter.
2. Switch directly to the city objective. Expected: the wine city perimeter strengthens to 4 points without moving or duplicating, district outlines return to quiet copper, and the city receives the parchment selection wash.
3. Switch back to the district, pan into a neighboring district, and zoom across the city. Expected: no district inherits the city style, and the whole-city muted wine perimeter remains visible without competing with gold routes.
4. Walk or simulate location updates across a district boundary, then let the fix become stale. Expected: one hand-inked player remains visible at its trustworthy coordinate; its dark compass halo preserves contrast over each fill, and the stale pose remains readable without a second location marker.
5. Open Details, History, Completion, then Medals/Landmarks. Expected: Medals uses the same textured full-screen Atlas shell, left back button, Cinzel title hierarchy, section rules, and neutral-edged cards as the other pages; gold remains concentrated on active and reward states.
6. Exercise every medal category, open a landmark on the map, reopen Medals, and use Back. Expected: filters, Unlocked/Locked sections, counts, landmark focus, scrolling, and dismissal still work with no clipped title or controls.
7. Force-close and reopen in the other district. Expected: the player restores at the last trustworthy position with its halo, the selected objective and independent city/district contour hierarchy return, and Medals retains the shared Atlas presentation.

Automated coverage verifies the independent city/district layers, selected/unselected 4/3-point wine and 3/1.5-point copper stroke hierarchy, one-marker player halo wiring, and shared Medals Atlas components. Physical-device verification remains required for MapKit compositing, GPS/stale transitions, touch targets, scrolling, and visual parity on iOS.
## Medal Map Range V0.16.1 Manual Test

Prerequisites: run the 0.16.1 bundle on an iPhone with Markers enabled, load the Lyon medal album, and begin with several medal landmarks visible. Network is required only for uncached MapKit tiles.

1. At normal walking zoom, confirm the expected medal landmarks are visible and tappable. Expected: collected and locked Atlas seals render normally.
2. Zoom out gradually past the point where medals disappeared in 0.16.0. Expected: every medal in the visible Lyon map area remains present instead of disappearing at the old 0.07 cutoff.
3. Continue to approximately twice the former map distance. Expected: medals remain visible through a latitude span of 0.14, allowing the full local collection to be seen at the stronger city zoom.
4. Zoom substantially farther out. Expected: medals may hide beyond the new bounded cutoff, while map interaction remains responsive; zooming back in restores them.
5. Disable and re-enable Markers in Options, then force-close and reopen. Expected: the layer setting still controls medals, and enabled medals return with the same extended range after relaunch.

Automated coverage verifies the independent 0.14 cutoff. Physical-device validation remains required for actual MapKit zoom behavior, marker density, tapping, and visual overlap.


## Atlas Identity V0.16.0 iPhone Manual Test

Prerequisites: install a development client whose native version is compatible with the 0.16.0 bundle on an iPhone, allow foreground location, keep sound and haptics enabled, and have one saved walk plus a selectable district/city pair. Network is required for uncached MapKit tiles and uncached OSM boundaries. Repeat motion checks once with iOS Settings > Accessibility > Motion > Reduce Motion enabled.

1. Launch while stationary and dismiss the ready screen. Expected: the only location symbol is the hand-inked cartographer in its current directional idle pose; navy coat, gold trim, parchment hood, and red scarf remain legible at the normal walking zoom.
2. Walk north, east, south, and west with a fresh accurate fix, both before and during a recording. Expected: the matching direction and restrained three-frame walk cycle appear without a second marker, flicker, empty annotation, camera auto-follow, or geographic drift during pan/zoom/rotation.
3. Stop receiving fresh fixes for at least 10 seconds. Expected: the same marker remains at the last trustworthy coordinate, changes to the desaturated stale pose, and exposes the last-known-location accessibility label. A fresh trustworthy fix restores the normal pose.
4. Open Details, History, Completion, and Options in turn. Expected: each uses the same navy paper texture, Cinzel gold title, cartographic emblem, ornamental divider, neutral-edged cards, short page sound, and responsive back action. Stop confirmation and the recording summary use a compact textured Atlas dialog; recovery and diagnostics keep their specialized presentation.
5. With Reduce Motion disabled, reopen each primary menu. Expected: content enters with a restrained 240ms fade/slide and no double sound. Enable Reduce Motion and repeat. Expected: content appears directly with no slide while navigation and sound remain functional.
6. Start with an objective in another city, long-press a point that offers both district and city scopes, then switch scopes in the cross-city chooser. Expected: the hand-inked cartographer seal names the selected district/city inside its quiet navy center, districts retain the copper selected/unselected hierarchy, the city perimeter remains restrained wine, and the explored polygon remains burnt orange rather than park green.
7. Use an already complete exact zone or complete one during the test. Expected: the same 20%-smaller seal appears once at the restrained completion scale with attached outlined wording, one quiet ink sound, and one medium haptic; reopening the same objective does not repeatedly award the stamp.
8. Add at least one new explored cell during a recording. Expected: the explored surface briefly brightens like fresh orange ink, then settles to the standard burnt-orange fill without changing contour geometry. With Reduce Motion enabled, no transient flash is required and the final fill appears directly.
9. Open History and focus a saved walk with several points. Expected: the selected route draws from start to finish over roughly 900ms, the finish marker appears only when drawing completes, and one quiet ink sound plays. With Reduce Motion enabled, the full route and finish marker appear immediately.
10. Force-close and reopen. Expected: walks, objective snapshots, map colors, and generated player assets return unchanged; menu sound/transition state starts cleanly, and no stamp is persisted as gameplay data.

Automated coverage still verifies the one-marker/opacity-only player contract, all directional assets, map palette, custom markers, and UI wiring. Physical-device checks remain required for MapKit bitmap stability, perceived audio level, haptics, real GPS direction/stale transitions, and iOS Reduce Motion behavior.
## Objective Scope Snapshot Cache V0.15.4 Manual Test

Prerequisites: run the 0.15.4 JavaScript bundle in a compatible iOS development client on an iPhone, allow location access, keep exact city and district boundaries cached for one point, and have enough explored cells that an uncached city calculation is visibly slower than a scope tap. No network is required after the boundaries are cached.

1. With no objective or an objective in the same city, long-press inside the cached district. Expected: the district is selected directly without a scope chooser, shows Updating during its first calculation, and settles on a percentage.
2. After the district result settles, open Completion, switch Scope to City, select the containing city, and set it as the objective. Expected: the city percentage appears immediately or after only the short SQLite validation; the HUD retains the cached value if Updating is still visible.
3. Switch back to District, then City again. Expected: both values restore without clearing to 0%, pending, or a full visible polygon-rescan delay.
4. Force-close and reopen the app, then switch between the same scopes. Expected: the saved objective and its valid SQLite snapshot survive relaunch; each cached percentage returns after a short validation.
5. Finish a recording that adds explored cells inside either boundary, then revisit both scopes. Expected: the exploration revision invalidates the old snapshots, the last cached value remains visible with Updating, and both percentages are recalculated and persisted.
6. Use Reprocess recordings or restore a backup with different exploration, then revisit both scopes. Expected: neither old percentage is accepted as current; both scopes refresh from the replaced explored-cell set.
7. Start a recording, close a qualifying enclosure, and switch scopes before Stop. Expected: the selected live percentage can update in memory, but force-closing before finalization cannot turn that preview into a durable snapshot or permanent achievement.

## Midnight Cartographer V0.15.1 Manual Test

Prerequisites: run the 0.15.1 JavaScript bundle in a compatible iOS development client on an iPhone, allow foreground location, enable Paths, Explored Cells, and Markers, and keep at least one saved walk plus one Lyon medal marker in view. Network access is required for uncached Apple MapKit tiles; no OSM refresh is required.

1. Enter the map. Expected: Apple MapKit uses a dark muted treatment; roads and essential labels remain legible, while generic native POI symbols and the native blue location cursor are absent.
2. Obtain a trustworthy outdoor fix, then pan, zoom, and rotate. Expected: the game-owned player is the sole location symbol and remains attached to its geographic coordinate without camera auto-follow.
3. View previously explored ground and today's contribution. Expected: cumulative territory is translucent burnt orange with a dark ink-like frontier, while today's contribution is gold and remains distinguishable at walking and city zoom levels.
4. Start a recording and walk through several accepted fixes. Expected: the active route is gold, the burnt-orange explored surface extends on its normal coalesced cadence, and GPS quality colors retain their existing semantic meanings.
5. Focus a saved recording from History. Expected: the selected route becomes parchment, other routes use restrained teal/slate/earth variants and dim when appropriate, and inferred street links remain bright teal.
6. Inspect saved route endpoints and medal landmarks. Expected: start and finish use parchment-and-ink flag/check markers; locked and collected medals use distinct custom atlas seals; no native teardrop pins remain. Tap each kind and confirm its title/callout or medal action still works.
7. Disable Markers in Options and re-enable them. Expected: route and medal markers hide and return without affecting the player, route geometry, explored territory, or map gestures.
8. Force-close and reopen, then repeat once with location permission denied. Expected: the visual treatment returns unchanged, saved data persists, and the durable last-known player remains the only location marker while the GPS badge reports the permission state.
9. Zoom from close walking scale to a city-wide view with a large explored ledger. Expected: burnt-orange/gold contours remain seam-free, far-level marker reduction still works, and map interaction remains responsive.

## Visual Hierarchy V0.16.12 Manual Test

Prerequisites: run the 0.16.12 JavaScript bundle in a compatible iOS development client on an iPhone, allow foreground location, keep at least one saved recording and one selectable district/city pair, and cache MapKit tiles plus exact boundaries or provide network access. Repeat the motion step once with iOS Settings > Accessibility > Motion > Reduce Motion enabled. French-language verification is recommended for accented display text.

1. Launch and dismiss the ready screen without touching the map. Expected: the complete Street Explorer wordmark is visible above the medal/objective HUD and no top element overlaps the safe area.
2. Tap, pan, or begin a zoom gesture directly on the map. Expected: the wordmark contracts once over roughly 220ms, the center playfield gains vertical space, the medal/objective HUD moves upward cleanly, and later map touches do not replay or reverse the transition.
3. Open and close Details without terminating the app, then return to the map. Expected: the compact wordmark remains compact for the session. Force-close and reopen. Expected: the full wordmark returns for the new session and contracts again after the first map touch.
4. Open Details, History, Completion, Medals, and Options in turn; observe the navigation surface during each opening/closing transition or a partially completed edge swipe. Expected: only the selected destination expands to reveal its localized label, inactive destinations remain icon-only, every target is at least 44 points, and no English or French label clips the pill.
5. Inspect the five Atlas screens in English and French. Expected: Cinzel is restricted to display titles and section headings, accents render correctly, system typography remains on metrics/body copy, ordinary cards use quiet neutral edges, and gold remains concentrated on selection, progress, emblems, rewards, and primary actions.
6. Select a district, then use Completion to select its containing city. Expected: unselected districts use quiet 1.5-point copper strokes, the selected district strengthens to 3 points with the parchment selection wash, the city perimeter uses muted wine at 3 points, and selecting City strengthens it to 4 points without resembling an error or obscuring gold routes.
7. Start a valid recording, tap Stop, choose Continue, then return and hold Quit to finish. Expected: Stop confirmation uses textured navy paper, a Cinzel heading, gold ornamental divider, and red only for Hold Quit; Continue remains visually secondary. The resulting recording summary uses the matching Atlas treatment while keeping quality, four metrics, naming, Skip, and Save readable and operable.
8. Enable larger text and VoiceOver, then repeat the map header, selected-tab, Stop, and summary checks on the smallest available supported iPhone. Expected: labels remain readable, controls remain reachable and announced correctly, and the map retains useful unobstructed space without clipped dialog content.
9. Enable Reduce Motion and relaunch. Expected: the first map touch publishes the compact wordmark directly without the 220ms transition; Atlas screens and dialogs retain their final visual hierarchy and all navigation remains functional.

Automated checks cover font/asset wiring, collapse signaling, selected-tab expansion, quiet borders, dialog texture, boundary colors/widths, and TypeScript correctness. Physical-device verification remains required for perceived typography, animation/layout smoothness, MapKit stroke balance, Dynamic Type, VoiceOver, and iOS Reduce Motion behavior.

## Streamlined Interface Test

1. Enter the map and confirm the full wordmark is visible. Touch the map once and confirm it contracts smoothly for the rest of the session, the Lyon medal card remains readable, and the bottom destinations share one rounded navigation surface.
2. Tap the Lyon progress card and confirm Medals opens. In All and every category, confirm Unlocked and Locked headers remain visible with independent counts; unlocked cards appear first and show descriptions, while locked cards stay compact.
3. Confirm only one side flag remains. Tap it to hide and show the district or city objective card; verify the saved objective remains selected in Completion. With no objective, tap the flag and confirm Completion opens so one can be selected.
4. Open Options and confirm Paths, Explored Cells, and Pins remain independently configurable even though their three map shortcuts were removed. Confirm route-reprocessing maintenance is also available there.
5. Open Details and confirm everyday statistics and goals appear in consistent dark cards without map legends or GPS diagnostics. Open History, choose a recording, and confirm the route-quality summary is immediately visible while bridge, loop, and diagnostic evidence remains hidden until Technical details is expanded.
6. Confirm Completion keeps the compact zone measures, adds the Street Completion V2 card, and still omits fetched-source metadata and the old V1 rules explanation from the default flow.
7. With no active walk, confirm only today's steps and Start Walk are shown. During a walk, confirm distance, duration, steps, Stop, and the existing double-tap health details remain accessible.
8. Open recovery, diagnostics, stop confirmation, and recording summary surfaces. Expected: Stop and summary use textured Atlas cards, Cinzel display headings, and ornamental dividers; recovery and diagnostics remain specialized, contrast stays readable, and only the destructive action is red.

## UI Polish and Map Semantics Regression Test

Prerequisites: run the Street Explorer 0.15.1 JavaScript bundle in a compatible iOS development client, keep at least two saved walks including one with an inferred street section if available, enable the Paths and Explored Cells layers, and test once outdoors with location permission granted and once with permission denied. A simulator with Location set to None is useful for the Unavailable case. No network is required except when loading uncached map or OSM data.

1. Open the map with at least two saved routes. Expected: saved routes use restrained teal/slate/earth variants, explored ground uses translucent burnt orange, and today's explored overlay uses gold without competing with the navy/gold interface.
2. Open History and choose Focus on map for one route. Expected: the focused route is parchment, other visible saved routes are dimmed, and starting a new recording draws its active route in gold. Any topology-inferred section remains cyan rather than looking directly GPS-observed.
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
18. Before and during that second walk, pan, zoom, and rotate the map repeatedly. Expected: the character stays attached to one geographic point and moves synchronously with the map; no native blue location dot competes with it as trustworthy GPS coordinates arrive. It must not freeze at an old screen position, teleport after the gesture, disappear, or recenter the camera. Pan far enough to move the player offscreen, then pan back and confirm it returns at the same map coordinate.
19. Force-close and reopen after a trustworthy fix. Expected: after the launch screen is dismissed, the player appears from the saved last position before a new fix is required. Start another walk and confirm the one-time recenter occurs, then pan and verify automatic camera following does not resume. Separately force-close during finalization, reopen, and confirm the session is either saved or offered for recovery, never silently lost.

## Player Animation V0.15.0 Manual Test

Prerequisites: run the 0.15.1 JavaScript bundle in a compatible iOS development client, grant foreground location permission, test outdoors with a fresh fix at 30m accuracy or better, and confirm the native blue location indicator is absent. No network or cached OSM data is required. Use a route where several direction changes are safe and obvious.

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
6. Start recording, walk a qualifying loop that visibly closes and fills a new burnt-orange area, and keep the recording active. Expected: after the closing cell is accepted, the HUD briefly calculates and then updates its percentage and remaining-cell count without Stop or relaunch. Stop and finalize the recording; expected: the same or reconciled durable percentage remains, and only durable 100% completion can create a permanent achievement.

## Explored Area Outline Test

1. Show explored cells on the map.
2. Confirm adjacent cells do not show internal borders.
3. Confirm a thin dark outline appears around every real teal-to-unfilled frontier.
4. Confirm a retained oversized hole has a complete inner black outline.
5. Confirm a filled qualifying hole has no internal black outline or tiny teal nested islands.
6. Reprocess a qualifying cumulative loop and confirm everything inside its exterior black border is a continuous solid fill with no white cracks.
7. Confirm an oversized loop remains unfilled under the walking area limit.
8. Inspect a long open walked path and confirm its teal corridor is solid without internal holes.

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
18. With internet and a current Lyon location, remain on the map until boundary loading settles. Confirm exactly the nine Lyon arrondissement outlines are visible with quiet 1.5-point copper strokes, the objective district strengthens to 3 points, and the containing city alone uses a 3-point wine perimeter. Expected: the adjacent Oullins and Pierre-Benite delegated-commune polygons south of Lyon are absent, including with an existing cache from v0.16.10.
19. Pan from Lyon 3e across several arrondissement boundaries and release the map. Confirm the saved objective name, selected copper outline, percentage, remaining-cell count, and today count never change merely because the viewport moved.
20. Long-press inside an adjacent arrondissement. Confirm haptic feedback occurs, no scope picker appears, the district immediately becomes the persisted objective, its stronger copper outline appears, and the HUD shows Calculating until that district's percentage is ready.
21. While a Lyon district or city is active, long-press another Lyon district and confirm it switches directly with no scope picker. Then long-press a district in a different city and confirm the compact cross-city picker offers separate District and City buttons. Tap City and confirm the new wine city boundary strengthens from 3 to 4 points while all of that city's district outlines remain visible; repeat the cross-city hold and choose District.
22. Rapidly long-press different districts or cities while an uncached boundary request is pending. Confirm an older lookup or percentage never restores an earlier name, scope, outline, remaining-cell count, or today count after the final selection finishes.
23. Force-close and reopen. Confirm the last long-pressed scope and area remain the saved objective and the selected city's cached district outlines return without requiring Completion to be opened.
24. Long-press inside a different city with district relations. Confirm the cross-city scope picker appears, then choose a scope and confirm that city's district group replaces the previous city outlines without mixing cached districts. Disable network, long-press an uncached area, and confirm an Area unavailable message appears without changing the existing objective.
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
3. Confirm a high- or medium-confidence frozen street bridge creates a continuous teal corridor.
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
5. Confirm previously mapped teal cells do not block the award. Repeat over an area visited before the medal feature and verify the new qualifying loop still unlocks it.
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
7. Trace a qualifying enclosure while continuing to move after crossing the boundary. Confirm its burnt-orange/gold surface fills during the active walk without pausing for GPS, remains filled immediately after Stop, and does not require an app restart.
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
12. Confirm independently enclosed qualifying areas count toward completion immediately and that the percentage matches the solid burnt-orange surface.
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
2. Confirm the map initially centers on the current fix and the static 64×64-point character is the sole location symbol and no native blue cursor is visible.
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
