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

Current version: `v0.16.15`

The app supports an updated shared portrait splash/launch presentation, self-healing foreground/background recording, accuracy-aware startup and one-time walking-scale recording-start centering, a persistent four-direction hand-inked cartographer with native geographic anchoring, game-owned location presentation, and camera-independent panning, hole-free full-walk live rendering, bounded durable late-GPS recovery, walking-focused GPS filtering, full-screen Atlas-styled Details/History/Completion/Medals views, explored cells, loop-fill analysis, landmark medal collection, safe backup/restore, device step counts, city-wide district outlines with a closure- and Stop-driven map objective HUD, and persistent OpenStreetMap street completion derived from frozen saved routes.

Midnight Cartographer gives the iOS playfield the same identity as the navy/gold interface: Apple MapKit uses a dark muted presentation, generic POIs and the native blue cursor are hidden, and only game-owned landmarks, route markers, and the player remain. Translucent burnt orange means explored territory, gold marks today's discoveries and the active walk, parchment highlights a selected saved route, inferred links remain bright teal, and other saved walks use restrained atlas colors. Every district is rendered exactly once with a quiet copper outline that strengthens only when selected; the containing city uses a restrained wine perimeter instead of error red and strengthens only for a city objective. The selected district or city receives a quiet parchment wash that stays distinct from burnt-orange explored territory. Administrative overlays are gated to the selected objective city, and cross-city switches remount the native MapKit surface at its last camera region so a GPS-derived or retained previous-city perimeter cannot survive; explored territory stays visible. Start, finish, and medal locations use custom hand-inked parchment markers instead of native pins.

Atlas Cabinet unifies Details, History, Completion, Medals, and Options with the same left back control, Cinzel display titles, gold emblems and dividers, neutral-edged navy paper cards, subtle texture, quiet page/ink sounds, and Reduce Motion-aware transitions. The floating medal, objective, scope, navigation, and walking surfaces now use the same low-opacity paper grain, parchment/Cinzel identity text, restrained gold rules, and engraved selection states while keeping live values in the system face. Gold is reserved for selection, progress, rewards, and primary actions. Stop confirmation and the recording summary reuse the same textured dialog language while keeping the destructive action red. On iOS, every Atlas page also supports an interactive left-edge swipe back: the complete page follows the finger over the live map, short drags spring back, and committed distance or velocity completes the existing Back action. A recording-detail swipe returns to History before a second swipe returns to the map. District/city selection uses a compact hand-inked cartographer seal dynamically centered in the map space between the measured top and bottom controls. Its fitted title/detail typography stays inside the quiet navy center, and the shared strike remains fully hidden until that message's artwork is loaded so image and lettering become visible on the exact same animation frame. Completion reuses the same generated gold/navy/burnt-orange artwork at the restrained standard scale, while a tight white ink halo and navy drop shadow keep its dynamic labels readable. New explored cells flash as fresh orange ink, and a focused saved route draws onto the map before its finish marker appears.

Recording Recovery V2 opens every authoritative unfinished session as a full-screen saved-route preview after draining pending background batches. It verifies the native GPS task, reports Active, Interrupted, or Uncertain status, recommends the safest next action without removing Resume/Finish/Discard, and requires an editable date/time-based name that is committed atomically when a recovered walk is finished.

Lyon album v1 contains 20 reviewed landmark medals. Its UTF-8 localized copy preserves French accents, and the Medals category strip uses fixed, vertically centered chips on iOS. Medal enclosure now uses the same 80m minimum, one-cell seam tolerance, accepted route geometry, and 150,000m2 cap as normal gameplay. A qualifying active walk awards immediately even over previously mapped ground; cancelled 650ms live checks remain retryable until evaluation completes, Stop/recovery remain safety nets, and a one-time repair rechecks recordings missed by the older strict evaluator. The reveal rotates in 3D, shows the localized description, then flies into the Medal tab after Continue. Every category now has permanent Unlocked and Locked sections; unlocked cards lead with their descriptions while locked cards stay compact.

The original hand-inked cartographer uses distinct north/east/south/west idle, three-frame walking, and desaturated stale-GPS poses inside one persistent 64-by-64-point marker. The navy coat, gold trim, parchment hood, and red scarf match the Atlas interface, while a permanent dark compass halo keeps the icon legible over parchment selection washes and burnt-orange explored surfaces and in the stale-GPS state. All frames remain pre-mounted and opacity-selected at the proven 170ms cadence, so MapKit anchoring, Stop/Start continuity, and the accessible last-known-location state remain stable.

The interface uses one consistent navy/gold atlas system with textured floating ledgers, engraved active controls, and reduced default density. The full wordmark contracts after the first map interaction to reclaim playfield space, and only the selected 44-point bottom destination expands to reveal its localized label. A persistent Lyon medal-progress card opens the collection from the map, one flag button toggles the current area objective, map layers live in Options, Completion shows only its four primary measures, and recording diagnostics stay behind explicit technical-detail controls.

Zone Boundary Completion V2 requests complete OSM member geometry for local administrative relations and every district inside the containing city, assembles unordered or reversed way fragments, preserves multiple outer components and holes, and keeps genuinely incomplete geometry display-only. A level-9 relation belongs to a city only when deterministic interior samples from every outer component fall inside that city; shared-edge delegated communes and detached foreign components are excluded even when an old cached parent ID says otherwise. With no objective, the map preloads the real GPS city’s district context without selecting anything; after selection, it keeps that objective city’s districts outlined. Ordinary panning leaves the objective unchanged. Long-pressing another district inside the current or selected city switches directly to that district. The District/City scope chooser appears only when the held point belongs to a different city than the current boundary context or selected city. Superseded lookups and percentage scans cannot overwrite the newest selection. Exact cached boundaries cannot be downgraded by an incomplete response, and a saved objective is restored after its boundary cache returns. Exact zone denominators are cached against the boundary geometry fingerprint. Completion refreshes boundaries automatically after 30 days, shows refresh status and the last successful date, and records permanent district/city achievements that survive later boundary edits. Backup V5 preserves those achievements alongside routes and medals.
The boundary cache now preserves each relation's original OSM administrative level. Level 9 is the official selectable district tier, while level 10 remains stored for a future Neighborhood feature but is excluded from map outlines, objectives, completion, refresh counts, and visible achievement rollups. This policy applies by default across France and other places using the same level-8 city, level-9 district, level-10 neighborhood model. Upgraded legacy caches refresh automatically; a former level-10 objective is cleared while its historical achievement row remains internal.


Street-Aware Path Inference V3 performs a small shared-cache topology fetch only around suspicious GPS gaps. Its graph accepts exact OSM joins, verified ground-level geometric crossings, and compatible endpoint seams no wider than 8m while respecting bridge, tunnel, layer, access, and foot metadata. Every accepted frozen bridge stores its confidence, topology reason, snap distances, route metrics, and inferred-cell count; History shows a concise summary with full evidence under Technical details. Existing historical snapshots remain immutable unless Reprocess recordings is explicitly run.

Saved-route focus now selects and enables the requested History recording in one action. The Today path scope uses recording overlap, so a walk that crosses midnight remains visible on both affected dates.

Performance work introduced in v0.6.6 keeps the player and active route immediate while coalescing expensive exploration contours at most every 650ms without allowing continuous GPS fixes to starve the surface update. Native polygon identities include their full geometry, so closing an enclosure replaces any stale MapKit hole immediately during a walk or after Stop. Saved route queries are scoped to the visible period or selected recording, History virtualizes its rows, hidden full-screen panels unmount, map overlays are memoized, completion aggregates use indexed SQLite queries, startup no longer waits for the background outbox before mounting, and Backup V5 compresses bounded records without constructing one database-sized JSON value.

History keeps full GPS/route data lazy until a recording is opened, Completion calculations yield and cancel during navigation, and Backup V5 exports visible finalized recordings as a compressed, checksum-verified `.streetexplorer` archive. The newest 20 walks stay in individual hot records; older walks share bounded monthly archive blocks without merging their logical identities. Confirmed frozen-route points reference the single GPS stream, inferred bridge geometry remains lossless, and restore reads and inserts one bounded block at a time. Backup, Convert V4, and Restore are single-flight operations: History immediately shows an in-progress panel, disables duplicate taps, and keeps that feedback visible through file/database processing. After sharing, the user must select the saved Files copy again before success is reported. Restore accepts V5 only; the temporary Convert V4 tool converts a complete V4 JSON backup directly to V5, while V1-V3 are no longer supported.
