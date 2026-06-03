# Roadmap

## Completed

- Expo React Native TypeScript app scaffold.
- Local SQLite persistence.
- Walk, Wheel, and Car modes.
- Foreground GPS recording.
- Saved paths and active paths on the map.
- Route history with details, rename, delete, and highlight.
- 15m x 15m deduplicated explored cells.
- Mode-specific GPS filtering.
- Basic background tracking setup.
- Development build background recording verified on iPhone.
- Active recording re-sync after returning from background.
- Recording health panel.
- Recovery modal with resume, finish/save, and discard.
- Better exploration stats.
- Map legend.
- Clearer mode switch control.
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
- Street-aware path inference V1.

## Next Priority

### 1. Zone Boundary Completion V2

Improve the real game layer:

- improve relation polygon assembly for complex multipolygons
- add completed district/city rollups
- cache calculated zone denominators
- add boundary refresh status and last-fetched date

### 2. Street-Aware Path Inference V2

Improve inferred routes:

- use full OSM street topology instead of local loaded segments only
- connect intersections more robustly when OSM ways do not share exact nodes
- add confidence scoring in history/detail screens
- persist inferred path geometry, not only inferred cells

### 3. OpenStreetMap Street Completion V2

Improve street intelligence:

- match by route segment overlap, not only point proximity
- keep separate street completion by mode
- use street length instead of local segment counts
- use a more reliable Overpass endpoint strategy

### 4. Recording Recovery V2

Add:

- recovery full-screen route preview
- recovered background status verification
- naming prompt before finishing a recovered recording

### 5. UI Polish V2

Add:

- mode-specific colors across panels and paths
- collapsible top panels for small screens
- stronger route detail layout
- clearer GPS status states

### 6. Data Tools V2

Add:

- backup file version migration support
- import preview before replacing local data
- GPX import
- bulk export per mode

## Not Planned Yet

- backend
- accounts
- cloud sync
- achievements
- social features
- route recommendations
