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
- JSON backup and restore.
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
- Landmark medal collection V1 with a frozen 20-item Lyon album, Unicode-safe French landmark copy, permanent Unlocked/Locked category sections, a persistent city-progress HUD, real-time gameplay-aligned loop awards over previously mapped ground, Stop/recovery safety evaluation, one-time missed-award repair, 3D tab-flight presentation, explicit historical scan, Backup V3, and allowlisted OpenStreetMap review tooling.
- Responsive full-screen navigation with a memoized map subtree, lazy per-recording History details, cancellable Completion scans, and asynchronous Backup V3 sharing.
- App-wide streamlined navy/gold presentation with a smaller map header, pill navigation, one objective toggle, layer controls centralized in Options, compact idle recording controls, four-metric Completion, and collapsed technical diagnostics.
- CC0 four-direction animated pixel-art player marker with precomposed native annotation images, smooth coordinate interpolation, reliable last-position and last-rendered-sprite retention, accessible stale-GPS state, and continuous flicker-free Stop/Start recording visibility. Stop now releases the summary and next Start at the durable save boundary while repairable derived work continues asynchronously, and continuous routes bypass unnecessary street-corridor inference.

## Next Priority

### 1. Zone Boundary Completion V2

Improve the real game layer:

- improve relation polygon assembly for complex multipolygons
- add completed district/city rollups
- cache calculated zone denominators
- add boundary refresh status and last-fetched date

### 2. Street-Aware Path Inference V3

Improve the now-persisted and scored inferred routes:

- use full OSM street topology instead of local loaded segments only
- connect intersections more robustly when OSM ways do not share exact nodes
- add per-bridge review and confidence details in history
- show how many completion cells came from each frozen bridge
- keep explicit reprocessing as the only way to replace historical snapshots

### 3. OpenStreetMap Street Completion V2

Improve street intelligence:

- match by route segment overlap, not only point proximity
- improve walking street-completion accuracy
- use street length instead of local segment counts
- use a more reliable Overpass endpoint strategy

### 4. Recording Recovery V2

Add:

- recovery full-screen route preview
- recovered background status verification
- naming prompt before finishing a recovered recording

### 5. UI Polish V2

Add:

- coherent walking colors across panels and paths
- finish dark styling inside Details, History, and Completion content cards
- stronger route detail and recording report layout
- clearer GPS status states

### 6. Data Tools V2

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
