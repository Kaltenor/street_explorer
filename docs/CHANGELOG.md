# Changelog

## v0.3.24

Changed:

- Completion dropdown now shows completion percentage for the selected area and each dropdown item.

## v0.3.23

Changed:

- Completion now auto-selects the cached zone containing the current GPS position when possible.
- Cached zones are sorted by current location, with containing zones first and nearest zones next.
- Completion area selection now uses a compact dropdown instead of showing all city or district buttons by default.

## v0.3.22

Added:

- Recording diagnostics screen and details panel with accepted GPS count, rejected GPS count, step count, GPS accuracy, GPS distance, and background status.
- Current objective card in Completion.
- Objective HUD details for explored and remaining cells.
- Clearer loop-fill explanation in history detail.

Changed:

- Saved path lines are hidden by default so explored area is the primary map layer.
- Active recording path still renders while recording.
- Explored-area fill and outline opacity adapt to map zoom to reduce low-zoom jaggedness.
- Stop-walk loop-fill alert now explains enclosed-area cells more clearly.

## v0.3.21

Added:

- Device pedometer support through Expo Sensors for Walk recordings.
- Saved step counts per recording, with today’s cumulative steps shown in the HUD.
- Persisted Completion objective so the selected goal is restored on next launch.

Changed:

- The main recording card now shows steps instead of GPS point count.
- Completion defaults to District scope and Walk mode.

## v0.3.20

Changed:

- Moved path, cell, and pin layer toggles into compact map-side icon buttons.
- Removed duplicate layer controls from the expanded details panel.
- Removed the visible OSM debug overlay control from the main UI; OSM data remains available as hidden analysis data.

## v0.3.19

Changed:

- Completed/explored area fill changed from green to a less-transparent red.

## v0.3.18

Fixed:

- Path display filtering no longer filters the explored-cell layer.
- Explored cells now always render from all saved walks in the current mode, while path lines can still be scoped to Today, 7 days, All, or Selected.

## v0.3.17

Changed:

- Explored-area outline now traces continuous contour paths.
- Outline corners are geometrically rounded with curve points instead of relying on line join styling.

## v0.3.16

Changed:

- Explored-area outline now uses rounded caps and joins for a softer edge.

## v0.3.15

Changed:

- Explored-area outside outline is now much darker and thicker.

## v0.3.14

Changed:

- Explored cells now render as green fill without internal borders.
- Added a thin dark outline only around the outside edge of the explored area.
- Adjacent explored cells should read more like one continuous explored shape.

## v0.3.13

Added:

- Path display scope control: Today, 7 days, All, and Selected.
- Completion objective selection from the Completion screen.
- Objective HUD on the map showing selected zone and completion percentage.

Notes:

- Raw recordings and GPS points are still preserved; path scope only changes what is drawn on the map.

## v0.3.12

Changed:

- Reprocess now analyzes the whole current mode's explored-cell map instead of each recording separately.
- Stop Walk also refreshes global loop fills for the current mode.
- Loop-fill cells can now come from boundaries created across multiple recordings.
- Global loop fills are stored separately from individual recording loop summaries.

## v0.3.11

Changed:

- Loop-fill detection now uses a one-cell expanded boundary to close tiny GPS/cell sampling gaps.
- Maximum loop-fill area is reduced to about 150,000m2.
- Valid enclosed areas should fill more reliably when they look closed on the map.

## v0.3.10

Changed:

- Auto-follow/auto-fit pauses when the user touches or pans the map during recording.
- The center-on-me button resumes auto-follow and is highlighted while auto-follow is active.
- Fit-all-paths now leaves auto-follow paused so the user can inspect the map.

## v0.3.9

Changed:

- Loop fill now uses enclosed explored cells instead of GPS point proximity loops.
- Straight walks should no longer generate many false loop detections.
- Multiple loop fills are now counted from connected enclosed cell groups.
- Visually closed cell boundaries can fill even when the raw GPS polygon is imperfect.

## v0.3.8

Changed:

- Loop detection can now find multiple loops inside one recording.
- Loop closing is more tolerant for real GPS traces.
- Self-intersection no longer rejects loop fill in V1.
- Loop fill thresholds are more gameplay-oriented: 80m minimum loop distance, 120m2 minimum area, no minimum duration.
- History now summarizes filled and rejected loop counts per recording.

## v0.3.7

Changed:

- Loop fill now prioritizes gameplay: valid GPS loops fill by default.
- OSM street analysis is kept as metadata and no longer blocks loop fills.
- Loop fill thresholds are more forgiving: 500m2 minimum area and 30s minimum elapsed time.

## v0.3.6

Added:

- Reprocess recordings action under Show details.
- Saved recordings can now rebuild explored cells and loop-fill results using the current rules.
- Reprocess summary reports filled loops, rejected loops, recordings without loops, and added loop cells.

## v0.3.5

Changed:

- Loop-filled cells now render exactly like directly walked explored cells.
- Explored cells are merged into larger rectangular polygons before rendering to reduce map load.
- Closed-loop detection is more tolerant for real GPS walks with a 35m close threshold.

Added:

- Stop-walk loop result alert showing filled, rejected, or not detected.
- History detail loop summary with loop-filled cell count and rejection reason.

## v0.3.4

Removed:

- Fog of War map layer, toggle, legend item, and rendering helpers.
- Fog documentation and manual test steps.

## v0.3.3

Changed:

- Fog of War now renders only the visible map viewport plus a small buffer.
- Added faded edge fog tiles for a softer visual boundary.
- Reduced fog render load to avoid map instability from large-radius fog.

## v0.3.2

Changed:

- Fog of War is darker so unrevealed map labels are obscured.
- Fog now covers a 10km radius around the current player location.
- Fog tiles are larger for performance over the wider radius.

## v0.3.1

Added:

- Fog of War map layer, enabled by default.
- Fog layer toggle and legend entry.

Notes:

- V1 uses larger 60m fog tiles around the active exploration area for map performance.
- Explored cells clear matching fog tiles, giving a first real exploration-game reveal effect.

## v0.3.0

Added:

- Zone Completion polish with exact polygon vs approximate bounds labels.
- Last fetched date on cached zones.
- Clear cached zones action.
- Cached zone cell totals for faster repeated Completion stats.
- Inner boundary holes are excluded when OSM relation geometry provides them.
- Street-aware path inference V1 using loaded OSM street segments.
- Inferred exploration cells are saved separately from direct GPS cells.

Notes:

- Street inference only runs when nearby OSM streets are loaded.
- Inferred paths are low confidence and still reject if no reliable street route is found.
- Approximate boundary zones still avoid misleading exact wording.

## v0.2.3

Fixed:

- Boundary refresh now keeps OSM relation bounds as a fallback when detailed relation geometry cannot be parsed.
- Boundary relations without a name no longer get discarded.

## v0.2.2

Added:

- Boundary refresh diagnostics showing raw OSM element count, relation count, and usable zone count when no zones are cached.

## v0.2.1

Fixed:

- Improved OSM boundary refresh so containing administrative areas are queried through a cleaner area pivot.
- Added a fallback polygon for fragmented OSM boundary geometry so usable zones are not discarded.

## v0.2.0

Added:

- OSM boundary fetching for nearby country, city, and district administrative zones.
- Local SQLite cache for zone polygons.
- Zone-specific completion stats in the Completion screen.
- Refresh boundaries action in Completion.
- Focus on map action for cached zones.
- Light optional zone outline on the map when focused.

Notes:

- Zone completion is cell-based and local-only.
- Very large zones can show a pending denominator to avoid expensive country-scale scans.
- District availability depends on local OSM boundary data.

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
