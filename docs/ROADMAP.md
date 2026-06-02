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
- Recording recovery.
- Layer controls.
- Street-completion service boundary.

## Next Priority

### 1. Development Build For Background Tracking

Expo Go is not enough for reliable iOS locked-screen tracking. The next step is to create and test a development build.

Goals:

- verify locked-screen recording
- verify background permission prompts
- verify iOS background location indicator
- verify foreground service behavior on Android

Status:

- EAS build profiles are configured in `eas.json`.
- `expo-dev-client` is installed.
- iOS and Android application identifiers are configured.
- A physical iPhone build still requires an Expo account and Apple Developer Program access.

### 2. Recording Recovery Polish

Current recovery works, but can be improved:

- show a custom recovery screen instead of an alert
- show recovered distance, duration, and point count
- allow delete/recover/finish

### 3. Better Exploration Stats

Add:

- current recording new cells
- total cells by mode
- latest recording summary
- longest recording summary
- explored area by mode

### 4. OpenStreetMap Street Completion V1

Build the real game layer:

- fetch or import OSM street segments
- cache city street geometry locally
- match GPS points to nearby street segments
- mark street segments as explored
- show street completion percentage

### 5. UI Polish

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
