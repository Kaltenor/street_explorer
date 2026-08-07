# Roadmap

## Completed

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
- Backup V5 with authoritative active-session detection, lossless logical sessions, bounded compressed archive blocks, checksum/footer integrity, required verification of the externally saved Files copy, V5-only restore, and temporary complete-V4 conversion.
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
- Updated 1320x2868 portrait `loading-screen2.png` shared by the native splash and in-app launch presentation, plus the transparent `title.png` map logo HUD.
- Frozen street-aware path inference with high/medium-confidence bridges contributing separately tracked inferred cells.
- Authoritative contour-to-completion synchronization and non-destructive exploration reprocessing.
- Phased reprocessing progress, timeout handling, and visible completion diagnostics.
- Consolidated full-history and selected-recording street-corridor repair, per-recording graph reuse, atomic exploration replacement, frozen-route aggregate reconciliation, full-history calculation isolation, and explicit selected-walk failure reporting.
- Preloaded launch screen with an explicit, discreet ready-state entry control.
- Map-first cached exploration startup, accuracy-aware current-location centering, a persistent accepted-route player annotation with native MapKit anchoring and game-owned location presentation, self-healing foreground tracking, raw-observation-derived full-walk rendering, atomic durable background-batch publication with chunked backpressure and bounded late-event recovery, consistent backup snapshots, import admission fencing, and GPS-source-validated atomic derived-cache repair.
- Landmark medal collection V1 with a frozen 20-item Lyon album, Unicode-safe French landmark copy, permanent Unlocked/Locked category sections, a persistent city-progress HUD, real-time gameplay-aligned loop awards over previously mapped ground, Stop/recovery safety evaluation, one-time missed-award repair, 3D tab-flight presentation, explicit historical scan, Backup V5 preservation, and allowlisted OpenStreetMap review tooling.
- Responsive full-screen navigation with a memoized map subtree, lazy per-recording History details, cancellable Completion scans, and bounded asynchronous Backup V5 sharing.
- App-wide streamlined navy/gold presentation with a roughly 20%-enlarged first-launch wordmark that collapses after the first interaction, four separate lightly inset Atlas map stripes with consistent subtle corners, textured navigation whose engraved selected destination expands to a localized Cinzel label, an objective toggle integrated into the medal stripe, layer controls centralized in Options, a compact field-ledger recording stripe with neutral GPS inset, four-metric Completion, and collapsed technical diagnostics.
- Persistent appearance modes with Explorator as the existing dark atlas, an app-wide daylight-optimized high-contrast palette and light native map, plus a selectable Custom placeholder reserved for later palette definition.
- iOS-first Midnight Cartographer playfield with dark muted MapKit, hidden native POIs/cursor, burnt-orange explored territory, gold current activity, muted copper district boundaries, restrained wine city boundaries, selected-objective stroke hierarchy, restrained route colors, and hand-inked atlas markers.
- Atlas identity pass: original hand-inked cartographer player, bundled Cinzel display typography, neutral-edged cartographic shells for Details/History/Completion/Medals/Options, gold active and reward emphasis, textured navy paper including Stop and recording-summary dialogs, matching textured main-map ledgers and navigation dock with engraved selections and neutral GPS framing, quiet UI sounds, Reduce Motion-aware transitions, a reusable generated gold/navy/burnt-orange cartographer seal with fitted outlined wording and a load-gated synchronized artwork/text strike, explored-area ink reveal, saved-route draw-on focus, and a folded-map objective HUD.
- Original hand-inked four-direction cartographer animation inside one explicitly sized MapKit annotation, with all idle, walk, and stale-GPS frames pre-mounted and opacity-selected at a 170ms cadence. One-time Start/Resume recentering, camera-independent panning, durable trustworthy-position restore, accessible stale-GPS state, and Stop/Start/recovery visibility remain intact. Screen-space projection, coordinate animation, marker-image replacement, and parallel annotations remain disabled for device-stable rendering.

- Performance pass V1: immediate player/route lane, non-starving coalesced and geometry-keyed exploration surfaces, anchor-gated medal analysis, localized timers, lower-frequency tail polling, virtualized/unmounted menus, scoped route-history SQL, exploration/session indexes, corrected aggregate queries, concurrent startup drain, bounded backup serialization, direct Ionicons fonts, and focused diagnostics/regressions.
- Zone Boundary Completion V2: full local and containing-city district retrieval, robust unordered/reversed multipolygon assembly, strict all-component interior parent validation that ignores stale cached associations, persistent city-wide district outlines, haptic long-press selection with direct same-city district switching and cross-city scope controls, objective-preserving panning, race-safe boundary and percentage scans, display-only invalid-boundary fallbacks, exact-cache downgrade protection, saved-objective recovery, geometry-fingerprinted denominator caching, automatic 30-day refresh with persisted status, permanent zone achievements, district/city rollups, and Backup V5 preservation.
- Administrative hierarchy preservation: retain source OSM levels, use level 9 for current District gameplay, keep level 10 internal for a future Neighborhood tier, automatically reclassify legacy caches, and clear invalid old neighborhood objectives without deleting historical rows.
- Objective completion snapshot cache: immediate memory/SQLite scope restoration, boundary-and-exploration validity keys, cached-value Updating feedback, and paired city/district background precomputation.
- Street-Aware Path Inference V3: encoded identifiable topology refresh, metadata-safe crossings and sub-8m endpoint joins, bounded ambiguous-snap routing that excludes `foot=use_sidepath`, immutable evidence-rich bridge snapshots, inferred-cell attribution, concise History review, and selected-walk reprocessing.
- OpenStreetMap Street Completion V2: frozen-route proportional metre coverage, nearest direction-compatible matching, repeated-bin deduplication, 90% OSM-way completion records, V1 evidence migration, durable SQLite state, Completion metrics, and active-walk-safe asynchronous rebuilding.
- Saved-path focus polish: one-action Selected/layer activation and overlap-based Today visibility for midnight-crossing recordings.
- Recording Recovery V2: full-screen persisted-route preview, verified Active/Interrupted/Uncertain background status, safe recommended actions, bounded long-route rendering, and atomic date/time-based naming during recovered finalization.
- UI Polish V2: semantic walking/path colors, consistent dark cards across Details/History/Completion, summary-first route details and post-walk reports, and five explicit GPS presentation states with age/accuracy thresholds.

## Next Priority

### 1. Data Tools V2

Add:

- remove the temporary V4 converter after the V5 transition window
- import preview before replacing local data
- GPX import
- bulk export for walks

## Not Planned Yet

- backend
- accounts
- cloud sync
- achievements
- social features
- route recommendations
