const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relativePath, mocks) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name.endsWith(".ttf")) return 1;
      throw new Error(`Unmocked import: ${name}`);
    },
    console: { warn() {}, info() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval
  }, { filename });
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function testLocationReplay() {
  const effects = [], requests = [], watches = [], points = [];
  const react = {
    useCallback: (callback) => callback,
    useRef: (current) => ({ current }),
    useState: (initial) => [initial, () => {}],
    useEffect: (effect) => effects.push(effect)
  };
  const { useReliableForegroundLocation } = load("src/hooks/useReliableForegroundLocation.ts", {
    react,
    "expo-location": { Accuracy: { High: 4, BestForNavigation: 6 } },
    "../constants/config": { LOCATION_CONFIG: {} },
    "../services/locationService": {
      getCurrentGpsPoint: () => { const request = deferred(); requests.push(request); return request.promise; },
      watchGpsPoints: (onPoint) => {
        const subscription = { removed: false, remove() { this.removed = true; } };
        watches.push({ onPoint, subscription });
        return Promise.resolve(subscription);
      }
    }
  });
  useReliableForegroundLocation({ enabled: true, isRecording: false, onPoint: (point) => points.push(point) });
  const cleanups = effects.map(effect => effect());
  await flush();
  cleanups.forEach(cleanup => cleanup?.());
  const replayCleanups = effects.map(effect => effect());
  await flush();
  assert.equal(requests.length, 2, "effect replay starts a fresh lookup without a rerender");
  assert.equal(watches[0].subscription.removed, true);
  assert.equal(watches[1].subscription.removed, false, "replayed watch remains alive");
  const point = (time) => ({ timestamp: new Date(time).toISOString() });
  requests[0].resolve(point(1000));
  watches[0].onPoint(point(2000));
  await flush();
  assert.equal(points.length, 0, "stale generation cannot publish");
  watches[1].onPoint(point(4000));
  requests[1].resolve(point(3000));
  await flush();
  assert.equal(points.length, 1, "replayed watch publishes and older initial lookup is ignored");
  replayCleanups.forEach(cleanup => cleanup?.());
  watches[1].onPoint(point(5000));
  assert.equal(points.length, 1, "unmounted watch cannot publish");
  assert.equal(watches[1].subscription.removed, true);
  console.log("PASS GPS effect replay, stale asynchronous results, timestamp ordering and cleanup");
}

async function testPreferences() {
  const states = [], pending = [], saved = [], feedback = [], alerts = [];
  const MapScreen = function MapScreen() {};
  const settings = {};
  for (const name of ["saveAppLanguage", "saveAppearanceMode", "saveHapticsEnabled", "saveSoundEnabled"]) {
    settings[name] = (value) => {
      saved.push([name, value]);
      const operation = deferred(); pending.push(operation); return operation.promise;
    };
  }
  const { default: App } = load("App.tsx", {
    react: {
      useRef: (current) => ({ current }), useEffect() {},
      useState: (initial) => {
        const index = states.length;
        states.push(index === 0 ? true : typeof initial === "function" ? initial() : initial);
        return [states[index], value => { states[index] = value; }];
      }
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "expo-status-bar": {}, "expo-audio": {},
    "expo-font": { useFonts: () => [true, null] },
    "@expo/vector-icons/Ionicons": { default: { font: {} } },
    "react-native": { Platform: { OS: "ios" }, Alert: { alert: (...args) => alerts.push(args) } },
    "react-native-safe-area-context": {},
    "./src/constants/appearance": { createAppearanceStyles: value => value, setActiveAppearanceMode: value => feedback.push(["appearance", value]) },
    "./src/database/db": {}, "./src/database/settingsRepository": settings,
    "./src/components/LaunchLoadingOverlay": {}, "./src/screens/MapScreen": { MapScreen },
    "./src/services/mapProvider": {}, "./src/services/nativeMapProvider": { isGoogleMapsAvailable: () => false },
    "./src/services/backgroundLocationTask": {},
    "./src/services/feedbackPreferences": {
      setHapticFeedbackEnabled: value => feedback.push(["haptics", value]),
      setSoundFeedbackEnabled: value => feedback.push(["sound", value])
    }
  });
  const tree = App();
  const find = (node) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === MapScreen) return node.props;
    for (const child of [node.props?.children].flat()) { const match = find(child); if (match) return match; }
    return null;
  };
  const props = find(tree);
  assert(props);
  const before = [...states];
  const failure = props.onChangeSoundEnabled(false);
  await flush();
  assert.deepEqual(states, before, "unsaved preference is not published optimistically");
  pending.shift().reject(new Error("disk full"));
  await failure;
  assert.deepEqual(states, before, "failed preference preserves previous value");
  assert.equal(feedback.length, 0, "failed save does not mutate global feedback");
  assert.equal(alerts.length, 1, "failed save is caught and explained");
  const first = props.onChangeLanguage("fr");
  const second = props.onChangeLanguage("en");
  const third = props.onChangeHapticsEnabled(false);
  await flush();
  assert.equal(pending.length, 1, "rapid requests cannot write concurrently");
  pending.shift().resolve(); await first; await flush();
  assert.equal(states[2], "fr");
  assert.equal(pending.length, 1);
  pending.shift().resolve(); await second; await flush();
  assert.equal(states[2], "en", "last selected language wins in persistence order");
  pending.shift().resolve(); await third;
  assert.deepEqual(feedback, [["haptics", false]], "queue recovers after a failed write");
  assert.deepEqual(saved.map(item => item[0]), ["saveSoundEnabled", "saveAppLanguage", "saveAppLanguage", "saveHapticsEnabled"]);
  console.log("PASS preference persistence failure, serialized writes and recovery");
}

(async () => { await testLocationReplay(); await testPreferences(); await testRenderYield(); })().catch(error => {
  console.error(error); process.exitCode = 1;
});

async function testRenderYield() {
  const filename = path.resolve(__dirname, '../src/screens/MapScreen.tsx');
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'waitForMapRenderCommit');
  assert(declaration);
  const code = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const backgrounded of [false, true]) {
    const frames = new Map(), timers = new Map(); let id = 0;
    const context = vm.createContext({
      requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
      cancelAnimationFrame: key => frames.delete(key),
      setTimeout: callback => { timers.set(++id, callback); return id; },
      clearTimeout: key => timers.delete(key)
    });
    vm.runInContext(code, context);
    let resolved = false;
    const operation = context.waitForMapRenderCommit().then(() => { resolved = true; });
    if (backgrounded) {
      assert.equal(timers.size, 1, 'a fallback must exist when animation frames are suspended');
      [...timers.values()][0]();
    } else {
      for (let step = 0; step < 2; step++) {
        const [key, callback] = frames.entries().next().value;
        frames.delete(key); callback();
      }
    }
    await operation;
    assert.equal(resolved, true);
    assert.equal(frames.size, 0, 'completed yield cancels pending frame');
    assert.equal(timers.size, 0, 'completed yield cancels fallback');
  }
  console.log('PASS recording UI yield resolves with suspended frames and cleans its resources');
}
