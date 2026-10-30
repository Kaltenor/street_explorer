const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
require.extensions['.ts'] = (module, filename) => module._compile(compile(fs.readFileSync(filename, 'utf8')), filename);
const { prepareGuidanceRoute } = require('../src/services/routeGuidance.ts');
const { haversineDistanceMeters } = require('../src/services/distance.ts');
const point = (latitude, longitude) => ({ latitude, longitude });
const coordinates = [point(0, 0), point(0, .01)];
const route = prepareGuidanceRoute(coordinates);
assert.equal(prepareGuidanceRoute([]), null);
assert(route.distanceTo(point(0, .005)) < .001, 'midpoint of sparse straight segment is on route');
assert(haversineDistanceMeters(point(0, .005), coordinates[0]) > 500, 'old nearest-node check incorrectly says off route');
assert(route.distanceTo(point(.0004, .005)) < 50);
assert(route.distanceTo(point(.0005, .005)) > 50);
assert(route.distanceTo(point(0, .011)) > 100, 'do not extend beyond the endpoint');
assert(prepareGuidanceRoute([point(0, 0), point(0, 0)]).distanceTo(point(0, .001)) > 100);
assert(prepareGuidanceRoute([point(0, 0)]).distanceTo(point(0, 0)) === 0);
assert(prepareGuidanceRoute([point(45, 179.99), point(45, -179.99)]).distanceTo(point(45, 180)) < .001);
assert(prepareGuidanceRoute([point(0, 0), point(.01, 0), point(.01, .01)]).distanceTo(point(.005, .005)) > 500, 'corners are not shortcut');
for (const latitude of [-70, -45, 0, 45, 70]) {
  const local = prepareGuidanceRoute([point(latitude, 2), point(latitude, 2.01)]);
  const expected = haversineDistanceMeters(point(latitude + .0005, 2.005), point(latitude, 2.005));
  assert(Math.abs(local.distanceTo(point(latitude + .0005, 2.005)) - expected) < .1);
}
console.log('PASS guidance segments: sparse midpoint, 50 m threshold, endpoints, duplicates, corners, date line and latitude scaling');

// Execute real component functions with persistent hook slots; no native renderer.
function harness(file, extra = '', overrides = {}) {
  const slots = [];
  let cursor = 0;
  const hooks = {
    memo: component => component,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) slots[index] = { value: fn(), deps };
      return slots[index].value;
    }
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': new Proxy({}, { get: (_, name) => name }),
    '@expo/vector-icons/Ionicons': 'Icon', './AtlasCabinet': {},
    '../constants/appearance': { createAppearanceStyles: styles => styles },
    '../constants/theme': { APP_COLORS: {}, WALKING_COLORS: { savedRoutes: ['teal'] } },
    '../i18n': require('../src/i18n.ts'),
    '../services/distance': require('../src/services/distance.ts'),
    '../services/routeGuidance': { prepareGuidanceRoute },
    ...overrides
  };
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync(file, 'utf8') + extra), { exports, require: name => {
    assert(name in mocks, `Missing mock ${name}`); return mocks[name];
  }});
  return (component, props) => { cursor = 0; return exports[component](props); };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const textContent = tree => JSON.stringify(tree);
const guidance = harness('src/components/PlanGuidance.tsx');
const guidanceProps = { plan: { coordinates, name: 'Test', distanceMeters: 1112 }, point: point(0, .005), recording: true, language: 'en' };
assert(!textContent(guidance('PlanGuidance', guidanceProps)).includes('Off route'));
assert(textContent(guidance('PlanGuidance', { ...guidanceProps, point: point(.001, .005) })).includes('Off route'));
assert(textContent(guidance('PlanGuidance', { ...guidanceProps, point: null })).includes('Waiting for your location'));
assert(textContent(guidance('PlanGuidance', { ...guidanceProps, recording: false })).includes('straight line'));
assert(textContent(guidance('PlanGuidance', { ...guidanceProps, plan: { ...guidanceProps.plan, coordinates: [point(1, 0), point(1, .01)] } })).includes('Off route'), 'new route invalidates projection');
let segmentCalls = 0, cellCalls = 0;
const history = harness('src/components/WalkHistoryModal.tsx', '\nexport { RecordingDetail };', {
  '../services/pathInference': { buildPathSegments: () => { segmentCalls++; return []; } },
  '../services/explorationArea': { collectExploredCellIdsForPath: () => { cellCalls++; return ['0:0']; } }
});
const props = {
  draftName: '', language: 'en', loopFillSummary: null,
  walk: { id: 1, activityMode: 'walk', startedAt: '2026-10-17T09:00:00Z', endedAt: '2026-10-17T10:00:00Z', durationSeconds: 3600, distanceMeters: 4000, stepCount: 5000, pointCount: 2000 },
  walkWithPoints: { points: [point(0, 0), point(0, .01)], routeSegments: [{ type: 'inferred', points: coordinates, confidence: 'high' }] }
};
let tree = history('RecordingDetail', props);
assert.equal(segmentCalls, 1); assert.equal(cellCalls, 2);
for (let i = 0; i < 30; i++) tree = history('RecordingDetail', { ...props, draftName: 'Walk ' + i });
assert.equal(segmentCalls, 1, 'typing must not rebuild route segments');
assert.equal(cellCalls, 2, 'typing must not enumerate explored cells');
const toggle = nodes(tree).find(node => node.props?.accessibilityState?.expanded === false);
toggle.props.onPress(); history('RecordingDetail', props);
assert.equal(segmentCalls, 1, 'expanding details reuses geometry');
history('RecordingDetail', { ...props, walkWithPoints: { ...props.walkWithPoints, points: [...props.walkWithPoints.points, point(0, .02)] } });
assert.equal(segmentCalls, 2, 'new GPS details invalidate report');
history('RecordingDetail', { ...props, loopFillSummary: { accepted: true, areaM2: 500, filledLoopCount: 1, loopFilledCellCount: 20 } });
assert.equal(segmentCalls, 3, 'changed loop result invalidates report');
console.log('PASS real guidance/History components: missing GPS, route replacement, 30 rename edits with zero extra geometry scans, detail expansion and data invalidation');

if (process.argv.includes('--benchmark')) {
  const dense = Array.from({ length: 15000 }, (_, i) => point(45 + Math.sin(i / 100) * .001, 2 + i / 15000 * .05));
  const prepared = prepareGuidanceRoute(dense);
  const fix = point(45.002, 2.025);
  const old = () => { let distance = Infinity; for (const node of dense) distance = Math.min(distance, haversineDistanceMeters(fix, node)); return distance; };
  const measure = fn => {
    for (let i = 0; i < 20; i++) fn();
    const samples = Array.from({ length: 101 }, () => { const start = performance.now(); fn(); return performance.now() - start; });
    return +samples.sort((a, b) => a - b)[50].toFixed(3);
  };
  console.log(JSON.stringify({ fixture: '15000-vertex guidance update; desktop medians (different distance semantics)', nearestVertexMs: measure(old), preparedSegmentsMs: measure(() => prepared.distanceTo(fix)) }));
}
