# Roadmap

## Splash contrast and completion stamp lifecycle — 0.35.8

The in-app splash keeps its original readable lettering in both appearance modes. Objective-completion stamps now follow the first permanent completion earned by a finalized walk; cached achievements remain visible in the HUD without replaying their celebration on launch or zone revisit.

## Player-centered map launch — 0.35.7

Apple Maps and Google Maps now mount after the initial foreground-location lookup resolves (or permission is denied). This gate latches once, so resuming the app does not unmount the map. The initial camera prefers the player location, including a saved last-known location when a fresh fix is unavailable. Startup camera commands wait for both map readiness and nonzero native layout, retain the intended region before a city remount, and ignore late fallback-camera events until the target is reached. A user pan, area hold, or explicit focus cancels that pending camera guard. Without any available location, saved-route/default fallback remains necessary.

## Location-label readability — 0.35.6

City/district selection labels now reveal a translucent backdrop with soft shadows alongside the text. Explorator uses dark navy; Daylight uses warm parchment behind dark lettering. The backdrop follows the same reveal, fade, replacement, and Reduce Motion behavior as the label.

## Polygon performance and Forbidden Zone visibility — 0.35.5

Implemented stable keys for ordinary explored-island growth, an Apple Maps native overlay-order patch, explicit Google Maps layer order, and guarded early Forbidden Zone hydration. Connected islands are already merged; a single native polygon cannot represent disconnected territory without covering unexplored space. Next validation is a build 235 iPhone walk and provider-switch check, including native frame pacing and purple-layer visibility. Viewport culling or tile-based geometry should be considered only after device profiling of fragmented histories.

## Splash version label — 0.35.4

The splash screen version label is now 12 points, doubled from 6 points (200%), and remains in the safe bottom-right corner.

## Google Maps medal visibility — 0.35.3

Google Maps medal markers now keep their custom view drawable on both Android and iOS through native layout and font rendering, redraw after 500 ms, then freeze to avoid ongoing snapshot cost. Apple Maps retains its stable native marker behavior. Ionicons are preloaded before map startup. Physical Google Maps checks remain pending.

## Android fresh-install recovery — 0.35.1

Version 0.35.1 / build 231 includes Android Google Explorator/Daylight styling from 0.35.0, a non-blocking first-location boundary lookup when no objective is cached, identified Overpass requests with a second-server fallback, and a visible retry explanation after failed map holds. Partial/error boundary responses are rejected. Cached areas remain selectable offline. The user confirmed Android map styling and local-area lookup work on 2026-09-22; medal-marker rendering is tracked separately in 0.35.2.

## Android Distribution Preparation

Version 0.34.8 adds environment-based Google Maps key configuration and standalone APK instructions. Google Cloud API restrictions, the EAS signing certificate, and the sensitive preview environment key were configured on 2026-09-22. The preview APK (build 229) built successfully on 2026-09-22. Remaining: validate map rendering, locked-screen recording, and saved walks on a physical Android phone. See [Development Build](DEVELOPMENT_BUILD.md#android-google-maps-and-standalone-apk) and [Testing](TESTING.md).

## iOS Provider Switch (0.35.0)

Implemented: saved Apple/Google selection, Apple default, idle-only switching, older-client fallback, separate restricted iOS Maps key, and provider-specific map styling/speech anchoring. The iOS development client 0.35.0 / 230 built successfully on 2026-09-22; no new standalone iOS preview was requested. Remaining: verify both providers, saved selection, camera continuity, permissions, offline behavior, and recording on a physical iPhone; consult Development Build for native build status.

## Completed

- 0.34.4 resilience pass: atomic migrations and legacy interruption recovery, bounded body-aware requests, startup Retry, preserved historical street-completion meaning, per-session rebuilds, yielding backup records, and incremental live boundary edges.

- Persistent Atlas footer navigation across all main and secondary pages, direct tab switching, highlighted-tab return to map, return-triggered map-title enlargement, and localized hold-to-preview labels on the map.
- Explorer Score with one point per unique discovered tile, one enclosure bonus per enclosed tile, automatic retroactive calculation, live updates, a source breakdown in Details, a combined idle Field Log score/today-steps row, point-bearing enclosure stamps, and a 55-item offline international mapped-surface ladder.
- Real book-page audio at a restrained 50% player volume for both directions of Atlas icon-bar navigation, preloaded offline, audible in iPhone Silent mode, and mixed over music or podcasts.
- Expo React Native TypeScript app scaffold.
- Local SQLite persistence.
- Walking-focused exploration.
- Foreground GPS recording.
- Saved paths and active paths on the map.
- Route history with details, rename, delete, and highlight.
- 15m x 15m deduplicated explored cells.
- Countryside map state with exact-country land gating, ignored open-ocean holds, localized out-of-city status, and pale-yellow explored cells outside all exact cached city boundaries while city territory remains burnt orange.
- Walking-focused GPS filtering.
- Basic background tracking setup.
- Development build background recording verified on iPhone.
- Active recording re-sync after returning from background.
- Recording health panel.
- Recovery modal with resume, finish/save, and discard.
- Better exploration stats.
- Map legend.
- Expanded route details in history.
- Compact live recording controls.
- GPX export for recordings.
- Backup V5 with authoritative active-session detection, lossless logical sessions, bounded compressed archive blocks, checksum/footer integrity, required verification of the externally saved Files copy, and V5-only restore.
- OpenStreetMap street segment fetching with retryable-error failover across two globally covered public instances.
- Local OSM street cache.
- GPS-to-street proximity matching.
- Optional OSM debug street overlay.
- Confirmed/inferred/rejected path segment boundary.
- Rejected GPS gaps skipped for map drawing and cell exploration.
- Layer controls.
- Street-completion V1.
- Completion screen foundation.
- Conservative closed-loop fill V1.
- Forbidden Zones: an idle Field Log map-with-slash mode with exclusive map-long-press priority, shared oversized-enclosure classification, a configurable 2 km² safety ceiling, exact immutable 15 m cell snapshots, merged non-interactive purple rendering, optional editable 120-character comments with district-lifetime direct map labels, confirmed child-first removal with migration-35 orphan repair, denominator-only district/city overlap exclusion, explicit exclusion from every Explorer Score cell source, dedicated migration-32/34/35 persistence, and backward-compatible Backup V5 support.
- OSM boundary fetching and zone completion V1 with durable achievements and recording-safe persisted objective presentation.
- Zone polish with exact/fallback labels and cached denominators.
- Recording quality summary after stopping a recording.
- Device step counting for walks.
- Full-screen Details, History, and Completion views.
- Explicit SDK 54 `expo-splash-screen` native configuration using the 1320x2868 `mapbound-native-splash.png`, paired with the lightweight `loading-screen3.jpg` root-owned in-app launch presentation, mounted before database/font/map startup gates, with one launch-wide clean-background second that is not restarted at the React handoff, native-thread stagger across real cyan/gold/parchment phrase nodes with fixed high-contrast colors in both appearance modes, a half-second beat before the restrained Press to start pulse, post-press-only loading feedback, an automatic slow map fade on readiness, launch-gated Atlas reward stamps, completion stamps only after a finalized walk first completes its objective, a 12-point safe-corner version, Reduce Motion fallbacks, and the matching transparent `title.png` map logo HUD.
- Frozen street-aware path inference with high/medium-confidence bridges contributing separately tracked inferred cells.
- Authoritative contour-to-completion synchronization and non-destructive exploration reprocessing.
- Phased reprocessing progress, timeout handling, and visible completion diagnostics.
- Consolidated full-history and selected-recording street-corridor repair, per-recording graph reuse, atomic exploration replacement, frozen-route aggregate reconciliation, full-history calculation isolation, and explicit selected-walk failure reporting.
- Preloaded launch screen with an explicit, discreet ready-state entry control.
- Map-first cached exploration startup, accuracy-aware current-location centering, a persistent accepted-route player annotation with native MapKit anchoring and game-owned location presentation, self-healing foreground tracking, raw-observation-derived full-walk rendering, atomic durable background-batch publication with chunked backpressure and bounded late-event recovery, consistent backup snapshots, import admission fencing, and GPS-source-validated atomic derived-cache repair.
- Landmark medal collection with France's frozen 6,082-medal catalogue bundled offline across the 500 largest communes, including departments and collectivities overseas, with 20-medal and 10-medal rank thresholds and stable curated city identities, plus 449 albums and 3,850 medals in checksum-pinned downloadable packs for Belgium, Germany, Italy, the Netherlands, and Spain; reproducible distribution and SQLite measurements; a measured Netherlands pilot with three manually curated cities; official-source-first generation with polygon-validated fallbacks; atomic offline caching, explicit retry, objective-driven city/district switching, indexed evaluation, permanent Unlocked/Locked sections, an original CC0 unlock cue, 3D presentation, and Backup V5 preservation.
- Unlocked-medal Wikipedia rewards with a morphing read-only embedded frame, selected-language and alternate-language resolution, conservative search fallback, restricted navigation, Reduce Motion support, and default-browser recovery.
- Responsive full-screen navigation with a memoized map subtree, lazy per-recording History details, cancellable Completion scans, and bounded asynchronous Backup V5 sharing.
- App-wide streamlined navy/gold presentation with a roughly 20%-enlarged first-launch and map-return wordmark that collapses after the next interaction, an animated active-walk layout that hides the title and closes the top/bottom HUD toward the screen edges, four separate lightly inset Atlas map stripes with consistent subtle corners, textured navigation whose engraved selected destination expands to a localized Cinzel label, an objective toggle integrated into the medal stripe, layer controls centralized in Options, a compact field-ledger recording stripe with neutral GPS inset, four-metric Completion, and collapsed technical diagnostics.
- Persistent appearance modes with Explorator as the existing dark atlas and an app-wide daylight-optimized high-contrast palette, light native map, and matching status-bar foreground. The former non-functional Custom placeholder has been removed.
- Persistent, independent sound-effect and haptic controls in Options, enabled by default and respected by navigation, stamps, rewards, selection, and medal feedback.
- iOS-first Midnight Cartographer playfield with dark muted MapKit, hidden native POIs/cursor, burnt-orange explored territory, gold current activity, muted copper district boundaries, restrained wine city boundaries, selected-objective stroke hierarchy, restrained route colors, and hand-inked atlas markers. Locked medal pins remain informational name/Locked callouts, while collected pins open Medals.
- Atlas identity pass: original hand-inked cartographer player, bundled Cinzel display typography, neutral-edged cartographic shells for Details/History/Completion/Medals/Options, gold active and reward emphasis, textured navy paper including Stop and recording-summary dialogs, matching textured main-map ledgers and navigation dock with engraved selections and neutral GPS framing, quiet preloaded UI sounds mixed over external audio, Reduce Motion-aware transitions, a reusable generated gold/navy/burnt-orange cartographer seal with fitted outlined wording and a load-gated synchronized artwork/text strike, dedicated non-blocking enclosure reward wording with an immediate ink hit before its CC0 jingle, explored-area ink reveal, saved-route draw-on focus, and a folded-map objective HUD.
- Original hand-inked four-direction cartographer animation inside one explicitly sized MapKit sprite annotation, with all idle, walk, and stale-GPS frames pre-mounted and transitioned at a 170ms cadence through a 60ms incoming/outgoing overlap that prevents blank native snapshots. Automatic English/French parchment speech uses a separate same-coordinate annotation, avoiding native Callout selection and its unsolicited fit-to-bubble camera movement. That speech marker stays continuously tracked in a fixed 244-by-128 layout, with the original panel and arrow locked together. Apple Maps uses its required native -58-point center offset to place the arrow tip at the hat; Android retains its normalized bottom anchor. Child-only hidden opacity prevents upper-left reactivation snapshots, while elapsed-time typewriter progress catches up after background JS stalls. Prioritized lifecycle, distance, new-cell/streak, revisit, stationary, GPS, and randomized reactions, short dismissal, and Reduce Motion remain. Sprite and speech state are isolated in single-annotation components, so bubble changes never refresh the player marker. One-time Start/Resume recentering, camera-independent panning, durable trustworthy-position restore, accessible stale-GPS state, and Stop/Start/recovery visibility remain intact. Screen-space projection, coordinate animation, marker-image replacement, and parallel sprite annotations remain disabled for device-stable rendering.

- Performance pass V1: immediate player/route lane, non-starving coalesced and geometry-keyed exploration surfaces, anchor-gated medal analysis, localized timers, lower-frequency tail polling, virtualized/unmounted menus, scoped route-history SQL, exploration/session indexes, corrected aggregate queries, concurrent startup drain, bounded backup serialization, direct Ionicons fonts, and focused diagnostics/regressions.
- Performance pass V2: stable map callbacks and native prop objects, memoized administrative/surface/route-marker/medal-marker/player subtrees, static medal-marker snapshots, shared live-enclosure score geometry, production-free render diagnostics, and physical-device slow-path timing labels.
- Performance pass V3: per-polyline memoization with tail-only long-recording coordinate refresh, one-time lazy initial-region derivation, persistence-batched recording fixes, and snapshot-backed History point totals with exact repair fallback.
- Zone Boundary Completion V2: full local and containing-city district retrieval, robust unordered/reversed multipolygon assembly, strict all-component interior parent validation that ignores stale cached associations, persistent city-wide district outlines, haptic long-press selection with direct same-city district switching and cross-city scope controls, objective-preserving panning, race-safe boundary and percentage scans, display-only invalid-boundary fallbacks, exact-cache downgrade protection, saved-objective recovery, geometry-fingerprinted denominator caching, automatic 30-day refresh with persisted status, permanent zone achievements, district/city rollups, and Backup V5 preservation.
- Administrative hierarchy preservation: retain source OSM levels, use level 9 as the minimum and final playable District tier, keep level 10 internal only for source fidelity and backup compatibility, automatically reclassify legacy caches, and clear invalid old neighborhood objectives without deleting historical rows.
- Objective completion snapshot cache: launch-time saved/containing city/district SQLite hydration, boundary-and-exploration validity keys, stale-while-revalidate presentation, permanent 100% semantics, selected-zone lazy maintenance, active-recording deferral, and single-flight duplicate suppression.
- Street-Aware Path Inference V3: encoded identifiable topology refresh, metadata-safe crossings and sub-8m endpoint joins, bounded ambiguous-snap routing that excludes `foot=use_sidepath`, immutable evidence-rich bridge snapshots, inferred-cell attribution, concise History review, and selected-walk reprocessing.
- OpenStreetMap Street Completion V2: frozen-route proportional metre coverage, nearest direction-compatible matching, repeated-bin deduplication, 90% OSM-way completion records, V1 evidence migration, durable SQLite state, Completion metrics, and active-walk-safe asynchronous rebuilding.
- Saved-path focus polish: one-action Selected/layer activation and overlap-based Today visibility for midnight-crossing recordings.
- Recording Recovery V2: full-screen persisted-route preview, verified Active/Interrupted/Uncertain background status, safe recommended actions, bounded long-route rendering, and atomic date/time-based naming during recovered finalization.
- UI Polish V2: semantic walking/path colors, consistent dark cards across Details/History/Completion, summary-first route details and post-walk reports, and five explicit GPS presentation states with age/accuracy thresholds.
- Data Tools V2: verified archive preview before restore confirmation, same-file revalidation before atomic replacement, streaming bulk GPX ZIP export, and retirement of the temporary V4 converter.

## Next Priority

Complete the physical-device protocol and remaining performance measurements in [Audit follow-up](AUDIT_FOLLOWUP.md): full polygon regeneration, large individual backup records, aggregate coverage memory,.

### 1. District Progress Map

- optional emphasis for underexplored district pockets and incomplete streets
- no automatic routing or prescribed path

### 2. Explorer Journal

- chronological district, medal, loop, walk-record milestones
- offline and derived from durable local evidence

## Not Planned Yet

- backend
- accounts
- cloud sync
- achievements
- social features
- route recommendations

Completed in 0.34.4: remove expeditions, their bonuses, and their storage with legacy V5 import compatibility. Remaining verification includes real-device upgrade/restore and six-tab navigation, alongside the audit profiling tasks.

Completed in 0.34.5, piano cue updated in 0.34.6: discreet map location labels for city/district/countryside selection, with a user-selected piano cue, cancellable reveal/fade, Reduce Motion support, and independent reward presentation. Physical-device typography, timing, and sound balance still need validation.

Completed in 0.34.7: local-first long-press selection and removal of completion-hydration waits. Remaining: measure physical-iPhone hold recognition and selection latency with a restored history, offline cached areas, and uncached locations before changing the gesture or adding another control.
