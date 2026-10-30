const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);
const planning = require('../src/services/routePlanning.ts');
const { buildPlanningGraph, planThroughStops, suggestRoute, assertRoutePlan, pedestrianAccess, PlanningError } = planning;
const { haversineDistanceMeters } = require('../src/services/distance.ts');
const context = { explored: () => false, forbidden: () => false, medals: [] };
const node = (id, latitude, longitude, tags) => ({ id, type: 'node', lat: latitude, lon: longitude, tags });
const way = (id, nodes, tags = {}) => ({ id, type: 'way', nodes, tags: { highway: 'residential', ...tags } });
const stop = (latitude, longitude) => ({ latitude, longitude, label: 'Stop' });
const namePlan = plan => ({ ...plan, name: 'A future walk' });
const rejects = (promise, code) => assert.rejects(promise, e => e instanceof PlanningError && e.code === code);

async function main() {
  assert.equal(pedestrianAccess({ highway: 'footway', access: 'private' }), false);
  assert.equal(pedestrianAccess({ highway: 'footway', access: 'private', foot: 'yes' }), true);
  for (const foot of ['no', 'private', 'use_sidepath', 'destination', 'customers']) assert.equal(pedestrianAccess({ highway: 'path', foot }), false);
  assert.equal(pedestrianAccess({ highway: 'steps' }), true);
  assert.equal(pedestrianAccess({ highway: 'motorway' }), false);
  assert.equal(pedestrianAccess({ highway: 'path', 'foot:conditional': 'no @ (sunset-sunrise)' }), false);
  assert.equal(pedestrianAccess({ barrier: 'gate' }, true), false);
  assert.equal(pedestrianAccess({ barrier: 'gate', foot: 'yes' }, true), true);
  const square = { elements: [node(1, 0, 0), node(2, 0, .002), node(3, .002, .002), node(4, .002, 0), way(10, [1, 2, 3, 4, 1])] };
  const graph = await buildPlanningGraph(square, context);
  const plan = namePlan(await planThroughStops(graph, [stop(0, 0), stop(.002, .002)], true, context));
  assertRoutePlan(plan);
  const cells = require('../src/services/explorationArea.ts');
  const { createPlanningExploration } = require('../src/services/planningExploration.ts');
  const pathPoints = Array.from({ length: 11 }, (_, i) => ({ latitude: 48, longitude: 2 + i * .00004, accuracy: 3, timestamp: new Date(1700000000000 + i * 4000).toISOString(), pointIndex: i }));
  const expectedCells = cells.collectExploredCellIdsForPath(pathPoints, 'walk').sort();
  const plannedCells = cells.collectPlannedRouteCellIds(pathPoints).sort();
  assert.deepEqual(plannedCells, expectedCells, 'planning uses actual walk capture radius and canonical Mercator grid');
  const cellContext = createPlanningExploration([plannedCells[0]], [plannedCells[1]]);
  assert.equal(planning.estimateNewRouteCells(pathPoints, cellContext), plannedCells.length - 2, 'known and forbidden cells do not count');
  assert.equal(planning.estimateNewRouteCells([...pathPoints, ...pathPoints.slice().reverse()], cellContext), plannedCells.length - 2, 'out-and-back cells count once');
  const ring = [];
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if (x === 0 || y === 0 || x === 7 || y === 7) ring.push(`${x}:${y}`);
  const filledContext = createPlanningExploration(ring, []);
  assert.equal(filledContext.isNewCell('3:3'), false, 'already-filled enclosures are not fresh territory');
  assert.equal(filledContext.isNewCell('20:20'), true);
  assert.equal(plan.estimatedNewCellCount, cells.collectPlannedRouteCellIds(plan.coordinates).length);
  assert.throws(() => assertRoutePlan({ ...plan, estimatedNewCellCount: -1 }), /invalid/);
  await require('./test-route-planner-ui.js')(plan);
  console.log('PASS canonical walking cells, unique discovery, Forbidden Zone exclusions and existing filled surfaces');
  assert(plan.distanceMeters > 850 && plan.distanceMeters < 910);
  assert.equal(plan.returnToStart, true);
  assert.deepEqual(plan.coordinates[0], plan.coordinates.at(-1));
  assert(plan.estimatedNewMeters > 850, 'return routing avoids duplicating the outbound side of the square');
  assert.throws(() => assertRoutePlan({ ...plan, coordinates: [plan.coordinates[0], plan.coordinates.at(-1)] }), /invalid/);
  await rejects(planThroughStops(graph, [stop(1, 1), stop(0, 0)], false, context), 'snap');
  await rejects(buildPlanningGraph({ elements: [], remark: 'runtime error' }, context), 'unavailable');
  const blocked = await buildPlanningGraph(square, { ...context, forbidden: p => p.latitude === 0 && p.longitude > .0008 && p.longitude < .0012 });
  const detour = await planThroughStops(blocked, [stop(0, 0), stop(0, .002)], false, context);
  assert(detour.distanceMeters > 600, 'forbidden cells remove the whole crossing edge');
  const crossing = await buildPlanningGraph({ elements: [node(1, 0, -.002), node(2, 0, .002), node(3, -.002, 0), node(4, .002, 0), way(10, [1, 2]), way(11, [3, 4], { bridge: 'yes' })] }, context);
  await rejects(planThroughStops(crossing, [stop(0, -.002), stop(.002, 0)], false, context), 'disconnected');
  const oneWay = await buildPlanningGraph({ elements: [node(1, 0, 0), node(2, 0, .002), way(10, [1, 2], { 'oneway:foot': 'yes' })] }, context);
  await rejects(planThroughStops(oneWay, [stop(0, .002), stop(0, 0)], false, context), 'disconnected');
  const canceled = new AbortController(); canceled.abort();
  await rejects(buildPlanningGraph(square, context, canceled.signal), 'cancelled');
  console.log('PASS pedestrian access, explicit topology, barriers, forbidden areas, one-way walking, distance validation and cancellation');

  const grid = { elements: [] };
  const width = 19, step = .002;
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) grid.elements.push(node(y * width + x + 1, y * step, x * step));
  for (let y = 0; y < width; y++) grid.elements.push(way(1000 + y, Array.from({ length: width }, (_, x) => y * width + x + 1)));
  for (let x = 0; x < width; x++) grid.elements.push(way(2000 + x, Array.from({ length: width }, (_, y) => y * width + x + 1)));
  const start = stop(.018, .018);
  const exploration = { ...context, explored: p => p.longitude < .018, medals: [stop(.018, .022)] };
  const fullGraph = await buildPlanningGraph(grid, exploration);
  for (const target of [2000, 4000, 6000]) {
    const result = await suggestRoute(fullGraph, start, target, true, exploration, 'discovery', 0);
    assertRoutePlan(namePlan(result));
    assert(result.distanceMeters <= 6000 && result.distanceMeters >= target * .75);
    assert(result.estimatedNewMeters > 0);
    assert.deepEqual(result.coordinates[0], result.coordinates.at(-1));
    console.log(`PASS ${target / 1000} km suggestion: ${Math.round(result.distanceMeters)} m, ${Math.round(result.estimatedNewMeters)} m new`);
  }
  const open = await suggestRoute(fullGraph, start, 2000, false, exploration, 'medals', 1);
  assert(haversineDistanceMeters(open.coordinates[0], open.coordinates.at(-1)) > 500);
  const medalPlan = await planThroughStops(fullGraph, [start, stop(.018, .022)], false, exploration);
  assert.equal(medalPlan.medalOpportunities, 1);
  await rejects(planThroughStops(fullGraph, [stop(0, 0), stop(.036, .036)], true, context), 'distance');
  await rejects(suggestRoute(graph, stop(0, 0), 6000, true, context, 'balanced', 0), 'suggestion');

  // Exercise the real repositories against SQLite; no Expo/native runtime needed.
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE route_plans(id TEXT PRIMARY KEY, data TEXT, updated_at TEXT);
    CREATE TABLE planning_cache(id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL, longitude REAL, radius REAL, data TEXT, fetched_at TEXT);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE walk_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT, activity_mode TEXT, started_at TEXT, ended_at TEXT, distance_meters REAL, duration_seconds INTEGER, step_count INTEGER);
    CREATE TABLE explored_cells(id INTEGER); CREATE TABLE collected_medals(id INTEGER);`);
  const db = {
    getAllAsync: async (sql, ...args) => sqlite.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => sqlite.prepare(sql).get(...args) ?? null,
    runAsync: async (sql, ...args) => { const v = sqlite.prepare(sql).run(...args); return { changes: Number(v.changes), lastInsertRowId: Number(v.lastInsertRowid) }; },
    execAsync: async sql => sqlite.exec(sql),
    withExclusiveTransactionAsync: async fn => { sqlite.exec('BEGIN'); try { await fn(db); sqlite.exec('COMMIT'); } catch(e) { sqlite.exec('ROLLBACK'); throw e; } }
  };
  const dbPath = path.resolve(__dirname, '../src/database/db.ts');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDatabase: async () => db } };
  const repo = require('../src/database/routePlanRepository.ts');
  await repo.saveRoutePlan(plan);
  assert.deepEqual(await repo.getRoutePlans(), [plan]);
  await repo.saveRoutePlan({ ...plan, name: 'Renamed' });
  assert.equal((await repo.getRoutePlans())[0].name, 'Renamed');
  await repo.saveFollowingPlan({ plan, sessionId: null });
  assert.deepEqual(await repo.getFollowingPlan(), { plan, sessionId: null });
  for (const table of ['walk_sessions', 'explored_cells', 'collected_medals']) assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  await repo.deleteRoutePlan(plan.id);
  assert.equal((await repo.getRoutePlans()).length, 0);
  assert.deepEqual((await repo.getFollowingPlan()).plan, plan, 'guidance retains immutable geometry after plan deletion');
  for (let i = 0; i < 50; i++) await repo.saveRoutePlan({ ...plan, id: 'p' + i });
  await assert.rejects(repo.saveRoutePlan({ ...plan, id: 'overflow' }), /limit/);
  await repo.saveRoutePlan({ ...plan, id: 'p0', name: 'Updated at limit' });
  console.log('PASS real SQLite plan CRUD, immutable following snapshot, limits and isolation from exploration/recordings/medals');

  const settingsModule = { exports: {} };
  const settingsSource = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/database/settingsRepository.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(settingsSource, { exports: settingsModule.exports, require: id => {
    if (id === './db') return { getDatabase: async () => db };
    if (id === './routePlanRepository') return repo;
    if (id === '../services/routePlanning') return planning;
    if (id === '../constants/appearance') return { APPEARANCE_MODES: ['explorator', 'daylight'] };
    return {};
  }, console, Date, JSON, Number, Error });
  const settings = settingsModule.exports;
  const sessionId = await settings.createActiveRecordingSession({ activityMode: 'walk', startedAt: '2026-10-09T12:00:00Z', routePlan: plan });
  assert.equal((await repo.getFollowingPlan()).sessionId, sessionId);
  await assert.rejects(settings.createActiveRecordingSession({ activityMode: 'walk', startedAt: '2026-10-09T12:01:00Z', routePlan: { ...plan, name: 'Other' } }));
  assert.equal((await repo.getFollowingPlan()).plan.name, plan.name, 'conflicting recording rolls guidance back');
  await repo.saveFollowingPlan(null);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM walk_sessions').get().n, 1, 'hiding guidance does not stop or delete recording');
  console.log('PASS recording and guidance bind atomically; conflict preserves original guidance; hiding leaves recording intact');

  const { createBackupV5Manifest, assertBackupV5Manifest, encodeBackupV5Record, decodeBackupV5RecordHeader, decodeBackupV5RecordPayload, BACKUP_V5_RECORD_HEADER_BYTES } = require('../src/services/backupV5.ts');
  const metadata = { appVersion: '0.36.0', exportedAt: new Date().toISOString(), sessions: [], zoneAchievements: [], medalSystem: { acquisitionEvents: [], collectedMedals: [], retroScanSettings: [] }, routePlans: [plan] };
  const manifest = createBackupV5Manifest(metadata); assertBackupV5Manifest(manifest);
  const encoded = encodeBackupV5Record(1, manifest);
  const header = decodeBackupV5RecordHeader(encoded.bytes.slice(0, BACKUP_V5_RECORD_HEADER_BYTES));
  const decoded = decodeBackupV5RecordPayload(header, encoded.bytes.slice(BACKUP_V5_RECORD_HEADER_BYTES));
  assertBackupV5Manifest(decoded); assert.deepEqual(decoded.routePlans, [plan]);
  assertBackupV5Manifest(createBackupV5Manifest({ ...metadata, routePlans: undefined }));
  assert.throws(() => assertBackupV5Manifest({ ...manifest, routePlans: [plan, plan] }), /Duplicate/);
  assert.throws(() => assertBackupV5Manifest({ ...manifest, routePlans: [{ ...plan, distanceMeters: -1 }] }), /invalid/);
  console.log('PASS Backup V5 plan roundtrip, older-backup compatibility, duplicate/malformed rejection');

  const { loadPlanningData } = require('../src/services/planningData.ts');
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, headers: new Map(), text: async () => JSON.stringify(square) }; };
  await loadPlanningData(stop(0, 0), 1500, new AbortController().signal);
  global.fetch = async () => { throw new Error('offline'); };
  const cached = await loadPlanningData(stop(0, 0), 1400, new AbortController().signal);
  assert.equal(cached.cached, true); assert.equal(calls, 1);
  await rejects(loadPlanningData(stop(10, 10), 1400, new AbortController().signal), 'unavailable');
  global.fetch = async () => ({ ok: true, headers: new Map(), text: async () => JSON.stringify({ ...square, remark: 'timeout: incomplete data' }) });
  await rejects(loadPlanningData(stop(10, 10), 1400, new AbortController().signal), 'unavailable');
  const abort = new AbortController();
  global.fetch = async () => ({ ok: true, headers: new Map(), text: async () => { abort.abort(); return JSON.stringify(square); } });
  await rejects(loadPlanningData(stop(10, 10), 1400, abort.signal), 'cancelled');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM planning_cache').get().n, 1, 'failed/canceled responses cannot populate cache');
  global.fetch = realFetch;
  sqlite.close();
  console.log('PASS offline cached topology, uncached failure, partial-response rejection, cancellation before persistence');

  // Execute the real guidance hook with delayed reads and persistent hook slots.
  const slots = [], effects = [], reads = [], writes = [];
  let cursor = 0;
  const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: current => { const i = cursor++; if (!(i in slots)) slots[i] = { current }; return slots[i]; },
    useCallback: fn => fn,
    useEffect: (fn, deps) => {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
      }
    }
  };
  const hookModule = { exports: {} };
  const hookSource = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/hooks/usePlannedWalk.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(hookSource, { exports: hookModule.exports, Error, require: id => id === 'react' ? react : {
    getFollowingPlan: () => { const read = deferred(); reads.push(read); return read.promise; },
    saveFollowingPlan: value => { const write = deferred(); writes.push({ ...write, value }); return write.promise; }
  } });
  const render = (ready, session = null, recovery = null) => { cursor = 0; const result = hookModule.exports.usePlannedWalk(ready, session, recovery); effects.splice(0).forEach(fn => fn()); return result; };
  render(false); assert.equal(reads.length, 0);
  render(true); reads.at(-1).resolve({ plan, sessionId: null }); await flush();
  assert.equal(render(true).following.plan, plan);
  render(true, 12); reads.at(-1).resolve({ plan, sessionId: 12 }); await flush();
  assert.equal(render(true, 12).following.sessionId, 12, 'matching recording recovers guidance');
  render(true); reads.at(-1).resolve({ plan, sessionId: 12 }); await flush();
  assert.equal(render(true).following, null, 'finalized session cannot reattach to a new walk');
  render(true, null, 12); reads.at(-1).resolve({ plan, sessionId: 12 }); await flush();
  assert.equal(render(true, null, 12).following.sessionId, 12, 'recovery fallback retains guidance');
  render(true, 77); const oldRead = reads.at(-1);
  const selection = render(true, 77).select(plan);
  oldRead.resolve({ plan: { ...plan, name: 'Stale' }, sessionId: 77 }); await flush();
  writes.at(-1).resolve(); await selection;
  assert.equal(render(true, 77).following.plan.name, plan.name, 'superseded read cannot replace a new selection');
  const hide = render(true, 77).select(null);
  writes.at(-1).reject(new Error('disk full')); await assert.rejects(hide, /disk full/);
  assert.equal(render(true, 77).following.plan, plan, 'failed write preserves last durable selection');
  assert.equal(render(true, 77).loaded, true, 'failed hide cannot leave Start permanently loading');
  render(true, 88); reads.at(-1).reject(new Error('read failed')); await flush();
  assert.equal(render(true, 88).following, null, 'read failure cannot show another session guidance');
  console.log('PASS guidance hook startup, active/fallback recovery, finalized-session rejection, stale reads and failed writes');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
