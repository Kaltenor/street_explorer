const assert = require("node:assert/strict");
const Module = require("node:module");

// Runs the actual journal service against fault-injected filesystem operations.
module.exports = async function testBackgroundOutbox() {
  const entries = new Map();
  const directoryUri = "document/street-explorer-background-location-outbox";
  let failRead = false;
  let failRename = false;
  class File {
    constructor(parent, name) { this.uri = name ? `${parent.uri}/${name}` : parent; }
    get exists() { return entries.has(this.uri); }
    async text() {
      if (failRead) { failRead = false; throw new Error("temporary read failure"); }
      return entries.get(this.uri);
    }
    rename(name) {
      if (failRename) { failRename = false; throw new Error("temporary rename failure"); }
      const target = `${directoryUri}/${name}`;
      entries.set(target, entries.get(this.uri));
      entries.delete(this.uri);
      this.uri = target;
    }
    delete() { entries.delete(this.uri); }
  }
  class Directory {
    constructor() { this.uri = directoryUri; this.exists = true; }
    create() {}
    list() { return [...entries.keys()].map(uri => new File(uri)); }
  }
  const originalLoad = Module._load;
  const originalError = console.error;
  const modulePath = require.resolve("../src/services/backgroundLocationOutbox.ts");
  delete require.cache[modulePath];
  Module._load = function(request, parent) {
    if (parent?.filename === modulePath) {
      if (request === "expo-file-system") return { File, Directory, Paths: { document: "document" } };
      if (request === "../database/db") return { initDatabase: async () => {} };
      if (request === "../database/walkRepository") return { purgeExpiredUnderfilledRecordings: async () => {} };
      if (["../database/gpsObservationRepository", "./walkRecorder", "./recordingState"].includes(request)) return {};
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    const { drainPendingBackgroundLocationBatches: drain } = require(modulePath);
    const batch = JSON.stringify({ id: "fixture", version: 2, createdAt: new Date().toISOString(), points: [], preferredSessionId: null });
    for (const extension of ["json", "tmp"]) {
      const uri = `${directoryUri}/fixture.${extension}`;
      entries.set(uri, batch);
      failRead = true;
      await assert.rejects(drain(), /temporary read failure/);
      assert.equal(entries.get(uri), batch, "unreadable valid journals remain available for retry");
      await drain();
      assert.equal(entries.size, 0, "the next drain recovers the retained journal");
    }
    entries.set(`${directoryUri}/fixture.tmp`, batch);
    failRename = true;
    await assert.rejects(drain(), /temporary rename failure/);
    assert.equal(entries.get(`${directoryUri}/fixture.tmp`), batch);
    await drain();
    assert.equal(entries.size, 0);
    console.error = () => {};
    for (const extension of ["json", "tmp"]) {
      entries.set(`${directoryUri}/invalid.${extension}`, "{broken");
      await drain();
      assert.equal(entries.get(`${directoryUri}/invalid.${extension}.corrupt`), "{broken");
    }
    console.log("PASS background GPS journals survive transient read/rename failures and retry; malformed JSON is quarantined");
  } finally {
    Module._load = originalLoad;
    console.error = originalError;
    delete require.cache[modulePath];
  }
};
