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
- [Medal System Design and Implementation Notes](docs/MEDAL_SYSTEM_IMPLEMENTATION_PLAN.md)

## Current Status

Current version: `v0.4.4`

The app supports self-healing foreground/background recording, accuracy-aware startup centering, a persistent accepted-route player marker, hole-free full-walk live rendering, bounded durable late-GPS recovery, walking-focused GPS filtering, full-screen Details/History/Completion/Medals views, explored cells, loop-fill analysis, landmark medal collection, safe backup/restore, device step counts, objective HUD progress, and hidden OpenStreetMap analysis for future street completion.

Lyon album v1 contains 20 reviewed landmark medals. A medal is awarded only when direct, known-accuracy GPS coverage forms an exact closed enclosure whose strict interior contains the landmark anchor; proximity, inferred streets, display loop tolerance, and GPS points without accuracy do not count.

History keeps full GPS/route data lazy until a recording is opened, Completion calculations yield and cancel during navigation, and Backup V3 exports visible finalized recordings asynchronously while preserving frozen route snapshots and medal state.
