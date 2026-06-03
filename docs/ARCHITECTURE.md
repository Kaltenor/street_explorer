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
- inferred street-path segments
- rejected gaps

Only confirmed and inferred path geometry can mark cells. Rejected gaps are not sampled, so a missing GPS interval does not create fake diagonal exploration through buildings.

Inferred path routing is intentionally not implemented yet. `src/services/pathInference.ts` contains the boundary for future OSM street-graph routing and currently returns `not_configured` instead of falling back to straight lines.

The 15m x 15m grid is still a temporary approximation before true OpenStreetMap street completion.

## Loop Fill

Closed-loop fill is a conservative V1 game mechanic.

When a valid GPS path comes back near an earlier point in the same recording, the app can build a polygon from that trusted subpath. Rejected GPS gaps never form loops.

The loop is rejected if it is too short, too small, too large, or self-intersecting. Current thresholds are:

- close distance: 25m
- minimum loop distance: 150m
- minimum elapsed time: 60s
- minimum polygon area: 2,000m2
- maximum polygon area: 1,000,000m2

OSM is used as hidden analysis data inside the polygon. The app measures walkable street length inside the loop and accepts the fill only when unwalked walkable street length is low:

- unwalked walkable street length <= 50m, or
- unwalked walkable street ratio <= 10%

Accepted loop-fill cells are stored separately from directly walked GPS cells.

## Street Completion

Street completion V1 uses OpenStreetMap as a hidden analysis and debug data layer while keeping Apple MapKit as the visual map background.

Flow:

- Fetch nearby OSM `highway` ways through Overpass.
- Split long OSM ways into short local segments.
- Cache segment geometries in SQLite.
- Match recorded GPS points to nearby segment polylines using a distance threshold.
- Keep unmatched OSM streets hidden from the main map by default.
- Draw matched streets only when the OSM debug layer is enabled.
- Report loaded segments, matched segments, and matched street-segment distance.

Limitations:

- Matching is proximity-based and can be wrong near parallel roads.
- Completion is based on loaded nearby streets, not full city boundaries yet.
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
