# Roadmap

## Completed

- Persistent Atlas footer navigation across all main and secondary pages, direct tab switching, highlighted-tab return to map, return-triggered map-title enlargement, and localized hold-to-preview labels on the map.
- Explorer Score with one point per unique walked tile, one enclosure bonus per enclosed tile, 200 points per permanent expedition seal, automatic retroactive calculation, live updates, a source breakdown in Details, a combined idle Field Log score/today-steps row, point-bearing enclosure and expedition stamps, and a 55-item offline international mapped-surface ladder.
- Real book-page audio at a restrained 50% player volume for both directions of Atlas icon-bar navigation, preloaded offline, audible in iPhone Silent mode, and mixed over music or podcasts.
- Expo React Native TypeScript app scaffold.
- Local SQLite persistence.
- Walking-focused exploration.
- Foreground GPS recording.
- Saved paths and active paths on the map.
- Route history with details, rename, delete, and highlight.
- 15m x 15m deduplicated explored cells.
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
- OSM boundary fetching and zone completion V1 with durable achievements and live active-recording objective previews.
- Zone polish with exact/fallback labels and cached denominators.
- Recording quality summary after stopping a recording.
- Device step counting for walks.
- Full-screen Details, History, and Completion views.
- Lightweight 1320x2868 `loading-screen3.jpg` Mapbound artwork shared by the static native splash and root-owned in-app launch presentation, mounted before database/font/map startup gates, with one launch-wide clean-background second that is not restarted at the React handoff, native-thread stagger across real cyan/gold/parchment phrase nodes, a half-second beat before the restrained Press to start pulse, post-press-only loading feedback, an automatic slow map fade on readiness, an independent half-size safe-corner version, Reduce Motion fallbacks, and the matching transparent `title.png` map logo HUD.
- Frozen street-aware path inference with high/medium-confidence bridges contributing separately tracked inferred cells.
- Authoritative contour-to-completion synchronization and non-destructive exploration reprocessing.
- Phased reprocessing progress, timeout handling, and visible completion diagnostics.
- Consolidated full-history and selected-recording street-corridor repair, per-recording graph reuse, atomic exploration replacement, frozen-route aggregate reconciliation, full-history calculation isolation, and explicit selected-walk failure reporting.
- Preloaded launch screen with an explicit, discreet ready-state entry control.
- Map-first cached exploration startup, accuracy-aware current-location centering, a persistent accepted-route player annotation with native MapKit anchoring and game-owned location presentation, self-healing foreground tracking, raw-observation-derived full-walk rendering, atomic durable background-batch publication with chunked backpressure and bounded late-event recovery, consistent backup snapshots, import admission fencing, and GPS-source-validated atomic derived-cache repair.
- Landmark medal collection with France's frozen 875-medal top-100 catalogue bundled offline, including Lyon's balanced 44-medal version-2 roster with four additions in each of arrondissements 3, 4, 6, 7, 8, and 9, plus 449 albums and 3,850 medals in checksum-pinned downloadable packs for Belgium, Germany, Italy, the Netherlands, and Spain; a measured Netherlands pilot with three manually curated cities; a 391-city first wave using 286,643 compressed bytes; official-source-first generation, population coverage and size budgets; atomic offline caching, failure-latched explicit retry, coalesced saved-data refreshes, and download/seeding isolation from core hydration; objective-driven city/district switching; All plus every boundary-backed city subdivision even when a district has zero medals; an offline-safe All Cities view of locally unlocked medals; active-city live/Stop checks; spatial incremental historical scans; indexed expedition queries; permanent Unlocked/Locked sections; an original two-second stereo CC0 orchestral unlock cue; 3D tab-flight presentation; and Backup V5 preservation.
- Unlocked-medal Wikipedia rewards with a morphing read-only embedded frame, selected-language and alternate-language resolution, conservative search fallback, restricted navigation, Reduce Motion support, and default-browser recovery.
- Responsive full-screen navigation with a memoized map subtree, lazy per-recording History details, cancellable Completion scans, and bounded asynchronous Backup V5 sharing.
- App-wide streamlined navy/gold presentation with a roughly 20%-enlarged first-launch and map-return wordmark that collapses after the next interaction, an animated active-walk layout that hides the title and closes the top/bottom HUD toward the screen edges, four separate lightly inset Atlas map stripes with consistent subtle corners, textured navigation whose engraved selected destination expands to a localized Cinzel label, an objective toggle integrated into the medal stripe, layer controls centralized in Options, a compact field-ledger recording stripe with neutral GPS inset, four-metric Completion, and collapsed technical diagnostics.
- Persistent appearance modes with Explorator as the existing dark atlas and an app-wide daylight-optimized high-contrast palette, light native map, and matching status-bar foreground. The former non-functional Custom placeholder has been removed.
- Persistent, independent sound-effect and haptic controls in Options, enabled by default and respected by navigation, stamps, rewards, selection, and medal feedback.
- iOS-first Midnight Cartographer playfield with dark muted MapKit, hidden native POIs/cursor, burnt-orange explored territory, gold current activity, muted copper district boundaries, restrained wine city boundaries, selected-objective stroke hierarchy, restrained route colors, and hand-inked atlas markers. Locked medal pins remain informational name/Locked callouts, while collected pins open Medals.
- Atlas identity pass: original hand-inked cartographer player, bundled Cinzel display typography, neutral-edged cartographic shells for Details/History/Completion/Medals/Options, gold active and reward emphasis, textured navy paper including Stop and recording-summary dialogs, matching textured main-map ledgers and navigation dock with engraved selections and neutral GPS framing, quiet preloaded UI sounds mixed over external audio, Reduce Motion-aware transitions, a reusable generated gold/navy/burnt-orange cartographer seal with fitted outlined wording and a load-gated synchronized artwork/text strike, dedicated non-blocking enclosure/expedition reward wording with an immediate ink hit before its CC0 jingle, explored-area ink reveal, saved-route draw-on focus, and a folded-map objective HUD.
- Original hand-inked four-direction cartographer animation inside one explicitly sized MapKit sprite annotation, with all idle, walk, and stale-GPS frames pre-mounted and transitioned at a 170ms cadence through a 60ms incoming/outgoing overlap that prevents blank native snapshots. Automatic English/French parchment speech uses a separate same-coordinate annotation, avoiding native Callout selection and its unsolicited fit-to-bubble camera movement. That speech marker stays continuously tracked in a fixed 244-by-128 layout, with the original panel and arrow locked together. Apple Maps uses its required native -58-point center offset to place the arrow tip at the hat; Android retains its normalized bottom anchor. Child-only hidden opacity prevents upper-left reactivation snapshots, while elapsed-time typewriter progress catches up after background JS stalls. Prioritized lifecycle, distance, new-cell/streak, revisit, stationary, GPS, and randomized reactions, short dismissal, and Reduce Motion remain. Sprite and speech state are isolated in single-annotation components, so bubble changes never refresh the player marker. One-time Start/Resume recentering, camera-independent panning, durable trustworthy-position restore, accessible stale-GPS state, and Stop/Start/recovery visibility remain intact. Screen-space projection, coordinate animation, marker-image replacement, and parallel sprite annotations remain disabled for device-stable rendering.

- Performance pass V1: immediate player/route lane, non-starving coalesced and geometry-keyed exploration surfaces, anchor-gated medal analysis, localized timers, lower-frequency tail polling, virtualized/unmounted menus, scoped route-history SQL, exploration/session indexes, corrected aggregate queries, concurrent startup drain, bounded backup serialization, direct Ionicons fonts, and focused diagnostics/regressions.
- Performance pass V2: stable map callbacks and native prop objects, memoized administrative/surface/route-marker/medal-marker/player subtrees, static medal-marker snapshots, shared live-enclosure score geometry, production-free render diagnostics, and physical-device slow-path timing labels.
- Performance pass V3: per-polyline memoization with tail-only long-recording coordinate refresh, one-time lazy initial-region derivation, persistence-batched recording fixes, and snapshot-backed History point totals with exact repair fallback.
- Zone Boundary Completion V2: full local and containing-city district retrieval, robust unordered/reversed multipolygon assembly, strict all-component interior parent validation that ignores stale cached associations, persistent city-wide district outlines, haptic long-press selection with direct same-city district switching and cross-city scope controls, objective-preserving panning, race-safe boundary and percentage scans, display-only invalid-boundary fallbacks, exact-cache downgrade protection, saved-objective recovery, geometry-fingerprinted denominator caching, automatic 30-day refresh with persisted status, permanent zone achievements, district/city rollups, and Backup V5 preservation.
- Administrative hierarchy preservation: retain source OSM levels, use level 9 as the minimum and final playable District tier, keep level 10 internal only for source fidelity and backup compatibility, automatically reclassify legacy caches, and clear invalid old neighborhood objectives without deleting historical rows.
- Objective completion snapshot cache: immediate memory/SQLite scope restoration, boundary-and-exploration validity keys, cached-value Updating feedback, and paired city/district background precomputation.
- Street-Aware Path Inference V3: encoded identifiable topology refresh, metadata-safe crossings and sub-8m endpoint joins, bounded ambiguous-snap routing that excludes `foot=use_sidepath`, immutable evidence-rich bridge snapshots, inferred-cell attribution, concise History review, and selected-walk reprocessing.
- OpenStreetMap Street Completion V2: frozen-route proportional metre coverage, nearest direction-compatible matching, repeated-bin deduplication, 90% OSM-way completion records, V1 evidence migration, durable SQLite state, Completion metrics, and active-walk-safe asynchronous rebuilding.
- Saved-path focus polish: one-action Selected/layer activation and overlap-based Today visibility for midnight-crossing recordings.
- Recording Recovery V2: full-screen persisted-route preview, verified Active/Interrupted/Uncertain background status, safe recommended actions, bounded long-route rendering, and atomic date/time-based naming during recovered finalization.
- UI Polish V2: semantic walking/path colors, consistent dark cards across Details/History/Completion, summary-first route details and post-walk reports, and five explicit GPS presentation states with age/accuracy thresholds.
- Data Tools V2: verified archive preview before restore confirmation, same-file revalidation before atomic replacement, streaming bulk GPX ZIP export, and retirement of the temporary V4 converter.
- District Expeditions V2: five district-and-date-shuffled offline choices per local day from 25 unique spatial, street, loop, medal, and staged-combination archetypes; opportunity-aware viability filtering; migration-31 replacement of the legacy four-kind constraint plus one-time current-day rotation of untouched offers; persisted concurrent selection across days and districts; independent durable finalized progress; permanent journal seals worth 200 retroactive Explorer Points each; a permanent Atlas navigation destination plus contextual multi-mission HUD shortcut; no-district handoff to Completion; and Backup V5 preservation.

## Next Priority

### 1. District Progress Map

- optional emphasis for underexplored district pockets and incomplete streets
- no automatic routing or prescribed path

### 2. Explorer Journal

- chronological district, medal, loop, walk-record, and expedition milestones
- offline and derived from durable local evidence

## Not Planned Yet

- backend
- accounts
- cloud sync
- achievements
- social features
- route recommendations
