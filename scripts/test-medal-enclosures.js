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
const appConfig = require("../app.json");
const mapScreenSource = fs.readFileSync(
  path.resolve(__dirname, "../src/screens/MapScreen.tsx"),
  "utf8"
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
    mapScreenSource.includes("repairMissedRecordingMedals()"),
  "live awards and one-time repair are wired into the map screen"
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
