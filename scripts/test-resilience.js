const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText, filename
);

async function main() {
  const { fetchBoundaryData } = require("../src/services/boundaryRequest.ts");
  const realFetch = global.fetch;
  const calls = [];
  try {
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1 ? { ok: false, status: 406 }
        : { ok: true, json: async () => ({ elements: [{ id: 120965 }] }) };
    };
    assert.deepEqual(await fetchBoundaryData("Lyon & districts"), { elements: [{ id: 120965 }] });
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0].url, calls[1].url);
    assert.equal(new URLSearchParams(calls[1].options.body).get("data"), "Lyon & districts");
    assert.match(calls[1].options.headers["User-Agent"], /StreetExplorer/);
    global.fetch = async () => ({ ok: true, json: async () => ({ elements: [], remark: "runtime error: timeout" }) });
    await assert.rejects(fetchBoundaryData("query"), /incomplete/);
    const controller = new AbortController();
    let count = 0;
    global.fetch = async () => { count++; controller.abort(); throw new Error("cancelled"); };
    await assert.rejects(fetchBoundaryData("query", controller.signal));
    assert.equal(count, 1, "cancelled selections must not retry on another server");
  } finally { global.fetch = realFetch; }
  console.log("PASS boundary server fallback, identified requests, partial-data rejection and cancellation");

  const soundLoad = Module._load;
  const seeks = [];
  let playCount = 0;
  const soundPlayer = { volume: 0, pause() {}, play() { playCount++; },
    seekTo() { return new Promise(resolve => seeks.push(resolve)); } };
  Module._load = function(request) {
    if (request === "expo-audio") return { createAudioPlayer: () => soundPlayer };
    if (request.endsWith("map-location-piano.wav")) return 1;
    return soundLoad.apply(this, arguments);
  };
  try {
    const preferences = require("../src/services/feedbackPreferences.ts");
    const { playLocationSelectionSound } = require("../src/services/locationSelectionSound.ts");
    const cancelFirst = playLocationSelectionSound();
    cancelFirst(); seeks.shift()(); await Promise.resolve();
    assert.equal(playCount, 0, "unmounted label cannot play a delayed cue");
    playLocationSelectionSound();
    const cancelLatest = playLocationSelectionSound();
    seeks.shift()(); await Promise.resolve();
    assert.equal(playCount, 0, "superseded seek cannot play");
    seeks.shift()(); await Promise.resolve();
    assert.equal(playCount, 1, "latest selection plays once");
    cancelLatest();
    playLocationSelectionSound();
    preferences.setSoundFeedbackEnabled(false);
    seeks.shift()(); await Promise.resolve();
    assert.equal(playCount, 1, "mute is checked again after asynchronous seek");
    playLocationSelectionSound();
    assert.equal(seeks.length, 0, "muted selection never schedules audio");
    preferences.setSoundFeedbackEnabled(true);
    const wav = fs.readFileSync(require("node:path").join(__dirname, "../assets/sounds/map-location-piano.wav"));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 44100);
    let dataOffset = 0, dataBytes = 0;
    for (let offset = 12; offset + 8 <= wav.length;) {
      const size = wav.readUInt32LE(offset + 4);
      assert(offset + 8 + size <= wav.length, "WAV chunks are complete");
      if (wav.toString("ascii", offset, offset + 4) === "data") {
        dataOffset = offset + 8; dataBytes = size;
      }
      offset += 8 + size + (size % 2);
    }
    assert(dataOffset > 0 && dataBytes > 0);
    assert(dataBytes / wav.readUInt32LE(28) < 3.2, "piano decay fits the label lifetime");
    assert.equal(require("node:crypto").createHash("sha256").update(wav).digest("hex"),
      "79a6b37bc2c0968a43fafbd9348a3457d2b198f6b1fcb217d1ac4559e6812dac", "bundled clip matches the user-selected original");
    console.log("PASS location cue cancellation, replacement, mute-during-seek and selected piano integrity");
  } finally { Module._load = soundLoad; }

  const { withRequestDeadline } = require("../src/services/networkRequest.ts");
  let aborted = false;
  await assert.rejects(withRequestDeadline((signal) => {
    signal.addEventListener("abort", () => { aborted = true; });
    return new Promise(() => {});
  }, 10), { name: "AbortError" });
  assert(aborted);
  const cancelled = new AbortController();
  cancelled.abort();
  let invoked = false;
  await assert.rejects(withRequestDeadline(async () => { invoked = true; }, 10, cancelled.signal));
  assert.equal(invoked, false);
  const { fetchOverpassQuery } = require("../src/services/osmStreetService.ts");
  const nativeFetch = global.fetch, nativeTimer = global.setTimeout;
  let attempts = 0;
  try {
    global.setTimeout = (fn, delay, ...args) => nativeTimer(fn, delay === 35000 ? 10 : delay, ...args);
    global.fetch = async () => { attempts++; return { ok: true, json: () => new Promise(() => {}) }; };
    await assert.rejects(fetchOverpassQuery("fixture"), /after 2 attempts/);
    assert.equal(attempts, 2);
    attempts = 0;
    global.fetch = async () => { attempts++; return { ok: false, status: 400 }; };
    await assert.rejects(fetchOverpassQuery("fixture"), /HTTP 400/);
    assert.equal(attempts, 1);
  } finally { global.fetch = nativeFetch; global.setTimeout = nativeTimer; }
  console.log("PASS request deadlines cover stalled bodies, cancellation, fallback, and permanent errors");

  const { runZoneCompletionSingleFlight } = require("../src/services/zoneCompletionLifecycle.ts");
  const firstController = new AbortController();
  let rejectOld;
  const first = runZoneCompletionSingleFlight("retry", firstController.signal,
    () => new Promise((_, reject) => { rejectOld = reject; })).catch((error) => error.name);
  firstController.abort();
  assert.equal(await runZoneCompletionSingleFlight("retry", undefined, async () => 42), 42);
  rejectOld(new Error("old calculation finished cancellation"));
  assert.equal(await first, "AbortError");
  console.log("PASS a replacement completion consumer starts a fresh calculation");

  const geometry = require("../src/services/explorationArea.ts");
  let seed = 123456;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let fixture = 0; fixture < 30; fixture++) {
    const saved = [];
    for (let x = 0; x < 18; x++) for (let y = 0; y < 18; y++) {
      if (random() < 0.65) saved.push(`${x}:${y}`);
    }
    const collect = geometry.createIncrementalEnclosureCollector(saved, 150000);
    let active = [];
    for (let step = 0; step < 40; step++) {
      if (step % 7 === 0) active = active.slice(2);
      active.push(`${Math.floor(random() * 18)}:${Math.floor(random() * 18)}`);
      assert.deepEqual(collect(active).slice().sort(),
        geometry.collectFillableEnclosedExplorationCellIds([...saved, ...active], 150000).sort());
    }
    assert.deepEqual(collect([]).slice().sort(), geometry.collectFillableEnclosedExplorationCellIds(saved, 150000).sort());
  }
  console.log("PASS incremental closures equal full recomputation across additions, removals, islands, and resets");

  const { createStreetCompletionTimeline } = require("../src/services/streetCompletionTimeline.ts");
  const timeline = createStreetCompletionTimeline([
    { segmentId: "a", streetId: "street", totalDistanceMeters: 100 },
    { segmentId: "b", streetId: "street", totalDistanceMeters: 100 }
  ]);
  const coverage = (id, count) => ({ segmentId: id, streetId: "street", totalBinCount: 10,
    totalDistanceMeters: 100, walkedDistanceMeters: count * 10,
    coveredBinIndexes: Array.from({ length: count }, (_, index) => index) });
  timeline.append([coverage("a", 10)], "2026-01-01T10:00:00.000Z");
  timeline.append([coverage("a", 10)], "2026-01-02T10:00:00.000Z");
  assert.equal(timeline.completedAtByStreetId.street, undefined);
  timeline.append([coverage("b", 8)], "2026-01-03T10:00:00.000Z");
  timeline.append([coverage("b", 10)], "2026-09-22T10:00:00.000Z");
  assert.equal(timeline.completedAtByStreetId.street, "2026-01-03T10:00:00.000Z");
  console.log("PASS historical street dates use the first cumulative threshold crossing without duplicate credit");

  let sqlite = new DatabaseSync(":memory:");
  let stopBeforeTen = true, stopBeforeThirtyOne = true, stopBeforeThirtySeven = true, failRemoval = false, failCopy = false;
  const adapter = {
    async execAsync(sql) {
      // Emulate an older expedition kind constraint so migration 31 must rebuild it.
      if (sql.includes("CREATE TABLE IF NOT EXISTS district_expeditions (")) {
        sql = sql.replace("'grand_tour'", "'legacy_kind'");
      }
      if (failCopy && sql.includes("CREATE TABLE IF NOT EXISTS loop_fills_next")) {
        sqlite.exec(sql.slice(0, sql.indexOf("DROP TABLE loop_fills;")));
        failCopy = false;
        throw new Error("injected migration interruption");
      }
      if (failRemoval && sql.includes("DROP TABLE IF EXISTS district_expedition_loop_evidence;")) {
        sqlite.exec("DROP TABLE district_expedition_loop_evidence;");
        failRemoval = false;
        throw new Error("injected removal interruption");
      }
      sqlite.exec(sql);
    },
    async getFirstAsync(sql, ...params) {
      if (stopBeforeTen && sql.includes("schema_migrations") && params[0] === 10) throw new Error("fixture setup complete");
      if (stopBeforeThirtyOne && sql.includes("schema_migrations") && params[0] === 31) throw new Error("expedition fixture setup complete");
      if (stopBeforeThirtySeven && sql.includes("schema_migrations") && params[0] === 37) throw new Error("removal fixture setup complete");
      return sqlite.prepare(sql).get(...params.flat());
    },
    async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params.flat()); },
    async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params.flat()); },
    async closeAsync() {},
    async withExclusiveTransactionAsync(fn) {
      sqlite.exec("BEGIN");
      try { await fn(adapter); sqlite.exec("COMMIT"); }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    }
  };
  const originalLoad = Module._load;
  Module._load = function(request) {
    if (request === "expo-sqlite") return { openDatabaseAsync: async () => adapter };
    if (request === "expo-file-system") return {};
    // Catalogue availability is a preflight dependency; fixture definitions are seeded below.
    if (request === "./medalRepository") return { ensureMedalAlbumSeeded: async () => ({ id: "fixture" }) };
    return originalLoad.apply(this, arguments);
  };
  try {
    const { initDatabase } = require("../src/database/db.ts");
    await assert.rejects(initDatabase(), /fixture setup complete/);
    stopBeforeTen = false;
    sqlite.exec(`INSERT INTO walk_sessions(id,activity_mode,started_at,ended_at,distance_meters,duration_seconds)
      VALUES(1,'walk','2026-01-01','2026-01-02',100,100);
      INSERT INTO loop_fills(id,session_id,mode,polygon_json,area_m2,total_walkable_street_length_m,unwalked_walkable_street_length_m,accepted,rejection_reason,created_at)
      VALUES(1,1,'walk','[]',225,10,0,1,NULL,'2026-01-01');`);
    failCopy = true;
    await assert.rejects(initDatabase(), /injected migration interruption/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM loop_fills").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id=10").get().n, 0);
    // Also recover a partial table left by an older, non-transactional release.
    sqlite.exec("CREATE TABLE loop_fills_next AS SELECT * FROM loop_fills;");
    await assert.rejects(initDatabase(), /expedition fixture setup complete/);
    sqlite.exec(`INSERT INTO district_expeditions VALUES
      ('fixture','district','District','2026-01-01',0,'explore_cells',10,10,'2026-01-01',NULL,'2026-01-02','2026-01-02');
      INSERT INTO district_expedition_seals VALUES
      ('seal:fixture','fixture','district','District','2026-01-01','explore_cells','2026-01-02');
      INSERT INTO district_expedition_loop_evidence VALUES ('fixture',1,'2026-01-02');`);
    stopBeforeThirtyOne = false;
    await assert.rejects(initDatabase(), /removal fixture setup complete/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM loop_fills").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 36);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM district_expedition_seals").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM district_expedition_loop_evidence").get().n, 1);
    assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
    const retainedTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'district_expedition%' AND name NOT IN ('schema_migrations','sqlite_sequence') ORDER BY name").all().map(row => row.name);
    const snapshot = () => retainedTables.map(name => [name, sqlite.prepare('SELECT * FROM "' + name + '"').all()]);
    const beforeRemoval = snapshot();
    stopBeforeThirtySeven = false;
    failRemoval = true;
    await assert.rejects(initDatabase(), /injected removal interruption/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM district_expedition_loop_evidence").get().n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id=37").get().n, 0);
    await initDatabase();
    assert.deepEqual(snapshot(), beforeRemoval);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'district_expedition%'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 37);
    assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
    delete require.cache[require.resolve("../src/database/db.ts")];
    await require("../src/database/db.ts").initDatabase();
    assert.deepEqual(snapshot(), beforeRemoval);
    console.log("PASS expedition removal rolls back on interruption, retries, preserves other tables, and reopens safely");
    console.log("PASS migration interruption rolls back, old partial copies recover, and the complete schema initializes");

    const repo = require("../src/database/streetCompletionRepository.ts");
    await repo.replaceStreetCompletionV2({ completedAtByStreetId: timeline.completedAtByStreetId,
      captureLegacyEvidence: false, legacyMatchedSegments: [], processedRecordingCount: 1,
      totalRecordingCount: 1, sessionCoverage: [], segmentProgress: [
        { segmentId: "a", streetId: "street", name: "Fixture", highway: "residential",
          walkedDistanceMeters: 100, totalDistanceMeters: 100, completionPercent: 100 }
      ] });
    assert.equal(sqlite.prepare("SELECT completed_at FROM street_completion_segments").get().completed_at,
      "2026-01-03T10:00:00.000Z");
    console.log("PASS an empty restored street cache receives historical dates rather than rebuild time");

    const backup = require("../src/services/backupV5.ts");
    const walks = require("../src/database/walkRepository.ts");
    sqlite.exec(`INSERT INTO gps_points(id, session_id, latitude, longitude, timestamp, accuracy, point_index)
      VALUES (10,1,45.76,4.84,'2026-01-01T10:00:00.000Z',5,0);
      INSERT INTO medal_albums(id,city_id,city_name_json,definition_version,published_at,source_attribution)
      VALUES('fixture','city','{}',1,'2026-01-01','fixture');
      INSERT INTO medals VALUES('fixture-medal','landmark','{}','{}',45.76,4.84,'fixture','node',1);
      INSERT INTO medal_album_items VALUES('fixture','fixture-medal',0);
      INSERT INTO medal_acquisition_events VALUES(1,'fixture','fixture-medal',1,'recording','loop','1:1',225,'["1:1"]','2026-01-02');
      INSERT INTO collected_medals VALUES('fixture','fixture-medal',1,'presented','2026-01-02');
      INSERT INTO zone_achievements VALUES('district','district','District','2026-01-02',1,1,'2026-01-01','osm','fixture');
      INSERT INTO forbidden_zones VALUES(1,'[]',225,'fixture','2026-01-01','2026-01-01');
      INSERT INTO forbidden_zone_cells VALUES(1,15,1,1);`);
    const takeSnapshot = () => walks.withBackupV5Snapshot(async ({ metadata, loadSessions }) => ({
      metadata, data: await loadSessions(metadata.sessions.map(session => session.id))
    }));
    const original = await takeSnapshot();
    assert.equal(Object.hasOwn(original.metadata, "expeditionSystem"), false);
    const legacy = { ...backup.createBackupV5Manifest(original.metadata), expeditionSystem: {
      expeditions: [{ id: "retired" }], seals: [{ expeditionId: "retired" }],
      loopEvidence: [{ expeditionId: "retired", sessionId: 99999 }]
    } };
    async function* fixtureBlocks() { yield original.data; }
    async function* interruptedBlocks() { yield original.data; throw new Error("restore interrupted"); }
    await assert.rejects(walks.restoreBackupV5Data(legacy, interruptedBlocks()), /restore interrupted/);
    assert.deepEqual((await takeSnapshot()).data, original.data);
    await walks.restoreBackupV5Data(legacy, fixtureBlocks());
    const restored = await takeSnapshot();
    assert.deepEqual(restored.data, original.data);
    for (const key of ["sessions", "medalSystem", "zoneAchievements", "forbiddenZones"])
      assert.deepEqual(restored.metadata[key], original.metadata[key]);
    assert.equal(Object.hasOwn(restored.metadata, "expeditionSystem"), false);
    assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
    await walks.deleteAllData();
    assert.equal((await takeSnapshot()).metadata.sessions.length, 0);
    console.log("PASS actual legacy restore/export preserves walks, GPS, medals, achievements and Forbidden Zones; interruption rolls back and delete-all works without retired tables");

    const { inspectBackupV5File } = require("../src/services/backupV5File.ts");
    const sessions = Array.from({ length: 3 }, (_, index) => ({ id: index + 1, activityMode: "walk",
      displayName: null, startedAt: `2026-01-0${index + 1}T08:00:00.000Z`,
      endedAt: `2026-01-0${index + 1}T09:00:00.000Z`, distanceMeters: 0,
      durationSeconds: 3600, stepCount: 0, pointCount: 0 }));
    const manifest = backup.createBackupV5Manifest({ appVersion: "0.34.3", exportedAt: new Date().toISOString(),
      sessions, medalSystem: { acquisitionEvents: [], collectedMedals: [], retroScanSettings: [] }, zoneAchievements: [] });
    const manifestRecord = backup.encodeBackupV5Record(1, manifest);
    const records = [backup.BACKUP_V5_MAGIC, manifestRecord.bytes], checksums = [];
    for (const plan of manifest.blocks) {
      const record = backup.encodeBackupV5Record(2, backup.createBackupV5BlockPayload(plan,
        [{ sessionId: plan.sessionIds[0], points: [], routeSnapshot: null }]));
      records.push(record.bytes); checksums.push(record.checksum);
    }
    records.push(backup.encodeBackupV5Record(255, { backupId: manifest.backupId, blockChecksums: checksums,
      manifestChecksum: manifestRecord.checksum, recordCount: manifest.blocks.length + 2, totalPointCount: 0 }).bytes);
    const bytes = Buffer.concat(records);
    const file = { size: bytes.length, open() { return { offset: 0, size: bytes.length, close() {},
      readBytes(n) { const value = bytes.subarray(this.offset, this.offset + n); this.offset += value.length; return value; } }; } };
    let heartbeat = false;
    setTimeout(() => { heartbeat = true; }, 0);
    await inspectBackupV5File(file);
    assert(heartbeat);
    bytes[bytes.length - 1] ^= 1;
    await assert.rejects(inspectBackupV5File(file));
    console.log("PASS archive inspection yields while retaining complete footer/corruption validation");
    sqlite.close();
    sqlite = new DatabaseSync(":memory:");
    delete require.cache[require.resolve("../src/database/db.ts")];
    await require("../src/database/db.ts").initDatabase();
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n, 37);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'district_expedition%'").get().n, 0);
    console.log("PASS fresh installation initializes all 37 migrations without expedition tables");
  } finally { Module._load = originalLoad; sqlite.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
