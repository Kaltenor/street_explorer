# Roadmap

## Completed

- Expo React Native TypeScript app scaffold.
- Local SQLite persistence.
- Walk, Wheel, and Car modes.
- Foreground GPS recording.
- Saved paths and active paths on the map.
- Route history with details, rename, delete, and highlight.
- 10m x 10m deduplicated explored cells.
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
- Explored street overlay.
- Confirmed/inferred/rejected path segment boundary.
- Rejected GPS gaps skipped for map drawing and cell exploration.
- Layer controls.
- Street-completion V1.

## Next Priority

### 1. OpenStreetMap Street Completion V2

Improve the real game layer:

- match by route segment overlap, not only point proximity
- keep separate street completion by mode
- add city/district bounds and progress
- use a more reliable Overpass endpoint strategy

### 2. Path Inference V1

Use the new path inference boundary:

- snap suspicious gap endpoints to nearby OSM street segments
- route through the local OSM street graph
- reject inferred routes with impossible speed or excessive detour
- store/draw inferred paths with lower confidence than GPS paths

### 3. Recording Recovery V2

Add:

- recovery full-screen route preview
- recovered background status verification
- naming prompt before finishing a recovered recording

### 4. UI Polish V2

Add:

- mode-specific colors across panels and paths
- collapsible top panels for small screens
- stronger route detail layout
- clearer GPS status states

### 5. Data Tools V2

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
