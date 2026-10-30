const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = function testPlanningMarker() {
  const source = ts.transpileModule(fs.readFileSync('src/components/PlannedRouteOverlay.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  for (const [platform, provider] of [['ios', 'apple'], ['ios', 'google'], ['android', 'google']]) {
    const slots = [], effects = [], timers = new Map();
    let cursor = 0, timerId = 0, redraws = 0, dirty = false;
    const react = {
      memo: fn => fn,
      useRef: () => { const i = cursor++; return slots[i] ??= { current: { redraw: () => { redraws++; } } }; },
      useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
        return [slots[i], value => { if (!Object.is(slots[i], value)) dirty = true; slots[i] = value; }]; },
      useEffect: (fn, deps) => { const i = cursor++, old = slots[i];
        if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) {
          old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); });
        }
      }
    };
    const jsx = (type, props) => ({ type, props });
    const exports = {};
    vm.runInNewContext(source, { exports,
      setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
      require: id => {
        if (id === 'react') return react;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
        if (id === 'react-native') return { Platform: { OS: platform }, Text: 'Text', View: 'View' };
        if (id === 'react-native-maps') return { Marker: 'Marker' };
        if (id.endsWith('appearance')) return { createAppearanceStyles: styles => styles, isDaylightAppearance: mode => mode === 'daylight' };
        if (id.endsWith('theme')) return { APP_COLORS: {} };
        if (id.endsWith('SolidMapPolyline')) return { SolidMapPolyline: 'Polyline' };
        throw new Error(id);
      }
    });
    const props = { coordinate: { latitude: 48, longitude: 2 }, title: 'Start', text: '1', appearanceMode: 'explorator', mapProvider: provider };
    const render = () => { let tree, n = 0; do { dirty = false; cursor = 0; tree = exports.PlanningMarker(props); effects.splice(0).forEach(fn => fn()); assert(++n < 10); } while (dirty); return tree; };
    const tick = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); };
    let tree = render(); assert.equal(timers.size, 0, 'must wait for layout');
    tree.props.children.props.onLayout(); tree = render();
    if (provider === 'apple') {
      assert.equal(timers.size, 0); assert.equal(tree.props.tracksViewChanges, false);
      props.text = '2'; props.appearanceMode = 'daylight'; render(); tick();
      assert.equal(redraws, 0, 'MapKit must never receive the unsupported redraw command');
    } else {
      assert.equal(timers.size, 1); assert.equal(tree.props.tracksViewChanges, true);
      tick(); tree = render(); assert.equal(redraws, 1); assert.equal(tree.props.tracksViewChanges, false);
      props.text = '2'; render(); assert.equal(timers.size, 1, 'updated marker must refresh');
      props.appearanceMode = 'daylight'; render(); assert.equal(timers.size, 1, 'superseded timer must be cancelled');
      if (platform === 'ios') {
        props.mapProvider = 'apple'; render(); assert.equal(timers.size, 0, 'switching to MapKit cancels native redraw');
      }
    }
    slots.forEach(slot => slot?.cleanup?.()); tick();
    assert.equal(redraws, provider === 'apple' ? 0 : 1, 'unmount must cancel pending native commands');
    const overlay = exports.PlannedRouteOverlay({ plan: { coordinates: [props.coordinate] }, mapProvider: provider, appearanceMode: 'explorator', label: 'Start' });
    assert.equal(overlay.props.children[1].props.mapProvider, provider, 'guidance start marker receives provider');
  }
  const nativeRoot = require.resolve('react-native-maps/package.json').replace(/package\.json$/, '');
  assert.doesNotMatch(fs.readFileSync(nativeRoot + 'ios/AirMaps/AIRMapMarkerManager.m', 'utf8'), /RCT_EXPORT_METHOD\(redraw:/);
  assert.match(fs.readFileSync(nativeRoot + 'ios/AirGoogleMaps/AIRGoogleMapMarkerManager.m', 'utf8'), /RCT_EXPORT_METHOD\(redraw:/);
  console.log('PASS planning marker native-command guard: Apple, Google iOS/Android, layout, updates, provider switch and unmount');
};
