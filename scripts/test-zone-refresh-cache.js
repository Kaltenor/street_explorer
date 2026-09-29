const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const { shouldReplaceCachedZone, EXACT_ZONE_BOUNDARY_SOURCE } = require("../src/services/zoneBoundaryPolicy.ts");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE zones(id TEXT PRIMARY KEY,type TEXT,name TEXT,parent_zone_id TEXT,admin_level INTEGER,source TEXT,geometry_json TEXT,fetched_at TEXT);
CREATE TABLE zone_cell_totals(zone_id TEXT PRIMARY KEY,total_cells INTEGER);
CREATE TABLE zone_completion_snapshots(zone_id TEXT,mode TEXT,stats_json TEXT,FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE CASCADE);
`);
const transaction = {
  async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params); },
  async runAsync(sql, ...params) { return sqlite.prepare(sql).run(...params); }
};
const db = { async withExclusiveTransactionAsync(callback) {
  sqlite.exec("BEGIN IMMEDIATE");
  try { await callback(transaction); sqlite.exec("COMMIT"); }
  catch (error) { sqlite.exec("ROLLBACK"); throw error; }
}};
const source = fs.readFileSync("src/database/completionRepository.ts", "utf8");
const ast = ts.createSourceFile("repository.ts", source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "upsertZones");
assert(declaration);
const upsert = vm.runInNewContext(ts.transpileModule(`(${declaration.getText(ast).replace(/^export /, "")})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText, { getDatabase: async () => db, shouldReplaceCachedZone });
async function main() {
  const zone = { id: "fixture", type: "city", name: "Fixture", parentZoneId: null, adminLevel: 8,
    source: EXACT_ZONE_BOUNDARY_SOURCE, geometry: [[{ latitude: 45, longitude: 4 }]], holes: [], fetchedAt: "2026-09-01" };
  await upsert([zone]);
  const seed = () => sqlite.exec(`INSERT INTO zone_cell_totals VALUES('fixture',123); INSERT INTO zone_completion_snapshots VALUES('fixture','walk','saved');`);
  seed();
  await upsert([{ ...zone, fetchedAt: "2026-09-29", name: "Updated name" }]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM zone_completion_snapshots").get().n, 1,
    "an unchanged refreshed boundary must not cascade-delete the completion snapshot");
  assert.equal(sqlite.prepare("SELECT total_cells n FROM zone_cell_totals").get().n, 123);
  assert.equal(sqlite.prepare("SELECT fetched_at FROM zones").get().fetched_at, "2026-09-29");
  await upsert([{ ...zone, geometry: [[{ latitude: 46, longitude: 4 }]] }]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM zone_completion_snapshots").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM zone_cell_totals").get().n, 0);
  // A source upgrade invalidates results even if the serialized ring is unchanged.
  sqlite.prepare("UPDATE zones SET source='legacy_bounds'").run(); seed();
  await upsert([{ ...zone, geometry: [[{ latitude: 46, longitude: 4 }]] }]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM zone_completion_snapshots").get().n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM zone_cell_totals").get().n, 0);
  console.log("PASS actual SQLite boundary refresh preserves unchanged completion caches; changed geometry/source invalidates them");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sqlite.close());
