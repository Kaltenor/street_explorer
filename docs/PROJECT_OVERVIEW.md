# Project Overview

Street Explorer is a mobile exploration app built with Expo, React Native, TypeScript, and local SQLite storage.

The app records real-world movement and turns it into an exploration map. The goal is not to be a sport tracker. The goal is to feel like a real-life exploration game where streets and areas become visible as they are explored.

## Current Activity

Street Explorer is dedicated to on-foot exploration. Recordings, paths, statistics, history, completion, and GPS quality rules all use the walking profile. Existing data from older activity profiles is preserved and consolidated into walking history during database migration.

## Current Features

- Foreground GPS recording with automatic watcher recovery.
- Permission-aware background tracking with serialized ownership, atomically published delivered batches, nullable headless owner recovery through a unique timestamp match, bounded unmatched retention, and chunked backlog backpressure.
- Local SQLite persistence.
- Saved paths displayed on the map, with History focus automatically selecting/enabling the requested route and Today retaining recordings that overlap midnight.
- Active recording path displayed live.
- 15m x 15m deduplicated explored cells.
- Gameplay-first closed-loop area fill based on enclosed explored cells.
- Shared authoritative burnt-orange exploration-surface and completion contours, with non-decreasing reprocess safety.
- Visible phased progress and explicit failure reporting for historical reprocessing.
- Full-history or selected-recording OSM corridor repair with retryable-error failover across two globally covered public Overpass instances; the single-walk action replaces only its frozen route before safely reconciling complete exploration, loop-fill, and street totals from unchanged snapshots.
- Ready-gated transition from the launch loader to the map through a discreet `Press here to start` control on every launch.
- Non-blocking GPS, route-cache, step-counter, and background-service initialization during launch and recording startup.
- Map-first startup with accuracy-aware current-location centering, one explicitly sized 64-by-64-point original hand-inked cartographer annotation anchored directly to its MapKit coordinate, pre-mounted four-direction idle, three-frame walking, and stale-GPS artwork, one-time Start/Resume recentering, camera-independent panning, game-owned iOS location presentation, durable last-trustworthy-position continuity across GPS, Stop/Start, force-close/relaunch, and recovery transitions, an accessible stale-fix state, a self-healing idle/recording watcher, cached explored cells, and lazy saved-route loading.
- Midnight Cartographer presentation on iOS with dark muted MapKit, hidden native POIs and location cursor, burnt-orange explored territory, gold current activity, restrained saved-route colors, and custom parchment-and-ink route/medal markers.
- Persistent app-wide appearance selection in Options: Explorator retains Midnight Cartographer, Daylight applies a warm high-contrast light palette and light native map across every UI surface, and Custom persists as a selectable future palette while currently inheriting Explorator visuals.
- Medal landmarks retain their independent map visibility through a 0.14 latitude span, twice the former far-level cutoff, without extending heavier route or endpoint overlays.
- Original hand-inked cartographer player with four directional idle poses, three restrained walking frames per direction, desaturated stale-GPS variants, one stable opacity-switched MapKit annotation, and a persistent contrast halo across district surfaces.
- Atlas Cabinet presentation across Details, History, Completion, Medals, and Options with the same left back control, interactive iOS left-edge swipe back over the live map, nested History-detail unwinding, bundled Cinzel display titles, neutral-edged navy paper panels, gold reserved for active and reward states, quiet page/ink sounds, Reduce Motion-aware transitions, Atlas-textured Stop and recording-summary dialogs, and matching low-grain, lightly inset map stripes with restrained corners, parchment/Cinzel identity text, an integrated medal-stripe objective action, engraved active controls, neutral GPS framing, and compact 44-point-safe spacing; plus an original transparent hand-inked cartographer seal with fitted outlined localized wording, a load-gated compact map-selection strike whose artwork and text appear in exact synchronization, restrained completion stamps, explored-area ink reveal, and saved-route draw-on focus.
- Full-walk live/recovery routes retain raw SQLite observations, rebuild deterministically when a fix arrives late, use canonical contiguous indexes, and render stable bounded chunks while only the recent 300 points remain in diagnostic state.
- Confirmed Stop teardown drains entered handlers and the durable background outbox before single-recording finalization. The summary, History row, stats, live cells, and Start control return at that durable boundary; route inference, exact steps, medal/objective checks, and full refresh then reconcile asynchronously through the pending repair outbox; continuous routes without suspicious gaps skip street-corridor graph inference. Underfilled recordings retain a hidden five-minute recovery tombstone, and late finalized merges trigger an immediate safe map refresh. Backup V5 rejects the authoritative active recording, omits hidden recovery tombstones and invisible orphan unfinished rows with their dependent data, reads one transaction, writes compressed checksum records through Expo's current cache-file API, and verifies the externally saved Files copy; import closes both journal and in-memory GPS admission before replacing data.
- Performance-bounded map rendering: immediate player/route updates, non-starving 650ms coalesced exploration snapshots, retry-safe medal analysis, geometry-keyed and memoized native surface overlays, localized duration ticking, three-second idle tail synchronization, and development render/timing diagnostics.
- Large-history scaling through virtualized History rows, unmounted hidden panels, Paths queries scoped to the selected display period, indexed exploration/session reads, pre-aggregated completion SQL, and bounded Backup V5 compression/restoration blocks.
- Startup mounts the map after database and language readiness while the coalesced background outbox drain continues concurrently behind the authoritative recovery check.
- Walking-focused GPS quality filters.
- Route history with rename, delete, highlight, GPX export, and confirmed per-recording reprocessing that is disabled during active recording.
- Recording Recovery V2 with a full-screen persisted-route preview, native background-task verification, Active/Interrupted/Uncertain status, recommended safe actions, bounded rendering for long traces, and atomic naming when finishing.
- Device step counts for walking recordings.
- Icon layer controls for paths, cells, and markers.
- Full-screen Details, History, and Completion views with responsive map back navigation, lazy per-recording History details, and cancellable chunked Completion scans.
- Completion screen with scope and zone selectors.
- OpenStreetMap Street Completion V2 rebuilt from immutable saved routes, with nearest direction-compatible metre coverage, repeat-walk deduplication, a 90% OSM-way completion threshold, durable first-completion timestamps/V1 migration evidence, and asynchronous active-walk isolation.
- OSM boundary loading with full local relation-member geometry, robust multi-ring assembly, display-only invalid fallbacks, exact-cache downgrade protection, geometry-fingerprinted denominator caches, saved-objective recovery after cache repopulation, automatic 30-day refresh status, and a visible last-fetched date.
- Permanent exact-boundary completion achievements with district and city rollups that remain earned across later OSM changes and cache clearing.
- Zone-specific completion stats and map focus.
- Objective-gated city boundary context with strict all-component interior containment excluding shared-edge or detached foreign level-9 relations, every valid district rendered exactly once in muted copper with a stronger selected stroke, only one parchment selected-zone wash, and one restrained wine city perimeter that strengthens for a city objective. Cross-city changes hide any mismatched GPS-derived context, commit an overlay-free frame, and remount MapKit at the preserved camera region so retained native polygons cannot survive without removing globally explored territory; intentional haptic long-press selection with direct same-city district switching and a District/City chooser reserved for cross-city holds, objective-preserving map panning, latest-only boundary/percentage calculations, and a compact objective HUD that refreshes on newly enclosed active areas and Stop, not ordinary open-line cells, while showing completion, remaining cells, and today's added cells.
- Persisted OSM administrative hierarchy keeps official level-9 districts selectable while retaining level-10 neighborhoods internally for future use; neighborhoods are excluded from current outlines, objectives, completion, refresh counts, and visible achievement rollups, and legacy caches reclassify automatically.
- Objective scope changes use stale-while-revalidate memory and SQLite snapshots keyed by exploration revision and boundary fingerprint; paired district/city results precompute together, while active unfinished-recording previews remain memory-only.
- Updated 1320x2868 portrait `loading-screen2.png` shared by the native splash and in-app launch presentation, plus the transparent `title.png` map logo overlay.
- Frozen Lyon v1 landmark album with 20 reviewed OpenStreetMap identities and anchors.
- Real-time enclosure medals using a retry-safe 650ms live evaluator and the normal gameplay loop rules: 80m minimum distance, one-cell seam tolerance, accepted finalized route geometry, strict interior anchors, and a 150,000m2 cap.
- Medal pins, a persistent city medal-progress card on the map, and a full-screen category-filtered collection with permanent Unlocked/Locked sections, Unicode-safe localized landmark copy, unclipped chips, richer earned descriptions, and landmark focus.
- Recoverable medal presentation with a metallic chime, haptic success cue, reduced-motion support, a 3D reveal, localized description, Continue-triggered flight into the Medal tab, and an acknowledged queue.
- Explicit opt-in scanning for qualifying historical walks; new albums never award silently.
- A streamlined navy/gold presentation system across the map HUD, walk controls, full-screen menus, summaries, recovery, and diagnostics. The medal, objective, navigation, and field-log controls now form four separate stripes with consistent 7px screen gutters and restrained 10px corners using the same low-opacity paper grain, parchment/Cinzel identity typography, restrained gold ornaments, engraved active states, and compact 44-point-safe spacing as the Atlas pages; the objective flag is integrated at the medal stripe's right edge without stacking a second texture. Live data remains in the system face, the GPS frame stays neutral while only its dot/label carries status color, and advanced tools and evidence remain in Options or expandable technical details.
- Backup V5 preserves individual session identity, raw GPS points, frozen route snapshots, inferred bridge evidence, medal state, and permanent zone achievements. The newest 20 walks remain individual hot records; older walks are physically consolidated into bounded monthly blocks without fake merged recordings. Restore accepts V5 only, and a temporary complete-V4 converter produces V5 without importing V4 into the live database.

## Current Limitations

- Background tracking is configured but may not fully work in Expo Go on iOS. A development build is likely required for real locked-screen recording.
- Explored cells are grid-based, not exact street geometry.
- OSM is no longer a primary visible gameplay overlay by default.
- District boundaries depend on what exists in OSM near the current location.
- Very large zone denominators may be skipped to keep the app responsive.
- There is no backend, account, cloud sync, social feature, or route suggestion system.
- OpenStreetMap streets remain hidden analysis data; cells and recorded paths are still the primary exploration map.
- Street Completion V2 reports cached walked/loaded OSM distance, not recording distance or a full city-wide denominator. Accuracy still depends on locally cached OSM geometry and tagging; new cache coverage enters the denominator on the next asynchronous rebuild.
- Only high- and medium-confidence topology-validated street bridges contribute inferred explored cells. V3 accepts exact joins, ground-level geometric crossings, grade-compatible endpoint seams up to 8m, and bounded jointly evaluated nearby snaps while excluding `foot=use_sidepath` decoys. It persists per-bridge evidence/cell attribution and leaves unmatched or unsafe gaps hidden with no straight-line fallback.
