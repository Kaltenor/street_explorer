const assert = require("node:assert/strict");
const Module = require("node:module");
const { gzipSync, strToU8 } = require("fflate");
const { createHash } = require("node:crypto");

module.exports = async function testCountryPackCache() {
  const album = { id: "fixture-album", cityId: "fixture-city", cityZoneId: "fixture-zone", countryCode: "fixture",
    localLanguage: "en", cityName: { en: "Fixture", fr: "Test" }, version: 1,
    publishedAt: "2026-01-01", sourceAttribution: "Fixture", medals: [] };
  const pack = { formatVersion: 1, countryCode: "fixture", version: 1, languages: ["en", "fr"], albums: [album] };
  const raw = strToU8(JSON.stringify(pack));
  const compressed = gzipSync(raw);
  const descriptor = { ...pack, compressedBytes: compressed.length, uncompressedBytes: raw.length,
    albums: [{ albumId: album.id, cityId: album.cityId, cityZoneId: album.cityZoneId, localLanguage: "en", version: 1, medalCount: 0 }],
    sha256: createHash("sha256").update(compressed).digest("hex"), medalCount: 0, url: "https://example.test/pack" };
  let reads = 0;
  let installed = true;
  let failRead = false;
  let corruptRead = false;
  let deletes = 0;
  let requests = 0;
  let validDownload = false;
  let failRename = false;
  let failCleanup = false;
  class Directory { create() {} list() { if (failCleanup) throw new Error("cleanup failed"); return []; } }
  class File {
    constructor(_parent, name) { this.name = name; }
    get exists() { return this.name.endsWith(".tmp") ? false : installed; }
    async bytes() {
      reads++;
      if (failRead) { failRead = false; throw new Error("temporary filesystem failure"); }
      return (this.name.endsWith(".tmp") && !validDownload) || corruptRead ? new Uint8Array(compressed.length) : compressed;
    }
    write() {}
    rename() { if (failRename) throw new Error("installation rename failed"); installed = true; }
    delete() { deletes++; installed = false; }
  }
  const modulePath = require.resolve("../src/services/medalCountryPackStore.ts");
  const originalLoad = Module._load;
  const originalWarn = console.warn;
  delete require.cache[modulePath];
  Module._load = function(request, parent) {
    if (parent?.filename === modulePath) {
      if (request === "expo-file-system") return { Directory, File, Paths: { document: "document" } };
      if (request === "expo/fetch") return { fetch: async () => {
        requests++;
        let delivered = false;
        return { ok: true, body: { getReader: () => ({
          read: async () => delivered ? { done: true } : (delivered = true, { done: false, value: validDownload ? compressed : new Uint8Array(compressed.length) }),
          cancel: async () => {}
        }) } };
      } };
      if (request === "../data/medalAlbums") return {
        getAllBundledMedalAlbums: () => [], getDownloadableMedalCountryPacks: () => [descriptor],
        getDownloadableMedalCountryPack: () => descriptor, getBundledMedalAlbum: () => null
      };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    const store = require(modulePath);
    assert.deepEqual(await store.getLocallyAvailableMedalAlbumDefinitions(), [album]);
    assert.deepEqual(await store.getLocallyAvailableMedalAlbumDefinitions(), [album]);
    assert.deepEqual(await store.loadCountryPack(descriptor), pack);
    assert.equal(reads, 1, "repeated scans and installed-pack loads decode each checksum only once");
    installed = false;
    console.warn = () => {};
    await assert.rejects(store.loadCountryPack(descriptor), /checksum/);
    assert.equal(reads, 2, "a fresh download is validated even when its old pack remains in memory");
    console.log("PASS country pack scans reuse validated immutable packs, while new downloads still verify their checksum");
    delete require.cache[modulePath];
    const freshStore = require(modulePath);
    installed = true;
    failRead = true;
    const requestsBeforeReadFailure = requests;
    await assert.rejects(freshStore.loadCountryPack(descriptor), /temporary filesystem failure/);
    assert.equal(deletes, 0, "a transient local read failure never deletes the installed offline pack");
    assert.equal(requests, requestsBeforeReadFailure, "filesystem failures do not trigger a replacement download");
    freshStore.resetMedalCountryPackFailure("fixture-album");
    assert.deepEqual(await freshStore.loadCountryPack(descriptor), pack);
    delete require.cache[modulePath];
    corruptRead = true;
    await assert.rejects(require(modulePath).loadCountryPack(descriptor), /checksum/);
    assert.equal(deletes, 1, "proven checksum corruption still discards the damaged installed pack");
    assert.equal(requests, requestsBeforeReadFailure + 1, "corrupt installed packs still attempt replacement");
    console.log("PASS installed country packs survive transient filesystem failures and recover on retry; corrupt packs still redownload");
    delete require.cache[modulePath];
    const installStore = require(modulePath);
    validDownload = true;
    corruptRead = false;
    installed = false;
    failRename = true;
    await assert.rejects(installStore.loadCountryPack(descriptor), /installation rename failed/);
    assert.equal(installStore.getCachedMedalAlbumDefinition(album.id), null,
      "an interrupted installation cannot publish an album available only in volatile memory");
    installStore.resetMedalCountryPackFailure(album.id);
    failRename = false;
    failCleanup = true;
    assert.deepEqual(await installStore.loadCountryPack(descriptor), pack);
    assert.deepEqual(installStore.getCachedMedalAlbumDefinition(album.id), album);
    assert(installed, "installation succeeds even when obsolete-file cleanup fails");
    console.log("PASS pack albums publish only after durable installation, and cleanup errors do not invalidate success");
  } finally {
    Module._load = originalLoad;
    console.warn = originalWarn;
    delete require.cache[modulePath];
  }
};
