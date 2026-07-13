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

Confirmed GPS geometry marks direct cells. A suspicious gap marks cells only when the frozen snapshot contains a validated street-graph bridge; rejected gaps are not sampled, so a missing GPS interval cannot create fake diagonal exploration through buildings.

Validated high- and medium-confidence street-matched bridge sections are stored as `inferred` cells. They contribute to the explored map, zone completion, and loop boundaries. Unmatched or low-confidence gaps remain rejected and never receive a straight-line fallback.

The 15m x 15m grid is still a temporary approximation before true OpenStreetMap street completion.
For rendering, adjacent explored cells are unioned into contour polygons instead of being emitted as overlapping rectangles. Each connected explored island becomes one native map polygon. Enclosed contours at or below the active mode's existing fill-area cap are rendered solid, which guarantees that small missing-cell channels cannot show through a qualifying discovered frontier. When a hole is filled, nested island contours inside it are discarded because the parent surface already covers them. Oversized enclosed contours remain explicit holes and receive their own black frontier, while filled holes leave no internal outline. Live recording cells use a separate small contour layer so each GPS update does not rebuild the full saved history.

## Loop Fill

Closed-loop fill is a gameplay-first V1 mechanic based on global explored cell enclosure per mode.

The app first samples trusted GPS path geometry into explored cells. Rejected GPS gaps never mark cells, so they cannot become part of a loop boundary.

All directly explored cells for the current mode are treated as the boundary, even when they came from different recordings. The renderer and persistence layer share one authoritative grid-contour extraction: each qualifying enclosed contour produces the exact same cell set for the solid red surface, loop-fill storage, and completion. Nested contour cells are claimed once. The one-cell flood tolerance supplements only contours that are not already represented by the authoritative extraction.

Current thresholds are:

- minimum recording distance before loop analysis: 80m
- minimum enclosed cells: 1
- detection boundary expansion: 1 cell
- maximum enclosed area: 150,000m2 for walk, 400,000m2 for wheel, 5km2 for car

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

Large zones can intentionally show a pending denominator. This avoids expensive country-scale scans on the phone. Completion augments persisted cells with the same per-mode, area-capped enclosed contour cells used by the solid red renderer, so a qualifying visible surface and its percentage always use the same numerator.

District data depends on local OSM coverage. If no district relation exists near the user, Completion degrades to country/city zones.

Zones are labeled as exact OSM polygons or approximate OSM bounds. Approximate bounds are used only when relation geometry cannot be assembled yet.

## Street-Aware Inference

Street-aware path inference is persisted in an immutable route snapshot and is shared by route rendering, explored-cell generation, completion, and loop analysis.

The service projects suspicious GPS-gap endpoints onto the nearest point of cached OSM street segments, attaches those projected points to the graph, and searches for a plausible street route. This avoids treating a player beside the middle of a 35m fragment as if they were at one of its endpoints. Only high- or medium-confidence routes are frozen and counted. A high-confidence snap may close its endpoint seam only when it is within 12m; longer, unmatched, or low-confidence gaps never receive a straight connector. Once stored, a snapshot is never changed by map movement, cache refresh, normal saves, or loop recalculation.

The explicit **Reprocess recordings** action is the only workflow allowed to replace existing historical snapshots. It is deliberately cache-only: nearby OSM data is refreshed by the normal map workflow, while historical reprocessing combines the stable cached corridor with the currently loaded graph and performs no per-recording network request. One graph is built per recording and reused for every suspicious GPS interval. Individual recording failures retain their previous frozen route while the remaining recordings continue. The complete candidate includes confirmed cells, validated inferred cells, and authoritative contour fills. If its unique-cell total is lower than existing progress, both snapshots and the explored ledger remain untouched and the result reports a safety stop. Otherwise all explored cells and loop metadata are replaced in one atomic transaction. The phased progress modal is displayed over the map after full-screen panels close, and any uncaught failure produces a visible error.

Legacy confirmed-only snapshots remain unchanged until the user explicitly reprocesses them. Backup V2 includes route snapshots, so exported and restored routes keep the same frozen geometry.

There is still no straight-line fallback for inferred exploration. Low-confidence, implausible, or unmatched gaps remain hidden and contribute no explored cells.
