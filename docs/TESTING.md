# Testing

## Expanded Player Speech Manual Test

Prerequisites: install the current version, select English and then French, and start several short walks. For faster manual coverage, temporarily reduce the standing, revisit, and cheer thresholds only in a local development session.

1. Start several walks. Expected: Start chooses among nine localized reactions, never uses “The map has been warned” or its former French counterpart, and all copy fits within the fixed bubble.
2. Stop several walks. Expected: Stop chooses among nine localized reactions and completes each typewriter sequence before dismissal.
3. Trigger standing still, revisited-ground, and random-cheer behaviors repeatedly. Expected: each language exposes eight standing reactions, eight revisit reactions, and thirteen cheers without blank or untranslated text.
4. Restore the normal thresholds and repeat one ordinary walk. Expected: trigger timing, priority, queueing, arrow placement, sprite visibility, and automatic dismissal are unchanged.

Automated coverage requires the exact expanded catalogue sizes in both languages and rejects the replaced Start sentence. Physical-device verification remains required for final line wrapping in the rendered bubble.

## Apple Maps Speech Offset V0.28.8 Manual Test

Prerequisites: install version 0.28.8 in a portrait physical-device iOS development build, start a walk, and wait for a speech message at normal walking zoom. Repeat with both fresh and stale GPS poses.

1. Observe the complete bubble and player. Expected: the sprite is fully visible below the bubble; the panel no longer sits over or hides the hat, face, coat, or feet.
2. Inspect the pointer against the artwork. Expected: the unchanged arrow's lower point touches the first visible pixel at the top center of the hat, without a gap or overlap.
3. Walk, change direction, pan and zoom, then trigger Stop while a message is active. Expected: the fixed relationship survives every frame and route teardown without an upper-left flash or camera movement.

Automated coverage requires Apple Maps' explicit -58-point native center offset, the unchanged fixed 244-by-128 speech marker, the original panel and arrow geometry, and the Android/Google Maps bottom anchor. Physical-device verification remains required for final pixel-level contact.

## Rigid Bubble Placement V0.28.7 Manual Test

Prerequisites: install version 0.28.7 in a portrait physical-device development build, start a walk, and wait for a speech message at normal walking zoom.

1. Observe the complete bubble and sprite. Expected: the original parchment panel and arrow shape are unchanged and move as one piece; the panel remains above the character instead of covering it.
2. Inspect the pointer against the player artwork. Expected: the arrow's lower point touches the top center of the hat indicated in the device reference, with no visible gap and no overlap across the hat, face, or body.
3. Walk, change direction, pan and zoom the map, then trigger the Stop message. Expected: the complete bubble retains the same head contact through every pose and route teardown, without an upper-left flash or automatic camera movement.

Automated coverage requires the fixed 244-by-128 marker, unchanged 84-point panel, unchanged 15-point arrow with its original overlap and rotation, and no independent arrow-position offset. Physical-device verification remains required for pixel-level contact against the rendered hat.

## Arrow-Only Placement Correction V0.28.6 Manual Test

Prerequisites: install version 0.28.6 in a portrait physical-device development build, start a walk, and wait for a speech message at normal walking zoom.

1. Observe the complete bubble and sprite. Expected: the parchment panel is restored to its original position entirely above the character; it does not cover the hat, face, coat, or walking animation.
2. Inspect the arrow separately. Expected: only the small diamond arrow extends downward, with its bottom tip touching the top center of the hat and no visible gap.
3. Change direction, pan, and trigger the Stop message. Expected: the panel remains fixed above the sprite and only the arrow maintains head contact across every pose, without upper-left flashes or camera movement.

Automated coverage requires the restored 132-point marker height, unchanged 84-point panel, unchanged 15-point arrow, and the arrow-only 8-point visual offset. Physical-device verification remains required for pixel-level contact against the rendered hat.

## Speech Arrow Placement V0.28.5 Manual Test

Prerequisites: install version 0.28.5 in a portrait physical-device development build, start a walk, and wait for a speech message. Check at normal walking zoom in both north- and south-facing poses.

1. Observe the bubble while the player is stationary. Expected: the panel remains entirely above the sprite and the arrow tip touches the top center of the parchment hat; there is no floating gap and the arrow does not cover the face or body.
2. Change direction and walk while text types. Expected: the speech marker retains its fixed anchor at the shared coordinate, so the arrow stays attached to the head across every animation frame without bobbing or shifting the map.
3. Pan and zoom, then trigger the Stop reaction. Expected: the same head contact is preserved through projection and route teardown, with no upper-left flash or camera movement.

Automated coverage retains the fixed 84-point panel and requires the 121-point speech-marker height that places the arrow tip 30 points above the shared coordinate. Physical-device verification remains required for perceived contact against the artwork at native scale.

## Speech Layout and Timer Repair V0.28.4 Manual Test

Prerequisites: install version 0.28.4 in a portrait physical-device development build with foreground location allowed. Use a profile whose launch performs noticeable saved-data/background hydration, start a walk as soon as the map becomes available, and later Stop while a speech message is active or queued. Repeat once in French and once with Reduce Motion.

1. Start immediately while background work is still visible in development timing logs. Expected: the opening message advances according to roughly 38ms of elapsed time per character. It may update in small batches if JavaScript is briefly busy, but it catches up after each delay and does not spend many seconds adding one character per delayed callback.
2. Observe short and long English/French messages. Expected: the parchment panel retains one fixed size, line wrapping does not move its bottom anchor, and text remains centered and unclipped across up to three lines.
3. Let a message dismiss, wait while the speech marker is hidden, then trigger another message. Expected: the annotation reappears above the player immediately; neither the panel nor any fragment of it flashes at screen coordinate `(0,0)` or the upper-left corner.
4. Stop while a message is typing, then Stop again when no message is visible. Expected: the closing reaction uses the same stable location through active-route teardown, types at elapsed-time speed, and dismisses without an upper-left flash.
5. Pan and zoom during typing and between messages. Expected: the continuously tracked invisible annotation retains the player coordinate and fixed anchor, becomes visible only through child opacity, and never initiates camera movement.
6. Enable Reduce Motion and repeat Start/Stop. Expected: complete text appears immediately in the same fixed panel, pauses, and hides without positional artifacts.

Automated checks verify elapsed-time character counts at 0ms, 38ms, 380ms, and after the nominal total duration; clamping at message length; continuous speech `tracksViewChanges`; absence of native marker-opacity toggling; fixed marker/panel geometry; child-only hidden opacity; isolated player ownership; and all prior message triggers. Physical-device verification remains required for MapKit annotation snapshot placement under real startup and Stop load.

## Player Speech/Marker Isolation Repair V0.28.3 Manual Test

Prerequisites: install version 0.28.3 in a portrait physical-device development build with foreground location allowed. Use a safe route where you can walk and turn for at least two minutes. Test once in Explorator, once in Daylight, and once with Reduce Motion enabled.

1. Start a walk and observe the opening message from its first typed character through dismissal. Expected: the parchment bubble stays centered above the player, never appears at a screen corner, and the player icon remains continuously visible beneath it.
2. Walk and turn north, east, south, and west while several messages type. Expected: the three-frame directional animation continues without a blank frame, flash, duplicate sprite, or interruption caused by the bubble's per-character updates.
3. Pan, zoom, and rotate while a message is typing, including with the player near every viewport edge. Expected: sprite and bubble remain attached to the same geographic coordinate; the map does not recenter and neither annotation jumps to the top-left.
4. Wait for one message to dismiss and another queued message to appear. Expected: the speech annotation hides cleanly between messages while the player marker remains unchanged and visible throughout the visibility transition.
5. Stop, Start again, switch appearance, and repeat with Reduce Motion. Expected: the closing/opening messages remain above the retained player, complete text appears immediately under Reduce Motion, and no Stop/Start lifecycle path removes the sprite.

Automated checks require separate `PlayerLocationMarker` and `PlayerSpeechMarker` components, exactly one annotation returned by each, no speech/typewriter state in the player component, a permanently mounted non-tappable speech annotation, native opacity hiding, and speech-only view tracking. Physical-device MapKit verification remains required for final placement and continuous sprite visibility.

## Player Speech Viewport-Jump Repair V0.28.2 Manual Test

Prerequisites: install version 0.28.2 in a portrait physical-device development build with foreground location allowed. Start a recording and position the player near the top, bottom, left, and right edges by panning the map; keep automatic speech active. Test in both Explorator and Daylight, once with Reduce Motion.

1. Note the visible map center and nearby street labels, then wait for a speech message with the player near each screen edge. Expected: the bubble may clip naturally at an extreme edge, but the map center, streets, player coordinate, and camera zoom do not animate or jump to make room for it.
2. Observe a complete long message from first character through dismissal. Expected: the speech annotation stays above the character at the same geographic coordinate; typing and dismissal never move the underlying map or throw the sprite toward a corner.
3. Pan continuously while a message types. Expected: player and speech move together with MapKit's geographic projection, the bubble remains offset above the head, and releasing the pan causes no delayed recenter.
4. Cross a 250m milestone and trigger a GPS warning near an edge so a high-priority message queues behind an active one. Expected: both messages appear sequentially without annotation selection, camera motion, overlap, or a stale bubble.
5. Stop, Start again, switch appearance, and repeat with Reduce Motion. Expected: the player retains its single stable 64×64 sprite annotation, the speech annotation becomes transparent between messages, and no lifecycle path initiates an unsolicited camera animation.

Automated checks require the independent `street-explorer-player-speech` annotation, bottom anchoring, explicit visibility state, typewriter timing, and the absence of native `Callout`/show/hide commands. Player tests retain the sprite handoff and exact single player-identifier contract. Physical-device verification remains required for native MapKit camera behavior and edge clipping.

## Player Marker Blink Repair V0.28.1 Manual Test

Prerequisites: install version 0.28.1 in a portrait physical-device development build with foreground location allowed. Use a safe route that permits repeated direction changes and at least two minutes of continuous walking; enable the speech behavior from v0.28.0 by starting a normal recording. Repeat once in Explorator and once in Daylight.

1. Start a walk and watch the player continuously through at least 30 walking-frame cycles. Expected: every 170ms animation transition retains a visible character; no full-frame blink, empty halo, or missing annotation appears.
2. Turn through north, east, south, and west several times, then stop and resume. Expected: each direction/walk/idle transition uses a nearly imperceptible overlap rather than a blank intermediate snapshot; the character remains anchored and does not leave duplicate lasting silhouettes.
3. Wait for several automatic speech messages, including one long enough to exercise many character updates. Expected: showing, typing, and hiding the callout never removes or flashes the player beneath it, and the bubble still dismisses automatically.
4. Temporarily degrade GPS until the stale sprite appears, then restore a fresh moving fix. Expected: fresh-to-stale and stale-to-walking transitions remain continuously visible with the correct final pose.
5. Pan, zoom, rotate, switch appearance, Stop, and Start again. Expected: MapKit anchoring and the single 64×64 player contract remain intact; only the intentional native-map appearance remount may replace the map, and subsequent sprite/callout updates do not blank the player.

Automated checks require the 60ms two-phase visible-source handoff, incoming-frame staging before outgoing retirement, permanently mounted callout, retained preloaded directional frames, single annotation identity, typewriter behavior, and type safety. Physical-device verification remains required because the original symptom occurs in MapKit's native annotation snapshot timing.

## Player Adventurer Speech V0.28.0 Manual Test

Prerequisites: install version 0.28.0 in a portrait physical-device development build, grant foreground location and Motion access, and use a safe route containing both unmapped and previously explored streets. Test once in English and once in French, then repeat the presentation check with iOS Reduce Motion enabled. Keep GPS available; a shielded indoor position or temporarily reduced Location precision is useful for the weak-signal case.

1. Launch to the map while idle and wait at least one minute. Expected: the player remains visible and accessible but does not produce random speech outside an active recording.
2. Tap Start. Expected: a localized witty-adventurer opening appears automatically above the same geographically anchored player. Its parchment text types smoothly from left to right at roughly 38ms per character, remains fully readable for about 1.9 seconds, then dismisses without a tap.
3. Walk through genuinely unmapped cells. Expected: every ten newly discovered cells can produce a fresh-ground reaction; discovering at least 24 new cells inside 90 seconds produces an exploration-streak reaction. Messages vary, never overlap, and higher-value events keep at most one pending place ahead of random encouragement.
4. Continue past 250m and 500m. Expected: a localized message names each crossed 250m milestone with correct English/French metre or kilometre formatting. During an uninterrupted walk, randomized cheering also appears approximately every 26–42 seconds without resetting distance or exploration progress.
5. Move for at least 180m entirely across previously explored ground without adding a new cell. Expected: a revisit reaction appears. Entering new ground resets that revisit interval rather than immediately repeating the same behavior message.
6. After moving normally, stand still for 45 seconds while the recording remains active. Expected: one strategic-pause reaction appears and does not repeat while still stationary. Resume moving, stop again for 45 seconds, and expect one new stationary reaction.
7. Degrade GPS beyond 25m accuracy or provoke a rejected-fix status. Expected: one satellite-themed warning appears for that poor-signal episode. Restore a good fix, then degrade it again and expect one new warning; the marker's stale pose and accessible last-known wording continue to work independently.
8. Tap Stop and save. Expected: a localized closing reaction is queued above the retained player, types and dismisses normally, and no further cheers occur after recording stops. Force-close and reopen; expected: no abandoned bubble or timer survives, the saved walk is intact, and starting a new walk begins a clean message cycle.
9. Enable Reduce Motion and start another walk. Expected: the complete localized message appears immediately instead of typing character-by-character, remains for the same short reading pause, then dismisses; all trigger and priority behavior remains functional.

Automated checks cover both complete localized catalogues, deterministic message selection, English/French distance formatting, 250m/new-cell/streak/revisit/standing/GPS/cheer thresholds, every behavior trigger, automatic custom-callout show/hide, character slicing, dismissal timing, native-title replacement, Reduce Motion, and live MapScreen inputs. Type safety, the retained 64×64 marker regression, geometry checks, and the iOS Expo bundle are covered by the release validation commands. Physical-device verification remains required for MapKit callout refresh during per-character updates, bubble placement at screen edges, real GPS/standing timing, VoiceOver announcement behavior, and perceived frequency.

## Expedition Catalogue Repair V0.27.3 Manual Test

Prerequisites: install version 0.27.3 over a profile that showed only three choices for the current local day. Keep any accepted expedition active so preservation can be checked, and select an official level-9 district objective. No network or location permission is required when the district geometry is already cached.

1. Force-close the previous build, install or reload v0.27.3, and launch once. Expected: migration 31 completes without a startup error, all walks, explored cells, accepted expeditions, completed seals, and Explorer Score remain intact.
2. Open the compass Expeditions destination for the selected district. Expected: the journal contains five current-day missions in total; an accepted current-day mission remains under Active Expeditions and the remaining slots appear under Today's Choices.
3. Inspect the refreshed untouched offers. Expected: they come from the expanded catalogue rather than being limited to Chart cells, Complete street, Close loop, and Discover landmark. Street/medal variants may be absent when the district lacks viable unfinished opportunities.
4. Close and reopen the journal, then force-close and relaunch. Expected: the same five deterministic district/date choices return without another rotation, duplicate slots, or lost active progress.
5. Switch to another official district. Expected: it independently generates five viable choices. Return to the first district and confirm its choices and active mission remain unchanged.
6. Complete or abandon the preserved active mission where practical. Expected: completion still awards one seal and 200 points exactly once; abandonment remains restartable and no migrated evidence or seal is orphaned.

Automated checks cover the shared 25-kind schema source, migration-31 table rebuild, foreign-key disable/restore and post-migration verification, current-local-day untouched-offer refresh, deterministic five-choice generation, accepted-history preservation contract, type safety, and the iOS bundle. Physical-device validation remains required for migration against the affected on-device SQLite file and visual confirmation of all five journal cards.

## Player-Gated Launch Sequence V0.27.2 Manual Test

Prerequisites: install version 0.27.2 in a portrait physical-device development build. Test once in English and once in French, once with application preparation deliberately slow, once with preparation already complete before the prompt, and once with iOS Reduce Motion enabled. No network or location permission is required for the presentation itself; a populated profile provides the strongest loading branch.

1. Cold-launch and observe the shared artwork through its native-to-React handoff. Expected: the root overlay appears before database, font, or map readiness can gate it and receives one clean 1000ms budget from the JavaScript runtime launch epoch—no subtitle, version, spinner, loading row, or start prompt during that budget. If a slow development bundle or native handoff already consumes the second, the subtitle starts immediately when the React artwork decodes; there is no second post-handoff pause.
2. After the hold, watch the subtitle. Expected: cyan Walk fades/rises first, gold Explore overlaps shortly afterward, and the parchment Reveal phrase completes the native sequence in roughly 1050ms. There is no random-letter pause or whole-sentence pop.
3. After the subtitle completes, count the quiet beat. Expected: approximately 500ms later, Press to start fades in and begins its restrained pulse. The six-point version is independently visible in the safe bottom-right corner. No loading message has appeared.
4. With preparation still incomplete, press once. Expected: the prompt immediately becomes the localized loading row on the same retained splash. Further taps do nothing. When readiness completes, the entire splash—including subtitle, loading row, and version—fades slowly over roughly 800ms to reveal the prepared map automatically.
5. Relaunch with preparation already complete before pressing. Expected: pressing skips the loading row and begins the same 800ms fade immediately. The map accepts input only after the fading overlay has been dismissed, and the transition occurs exactly once.
6. Repeat with readiness completing just before, during, and just after the press. Expected: each race takes exactly one branch, produces exactly one fade and dismissal, and never flashes the loading row before player input.
7. Enable Reduce Motion and relaunch. Expected: the one-second launch-wide clean-background budget and half-second quiet beat remain; the subtitle appears in its complete state, Press to start remains steady rather than pulsing, and either readiness branch still uses the requested opacity fade into the map.
8. Repeat on the narrowest supported iPhone and an iPad portrait canvas with larger text and VoiceOver. Expected: the phrase row remains fitted and unclipped, the version stays above the safe-area inset at the extreme right, focus cannot reach the prompt before it is visible, and the loading row is announced only after activation.

Automated checks cover root ownership before the application-content gate, upward MapScreen readiness, the shared JPEG and dimensions, image-decode gate, runtime-origin 1000ms budget and zero-remaining-time branch, three real native phrase nodes, 1050ms native-driver stagger, 500ms prompt delay, post-press-only loading state, ready/unready press branches, idempotent 800ms root fade, responsive phrase sizing, independent six-point safe-corner version, pulse gating, Reduce Motion wiring, type safety, and the iOS Expo bundle. Physical-device verification remains required for perceived timing under real startup load, fade compositing over MapKit, VoiceOver announcement timing, safe-area placement, and native-to-React continuity.

## District Expedition Variety V0.25.0 Manual Test

Prerequisites: install version 0.25.0 in a physical-device development build with foreground location allowed. Select an exact official level-9 district with at least two unfinished cached OSM streets and two uncollected cached landmark medals; also prepare a district with no cached street or medal opportunities. Stop any active recording before accepting missions. Network access is needed only to cache missing boundary, street, MapKit, or medal data; repeat the persistence portion offline.

1. Open Expeditions in the opportunity-rich district. Expected: Today's Choices contains exactly five cards with unique titles, each rule is stated explicitly in the selected language, and every card still advertises one seal worth 200 Explorer Points.
2. Close and reopen the journal, then force-close and relaunch on the same local date. Expected: the same five kinds, targets, order, and district/date heading return offline because the shuffle is deterministic.
3. Accept all five choices. Expected: all five move independently into Active Expeditions; accepting remains disabled during a recording, and missions retained from previous days or other districts remain listed rather than being replaced.
4. Complete the available qualifying evidence in finalized walks. For cell variants, verify only genuinely new post-acceptance district cells count and that adjacency, direction, sector, boundary, central, or outer-area wording matches the credited cells. For a staged card, satisfy only one requirement and reopen the journal. Expected: progress advances by exactly one stage and does not complete until every stated stage is satisfied.
5. Complete a loop-based card, then Stop and save. Expected: provisional live enclosure evidence does not finish the mission before finalization; afterward the loop stage advances once. Repeat with a discarded underfilled recording. Expected: discarded evidence does not count. A Double Enclosure card requires qualifying loops on two finalized walks.
6. Complete a street and collect a medal after acceptance. Expected: only a street reaching its durable 90% timestamp and only a newly acquired medal anchored inside the selected district count. Completing one piece of evidence may advance multiple accepted combination cards, but each card awards at most one permanent seal.
7. Finish one complete mission. Expected: its seal is added once, Explorer Score rises by exactly 200, and the `EXPEDITION COMPLETE` stamp shows `+200 PTS`. Reopening and relaunching neither removes the seal nor repeats the award.
8. Change the device date to the next local day or repeat after local midnight, then reopen Expeditions. Expected: five newly shuffled choices appear for the selected district while every unfinished accepted mission from the prior day remains active with unchanged progress.
9. Open the district with no cached street or medal opportunities. Expected: it still receives five unique viable cell/loop choices; street, medal, Field Triad, and Grand Tour cards are absent. A district with exactly one unfinished street or medal never offers the corresponding pair mission.
10. Upgrade a profile that already opened a three-choice day on an older build. Expected: the original choices and any accepted progress remain intact, two non-duplicate choices fill slots four and five, and no seal or progress is reset.
11. Export and verify Backup V5 with several new kinds active and at least one completed, restore it, then relaunch offline. Expected: all kind names, choices, progress stages, loop evidence, seals, and Explorer Points return exactly once.

Automated checks cover type safety, the exact 25-kind catalogue, deterministic five-choice generation, day-to-day reshuffling, unique kinds and slots, opportunity filtering, migration-safe filling of older three-choice days, catalogue reachability, expanded finalized-loop evidence, backup kind validation, geometry regressions, documentation consistency, and the iOS Expo bundle. Physical-device verification remains required for GPS evidence, native journal scrolling/layout, local-midnight behavior, reward audio/haptics, real MapKit/OSM opportunity data, and Files-based Backup V5 restore.

## Map Return and Active-Walk HUD V0.24.0 Manual Test

Prerequisites: install version 0.24.0 on a portrait iPhone development build. Keep one objective selected, allow the app to begin a short test walk, and repeat the motion checks once with iOS Reduce Motion enabled.

1. Launch, enter the map, and touch the map once. Expected: the enlarged title contracts to its compact state.
2. Open each main Atlas destination in turn and return through the Map tab, page Back action, selected-tab return, and one completed edge swipe. Expected: every genuine return enlarges the map title again; it stays enlarged until the next direct map touch, which contracts it. Tapping the already-selected Map tab while the map is visible does not replay the effect.
3. Start a walk while the title is either enlarged or compact. Expected: over one coordinated roughly 280ms transition, the title fades and collapses completely, the medal rail with its objective flag and the visible objective ledger move upward, and the Field Log moves down until it meets the fixed tab dock. The dock stays usable and no HUD surface overlaps another.
4. Navigate to an Atlas page and back while the walk remains active. Expected: the title remains hidden and the compact active-walk layout remains stable; returning does not reserve blank title space.
5. Stop and save the walk. Expected: the normal idle spacing returns and the compact title reappears rather than expanding. A later Atlas-to-map return enlarges it normally.
6. Repeat steps 2–5 with Reduce Motion enabled and with the objective ledger both shown and hidden. Expected: the same final layouts appear immediately without transition travel, the objective flag remains usable, and the map-centered stamp stays within the measured free space.

Automated coverage verifies Atlas-return reset gating, already-selected Map behavior, recording-forced compact state, coordinated 280ms layout progress, zero-height/zero-opacity active title, Field Log dock-gap removal, Reduce Motion wiring, type safety, and iOS bundling. Physical-device verification remains required for perceived animation smoothness, safe-area placement, MapKit touch timing, and the exact map-space gain.

## Mapbound Splash Visual Baseline

Prerequisites: install a freshly generated preview or production build on a portrait iPhone. Do not use Expo Go or a development build to approve the native frame because `expo-dev-client` can display its own conflicting startup screen. Test once in English and once in French; no location permission or network is required to inspect the React presentation. Use the Player-Gated Launch Sequence test above for exact timing and readiness branches.

1. Remove the older app from the phone, install build 202 or newer from the preview/production profile, then cold-launch it. Expected: the explicit native splash uses the dark Mapbound coastline artwork without showing the former Street Explorer image, distorting or cropping the baked logo, or flashing a mismatched background color. An over-the-air JavaScript update alone cannot replace a launch screen baked into an older installed binary.
2. Wait for the in-app launch layer. Expected: the same aspect-ratio-preserving artwork remains visually stable without a width change while the localized subtitle appears beneath the Mapbound title bar. English reads `Walk. Explore. Reveal your city.`; French reads `Marchez. Explorez. Révélez votre ville.`
3. Inspect the subtitle at normal and larger system text sizes. Expected: Walk/Marchez is cyan, Explore/Explorez is gold, the final phrase is parchment, and the phrases have balanced spacing. The full sentence stays centered below the decorative rule rather than overlapping the title or rule, remains on one line through bounded font scaling, and its shadow stays legible without covering the skyline.
4. Confirm the artwork receives one clean launch-wide second without restarting that delay when React takes over, then the localized subtitle reveals and Press to start appears after the half-second quiet beat. Expected: preparation remains silent and no loading row appears before the player presses.
5. Press once. Expected: an already prepared map begins the slow fade immediately; unfinished preparation replaces the prompt with the localized loading row, retains the splash, and begins the same fade automatically when ready. The independent half-size version remains inside the safe bottom-right corner throughout.
6. Repeat on the narrowest supported phone and an iPad portrait layout. Expected: the logo, subtitle, coastline, bottom action, and version remain visible; note any unacceptable stretch or crop for a later device-specific asset pass.

Automated coverage verifies the PNG/JPEG signatures and 1320x2868 dimensions, explicit native plugin and in-app asset wiring, removal of the deprecated native path, localized subtitle keys, type safety, and iOS bundling. Physical preview/production-device verification remains required for the OS-owned first frame, native-to-React visual continuity, exact typography placement, safe-area behavior, and perceived image quality.

## Quality Settings V0.23.13 Manual Test

Prerequisites: install version 0.23.13 on a physical iPhone, begin with device sound and haptics available, and keep one selectable district plus one pending or testable reward available. No network is required once the map area is cached.

1. Open Options. Expected: Appearance offers only Explorator and Daylight; Custom is absent. Feedback offers separate Sound effects and Haptics switches, both enabled on a new or upgraded installation that has never changed them.
2. Switch between Explorator and Daylight. Expected: system status-bar icons use a light foreground over Explorator and a dark foreground over Daylight, while the native map and all app-owned surfaces retain their established palettes.
3. Disable Sound effects, close Options, navigate into and out of Atlas pages, focus a saved route, select a district, and trigger a reward where practical. Expected: no page, ink, reward, or medal cue plays; every navigation, animation, stamp, award, and Continue action still completes normally.
4. Re-enable Sound effects and repeat one page transition plus one stamp or reward. Expected: their normal cues resume immediately without restarting the app or replaying feedback suppressed while disabled.
5. Disable Haptics, long-press a district, trigger a stamp or medal presentation, and complete the associated action. Expected: no selection, impact, or success haptic occurs and the complete visual/gameplay flow remains available. Re-enable Haptics and confirm the next eligible action vibrates normally.
6. Set the two switches to different values, force-close, and relaunch. Expected: each value restores independently. Repeat with the inverse pair and confirm persistence again.
7. With VoiceOver enabled, revisit Feedback. Expected: each full row is announced as a switch with its localized label and checked state; the rows remain usable at larger text sizes.
8. Run `npm test`. Expected: typecheck and every focused regression suite run in sequence, stop on the first failure, and complete successfully when the tree is healthy.

Automated coverage verifies default-enabled persistence, immediate feedback gates, themed status-bar wiring, the two-mode appearance contract, accessible switches, the repaired Wikipedia reader assertion, and the fail-fast aggregate command. Physical-device verification remains required for actual sound suppression, haptic suppression, status-bar contrast, and persistence across native relaunch.

## Medal Unlock Orchestral Cue V0.23.12 Manual Test

Prerequisites: use a physical-device development build upgraded to v0.23.12, enable device audio and haptics, choose a safe listening volume, and prepare at least two pending medal celebrations or test landmarks that can be unlocked. Have headphones or a stereo speaker available, and optionally play a podcast or music in another app.

1. Unlock or present one medal. Expected: the reveal triggers exactly one approximately two-second rising orchestral cue with brass, strings, timpani, and bell shimmer; the former short single-tone ping is absent and the cue ends cleanly.
2. Continue through two or more queued medals. Expected: each reveal receives one cue, with no duplicate trigger, overlap, or missing sound, and Continue still flies each medal into the fixed Medal tab.
3. Repeat while external music or a podcast is playing and once with the iPhone Silent switch enabled. Expected: the medal cue remains audible and mixes over external playback without pausing or taking it over.
4. Repeat with Reduce Motion enabled, then with haptics or audio unavailable. Expected: Reduce Motion changes only the animation; sound and success haptic remain independent, and either unavailable feedback channel fails quietly without blocking the award.
5. Compare the phone speaker and headphones at a moderate volume. Expected: the stereo image is audible, the final resolve feels rewarding, and there is no clipping, harsh burst, or abrupt cutoff.
6. Force-close during a pending queue and reopen. Expected: only still-pending celebrations replay their cue; acknowledged medals remain collected and do not replay or duplicate.

Automated checks cover the celebration asset wiring, RIFF/WAVE header, stereo 44.1 kHz 16-bit format, exact two-second duration, orchestral generator voices, and CC0/public-domain provenance, plus type safety and the iOS bundle. Physical-device validation remains required for perceived reward quality, real speaker loudness, stereo image, Silent-mode mixing, haptics, and native queue timing.

## Validated-Surface Medal Awards V0.23.11 Manual Test

Prerequisites: use a physical-device development build upgraded to v0.23.11. Before upgrading, identify at least one still-locked landmark whose center lies inside a blue validated surface but not on an individually walked 15 m cell, ideally in each of two supported cities; install the relevant downloadable country pack beforehand if one target is outside France. Keep a second country pack absent for the no-download check. Finish any active recording, then disable networking before the first upgraded launch.

1. Launch the upgraded app offline and wait for the ready screen to enable Start. Expected: launch readiness reconstructs the same validated surfaces rendered by the map; once Start is enabled, every landmark centered on either a directly discovered cell or an enclosed surface cell has been written as collected and entered the normal presentation queue.
2. Continue through every queued celebration. Expected: each medal appears exactly once, flies to the stationary Medal tab, and remains unlocked after its presentation. Awards from a city other than the active objective still appear in Medals > All Cities under their own city.
3. Open the active city collection and All Cities. Expected: the active album count includes any local award, All Cities includes awards from every matched bundled or already-installed album, and no locked entries are disclosed in All Cities.
4. Force-close and reopen twice while still offline. Expected: collected medals and presentation acknowledgements persist, no acquisition or celebration is duplicated, and the absent country pack is neither downloaded nor allowed to block the finite local scan. Add or restore discovered cells before another refresh when practical; expected: the changed exploration revision is scanned instead of reusing the earlier result.
5. Start a short valid recording near a locked active-city landmark and discover its anchor tile without reaching 80 m or closing a loop. Expected: after the first accepted discovered cell reaches that anchor, the medal unlocks live once. Stop and reopen; expected: the award remains durable and Stop-time reconciliation does not duplicate it.
6. Extend saved exploration with a new walk until the combined saved/current boundary closes a validated surface around a different locked landmark whose center cell was not walked. Expected: the surface becomes solid orange and the contained medal unlocks live. A surface above the 150,000 m2 walking cap remains unfilled and awards nothing merely from containment.
7. Export Backup V5, restore it on a safe test profile, and relaunch. Expected: direct discovered-area acquisitions, their pending/presented state, All Cities grouping, and traditional recording/retro-scan acquisitions all survive validation and restore.

Automated checks cover direct discovered-cell membership, validated rendered-surface containment without a walked anchor cell, preservation of the separate 80 m recording-loop rule, combined saved/live surface routing, awaited revision-keyed launch routing with failure retry, sequential album writes, all 100 bundled album loads, absent-pack skipping, idempotent collection, the `discovered_area` evidence reason, Backup V5 acceptance, type safety, and the iOS bundle. Physical-device validation remains required for real upgrade data, native presentation sequencing, offline file state, live GPS timing, and Files-based backup restore.

## Complete Medal Districts, All Cities, and Multi-Expedition Selection V0.23.6 Manual Test

Prerequisites: use a physical-device development build upgraded to v0.23.6, with at least two unlocked medals in different supported cities and an active album that contains numbered districts (Paris or Lyon). Select an official level-9 district that has three daily expedition choices. Keep location and network access available for uncached boundaries, streets, or country packs; cache the chosen albums before the offline step. Do not begin with an active recording.

1. Open Medals in Lyon, then Paris. Expected: Lyon offers `All` plus districts 1 through 9 and Paris offers `All` plus districts 1 through 20, even when a district currently contains zero medals; the former category chips are absent and no subdivision is omitted merely because its medals lack legacy district metadata.
2. Select two different district numbers. Expected: each selection shows only medals carrying that district number, preserves separate Unlocked and Locked sections, and updates both section counts; returning to `All` restores the complete album.
3. Switch to `All Cities`. Expected: only unlocked medals are shown, grouped under localized city names, the header reports the combined unlocked and city counts, and no locked card from any city is disclosed.
4. From `All Cities`, focus an unlocked medal belonging to a city other than the active objective. Expected: the page closes, the map camera moves to that medal's coordinates, and its collected marker remains visible even though the active album belongs to another city. Reopen Medals, return to `All Cities`, and open its Wikipedia action. Expected: article resolution uses that medal's own city rather than the active objective city.
5. Disable networking and force-close/reopen. Expected: `All Cities` still lists the same locally stored unlocks without downloading unvisited city albums; the active cached album and its district filters also remain available.
6. Open Expeditions and accept two or all three choices. Expected: every accepted card moves into Active Expeditions, the remaining choices stay selectable, and no “another mission is active” restriction appears. Accepting or restarting remains disabled during an active recording.
7. Force-close and reopen, then return to the same district's expedition journal. Expected: every accepted expedition is still active with its previous progress. Select another district and accept a mission there; expected: the journal lists active missions from both districts with district names.
8. Complete durable evidence that advances at least two compatible active missions, then Stop and wait for refresh. Expected: each mission recalculates independently from its own acceptance time, the district HUD summarizes multiple local missions, and each completed mission creates exactly one permanent seal and one 200-point reward.
9. For two simultaneously active close-loop missions in the selected district when deterministic choices allow it, close one valid loop and finalize the recording. Expected: the finalized loop evidence is attached to every applicable active mission without duplicate evidence inside either mission.
10. Abandon one active mission. Expected: only that mission leaves Active Expeditions and can later restart from zero; other active missions and seals are unchanged. Export and restore Backup V5, then relaunch. Expected: concurrent active selections, independent progress, loop evidence, and seals survive restore.

Automated checks cover type safety, migration 30 removal of the former one-active index, multiple-active repository behavior, deterministic expedition choices, finalized loop evidence, persistent seal scoring, backup wiring, medal grouping queries, geometry regressions, documentation consistency, and the iOS Expo bundle. Physical-device verification remains required for native scrolling/layout, MapKit focus, Wikipedia presentation, force-close persistence, real GPS evidence, reward feedback, and Files-based backup restore.

## Locked Map Medal Interaction V0.23.4 Manual Test

Prerequisites: use an iPhone development build with Markers enabled and select a supported city containing at least one locked and one collected medal. Cache the relevant map tiles if testing offline. Repeat once in English and once in French; no active recording is required.

1. Tap a locked medal marker. Expected: its native map callout shows the existing landmark name and `Locked`/`Verrouillée`, the map remains visible, and the Medals page does not open.
2. Dismiss and reopen that callout several times, including on two different locked markers. Expected: each marker remains informational, shows its own name, and never changes focus or navigation state.
3. Tap a collected medal marker. Expected: the Medals page opens with that collected medal focused, preserving the existing unlocked-marker behavior.
4. Return to the map and repeat with VoiceOver. Expected: the locked marker announces its landmark name and locked state without exposing a Medals navigation action; the collected marker remains operable.
5. Disable and re-enable Markers, then force-close and reopen. Expected: the layer setting still controls marker visibility and the locked/collected interaction distinction remains unchanged after relaunch.

Automated coverage verifies the locked-only native description, absence of a locked navigation handler, the defensive collected check in `MapScreen`, localized Locked copy, and the retained collected-marker callback. Physical-device verification remains required for native MapKit callout presentation, accessibility announcements, and tap behavior.

## Lyon Outer-District Medal Expansion V0.23.3 Manual Test

Prerequisites: install the v0.23.3 build over a profile that may already contain Lyon medal unlocks. Enable Markers, select Lyon or any Lyon arrondissement as the objective, and keep foreground location available. The 44-medal Lyon album is bundled offline; networking is required only for uncached MapKit tiles, administrative boundaries, or Wikipedia rewards. Safe outdoor loops of at least 80m are required to exercise collection.

1. Open Medals with Lyon active. Expected: the rail and collection show 44 total medals, every previously available Lyon medal and unlock remains present, and the album offers `All` plus numbered arrondissement filters.
2. Inspect the 24 new cards and focus each marker. Expected: exactly four cards carry each of arrondissement labels 3, 4, 6, 7, 8, and 9 in the data; the focused anchors lie in their intended outer districts, and no marker falls in the Presqu'île or Vieux Lyon central cluster.
3. Check representative extremes: Château de Montchat (3rd/east), Villa Gillet (4th/west), the Contemporary Art Museum (6th/north), Stade de Gerland (7th/south), the Great Mosque (8th/east), and Parc du Vallon (9th/west). Expected: the map focuses six distinct, correctly placed anchors and remains responsive with all 44 Lyon markers mounted.
4. Switch the app between English and French and inspect all new cards. Expected: localized names and descriptions retain accents, no copy contains replacement characters, and locked cards reveal no Wikipedia action.
5. Walk a qualifying loop around one new anchor, keeping the anchor strictly inside, the accepted route at least 80m long, and the enclosure below 150,000m². Expected: the medal unlocks once through live or Stop-time safety evaluation, presents normally, and increments Lyon progress without affecting another city's album.
6. Force-close and reopen, then switch among a Lyon district, Lyon city, and Villeurbanne. Expected: Lyon remains at 44 with the new unlock preserved, Lyon districts continue resolving the parent Lyon album, and Villeurbanne independently shows 14.
7. Run Scan my walks for Lyon twice. Expected: album version 2 considers only spatially overlapping unscanned history on the first pass, preserves earlier unlocks, and performs no walk work on the unchanged second pass.
8. Disable networking after boundaries and tiles are cached, then reopen Lyon. Expected: all 44 definitions, markers, collection state, and progress remain available offline.

Automated checks cover the 44-item album version, exactly four new anchors per requested arrondissement, all five categories, localized copy integrity, globally unique identities, finite coordinates, the 875-medal bundled-France total, type safety, and medal geometry. Physical-device verification remains required for visible MapKit placement, real GPS collection, upgrade preservation, offline relaunch, and performance with 44 mounted markers.

## Launch Location Objective V0.23.2 Manual Test

Prerequisites: use a physical-device development build with foreground location available, exact boundaries cached for two cities and their official level-9 districts, and a saved objective in the city where the test does not begin. Keep networking available for the uncached-boundary case, then disable it for the failure case. No active recording is required.

1. Stand in or simulate a location inside a known official level-9 district, save an objective in the other city, and force-close the app. Reopen and wait for `Press here to start`. Expected: the launch presentation does not become tappable until the initial location and one-shot boundary resolution finish.
2. Enter the map. Expected: the district containing the launch fix is selected without a selection stamp, its containing city is the only administrative context, the objective HUD names the district, and the district's parent-city medal album is active.
3. Force-close and reopen from a point inside an exact city boundary but outside every playable level-9 district. Expected: the containing city becomes the saved objective and receives the city selection treatment.
4. Select an objective elsewhere, deny foreground location, then force-close and reopen. Expected: launch still completes, the previous saved objective and its boundary context remain unchanged, and no durable last-player marker is used to choose a replacement objective.
5. Grant location, select an objective elsewhere, move to a location whose boundaries are not cached, disable networking, and relaunch. Expected: failed boundary resolution leaves the previous objective selected and saved; no partial city/district context replaces it.
6. Restore networking and relaunch at that same location. Expected: one boundary fetch resolves the location, the official district is preferred over the city, and a second force-close/reopen with the cache available produces the same objective offline.

Automated coverage verifies the one-shot initial-fix capture, district-before-city preference, quiet ordered persistence, launch-readiness gate, and saved-objective failure fallback. Physical-device verification remains required for permission prompts, real GPS timing, network/cache behavior, MapKit boundary presentation, and the launch overlay transition.

## Downloadable Country Packs V0.23.1 Manual Test

Prerequisites: publish the immutable v1 gzip artifacts at the HTTPS URLs recorded in their descriptors, then use a physical-device development build with foreground location allowed, enough free document storage, and a test objective in France plus one supported city in each of Belgium, Germany, Italy, the Netherlands, and Spain. Begin online, and preserve one unlocked medal plus one qualifying finalized walk if persistence and retroactive scanning are to be exercised.

1. Start in a bundled French city, then open Medals. Expected: its album appears immediately without a country download and existing unlocks remain intact.
2. Select Amsterdam while online. Expected: the rail reports downloading only while the Netherlands gzip is fetched; the app verifies it, displays the Amsterdam total and markers, and normal History, exploration, objective, and recording state remain interactive during the fetch.
3. Inspect Amsterdam, Rotterdam, and Maastricht in English, French, and Dutch. Expected: each manually curated 20-medal roster has complete localized names and descriptions, stable categories and source identities, and no previous-city markers after a switch.
4. Select one supported Belgian, German, Italian, and Spanish city in turn. Expected: each first selection fetches at most one versioned country file, resolves a city objective or its parented district to the correct album, and never exposes another country's fallback catalogue.
5. Force-close, disable networking, and reopen each previously installed country. Expected: its validated cached gzip loads offline with unchanged album totals, collected state, and markers.
6. Still offline, select a supported city from a country that was never installed, or temporarily make its published artifact unavailable. Expected: the medal rail reports that the album is unavailable and offers tap-to-retry; History, map hydration, saved routes, objectives, and recording remain usable. Trigger ordinary objective/lifecycle refreshes without tapping the rail. Expected: no repeated network requests or duplicate saved-data query batches occur. Restore networking and tap the rail once. Expected: that explicit retry clears the failure latch, installs the pack, and opens the album.
7. Replace a cached gzip with invalid or truncated bytes in a controlled development profile, then reopen online. Expected: checksum validation rejects and removes the corrupt cache before a clean redownload; no partial file is treated as installed. Repeat offline. Expected: the album stays unavailable rather than parsing unverified data.
8. Run a past-walk scan for a newly installed album, then run it again unchanged. Expected: only spatially overlapping unscanned walks are processed on the first run, unlocks are preserved after relaunch, and the unchanged second scan processes zero walks. An unavailable different country must not suppress pending presentations from installed albums.

Automated checks run `test:country-packs` for gzip byte counts, SHA-256 values, schema/locales, city and medal identity uniqueness, minimum rosters, coverage reports, and download budgets; `test:medals` covers cache installation, retry/error isolation, album resolution, and active-city evaluation. Physical-device validation remains required for native HTTPS installation, document-directory persistence, live marker switching, offline relaunch, and corrupt-cache recovery.

## Expedition Explorer Points and Daylight Stamp V0.22.0 Manual Test

Prerequisites: use a profile with at least one existing completed expedition seal, select an official level-9 district, keep network/location permissions available for the chosen expedition type, and test once in Explorator and once in Daylight. For the three-award path, use a local day where all three generated expedition choices can be completed with durable evidence.

1. Open Details before completing anything new. Expected: every existing expedition seal has already added 200 Explorer Points without a migration prompt; the breakdown shows the expedition count and its point subtotal, while walked/enclosed counts remain unchanged.
2. Note the total, complete one accepted expedition, and wait for durable progress refresh. Expected: one permanent seal is added, total Explorer Score rises by exactly 200, and the large `EXPEDITION COMPLETE`/`EXPÉDITION ACCOMPLIE` stamp displays `+200 PTS` once with the reward sound and haptic.
3. Complete the other two available expeditions for the same local day. Expected: each completion independently adds 200 points, for at most 600 points from that day's three choices; no artificial daily point cap is applied.
4. Reopen Details and the expedition journal, then force-close and relaunch. Expected: the total and breakdown remain derived from the same unique seal count, completed expeditions do not award twice, and old completion stamps do not replay.
5. Switch to Daylight and trigger an ordinary selection stamp and an expedition reward stamp. Expected: title and point text retain bright gold, detail text retains light parchment, and the dark outline remains legible against the stamp's unchanged navy center. Explorator retains its established stamp colors.
6. Export and restore a Backup V5 containing expedition seals. Expected: the restored score immediately includes 200 points for each restored seal without a separate balance or migration.

Automated checks cover the exact 200-point rule, three-seal arithmetic, permanent-seal count wiring, retroactive score composition, completion-stamp value, Daylight stamp contrast styles, type safety, expedition regressions, geometry, and the iOS bundle. Physical-device validation remains required for live completion timing, reward audio/haptics, final stamp contrast, relaunch persistence, and Files-based restore.

## Unlocked Medal Wikipedia Reader V0.21.3 Manual Test

Prerequisites: use a profile with at least one unlocked and one locked medal and enable network access. First load the v0.21.3 JavaScript in a pre-WebView development binary such as build 155, then repeat on clean-cache build 159 or newer. Repeat the embedded-reader motion check once with Reduce Motion enabled and test once in English and once in French.

1. Open Medals and inspect a locked card. Expected: it remains compact, has no description or Wikipedia action, and tapping its map row retains the existing focus-on-map behavior.
2. Inspect an unlocked card. Expected: its map row still focuses the landmark, while its description is a separate accessible `Read on Wikipedia`/`Lire sur Wikipédia` reward action.
3. In the pre-WebView binary, launch the app and tap the unlocked description. Expected: startup has no `RNCWebViewModule` invariant, the article opens directly in the default browser, and returning leaves the medal collection usable.
4. In clean-cache build 159 or newer, tap the unlocked description. Expected: the non-throwing native probe resolves the registered WebView and the tapped area expands into a full-screen Atlas-framed reader instead of opening the default browser; with Reduce Motion disabled it morphs over roughly 320ms, while Reduce Motion opens directly without spatial animation.
5. Read and scroll the article. Expected: there is no address bar, browser navigation, tabs, editing, sharing, download, login, pop-up, or external-site access. The dedicated Close control is reachable and returns to the same collection position.
6. Test a Wikidata-backed medal with both French and English articles. Expected: the article matches the selected app language. Test one missing the selected-language sitelink; expected: the other supported language opens and its language code appears in the reader header.
7. Test a medal without a resolvable exact sitelink. Expected: a confident exact title opens when available; otherwise the selected-language Wikipedia search results appear rather than an unrelated guessed article.
8. Disable networking after tapping a description, or otherwise force the embedded load to fail. Expected: the same resolved URL is handed to the default browser once. If the system browser also cannot open it, the reader shows a contained error state and Close remains available.
9. With VoiceOver, distinguish the map-focus button from the Wikipedia link, open and close the reader, and confirm background Medal controls are hidden from accessibility while it is open. On Android, verify the system Back action dismisses the reader before the Medals page.

Automated checks cover language and fallback selection, title confidence, HTTPS Wikipedia-only navigation, edit/external blocking, unlocked-only wiring, browser fallback, Reduce Motion, type safety, UI regressions, and the iOS bundle. Physical-device validation remains required for native WebView loading, morph geometry, accessibility focus, and system-browser fallback.

## Paris V2 Album V0.20.2 Manual Test

Prerequisites: run the v0.20.2 bundle with Paris selected as the city objective and Markers enabled. Preserve an existing profile if available so the versioned catalogue-update path is exercised. The 60 Paris definitions are bundled offline; network access is required only for uncached boundary or MapKit data.

1. Open the map and Medals in Paris. Expected: the rail and collection show a total of 60, the previous ten landmarks remain present, and existing Paris unlocks are preserved.
2. Inspect the collection through `All` and several numbered arrondissement filters. Expected: each numbered view contains only matching landmarks, names and French descriptions retain their accents, and no métro station appears.
3. Visit the map areas represented by arrondissements 1 through 20. Expected: every arrondissement contains at least two Paris medal anchors, while landmark-rich central areas may contain more.
4. Focus representative outer-arrondissement cards: Palais de la Porte Dorée (12th), Bibliothèque François-Mitterrand (13th), Parc André Citroën (15th), Cité de l'Économie (17th), Philharmonie de Paris (19th), and Parc de Belleville (20th). Expected: each card focuses its reviewed anchor in the stated arrondissement.
5. Force-close and reopen twice. Expected: Paris remains at 60, catalogue version 2 does not rewrite repeatedly, and the v0.20.1 orphan-safe database migration continues to initialize without error.
6. Run the explicit past-walk scan for Paris. Expected: the v2 definition version permits the new landmarks to be considered against spatially overlapping walks without scanning unrelated cities; a second unchanged run performs no walk work.

Automated checks cover the 60-item count, all 20 arrondissement labels, all five categories, the no-métro rule, global identity uniqueness, finite coordinates, the 851-medal pack total, type safety, geometry, and the iOS bundle. Physical-device validation remains required for visible marker placement, saved-unlock preservation, and performance with real Paris history.

## Database Upgrade Recovery V0.20.1 Manual Test

Prerequisites: install a v0.20.1 development bundle over the affected v0.20.0 installation without deleting the app or its local data. Keep the device offline so the result depends only on the local migration.

1. Force-close and reopen the upgraded app. Expected: database initialization completes, the map replaces the red LogBox error, and the existing walks and exploration progress remain available.
2. Force-close and reopen once more. Expected: startup succeeds again; migration 29 is recorded and does not repeat or show a foreign-key error.
3. Record and stop a short test walk, then reopen the app. Expected: the new session persists normally and its GPS points continue updating the spatial-bounds index.
4. Open Medals and run the past-walk scan for a supported city. Expected: the scan completes using valid saved sessions; any detached legacy GPS rows are ignored and cannot block startup or award medals.

Automated checks cover the orphan-safe parent-session join, catalogue behavior, geometry regressions, type safety, and the iOS bundle. Physical-device validation is still required against the affected on-device database because its legacy orphan row is not present in a clean test profile.

## France Top-100 Medal Catalogue V0.20.0 Manual Test

Prerequisites: run the v0.20.0 bundle on a physical iPhone with foreground location allowed and Markers enabled. Cache administrative boundaries for at least two supported cities, one supported city district, and one commune outside the top 100. Keep one finalized qualifying walk in a supported city available for the historical-scan checks. The 100 albums and 801 medal definitions are offline; network is required only for uncached MapKit tiles or administrative boundaries.

1. Select Paris, Marseille, Lyon, one medium-ranked city such as Pau, and one rank-100 city such as Maisons-Alfort in turn. Expected: each city shows its own name, total, markers, and collection; Paris/Marseille/Lyon appear as whole cities rather than arrondissement albums, Lyon remains 20, and no previous-city marker or progress flashes after selection settles.
2. Select an official district inside a supported city. Expected: its parent OSM city relation keeps that city's album active. Switch rapidly between supported cities and districts; only the latest selection survives.
3. Select a commune outside the top 100. Expected: no Lyon or other unrelated medals, markers, or progress are shown. Return to a supported city and expect its saved progress to restore.
4. Disable networking after the tested boundaries are cached, force-close, and reopen on a supported city. Expected: its album, locked/unlocked cards, markers, and saved progress load offline. Reopen once more without changing cities; expected: no catalogue rewrite or visible startup delay.
5. Start an 80m-or-longer safe outdoor loop around one uncollected active-city anchor, keeping the anchor strictly inside and the enclosure below 150,000m². Expected: live evaluation checks only that city's uncollected anchors, awards once, and presents the normal reveal/flight. Stop the walk; expected: the selected-session safety evaluation creates no duplicate.
6. Open Medals and run the past-walk scan. Expected: only new saved walks overlapping the active city's landmark envelope are processed and any valid medal is awarded once. Run it again without adding a walk; expected: immediate completion with zero new awards and no history-wide pause. Add a walk in another city and rerun here; expected: no local award and no large-history stall.
7. Open Expeditions for a supported-city district containing an uncollected medal. Expected: a medal expedition may be offered from that parent-city album. Accept it, collect a medal in the district, and reopen Expeditions; expected: progress advances from acquisition evidence after acceptance. In a district without an uncollected local medal, expected: no impossible medal choice.
8. Force-close and reopen, then switch among three supported cities. Expected: every collected medal, presentation state, scan cursor, and city total persists independently; pending presentations still resume without loading all 100 albums into the visible map.

Automated checks already run for this release are listed under Validation commands below. Physical-device validation is still required for native boundary parenting, MapKit marker replacement, live GPS award timing, process-death persistence, offline presentation, and perceived performance with a large real walk history.

## Villeurbanne Medal Album V0.19.0 Manual Test

Prerequisites: run the 0.19.0 bundle on a physical phone with Markers enabled, allow foreground location, and cache exact Lyon and Villeurbanne boundaries. Use a profile on which both cities' medal totals are easy to identify. Network is required only for uncached MapKit tiles or administrative boundaries; both medal albums and reward assets are offline. A safe outdoor route of at least 80m around one Villeurbanne anchor is required for the award path.

1. Start with Lyon selected as a city objective and open Medals. Expected: the rail and collection show Lyon with 20 medals, with the existing earned state unchanged.
2. Long-press Villeurbanne, select City, and let the boundary swap settle. Expected: the rail changes to Villeurbanne `0/14` or the saved Villeurbanne count, Medals lists the 14 curated landmarks across all five categories, and the map shows their anchors rather than Lyon's markers.
3. Select a Villeurbanne district objective. Expected: the parent `relation/120989` keeps Villeurbanne active; switching between Villeurbanne districts does not flash or restore Lyon's album. Select a Lyon district and expect the rail, collection, and markers to return to Lyon 20.
4. In both English and French, inspect every Villeurbanne card and focus representative landmarks from the centre, east, north, and west. Expected: names and descriptions retain accents, cards focus their exact OSM anchors, and no two landmarks share an id or marker.
5. Start a qualifying walk of at least 80m around a Villeurbanne anchor, keep it strictly inside the closed loop, and keep the enclosure under 150,000m². Expected: the medal unlocks during the active walk or at Stop through the safety evaluation, the localized celebration appears, Continue flies it into the Medal tab, and Villeurbanne progress increments exactly once.
6. Force-close and reopen while physically in Villeurbanne with a Villeurbanne city or district objective saved. Expected: the launch fix selects the containing official district (or Villeurbanne city where no playable district applies), Villeurbanne 14 restores with its earned medal and presentation state, and each city's progress remains independent when switching to Lyon and back. Run the historical scan twice and expect no duplicate awards.
7. Select an unsupported city objective. Expected: no unrelated fallback album is shown and the app does not fetch, invent, or silently award live OSM points. Disable the network after boundaries are cached and repeat Lyon/Villeurbanne switching; both frozen albums continue to work offline.

Automated checks cover both frozen roster sizes, all-category and Unicode-safe Villeurbanne copy, globally unique ids, finite anchors, city and parent-district relation mapping, latest-selection guards for rapid city switches, enclosure behavior, type safety, and the iOS bundle. Physical-device validation remains required for native boundary selection, map-marker replacement, live GPS collection, celebration flight, persistence after process death, and offline MapKit presentation.

## Persistent Atlas Dock V0.18.0 Manual Test

Prerequisites: run the 0.18.0 bundle on a physical iPhone with the map loaded, keep at least one saved recording available, and test in both English and French. No location permission or network connection is required after the map is available. Repeat the visual checks on the narrowest supported phone, once with Reduce Motion enabled, and once with a non-zero bottom safe area.

1. On the map, verify Map is selected with a dedicated map icon and the localized Map/Carte label, and that the Field Log/recording controls sit above the thicker 56-point dock. Then tap Details, History, Completion, Expeditions, Medals, and Options normally. Expected: each icon opens its page immediately with one discreet page-turn cue; the footer remains at the exact same screen coordinates without translating or fading, only its selected destination changes, and page content transitions behind it.
2. Return to the map and hold each icon for at least 320ms, then release without moving. Expected: the localized title expands as a visual preview, the page does not open, the title stays visible for about 650ms after release, and it fades back to the icon over about 220ms. A normal tap immediately afterward still opens the destination.
3. From every main Atlas page, tap each of the other destinations, including Map. Expected: page-to-page navigation switches directly without exposing the map between pages, Map closes the Atlas page directly, the new destination becomes highlighted, and content remains clear of the overlay footer.
4. On each main page, tap its already-highlighted icon. Expected: the page returns to the map with one page-turn cue while the dock stays fixed in place and updates to Map/Carte without a footer jump, fade, or return animation. Repeat with the explicit Map icon, header Back, a committed iOS edge swipe, accessibility escape, and Android Back when available; a cancelled edge swipe must remain on the page and play no return cue.
5. Open one saved recording in History. Expected: its detail view retains the dock; switching to another destination works directly, while Back or a committed edge swipe returns one level to History before the map. Open History > Diagnostics and confirm its shared Atlas shell also retains the dock; its Back control returns to History, while tapping the highlighted History icon returns directly to the map.
6. Start a protected History backup, bulk GPX export, restore inspection, or restore operation at a safe point and attempt to use the footer while the operation is active. Expected: dock navigation is disabled until the protected operation finishes, preventing the page from disappearing mid-operation. Cancel the restore confirmation rather than altering valuable data.
7. Repeat direct switching and highlighted-icon return in French, on the narrowest supported phone, and above the bottom safe area. Expected: all seven icons and expanded labels fit without clipping; regular-width controls are 48 points high and below 360 points the visible widths compact responsively while five-point hit slop preserves effective 44-point touch targets. The footer coordinates remain identical and the last rows or buttons on every page can scroll fully above it.
8. Enable Reduce Motion and repeat opening, direct switching, highlighted-icon return, and map hold preview. Expected: navigation remains complete and readable, transition travel is reduced or published at its final state, and the preview still appears briefly and fades without opening a page.

Automated checks cover the shared provider/dock-layer wiring, all seven destinations, explicit Map selection and routing, identical map/page margins and safe-area placement, 56-point footer reservation, absence of footer entrance/return animation, Field Log-before-dock order, same-page return, hold-preview timing, protected History disabling, and diagnostics shell integration. Physical-device validation remains required for native modal-layer continuity, touch timing, pixel-level coordinate stability, narrow-screen fitting, and page-transition perception.

## Compact City And Icon Rails V0.17.3 Manual Test

Prerequisites: run the app on a physical phone in both portrait appearance modes; no recording or network is required.

1. Inspect the city medal rail and bottom icon rail. Expected: both frames sit closer to their content; the icon rail has only a one-point frame around 38-point cells, with no clipped icon, city name, medal count, progress track, border, or texture.
2. Tap the city medal body and objective flag, then every bottom destination, including near each visible cell's edge. Expected: invisible hit slop makes every icon effectively 44 points, every destination opens normally, and the selected icon can still expand its label without clipping.
3. Repeat in French and on the narrowest supported phone. Expected: the compact rails remain single-line, framed, and free of overlap.

Automated checks cover the 46-point city rail, 38-point visible icon cells, one-point rail spacing, and hit-slop wiring. Physical-device validation remains required for final visual density and touch comfort.

## Explorer Score V0.17.0 Manual Test

Prerequisites: use an Expo SDK 54-compatible development client on a physical device, allow foreground location, and have either existing explored coverage or a safe outdoor route that can close a small loop. No network is required for scoring or comparisons. For an exact enclosure check, a five-by-five or larger cell loop is useful; each tile is 15m by 15m.

1. Upgrade and open a profile that already has explored cells, then open Details. Expected: Explorer Score appears first, with `walked tiles + enclosure bonuses` matching `1 point per walked tile + 1 extra point per enclosed tile`; no manual migration or fresh recording is required.
2. Note the score, return to the map, and leave recording stopped. Expected: the same total and today's step count appear side by side in the idle Field Log; Start is centered at 60% width with a full 44-point touch height, and the GPS strip is immediately beneath it.
3. Start walking into previously unexplored tiles. Expected: Start becomes a same-sized Stop control, the GPS strip remains directly beneath it, Field Log switches to distance, duration, and current-walk steps as before, the score increases immediately as each unique tile is accepted, and revisiting an already discovered tile does not add points.
4. Close a qualifying small loop. Expected: the filled interior appears, the existing `AREA ENCLOSED` stamp shows `+2 PTS` per newly enclosed tile, the score rises by the same amount, and stamp audio/haptics remain non-blocking.
5. Open Details after mapping enough area to pass a comparison. Expected: the current international surface comparison advances, the next comparison is larger, and its progress bar reflects total mapped surface rather than points.
6. Stop the recording, force-close, and reopen the app. Expected: score, breakdown, comparison, and idle Field Log total persist through deterministic recalculation with no loss or duplicate award.
7. Reprocess a recording or restore an existing backup when safe test data is available. Expected: unchanged coverage produces the same score; changed authoritative coverage changes it once. A rejected or cancelled operation leaves the prior score intact.
8. Repeat the Details and Field Log checks in French and with large totals. Expected: labels, separators, square-metre/kilometre formatting, and comparison names are localized and remain unclipped.

Automated checks cover the exact point rule, duplicate inputs, live-versus-persisted enclosure equivalence, ladder ordering/progression, type safety, and exploration geometry. Physical-device validation remains required for live GPS timing, stamp legibility at 3x map presentation, and final layout in both appearance modes.

## Atlas Page-Turn Audio V0.16.28 Manual Test

Prerequisites: install a development client compatible with the current Expo SDK 54 bundle, keep device sound enabled, and optionally start music or a podcast in another app. No location permission, network, or test data is required.

1. From the map, open Details, History, Completion, Expeditions, Medals, and Options one at a time. Expected: each tap immediately plays one short, natural book-page turn at a discreet level approximately half the previous player volume; the former navigation cue is not heard.
2. Return to the map from each destination with the header Back control. Expected: the same page turn begins immediately before the map is revealed, exactly once per return.
3. On iOS, repeat using a committed left-edge swipe and VoiceOver accessibility escape; on Android, repeat with the system Back action. Expected: every completed return plays once, while a cancelled iOS swipe plays nothing.
4. From History, focus a saved walk; from Completion, focus or select an objective; and from Medals, focus a landmark. Expected: each action that returns to the map uses the same page-turn cue. Transfers between Atlas destinations, such as Details to History or Expeditions to Completion, do not layer duplicate sounds.
5. Put the iPhone in Silent mode and repeat through the built-in speaker. Expected: the page turn and other game feedback remain audible.
6. Repeat while external music or a podcast is playing. Expected: Street Explorer's page turn plays over it without pausing or ducking the external audio.

Automated checks cover asset/provenance wiring and all destination-to-map close handlers. Physical-device validation remains required for perceived timing, volume, platform back gestures, and external-audio mixing.

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
npm test

# Focused checks can also be run individually:
npm run typecheck
npm run test:backup
npm run test:docs
npm run test:expeditions
npm run test:geometry
npm run test:ui
npm run test:medals
npm run test:player
npm run test:player-speech
npm run test:wikipedia
npx expo install --check
```

`npm test` is the standard fail-fast aggregate: it runs typecheck plus every focused regression command below and stops at the first failure. `npx expo install --check` remains a separate SDK/dependency compatibility check because it may consult Expo package metadata.

`test:player` verifies retained source/player assets, in-memory and durable trustworthy-location retention, all four directional idle and twelve walking frames inside one stable 64×64-point native map sprite annotation, the 170ms cadence with a 60ms incoming/outgoing opacity overlap, reliable GPS movement/heading fallback, launch gating, direct geographic anchoring during camera movement, camera-independent panning, background position flush, cold-launch restore, the disabled native location cursor and game-owned player presentation, removal of screen-space projection/auto-follow/animated coordinates/marker-image replacement, stale-GPS accessibility, and removal of the legacy player artwork. `test:player-speech` verifies the complete English/French witty-adventurer catalogues, localized milestone formatting, trigger/timing constants, isolated single-annotation player/speech component ownership, the permanently mounted non-tappable same-coordinate speech marker, continuously tracked fixed geometry with child-only hiding, elapsed-time typewriter catch-up, absence of native Callout selection, pause/dismissal, Reduce Motion fallback, and live distance/new-cell/speed/GPS/language wiring. `test:geometry` also verifies that Stop presents the summary before deferred route/cache reconciliation.

`test:geometry` verifies Zone Boundary Completion V2 ring assembly, malformed-fragment rejection, refresh staleness, display-only fallback eligibility, denominator fingerprints, durable achievement/refresh schemas, rollups, and Backup V5 wiring.
`test:zones` additionally verifies persisted admin levels, level-9 district eligibility, strict interior parent sampling for shared-edge and detached-component relations, level-10 neighborhood retention/exclusion, automatic legacy-objective classification, hidden historical rollups, refresh invalidation, direct same-city district switching, and cross-city scope-choice decisions.

`test:geometry` verifies Path Inference V3 ground-level geometric joins, rejects bridge/ground crossings, bounds compatible endpoint joins to 8m at medium confidence, and checks persisted topology/evidence wiring. Its GPX-derived Cours Lafayette case verifies a valid underpass outage survives parallel `foot=use_sidepath` geometry and GPS snap correction without relaxing genuinely impossible-speed rejection. It also checks encoded identifiable Overpass requests, primary-504 and representative-other-5xx failover to the independent public instance, immediate stop for non-retryable errors, selected-walk reprocessing with shared-total reconciliation and explicit selected-calculation failure, active-recording blocking, one-action saved-route focus, and overlap-based Today path queries.

`test:geometry` additionally asserts the bounded performance architecture: localized duration timing, three-second/conditional tail synchronization, non-starving coalesced and memoized map surfaces, geometry-changing native polygon identities, anchor-gated medals, hidden-panel unmounting, History virtualization, scoped path SQL, migration indexes, efficient completion aggregates, concurrent startup drain, and render instrumentation.

`test:backup` verifies V5 hot/archive grouping, exact one-to-one logical session coverage, archive point limits, lossless raw/frozen/inferred route round trips including duplicate legacy point indexes, material compression versus duplicated V4 JSON, checksum corruption rejection, consistent manifest totals, expedition-state preservation, and rejection of orphaned loop evidence.

`test:docs` verifies synchronized package/lock/Expo versions and platform build declarations, the newest README/changelog release, required context files and links, recent catalogue/reader/score/appearance/backup claims, current development-build guidance, and the historical warning plus shipped-contract summary in the original medal design record.

`test:expeditions` verifies the shared 25-kind database constraint, migration-31 rebuild and forced current-day untouched-offer refresh, deterministic five-choice generation and day-to-day reshuffling, unique slots/kinds, opportunity-aware fallback choices, accepted-history preservation, catalogue reachability, multiple-active database behavior, expanded finalized-walk loop evidence, the aggregate permanent-seal query, retroactive 200-point scoring and reward-stamp wiring, map/HUD behavior, and backup/restore/delete-all preservation.

`test:ui` verifies the five GPS presentation states and their accuracy/age boundaries, shared map path semantics, the persisted Explorator/Daylight appearance choices, themed status-bar foreground, default-enabled persisted sound/haptic preferences, immediate feedback gates, accessible switch semantics, the Explorator/Daylight native-map switch, app-wide paired style wiring, accessible radio semantics, custom atlas markers, blue/gold territory, single-pass district selection, two-phase MapKit city teardown, muted copper/wine administrative hierarchy, the bundled Cinzel display font and license, roughly 20%-enlarged first-launch wordmark and unchanged compact endpoint, four separate Atlas HUD stripes with 7px side gutters and 10px corners, the uniformly textured flag action integrated into the medal stripe, handled reprocess failures kept out of development LogBox, caller-owned street-repair logging, Cinzel identity/system-data typography separation, engraved selected tabs including the permanent Expedition destination and its no-district Completion handoff, objective controls, neutral GPS framing, compact 44-point-safe walking controls, quiet ordinary-card borders, textured recording dialogs, the bundled hand-inked seal, explicit Daylight gold/parchment stamp contrast overrides, reward-jingle asset/provenance and event wiring, retained preloaded players, ink-before-jingle ordering, external-audio mixing configuration, 20%-smaller measured presentations, fitted 7.5/7-point wording, per-message image-load gating, synchronized attached-text strike sequence, the player contrast halo, shared Medals/Expeditions Atlas shells, interactive iOS edge-swipe activation/completion/cancellation thresholds, and summary-first route/report wiring.

`test:medals` verifies the configured lightweight 1320x2868 splash JPEG plus localized live subtitle wiring, active-city real-time/pending-recording safety wiring, the 3D flight-to-tab presentation, permanent Unlocked/Locked collection sections, the city medal HUD, the complete metropolitan top-100 whole-commune ranking, Paris's 20-arrondissement coverage, Lyon's balanced outer-district expansion, 875-medal integrity, lazy manifest loading, unique city relations and medal ids, finite reviewed anchors, spatial/versioned historical scans, no eager startup seeding, direct expedition queries, objective-city and parent-district mapping, gameplay-equivalent closure, the 80m minimum, strict interior anchors, the 150,000m2 cap, missing-accuracy compatibility, and eligibility over previously mapped ground.

`test:wikipedia` verifies selected-language and alternate-language Wikidata sitelinks, conservative title confidence, same-language search fallback, HTTPS Wikipedia-only navigation, edit/Special/external blocking, unlocked-only interaction wiring, lazy native-module guarding, default-browser fallback, and Reduce Motion support.


## Reprocess Reliability Cleanup V0.16.22 iPhone Manual Test

Prerequisites: run the 0.16.22 development build on an iPhone with no active recording and one saved walk containing a suspicious gap. Keep network access available for the normal path; a development fault injection is optional for the calculation-failure path.

1. Reprocess the saved walk normally. Expected: retryable Overpass responses, including any HTTP 5xx response, may use the fallback; success appears only after the selected route has actually been calculated and shared totals reconciled.
2. If using a development fault injection, make the selected route calculation throw after topology refresh and retry. Expected: **Reprocess failed** states that the existing route and progress were left unchanged; no **Walk reprocessed** success alert appears.
3. Run full-history **Reprocess recordings** with one deliberately invalid recording fixture. Expected: that recording retains its frozen route, the remaining recordings continue, and the completion summary reports the preserved failure count without claiming a cache fallback.
4. Reopen History and focus the affected recording. Expected: after either failure case, its prior route, bridge evidence, explored cells, and completion contribution remain available.

Automated coverage verifies 504 and representative 501 failover, non-retryable 400 behavior, selected-walk failure escalation, and removal of the unreachable cache-fallback success wording. Physical-device verification remains required for native progress and alert sequencing.
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

1. Launch an upgraded install and open Options. Expected: Appearance offers Explorator and Daylight as radio choices; Explorator is selected unless Daylight was previously saved, and a removed legacy Custom value safely falls back to Explorator. The map/HUD remain visually identical to the established dark atlas.
2. Choose Daylight without closing Options. Expected: the Options page immediately becomes a warm high-contrast light surface, the status bar and every label remain readable, and returning to the map shows light standard MapKit with darker high-contrast routes, exploration fills, boundaries, controls, and markers.
3. Open Details, History and a saved recording, Completion, Medals, diagnostics, Stop confirmation, and the post-recording summary where practical. Expected: every screen, card, button, text hierarchy, loading state, and dialog uses the Daylight palette; semantic red/green/orange GPS and destructive states remain distinct and legible.
4. Switch repeatedly between Explorator and Daylight. Expected: no stale mixed light/dark surface appears and the status-bar foreground remains readable after each change.
5. Leave Daylight selected, force-close, and relaunch. Expected: Daylight and the light native map are restored before the map becomes interactive. Repeat with Explorator.
6. Enable VoiceOver and revisit Appearance. Expected: each choice is announced as a radio control with its label, description, and checked state; the complete row is tappable. With larger text, descriptions wrap without clipping or overlapping the checkmark.
7. Disable network access over a cached map area and switch modes. Expected: all app-owned UI and cached map presentation still switch immediately; missing uncached tiles may remain a normal MapKit/network limitation, but the selector stays responsive and the saved choice survives reopening.

Automated coverage checks the two-mode contract, legacy Custom fallback, SQLite persistence wiring, themed status-bar foreground, app-wide paired style registration, accessible selector semantics, and native map mode/remount logic. Physical-device verification remains required for direct-sunlight readability, native MapKit tile appearance, texture contrast, font rasterization, status-bar contrast, and relaunch behavior.

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
7. Force-close and reopen while still inside the valid arrondissement. Expected: the launch fix reselects that arrondissement, the nine-arrondissement list and outlines persist, and no neighborhood objective returns.
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
8. Force-close with Villeurbanne selected and reopen while physically in Lyon. Expected: the initial launch fix replaces Villeurbanne with the containing official Lyon arrondissement, and Lyon becomes the sole administrative context without retaining Villeurbanne polygons.

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
5. Force-close while Villeurbanne is selected and reopen from inside Lyon. Expected: the saved Villeurbanne objective acts only as the failure fallback; a successful launch fix selects the containing Lyon arrondissement and Lyon becomes the only wine perimeter.

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
8. Force-close and reopen from inside the same district. Expected: the launch fix reselects that district with exactly one selected area and one active city boundary group; explored territory remains durable.

Automated coverage verifies one polygon per district, exactly one conditional selection fill, keyed administrative context replacement, atomic city/district state, and measured 3x stamp wiring. Physical-device verification remains required for MapKit native-overlay teardown, exact safe-space placement across iPhone sizes, haptics, sound, and Reduce Motion.

## Boundary, Player, and Medals Consistency V0.16.2 iPhone Manual Test

Prerequisites: run the 0.16.2 bundle on an iPhone, allow foreground location, enable Explored Cells and Markers, cache one city with at least two districts, and keep a saved district/city objective available. Network is required only if the zone boundaries or MapKit tiles are not cached.

1. Select a district objective and inspect both contours. Expected: the selected district has a 3-point copper outline and parchment selection wash; neighboring districts remain at 1.5 points and the containing city uses one quiet 3-point wine perimeter.
2. Switch directly to the city objective. Expected: the wine city perimeter strengthens to 4 points without moving or duplicating, district outlines return to quiet copper, and the city receives the parchment selection wash.
3. Switch back to the district, pan into a neighboring district, and zoom across the city. Expected: no district inherits the city style, and the whole-city muted wine perimeter remains visible without competing with gold routes.
4. Walk or simulate location updates across a district boundary, then let the fix become stale. Expected: one hand-inked player remains visible at its trustworthy coordinate; its dark compass halo preserves contrast over each fill, and the stale pose remains readable without a second location marker.
5. Open Details, History, Completion, then Medals/Landmarks. Expected: Medals uses the same textured full-screen Atlas shell, left back button, Cinzel title hierarchy, section rules, and neutral-edged cards as the other pages; gold remains concentrated on active and reward states.
6. Exercise every medal category, open a landmark on the map, reopen Medals, and use Back. Expected: filters, Unlocked/Locked sections, counts, landmark focus, scrolling, and dismissal still work with no clipped title or controls.
7. Force-close and reopen in the other district. Expected: the player restores at the last trustworthy position with its halo, the launch fix selects the district where the player now is, the independent city/district contour hierarchy returns, and Medals retains the shared Atlas presentation.

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
6. Start with an objective in another city, long-press a point that offers both district and city scopes, then switch scopes in the cross-city chooser. Expected: the hand-inked cartographer seal names the selected district/city inside its quiet navy center, districts retain the copper selected/unselected hierarchy, the city perimeter remains restrained wine, and the explored polygon remains blue rather than park green.
7. Use an already complete exact zone or complete one during the test. Expected: the same 20%-smaller seal appears once at the restrained completion scale with attached outlined wording, one quiet ink sound, and one medium haptic; reopening the same objective does not repeatedly award the stamp.
8. Add at least one new explored cell during a recording. Expected: the explored surface briefly brightens like fresh orange ink, then settles to the standard orange fill without changing contour geometry. With Reduce Motion enabled, no transient flash is required and the final fill appears directly.
9. Open History and focus a saved walk with several points. Expected: the selected route draws from start to finish over roughly 900ms, the finish marker appears only when drawing completes, and one quiet ink sound plays. With Reduce Motion enabled, the full route and finish marker appear immediately.
10. Force-close and reopen. Expected: walks, objective snapshots, map colors, and generated player assets return unchanged; menu sound/transition state starts cleanly, and no stamp is persisted as gameplay data.

Automated coverage still verifies the one-marker/opacity-only player contract, all directional assets, map palette, custom markers, and UI wiring. Physical-device checks remain required for MapKit bitmap stability, perceived audio level, haptics, real GPS direction/stale transitions, and iOS Reduce Motion behavior.
## Objective Scope Snapshot Cache V0.15.4 Manual Test

Prerequisites: run the 0.15.4 JavaScript bundle in a compatible iOS development client on an iPhone, allow location access, keep exact city and district boundaries cached for one point, and have enough explored cells that an uncached city calculation is visibly slower than a scope tap. No network is required after the boundaries are cached.

1. With no objective or an objective in the same city, long-press inside the cached district. Expected: the district is selected directly without a scope chooser, shows Updating during its first calculation, and settles on a percentage.
2. After the district result settles, open Completion, switch Scope to City, select the containing city, and set it as the objective. Expected: the city percentage appears immediately or after only the short SQLite validation; the HUD retains the cached value if Updating is still visible.
3. Switch back to District, then City again. Expected: both values restore without clearing to 0%, pending, or a full visible polygon-rescan delay.
4. Force-close and reopen while still inside the selected area, then switch between the same scopes. Expected: launch reselects that area and its valid SQLite snapshot survives; each cached percentage returns after a short validation.
5. Finish a recording that adds explored cells inside either boundary, then revisit both scopes. Expected: the exploration revision invalidates the old snapshots, the last cached value remains visible with Updating, and both percentages are recalculated and persisted.
6. Use Reprocess recordings or restore a backup with different exploration, then revisit both scopes. Expected: neither old percentage is accepted as current; both scopes refresh from the replaced explored-cell set.
7. Start a recording, close a qualifying enclosure, and switch scopes before Stop. Expected: the selected live percentage can update in memory, but force-closing before finalization cannot turn that preview into a durable snapshot or permanent achievement.

## Midnight Cartographer V0.15.1 Manual Test

Prerequisites: run the 0.15.1 JavaScript bundle in a compatible iOS development client on an iPhone, allow foreground location, enable Paths, Explored Cells, and Markers, and keep at least one saved walk plus one Lyon medal marker in view. Network access is required for uncached Apple MapKit tiles; no OSM refresh is required.

1. Enter the map. Expected: Apple MapKit uses a dark muted treatment; roads and essential labels remain legible, while generic native POI symbols and the native blue location cursor are absent.
2. Obtain a trustworthy outdoor fix, then pan, zoom, and rotate. Expected: the game-owned player is the sole location symbol and remains attached to its geographic coordinate without camera auto-follow.
3. View previously explored ground and today's contribution. Expected: cumulative territory is translucent blue with a dark ink-like frontier, while today's contribution is gold and remains distinguishable at walking and city zoom levels.
4. Start a recording and walk through several accepted fixes. Expected: the active route is gold, the orange explored surface extends on its normal coalesced cadence, and GPS quality colors retain their existing semantic meanings.
5. Focus a saved recording from History. Expected: the selected route becomes parchment, other routes use restrained teal/slate/earth variants and dim when appropriate, and inferred street links remain bright teal.
6. Inspect saved route endpoints and medal landmarks. Expected: start and finish use parchment-and-ink flag/check markers; locked and collected medals use distinct custom atlas seals; no native teardrop pins remain. Tap each kind and confirm its title/callout or medal action still works.
7. Disable Markers in Options and re-enable them. Expected: route and medal markers hide and return without affecting the player, route geometry, explored territory, or map gestures.
8. Force-close and reopen, then repeat once with location permission denied. Expected: the visual treatment returns unchanged, saved data persists, and the durable last-known player remains the only location marker while the GPS badge reports the permission state.
9. Zoom from close walking scale to a city-wide view with a large explored ledger. Expected: blue/gold contours remain seam-free, far-level marker reduction still works, and map interaction remains responsive.

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

1. Open the map with at least two saved routes. Expected: saved routes use restrained teal/slate/earth variants, explored ground uses translucent blue, and today's explored overlay uses gold without competing with the navy/gold interface.
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
2. Confirm the `mapbound-native-splash.png` Mapbound artwork appears for the native splash and transitions into the visually matching `loading-screen3.jpg` branded in-app launch layer while the native map, saved records, unfinished-recording check, permission state, and bounded initial-location attempt prepare underneath it.
3. Confirm the complete artwork receives one text-free second across launch without repeating the delay at the React handoff, the localized Walk/Explore/Reveal subtitle reveals beneath the logo, and `Press here to start` appears after the half-second quiet beat regardless of whether preparation has completed. No loading message appears before interaction.
4. Tap `Press here to start`. Expected: a ready launch skips the loading row and slowly fades to the map immediately; an unfinished launch shows the localized loading row on the retained splash, then automatically performs the same slow fade as soon as preparation completes.
5. Open and close Details, History, Completion, and Options in turn; after each one, confirm the map gestures and bottom controls still respond.
6. With foreground permission granted, confirm the player icon appears before recording and the map centers on the current location.
7. If no fix is available, confirm startup resolves after the bounded attempt; a later fix may center the map unless you already moved it.
8. Confirm the half-size version number remains independently aligned to the safe bottom-right corner and the matching transparent `title.png` Mapbound logo appears on the map.
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
4. Open History and confirm the list appears without loading every route or pausing to count the complete GPS ledger; tap one recording and confirm only that recording's detailed GPS and route data loads. Repeat immediately after stopping a walk while its durable cache repair is pending and confirm the row still shows the exact point count.
5. Close History, restart, enable Paths, and confirm detailed routes load on demand.
6. Start a recording and confirm live distance, cells, and the complete route advance without progressively worsening input lag.
7. Stop and confirm the report and Start control return after the durable session save, without waiting for route inference, exact step reconciliation, medals, objectives, or the complete saved-history refresh. For a continuous short route, confirm the direct snapshot fast path avoids street-corridor graph work.
8. Run Reprocess recordings explicitly and confirm that is the only workflow that performs full-history route, street, contour, and loop rebuilding.
9. Repeatedly open and close History and Completion with a large explored-cell ledger; confirm Back returns control to the map immediately while unfinished Completion scans are cancelled.
10. Scroll a history containing at least 100 recordings and confirm rows stay responsive instead of mounting the complete list at once.
11. Switch Paths through Today, Last 7 days, Selected, and All and confirm only that scope is loaded and displayed.
12. During recording, keep moving through several rapid GPS fixes and confirm the player and active route move immediately while red/today contours refresh repeatedly at roughly 650ms intervals instead of waiting for GPS delivery to pause; medal collection may use the same short settle interval.
13. With the 0.22.4 development bundle, pan repeatedly across a city with many district outlines and a 60-marker Paris album, then remain idle and walk through several fixes. Confirm static medals and boundaries do not flicker or continuously redraw, medal taps still open the correct item, and the animated player continues updating.
14. Inspect development logs. Confirm idle time does not continuously increase MapScreen/ExplorationMap render counts, and investigate recurring `[performance] map.live-enclosure`, `[performance] map.explorer-score`, `[performance] map.exploration-surface`, or `[performance] map.today-surface` entries above their printed thresholds. During launch, History opening, path-scope changes, and recording selection, separately note `map.saved-data-queries`, `map.path-history-load`, and `map.selected-walk-load` so database/hydration latency is not mistaken for map-render latency.
15. Close a qualifying loop during the recording. Confirm the enclosure stamp, live Explorer Score, filled surface, and final persisted score agree; this verifies that the shared enclosure result did not change behavior.
16. Export a large V5 backup and confirm bounded block compression completes without an iOS memory warning or empty file, then reselect the Files copy and confirm verification succeeds.

## Long Recording And Reconnect Test

1. Start outdoors with a reliable fix and record more than 1,000 accepted points.
2. Confirm the beginning of the route stays visible, including when zoomed far out, while distance and explored cells continue increasing.
3. Confirm stable chunk boundaries do not create visual holes, flash, or repaint while the open tail grows; input responsiveness should remain stable after several frozen chunks accumulate.
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

## Micro Reward Audio V0.16.27 iPhone Manual Test

Prerequisites: run Street Explorer 0.16.27 in a compatible iOS development client (build 142 or newer for a matching release binary), allow foreground location, and prepare a qualifying enclosure or completable expedition. Start a music track and then a spoken-word podcast in another app so both content types can be checked. Headphones and the phone speaker should each be tested when practical; no network is required for the bundled sounds.

1. Launch Street Explorer while external audio is already playing. Expected: the music or podcast continues without pausing, stopping, restarting, or lowering volume.
2. Trigger an ordinary location-change stamp. Expected: its ink sound begins with the visible stamp and plays over the external audio; the other app continues uninterrupted.
3. Close a qualifying new enclosure. Expected: the ink impact begins immediately as the reward stamp appears, the victory jingle follows about 90ms later, and neither cue pauses or ducks the external audio.
4. Complete an expedition. Expected: the same immediate ink-then-jingle order plays exactly once over the continuing external audio.
5. Trigger another reward after the first jingle has ended. Expected: both retained players restart from their beginning; no cue is missing, delayed by player creation, or resumed from its previous end position.
6. Repeat steps 2–5 with Reduce Motion enabled, Bluetooth/headphones when available, and both music and podcast playback. Expected: the visual motion changes as documented, but cue order, prompt start, and external-audio mixing remain consistent.

Automated checks verify static player creation, removal of the delayed dynamic import path, 90ms ink-before-jingle sequencing, `mixWithOthers` configuration, TypeScript integration, and iOS asset bundling. Physical-device verification remains required because simulator/export checks cannot prove iOS audio-session interaction with real media apps or subjective sound timing.

## Micro Reward Stamps V0.16.26 iPhone Manual Test

Prerequisites: run Street Explorer 0.16.26 in a compatible iOS development client (build 141 or newer for a matching release binary), allow foreground location, and use a walkable location where a qualifying enclosure can be closed. Select an official district and accept an expedition that can be completed with available local evidence. Network is needed only for uncached MapKit, boundary, street, or medal data; the reward assets themselves are offline.

1. Select a district or city objective. Expected: the existing large location-selection stamp keeps its ordinary short ink sound and does not play the victory jingle.
2. Start a walk and close a new qualifying enclosure. Expected: the enclosed surface fills, one large map-centered `AREA ENCLOSED` stamp uses the exact location-change scale/strike and reports the number of newly revealed cells, the dedicated victory jingle and medium haptic play once, and recording/map interaction continues without pausing.
3. Keep walking after the stamp dismisses without creating another enclosure. Expected: the same enclosure does not replay the stamp or jingle. Close a second distinct qualifying enclosure; exactly one new reward plays for that closure.
4. Complete the accepted expedition and wait for durable finalization. Expected: one `EXPEDITION COMPLETE` stamp uses the same strike and victory jingle, displays `+200 PTS`, adds one permanent seal, raises Explorer Score by 200, and does not replay after reopening.
5. Enable iOS Reduce Motion and repeat a qualifying closure. Expected: the reward remains visible for the reduced duration, uses the final stamp state instead of the strike sequence, continues to avoid blocking input, and still plays the reward audio/haptic.
6. Switch the app to French and repeat both reward types. Expected: localized `ZONE ENCLOSE`/`EXPÉDITION ACCOMPLIE` wording fits inside the existing stamp, including the singular/plural revealed-cell detail.

Automated checks cover the locally bundled audio asset, source provenance file, reward-message routing, default ink fallback, TypeScript integration, and enclosure geometry. Physical-device verification remains required for audio balance, haptic timing, non-blocking interaction, Reduce Motion presentation, and localized visual fit.

## Expedition Navigation Icon iPhone Manual Test

Prerequisites: run Street Explorer 0.16.25 in a compatible iOS development client (build 140 or newer for a matching release binary). Have one official level-9 district available in Completion, but begin with no district objective selected. Network is required only if its boundary is not cached.

1. Inspect the bottom icon bar. Expected: a permanent compass Expeditions target appears directly with Details, History, Completion, and Medals; Options remains separated at the far edge, and every inactive target remains at least 44 points.
2. Tap Expeditions with no district objective. Expected: its icon alone gains the engraved gold selected state and localized label, the full-screen Atlas journal opens over the map, and an explicit no-district explanation appears instead of a blank or loading screen.
3. Tap Select a district. Expected: Expeditions closes and Completion opens, preserving the normal Atlas transition and back behavior. Select an official district objective.
4. Tap Expeditions again. Expected: the journal opens directly with that district’s five daily choices. Close it using both the header Back action and the iOS left-edge swipe; each returns to the live map and collapses the compass destination to its icon.
5. Tap the expedition progress line in the district objective HUD. Expected: it opens the same journal and state as the permanent compass destination, with no duplicate modal or divergent progress.

Automated UI coverage verifies permanent dock wiring, selected-state styling, the shared Atlas gesture, and the no-district Completion handoff. Physical-device verification remains required for icon spacing, localized expanded-label fit, touch comfort, and native modal gestures across supported iPhone widths.

## District Expeditions V1 iPhone Manual Test

Prerequisites: run the Street Explorer 0.16.25 bundle in a compatible iOS development client (build 140 or newer for a matching release binary), allow foreground location, and select an exact official level-9 district objective. Cache some OSM streets in that district; for complete coverage, use a district with at least one uncollected landmark medal. Stop any active recording before accepting an expedition. Network is needed only to obtain uncached boundaries, streets, MapKit tiles, or medal metadata; already cached gameplay and expedition progress are offline.

1. Tap the expedition line in the district objective HUD. Expected: the Atlas journal opens with exactly three choices for the current local date and district, a seal count, and explicit wording that each seal contributes 200 Explorer Points without introducing a ranking.
2. Close and reopen the journal, then force-close and reopen the app. Expected: the same three choices, kinds, and targets remain for that district and date.
3. Accept a new-cell expedition. Expected: it becomes the sole active expedition, begins at 0, appears in the objective HUD, and pre-existing cells do not count.
4. Start walking inside the district and explore enough genuinely new cells. Expected: live map exploration behaves normally; after durable Stop/finalization, expedition progress increases only for qualifying district cells created after acceptance.
5. Complete the target and wait for finalization. Expected: one EXPEDITION COMPLETE stamp displays `+200 PTS`, the expedition gains a completed state, exactly one permanent seal is added, Explorer Score rises by 200, and reopening the app keeps it earned without adding a duplicate.
6. Accept another available expedition, then switch to a second district objective. Expected: the first expedition remains the only global active mission and the second district cannot accept another until the first is abandoned or completed; its journal still shows its own deterministic daily choices.
7. Return to the first district and abandon the active expedition. Expected: the HUD clears its active progress, no seal is awarded, and a different expedition can now be accepted. Restarting the abandoned choice resets its post-acceptance progress boundary.
8. While a recording is active, open the journal and try to accept or restart a choice. Expected: acceptance is disabled/blocked while recording; the recording continues safely and no ambiguous progress boundary is created.
9. Accept a close-loop expedition, record a qualifying loop, and Stop. Expected: the provisional live closure does not complete the expedition before the walk is finalized; afterward progress becomes 1 and awards one seal. Repeat with an underfilled walk that is discarded during recovery. Expected: its provisional evidence does not count.
10. If offered, accept a street expedition and finish an incomplete cached OSM street after acceptance. Expected: progress changes only when the street obtains its durable completion timestamp inside the selected district. If offered, repeat for an uncollected district medal. Expected: only a medal collected after acceptance and anchored inside the district counts.
11. Leave an expedition unfinished across local midnight and reopen. Expected: the old active expedition remains reviewable and can be finished or abandoned, while the current day has a new deterministic set of three choices.
12. Create and verify a Backup V5 archive after earning at least one seal and leaving another expedition active. Restore that archive. Expected: restore preview reports the seal count; the active expedition, progress, daily choices, loop evidence, and permanent seals return exactly once. Force-close and reopen to confirm persistence.
13. Disable network after caching the district and repeat journal open, acceptance, cell progress, relaunch, and abandonment. Expected: all expedition state and qualifying cached gameplay remain functional offline.

Automated coverage already verifies generation, local rollover, one-active enforcement, finalized loop evidence, persistence wiring, and V5 manifest validation. Physical-device verification remains required for MapKit/HUD interaction, live GPS finalization, midnight behavior, real OSM street/medal opportunity filtering, stamp presentation, and Files round-trip restore.

## Backup V5 Manual Test

Prerequisites: run the Street Explorer 0.16.25 bundle in a compatible development client (iOS build 140 or newer for a matching release binary), allow Files access, stop any active recording, keep one known-good verified V5 archive, and ensure the device has enough free space for a backup plus a GPX ZIP. For archive-block coverage, use a database with at least 25 finalized walks. Include named walks with accents and filesystem-reserved punctuation if practical. Network and location permissions are not required for export or restore.

1. Start a recording, open History, and tap Backup and Export all GPX in turn. Expected: each export is blocked, no partial shared file is reported as successful, and the active recording remains unchanged.
2. Stop and save the recording, reopen History, and note the walk count, names, point counts, medals, zone achievements, and one frozen route containing an inferred bridge. Expected: this is the baseline for lossless restore.
3. Tap Backup several times quickly. Expected: the first tap immediately shows Backup in progress, disables duplicate actions, and produces only one export. Choose Save to Files and save the `.streetexplorer` archive outside the app; after sharing, Files opens again for required verification and the app has not reported success yet.
4. Cancel that verification picker. Expected: Backup failed identifies the Verify stage and does not claim the cache-only file is safe.
5. Repeat Backup, save it to Files, then select that exact saved file in the verification picker. Expected: Backup verified reports its size, walk count, GPS-point count, and old-walk archive-block count.
6. Repeat once but select a different V5 file during verification. Expected: verification rejects the mismatched backup identity.
7. Force-close and reopen Street Explorer, then confirm the saved archive is still visible in Files. Expected: the external copy survives independently of the app cache.
8. Tap Restore and choose the verified V5 archive. Expected: Checking backup appears while the complete archive is validated; only afterward does a confirmation show export date, source app version, size, walk count, GPS-point count, medal count, zone-achievement count, and expedition-seal count. Local data has not changed.
9. Cancel the restore confirmation. Expected: History and all progress remain unchanged, and another data-tool action can start normally.
10. Duplicate and truncate or alter a V5 archive on a computer, return it to Files, and choose it through Restore. Expected: checksum/footer verification fails before any confirmation or local replacement; the existing history remains intact.
11. Select the valid V5 archive again and confirm its preview. Expected: Restore in progress appears immediately, repeated data-tool taps are disabled, the same archive is revalidated, and all logical walks return with their original IDs/names/times/counts, frozen route geometry and inferred evidence, medals, zone achievements, expedition state, and seals; no monthly archive block appears as a fake recording.
12. Force-close and reopen after restore. Expected: the same restored history and map data persist, and derived exploration/street completion can rebuild from the exact frozen routes.
13. Try Restore with a V1-V4 or arbitrary JSON file. Expected: it is rejected during inspection; V5 is the only accepted restore format and no V4 conversion action is present.
14. With at least 25 walks, repeat export/restore and inspect History. Expected: the newest 20 are stored as individual hot records, older walks share bounded monthly physical blocks, and all walks remain individually named/selectable/deletable.
15. Tap Export all GPX several times quickly and save the ZIP through the share sheet. Expected: Exporting all GPX files appears immediately, duplicate data actions are disabled, and only one archive is produced.
16. Inspect that ZIP on a computer. Expected: it contains exactly one `.gpx` entry for every finalized walk; names are readable, unique by session ID, stripped of reserved filesystem characters, and each GPX has the recording name, start time, and complete accepted point stream.
17. Tap a recording and Export GPX. Expected: the existing single-recording GPX share/save flow still works and its document content matches the corresponding bulk entry.

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
6. Start recording, walk a qualifying loop that visibly closes and fills a new blue area, and keep the recording active. Expected: after the closing cell is accepted, the HUD briefly calculates and then updates its percentage and remaining-cell count without Stop or relaunch. Stop and finalize the recording; expected: the same or reconciled durable percentage remains, and only durable 100% completion can create a permanent achievement.

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
23. Force-close and reopen from a different cached district. Confirm the launch location's district replaces the last long-pressed objective and the new selected city's cached district outlines return without requiring Completion to be opened. Repeat with location denied and confirm the last saved objective remains as the fallback.
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

1. Open the map in Lyon with Markers enabled and confirm its 44 album landmarks appear as locked or earned medal pins. Select Villeurbanne as a city objective and confirm the markers and rail switch to its 14 landmarks; select a Villeurbanne district and confirm the same parent-city album remains active.
2. Open Medals for both cities and confirm the city-specific count is shown out of 44 or 14, collected medals appear before locked medals in All and every available numbered-district filter, French accents such as `Fourvière`, `Nécropole`, and `Théâtre` render correctly, every chip is vertically centered and unclipped, every filter works, and tapping any card focuses its exact anchor on the map. Switch to All Cities and confirm unlocked medals from both cities are grouped by city without locked entries.
3. Start a walk and trace at least 80m around a landmark, returning close enough for the normal one-cell gameplay seam tolerance. Keep the anchor strictly inside and the enclosed area below 150,000m2.
4. Close the accepted boundary and continue moving for several GPS fixes instead of pausing. Confirm the medal still unlocks while the walk remains active within the short settle window: the map marker changes from a lock to a medal and the collection card becomes unlocked without waiting for Stop.
5. Confirm previously mapped teal cells do not block the award. Repeat over an area visited before the medal feature and verify the new qualifying loop still unlocks it.
6. Confirm passing near the marker, leaving it on the boundary, walking less than 80m, leaving a gap larger than the normal seam tolerance, or exceeding 150,000m2 does not award it.
7. Confirm the two-second orchestral chime, success haptic, dark overlay, 3D rotating medal, localized title/description, and Continue control appear. Tap Continue and confirm the medal shrinks and flies into the measured Medal tab, which briefly pulses. With Reduce Motion enabled, confirm the initial reveal is static while the award remains usable.
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
7. Trace a qualifying enclosure while continuing to move after crossing the boundary. Confirm its blue/gold surface fills during the active walk without pausing for GPS, remains filled immediately after Stop, and does not require an app restart.
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
12. Confirm independently enclosed qualifying areas count toward completion immediately and that the percentage matches the solid orange surface.
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
7. Close a qualifying loop and confirm the filled surface, enclosure reward, and Explorer Score update together with no duplicate pause.
8. Run npm run test:geometry and confirm all contour, display-hole, loop-cap, score-reuse, open-path, and large-surface checks pass.

## Forbidden Zones V0.29.0 Manual Test

Prerequisites: run the Mapbound 0.30.2 JavaScript bundle in a compatible development client (iOS build 213 or newer for a matching release binary), enable Explored Cells, stop any active recording, and prepare exact cached district/city boundaries. Test data should include one completely enclosed direct/inferred-cell boundary below 150,000 m², one above 150,000 m² but no larger than 2 km², one open boundary, and one large enclosure crossing two districts if practical. Keep verified Backup V5 archives from v0.29 with a Forbidden Zone and from before v0.29.0 for backward-compatibility testing. No network is required after the needed administrative boundaries are cached.

0. Upgrade a populated pre-Forbidden-Zone database, wait for the launch prompt to pulse, and press Start. Expected: the map opens without waiting for completion-cache rebuilding; Forbidden Zones hydrate immediately afterward and any uncached objective completion scan begins only after the launch overlay has dismissed.
   For the schema-repair regression, preinsert migration ledger ID 32 without the two Forbidden Zone tables, then launch build 207. Expected: migration 33/startup recreate both tables and their bounds index without deleting recordings or exploration data.

1. Start a walk and inspect the Field Log Forbidden Zone map-with-slash control. Expected: the control is visibly disabled and cannot enter selection mode. Stop and save the walk; expected: the control becomes available.
2. Tap the Forbidden Zone control while idle. Expected: its purple selected state is unmistakable and the Field Log says to long-press a surrounded inaccessible area. Tap it again; expected: the mode exits without changing the objective or data. Reactivate it for the remaining steps.
3. While the mode is active, long-press a different city or district. Expected: only Forbidden Zone handling runs; neither the city nor district objective changes and the District/City picker does not appear. Deactivate the tool and repeat the same hold; expected: the original administrative selection behavior returns.
   At a close zoom, hold inside Lyon’s 3rd arrondissement and expect exact selection. Zoom out to the normal city view, hold directly inside the large purple Forbidden Zone in the 3rd, and repeat near—but still visually within—the district boundary. Expected: the purple polygon never consumes the hold, the concentric bounded tolerance still selects the 3rd, and a hold on the Villeurbanne side continues selecting Villeurbanne rather than a nearby Lyon district.
4. Long-press the open test region. Expected: no zone is created, the mode stays active, and the app says the area has not been completely surrounded.
5. Surround and reprocess the sub-150,000 m² region. Expected: normal loop fill captures it as orange explored territory. Activate Forbidden Zone mode and hold inside the underlying enclosure. Expected: no purple zone is created and the app explains that normal capture applies.
6. Reprocess the 150,000 m²–2 km² enclosure. Expected: loop diagnostics reject it as `loop_area_too_large` and its interior remains unexplored. Activate Forbidden Zone mode and hold inside it. Expected: the app shows a checking state, creates one immutable region matching the enclosure rather than a radius, exits selection mode, immediately renders a translucent-purple fill/darker contour, and confirms that the area is excluded—not explored—with m² or km² formatting.
   Repeat while another completion write is finishing, if reproducible. Expected: bounded SQLite contention retries complete atomically instead of showing a generic save failure. If storage remains unavailable, the alert identifies busy storage, missing schema, or an overlapping existing zone.
7. Inspect Details and exploration data after creation. Expected: walked, inferred, loop-filled, discovered surface, Explorer Score, and explored-cell totals are unchanged; no Forbidden Zone cell appears as an `explored_cells` source or `loop_fill` row. With diagnostic or restored overlap data, confirm every forbidden key is still excluded independently from walked, loop-fill, live enclosure, surface-area, and point totals until the zone is removed.
   During creation, enter a comment of up to 120 characters and save it. Expected: the zone remains created if the comment is skipped, the editor rejects additional input beyond 120 characters and line breaks, and saving changes only the label metadata—not geometry, cells, completion, or score.
   With that district objective still active, tap the purple zone. Expected: the comment and area appear directly above the tapped map position without a dialog and remain visible through unrelated taps, pans, and zooms. Tap the label, edit or clear the comment, and save; expected: the direct label updates immediately. Switch to another district or city; expected: the label disappears. Switch back and confirm it stays hidden until the zone is tapped again.
8. Force-close and reopen. Expected: the same purple geometry returns from SQLite without reselecting or expanding. Explore adjacent cells, reopen again, and confirm the stored purple snapshot does not grow.
9. Select an overlapping district and record its raw cached cell total, explored numerator, forbidden overlap, eligible total, and percentage. Expected: `eligible = raw total - forbidden overlap`; the explored numerator is unchanged and percentage uses `explored / eligible`.
10. Select a Forbidden Zone that crosses two cached districts or a city boundary. Expected: each scope excludes only cell centers inside its own exact polygon; the zone has no permanent district/city ownership and remains unchanged after a boundary refresh.
11. Activate the tool and hold inside the purple zone. Expected: Remove Forbidden Zone? explains that the area will count again. Choose Cancel; expected: the mode and purple zone remain. Repeat, choose Remove, and expect the purple layer to disappear, the eligible denominator/remaining count to restore, the current percentage to recalculate, and selection mode to exit. Immediately reactivate the tool and recreate the same enclosure; expected: it succeeds without an overlap warning. Also upgrade a database affected by the old orphan-cell bug; expected: migration 35 repairs it at launch and the enclosure can be created again.
12. Verify removal did not delete or alter GPS points, recordings, route snapshots, explored cells, loop fills, Explorer Score, or a previously earned permanent district/city achievement. Expected: the permanent achievement remains earned even if current percentage is now below 100%, while the live percentage and remaining count show the restored denominator.
13. Recreate a valid Forbidden Zone, delete an unrelated recording, and run both single-walk and full Reprocess recordings. Expected: the zone and its completion effect survive every operation while explored/loop-derived data rebuilds normally.
14. Refresh OSM/admin boundaries. Expected: the local Forbidden Zone remains; completion recomputes overlap against the refreshed polygons instead of using a stored administrative attachment.
15. Attempt a completely enclosed selection larger than 2 km². Expected: no zone is stored, the mode stays active, and the app reports that the selected area is too large.
16. Export and externally verify a new Backup V5 with at least one Forbidden Zone, clear local data, then restore it. Expected: exact cells, area, purple geometry, and completion denominator effects return once, alongside existing recordings and progress.
17. Export and restore a v0.30 Backup V5. Expected: Forbidden Zone comments return with exact geometry and cells. Restore the v0.29 archive whose zone has no `comment`; expected: validation succeeds and the zone returns with an empty optional comment. Restore the pre-v0.29.0 Backup V5 that has no `forbiddenZones` field; expected: validation succeeds, Forbidden Zone state is empty, and all older supported data restores normally.

Automated checks: `npm run typecheck`, `npm run test:geometry`, `npm run test:backup`, and `npm run test:ui` cover shared loop-limit classification, open/normal/oversized/safety-ceiling states, denominator-only arithmetic, migration/repository wiring, bounded overlap queries, purple merged rendering, idle-only interaction priority, exact Backup V5 snapshots, and missing-field compatibility. Physical-device verification remains required for native MapKit long-press exclusivity, Field Log layout/selected state, alert flow, large-region responsiveness, native purple polygon appearance, restart persistence, real administrative overlap, and Files round-trip restore.
