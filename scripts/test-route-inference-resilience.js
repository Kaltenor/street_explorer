const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);

const filename = path.resolve(__dirname, "../src/services/pathInference.ts");
function loadInference(source) {
  const fixtureModule = new Module(filename, module);
  fixtureModule.filename = filename;
  fixtureModule.paths = module.paths;
  fixtureModule._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText + "\nexports.inspectContext = createStreetRoutingContext; exports.inferInContext = inferPathBetweenPointsWithContext; exports.inspectSnaps = attachPointCandidatesToStreetGraph;", filename);
  return fixtureModule.exports;
}
const inference = loadInference(fs.readFileSync(filename, "utf8"));
const point = (x, seconds, y = 0) => ({ latitude: y / 111320, longitude: x / 111320,
  accuracy: 3, timestamp: new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString(), pointIndex: seconds });
const streets = Array.from({ length: 20 }, (_, index) => ({
  id: `way/fixture/part/${index}`, name: "Fixture", highway: "residential", access: null,
  foot: null, bridge: false, tunnel: false, layer: 0,
  coordinates: [point(index * 25, 0), point((index + 1) * 25, 0)], fetchedAt: "2026-01-01",
  minLatitude: 0, maxLatitude: 0, minLongitude: index * 25 / 111320, maxLongitude: (index + 1) * 25 / 111320
}));
const context = inference.inspectContext(streets);
const crossingStreets = [
  { ...streets[0], id: "way/horizontal/part/0", coordinates: [point(-20, 0), point(20, 0)] },
  { ...streets[0], id: "way/vertical/part/0", coordinates: [point(0, 0, -20), point(0, 0, 20)] }
];
const turn = inference.inferPathBetweenPoints(point(-15, 0), point(0, 10, 15), "walk", crossingStreets);
assert.equal(turn.status, "inferred", "interior street snaps must reach the crossing without an endpoint detour");
assert(turn.segment.distanceMeters < 31);
assert.equal(turn.segment.bridgeEvidence.intersectionJoinCount, 1);
const twoTurns = inference.inferPathBetweenPoints(point(-10, 0, -15), point(10, 13, 15), "walk", [
  crossingStreets[0],
  { ...crossingStreets[1], id: "way/left/part/0", coordinates: [point(-10, 0, -20), point(-10, 0, 20)] },
  { ...crossingStreets[1], id: "way/right/part/0", coordinates: [point(10, 0, -20), point(10, 0, 20)] }
]);
assert.equal(twoTurns.status, "inferred", "two internal crossings connect along their own street without endpoint detours");
assert(twoTurns.segment.distanceMeters < 51);
for (const grade of [{ bridge: true }, { tunnel: true }, { layer: 1 }]) {
  assert.equal(inference.inferPathBetweenPoints(point(-15, 0), point(0, 10, 15), "walk",
    [crossingStreets[0], { ...crossingStreets[1], ...grade }]).status, "rejected",
    "crossing snap attachments never bridge disconnected elevations");
}
const overlappingBridge = { ...crossingStreets[0], id: "way/elevated/part/0", bridge: true, layer: 1 };
const gradedContext = inference.inspectContext([...crossingStreets, overlappingBridge]);
const bridgeSnaps = inference.inspectSnaps(point(-15, 0), gradedContext.graph, [overlappingBridge],
  gradedContext.crossingKeysByEdge, "grade-fixture", 30);
assert(bridgeSnaps.length > 0);
assert(bridgeSnaps.every(snap => gradedContext.graph.get(snap.key).edges.every(edge => !edge.key.startsWith("intersection:"))),
  "a bridge edge overlapping ground geometry never receives the ground edge's internal crossing attachments");
const snapshotGraph = () => JSON.stringify([...context.graph]);
const baselineGraph = snapshotGraph();
for (let iteration = 0; iteration < 30; iteration++) {
  const start = point(5 + iteration, 0);
  const end = point(300 + iteration, 300);
  assert.deepEqual(inference.inferInContext(start, end, "walk", context),
    inference.inferPathBetweenPoints(start, end, "walk", streets),
    "reusing topology must return the same route as an isolated gap");
  assert.equal(snapshotGraph(), baselineGraph, "successful gap snaps must not accumulate in the street graph");
  assert.equal(inference.inferInContext(start, point(300, 300, 100), "walk", context).status, "rejected");
  assert.equal(snapshotGraph(), baselineGraph, "one-sided snaps must be removed after rejected inference too");
}
const confirmedPoints = [point(0, 0), point(2, 2), point(4, 4)];
const unusedStreets = new Proxy(streets, { get() { throw new Error("confirmed route unnecessarily touched street topology"); } });
assert(inference.buildPathSegmentsWithInference(confirmedPoints, "walk", unusedStreets).every(segment => segment.type === "confirmed"));
console.log("PASS gap inference releases temporary snaps after success/rejection, preserves isolated-route results and skips topology for confirmed routes");

if (process.argv.includes("--benchmark")) {
  // Pass a saved baseline source file after --benchmark; no Git subprocess is
  // needed, so the benchmark also works in restricted test environments.
  const baselinePath = process.argv[process.argv.indexOf("--benchmark") + 1];
  const previous = loadInference(fs.readFileSync(baselinePath, "utf8"));
  for (const [label, implementation] of [["HEAD", previous], ["working", inference]]) {
    const benchmarkContext = implementation.inspectContext(streets);
    const start = performance.now();
    for (let index = 0; index < 500; index++) {
      implementation.inferInContext(point(5 + index % 10, 0), point(300 + index % 10, 300), "walk", benchmarkContext);
    }
    console.log(JSON.stringify({ label, gaps: 500, milliseconds: Math.round(performance.now() - start),
      retainedGraphNodes: benchmarkContext.graph.size,
      retainedGraphEdges: [...benchmarkContext.graph.values()].reduce((total, node) => total + node.edges.length, 0) }));
  }
}
