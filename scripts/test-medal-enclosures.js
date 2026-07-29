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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

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
const beforeBoundary = new Set(completeBoundary);
beforeBoundary.delete("3:0");

const closureCandidates = medalEnclosure.findMedalCollectionCandidates({
  album: albumWithAnchor("3:3"),
  afterCellIds: completeBoundary,
  beforeCellIds: beforeBoundary,
  triggerCellIds: new Set(["3:0"])
});
assert(
  closureCandidates.length === 1 &&
    closureCandidates[0].anchorCellId === "3:3" &&
    closureCandidates[0].enclosureAreaSquareMeters === 25 * 225,
  "a trigger recording earns a medal only when it closes the anchor's exact interior"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("3:3"), afterCellIds: completeBoundary,
    beforeCellIds: beforeBoundary, triggerCellIds: new Set(["20:20"])
  }).length === 0,
  "a recording that did not contribute to the closing boundary earns nothing"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("3:3"), afterCellIds: completeBoundary,
    beforeCellIds: completeBoundary, triggerCellIds: new Set(["3:0"])
  }).length === 0,
  "an anchor that was already enclosed before the trigger does not transition again"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("0:0"), afterCellIds: completeBoundary
  }).length === 0,
  "an anchor on the occupied boundary is not treated as strictly inside"
);

assert(
  medalEnclosure.findMedalCollectionCandidates({
    album: albumWithAnchor("12:12"), afterCellIds: perimeter(25)
  }).length === 0,
  "an enclosure larger than 100000 square meters is rejected"
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
  medalEnclosure.buildTrustedDirectRouteSegments([
    { ...basePoint, accuracy: null }, { ...nearbyPoint, accuracy: 5 }
  ]).length === 0,
  "a GPS segment with missing accuracy is excluded from medal proof"
);

assert(
  medalEnclosure.buildTrustedDirectRouteSegments([
    { ...basePoint, accuracy: 5 }, { ...nearbyPoint, accuracy: 5 }
  ]).length === 1,
  "a short direct segment with trusted numeric accuracy remains eligible"
);

console.log("All medal enclosure checks passed.");
