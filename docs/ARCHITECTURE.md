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

The current exploration layer uses 10m x 10m grid cells.

GPS paths are first classified into path segments:

- confirmed GPS segments
- inferred street-path segments
- rejected gaps

Only confirmed and inferred path geometry can mark cells. Rejected gaps are not sampled, so a missing GPS interval does not create fake diagonal exploration through buildings.

Inferred path routing is intentionally not implemented yet. `src/services/pathInference.ts` contains the boundary for future OSM street-graph routing and currently returns `not_configured` instead of falling back to straight lines.

The 10m x 10m grid is still a temporary approximation before true OpenStreetMap street completion.

## Street Completion

Street completion V1 uses OpenStreetMap as a data layer while keeping Apple MapKit as the visual map background.

Flow:

- Fetch nearby OSM `highway` ways through Overpass.
- Split long OSM ways into short local segments.
- Cache segment geometries in SQLite.
- Match recorded GPS points to nearby segment polylines using a distance threshold.
- Draw unloaded/unexplored streets as gray overlays.
- Draw matched streets as green overlays.
- Report loaded segments, matched segments, and matched street-segment distance.

Limitations:

- Matching is proximity-based and can be wrong near parallel roads.
- Completion is based on loaded nearby streets, not full city boundaries yet.
- Completion is not separated by activity mode yet.
