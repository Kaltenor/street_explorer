const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const { patchPolygonOrder } = require("./patch-react-native-maps-polygon-order.js");

require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename
);

async function main() {
  const originalPolygonUpdate = "    [_map addOverlay:self];";
  const patchedPolygonUpdate = patchPolygonOrder(originalPolygonUpdate);
  assert.match(patchedPolygonUpdate, /insertOverlay:self belowOverlay:/);
  assert.equal(patchPolygonOrder(patchedPolygonUpdate), patchedPolygonUpdate);
  assert.throws(() => patchPolygonOrder("unrecognized polygon source"));
  const installedPolygonSource = fs.readFileSync(
    require.resolve("react-native-maps/package.json").replace(
      /package\.json$/,
      "ios/AirMaps/AIRMapPolygon.m"
    ),
    "utf8"
  );
  assert.match(installedPolygonSource, /insertOverlay:self belowOverlay:/);
  console.log("PASS idempotent Apple Maps patch keeps updated polygons below later overlays");

  const { resolveMapProvider, canChangeMapProvider } = require("../src/services/mapProvider.ts");
  assert.equal(resolveMapProvider(null, "ios", true), "apple");
  assert.equal(resolveMapProvider("unknown", "ios", true), "apple");
  assert.equal(resolveMapProvider("google", "ios", true), "google");
  assert.equal(resolveMapProvider("google", "ios", false), "apple");
  assert.equal(resolveMapProvider("apple", "android", true), "google");
  const idle = { platform: "ios", recording: false, starting: false, stopping: false, recovering: false };
  assert(canChangeMapProvider(idle));
  for (const phase of ["recording", "starting", "stopping", "recovering"]) {
    assert(!canChangeMapProvider({ ...idle, [phase]: true }), phase);
  }
  assert(!canChangeMapProvider({ ...idle, platform: "android" }));
  console.log("PASS provider defaults, unavailable-native fallback, Android policy and recording lifecycle lock");

  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const adapter = {
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args)
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent) {
    if (parent?.filename.endsWith("settingsRepository.ts")) {
      if (request === "./db") return { getDatabase: async () => adapter };
      if (request === "./completionRepository") return {};
      if (request === "../i18n") return {};
      if (request === "../constants/appearance") return { APPEARANCE_MODES: ["explorator", "daylight"] };
      if (request === "../services/zoneBoundaryPolicy") return {};
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    let settings = require("../src/database/settingsRepository.ts");
    assert.equal(await settings.getMapProvider(), "apple");
    await settings.saveMapProvider("google");
    delete require.cache[require.resolve("../src/database/settingsRepository.ts")];
    settings = require("../src/database/settingsRepository.ts");
    assert.equal(await settings.getMapProvider(), "google");
    await settings.saveMapProvider("apple");
    assert.equal(await settings.getMapProvider(), "apple");
    db.prepare("UPDATE app_settings SET value = 'invalid' WHERE key = 'map_provider'").run();
    assert.equal(await settings.getMapProvider(), "apple");
    db.exec("DROP TABLE app_settings");
    await assert.rejects(settings.saveMapProvider("google"));
  } finally {
    Module._load = originalLoad;
    db.close();
  }
  console.log("PASS actual SQLite preference persistence across repository reload, invalid-value fallback and write failure");

  const configure = require("../app.config.js");
  const base = require("../app.json").expo;
  const savedEnv = { ...process.env };
  try {
    process.env.GOOGLE_MAPS_API_KEY = "android-test-key";
    process.env.GOOGLE_MAPS_IOS_API_KEY = "ios-test-key";
    process.env.EAS_BUILD_PLATFORM = "ios";
    const config = configure({ config: base });
    assert.equal(config.ios.config.googleMapsApiKey, "ios-test-key");
    assert.equal(config.android.config.googleMaps.apiKey, "android-test-key");
    assert.deepEqual(config.ios.infoPlist, base.ios.infoPlist);
    assert.deepEqual(config.plugins, base.plugins);
    delete process.env.GOOGLE_MAPS_IOS_API_KEY;
    assert.throws(() => configure({ config: base }), /GOOGLE_MAPS_IOS_API_KEY/);
  } finally {
    for (const key of ["GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_IOS_API_KEY", "EAS_BUILD_PLATFORM"]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }
  console.log("PASS native build key separation and missing iOS key guard");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
