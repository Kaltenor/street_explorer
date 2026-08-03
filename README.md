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

Current version: `v0.15.0`

The app supports an updated shared portrait splash/launch presentation, self-healing foreground/background recording, accuracy-aware startup and one-time walking-scale recording-start centering, a persistent four-direction animated pixel-art player with native geographic anchoring, native location fallback, and camera-independent panning, hole-free full-walk live rendering, bounded durable late-GPS recovery, walking-focused GPS filtering, full-screen Details/History/Completion/Medals views, explored cells, loop-fill analysis, landmark medal collection, safe backup/restore, device step counts, city-wide district outlines with a closure- and Stop-driven map objective HUD, and persistent OpenStreetMap street completion derived from frozen saved routes.

UI Polish V2 keeps the navy/gold identity while assigning stable gameplay meaning to map colors: green is the active walk, gold is the selected saved route, a restrained cool palette distinguishes other saved walks, cyan marks inferred street links, red is explored ground, and orange is today's exploration. Details, History, Completion, and the post-walk report use consistent dark card levels. GPS now reports Acquiring, Good, Weak/Stale, Denied, or Unavailable from permission, fix age, and accuracy, with a good-fix threshold of 25m and stale thresholds of 12 seconds while recording or 20 seconds while idle.

Recording Recovery V2 opens every authoritative unfinished session as a full-screen saved-route preview after draining pending background batches. It verifies the native GPS task, reports Active, Interrupted, or Uncertain status, recommends the safest next action without removing Resume/Finish/Discard, and requires an editable date/time-based name that is committed atomically when a recovered walk is finished.

Lyon album v1 contains 20 reviewed landmark medals. Its UTF-8 localized copy preserves French accents, and the Medals category strip uses fixed, vertically centered chips on iOS. Medal enclosure now uses the same 80m minimum, one-cell seam tolerance, accepted route geometry, and 150,000m2 cap as normal gameplay. A qualifying active walk awards immediately even over previously mapped ground; cancelled 650ms live checks remain retryable until evaluation completes, Stop/recovery remain safety nets, and a one-time repair rechecks recordings missed by the older strict evaluator. The reveal rotates in 3D, shows the localized description, then flies into the Medal tab after Continue. Every category now has permanent Unlocked and Locked sections; unlocked cards lead with their descriptions while locked cards stay compact.

The CC0 top-down player uses distinct north/east/south/west art in one persistent 64×64-point marker. Its coordinate glides between trustworthy GPS updates instead of jumping, while a simple explicitly sized image child preserves the expected Retina-device scale. Direction changes select the matching idle frame; rapid walking-frame swaps are intentionally disabled for marker and crash stability. The marker remains mounted through GPS interruptions and Stop/Start transitions, and stale position is exposed through its accessible last-known-location label.

The v0.7 interface uses one consistent navy/gold system with rounded surfaces and reduced default density. A persistent Lyon medal-progress card opens the collection from the map, one flag button toggles the current area objective, map layers live in Options, Completion shows only its four primary measures, and recording diagnostics stay behind explicit technical-detail controls.

Zone Boundary Completion V2 requests complete OSM member geometry for local administrative relations and every district inside the containing city, assembles unordered or reversed way fragments, preserves multiple outer components and holes, and keeps genuinely incomplete geometry display-only. With no objective, the map preloads the real GPS city’s district context without selecting anything; after selection, it keeps that objective city’s districts outlined. Ordinary panning leaves the objective unchanged. Long-pressing the map gives haptic feedback, immediately selects the exact district or city at that point, and exposes direct District/City scope buttons when both exist. Superseded lookups and percentage scans cannot overwrite the newest selection. Exact cached boundaries cannot be downgraded by an incomplete response, and a saved objective is restored after its boundary cache returns. Exact zone denominators are cached against the boundary geometry fingerprint. Completion refreshes boundaries automatically after 30 days, shows refresh status and the last successful date, and records permanent district/city achievements that survive later boundary edits. Backup V5 preserves those achievements alongside routes and medals.

Street-Aware Path Inference V3 performs a small shared-cache topology fetch only around suspicious GPS gaps. Its graph accepts exact OSM joins, verified ground-level geometric crossings, and compatible endpoint seams no wider than 8m while respecting bridge, tunnel, layer, access, and foot metadata. Every accepted frozen bridge stores its confidence, topology reason, snap distances, route metrics, and inferred-cell count; History shows a concise summary with full evidence under Technical details. Existing historical snapshots remain immutable unless Reprocess recordings is explicitly run.

Saved-route focus now selects and enables the requested History recording in one action. The Today path scope uses recording overlap, so a walk that crosses midnight remains visible on both affected dates.

Performance work introduced in v0.6.6 keeps the player and active route immediate while coalescing expensive exploration contours at most every 650ms without allowing continuous GPS fixes to starve the surface update. Native polygon identities include their full geometry, so closing an enclosure replaces any stale MapKit hole immediately during a walk or after Stop. Saved route queries are scoped to the visible period or selected recording, History virtualizes its rows, hidden full-screen panels unmount, map overlays are memoized, completion aggregates use indexed SQLite queries, startup no longer waits for the background outbox before mounting, and Backup V5 compresses bounded records without constructing one database-sized JSON value.

History keeps full GPS/route data lazy until a recording is opened, Completion calculations yield and cancel during navigation, and Backup V5 exports visible finalized recordings as a compressed, checksum-verified `.streetexplorer` archive. The newest 20 walks stay in individual hot records; older walks share bounded monthly archive blocks without merging their logical identities. Confirmed frozen-route points reference the single GPS stream, inferred bridge geometry remains lossless, and restore reads and inserts one bounded block at a time. Backup, Convert V4, and Restore are single-flight operations: History immediately shows an in-progress panel, disables duplicate taps, and keeps that feedback visible through file/database processing. After sharing, the user must select the saved Files copy again before success is reported. Restore accepts V5 only; the temporary Convert V4 tool converts a complete V4 JSON backup directly to V5, while V1-V3 are no longer supported.
