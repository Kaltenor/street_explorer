const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { performance } = require("node:perf_hooks");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const { prepareZoneContainment } = require("../src/services/zoneContainment.ts");
const { EXACT_ZONE_BOUNDARY_SOURCE } = require("../src/services/zoneBoundaryPolicy.ts");
let saved = null, reads = 0, revision = 1, totalReads = 0;
const repository = {
  getZoneCompletionSnapshot: async () => saved,
  getExplorationRevision: async () => revision,
  getExploredCellRecordsWithinBounds: async () => { reads++; return []; },
  getExploredCellRecords: async () => { reads++; return []; },
  getZoneAchievement: async () => null,
  getCachedZoneTotal: async () => { totalReads++; return null; },
  saveCachedZoneTotal: async () => {},
  saveZoneCompletionSnapshot: async snapshot => { saved = snapshot; }
};
const filename = path.resolve(__dirname, "../src/services/zoneCompletion.ts");
function load(source) {
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = module.paths;
  const original = Module._load;
  Module._load = function(request, parent) {
    if (parent === instance && request === "../database/completionRepository") return repository;
    if (parent === instance && request === "../database/forbiddenZoneRepository") return { getForbiddenCellKeysWithinBounds: async () => [] };
    return original.apply(this, arguments);
  };
  try { instance._compile(ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename); }
  finally { Module._load = original; }
  return instance.exports;
}
const completion = load(fs.readFileSync(filename, "utf8"));
const ring = (cx, cy, radius, count) => Array.from({ length: count }, (_, i) => {
  const angle = i / count * Math.PI * 2, r = radius * (1 + 0.12 * Math.sin(angle * 7));
  return { longitude: cx + r * Math.cos(angle), latitude: cy + r * Math.sin(angle) };
});
const zone = { id: "test", type: "city", name: "Test", source: EXACT_ZONE_BOUNDARY_SOURCE,
  geometry: [ring(4, 45, 0.01, 1400), ring(4.015, 45, 0.003, 90)],
  holes: [ring(4, 45, 0.002, 100)], fetchedAt: "2026-01-01", adminLevel: 8 };
async function main() {
  const contains = prepareZoneContainment(zone);
  const points = [];
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) points.push({
    latitude: 44.987 + y * 0.00014, longitude: 3.987 + x * 0.00017
  });
  points.push(...zone.geometry.flat(), ...zone.holes.flat());
  for (const point of points) assert.equal(contains(point), completion.isPointInsideZone(point, zone), "exact parity on grid and vertex ties");
  for (const geometry of [[], [[{ latitude: 0, longitude: 0 }]], [[{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }]],
    [[{latitude:0,longitude:0},{latitude:1,longitude:1},{latitude:0,longitude:1},{latitude:1,longitude:0}]]]) {
    const shape = { geometry, holes: [] }; const test = prepareZoneContainment(shape);
    for (let y = -0.1; y <= 1.1; y += 0.05) for (let x = -0.1; x <= 1.1; x += 0.05) {
      const point = { latitude: y, longitude: x }; assert.equal(test(point), completion.isPointInsideZone(point, shape));
    }
  }
  // Compare scanline counts against exhaustive original tests, including overlapping
  // outer pieces, overlapping holes, self crossings, negative coordinates and ties.
  const shapes = [zone,
    { geometry: [ring(0, 0, 1, 37), ring(0.7, 0, 1, 29)], holes: [ring(0, 0, 0.4, 19), ring(0.2, 0, 0.4, 17)] },
    { geometry: [[{latitude:0,longitude:0},{latitude:1,longitude:1},{latitude:0,longitude:1},{latitude:1,longitude:0}]], holes: [] },
    { geometry: [[{latitude:0,longitude:0},{latitude:0,longitude:1},{latitude:1,longitude:1},{latitude:1,longitude:0}]], holes: [] }
  ];
  for (const shape of shapes) {
    const index = prepareZoneContainment(shape);
    for (let row = -100; row <= 100; row++) {
      const latitude = row * 0.02;
      let expected = 0;
      for (let x = -100; x <= 100; x++) if (completion.isPointInsideZone({ latitude, longitude: x * 0.02 }, shape)) expected++;
      assert.equal(index.countRow(latitude, -100, 100, x => x * 0.02), expected, "row ranges preserve exact union-minus-holes counts");
    }
  }
  // The previous 350k bounding-box-cell cutoff silently left this city pending.
  const largeZone = { ...zone, id: "large-city", geometry: [ring(4, 45, 0.05, 1000)], holes: [] };
  const largeResult = await completion.calculateZoneCompletionStats(largeZone, [], undefined, { persistAchievement: false });
  assert.equal(largeResult.completionStatus, "available");
  assert(largeResult.totalZoneCells > 350000);
  assert.equal(largeResult.completionPercent, 0);
  console.log(`PASS large city returns ${largeResult.totalZoneCells} cells and 0% instead of pending`);
  const first = await completion.calculateZoneCompletionSnapshot(zone, "walk", revision);
  const firstReads = reads, firstTotals = totalReads;
  assert.equal(await completion.calculateZoneCompletionSnapshot(zone, "walk", revision), first);
  assert.equal(reads, firstReads); assert.equal(totalReads, firstTotals, "warm selection performs no cell scans");
  revision++; await completion.calculateZoneCompletionSnapshot(zone, "walk", revision); assert.equal(reads, firstReads + 1);
  await completion.calculateZoneCompletionSnapshot({ ...zone, holes: [] }, "walk", revision); assert.equal(reads, firstReads + 2);
  await completion.calculateZoneCompletionSnapshot(zone, "bike", revision); assert.equal(reads, firstReads + 3);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(completion.calculateZoneCompletionSnapshot(zone, "walk", revision, controller.signal), /cancelled/);
  if (process.argv.includes("--benchmark")) {
    for (const [label, predicate] of [["original", p => completion.isPointInsideZone(p, zone)], ["indexed", prepareZoneContainment(zone)]]) {
      let count = 0; const start = performance.now(); for (const point of points) if (predicate(point)) count++;
      console.log(JSON.stringify({ label, points: points.length, milliseconds: +(performance.now() - start).toFixed(1), inside: count }));
    }
    const baselinePath = process.argv[process.argv.indexOf("--benchmark") + 1];
    if (baselinePath) {
      const baseline = load(fs.readFileSync(baselinePath, "utf8"));
      let expected;
      for (const [label, service] of [["baseline", baseline], ["indexed", completion]]) {
        const start = performance.now(); const result = await service.calculateZoneCompletionStats(zone, [], undefined, { persistAchievement: false });
        if (expected) assert.deepEqual(result, expected); else expected = result;
        console.log(JSON.stringify({ label, coldStatsMs: +(performance.now() - start).toFixed(1), totalCells: result.totalZoneCells }));
      }
    }
  }
  console.log("PASS indexed city containment matches original grid/vertices/holes/degenerate rings; snapshot reuse invalidates on revision, geometry and mode; cancellation preserved");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
