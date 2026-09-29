const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/screens/MapScreen.tsx');
const source = fs.readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, context) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(declaration);
  const expression = declaration.initializer.arguments[0].getText(ast);
  const code = ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, context);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const snapshotValues = () => [{}, [], [], [], ['0:0'], [], 1, []];

async function testSnapshotReuse() {
  const requests = [], published = [], details = [];
  const context = {
    activityMode: 'walk', activeMedalAlbumId: null,
    activeMedalAlbumIdRef: { current: null },
    savedDataRefreshOperationRef: { current: null },
    savedDataRefreshOperationsRef: { current: new Set() },
    savedDataRefreshGenerationRef: { current: 0 },
    savedMapSnapshotRef: { current: null },
    publishedSavedMapSnapshotRef: { current: null },
    discoveredMedalAwardOperationRef: { current: null },
    detailedWalksModeRef: { current: 'walk' }, showPathsRef: { current: false },
    isMapReadyRef: { current: true }, isLaunchDismissedRef: { current: false },
    repairPendingRecordingCaches: async () => [],
    loadSavedMapSnapshot: () => { const request = deferred(); requests.push(request); return request.promise; },
    awardMedalsInDiscoveredCells: async () => {}, getCollectedMedalCities: async () => [],
    getPendingMedalPresentations: async () => [], isZoneCompletionEligible: () => true,
    loadDetailedWalks: async () => { details.push('load'); }, refreshForbiddenZones: async () => {},
    setSavedExplorationCellIds: cells => published.push(cells),
    setTimeout, console: { warn() {} }
  };
  for (const name of ['setIsExplorationEnabled','setMedalPackLoadState','setWalks','setLoopFillCellIds','setLoopFillSummaries',
    'setSavedTodayNewCellIds','setKnownCityZones','setStats','setHistory','setSelectedSessionId','setIsSavedDataReady',
    'setMedalPresentationQueue','setCollectedMedalCities','setMedalProgress','setMedalRetroScanComplete']) context[name] = () => {};
  const refresh = callback('refreshSavedData', context);
  const initial = refresh();
  await flush();
  const albumChange = refresh({ medalsOnly: true });
  assert.equal(requests.length, 1, 'album selection reuses the in-flight local snapshot');
  requests[0].resolve(snapshotValues());
  await Promise.all([initial, albumChange]);
  assert.equal(published.length, 1, 'superseding album refresh publishes initial local data exactly once');
  await refresh({ medalsOnly: true });
  assert.equal(requests.length, 1, 'subsequent album selection reads no local map tables');
  assert.equal(published.length, 1, 'unchanged local arrays and stats are not republished');
  const explicit = refresh({ repairPendingCaches: false, hideExplorationDuringRefresh: false });
  assert.equal(requests.length, 2, 'explicit data refresh bypasses the cached snapshot');
  requests[1].resolve(snapshotValues()); await explicit;
  assert.equal(published.length, 2);
  assert.equal(details.length, 0, 'previously opened but now hidden paths are not reloaded');
  context.showPathsRef.current = true;
  const visible = refresh({ repairPendingCaches: false, hideExplorationDuringRefresh: false });
  requests[2].resolve(snapshotValues()); await visible;
  assert.equal(details.length, 1, 'visible paths still refresh after changes');
  const failed = refresh({ repairPendingCaches: false, hideExplorationDuringRefresh: false });
  requests[3].reject(new Error('temporary SQLite read failure')); await assert.rejects(failed);
  assert.equal(context.savedMapSnapshotRef.current, null, 'failed snapshots are evicted');
  const retry = refresh({ medalsOnly: true }); requests[4].resolve(snapshotValues()); await retry;
  assert.equal(published.length, 4, 'retry publishes the recovered snapshot');
  console.log('PASS album refresh shares pending/completed local data; explicit edits refresh; hidden paths stay unloaded; failed reads retry');
}

async function testPathLoadOrdering() {
  const requests = [], displayed = [], scopes = [];
  const context = {
    detailedWalksRequestRef: { current: 0 }, detailedWalksModeRef: { current: null },
    pathDisplayModeRef: { current: 'selected' }, selectedSessionIdRef: { current: 42 }, activityMode: 'walk',
    getWalkPointLoadScope: (mode, selectedSessionId) => { scopes.push({ mode, selectedSessionId }); return { mode, selectedSessionId }; },
    measureAsyncPerformance: (_, operation) => operation(),
    getAllWalksWithPoints: () => { const request = deferred(); requests.push(request); return request.promise; },
    setWalks: walks => displayed.push(walks)
  };
  const load = callback('loadDetailedWalks', context);
  const oldLoad = load({ mode: 'all' });
  const newLoad = load({ mode: 'selected', selectedSessionId: null });
  assert.equal(scopes[1].selectedSessionId, null, 'explicitly cleared selection cannot reuse the old selected walk');
  requests[1].resolve(['latest']); await newLoad;
  requests[0].resolve(['old full history']); await oldLoad;
  assert.deepEqual(displayed, [['latest']], 'slow old history cannot overwrite the newer path scope');
  const hiddenLoad = load(); context.detailedWalksRequestRef.current++;
  requests[2].resolve(['hidden']); await hiddenLoad;
  assert.equal(displayed.length, 1, 'invalidated hidden-layer load cannot publish');
  console.log('PASS path loads reject stale scope results, honor null selection and stop publishing after layer cleanup');
}
(async () => { await testSnapshotReuse(); await testPathLoadOrdering(); })().catch(error => { console.error(error); process.exitCode = 1; });
