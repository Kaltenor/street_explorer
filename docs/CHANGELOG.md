# Changelog

## v0.1.4

Fixed:

- Made saved-path gap rejection much more conservative so real walked sections with sparse GPS points render normally and create cells.
- Kept dashed GPS gaps for only extreme outages or impossible movement.

## v0.1.3

Fixed:

- Saved path rendering now uses more tolerant display-only speed thresholds.
- Live GPS filtering remains strict, but real saved walks are less likely to show false GPS gaps.

## v0.1.2

Fixed:

- Rejected GPS gaps now render as thin dashed amber connectors so old recordings do not look broken.
- GPS gap connectors remain visually distinct from confirmed paths and do not mark explored cells.

## v0.1.1

Fixed:

- Relaxed path gap rejection so older sparse-but-plausible GPS recordings do not show large missing sections.
- Kept rejection for impossible speeds and large time-plus-distance GPS gaps.

## v0.1.0

Initial MVP and exploration prototype.

Added:

- Expo React Native TypeScript app.
- SQLite persistence.
- Walk, Wheel, and Car modes.
- Foreground GPS recording.
- Best-effort background tracking setup.
- Apple MapKit-based map through `react-native-maps`.
- Saved and active path rendering.
- 15m x 15m deduplicated explored cells.
- Mode-specific GPS filtering.
- GPS status and current speed.
- History with details, rename, delete, and route highlight.
- Last selected mode persistence.
- Recording recovery.
- Layer controls.
- Street completion service foundation.
- Development-build background recording support.
- Active recording health panel.
- Foreground re-sync of background-saved GPS points.
- Recovery modal with resume, finish/save, and discard actions.
- Expanded exploration stats with today, latest, longest, cells, and total duration.
- Map legend and clearer mode switch control.
- Expanded route details in history.
- Compact live recording controls with expandable details.
- Recording detail view from History.
- GPX export for individual recordings.
- Full JSON backup and restore.
- OpenStreetMap street segment fetching through Overpass.
- Local SQLite cache for OSM street segments.
- GPS-to-street proximity matching.
- Optional OSM debug street overlay on the map.
- Short local OSM segment splitting to avoid whole long streets turning green.
- Clearer street completion labels and lighter map overlays.
- Path processing boundary for confirmed, inferred, and rejected segments.
- Rejected GPS gaps no longer draw straight lines or mark exploration cells.
- Completion screen foundation with scope and mode selectors.
- SQLite completion tables for zones, explored cells, and loop fills.
- Conservative closed-loop fill analysis using hidden OSM street-length checks.
- OSM overlays hidden by default so the main map stays readable.
