const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const ts = require("typescript");
const zlib = require("zlib");

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
  "../src/database/medalRepository.ts",
  "../src/services/medalCountryPackStore.ts"
]) {
  const filename = path.resolve(__dirname, relativePath);
  require.cache[filename] = {
    exports: {}, filename, id: filename, loaded: true
  };
}

require.cache[path.resolve(__dirname, "../src/services/medalCountryPackStore.ts")].exports = {
  getMedalAlbumDefinition: async () => null
};

const explorationArea = require("../src/services/explorationArea.ts");
const medalEnclosure = require("../src/services/medalEnclosure.ts");
const lyonAlbum = require("../assets/medals/lyon-v1.json");
const parisAlbum = require("../assets/medals/paris-v1.json");
const villeurbanneAlbum = require("../assets/medals/villeurbanne-v1.json");
const medalAlbums = require("../src/data/medalAlbums.ts");
const downloadableManifest = require(
  "../src/data/generated/downloadableMedalCountryPackManifest.ts"
);
const sha256 = require("../src/services/sha256.ts");
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
const explorationMapSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/ExplorationMap.tsx"),
  "utf8"
);
const liveMedalEffectSource = mapScreenSource.slice(
  mapScreenSource.indexOf("const evaluation = liveMedalEvaluationRef.current"),
  mapScreenSource.indexOf("const handleCompleteMedalCelebration")
);
const coreSavedDataHydrationSource = mapScreenSource.slice(
  mapScreenSource.indexOf('"map.saved-data-queries"'),
  mapScreenSource.indexOf('"map.saved-data-queries"') + 800
);
const medalCelebrationSource = fs.readFileSync(
  path.resolve(__dirname, "../src/components/MedalCelebration.tsx"),
  "utf8"
);
const medalChimeBytes = fs.readFileSync(
  path.resolve(__dirname, "../assets/sounds/medal-chime.wav")
);
const medalChimeGeneratorSource = fs.readFileSync(
  path.resolve(__dirname, "../scripts/generate-medal-chime.js"),
  "utf8"
);
const soundAssetReadmeSource = fs.readFileSync(
  path.resolve(__dirname, "../assets/sounds/README.md"),
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
const appSource = fs.readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf8"
);
const i18nSource = fs.readFileSync(
  path.resolve(__dirname, "../src/i18n.ts"),
  "utf8"
);
const splashPath = path.resolve(__dirname, "../assets/loading-screen3.jpg");
const splashBytes = fs.readFileSync(splashPath);
const nativeSplashPath = path.resolve(
  __dirname,
  "../assets/mapbound-native-splash.png"
);
const nativeSplashBytes = fs.readFileSync(nativeSplashPath);
const splashPluginEntry = appConfig.expo.plugins.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
);
const nativeSplashConfig = splashPluginEntry?.[1];
const legacyLaunchAssetPaths = [
  "loading-screen.png",
  "loading-screen2.png",
  "splash.png",
  "transplogo.png"
].map((fileName) => path.resolve(__dirname, "../assets", fileName));
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
const countryPackStoreSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/medalCountryPackStore.ts"),
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

function readJpegDimensions(bytes) {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const segmentLength = bytes.readUInt16BE(offset + 2);

    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readPngDimensions(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return null;
  }

  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16)
  };
}

const splashDimensions = readJpegDimensions(splashBytes);
const nativeSplashDimensions = readPngDimensions(nativeSplashBytes);

assert(
  appConfig.expo.splash === undefined &&
    nativeSplashConfig?.image === "./assets/mapbound-native-splash.png" &&
    nativeSplashConfig?.dark?.image === "./assets/mapbound-native-splash.png" &&
    nativeSplashConfig?.backgroundColor === "#02060a" &&
    nativeSplashConfig?.dark?.backgroundColor === "#02060a" &&
    nativeSplashConfig?.resizeMode === "contain" &&
    nativeSplashConfig?.enableFullScreenImage_legacy === true &&
    nativeSplashDimensions?.width === 1320 &&
    nativeSplashDimensions?.height === 2868 &&
    launchOverlaySource.includes('require("../../assets/loading-screen3.jpg")') &&
    splashBytes.subarray(0, 2).toString("hex") === "ffd8" &&
    splashDimensions?.width === 1320 &&
    splashDimensions?.height === 2868 &&
    launchOverlaySource.includes("strings.launch.taglineWalk") &&
    launchOverlaySource.includes("strings.launch.taglineExplore") &&
    launchOverlaySource.includes("strings.launch.taglineReveal") &&
    launchOverlaySource.includes('left: "31%"') &&
    launchOverlaySource.includes('right: "5%"') &&
    launchOverlaySource.includes('top: "17%"') &&
    launchOverlaySource.includes('resizeMode="contain"') &&
    launchOverlaySource.includes('letterSpacing: 1.1') &&
    launchOverlaySource.includes("numberOfLines={1}") &&
    launchOverlaySource.includes("windowWidth * 0.028") &&
    launchOverlaySource.includes('color: "#67c8c2"') &&
    launchOverlaySource.includes('color: "#f5c451"') &&
    launchOverlaySource.includes('color: "#f3e5bd"') &&
    i18nSource.includes('taglineWalk: "Walk."') &&
    i18nSource.includes('taglineWalk: "Marchez."'),
  "the explicit native Mapbound splash and localized React launch layer are wired"
);
assert(
  legacyLaunchAssetPaths.every((assetPath) => !fs.existsSync(assetPath)),
  "legacy Street Explorer launch and logo bitmaps are absent from the bundle"
);
assert(
  launchOverlaySource.includes("BACKGROUND_HOLD_DURATION_MS = 1000") &&
    launchOverlaySource.includes("TAGLINE_REVEAL_DURATION_MS = 1050") &&
    launchOverlaySource.includes("START_PROMPT_DELAY_MS = 500") &&
    launchOverlaySource.includes("SPLASH_FADE_DURATION_MS = 800") &&
    launchOverlaySource.includes("LAUNCH_SEQUENCE_STARTED_AT_MS") &&
    launchOverlaySource.includes("globalThis.performance?.timeOrigin") &&
    launchOverlaySource.includes("onLoad={() => setBackgroundLoaded(true)}") &&
    launchOverlaySource.includes("BACKGROUND_HOLD_DURATION_MS - elapsedLaunchTimeMs") &&
    launchOverlaySource.includes("remainingHoldTimeMs === 0") &&
    launchOverlaySource.includes("setBackgroundHoldComplete(true)") &&
    launchOverlaySource.includes("if (!backgroundHoldComplete)") &&
    launchOverlaySource.includes("taglineProgress") &&
    launchOverlaySource.includes("duration: TAGLINE_REVEAL_DURATION_MS") &&
    launchOverlaySource.includes("toValue: 1") &&
    launchOverlaySource.includes("useNativeDriver: true") &&
    (launchOverlaySource.match(/<Animated\.Text/g) ?? []).length === 3 &&
    launchOverlaySource.includes("getTaglineRevealStyle(taglineProgress, 0, 0.28)") &&
    launchOverlaySource.includes("getTaglineRevealStyle(taglineProgress, 0.25, 0.58)") &&
    launchOverlaySource.includes("getTaglineRevealStyle(taglineProgress, 0.55, 0.92)") &&
    !launchOverlaySource.includes("Array.from(fullTagline).map") &&
    !launchOverlaySource.includes("setInterval(() =>") &&
    launchOverlaySource.includes("setStartPromptVisible(true)") &&
    launchOverlaySource.includes("Animated.timing(footerOpacity") &&
    launchOverlaySource.includes("Animated.loop(") &&
    launchOverlaySource.includes("startRequested ? (") &&
    appSource.includes("<LaunchLoadingOverlay") &&
    appSource.includes("isReady={isAppContentReady && isMapLaunchReady}") &&
    appSource.includes("onLaunchReadyChange={setIsMapLaunchReady}") &&
    !mapScreenSource.includes("<LaunchLoadingOverlay") &&
    mapScreenSource.includes("onLaunchReadyChange(isLaunchReady)") &&
    launchOverlaySource.includes("if (isReady) {") &&
    launchOverlaySource.includes("if (startRequested && isReady)") &&
    launchOverlaySource.includes("Animated.timing(splashOpacity") &&
    launchOverlaySource.includes("duration: SPLASH_FADE_DURATION_MS") &&
    launchOverlaySource.includes("onStartRef.current()") &&
    launchOverlaySource.includes("useReducedMotionPreference()"),
  "the in-app splash sequences background, tagline, start prompt, post-press loading, and fade"
);
assert(
  launchOverlaySource.includes("fontSize: 6") &&
    launchOverlaySource.includes("position: \"absolute\"") &&
    launchOverlaySource.includes("right: 10") &&
    launchOverlaySource.includes("Math.max(safeAreaInsets.bottom, 8)") &&
    launchOverlaySource.indexOf("v{APP_VERSION}") >
      launchOverlaySource.indexOf("</Animated.View>"),
  "the half-size version label is independent in the safe bottom-right corner"
);
assert(
    mapScreenSource.includes("evaluateLiveMedalCollection(input)") &&
    mapScreenSource.includes("repairPendingRecordingCaches()") &&
    liveMedalEffectSource.includes("activeBoundaryCellCount < 1") &&
    liveMedalEffectSource.includes("validatedSurfaceCellIds: activeClosureFillCellIds") &&
    !liveMedalEffectSource.includes("MEDAL_MIN_BOUNDARY_LENGTH_METERS"),
  "live direct-cell and validated-surface awards plus active-city pending-recording safety checks are wired into the map screen"
);
assert(
  liveMedalEffectSource.includes("evaluation.latestBoundaryCellCount = boundaryCellCount") &&
    liveMedalEffectSource.includes(
      "evaluation.evaluatedBoundaryCellCount = boundaryCellCount"
    ) &&
    liveMedalEffectSource.indexOf(
      "evaluation.evaluatedBoundaryCellCount = boundaryCellCount"
    ) > liveMedalEffectSource.indexOf("evaluateLiveMedalCollection(input)") &&
    !liveMedalEffectSource.includes(
      "evaluation.evaluatedBoundaryCellCount = input.boundaryCellIds.length"
    ),
  "cancelled live medal checks remain retryable until an evaluation actually completes"
);
assert(
  medalCelebrationSource.includes("rotateY: spinY") &&
    medalCelebrationSource.includes("flightTarget.y - originY"),
  "the medal reveal rotates in 3D and flies to the measured Medal tab"
);
const medalChimeChannels = medalChimeBytes.readUInt16LE(22);
const medalChimeSampleRate = medalChimeBytes.readUInt32LE(24);
const medalChimeBitsPerSample = medalChimeBytes.readUInt16LE(34);
const medalChimeDataBytes = medalChimeBytes.readUInt32LE(40);
const medalChimeDurationSeconds =
  medalChimeDataBytes /
  (medalChimeSampleRate * medalChimeChannels * (medalChimeBitsPerSample / 8));
assert(
  medalCelebrationSource.includes('require("../../assets/sounds/medal-chime.wav")') &&
    medalChimeBytes.toString("ascii", 0, 4) === "RIFF" &&
    medalChimeBytes.toString("ascii", 8, 12) === "WAVE" &&
    medalChimeChannels === 2 &&
    medalChimeSampleRate === 44100 &&
    medalChimeBitsPerSample === 16 &&
    Math.abs(medalChimeDurationSeconds - 2) < 0.001 &&
    medalChimeBytes.length > 300000 &&
    medalChimeGeneratorSource.includes("addBrassNote") &&
    medalChimeGeneratorSource.includes("addTimpani") &&
    medalChimeGeneratorSource.includes("addBell") &&
    medalChimeGeneratorSource.includes("Creative Commons Zero 1.0") &&
    soundAssetReadmeSource.includes("medal-chime.wav") &&
    soundAssetReadmeSource.includes("public-domain dedication") &&
    soundAssetReadmeSource.includes("no third-party samples or melodies"),
  "medal unlocks use the two-second stereo CC0 orchestral reward cue"
);
assert(
  medalCollectionSource.includes("const collectedMedals = filteredMedals.filter") &&
    medalCollectionSource.includes("const lockedMedals = filteredMedals.filter") &&
    medalCollectionSource.includes("title={text.unlockedSection}") &&
    medalCollectionSource.includes("title={text.lockedSection}"),
  "every active-city district view renders permanent unlocked and locked medal sections"
);
assert(
  explorationMapSource.includes("description={medal.isCollected ? undefined : lockedLabel}") &&
    explorationMapSource.includes("medal.isCollected && onMedalPress") &&
    mapScreenSource.includes("if (!medal.isCollected)") &&
    mapScreenSource.includes('lockedMedalLabel={language === "fr" ? "Verrouillée" : "Locked"}'),
  "locked map medals show a localized locked callout without opening Medals"
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
    "medalData.savedMedalProgress?.album.id === activeMedalAlbumIdRef.current"
  ) &&
    mapScreenSource.includes(
      "progress?.album.id === activeMedalAlbumIdRef.current"
    ) &&
    mapScreenSource.includes(
      "const activeMedals = activeMedalProgress?.medals ?? EMPTY_MEDALS"
    ) &&
    mapScreenSource.includes(
      "medals={visibleMapMedals}"
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
const lyonExpansionDistricts = [3, 4, 6, 7, 8, 9];
const lyonExpandedMedals = lyonAlbum.medals.filter((medal) =>
  lyonExpansionDistricts.includes(medal.arrondissement)
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
  lyonAlbum.version === 2 &&
    lyonAlbum.medals.length === 44 &&
    lyonExpandedMedals.length === 24 &&
    lyonExpansionDistricts.every(
      (arrondissement) =>
        lyonExpandedMedals.filter((medal) => medal.arrondissement === arrondissement)
          .length === 4
    ) &&
    new Set(lyonExpandedMedals.map((medal) => medal.category)).size === 5,
  "the expanded Lyon v2 album adds four landmarks in each requested outer district and retains all five categories"
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
  "all 875 bundled medals use globally unique ids and finite reviewed anchors"
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
    medalAlbums.BUNDLED_MEDAL_COUNT === 875 &&
    medalAlbums.BUNDLED_MEDAL_COUNT === bundledMedals.length &&
    medalAlbums.getAllBundledMedalAlbums().length === 100 &&
    medalAlbums.getBundledMedalAlbum("paris-v1").cityName.fr === "Paris",
  "the manifest resolves one requested city album and the launch scan can load all bundled albums"
);

const netherlandsDescriptor = downloadableManifest.DOWNLOADABLE_MEDAL_COUNTRY_PACKS.find(
  (pack) => pack.countryCode === "nl"
);
const netherlandsPackPath = path.resolve(
  __dirname,
  "../country-packs/v1/nl-v1.json.gz"
);
const netherlandsCompressed = fs.readFileSync(netherlandsPackPath);
const netherlandsPack = JSON.parse(zlib.gunzipSync(netherlandsCompressed));
const netherlandsQuality = require("../country-packs/v1/nl-v1-quality.json");
const curatedDutchCities = new Set(
  netherlandsQuality.cities
    .filter((city) => city.curated)
    .map((city) => city.cityName.nl)
);
assert(
  netherlandsDescriptor &&
  netherlandsDescriptor.countryCode === "nl" &&
    netherlandsDescriptor.albums.length === 58 &&
    netherlandsDescriptor.medalCount === 492 &&
    netherlandsDescriptor.compressedBytes === netherlandsCompressed.length &&
    netherlandsDescriptor.uncompressedBytes === zlib.gunzipSync(netherlandsCompressed).length &&
    netherlandsDescriptor.sha256 === crypto.createHash("sha256").update(netherlandsCompressed).digest("hex") &&
    netherlandsPack.albums.length === 58 &&
    netherlandsQuality.pilot.cityCount === 30 &&
    netherlandsQuality.expansion.populationCoverage >= 0.5 &&
    ["Amsterdam", "Rotterdam", "Maastricht"].every((city) => curatedDutchCities.has(city)),
  "the measured Dutch pilot expands to a checksum-pinned 58-city downloadable pack with three curated rosters"
);
assert(
  netherlandsPack.albums.every(
    (album) =>
      album.countryCode === "nl" &&
      album.localLanguage === "nl" &&
      album.medals.length >= 5 &&
      album.medals.every(
        (medal) =>
          medal.name.en && medal.name.fr && medal.name.nl &&
          medal.description.en && medal.description.fr && medal.description.nl &&
          ["dutch-rce", "wikidata"].includes(medal.externalIdentity.source)
      )
  ) &&
    new Set(netherlandsPack.albums.flatMap((album) => album.medals.map((medal) => medal.id))).size === 492 &&
    medalAlbums.getMedalAlbumIdForZone({ id: "relation/47811" }) === "nl-amsterdam",
  "Dutch country-pack albums retain local-language copy, stable zone resolution, source provenance, and globally unique medals"
);
assert(
  sha256.sha256Hex(Buffer.from("abc")) ===
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" &&
    countryPackStoreSource.includes("File.downloadFileAsync") &&
    countryPackStoreSource.includes("sha256Hex(compressed)") &&
    countryPackStoreSource.includes("temporaryFile.rename") &&
    countryPackStoreSource.includes("Paths.document") &&
    countryPackStoreSource.includes("removeObsoleteCountryPackFiles") &&
    countryPackStoreSource.includes("failedPackLoads.set(operationKey, error)") &&
    countryPackStoreSource.includes("resetMedalCountryPackFailure"),
  "country-pack downloads use persistent atomic installation and a verified SHA-256 payload"
);
assert(
    mapScreenSource.includes('type MedalPackLoadState = "idle" | "loading" | "ready" | "unavailable"') &&
    mapScreenSource.includes("const medalData = await loadMedalData(") &&
    mapScreenSource.indexOf("const medalData = await loadMedalData(") >
      mapScreenSource.indexOf('"map.saved-data-queries"') &&
    mapScreenSource.includes('medalPackLoadState === "unavailable"') &&
    mapScreenSource.includes("resetMedalCountryPackFailure(activeMedalAlbumId)") &&
    mapScreenSource.includes("existingOperation?.key === operationKey") &&
    mapScreenSource.includes('console.warn("Failed to retry medal country pack"') &&
    medalRepositorySource.includes("ensureMedalAlbumSeeded") &&
    medalRepositorySource.includes("continue;") &&
    coreSavedDataHydrationSource.includes("getTodayNewExploredCellKeys(activityMode)"),
  "downloadable medal loading is retryable and cannot block the core saved-map hydration path"
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
  "live and historical recording checks stay spatial, incremental, lazily seeded, and upgrade-safe with orphan GPS rows"
);
assert(
  medalServiceSource.includes("awardMedalsInDiscoveredCells") &&
    medalServiceSource.includes("findDiscoveredCellMedalCandidates") &&
    medalServiceSource.includes("collectFillableEnclosedExplorationCellIds") &&
    medalServiceSource.includes('reason: "discovered_area"') &&
    medalServiceSource.includes("for (const album of albums)") &&
    countryPackStoreSource.includes("getLocallyAvailableMedalAlbumDefinitions") &&
    countryPackStoreSource.includes("if (!installedFile.exists)") &&
    mapScreenSource.includes("discoveredMedalAwardOperationRef") &&
    mapScreenSource.includes("getExplorationRevision(activityMode)") &&
    mapScreenSource.includes("validatedSurfaceCellIds: activeClosureFillCellIds") &&
    mapScreenSource.includes("the next refresh will retry") &&
    mapScreenSource.includes("awardMedalsInDiscoveredCells(discoveredCellIds)"),
  "launch and live checks award the validated exploration surface, serialize album writes, and retry changed or failed exploration revisions"
);
assert(
  medalRepositorySource.includes("getUncollectedMedalsInBounds") &&
    medalRepositorySource.includes("getCollectedMedalsSinceInBounds") &&
    expeditionSource.includes("getMedalAlbumIdForZone(district)") &&
    !expeditionSource.includes("getAllMedalAlbumProgress"),
  "district expedition medal checks use direct indexed active-city queries"
);
assert(
  medalRepositorySource.includes("getCollectedMedalCities") &&
    medalRepositorySource.includes("JOIN medal_albums ON medal_albums.id = collected_medals.album_id") &&
    medalCollectionSource.includes('type DistrictFilter = "all" | string') &&
    medalCollectionSource.includes('type MedalScope = "city" | "allCities"') &&
    medalCollectionSource.includes("buildDistrictOptions") &&
    medalCollectionSource.includes("zones.length > 0") &&
    medalCollectionSource.includes("Array.from({ length: highestNumber }") &&
    medalCollectionSource.includes("isPointInsideZone") &&
    mapScreenSource.includes("districtZones={visibleMapBoundaryContext.districts}") &&
    medalCollectionSource.includes("sortedCollectedCities.map"),
  "Medals lists every available city district and keeps an offline grouped All Cities collection"
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

const validatedSurfaceCellIds = new Set(
  explorationArea.collectFillableEnclosedExplorationCellIds(
    [...completeBoundary],
    150000
  )
);
assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("3:3"),
    boundaryCellIds: completeBoundary,
    validatedSurfaceCellIds,
    walkedDistanceMeters: 0
  }).length === 1,
  "a medal contained by the validated rendered surface unlocks even when its anchor cell was not walked"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("0:0"),
    boundaryCellIds: completeBoundary,
    walkedDistanceMeters: 80
  }).length === 1,
  "a medal anchored on an already discovered boundary cell is awarded"
);

const discoveredCellCandidates = medalEnclosure.findMedalCollectionCandidates({
  album: albumWithAnchor("3:3"),
  boundaryCellIds: new Set(["3:3"]),
  walkedDistanceMeters: 0
});
assert(
  discoveredCellCandidates.length === 1 &&
    discoveredCellCandidates[0].enclosureAreaSquareMeters === 225 &&
    discoveredCellCandidates[0].enclosureId === "discovered-cell-v1:3:3",
  "a medal in any discovered tile is eligible without an enclosure or minimum-distance loop"
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
