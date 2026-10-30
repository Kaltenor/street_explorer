const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/components/CompletionModal.tsx");
const source = fs.readFileSync(filename, "utf8");
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "loadZones") callbacks.load = node.initializer.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("getStreetCompletionSummary")) callbacks.poll = node.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("getCompletionStats(mode)")) callbacks.stats = node.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("Promise.all([getZoneRefreshState()")) callbacks.autoRefresh = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function evaluate(code, context) {
  return vm.runInNewContext(ts.transpileModule(`(${code})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText, context);
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function main() {
  const pending = [], published = [];
  const shared = {
    zoneLoadGenerationRef: { current: 0 }, zoneListContextRef: { current: { scope: "district", visible: true } },
    currentLocationRef: { current: null },
    getCachedZones: scope => { const request = deferred(); pending.push({ scope, ...request }); return request.promise; },
    sortZonesForLocation: zones => zones, getBestZoneForLocation: zones => zones[0],
    setZones: zones => published.push(zones), setSelectedZoneId() {}, setZonePickerOpen() {}
  };
  const loadDistricts = evaluate(callbacks.load, { ...shared, scope: "district" });
  const old = loadDistricts();
  shared.zoneListContextRef.current = { scope: "city", visible: true };
  const loadCities = evaluate(callbacks.load, { ...shared, scope: "city" });
  const recent = loadCities();
  pending[1].resolve([{ id: "city" }]); await recent;
  pending[0].resolve([{ id: "district" }]); await old;
  assert.deepEqual(published, [[{ id: "city" }]], "late district read cannot replace the selected city scope");
  const hidden = loadCities();
  shared.zoneListContextRef.current.visible = false;
  pending[2].resolve([{ id: "hidden" }]); await hidden;
  assert.equal(published.length, 1, "hidden page cannot receive old zone lists");

  let tick, cleared = false;
  const reads = [], summaries = [];
  const effect = evaluate(callbacks.poll, {
    visible: true, console: { warn() {} },
    InteractionManager: { runAfterInteractions: callback => { callback(); return { cancel() {} }; } },
    getStreetCompletionSummary: () => { const request = deferred(); reads.push(request); return request.promise; },
    setStreetSummary: summary => summaries.push(summary),
    setInterval: callback => { tick = callback; return 1; }, clearInterval: () => { cleared = true; }
  });
  const cleanup = effect();
  tick(); tick(); tick();
  assert.equal(reads.length, 1, "slow queries must not overlap on subsequent timer ticks");
  reads[0].reject(Error("temporary storage failure")); await flush();
  tick(); assert.equal(reads.length, 2, "failed reads release the in-flight guard for retry");
  reads[1].resolve("fresh"); await flush();
  tick(); cleanup(); reads[2].resolve("stale"); await flush();
  assert.deepEqual(summaries, ["fresh"]);
  assert.ok(cleared);
  for (const callback of [callbacks.stats, callbacks.autoRefresh]) {
    const request = deferred();
    let publications = 0, refreshes = 0;
    const cleanupRead = evaluate(callback, {
      visible: true, mode: "walk", console: { warn() {} },
      InteractionManager: { runAfterInteractions: callback => { callback(); return { cancel() {} }; } },
      getCompletionStats: () => request.promise,
      getZoneRefreshState: () => request.promise,
      getZoneAchievementRollup: async () => ({}),
      setStats: () => publications++, setRefreshState: () => publications++, setAchievementRollup: () => publications++,
      autoRefreshAttemptedRef: { current: false }, hasCurrentLocation: true, isRecording: false,
      isBoundaryRefreshStale: () => true, refreshBoundaries: () => refreshes++
    })();
    cleanupRead(); request.resolve({ lastSucceededAt: null }); await flush();
    assert.equal(publications, 0, "closed page ignores delayed initialization results");
    assert.equal(refreshes, 0, "closed page does not start an automatic network refresh");
  }
  console.log("PASS completion scope races, hidden-page results, non-overlapping polling, retry and timer cleanup");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
