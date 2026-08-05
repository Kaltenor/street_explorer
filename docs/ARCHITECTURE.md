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


`AtlasCabinet.tsx` owns the shared textured full-screen shell, gold cartographic header, section rules, Reduce Motion preference, transient objective stamp, and short locally bundled page/ink sounds. Details, History, Completion, and Options opt into that shell; recovery and destructive/system dialogs deliberately retain their specialized presentation. `ExplorationMap` owns the separate map-native effects: a 520ms new-cell ink color reveal and a 900ms vertex-bounded focused-route draw. Reduce Motion publishes each effect at its final state immediately.
On iOS, `react-native-maps` uses Apple MapKit in dark `mutedStandard` mode. Native POIs and the native user-location cursor are disabled so game-owned annotations define the playfield.

## Folder Structure

- `src/screens`: top-level app screens.
- `src/components`: reusable UI and map components.
- `src/services`: app logic such as recording, distance, cells, and background tasks.
- `src/database`: SQLite initialization and repositories.
- `src/types`: shared TypeScript types.
- `src/constants/theme.ts`: shared navy/gold surfaces plus semantic walking, path, exploration, and GPS-state colors.
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
- `exploration_revisions`
- `zone_completion_snapshots`
- `zone_achievements`
- `zone_refresh_state`
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
- last trustworthy player position for cold-launch continuity

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

`zones` caches country, city, and district boundary polygons fetched from OSM administrative relations. Local queries request body-plus-geometry output for the containing relations, nearby relations, and every district inside the containing city; country results remain bounded display data. V2 relation assembly joins unordered and reversed member ways, retains multiple outer components and holes, assigns exact districts to their containing city, and marks any incomplete or degenerate assembly as a display-only bounds fallback. Repository upserts never replace an exact OSM polygon with a fallback response. With no objective, a distance/time-bounded preload uses only the real GPS position to show the current city's district context without selecting or persisting an area. Once an objective exists, the map reads its selected city association to keep that city's district outlines visible and highlight the active objective. Viewport updates never mutate the objective or boundary group. A map long-press resolves exact cached city/district containment, falls back to one explicit OSM fetch when needed, rejects stale concurrent responses by request generation, gives haptic feedback, and saves objective changes through an ordered persistence chain. District remains the default scope unless the existing objective is a city; when both scopes exist, the transient scope picker can switch directly between them without a confirmation step. When a refresh repopulates a previously missing objective zone, the map reloads the saved objective from the restored cache.

Migration 18 consolidates legacy non-walking session rows, exploration cells, loop fills, active markers, and imported backups into the walking profile without deleting recordings. Legacy activity preferences and completion objectives are removed because the app no longer exposes activity choices.

`zone_cell_totals` caches calculated zone denominators by zone id, cell size, and deterministic geometry fingerprint. A changed boundary invalidates its previous total instead of reusing a stale denominator.

`zone_achievements` stores the first exact 100% completion evidence independently from the mutable zone cache. Achievements therefore remain earned after a boundary refresh or cache clear. `zone_refresh_state` stores the last attempt, last success, status, and error needed for the 30-day automatic refresh policy and visible diagnostics.

`exploration_revisions` is advanced by SQLite triggers whenever explored cells are inserted, updated, or deleted. `zone_completion_snapshots` stores each full city/district result against that revision and the deterministic boundary geometry fingerprint. The map mirrors snapshots in memory, restores a matching value without a polygon rescan, and warms the paired district/city result in the background. Live unfinished-recording previews remain memory-only and cannot create durable achievements or snapshots.


Before offering recovery, startup drains the durable background outbox, loads the complete persisted trace, and verifies whether the native background location task is still running. Recovery V2 presents that trace in a full-screen bounded map preview and classifies it as Active, Interrupted, or Uncertain. Active recommends Resume; Interrupted and Uncertain recommend Finish, while Resume, Finish, and Discard remain available. Finishing requires an editable date/time-based name, and that name is written inside the same exclusive transaction that durably closes the session. Any failed action restores recording protection and the recovery screen instead of clearing the authoritative marker.

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

The watcher keeps the raw current location independently from route acceptance. Before recording it drives accuracy-aware startup centering; Start and Resume perform one immediate walking-scale recenter, while an accepted route point becomes the canonical player endpoint without continuously moving the camera. When that recenter used a restored position, the first newer trustworthy fix may correct the camera exactly once; any user pan cancels the pending correction before it can move the camera. `ExplorationMap` retains the newest trustworthy candidate across active-route teardown and creation, so Stop/Start cannot clear the player and weak raw fixes cannot replace an accepted endpoint. MapScreen also persists the newest accepted endpoint or trustworthy raw fix in `app_settings` at a bounded five-second cadence and when the app backgrounds, then restores it on cold launch before a new iOS fix is required. Weak fixes cannot replace this durable point, and reset/restore workflows clear it. After launch dismissal, the player is rendered as one stable MapKit annotation with an explicit 64×64-point child. The annotation receives the trustworthy geographic coordinate directly, so MapKit moves the sprite synchronously with pan, zoom, rotation, and programmatic camera transitions; there is no asynchronous screen-space `pointForCoordinate` loop or coordinate interpolation. Camera motion never changes the follow state or recenters on its own. The native iOS user-location indicator is disabled so the game-owned player annotation is the sole location symbol. Four directional idle images, twelve directional walking images, and four desaturated stale-GPS images remain pre-mounted inside this single annotation. Reliable fresh motion at 0.45m/s or faster selects one layer every 170ms using live heading or a 3m displacement bearing fallback; stationary fallback settles after four seconds. Opacity changes choose the visible frame without replacing the marker image, remounting the annotation, or creating parallel annotations. Stop and the next Start retain the marker and last direction; stale GPS selects the matching desaturated pose and changes the accessible label to last-known location. The separate UI classifier in `gpsStatus.ts` maps permission, fix availability, age, and accuracy to five presentation states without changing the 30m route-acceptance safety limit: Good requires at most 25m accuracy, while a fix becomes visibly stale after 12 seconds during recording or 20 seconds while idle.

The active frame set is generated from `assets/player/cartographer-sheet.png` by `scripts/process-cartographer-sprites.py`. It contains original hand-inked east/north/south/west idle and three-frame walks plus desaturated stale-GPS poses. The new artwork changes only bitmap content and opacity selection: the one-marker MapKit anchoring contract is unchanged.

History keeps its summary rows separate from detailed GPS data: opening the list performs no full-history point load, opening one recording loads only that recording, and enabling the Paths layer remains the explicit full-route display trigger. Full-screen menu visibility uses stable map props and a memoized native map subtree, avoiding polygon/route reconciliation when returning to the map.

## Performance Boundaries

The map treats the native player annotation and active route as the immediate lane. Exploration and today's merged surfaces consume trailing coalesced cell snapshots at most every 650ms, so frequent iOS GPS delivery cannot indefinitely postpone a light-orange exploration-surface update; their native Polygon/Polyline subtree remains memoized. Polygon identity includes the complete exterior and hole geometry because MapKit can otherwise retain a stale transparent hole when React changes only an enclosure's interior. Live medal analysis uses the same settle window and first performs an eligible-anchor bounding-box gate before running loop-fill topology. A boundary is marked evaluated only after that delayed check completes, so a newer GPS update can cancel and retry the timer without permanently skipping the closed loop; Stop and recovery remain idempotent correctness fallbacks. Development builds expose guarded render counters and slow-operation timing without adding production logging.

The parent map screen no longer owns a one-second elapsed timer. Walk Controls owns that small clock, inactive SQLite tail polling runs every three seconds, and it loads the session only after finding new indexed points. Hidden full-screen panels are unmounted, History uses a virtualized list, and route history is loaded with a fixed SQL scope for All, Today, Last 7 days, or Selected rather than a session-sized placeholder list.

Migration 21 adds covering indexes for coordinate/source exploration reads and mode/start/end session queries. Completion uses grouped coordinate subqueries, indexed ISO day ranges, and pre-aggregated loop/cell CTEs. Backup keeps its exclusive consistent snapshot but V5 loads, compacts, and gzip-compresses one bounded record at a time, avoiding both a monolithic JSON value and duplicate confirmed-route point storage. Startup exposes the map after database and language readiness while the coalesced background outbox drain continues concurrently; unfinished-recording detection still awaits that same drain before making a recovery decision. Direct Ionicons imports keep unrelated icon fonts out of the bundle.

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
For rendering, adjacent explored cells are unioned into contour polygons instead of being emitted as overlapping rectangles. Each connected explored island becomes one native map polygon. Enclosed contours at or below the walking fill-area cap are rendered solid, which guarantees that small missing-cell channels cannot show through a qualifying discovered frontier. When a hole is filled, nested island contours inside it are discarded because the parent surface already covers them. Oversized enclosed contours remain explicit holes and receive their own black frontier, while filled holes leave no internal outline. Geometry-derived React keys force MapKit to replace a polygon whenever its holes change, including the transition from an open surface to a newly filled enclosure. The combined saved/live surface uses a matching edge stroke to cover native polygon rasterization seams.

## Loop Fill

Closed-loop fill is a gameplay-first V1 mechanic based on global walking explored-cell enclosure.

The app first samples trusted GPS path geometry into explored cells. Rejected GPS gaps never mark cells, so they cannot become part of a loop boundary.

All directly explored walking cells are treated as the boundary, even when they came from different recordings. The renderer and persistence layer share one authoritative grid-contour extraction: each qualifying enclosed contour produces the exact same cell set for the solid light-orange surface, loop-fill storage, and completion. Nested contour cells are claimed once. The one-cell flood tolerance supplements only contours that are not already represented by the authoritative extraction.

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

Saved-path presentation is independently scoped from explored-cell surfaces. Focus on map atomically selects the History session, changes the path scope to Selected, and enables the Saved route layer; the existing map fit then frames that loaded walk. Today queries use interval overlap (ended_at > local-day-start and started_at < next-local-day-start) so a midnight-crossing session is retained without loading unrelated history.

Medal qualification deliberately shares the normal gameplay enclosure rules instead of maintaining a stricter parallel contour model. The evaluator:

- rasterizes the accepted active route during recording and evaluates again from the finalized frozen route at Stop or recovery;
- uses the same exact-contour-first, one-cell seam-tolerance fallback as normal loop fill;
- accepts the same confirmed and validated inferred route geometry after finalization, without treating already stored `loop_fill` interior cells as boundary evidence;
- requires at least 80m of walked distance, keeps the landmark anchor strictly inside rather than on the boundary, and uses the walking gameplay cap of 150,000m2;
- evaluates a newly walked loop independently, so previously mapped or previously enclosed ground cannot block the award;
- writes the evidence event and unique collected-medal row in one exclusive transaction.

The active-walk evaluator runs whenever its accepted boundary grows, updates the marker and collection immediately, and queues presentation without waiting for Stop. Finalization and recovery repeat the idempotent evaluation as safety nets. A one-time `gameplay-v2` repair checks each previously finalized recording so walks missed by the v0.4 strict evaluator can be awarded after upgrading. Once earned, a medal remains durable even if its active recording is later discarded; the acquisition event keeps its evidence while its session foreign key becomes null.

Startup resets an interrupted `presenting` state to `pending`, so every collected medal remains in the presentation queue until acknowledged. Presentation uses a bundled metallic chime, success haptic, reduced-motion-aware 3D rotation, localized description, and silent/haptic failure fallbacks. Continue measures the on-map Medal tab, flies the medal into it, and briefly pulses the destination. The collection filters in frozen album order and renders the resulting earned and locked arrays as separately labeled sections.

The Medals screen still offers an explicitly confirmed cumulative scan of saved walks for older coverage and records completion per frozen album version. The one-time v0.5 repair is narrower: it only restores awards that an individual saved recording should have earned under the live/Stop rules. Backup V5 includes acquisition events, collected state, presentation state, and retro-scan settings. The temporary converter accepts complete V4 JSON only; V1-V3 restore support has been removed.

The developer-only POI candidate service queries an allowlisted set of OpenStreetMap tags inside fixed bounds and stores candidates as `unreviewed`. Network results never mutate the frozen shipped album or become collectible without review and a release change.
## Street Completion

Street Completion V2 keeps Apple MapKit as the visible map while using cached OpenStreetMap ways as a durable analysis denominator. Progress is rebuilt only from immutable `route_snapshots`; raw GPS remains available solely to capture the one-time V1 migration baseline.

Flow:

- Fetch walkable OSM `highway` ways through the shared Overpass corridor service and split them into stable, at-most-35m local pieces.
- Build one spatial index over cached street geometry and sample each frozen confirmed or accepted inferred route at 3m intervals.
- Consider only OSM lines within 12m whose direction is compatible within 50 degrees, treating travel in either direction as valid.
- Select the nearest compatible line for each sample so parallel streets cannot both receive credit.
- Deduplicate coverage into 4m bins per stable OSM piece, persist each recording's covered-bin evidence, and union bins across recordings instead of adding repeat walks twice.
- Roll local pieces up to their parent OSM way for reached/completed street counts; the way is first completed when its loaded distance reaches 90%.
- Preserve the first 90% timestamp as audit evidence while deriving the visible completed count from current saved-route coverage, so deleting a recording also removes its contribution.

Migration 24 adds `street_completion_v1_evidence`, `street_completion_session_coverage`, `street_completion_segments`, and `street_completion_state`. Before the first V2 rebuild, the old V1 12m point-proximity result is captured as evidence only; it never becomes the V2 numerator. Existing recordings and frozen routes are not rewritten. Restore and Clear all remove this derived ledger and set it back to pending so imported recordings rebuild cleanly.

The one-time upgrade rebuild repairs historical OSM corridors asynchronously and then processes every valid frozen snapshot. Normal Stop runs the same aggregation inside deferred reconciliation; recovered finalization launches it without waiting; explicit Reprocess runs it after replacing frozen routes; deletion and restore schedule a fresh aggregate. The worker yields to the React Native event loop every four recordings and returns to pending before writing if a recording becomes active. No V2 matching, aggregation, or SQLite replacement runs in the active-walk path.

Completion waits for its full-screen opening interaction to finish, then polls the street rollup with one aggregate SQLite query while visible. It reports walked street distance, loaded street distance, percentage, reached OSM ways, and completed OSM ways. Street coverage is intentionally the locally cached network around recorded corridors rather than a full city-wide denominator. OSM access/foot restrictions and motorway/trunk exclusions match the inference safety policy.

## Zone Completion

Completion fetches nearby OSM administrative relations for country, city, and district scopes from the current GPS location. Opening the screen triggers one automatic refresh when the last successful fetch is missing or at least 30 days old; manual Refresh remains available. The last attempt, last success, failure state, and last-fetched date persist across launches.

Flow:

- assemble unordered or reversed relation ways into all closed outer rings and inner holes
- require every participating boundary fragment to form a non-degenerate closed ring for completion eligibility
- retain an incomplete relation only as a visibly labeled display bounds fallback
- cache exact zone polygons in `zones`
- count explored 15m cell centers inside the selected exact polygon and outside its holes
- reuse a denominator only when zone id, cell size, and geometry fingerprint all match
- insert the first exact 100% result into `zone_achievements` with `INSERT OR IGNORE`
- show permanent district and city achievement rollups in Completion

Fallback boundaries cannot calculate percentages, become objectives, or grant achievements. A previously earned achievement remains permanent if a later refresh changes or temporarily invalidates the current OSM geometry.

Large exact zones can intentionally show a pending denominator to avoid expensive country-scale scans on the phone. Completion augments persisted cells with the same walking area-capped enclosed contour cells used by the solid red renderer, so a qualifying visible surface and its percentage use the same numerator. While recording, the objective HUD monitors that contour topology and only recalculates after new enclosed fill cells appear; ordinary open-line cell additions do not launch a percentage scan. The closure preview merges all unique active GPS cells into the numerator, and Stop always performs a finalized refresh. Live calculations are read-only: they cannot persist a 100% achievement until finalization makes the cells durable, and the finalized refresh invalidates older preview requests before publishing. Local scans are chunked, yield to the React Native event loop, begin after the opening transition, and abort when Completion closes.

District data depends on local OSM coverage. If no valid district relation exists nearby, Completion degrades to country/city zones while any incomplete relation remains display-only.
## Street-Aware Inference

Street-aware path inference is persisted in an immutable route snapshot and is shared by route rendering, explored-cell generation, completion, and loop analysis.

The service projects suspicious GPS-gap endpoints onto the nearest point of cached OSM street segments, attaches those projected points to one graph, and searches for a plausible walking route. New suspicious gaps first make one bounded 120m corridor request only where shared topology coverage is absent or older than 30 days; failures fall back to the cache behind a five-minute retry cooldown. This avoids both a history-sized fetch during normal finalization and treating a player beside the middle of a 35m fragment as if they were at one of its endpoints.

V3 graph edges preserve exact OSM nodes, add verified ground-level geometric crossings, and join grade-compatible fragment endpoints only within 8m. Bridge, tunnel, layer, access, and foot tags prevent common overpass and private-way false joins. Endpoint-join routes are capped at medium confidence. Only plausible high- or medium-confidence routes are frozen and counted, and a snap may close its visible endpoint seam only within 12m; longer, unmatched, or low-confidence gaps never receive a straight connector.

Each inferred snapshot segment persists schema-versioned evidence: acceptance reason, endpoint and intersection join counts, maximum endpoint seam, snap distances, gap duration/distance, routed distance, source topology size, confidence, and inferred-cell contribution. History exposes the accepted/high/medium/cell totals by default and the per-bridge evidence under Technical details. Once stored, a snapshot is never changed by map movement, cache refresh, normal saves, or loop recalculation.

The explicit **Reprocess recordings** action is the only workflow allowed to replace existing historical snapshots. Before route calculation, it makes one consolidated Overpass linestring request covering the raw corridors of every saved walking recording. This repairs the incomplete cache that caused the v0.3.50 legacy-freeze regression without returning to slow per-recording downloads. The request has a 35-second client timeout, its street segments are batch-written atomically, and failure aborts the rebuild while leaving existing routes and progress untouched. One graph is then built per recording and reused for every suspicious GPS interval. Individual recording calculation failures retain their previous frozen route while the remaining recordings continue. The complete candidate includes confirmed cells, validated inferred cells, and authoritative contour fills. If its unique-cell total is lower than existing progress, both snapshots and the explored ledger remain untouched and the result reports a safety stop. Otherwise all explored cells and loop metadata are replaced in one atomic transaction. The phased progress modal is displayed over the map after full-screen panels close, and any uncaught failure produces a visible error.

Legacy confirmed-only snapshots remain unchanged until the user explicitly reprocesses them. Backup V5 is a versioned binary record stream: magic header, compressed manifest, hot/archive session records, and a footer binding the manifest and ordered block checksums. The newest 20 sessions each receive a hot record. Older sessions are grouped by UTC month and split at 20 sessions or approximately 25,000 raw points; only physical storage is consolidated, while the manifest and each block retain every original session ID, metadata row, point stream, and route snapshot. Confirmed snapshot segments use compact raw-stream-position runs, deliberately avoiding any assumption that legacy `point_index` values are unique; inferred segments retain their full geometry, confidence, and bridge evidence. Each record has compressed/raw lengths and CRC32, and the footer verifies record order, totals, backup identity, and all checksums. Export verifies its cache copy, opens the native share sheet, then requires the user to select the externally saved Files copy; only a complete re-read with the same backup ID reports success. Restore verifies before replacement, closes file-journal admission, stops native tracking, settles the in-memory queue, then reads one block at a time and batch-inserts points inside one replacement transaction. The temporary V4 converter reads a complete V4 JSON backup once, validates it without deduplication, writes V5 directly, and applies the same external verification. V1-V3 are rejected.


History coordinates Backup, V4 conversion, and Restore through one synchronous operation guard. The first tap sets visible busy state and waits for two animation frames before file or SQLite work starts; subsequent taps and conflicting data tools remain disabled until the operation's `finally` path clears the guard. This makes long compression and replacement transactions explicit without allowing concurrent exports or restores.
There is still no straight-line fallback for inferred exploration. Low-confidence, implausible, or unmatched gaps remain hidden and contribute no explored cells.
