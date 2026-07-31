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

Current version: `v0.9.1`

The app supports an updated shared portrait splash/launch presentation, self-healing foreground/background recording, accuracy-aware startup centering, a persistent four-direction animated pixel-art player marker, hole-free full-walk live rendering, bounded durable late-GPS recovery, walking-focused GPS filtering, full-screen Details/History/Completion/Medals views, explored cells, loop-fill analysis, landmark medal collection, safe backup/restore, device step counts, objective HUD progress, and persistent OpenStreetMap street completion derived from frozen saved routes.

Lyon album v1 contains 20 reviewed landmark medals. Its UTF-8 localized copy preserves French accents, and the Medals category strip uses fixed, vertically centered chips on iOS. Medal enclosure now uses the same 80m minimum, one-cell seam tolerance, accepted route geometry, and 150,000m2 cap as normal gameplay. A qualifying active walk awards immediately even over previously mapped ground; Stop/recovery remain safety nets, and a one-time repair rechecks recordings missed by the older strict evaluator. The reveal rotates in 3D, shows the localized description, then flies into the Medal tab after Continue. Every category now has permanent Unlocked and Locked sections; unlocked cards lead with their descriptions while locked cards stay compact.

The CC0 top-down player uses distinct north/east/south/west idle and walking frames rendered as precomposed native annotation images. Its coordinate glides between trustworthy GPS updates instead of jumping, and MapKit no longer snapshots a nested animated view that can flicker or disappear. The marker remains mounted through GPS interruptions and Stop/Start transitions, retains its last already-rendered frame when GPS becomes stale, and exposes the stale position through its accessible last-known-location label instead of swapping the native image during finalization.

The v0.7 interface uses one consistent navy/gold system with rounded surfaces and reduced default density. A persistent Lyon medal-progress card opens the collection from the map, one flag button toggles the current district objective, map layers live in Options, Completion shows only its four primary measures, and recording diagnostics stay behind explicit technical-detail controls.

Zone Boundary Completion V2 assembles complex OSM administrative multipolygons from unordered or reversed way fragments, preserves multiple outer components and holes, and keeps incomplete geometry display-only. Exact zone denominators are cached against the boundary geometry fingerprint. Completion refreshes boundaries automatically after 30 days, shows refresh status and the last successful date, and records permanent district/city achievements that survive later boundary edits. Backup V4 preserves those achievements alongside routes and medals.

Street-Aware Path Inference V3 performs a small shared-cache topology fetch only around suspicious GPS gaps. Its graph accepts exact OSM joins, verified ground-level geometric crossings, and compatible endpoint seams no wider than 8m while respecting bridge, tunnel, layer, access, and foot metadata. Every accepted frozen bridge stores its confidence, topology reason, snap distances, route metrics, and inferred-cell count; History shows a concise summary with full evidence under Technical details. Existing historical snapshots remain immutable unless Reprocess recordings is explicitly run.

Saved-route focus now selects and enables the requested History recording in one action. The Today path scope uses recording overlap, so a walk that crosses midnight remains visible on both affected dates.

Performance work introduced in v0.6.6 keeps the player and active route immediate while batching expensive exploration contours and live medal enclosure checks behind a 650ms settle window. Saved route queries are scoped to the visible period or selected recording, History virtualizes its rows, hidden full-screen panels unmount, map overlays are memoized, completion aggregates use indexed SQLite queries, startup no longer waits for the background outbox before mounting, and Backup V4 writes JSON incrementally instead of allocating a second database-sized string.

History keeps full GPS/route data lazy until a recording is opened, Completion calculations yield and cancel during navigation, and Backup V4 exports visible finalized recordings through Expo's current cache-file API, identifies active recording state from its authoritative setting, excludes invisible orphan unfinished rows and their dependent data, verifies the non-empty JSON before opening the share sheet, and preserves frozen route snapshots and medal state. Preparation, writing, and sharing failures are reported separately with technical detail. Stop blocks only until tracking is quiescent and the session is durable; the summary, History row, stats, and live cells appear immediately while route inference, exact steps, medal safety evaluation, objectives, and cache refresh reconcile in the background. A continuous recording with no suspicious GPS gap bypasses street-corridor graph inference entirely.
