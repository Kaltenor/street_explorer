# Project bloat audit - 0.36.5

Audited the current dirty working tree on 2026-10-29, preserving existing feature work. Version 0.36.4 -> 0.36.5; iOS/Android build 259 -> 260. No staging, commits, native builds, database migrations or published-pack regeneration.

## Scope and evidence

- Traced static TypeScript imports, exports and literal require calls from App.tsx: 103 modules before cleanup; three disconnected modules removed, 100 remain reachable. Cross-checked references in scripts and documentation before removal.
- Compared declared dependencies with application imports, Expo plugins, scripts and native compatibility notes. All direct dependencies remain necessary for runtime, tooling, plugins or documented SDK 54 peer pinning. In particular expo-asset and expo-constants must remain pinned despite little/no direct application usage.
- Inspected tracked file sizes, asset references and generation scripts. All remaining non-medal asset filenames are referenced except the two editable Photoshop sources, which are retained for authoring and excluded from EAS upload. The active cartographer source is also retained locally and excluded from upload. Published country packs and the 500 bundled France albums remain intact.
- Cross-checked exported declaration names against application and script sources. Removed 24 declarations with no callers/references, then removed newly unused supporting imports/types/constants. This is a static audit, not a proof against arbitrary external/dynamic consumers; this private application exposes no package API.

## Removed files

183 tracked files, totaling 263,060,762 bytes (250.87 MiB), removed from the checkout:

- Research downloads and caches: 155 files.
- Inactive player art: 18 files.
- Disconnected modules: 3 files.
- Research screenshots: 7 files.

The three disconnected modules were MapLegend.tsx, ModeProfilePanel.tsx and poiCandidateService.ts. Removed modeProfile translations had no remaining consumers. Legacy POI tables and all migrations stay intact for compatibility.

The savings primarily concern repository contents and build inputs, not the installed app. Git history still retains these files; this is not a history rewrite and does not shrink existing clones' .git object stores. Research data was never an application import.

## Removed unreferenced declarations

- src/components/AtlasCabinet.tsx: ATLAS_CARD_STYLE
- src/constants/appearance.ts: getActiveAppearanceMode
- src/data/medalAlbums.ts: DOWNLOADABLE_MEDAL_ALBUM_COUNT
- src/data/medalAlbums.ts: DOWNLOADABLE_MEDAL_COUNT
- src/data/medalAlbums.ts: getBundledMedalAlbumMetadata
- src/database/completionRepository.ts: deleteLoopFillDataForMode
- src/database/completionRepository.ts: saveLoopFill
- src/database/completionRepository.ts: getZoneAchievements
- src/database/medalRepository.ts: hasCompletedMedalRecordingRepair
- src/database/medalRepository.ts: markMedalRecordingRepairCompleted
- src/database/medalRepository.ts: clearAllCollectedMedals
- src/database/streetRepository.ts: deleteAllStreetSegments
- src/database/walkRepository.ts: createWalkSession
- src/database/walkRepository.ts: saveGpsPoint
- src/database/walkRepository.ts: getGpsPointCountForSession
- src/i18n.ts: AppStrings
- src/services/explorationArea.ts: buildExplorationCells
- src/services/explorationArea.ts: calculateExploredAreaSquareMeters
- src/services/explorationArea.ts: calculateNewCellsForActivePath
- src/services/loopFill.ts: analyzeLoopFill
- src/services/medalCountryPackStore.ts: isMedalCountryPackInstalled
- src/services/medalEnclosure.ts: MEDAL_MAX_ENCLOSURE_AREA_SQUARE_METERS
- src/services/streetCompletion.ts: calculateStreetCompletion
- src/services/zoneCompletion.ts: fetchNearbyOsmZones

Active recording persistence, batch writes, current exploration geometry and V2 street completion remain. Regression scripts and benchmarks were retained.

## Prevention and regeneration

- TypeScript now enforces noUnusedLocals and noUnusedParameters; unused exports still need reference auditing.
- .gitignore excludes .tmp/, .tmp-country-pack-size/ and tmp/. Existing unrelated untracked work is preserved even when ignored.
- .easignore repeats the existing Git exclusions and additionally excludes assets/*.psd and assets/player/cartographer-sheet.png. Keep both exclusion lists synchronized. Runtime PNGs and native splash remain included.
- Research caches, source downloads and screenshots are no longer versioned. [Country-pack input requirements](COUNTRY_PACKS.md#generator-inputs-after-cleanup---0365) explain explicit population inputs and network-dependent regeneration. Exact historical candidate snapshots can be retrieved from Git history.
- Germany generation requires --destatis in every environment and defaults its candidate cache to the OS temporary directory; explicit --cache remains supported.

## Validation

- PASS: baseline npm test before cleanup and full npm test after cleanup (typecheck, geometry, zones, completion, UI, player, speech, Wikipedia, medals, backup, GPX, country packs, resilience, documentation, providers and planning).
- PASS: final iOS Expo export with Hermes bytecode and 31 assets. The first final export failed to write bytecode in the sandbox temporary folder; retrying with TEMP/TMP set to a workspace scratch directory passed. No bundle error remained.
- PASS: EAS ignore-rule checks retain active assets, application configuration and both postinstall patch scripts while excluding scratch output and authoring sources. This checks patterns, not a remote EAS archive/build.
- PASS: Germany generator syntax check and git diff --check. Network-dependent pack regeneration was not run.
- Updated the player regression to validate all twenty active native frames; its obsolete assertions for sixteen inactive frames were removed.

 Physical-device checks and credentialed EAS builds are not run automatically; use [the cleanup smoke protocol](TESTING.md#cleanup-smoke-checks---0365).
