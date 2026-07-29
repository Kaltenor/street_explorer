# Project Overview

Street Explorer is a mobile exploration app built with Expo, React Native, TypeScript, and local SQLite storage.

The app records real-world movement and turns it into an exploration map. The goal is not to be a sport tracker. The goal is to feel like a real-life exploration game where streets and areas become visible as they are explored.

## Current Activity

Street Explorer is dedicated to on-foot exploration. Recordings, paths, statistics, history, completion, and GPS quality rules all use the walking profile. Existing data from older activity profiles is preserved and consolidated into walking history during database migration.

## Current Features

- Foreground GPS recording with automatic watcher recovery.
- Permission-aware background tracking with serialized ownership, atomically published delivered batches, nullable headless owner recovery through a unique timestamp match, bounded unmatched retention, and chunked backlog backpressure.
- Local SQLite persistence.
- Saved paths displayed on the map.
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
- Confirmed Stop teardown drains entered handlers and the durable background outbox before single-recording finalization. The summary, History row, stats, live cells, and Start control return at that durable boundary; route inference, exact steps, medal/objective checks, and full refresh then reconcile asynchronously through the pending repair outbox; continuous routes without suspicious gaps skip street-corridor graph inference. Underfilled recordings retain a hidden five-minute recovery tombstone, and late finalized merges trigger an immediate safe map refresh. Backup export rejects active recording data, omits hidden recovery tombstones, writes compact JSON asynchronously, and reads one transaction; import closes both journal and in-memory GPS admission before replacing data.
- Walking-focused GPS quality filters.
- Route history with rename, delete, and highlight.
- Recording recovery for unfinished active sessions.
- Device step counts for walking recordings.
- Icon layer controls for paths, cells, and markers.
- Full-screen Details, History, and Completion views with responsive map back navigation, lazy per-recording History details, and cancellable chunked Completion scans.
- Completion screen with scope and zone selectors.
- OSM boundary loading and cached Country / City / District completion zones.
- Zone-specific completion stats and map focus.
- A compact objective HUD with selected zone, completion percentage, remaining cells, and today's added cells, toggled by one map-side flag without clearing the saved objective.
- Updated 1320x2868 portrait `loading-screen2.png` shared by the native splash and in-app launch presentation, plus the transparent `title.png` map logo overlay.
- Frozen Lyon v1 landmark album with 20 reviewed OpenStreetMap identities and anchors.
- Real-time enclosure medals using the normal gameplay loop rules: 80m minimum distance, one-cell seam tolerance, accepted finalized route geometry, strict interior anchors, and a 150,000m2 cap.
- Medal pins, a persistent city medal-progress card on the map, and a full-screen category-filtered collection with permanent Unlocked/Locked sections, Unicode-safe localized landmark copy, unclipped chips, richer earned descriptions, and landmark focus.
- Recoverable medal presentation with a metallic chime, haptic success cue, reduced-motion support, a 3D reveal, localized description, Continue-triggered flight into the Medal tab, and an acknowledged queue.
- Explicit opt-in scanning for qualifying historical walks; new albums never award silently.
- A streamlined navy/gold presentation system across map HUD, walk controls, full-screen menus, summaries, recovery, and diagnostics; duplicate layer shortcuts and default technical density are removed while advanced tools remain in Options or expandable details.
- Backup V3 preserves frozen route snapshots, medal evidence, collection state, presentation state, and historical-scan state.

## Current Limitations

- Background tracking is configured but may not fully work in Expo Go on iOS. A development build is likely required for real locked-screen recording.
- Explored cells are grid-based, not exact street geometry.
- OSM is no longer a primary visible gameplay overlay by default.
- District boundaries depend on what exists in OSM near the current location.
- Very large zone denominators may be skipped to keep the app responsive.
- There is no backend, account, cloud sync, social feature, or route suggestion system.
- OpenStreetMap data can be loaded nearby, but it is mainly used as hidden analysis data.
- Only high- and medium-confidence segment-projected street bridges contribute inferred explored cells; unmatched or unsafe endpoint gaps remain hidden and uncounted, with no unvalidated straight-line fallback.
