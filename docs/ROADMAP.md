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
- Layer controls.
- Street-completion service boundary.

## Next Priority

### 1. OpenStreetMap Street Completion V1

Build the real game layer:

- fetch or import OSM street segments
- cache city street geometry locally
- match GPS points to nearby street segments
- mark street segments as explored
- show street completion percentage

### 2. Recording Recovery V2

Add:

- recovery full-screen route preview
- recovered background status verification
- naming prompt before finishing a recovered recording

### 3. UI Polish V2

Add:

- mode-specific colors across panels and paths
- collapsible top panels for small screens
- stronger route detail layout
- clearer GPS status states

## Not Planned Yet

- backend
- accounts
- cloud sync
- achievements
- social features
- route recommendations
