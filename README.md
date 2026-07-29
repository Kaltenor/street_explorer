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

Current version: `v0.6.0`

The app supports an updated shared portrait splash/launch presentation, self-healing foreground/background recording, accuracy-aware startup centering, a persistent accepted-route player marker, hole-free full-walk live rendering, bounded durable late-GPS recovery, walking-focused GPS filtering, full-screen Details/History/Completion/Medals views, explored cells, loop-fill analysis, landmark medal collection, safe backup/restore, device step counts, objective HUD progress, and hidden OpenStreetMap analysis for future street completion.

Lyon album v1 contains 20 reviewed landmark medals. Its UTF-8 localized copy preserves French accents, and the Medals category strip uses fixed, vertically centered chips on iOS. Medal enclosure now uses the same 80m minimum, one-cell seam tolerance, accepted route geometry, and 150,000m2 cap as normal gameplay. A qualifying active walk awards immediately even over previously mapped ground; Stop/recovery remain safety nets, and a one-time repair rechecks recordings missed by the older strict evaluator. The reveal rotates in 3D, shows the localized description, then flies into the Medal tab after Continue. Every category now has permanent Unlocked and Locked sections; unlocked cards lead with their descriptions while locked cards stay compact.

The v0.6 interface uses one consistent navy/gold system with rounded surfaces and reduced default density. A persistent Lyon medal-progress card opens the collection from the map, one flag button toggles the current district objective, map layers live in Options, Completion shows only its four primary measures, and recording diagnostics stay behind explicit technical-detail controls.

History keeps full GPS/route data lazy until a recording is opened, Completion calculations yield and cancel during navigation, and Backup V3 exports visible finalized recordings asynchronously while preserving frozen route snapshots and medal state.
