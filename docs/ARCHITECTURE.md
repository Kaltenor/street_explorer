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

GPS paths are sampled along each segment. Cells touched by the path are marked explored. A cell is counted only once, even if visited multiple times.

This is a temporary approximation before true OpenStreetMap street completion.

## Street Completion Foundation

`src/services/streetCompletion.ts` exists as the boundary for future OSM logic.

The current implementation intentionally reports that street matching is not configured. Real street completion will require:

- loading OSM street segment geometry
- snapping GPS points to nearby street segments
- marking matched segments as explored
- calculating completion by city, district, and mode

