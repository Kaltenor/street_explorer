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
- JSON backup and restore with authoritative active-session detection, consistent exclusion of invisible unfinished rows, a verified modern cache-file export, and stage-specific failure diagnostics.
- OpenStreetMap street segment fetching.
- Local OSM street cache.
- GPS-to-street proximity matching.
- Optional OSM debug street overlay.
- Confirmed/inferred/rejected path segment boundary.
- Rejected GPS gaps skipped for map drawing and cell exploration.
- Layer controls.
- Street-completion V1.
- Completion screen foundation.
- Conservative closed-loop fill V1.
- OSM boundary fetching and zone completion V1.
- Zone polish with exact/fallback labels and cached denominators.
- Recording quality summary after stopping a recording.
- Device step counting for walks.
- Full-screen Details, History, and Completion views.
- Updated 1320x2868 portrait `loading-screen2.png` shared by the native splash and in-app launch presentation, plus the transparent `title.png` map logo HUD.
- Frozen street-aware path inference with high/medium-confidence bridges contributing separately tracked inferred cells.
- Authoritative contour-to-completion synchronization and non-destructive exploration reprocessing.
- Phased reprocessing progress, timeout handling, and visible completion diagnostics.
- Consolidated historical street-corridor repair, per-recording graph reuse, atomic exploration replacement, and calculation recovery.
- Preloaded launch screen with an explicit, discreet ready-state entry control.
- Map-first cached exploration startup, accuracy-aware current-location centering, a persistent accepted-route player marker, self-healing foreground tracking, raw-observation-derived full-walk rendering, atomic durable background-batch publication with chunked backpressure and bounded late-event recovery, consistent backup snapshots, import admission fencing, and GPS-source-validated atomic derived-cache repair.
- Landmark medal collection V1 with a frozen 20-item Lyon album, Unicode-safe French landmark copy, permanent Unlocked/Locked category sections, a persistent city-progress HUD, real-time gameplay-aligned loop awards over previously mapped ground, Stop/recovery safety evaluation, one-time missed-award repair, 3D tab-flight presentation, explicit historical scan, Backup V4, and allowlisted OpenStreetMap review tooling.
- Responsive full-screen navigation with a memoized map subtree, lazy per-recording History details, cancellable Completion scans, and asynchronous Backup V4 sharing.
- App-wide streamlined navy/gold presentation with a smaller map header, pill navigation, one objective toggle, layer controls centralized in Options, compact idle recording controls, four-metric Completion, and collapsed technical diagnostics.
- CC0 four-direction animated pixel-art player marker with precomposed native annotation images, smooth coordinate interpolation, reliable last-position and last-rendered-sprite retention, accessible stale-GPS state, and continuous flicker-free Stop/Start recording visibility. Stop now releases the summary and next Start at the durable save boundary while repairable derived work continues asynchronously, and continuous routes bypass unnecessary street-corridor inference.

- Performance pass V1: immediate player/route lane, settled and memoized exploration surfaces, anchor-gated medal analysis, localized timers, lower-frequency tail polling, virtualized/unmounted menus, scoped route-history SQL, exploration/session indexes, corrected aggregate queries, concurrent startup drain, streamed backup serialization, direct Ionicons fonts, and focused diagnostics/regressions.
- Zone Boundary Completion V2: robust unordered/reversed multipolygon assembly, display-only invalid-boundary fallbacks, geometry-fingerprinted denominator caching, automatic 30-day refresh with persisted status, permanent zone achievements, district/city rollups, and Backup V4 preservation.
- Street-Aware Path Inference V3: bounded suspicious-gap topology refresh, metadata-safe crossings and sub-8m endpoint joins, immutable evidence-rich bridge snapshots, inferred-cell attribution, and concise History review.
- OpenStreetMap Street Completion V2: frozen-route proportional metre coverage, nearest direction-compatible matching, repeated-bin deduplication, 90% OSM-way completion records, V1 evidence migration, durable SQLite state, Completion metrics, and active-walk-safe asynchronous rebuilding.
- Saved-path focus polish: one-action Selected/layer activation and overlap-based Today visibility for midnight-crossing recordings.

## Next Priority

### 1. Recording Recovery V2

Add:

- recovery full-screen route preview
- recovered background status verification
- naming prompt before finishing a recovered recording

### 2. UI Polish V2

Add:

- coherent walking colors across panels and paths
- finish dark styling inside Details, History, and Completion content cards
- stronger route detail and recording report layout
- clearer GPS status states

### 3. Data Tools V2

Add:

- backup file version migration support
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
