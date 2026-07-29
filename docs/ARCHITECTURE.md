# Architecture

## Tech Stack

- Expo SDK 54
- React Native
- TypeScript
- SQLite via `expo-sqlite`
- Location via `expo-location`
- Background task foundation via `expo-task-manager`
- Map display via `react-native-maps`
- Medal audio via `expo-audio`
- Medal success feedback via `expo-haptics`

On iOS, `react-native-maps` uses Apple MapKit by default.

## Folder Structure

- `src/screens`: top-level app screens.
- `src/components`: reusable UI and map components.
- `src/services`: app logic such as recording, distance, cells, and background tasks.
- `src/database`: SQLite initialization and repositories.
- `src/types`: shared TypeScript types.
- `src/constants`: walking GPS configuration and labels.

## Database

Tables:

- `schema_migrations`
- `walk_sessions`
- `gps_points`
- `gps_observations`
- `route_snapshots`
- `pending_recording_repairs`
- `pending_recording_discards`
- `app_settings`
- `osm_street_segments`
- `zones`
- `zone_cell_totals`
- `explored_cells`
- `loop_fills`
- `medal_albums`
- `medals`
- `medal_album_items`
- `medal_acquisition_events`
- `collected_medals`
- `poi_candidate_fetches`
- `poi_candidates`

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

- active recording session id
- active recording profile marker

`osm_street_segments` caches short OpenStreetMap-derived street segment geometry:

- OSM way-part id
- name
- highway type
- coordinate geometry
- bounding box
- fetched timestamp

`explored_cells` stores persisted walking exploration cells by profile key, cell size, source, and session:

- walking profile key
- cell size in meters
- cell x/y
- source: `gps`, `inferred`, or `loop_fill`
- nullable session id
- created timestamp

`loop_fills` stores closed-loop analysis results:

- session id and walking profile key
- loop polygon
- area
- total and unwalked walkable OSM street length inside the polygon
- accepted/rejected state and rejection reason

`gps_observations` retains every validly formed raw fix, including filtered fixes, so a later out-of-order delivery can deterministically derive the route again in timestamp order. `route_snapshots` freezes validated render geometry for finalized sessions. `pending_recording_repairs` is a durable finalization outbox: its row is created in the same transaction that ends a valid session and removed only after route and exploration caches are safely present. `pending_recording_discards` temporarily hides a stopped session with fewer than two accepted points for a five-minute late-GPS recovery window, then removes it if it is still underfilled.

`zones` caches country, city, and district boundary polygons fetched from OSM administrative relations.

Migration 18 consolidates legacy non-walking session rows, exploration cells, loop fills, active markers, and imported backups into the walking profile without deleting recordings. Legacy activity preferences and completion objectives are removed because the app no longer exposes activity choices.

`zone_cell_totals` caches calculated zone denominators:

- zone id
- cell size
- total cells
- calculated timestamp

## Recording Flow

1. Startup initializes saved data and unfinished-recording recovery while requesting foreground permission behind the branded launch overlay. After map, data, recovery, permission, and bounded initial-location readiness complete, the overlay waits for the user's explicit entry tap.
2. With permission granted, one managed foreground-location hook requests the current position and keeps an idle high-accuracy watcher active so the player marker is available before recording.
3. Native watcher errors retry with bounded backoff. During a recording, a watchdog probes and replaces a watcher that stops delivering usable fixes.
4. User taps Start only after recovery detection completes.
5. The new `walk_sessions` row and its active-session recovery settings are created in one exclusive SQLite transaction.
6. The managed watcher switches to best-for-navigation settings. Step counting and background tracking initialize independently.
7. Foreground fixes enter the canonical SQLite queue, with a file-journal fallback on storage pressure or failure. Every delivered native background batch is sorted, written to a temporary document-directory file, and atomically renamed into the durable outbox before database initialization or queueing. Ownerless points are matched only when exactly one recording contains their timestamp, and unmatched recent batches remain journaled for the bounded recovery window. Active backlogs are admitted in 512-point chunks so the in-memory queue cannot starve their tail.
8. Each queued fix first enters `gps_observations`. In-order fixes use an incremental fast path; a late or improved fix rebuilds contiguous `gps_points` from all raw observations and requests one full UI synchronization. The UI otherwise reconciles the database tail once per second. This makes arrival order irrelevant while retaining the complete trace as stable route chunks of at most 256 raw vertices; only the newest 300 points remain in diagnostic/movement state.
9. Exploration cells advance incrementally. Suspicious outage gaps remain explicit until finalized street inference can validate a safe bridge; the renderer never invents a diagonal through buildings.
10. User taps Stop, then chooses Continue or holds Quit in the confirmation dialog.
11. Confirmed Stop hides the active UI, invalidates recording ownership, verifies the serialized native background task has stopped, waits for entered handlers, drains the durable outbox, flushes the chronologically ordered queue, and atomically finalizes the SQLite session. The recovery marker is compare-cleared only after that boundary succeeds; a core failure restores the active recording. As soon as the durable boundary succeeds, confirmed live cells, the History row, headline stats, the recording summary, and Start control return without waiting for derived work. An underfilled session is hidden as a recoverable discard tombstone instead of being deleted before a delayed native callback can supply its final point.
12. Route snapshot inference, exact pedometer reconciliation, medal safety evaluation, objective recalculation, and the full saved-data refresh run asynchronously after the durable Stop boundary. A route made entirely from confirmed adjacent fixes takes a direct snapshot fast path and never queries the surrounding 450m street corridor; only suspicious gaps invoke cached-street graph inference. The pending repair row keeps route/exploration recovery crash-safe. A native event that enters JavaScript after finalization still journals before session lookup and uses its recording-owner hint, or a unique timestamp match when the headless runtime has no hint. Raw observations are re-derived in canonical order; a changed route removes stale route/cell caches, reopens the repair marker, and notifies the mounted map to refresh. Snapshots persist their GPS source count and maximum point id; create-if-missing replaces a stale generation before freezing the current one. Explored cells and marker removal commit together only while the database, snapshot, and calculated cells still share that exact generation, serialized against both late merge and deletion.
13. Full-history route, contour, loop-fill, and street rebuilds run only from the explicit Reprocess recordings action.

The watcher keeps the raw current location independently from route acceptance. Before recording it drives accuracy-aware startup centering; once a recording has an accepted route point, the player marker and auto-follow prefer that canonical endpoint. `ExplorationMap` retains the newest trustworthy candidate across active-route teardown and creation, so Stop/Start cannot clear the marker and weak raw fixes cannot replace an accepted endpoint. The player uses `Marker.Animated` with an `AnimatedRegion`: trustworthy updates interpolate for 250-900ms, while implausible moves above 60m snap instead of flying across the map. Four-direction 170ms walking frames, idle frames, and gold halos are precomposed PNG annotation images. MapKit therefore receives one complete native bitmap with custom-view snapshot tracking disabled. When GPS ages out during Stop, the marker retains its last visible bitmap under a stable identifier while accessibility changes to last-known location; this avoids an asynchronous image replacement clearing the annotation.

History keeps its summary rows separate from detailed GPS data: opening the list performs no full-history point load, opening one recording loads only that recording, and enabling the Paths layer remains the explicit full-route display trigger. Full-screen menu visibility uses stable map props and a memoized native map subtree, avoiding polygon/route reconciliation when returning to the map.

## GPS Filtering

Filtering uses one walking profile: accepted fixes must be within 30m accuracy, movement is sampled from 1m, and the maximum plausible speed is 4m/s.

The recorder rejects:

- points with poor accuracy
- points below the minimum movement threshold
- impossible jumps above the walking speed cap

## Exploration Cells

The current exploration layer uses configurable 15m x 15m grid cells.

GPS paths are first classified into path segments:

- confirmed GPS segments
- rejected gaps

Confirmed GPS geometry marks direct cells. A suspicious gap marks cells only when the frozen snapshot contains a validated street-graph bridge; rejected gaps are not sampled, so a missing GPS interval cannot create fake diagonal exploration through buildings.

Validated high- and medium-confidence street-matched bridge sections are stored as `inferred` cells. They contribute to the explored map, zone completion, and loop boundaries. Unmatched or low-confidence gaps remain rejected and never receive a straight-line fallback.

Normal startup reads distinct saved cell ids from the exploration ledger without loading saved GPS routes. The map mounts first; cached contour polygons are enabled only after the native map reports readiness. During recording, saved and active ids are combined before contour extraction so one surface owns shared boundaries and cannot show transient seams; unchanged sets retain their references so memoization avoids redundant work.

The 15m x 15m grid is still a temporary approximation before true OpenStreetMap street completion.
For rendering, adjacent explored cells are unioned into contour polygons instead of being emitted as overlapping rectangles. Each connected explored island becomes one native map polygon. Enclosed contours at or below the walking fill-area cap are rendered solid, which guarantees that small missing-cell channels cannot show through a qualifying discovered frontier. When a hole is filled, nested island contours inside it are discarded because the parent surface already covers them. Oversized enclosed contours remain explicit holes and receive their own black frontier, while filled holes leave no internal outline. The combined saved/live surface uses a matching edge stroke to cover native polygon rasterization seams.

## Loop Fill

Closed-loop fill is a gameplay-first V1 mechanic based on global walking explored-cell enclosure.

The app first samples trusted GPS path geometry into explored cells. Rejected GPS gaps never mark cells, so they cannot become part of a loop boundary.

All directly explored walking cells are treated as the boundary, even when they came from different recordings. The renderer and persistence layer share one authoritative grid-contour extraction: each qualifying enclosed contour produces the exact same cell set for the solid red surface, loop-fill storage, and completion. Nested contour cells are claimed once. The one-cell flood tolerance supplements only contours that are not already represented by the authoritative extraction.

Current thresholds are:

- minimum recording distance before loop analysis: 80m
- minimum enclosed cells: 1
- detection boundary expansion: 1 cell
- maximum enclosed area: 150,000m2

OSM is used as hidden analysis data inside the polygon. The app still measures walkable street length for future debugging and tuning, but OSM street density no longer blocks a valid loop from filling.

Walking exploration can contain multiple loop fills. Accepted loop-fill cells are stored separately from directly walked GPS cells.


## Landmark Medals

Lyon album v1 is a frozen, bundled catalog of 20 reviewed landmarks. The UTF-8 catalog stores stable internal ids, Unicode-localized names and descriptions, categories, OpenStreetMap identities, and reviewed capture anchors. SQLite seeds the definitions idempotently and stores immutable acquisition evidence separately from presentation state. The collection view gives its horizontal category strip an explicit viewport and chip height so iOS cannot collapse or clip the labels. Each filtered result is split into permanent Unlocked and Locked sections in frozen catalogue order; only unlocked cards expose the full landmark description.

The v0.6 presentation hierarchy uses the Medal screen navy/gold surfaces across app startup recovery, map HUD, walk controls, full-screen menus, summaries, and diagnostics. The map owns a persistent city-medal progress card and a single objective toggle. Layer switches remain in Options, maintenance moved out of everyday Details, Completion exposes four primary measures, and History keeps route-quality diagnostics collapsed behind Technical details. These are presentation-only boundaries: the underlying recording, layer, completion, and repair services are unchanged.

Medal qualification deliberately shares the normal gameplay enclosure rules instead of maintaining a stricter parallel contour model. The evaluator:

- rasterizes the accepted active route during recording and evaluates again from the finalized frozen route at Stop or recovery;
- uses the same exact-contour-first, one-cell seam-tolerance fallback as normal loop fill;
- accepts the same confirmed and validated inferred route geometry after finalization, without treating already stored `loop_fill` interior cells as boundary evidence;
- requires at least 80m of walked distance, keeps the landmark anchor strictly inside rather than on the boundary, and uses the walking gameplay cap of 150,000m2;
- evaluates a newly walked loop independently, so previously mapped or previously enclosed ground cannot block the award;
- writes the evidence event and unique collected-medal row in one exclusive transaction.

The active-walk evaluator runs whenever its accepted boundary grows, updates the marker and collection immediately, and queues presentation without waiting for Stop. Finalization and recovery repeat the idempotent evaluation as safety nets. A one-time `gameplay-v2` repair checks each previously finalized recording so walks missed by the v0.4 strict evaluator can be awarded after upgrading. Once earned, a medal remains durable even if its active recording is later discarded; the acquisition event keeps its evidence while its session foreign key becomes null.

Startup resets an interrupted `presenting` state to `pending`, so every collected medal remains in the presentation queue until acknowledged. Presentation uses a bundled metallic chime, success haptic, reduced-motion-aware 3D rotation, localized description, and silent/haptic failure fallbacks. Continue measures the on-map Medal tab, flies the medal into it, and briefly pulses the destination. The collection filters in frozen album order and renders the resulting earned and locked arrays as separately labeled sections.

The Medals screen still offers an explicitly confirmed cumulative scan of saved walks for older coverage and records completion per frozen album version. The one-time v0.5 repair is narrower: it only restores awards that an individual saved recording should have earned under the live/Stop rules. Backup V3 includes acquisition events, collected state, presentation state, and retro-scan settings. Older V1/V2 backups restore with an empty medal collection.

The developer-only POI candidate service queries an allowlisted set of OpenStreetMap tags inside fixed bounds and stores candidates as `unreviewed`. Network results never mutate the frozen shipped album or become collectible without review and a release change.
## Street Completion

Street completion V1 uses OpenStreetMap as a hidden analysis and debug data layer while keeping Apple MapKit as the visual map background.

Flow:

- Fetch nearby OSM `highway` ways through Overpass.
- Split long OSM ways into short local segments.
- Cache segment geometries in SQLite.
- Match recorded GPS points to nearby segment polylines using a distance threshold.
- During a live recording, match only points whose persisted point index has not already been processed.
- Match full saved history only during the explicit Reprocess workflow.
- Keep unmatched OSM streets hidden from the main map by default.
- Keep matched/unmatched OSM street data hidden from the main gameplay map by default.
- Report loaded segments, matched segments, and matched street-segment distance.

Limitations:

- Matching is proximity-based and can be wrong near parallel roads.
- Street matching is based on loaded nearby streets, not full city-scale street coverage yet.
- Completion uses the walking exploration ledger.

## Zone Completion

The Completion screen can fetch nearby OSM administrative boundaries using the current GPS location.

Flow:

- fetch OSM administrative relations for country, city, and district scopes
- cache zone polygons in `zones`
- select a scope and zone in Completion
- count explored 15m cells whose centers fall inside the selected polygon
- count total 15m cells inside city/district-sized polygons
- show completion percentage when the zone denominator can be scanned locally

Large zones can intentionally show a pending denominator. This avoids expensive country-scale scans on the phone. Completion augments persisted cells with the same walking area-capped enclosed contour cells used by the solid red renderer, so a qualifying visible surface and its percentage always use the same numerator.

Local denominator scans are chunked and yield to the React Native event loop. The Completion screen starts them after its opening transition, calculates the selected zone only once, and aborts unfinished work immediately when the screen closes so navigation cannot be held by a large grid scan.

District data depends on local OSM coverage. If no district relation exists near the user, Completion degrades to country/city zones.

Zones are labeled as exact OSM polygons or approximate OSM bounds. Approximate bounds are used only when relation geometry cannot be assembled yet.

## Street-Aware Inference

Street-aware path inference is persisted in an immutable route snapshot and is shared by route rendering, explored-cell generation, completion, and loop analysis.

The service projects suspicious GPS-gap endpoints onto the nearest point of cached OSM street segments, attaches those projected points to the graph, and searches for a plausible street route. This avoids treating a player beside the middle of a 35m fragment as if they were at one of its endpoints. Only high- or medium-confidence routes are frozen and counted. A high-confidence snap may close its endpoint seam only when it is within 12m; longer, unmatched, or low-confidence gaps never receive a straight connector. Once stored, a snapshot is never changed by map movement, cache refresh, normal saves, or loop recalculation.

The explicit **Reprocess recordings** action is the only workflow allowed to replace existing historical snapshots. Before route calculation, it makes one consolidated Overpass linestring request covering the raw corridors of every saved walking recording. This repairs the incomplete cache that caused the v0.3.50 legacy-freeze regression without returning to slow per-recording downloads. The request has a 35-second client timeout, its street segments are batch-written atomically, and failure aborts the rebuild while leaving existing routes and progress untouched. One graph is then built per recording and reused for every suspicious GPS interval. Individual recording calculation failures retain their previous frozen route while the remaining recordings continue. The complete candidate includes confirmed cells, validated inferred cells, and authoritative contour fills. If its unique-cell total is lower than existing progress, both snapshots and the explored ledger remain untouched and the result reports a safety stop. Otherwise all explored cells and loop metadata are replaced in one atomic transaction. The phased progress modal is displayed over the map after full-screen panels close, and any uncaught failure produces a visible error.

Legacy confirmed-only snapshots remain unchanged until the user explicitly reprocesses them. Backup V3 includes route snapshots and medal acquisition/presentation state, so exported and restored routes keep the same frozen geometry. Export is blocked while a recording is active, drains the local background outbox, omits any still-hidden underfilled late-GPS recovery tombstone, and reads visible sessions, points, snapshots, and medal state inside one exclusive transaction. The compact JSON file is written asynchronously to the share cache. Import closes file-journal admission, stops and drains native tracking, closes and settles the in-memory GPS queue, commits the replacement transaction, clears the old recording hint, and only then discards old journal files; a delayed pre-import event therefore cannot be attributed to an unrelated restored session.

There is still no straight-line fallback for inferred exploration. Low-confidence, implausible, or unmatched gaps remain hidden and contribute no explored cells.
