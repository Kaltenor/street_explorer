const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { performance } = require("node:perf_hooks");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText, filename);

execFileSync(process.execPath, [path.join(__dirname, "build-bundled-medals.mjs"), "--check"], { stdio: "inherit" });
const { FRANCE_MEDAL_ALBUM_MANIFEST: manifest } = require("../src/data/generated/franceMedalAlbumManifest.ts");
const sources = new Map();
for (const directory of ["assets/medals", "assets/medals/france"]) {
  for (const file of fs.readdirSync(path.join(root, directory)).filter((file) => file.endsWith(".json"))) {
    const album = JSON.parse(fs.readFileSync(path.join(root, directory, file), "utf8"));
    if (album.id && album.medals) sources.set(album.id, album);
  }
}
const times = [];
let medalCount = 0;
for (const entry of manifest) {
  const start = performance.now();
  const album = entry.load();
  times.push(performance.now() - start);
  assert.deepEqual(album, sources.get(entry.albumId));
  assert.equal(entry.load(), album, "Repeated load preserves object identity and avoids decompression");
  medalCount += album.medals.length;
}
assert.equal(manifest.length, 500);
assert.equal(medalCount, 6082);
assert.throws(() => require("../src/data/bundledMedalPayload.ts").loadBundledMedalAlbum("missing"), /Missing bundled/);
console.log(`PASS 500 offline albums / 6082 medals exactly match sources; cached identity preserved. Desktop first-decode total ${times.reduce((a,b)=>a+b,0).toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms`);

const expectedGlyphs = require("./icon-subset-input.cjs");
const glyphs = require("../src/data/generated/appIconGlyphs.json");
assert.deepEqual(glyphs, expectedGlyphs, "Run python scripts/build-icon-subset.py after changing icon names");
assert(fs.statSync(path.join(root, "assets/fonts/Ionicons-subset.ttf")).size < 50000);
const config = require("../metro.config.js");
const context = { resolveRequest: (_context, name, platform) => ({ name, platform }) };
assert.equal(config.resolver.resolveRequest(context, "@expo/vector-icons/Ionicons", "ios").filePath,
  path.join(root, "src/components/AppIcon.ts"));
assert.deepEqual(config.resolver.resolveRequest(context, "expo-font", "android"), { name: "expo-font", platform: "android" });
console.log(`PASS ${Object.keys(glyphs).length} used icon names covered; Metro redirects only Ionicons`);
