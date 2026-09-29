const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const { serializeDatabaseWrites } = require("../src/database/serializedWrites.ts");
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
async function writes() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "street-writer-test-"));
  const file = path.join(directory, "fixture.db");
  const main = new DatabaseSync(file);
  main.exec("PRAGMA journal_mode=WAL; CREATE TABLE points(id INTEGER PRIMARY KEY); CREATE TABLE refs(id INTEGER REFERENCES points(id));");
  const adapter = db => ({
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
    async getFirstAsync(sql) { return db.prepare(sql).get(); },
    async closeAsync() { db.close(); }
  });
  const db = serializeDatabaseWrites(adapter(main), async () => adapter(new DatabaseSync(file)));
  try {
    const hold = deferred();
    const first = db.withExclusiveTransactionAsync(async tx => {
      assert.equal((await tx.getFirstAsync("PRAGMA busy_timeout")).timeout, 5000);
      assert.equal((await tx.getFirstAsync("PRAGMA foreign_keys")).foreign_keys, 1);
      await tx.runAsync("INSERT INTO points VALUES(1)");
      await hold.promise;
    });
    await flush();
    const second = db.withExclusiveTransactionAsync(tx => tx.runAsync("INSERT INTO points VALUES(2)"));
    const single = db.runAsync("INSERT INTO points VALUES(3)");
    assert.equal((await db.getFirstAsync("SELECT COUNT(*) n FROM points")).n, 0, "WAL reader stays available before commit");
    hold.resolve(); await Promise.all([first, second, single]);
    assert.equal(main.prepare("SELECT COUNT(*) n FROM points").get().n, 3);
    await assert.rejects(db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync("INSERT INTO points VALUES(4)"); throw Error("interrupted");
    }), /interrupted/);
    assert.equal(main.prepare("SELECT COUNT(*) n FROM points").get().n, 3);
    await assert.rejects(db.withExclusiveTransactionAsync(tx => tx.runAsync("INSERT INTO refs VALUES(999)")), /FOREIGN KEY/);
    await db.runAsync("INSERT INTO points VALUES(5)");
    assert.equal(main.prepare("SELECT COUNT(*) n FROM points").get().n, 4, "failure does not poison subsequent GPS writes");
  } finally { main.close(); fs.rmSync(directory, { recursive: true }); }
  let calls = 0, closed = 0, rolledBack = 0;
  const failBegin = serializeDatabaseWrites({ runAsync: async () => {}, execAsync: async () => {} }, async () => ({
    execAsync: async sql => { if (sql.startsWith("BEGIN")) throw Error("database is locked"); if (sql.startsWith("ROLLBACK")) rolledBack++; },
    closeAsync: async () => { closed++; }
  }));
  await assert.rejects(failBegin.withExclusiveTransactionAsync(async () => { calls++; }), /locked/);
  assert.equal(calls, 0); assert.equal(closed, 1); assert.equal(rolledBack, 0);
  console.log("PASS real SQLite concurrent GPS/transaction writes, WAL reads, rollback, foreign keys and failed BEGIN cleanup");
}
async function recovery() {
  const filename = path.resolve(__dirname, "../src/screens/MapScreen.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" &&
        node.arguments[0]?.getText(ast).includes("let claimedSessionId")) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(effect);
  const requests = [], recovered = [];
  const ref = { current: null };
  const noop = () => {};
  const context = {
    console: { info: noop, warn: noop }, permissionState: "denied",
    isStartingRecordingRef: { current: false }, isStoppingRecordingRef: { current: false },
    activeWalk: null, recoverableRecording: null, recoveryPromptedSessionRef: ref,
    recoveryFailureAlertShownRef: { current: false }, setIsRecoveryCheckComplete: noop,
    drainPendingBackgroundLocationBatches: async () => {},
    getActiveRecordingSettings: async () => ({ sessionId: 240, activityMode: "walk" }),
    getWalkSessionById: () => { const request = deferred(); requests.push(request); return request.promise; },
    getGpsPointsForSession: async () => [{ latitude: 45, longitude: 4 }],
    getBackgroundLocationRecoveryStatus: async () => "active",
    setRecoverableRecording: value => recovered.push(value),
    setBackgroundTrackingStatus: noop, setBackgroundTrackingMessage: noop,
    Alert: { alert: () => { throw Error("unexpected alert"); } }
  };
  const run = vm.runInNewContext(ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const cleanupFirst = run(); await flush(); assert.equal(requests.length, 1);
  cleanupFirst(); const cleanupSecond = run(); await flush();
  assert.equal(requests.length, 2, "replacement recovery is not skipped behind a stale session claim");
  const session = { id: 240, activityMode: "walk", startedAt: "2026-09-29T10:38:58Z", endedAt: "2026-09-29T10:38:58Z" };
  requests[0].resolve(session); await flush();
  assert.equal(ref.current, 240, "canceled attempt cannot clear replacement's claim");
  assert.equal(recovered.length, 0);
  requests[1].resolve(session); await flush();
  assert.equal(recovered.length, 1); assert.equal(recovered[0].session.id, 240);
  assert.equal(recovered[0].points.length, 1); cleanupSecond();
  console.log("PASS canceled recovery releases claim immediately and late completion cannot steal replacement recovery");
}
(async () => { await writes(); await recovery(); })().catch(error => { console.error(error); process.exitCode = 1; });
