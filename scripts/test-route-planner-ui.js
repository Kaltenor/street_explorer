const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = async function testPlannerUI(plan) {
  const slots = [], effects = [], timers = new Map(), loads = [], followed = [];
  let cursor = 0, timerId = 0, dirty = false, tree, mapState, closed = 0;
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const memo = (factory, deps) => {
    const i = cursor++, old = slots[i];
    if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) slots[i] = { deps, value: factory() };
    return slots[i].value;
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) dirty = true; slots[i] = next; }]; },
    useRef: current => { const i = cursor++; if (!(i in slots)) slots[i] = { current }; return slots[i]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => { const i = cursor++, old = slots[i];
      if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) {
        old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
      }
    }
  };
  const source = ts.transpileModule(fs.readFileSync('src/components/RoutePlanner.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText;
  const exports = {};
  const routing = { PlanningError: class extends Error {}, buildPlanningGraph: async () => ({}),
    planThroughStops: async (_graph, stops) => ({ ...plan, stops }), suggestRoute: async (_graph, start, target) => ({ ...plan, stops: [start, plan.stops[1]], targetMeters: target }) };
  vm.runInNewContext(source, { exports, React: react, AbortController, Math, console,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    require: id => {
      if (id === 'react') return react;
      if (id === 'react-native') return { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Linking: { openURL: async () => {} }, BackHandler: { addEventListener: () => ({ remove() {} }) } };
      if (id === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (id.includes('Ionicons')) return 'Icon';
      if (id.endsWith('AtlasHudDecor')) return { AtlasHudTexture: 'Texture' };
      if (id.endsWith('theme')) return { APP_COLORS: {} };
      if (id.endsWith('appearance')) return { createAppearanceStyles: styles => styles };
      if (id.endsWith('routePlanning')) return routing;
      if (id.endsWith('planningExploration')) return { createPlanningExploration: () => ({}) };
      if (id.endsWith('distance')) return { haversineDistanceMeters: () => 1000 };
      if (id.endsWith('planningData')) return { loadPlanningData: (start, radius, signal) => { const load = deferred(); loads.push({ ...load, start, radius, signal }); return load.promise; } };
      throw new Error(id);
    }
  });
  const props = { language: 'en', exploredCellIds: [], forbiddenZones: [], onMapStateChange: value => { mapState = value; }, onClose: () => closed++, onFollow: async value => { followed.push(value); } };
  const render = () => { let count = 0; do { dirty = false; cursor = 0; tree = exports.RoutePlanner(props); effects.splice(0).forEach(fn => fn()); assert(++count < 20, 'render must settle'); } while (dirty); };
  const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
  const action = label => nodes(tree).find(node => node.props?.label === label);
  const press = label => { const node = action(label); assert(node, label); assert(!node.props.disabled, label + ' must be enabled'); node.props.onPress(); render(); };
  const tap = point => { mapState.onPress(point); render(); };
  const advance = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); render(); };
  render();
  assert(action('Create')); assert(action('Suggest')); assert(!action('Saved'));
  press('Create'); assert.equal(mapState.stops.length, 0); assert.equal(loads.length, 0);
  tap({ latitude: 48, longitude: 2 }); advance(); assert.equal(loads.length, 0, 'first tap only sets start');
  tap({ latitude: 48.001, longitude: 2 }); advance(); assert.equal(loads.length, 1);
  tap({ latitude: 48.002, longitude: 2 }); assert(loads[0].signal.aborted);
  loads[0].resolve({ data: {} }); await flush(); assert.equal(mapState.plan, null, 'late result cannot restore obsolete preview');
  advance(); loads[1].resolve({ data: {} }); await flush();
  assert.equal(mapState.plan.stops.length, 3); assert.equal(mapState.autoFrame, false);
  press('Undo'); assert.equal(mapState.plan, null); assert.equal(mapState.stops.length, 2);
  advance(); loads[2].resolve({ data: {} }); await flush(); press('Validate walk'); await flush();
  assert.equal(followed.length, 1); assert.equal(followed[0].stops.length, 2);
  press('Planning choices'); press('Suggest');
  assert.equal(mapState.stops.length, 0, 'suggest must ask for a new start');
  tap({ latitude: 49, longitude: 3 }); advance();
  assert.equal(loads.at(-1).start.latitude, 49, 'remote starting point feeds routing');
  loads.at(-1).resolve({ data: {} }); await flush();
  assert.equal(mapState.plan.targetMeters, 2000); assert.equal(mapState.autoFrame, true);
  press('4 km'); advance(); loads.at(-1).resolve({ data: {} }); await flush(); assert.equal(mapState.plan.targetMeters, 4000);
  press('6 km'); advance(); loads.at(-1).resolve({ data: {} }); await flush(); assert.equal(mapState.plan.targetMeters, 6000);
  tap({ latitude: 50, longitude: 4 }); advance(); press('Cancel calculation');
  loads.at(-1).resolve({ data: {} }); await flush(); assert.equal(mapState.plan, null);
  press('Close planner'); assert.equal(closed, 1);
  slots.forEach(slot => slot?.cleanup?.()); assert.equal(mapState, null);
  console.log('PASS planner interaction harness: remote start, sequential taps, undo, automatic 2/4/6 km suggestions, validation and stale-result cancellation (no native rendering)');
};
