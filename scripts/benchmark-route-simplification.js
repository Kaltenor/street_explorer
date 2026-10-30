// Pass the pre-change Git revision to compare both implementations in one process.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
require.extensions[".ts"] = (module, filename) => module._compile(compile(fs.readFileSync(filename, "utf8")), filename);
if (!process.argv[2]) throw Error("Usage: node scripts/benchmark-route-simplification.js <baseline-git-revision>");
const filename = path.resolve(__dirname, "../src/services/routeSimplification.ts");
const baseline = new Module(filename, module);
baseline.filename = filename;
baseline.paths = module.paths;
baseline._compile(compile(execFileSync("git", ["show", `${process.argv[2]}:src/services/routeSimplification.ts`], { encoding: "utf8" })), filename);
const before = baseline.exports.simplifyGpsPointsForRender;
const after = require(filename).simplifyGpsPointsForRender;
let seed = 42;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
for (let sample = 0; sample < 100; sample++) {
  const points = Array.from({ length: 300 }, (_, i) => ({ latitude: 45 + random() * 0.01, longitude: 4 + random() * 0.01, pointIndex: i }));
  for (const tolerance of [0.5, 3, 15]) assert.deepEqual(after(points, tolerance), before(points, tolerance));
}
console.log("PASS 300 ordinary-route/tolerance comparisons retain identical point objects and order");
const cases = [
  ["smooth-10k", Array.from({ length: 10000 }, (_, i) => ({ latitude: 45 + Math.sin(i / 100) * 0.0001, longitude: 4 + i * 0.000001 }))],
  ...[1000, 5000, 12000].map(n => [`zigzag-${n}`, Array.from({ length: n }, (_, i) => ({ latitude: 45 + (i % 2) * 0.0001, longitude: 4 + i * 0.000001 }))])
];
for (const [name, points] of cases) {
  const measure = simplify => {
    const samples = [];
    let retained;
    try {
      simplify(points, 1.5);
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        retained = simplify(points, 1.5).length;
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      return { medianMs: +samples[2].toFixed(2), retained };
    } catch (error) { return { error: error.name + ": " + error.message }; }
  };
  console.log(JSON.stringify({ name, before: measure(before), after: measure(after) }));
}
