const fs = require("fs");
const path = require("path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  module._compile(output, filename);
};

for (const relativePath of [
  "../src/database/walkRepository.ts",
  "../src/database/medalRepository.ts"
]) {
  const filename = path.resolve(__dirname, relativePath);
  require.cache[filename] = {
    exports: {}, filename, id: filename, loaded: true
  };
}

const explorationArea = require("../src/services/explorationArea.ts");
const medalEnclosure = require("../src/services/medalEnclosure.ts");
const lyonAlbum = require("../assets/medals/lyon-v1.json");
const parisAlbum = require("../assets/medals/paris-v1.json");
const villeurbanneAlbum = require("../assets/medals/villeurbanne-v1.json");
const medalAlbums = require("../src/data/medalAlbums.ts");
const franceSources = require("../assets/medals/france-top-100-sources.json");
const franceAlbumDirectory = path.resolve(__dirname, "../assets/medals/france");
const generatedFranceAlbums = fs.readdirSync(franceAlbumDirectory)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => require(path.join(franceAlbumDirectory, fileName)));
const appConfig = require("../app.json");
const mapScreenSource = fs.readFileSync(
  path.resolve(__dirname, "../src/screens/MapScreen.tsx"),
  "utf8"
);
const liveMedalEffectSource = mapScreenSource.slice(
  mapScreenSource.indexOf("const evaluation = liveMedalEvaluationRef.current"),
  mapScreenSource.indexOf("const handleCompleteMedalCelebration")
);
const medalCelebrationSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/MedalCelebration.tsx"),
  "utf8"
);
const medalCollectionSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/MedalCollectionModal.tsx"),
  "utf8"
);
const completionModalSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/CompletionModal.tsx"),
  "utf8"
);
const historyModalSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/WalkHistoryModal.tsx"),
  "utf8"
);
const walkControlsSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/WalkControls.tsx"),
  "utf8"
);
const launchOverlaySource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/LaunchLoadingOverlay.tsx"),
  "utf8"
);
const splashPath = path.resolve(__dirname, "../assets/loading-screen2.png");
const splashBytes = fs.readFileSync(splashPath);
const medalServiceSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/medalEnclosure.ts"),
  "utf8"
);
const medalRepositorySource = fs.readFileSync(
  path.resolve(__dirname, "../src/database/medalRepository.ts"),
  "utf8"
);
const databaseSource = fs.readFileSync(
  path.resolve(__dirname, "../src/database/db.ts"),
  "utf8"
);
const expeditionSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/districtExpeditions.ts"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

assert(
  appConfig.expo.splash.image === "./assets/loading-screen2.png" &&
    launchOverlaySource.includes('require("../../assets/loading-screen2.png")') &&
    splashBytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
    splashBytes.readUInt32BE(16) === 1320 &&
    splashBytes.readUInt32BE(20) === 2868,
  "the updated portrait PNG is imported as the Expo splash asset"
);
assert(
  mapScreenSource.includes("evaluateLiveMedalCollection(input)") &&
    mapScreenSource.includes("repairPendingRecordingCaches(activeMedalAlbumId)"),
  "live awards and active-city pending-recording safety checks are wired into the map screen"
);
assert(
  liveMedalEffectSource.includes("evaluation.latestBoundaryCellCount = boundaryCellCount") &&
    liveMedalEffectSource.includes(
      "evaluation.evaluatedBoundaryCellCount = input.boundaryCellIds.length"
    ) &&
    liveMedalEffectSource.indexOf(
      "evaluation.evaluatedBoundaryCellCount = input.boundaryCellIds.length"
    ) > liveMedalEffectSource.indexOf("evaluateLiveMedalCollection(input)") &&
    !liveMedalEffectSource.includes(
      "evaluation.evaluatedBoundaryCellCount = boundaryCellCount"
    ),
  "cancelled live medal checks remain retryable until an evaluation actually completes"
);
assert(
  medalCelebrationSource.includes("rotateY: spinY") &&
    medalCelebrationSource.includes("flightTarget.y - originY"),
  "the medal reveal rotates in 3D and flies to the measured Medal tab"
);
assert(
  medalCollectionSource.includes("const collectedMedals = filteredMedals.filter") &&
    medalCollectionSource.includes("const lockedMedals = filteredMedals.filter") &&
    medalCollectionSource.includes("title={text.unlockedSection}") &&
    medalCollectionSource.includes("title={text.lockedSection}"),
  "every category view renders permanent unlocked and locked medal sections"
);
assert(
  mapScreenSource.includes("function CityMedalProgress") &&
    mapScreenSource.includes("objectiveHudVisible") &&
    !mapScreenSource.includes("function LayerControls") &&
    !mapScreenSource.includes("objectiveClear"),
  "the map shows city medal progress and one objective popup toggle instead of three side controls"
);
assert(
  historyModalSource.includes("technicalVisible ?") &&
    walkControlsSource.includes("idleSummary") &&
    !completionModalSource.includes("{completionStrings.v1Rules}") &&
    [mapScreenSource, completionModalSource, historyModalSource, walkControlsSource].every(
      (source) =>
        source.includes("#f5c451") &&
        (source.includes("#071018") || source.includes("rgba(7, 16, 24"))
    ),
  "primary screens use the streamlined navy and gold layout with technical details hidden by default"
);

const localizedAlbumCopy = lyonAlbum.medals.flatMap((medal) => [
  medal.name.en,
  medal.name.fr,
  medal.description.en,
  medal.description.fr
]);
assert(
  localizedAlbumCopy.every((value) => !value.includes("?")),
  "the bundled Lyon album contains no corrupted accent placeholders"
);
assert(
  lyonAlbum.medals[0].name.en === "Fourvière Basilica" &&
    lyonAlbum.medals[0].name.fr === "Basilique Notre-Dame de Fourvière",
  "the bundled Lyon album preserves Unicode landmark names"
);
const villeurbanneLocalizedCopy = villeurbanneAlbum.medals.flatMap((medal) => [
  medal.name.en,
  medal.name.fr,
  medal.description.en,
  medal.description.fr
]);
assert(
  villeurbanneAlbum.medals.length === 14 &&
    new Set(villeurbanneAlbum.medals.map((medal) => medal.category)).size === 5 &&
    villeurbanneLocalizedCopy.every((value) => !value.includes("?")),
  "the Villeurbanne v1 album contains 14 Unicode-safe landmarks across every category"
);
assert(
  medalAlbums.getMedalAlbumIdForZone({
    id: "relation/120989",
    parentZoneId: null
  }) === villeurbanneAlbum.id &&
    medalAlbums.getMedalAlbumIdForZone({
      id: "relation/villeurbanne-district",
      parentZoneId: "relation/120989"
    }) === villeurbanneAlbum.id &&
    medalAlbums.getMedalAlbumIdForZone({
      id: "relation/120965",
      parentZoneId: null
    }) === lyonAlbum.id,
  "city and district objectives select their matching bundled medal album"
);
assert(
  mapScreenSource.includes(
    "savedMedalProgress?.album.id === activeMedalAlbumIdRef.current"
  ) &&
    mapScreenSource.includes(
      "progress?.album.id === activeMedalAlbumIdRef.current"
    ) &&
    mapScreenSource.includes(
      "medals={activeMedalProgress?.medals ?? EMPTY_MEDALS}"
    ),
  "rapid city switches cannot publish stale album progress or markers"
);
const bundledAlbums = generatedFranceAlbums.concat([
  parisAlbum,
  lyonAlbum,
  villeurbanneAlbum
]);
const albumsById = new Map(bundledAlbums.map((album) => [album.id, album]));
const top100Albums = franceSources.cities.map((city) => albumsById.get(city.albumId));
const bundledMedals = top100Albums.flatMap((album) => album.medals);
const parisArrondissements = new Set(
  parisAlbum.medals.map((medal) => medal.arrondissement)
);
assert(
  parisAlbum.version === 2 &&
    parisAlbum.medals.length === 60 &&
    parisArrondissements.size === 20 &&
    Array.from({ length: 20 }, (_, index) => index + 1).every((arrondissement) =>
      parisArrondissements.has(arrondissement)
    ) &&
    new Set(parisAlbum.medals.map((medal) => medal.category)).size === 5 &&
    parisAlbum.medals.every(
      (medal) => !/\b(?:metro|métro)\b/i.test(`${medal.name.en} ${medal.name.fr}`)
    ),
  "the expanded Paris v2 album has 60 relevant non-metro landmarks covering all 20 arrondissements and five categories"
);
assert(
  franceSources.cities.length === 100 &&
    generatedFranceAlbums.length === 97 &&
    franceSources.cities[0].cityName === "Paris" &&
    franceSources.cities[1].cityName === "Marseille" &&
    franceSources.cities[2].cityName === "Lyon" &&
    franceSources.cities[99].cityName === "Maisons-Alfort" &&
    franceSources.cities.every(
      (city, index, cities) => index === 0 || city.population <= cities[index - 1].population
    ) &&
    top100Albums.every(Boolean) &&
    top100Albums.every((album) => album.medals.length >= 5) &&
    !franceSources.cities.some((city) => /Arrondissement/.test(city.cityName)),
  "the offline France pack contains the official metropolitan top 100 as whole communes"
);
assert(
  new Set(top100Albums.map((album) => album.id)).size === 100 &&
    new Set(top100Albums.map((album) => album.cityZoneId)).size === 100 &&
  new Set(bundledMedals.map((medal) => medal.id)).size === bundledMedals.length &&
    bundledMedals.every((medal) =>
      Number.isFinite(medal.latitude) && Number.isFinite(medal.longitude)
    ),
  "all 851 bundled medals use globally unique ids and finite reviewed anchors"
);
const obviousNonLandmarkName = /^(?:rue|avenue|boulevard|route|chemin|arrêt|allée(?! couverte))\b|\bstation\b/i;
assert(
  bundledMedals.every((medal) =>
    !obviousNonLandmarkName.test(medal.name.fr) &&
    ["merimee", "museofile", "openstreetmap", "wikidata"].includes(
      medal.externalIdentity.source
    )
  ),
  "review filters exclude obvious transport and street records from the frozen rosters"
);
assert(
  medalAlbums.BUNDLED_MEDAL_ALBUM_COUNT === 100 &&
    medalAlbums.BUNDLED_MEDAL_COUNT === 851 &&
    medalAlbums.BUNDLED_MEDAL_COUNT === bundledMedals.length &&
    medalAlbums.getBundledMedalAlbum("paris-v1").cityName.fr === "Paris",
  "the manifest resolves one requested city album without an eager album array"
);
assert(
  medalServiceSource.includes("albumId: string") &&
    !medalServiceSource.includes("BUNDLED_MEDAL_ALBUMS") &&
    medalServiceSource.includes('kind: "spatial_since_id"') &&
    medalServiceSource.includes("getMedalRetroScanCursor") &&
    databaseSource.includes('applyMigration(29, "scale_city_medal_catalogue"') &&
    databaseSource.includes("walk_session_bounds") &&
    databaseSource.includes("INNER JOIN walk_sessions") &&
    databaseSource.includes("ON walk_sessions.id = gps_points.session_id") &&
    !databaseSource.includes("seedBundledMedalAlbums"),
  "live and historical checks stay active-city scoped, spatial, incremental, lazily seeded, and upgrade-safe with orphan GPS rows"
);
assert(
  medalRepositorySource.includes("getUncollectedMedalsInBounds") &&
    medalRepositorySource.includes("getCollectedMedalsSinceInBounds") &&
    expeditionSource.includes("getMedalAlbumIdForZone(district)") &&
    !expeditionSource.includes("getAllMedalAlbumProgress"),
  "district expedition medal checks use direct indexed active-city queries"
);

function perimeter(size) {
  const cells = new Set();

  for (let index = 0; index < size; index += 1) {
    cells.add(index + ":0");
    cells.add(index + ":" + (size - 1));
    cells.add("0:" + index);
    cells.add(size - 1 + ":" + index);
  }

  return cells;
}

function albumWithAnchor(cellId) {
  const coordinate = explorationArea.explorationCellKeyToCenterCoordinate(cellId);

  return {
    id: "test-album", cityId: "test-city",
    cityZoneId: "relation/test-city",
    cityName: { en: "Test", fr: "Test" }, version: 1,
    publishedAt: "2026-07-29", sourceAttribution: "test",
    medals: [{
      id: "test-medal", category: "history",
      name: { en: "Test medal", fr: "Test medal" },
      description: { en: "Test", fr: "Test" },
      latitude: coordinate.latitude, longitude: coordinate.longitude,
      externalIdentity: { source: "openstreetmap", type: "node", id: 1 }
    }]
  };
}

const completeBoundary = perimeter(7);
const tolerantBoundary = new Set(completeBoundary);
tolerantBoundary.delete("3:0");

const closureCandidates = medalEnclosure.findMedalCollectionCandidates({
  album: albumWithAnchor("3:3"),
  boundaryCellIds: completeBoundary,
  walkedDistanceMeters: 80
});
assert(
  closureCandidates.length === 1 &&
    closureCandidates[0].anchorCellId === "3:3" &&
    closureCandidates[0].enclosureAreaSquareMeters === 25 * 225,
  "a gameplay loop earns the medal whose anchor is inside"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("3:3"),
    boundaryCellIds: tolerantBoundary,
    walkedDistanceMeters: 80
  }).length === 1,
  "medal closure uses the normal one-cell gameplay tolerance"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("3:3"),
    boundaryCellIds: completeBoundary,
    walkedDistanceMeters: 79
  }).length === 0,
  "a gameplay loop shorter than 80 meters earns nothing"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("0:0"),
    boundaryCellIds: completeBoundary,
    walkedDistanceMeters: 80
  }).length === 0,
  "an anchor on the occupied boundary is not treated as inside"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("12:12"),
    boundaryCellIds: perimeter(25),
    walkedDistanceMeters: 80
  }).length === 1,
  "medals accept the normal gameplay area cap above the old 100000 square meter limit"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("15:15"),
    boundaryCellIds: perimeter(30),
    walkedDistanceMeters: 80
  }).length === 0,
  "an enclosure larger than the normal 150000 square meter gameplay cap is rejected"
);

const basePoint = {
  latitude: 45.75, longitude: 4.8, pointIndex: 0,
  timestamp: "2026-07-29T10:00:00.000Z"
};
const nearbyPoint = {
  ...basePoint, longitude: 4.80005, pointIndex: 1,
  timestamp: "2026-07-29T10:00:02.000Z"
};

assert(
  medalEnclosure.buildGameplayDirectRouteSegments([
    { ...basePoint, accuracy: null }, { ...nearbyPoint, accuracy: 5 }
  ]).length === 1,
  "medal evidence accepts the same missing-accuracy points as normal gameplay"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("3:3"),
    boundaryCellIds: completeBoundary,
    walkedDistanceMeters: 80
  }).length === 1,
  "a newly walked loop stays eligible even when the area was mapped previously"
);

console.log("All medal enclosure checks passed.");
