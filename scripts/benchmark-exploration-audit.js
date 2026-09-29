// Optional baseline: git show <base>:src/services/explorationArea.ts > <file>
// node scripts/benchmark-exploration-audit.js --baseline <file>
const fs = require("fs");
const path = require("path");
const Module = require("module");
const assert = require("assert/strict");
const ts = require("typescript");

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
}
require.extensions[".ts"] = (module, filename) => {
  module._compile(compile(fs.readFileSync(filename, "utf8")), filename);
};
const filename = path.resolve(__dirname, "../src/services/explorationArea.ts");
const current = require(filename);
const baselineIndex = process.argv.indexOf("--baseline");
let baseline = null;
if (baselineIndex >= 0) {
  const baselinePath = process.argv[baselineIndex + 1];
  assert(baselinePath, "--baseline requires a TypeScript source file");
  // Resolve imports against the real source directory for both versions.
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  module._compile(compile(fs.readFileSync(baselinePath, "utf8")), filename);
  baseline = module.exports;
}

const ring = [];
for (let index = 0; index < 300; index += 1) {
  ring.push(`${index}:0`, `${index}:299`, `0:${index}`, `299:${index}`);
}
for (const [label, implementation] of [
  ...(baseline ? [["baseline", baseline]] : []), ["current", current]
]) {
  const times = [];
  for (let run = 0; run < 6; run += 1) {
    const start = performance.now();
    const groups = implementation.collectEnclosedExplorationCellGroups(ring);
    const elapsed = performance.now() - start;
    assert.equal(groups.length, 1);
    assert.equal(groups[0].length, 88804);
    if (run > 0) times.push(elapsed);
  }
  times.sort((left, right) => left - right);
  console.log(JSON.stringify({
    label, node: process.version, publicFunction: "collectEnclosedExplorationCellGroups",
    fixture: "300x300 cell perimeter", enclosedCells: 88804,
    measuredRuns: 5, warmupRuns: 1, medianMs: Number(times[2].toFixed(1))
  }));
}

if (baseline) {
  let seed = 817;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let trial = 0; trial < 100; trial += 1) {
    const cells = [];
    for (let x = -12; x < 12; x += 1) {
      for (let y = -12; y < 12; y += 1) {
        if (random() < 0.5) cells.push(`${x}:${y}`);
      }
    }
    assert.deepEqual(
      current.collectEnclosedExplorationCellGroups(cells),
      baseline.collectEnclosedExplorationCellGroups(cells),
      `Irregular-grid differential trial ${trial}`
    );
  }
  console.log("PASS 100 seeded irregular grids preserve exact enclosure groups and order");
}
