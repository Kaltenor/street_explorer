# Street Explorer

Street Explorer is an Expo React Native app focused on recording real-world exploration on foot.

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

Use the development build for real device testing, especially background location. Expo Go is only useful for quick foreground checks.

## Docs

- [Project Overview](docs/PROJECT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Testing](docs/TESTING.md)
- [Development Build](docs/DEVELOPMENT_BUILD.md)
- [Changelog](docs/CHANGELOG.md)

## Current Status

Current version: `v0.3.66`

The app supports self-healing foreground/background recording, accuracy-aware startup centering, a persistent accepted-route player marker, hole-free full-walk live rendering, bounded durable late-GPS recovery, walking-focused GPS filtering, full-screen Details/History/Completion views, explored cells, loop-fill analysis, safe backup/restore, device step counts, objective HUD progress, and hidden OpenStreetMap analysis for future street completion.
