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
- Shared authoritative red-surface and completion contours, with non-decreasing reprocess safety.
- Visible phased progress and explicit failure reporting for historical reprocessing.
- One-request historical OSM corridor repair followed by atomic reprocessing with per-recording calculation fault isolation.
- Ready-gated transition from the launch loader to the map through a discreet `Press here to start` control on every launch.
- Non-blocking GPS, route-cache, step-counter, and background-service initialization during launch and recording startup.
- Map-first startup with accuracy-aware current-location centering, a persistent CC0 pixel-art player rendered through flicker-free native annotation images, four-direction idle/walking states, 250-900ms coordinate interpolation, last-trustworthy-position and last-rendered-sprite retention across GPS and Stop/Start transitions, an accessible stale-fix state, a self-healing idle/recording watcher, cached explored cells, and lazy saved-route loading.
- Full-walk live/recovery routes retain raw SQLite observations, rebuild deterministically when a fix arrives late, use canonical contiguous indexes, and render stable bounded chunks while only the recent 300 points remain in diagnostic state.
- Confirmed Stop teardown drains entered handlers and the durable background outbox before single-recording finalization. The summary, History row, stats, live cells, and Start control return at that durable boundary; route inference, exact steps, medal/objective checks, and full refresh then reconcile asynchronously through the pending repair outbox; continuous routes without suspicious gaps skip street-corridor graph inference. Underfilled recordings retain a hidden five-minute recovery tombstone, and late finalized merges trigger an immediate safe map refresh. Backup V5 rejects the authoritative active recording, omits hidden recovery tombstones and invisible orphan unfinished rows with their dependent data, reads one transaction, writes compressed checksum records through Expo's current cache-file API, and verifies the externally saved Files copy; import closes both journal and in-memory GPS admission before replacing data.
- Performance-bounded map rendering: immediate player/route updates, non-starving 650ms coalesced exploration snapshots, retry-safe medal analysis, geometry-keyed and memoized native surface overlays, localized duration ticking, three-second idle tail synchronization, and development render/timing diagnostics.
- Large-history scaling through virtualized History rows, unmounted hidden panels, Paths queries scoped to the selected display period, indexed exploration/session reads, pre-aggregated completion SQL, and bounded Backup V5 compression/restoration blocks.
- Startup mounts the map after database and language readiness while the coalesced background outbox drain continues concurrently behind the authoritative recovery check.
- Walking-focused GPS quality filters.
- Route history with rename, delete, and highlight.
- Recording Recovery V2 with a full-screen persisted-route preview, native background-task verification, Active/Interrupted/Uncertain status, recommended safe actions, bounded rendering for long traces, and atomic naming when finishing.
- Device step counts for walking recordings.
- Icon layer controls for paths, cells, and markers.
- Full-screen Details, History, and Completion views with responsive map back navigation, lazy per-recording History details, and cancellable chunked Completion scans.
- Completion screen with scope and zone selectors.
- OpenStreetMap Street Completion V2 rebuilt from immutable saved routes, with nearest direction-compatible metre coverage, repeat-walk deduplication, a 90% OSM-way completion threshold, durable first-completion timestamps/V1 migration evidence, and asynchronous active-walk isolation.
- OSM boundary loading with robust multi-ring relation assembly, display-only invalid fallbacks, geometry-fingerprinted denominator caches, automatic 30-day refresh status, and a visible last-fetched date.
- Permanent exact-boundary completion achievements with district and city rollups that remain earned across later OSM changes and cache clearing.
- Zone-specific completion stats and map focus.
- A compact objective HUD with selected zone, completion percentage, remaining cells, and today's added cells, toggled by one map-side flag without clearing the saved objective.
- Updated 1320x2868 portrait `loading-screen2.png` shared by the native splash and in-app launch presentation, plus the transparent `title.png` map logo overlay.
- Frozen Lyon v1 landmark album with 20 reviewed OpenStreetMap identities and anchors.
- Real-time enclosure medals using a retry-safe 650ms live evaluator and the normal gameplay loop rules: 80m minimum distance, one-cell seam tolerance, accepted finalized route geometry, strict interior anchors, and a 150,000m2 cap.
- Medal pins, a persistent city medal-progress card on the map, and a full-screen category-filtered collection with permanent Unlocked/Locked sections, Unicode-safe localized landmark copy, unclipped chips, richer earned descriptions, and landmark focus.
- Recoverable medal presentation with a metallic chime, haptic success cue, reduced-motion support, a 3D reveal, localized description, Continue-triggered flight into the Medal tab, and an acknowledged queue.
- Explicit opt-in scanning for qualifying historical walks; new albums never award silently.
- A streamlined navy/gold presentation system across map HUD, walk controls, full-screen menus, summaries, recovery, and diagnostics; duplicate layer shortcuts and default technical density are removed while advanced tools remain in Options or expandable details.
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
- Only high- and medium-confidence topology-validated street bridges contribute inferred explored cells. V3 accepts exact joins, ground-level geometric crossings, and grade-compatible endpoint seams up to 8m, persists per-bridge evidence/cell attribution, and leaves unmatched or unsafe gaps hidden with no straight-line fallback.
