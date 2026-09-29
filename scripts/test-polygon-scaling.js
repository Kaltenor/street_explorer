const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const assert = require("node:assert/strict");
const ts = require("typescript");

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}
require.extensions[".ts"] = (module, filename) => {
  module._compile(compile(fs.readFileSync(filename, "utf8")), filename);
};
function loadBaseline(service, option) {
  const index = process.argv.indexOf(option);
  if (index < 0) return null;
  assert(process.argv[index + 1], `${option} requires a saved source file`);
  const filename = path.resolve(__dirname, `../src/services/${service}.ts`);
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  module._compile(compile(fs.readFileSync(process.argv[index + 1], "utf8")), filename);
  return module.exports;
}
const geometry = require("../src/services/explorationArea.ts");
const countryside = require("../src/services/countrysideExploration.ts");
const oldGeometry = loadBaseline("explorationArea", "--baseline");
const oldCountryside = loadBaseline("countrysideExploration", "--partition-baseline");
const benchmark = process.argv.includes("--benchmark");

function ringAreaInCells(coordinates) {
  const grid = coordinates.map(({ latitude, longitude }) => ({
    x: Math.round(6378137 * longitude * Math.PI / 180 / 15),
    y: Math.round(6378137 * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) / 15)
  }));
  return Math.abs(grid.reduce((sum, point, index) => {
    const next = grid[(index + 1) % grid.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function perimeter(size, offsetX = 0, offsetY = 0) {
  const cells = new Set();
  for (let i = 0; i < size; i += 1) {
    cells.add(`${offsetX + i}:${offsetY}`);
    cells.add(`${offsetX + i}:${offsetY + size - 1}`);
    cells.add(`${offsetX}:${offsetY + i}`);
    cells.add(`${offsetX + size - 1}:${offsetY + i}`);
  }
  return [...cells];
}
const manyRings = Array.from({ length: 1500 }, (_, index) =>
  perimeter(5, (index % 50) * 8, Math.floor(index / 50) * 8)
).flat();
for (const limit of [undefined, 150000]) {
  const options = { maxFilledHoleAreaSquareMeters: limit };
  const polygons = geometry.buildMergedExplorationPolygons(manyRings, options);
  assert.equal(polygons.length, 1500);
  assert(polygons.every((polygon) => polygon.coordinates.length === 4 &&
    polygon.holes.length === (limit === undefined ? 1 : 0)));
  if (oldGeometry) assert.deepEqual(polygons, oldGeometry.buildMergedExplorationPolygons(manyRings, options));
}
const nestedCells = [...perimeter(21, -10, -10), ...perimeter(9, -4, -4), "0:0"];
for (const limit of [undefined, 15000, 150000]) {
  const polygons = geometry.buildMergedExplorationPolygons(nestedCells, { maxFilledHoleAreaSquareMeters: limit });
  assert.equal(polygons.length, limit === 150000 ? 1 : limit === 15000 ? 2 : 3);
  if (oldGeometry) assert.deepEqual(polygons, oldGeometry.buildMergedExplorationPolygons(nestedCells, {
    maxFilledHoleAreaSquareMeters: limit
  }));
}
let seed = 1927;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let trial = 0; trial < 60; trial += 1) {
  const cells = [];
  for (let x = -10; x < 10; x += 1) {
    for (let y = -10; y < 10; y += 1) if (random() < 0.6) cells.push(`${x}:${y}`);
  }
  for (const limit of [undefined, 675]) {
    const result = geometry.buildMergedExplorationPolygons(cells, { maxFilledHoleAreaSquareMeters: limit });
    assert(result.every((polygon) => polygon.coordinates.length >= 4));
    const renderedCellArea = result.reduce((sum, polygon) => sum + ringAreaInCells(polygon.coordinates) -
      polygon.holes.reduce((holeSum, hole) => holeSum + ringAreaInCells(hole), 0), 0);
    if (limit === undefined) assert.equal(renderedCellArea, cells.length, "unfilled contours conserve occupied area");
    else assert(renderedCellArea >= cells.length, "filling holes never removes explored area");
    if (oldGeometry) assert.deepEqual(result, oldGeometry.buildMergedExplorationPolygons(cells, {
      maxFilledHoleAreaSquareMeters: limit
    }));
  }
}
console.log("PASS polygon spatial index: 1500 rings, nested islands, 60 seeded grids, exact optional baseline equality");

function circle(latitude, longitude, radius) {
  return Array.from({ length: 100 }, (_, index) => ({
    latitude: latitude + radius * Math.sin(index / 100 * 2 * Math.PI),
    longitude: longitude + radius * Math.cos(index / 100 * 2 * Math.PI)
  }));
}
const city = { geometry: [], holes: [] };
const centers = new Map();
const expected = { cityCellIds: [], countrysideCellIds: [] };
for (let index = 0; index < 100; index += 1) {
  const latitude = Math.floor(index / 10), longitude = index % 10;
  city.geometry.push(circle(latitude, longitude, 0.4));
  city.holes.push(circle(latitude, longitude, 0.1));
  for (let probe = 0; probe < 10; probe += 1) {
    const id = `${index}:${probe}`;
    const offset = probe / 10;
    centers.set(id, { latitude, longitude: longitude + offset + 0.01 });
    // Offsets .11/.21/.31 fall in this ring; .61/.71/.81 fall in the next.
    const inside = (probe >= 1 && probe <= 3) || (index % 10 < 9 && probe >= 6 && probe <= 8);
    (inside ? expected.cityCellIds : expected.countrysideCellIds).push(id);
  }
}
const partitionInput = {
  cellIds: [...centers.keys()], cityBoundaries: [city], getCellCenter: (id) => centers.get(id)
};
const partition = countryside.partitionExplorationCellIdsByCity(partitionInput);
assert.deepEqual(partition, expected);
assert.deepEqual(countryside.partitionExplorationCellIdsByCity({ ...partitionInput, cityBoundaries: [] }), {
  cityCellIds: [], countrysideCellIds: partitionInput.cellIds
});
if (oldCountryside) assert.deepEqual(partition, oldCountryside.partitionExplorationCellIdsByCity(partitionInput));
console.log("PASS city partition: 100 multipart rings with holes, overlap with next ring, empty boundaries, ordered cells");

if (benchmark) {
  function measure(name, operation) {
    operation();
    const timings = [];
    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      operation();
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    console.log(JSON.stringify({ name, node: process.version, medianMs: Number(timings[2].toFixed(1)), runs: 5, warmup: 1 }));
  }
  for (const [label, implementation] of [...(oldGeometry ? [["baseline", oldGeometry]] : []), ["current", geometry]]) {
    for (const limit of [undefined, 150000]) measure(`${label}:1500-rings:fill-${limit ?? "none"}`, () =>
      implementation.buildMergedExplorationPolygons(manyRings, { maxFilledHoleAreaSquareMeters: limit }));
  }
  for (const [label, implementation] of [...(oldCountryside ? [["baseline", oldCountryside]] : []), ["current", countryside]]) {
    measure(`${label}:partition-100-rings-1000-cells`, () => implementation.partitionExplorationCellIdsByCity(partitionInput));
  }
}
