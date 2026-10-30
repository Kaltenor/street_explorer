const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename
);
const { simplifyGpsPointsForRender: simplify } = require("../src/services/routeSimplification.ts");
const point = (latitude, longitude, pointIndex = 0) => ({ latitude, longitude, pointIndex,
  accuracy: 5, timestamp: "2026-10-07T00:00:00.000Z" });

assert.deepEqual(simplify([], 1), []);
const straight = Array.from({ length: 1000 }, (_, i) => point(45, 4 + i * 0.00001, i));
assert.deepEqual(simplify(straight, 1), [straight[0], straight.at(-1)]);
assert.equal(simplify(straight, 0), straight);
const closed = [point(45, 4), point(45.001, 4), point(45, 4)];
assert.deepEqual(simplify(closed, 1), closed);
const corner = [point(0, 0), point(0.001, 0), point(0.001, 0.001)];
assert.deepEqual(simplify(corner, 10), corner);

// The intermediate point is 11.132 m off a short segment across the date line.
const crossing = [point(0, 179.999), point(0.0001, -180), point(0, -179.999)];
assert.deepEqual(simplify(crossing, 15), [crossing[0], crossing[2]]);
assert.deepEqual(simplify(crossing, 10), crossing);
assert.deepEqual(simplify([...crossing].reverse(), 15), [crossing[2], crossing[0]]);

// This unbalanced input overflowed the recursive implementation at 5,000 points.
const zigzag = Array.from({ length: 12000 }, (_, i) => point(45 + (i % 2) * 0.0001, 4 + i * 0.000001, i));
const result = simplify(zigzag, 1.5);
assert.equal(result[0], zigzag[0]);
assert.equal(result.at(-1), zigzag.at(-1));
assert.ok(result.length > 11000, "retain the real turns instead of truncating a long route");
assert.ok(result.every((value, i) => !i || value.pointIndex > result[i - 1].pointIndex));
assert.equal(zigzag.length, 12000, "source points remain intact");
console.log("PASS long recovery routes avoid stack overflow; endpoints, turns, repeated endpoints and date-line tolerance are preserved");
