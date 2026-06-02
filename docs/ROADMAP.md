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
- Recording recovery.
- Layer controls.
- Street-completion service boundary.

## Next Priority

### 1. Recording Recovery Polish

Current recovery works, but can be improved:

- show a custom recovery screen instead of an alert
- show recovered distance, duration, and point count
- allow delete/recover/finish

### 2. Better Exploration Stats

Add:

- current recording new cells
- total cells by mode
- latest recording summary
- longest recording summary
- explored area by mode

### 3. OpenStreetMap Street Completion V1

Build the real game layer:

- fetch or import OSM street segments
- cache city street geometry locally
- match GPS points to nearby street segments
- mark street segments as explored
- show street completion percentage

### 4. UI Polish

Add:

- map legend
- layer panel layout improvements
- route detail screen
- mode-specific colors
- clearer GPS status states

## Not Planned Yet

- backend
- accounts
- cloud sync
- achievements
- social features
- route recommendations
