# Architecture

## Tech Stack

- Expo SDK 54
- React Native
- TypeScript
- SQLite via `expo-sqlite`
- Location via `expo-location`
- Background task foundation via `expo-task-manager`
- Map display via `react-native-maps`

On iOS, `react-native-maps` uses Apple MapKit by default.

## Folder Structure

- `src/screens`: top-level app screens.
- `src/components`: reusable UI and map components.
- `src/services`: app logic such as recording, distance, cells, and background tasks.
- `src/database`: SQLite initialization and repositories.
- `src/types`: shared TypeScript types.
- `src/constants`: config and mode labels.

## Database

Tables:

- `schema_migrations`
- `walk_sessions`
- `gps_points`
- `app_settings`
- `osm_street_segments`
- `zones`
- `explored_cells`
- `loop_fills`

`walk_sessions` stores one recording:

- `id`
- `activity_mode`
- `display_name`
- `started_at`
- `ended_at`
- `distance_meters`
- `duration_seconds`

`gps_points` stores the raw recorded points:

- `id`
- `session_id`
- `latitude`
- `longitude`
- `timestamp`
- `accuracy`
- `point_index`

`app_settings` stores lightweight local settings:

- last selected mode
- active recording session id
- active recording mode

`osm_street_segments` caches short OpenStreetMap-derived street segment geometry:

- OSM way-part id
- name
- highway type
- coordinate geometry
- bounding box
- fetched timestamp

`explored_cells` stores persisted exploration cells by mode, cell size, source, and session:

- mode
- cell size in meters
- cell x/y
- source: `gps`, `inferred`, or `loop_fill`
- nullable session id
- created timestamp

`loop_fills` stores closed-loop analysis results:

- session id and mode
- loop polygon
- area
- total and unwalked walkable OSM street length inside the polygon
- accepted/rejected state and rejection reason

`zones` caches country, city, and district boundary polygons fetched from OSM administrative relations.

`zone_cell_totals` caches calculated zone denominators:

- zone id
- cell size
- total cells
- calculated timestamp

## Recording Flow

1. User taps Start.
2. A `walk_sessions` row is created immediately.
3. Active recording settings are saved.
4. Foreground GPS watch starts.
5. Background tracking is attempted.
6. Valid GPS points are saved progressively.
7. User taps Stop.
8. Session distance and duration are finalized.
9. Active recording settings are cleared.

## GPS Filtering

Filtering is mode-specific:

- Walk: stricter accuracy and lower max speed.
- Wheel: medium accuracy and higher max speed.
- Car: wider tolerance and high max speed.

The recorder rejects:

- points with poor accuracy
- points below the minimum movement threshold
- impossible jumps above the mode speed cap

## Exploration Cells

The current exploration layer uses configurable 15m x 15m grid cells.

GPS paths are first classified into path segments:

- confirmed GPS segments
- rejected gaps

Only confirmed GPS geometry currently marks cells. Rejected gaps are not sampled, so a missing GPS interval does not create fake diagonal exploration through buildings.

The schema still supports `inferred` cells for future use, but normal gameplay does not currently save or render inferred cells. Street-aware inference exists as a prototype boundary in `src/services/pathInference.ts`, but it is paused for map rendering and cell generation until it can be inspected and trusted.

The 15m x 15m grid is still a temporary approximation before true OpenStreetMap street completion.

## Loop Fill

Closed-loop fill is a gameplay-first V1 mechanic based on global explored cell enclosure per mode.

The app first samples trusted GPS path geometry into explored cells. Rejected GPS gaps never mark cells, so they cannot become part of a loop boundary.

All directly explored cells for the current mode are treated as the boundary, even when they came from different recordings. For V1, the boundary is expanded by one cell during detection so tiny GPS/cell sampling gaps do not prevent obvious block loops from filling. The app flood-fills from outside the mode's explored-cell bounds; any unvisited cells that cannot be reached are considered enclosed loop-fill cells.

Current thresholds are:

- minimum recording distance before loop analysis: 80m
- minimum enclosed cells: 1
- detection boundary expansion: 1 cell
- maximum enclosed area: 150,000m2

OSM is used as hidden analysis data inside the polygon. The app still measures walkable street length for future debugging and tuning, but OSM street density no longer blocks a valid loop from filling.

One mode can contain multiple loop fills. Accepted loop-fill cells are stored separately from directly walked GPS cells.

## Street Completion

Street completion V1 uses OpenStreetMap as a hidden analysis and debug data layer while keeping Apple MapKit as the visual map background.

Flow:

- Fetch nearby OSM `highway` ways through Overpass.
- Split long OSM ways into short local segments.
- Cache segment geometries in SQLite.
- Match recorded GPS points to nearby segment polylines using a distance threshold.
- Keep unmatched OSM streets hidden from the main map by default.
- Keep matched/unmatched OSM street data hidden from the main gameplay map by default.
- Report loaded segments, matched segments, and matched street-segment distance.

Limitations:

- Matching is proximity-based and can be wrong near parallel roads.
- Street matching is based on loaded nearby streets, not full city-scale street coverage yet.
- Completion is not separated by activity mode yet.

## Zone Completion

The Completion screen can fetch nearby OSM administrative boundaries using the current GPS location.

Flow:

- fetch OSM administrative relations for country, city, and district scopes
- cache zone polygons in `zones`
- select a scope and zone in Completion
- count explored 15m cells whose centers fall inside the selected polygon
- count total 15m cells inside city/district-sized polygons
- show completion percentage when the zone denominator can be scanned locally

Large zones can intentionally show a pending denominator. This avoids expensive country-scale scans on the phone.

District data depends on local OSM coverage. If no district relation exists near the user, Completion degrades to country/city zones.

Zones are labeled as exact OSM polygons or approximate OSM bounds. Approximate bounds are used only when relation geometry cannot be assembled yet.

## Street-Aware Inference

Street-aware path inference is currently paused for normal gameplay.

The prototype service can snap suspicious GPS gaps to cached OSM street graph nodes and search for a plausible route, but inferred routes do not currently:

- render on the main map
- create explored cells
- affect zone completion
- affect loop-fill boundaries

This prevents OSM routing mistakes from changing the player map.

Future intended flow:

- snap gap endpoints to nearest valid OSM graph nodes
- run shortest path through connected local street-segment endpoints
- reject routes with excessive detour or impossible speed
- show accepted inferred paths in a debug/off-by-default layer first
- eventually store inferred geometry separately from direct GPS
- only count inferred cells after confidence and review tooling are good enough

There is still no straight-line fallback for inferred exploration.
