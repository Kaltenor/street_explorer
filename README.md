# Street Explorer

Street Explorer is an Expo React Native app for recording real-world exploration across Walk, Wheel, and Car modes.

The app records GPS paths locally, stores them in SQLite, and displays explored areas as deduplicated 15m x 15m cells on a map.

## Run

```bash
npm install
npx expo start
```

Current local project path:

```text
W:\street_explorer
```

Use Expo Go for normal foreground testing. Use a development build later for reliable iOS background tracking.

## Docs

- [Project Overview](docs/PROJECT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Testing](docs/TESTING.md)
- [Development Build](docs/DEVELOPMENT_BUILD.md)
- [Changelog](docs/CHANGELOG.md)

## Current Status

Current version: `v0.3.0`

The app supports local recording, mode-specific GPS filtering, history, explored cells, loop-fill analysis, recovery for unfinished recordings, and hidden OpenStreetMap analysis for future street completion.
