const fs = require("node:fs");
const { performance } = require("node:perf_hooks");
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

const geometry = require("../src/services/explorationArea.ts");
const { partitionExplorationCellIdsByCity } = require(
  "../src/services/countrysideExploration.ts"
);

function rectangle(width, height, step = 1) {
  const result = [];
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y += step) result.push(`${x}:${y}`);
  }
  return result;
}

const getCellCenter = geometry.explorationCellKeyToCenterCoordinate;
const lower = getCellCenter("-10:-10");
const upper = getCellCenter("3000:3000");
const cityBoundary = {
  geometry: [[
    { latitude: lower.latitude, longitude: lower.longitude },
    { latitude: lower.latitude, longitude: upper.longitude },
    { latitude: upper.latitude, longitude: upper.longitude },
    { latitude: upper.latitude, longitude: lower.longitude }
  ]],
  holes: []
};
const cases = [
  ["corridor-5k", rectangle(2500, 2)],
  ["solid-50k", rectangle(250, 200)],
  ["islands-3k", rectangle(165, 165, 3)]
];

function timed(operation) {
  const startedAt = performance.now();
  const result = operation();
  return [performance.now() - startedAt, result];
}

function median(values) {
  return values.sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

for (const [name, cellIds] of cases) {
  const partitionDurations = [];
  const contourDurations = [];
  let polygons = [];

  for (let run = 0; run < 5; run += 1) {
    const [partitionMs, partition] = timed(() =>
      partitionExplorationCellIdsByCity({
        cellIds,
        cityBoundaries: [cityBoundary],
        getCellCenter
      })
    );
    const [contourMs, result] = timed(() =>
      geometry.buildMergedExplorationPolygons(partition.cityCellIds, {
        maxFilledHoleAreaSquareMeters: 150_000
      })
    );
    partitionDurations.push(partitionMs);
    contourDurations.push(contourMs);
    polygons = result;
  }

  console.log(JSON.stringify({
    name,
    cellCount: cellIds.length,
    polygonCount: polygons.length,
    vertexCount: polygons.reduce((count, polygon) =>
      count + polygon.coordinates.length +
      polygon.holes.reduce((holeCount, hole) => holeCount + hole.length, 0), 0
    ),
    partitionMedianMs: Number(median(partitionDurations).toFixed(1)),
    contourMedianMs: Number(median(contourDurations).toFixed(1))
  }));
}

const solid = rectangle(250, 200);
const before = geometry.buildMergedExplorationPolygons(solid);
const after = geometry.buildMergedExplorationPolygons([...solid, "250:0"]);
console.log(JSON.stringify({
  name: "one-cell-growth",
  reusedKeys: after.filter((polygon) =>
    before.some((previous) => previous.id === polygon.id)
  ).length,
  polygonCount: after.length
}));
