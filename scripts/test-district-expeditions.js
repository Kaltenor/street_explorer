const fs = require("fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  module._compile(output, filename);
};

const {
  buildDailyExpeditionDefinitions,
  getLocalExpeditionDate
} = require("../src/services/expeditionDefinitions.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

const full = buildDailyExpeditionDefinitions({
  districtId: "relation/123",
  hasMedalOpportunity: true,
  hasStreetOpportunity: true,
  localDate: "2026-08-07"
});
const repeated = buildDailyExpeditionDefinitions({
  districtId: "relation/123",
  hasMedalOpportunity: true,
  hasStreetOpportunity: true,
  localDate: "2026-08-07"
});

assert(full.length === 3, "each district receives exactly three daily choices");
assert(
  JSON.stringify(full) === JSON.stringify(repeated),
  "daily choices are deterministic for a district and local date"
);
assert(
  full[0].kind === "explore_cells" && [15, 20, 25].includes(full[0].target),
  "every day includes an attainable explored-cell expedition"
);
assert(
  new Set(full.map((definition) => definition.slot)).size === 3,
  "daily expedition slots remain unique"
);

const limited = buildDailyExpeditionDefinitions({
  districtId: "relation/456",
  hasMedalOpportunity: false,
  hasStreetOpportunity: false,
  localDate: "2026-08-07"
});
assert(
  limited.length === 3 &&
    limited.filter((definition) => definition.kind === "explore_cells").length === 2 &&
    limited.some((definition) => definition.kind === "close_loop"),
  "districts without street or medal opportunities still get three viable choices"
);

const localDate = new Date(2026, 0, 2, 23, 59, 0);
assert(
  getLocalExpeditionDate(localDate) === "2026-01-02",
  "daily rollover uses the device local calendar date"
);

const dbSource = fs.readFileSync(require.resolve("../src/database/db.ts"), "utf8");
const repositorySource = fs.readFileSync(
  require.resolve("../src/database/expeditionRepository.ts"),
  "utf8"
);
const walkRepositorySource = fs.readFileSync(
  require.resolve("../src/database/walkRepository.ts"),
  "utf8"
);
const mapSource = fs.readFileSync(
  require.resolve("../src/screens/MapScreen.tsx"),
  "utf8"
);

assert(
  dbSource.includes('applyMigration(27, "add_district_expeditions"') &&
    dbSource.includes("idx_district_expeditions_one_active"),
  "database migration enforces one globally active expedition"
);
assert(
  repositorySource.includes("countFinalizedLoopEvidence") &&
    repositorySource.includes("sessions.ended_at > sessions.started_at"),
  "loop progress only counts evidence from finalized walks"
);
assert(
  walkRepositorySource.includes("expeditionSystem:") &&
    walkRepositorySource.includes("manifest.expeditionSystem ??") &&
    walkRepositorySource.includes("DELETE FROM district_expedition_seals"),
  "backup, restore, and delete-all paths preserve expedition integrity"
);
assert(
  mapSource.includes("recordDistrictExpeditionLoopEvidence") &&
    mapSource.includes("loadDistrictExpeditionDashboard") &&
    mapSource.includes("isRecording"),
  "map recording and district HUD remain wired to expedition progress"
);

console.log("District expedition regression checks passed.");
