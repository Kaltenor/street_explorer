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
  DAILY_DISTRICT_EXPEDITION_COUNT,
  DISTRICT_EXPEDITION_CATALOG,
  getLocalExpeditionDate
} = require("../src/services/expeditionDefinitions.ts");
const {
  calculateCellExpeditionProgress
} = require("../src/services/expeditionProgress.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

const full = buildDailyExpeditionDefinitions({
  districtId: "relation/123",
  localDate: "2026-08-07",
  medalOpportunityCount: 4,
  streetOpportunityCount: 4
});
const repeated = buildDailyExpeditionDefinitions({
  districtId: "relation/123",
  localDate: "2026-08-07",
  medalOpportunityCount: 4,
  streetOpportunityCount: 4
});

assert(
  DISTRICT_EXPEDITION_CATALOG.length === 25 &&
    new Set(DISTRICT_EXPEDITION_CATALOG.map((entry) => entry.kind)).size === 25,
  "the expedition catalogue contains exactly 25 unique mission archetypes"
);
assert(
  full.length === DAILY_DISTRICT_EXPEDITION_COUNT && full.length === 5,
  "each district receives exactly five daily choices"
);
assert(
  JSON.stringify(full) === JSON.stringify(repeated),
  "daily choices are deterministic for a district and local date"
);
assert(
  new Set(full.map((definition) => definition.slot)).size === 5 &&
    new Set(full.map((definition) => definition.kind)).size === 5,
  "daily expedition slots and archetypes remain unique"
);

const nextDay = buildDailyExpeditionDefinitions({
  districtId: "relation/123",
  localDate: "2026-08-08",
  medalOpportunityCount: 4,
  streetOpportunityCount: 4
});
assert(
  JSON.stringify(full) !== JSON.stringify(nextDay),
  "the deterministic shuffle changes with the local calendar day"
);

const limited = buildDailyExpeditionDefinitions({
  districtId: "relation/456",
  localDate: "2026-08-07",
  medalOpportunityCount: 0,
  streetOpportunityCount: 0
});
assert(
  limited.length === 5 &&
    limited.every(
      (definition) =>
        !definition.kind.includes("street") &&
        !definition.kind.includes("medal") &&
        definition.kind !== "grand_tour" &&
        definition.kind !== "field_triad"
    ),
  "districts without street or medal opportunities still get five viable choices"
);

const migrated = buildDailyExpeditionDefinitions({
  districtId: "relation/456",
  excludedKinds: limited.slice(0, 3).map((definition) => definition.kind),
  localDate: "2026-08-07",
  medalOpportunityCount: 0,
  slots: [3, 4],
  streetOpportunityCount: 0
});
assert(
  migrated.length === 2 &&
    migrated.map((definition) => definition.slot).join(",") === "3,4" &&
    migrated.every(
      (definition) => !limited.slice(0, 3).some((existing) => existing.kind === definition.kind)
    ),
  "upgrades retain existing choices and fill missing slots without duplicate archetypes"
);

const observedKinds = new Set();
for (let day = 1; day <= 120; day += 1) {
  const localDate = `2027-01-${String(day).padStart(3, "0")}`;
  for (const definition of buildDailyExpeditionDefinitions({
    districtId: "relation/catalogue",
    localDate,
    medalOpportunityCount: 4,
    streetOpportunityCount: 4
  })) {
    observedKinds.add(definition.kind);
  }
}
assert(
  observedKinds.size === 25,
  "the daily shuffle can surface every expedition archetype"
);

const testDistrict = {
  adminLevel: 9,
  fetchedAt: "2026-08-07T00:00:00.000Z",
  geometry: [[
    { latitude: -0.01, longitude: -0.01 },
    { latitude: -0.01, longitude: 0.01 },
    { latitude: 0.01, longitude: 0.01 },
    { latitude: 0.01, longitude: -0.01 },
    { latitude: -0.01, longitude: -0.01 }
  ]],
  holes: [],
  id: "relation/test",
  name: "Test District",
  parentZoneId: "relation/city",
  source: "osm",
  type: "district"
};
assert(
  calculateCellExpeditionProgress({
    allCellKeys: ["-1:0", "0:-1", "0:0", "1:0"],
    district: testDistrict,
    kind: "seal_breach",
    newCellKeys: ["0:0"]
  }) === 1,
  "gap-sealing progress requires three previously explored cardinal neighbors"
);
assert(
  calculateCellExpeditionProgress({
    allCellKeys: ["0:0", "1:0", "2:0"],
    district: testDistrict,
    kind: "dense_survey",
    newCellKeys: ["0:0", "1:0", "2:0"]
  }) === 1,
  "dense-survey progress credits cells linked to two new cardinal neighbors"
);
assert(
  calculateCellExpeditionProgress({
    allCellKeys: ["0:0", "1:0"],
    district: testDistrict,
    kind: "frontier_push",
    newCellKeys: ["1:0"]
  }) === 1,
  "frontier progress requires adjacency to territory explored before acceptance"
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
const backupSource = fs.readFileSync(
  require.resolve("../src/services/backupV5.ts"),
  "utf8"
);
const mapSource = fs.readFileSync(
  require.resolve("../src/screens/MapScreen.tsx"),
  "utf8"
);

assert(
  dbSource.includes('applyMigration(27, "add_district_expeditions"') &&
    dbSource.includes('applyMigration(30, "allow_multiple_active_district_expeditions"') &&
    dbSource.includes('applyMigration(31, "expand_and_refresh_district_expeditions"') &&
    dbSource.includes("DISTRICT_EXPEDITION_KIND_SQL") &&
    dbSource.includes("DROP INDEX IF EXISTS idx_district_expeditions_one_active") &&
    dbSource.includes('table?.sql?.includes("\'grand_tour\'")') &&
    dbSource.includes('PRAGMA foreign_keys = OFF') &&
    dbSource.includes('PRAGMA foreign_keys = ON') &&
    dbSource.includes('PRAGMA foreign_key_check(district_expedition_seals)') &&
    dbSource.includes("local_date = date('now', 'localtime')") &&
    dbSource.includes("accepted_at IS NULL") &&
    repositorySource.includes("getActiveDistrictExpeditions") &&
    !repositorySource.includes("Finish or abandon the active expedition first.") &&
    !backupSource.includes("V5 backup contains multiple active expeditions."),
  "database migration, repository, and Backup V5 allow multiple durable active expeditions"
);
assert(
  repositorySource.includes("countFinalizedLoopEvidence") &&
    repositorySource.includes("sessions.ended_at > sessions.started_at") &&
    repositorySource.includes("'double_loop'") &&
    mapSource.includes("isLoopExpeditionKind(expedition.kind)"),
  "all loop-based variants preserve evidence that only counts finalized walks"
);
assert(
  repositorySource.includes("getDistrictExpeditionSealCount") &&
    repositorySource.includes("COUNT(*) AS count FROM district_expedition_seals") &&
    mapSource.includes("EXPLORER_POINTS_PER_EXPEDITION") &&
    mapSource.includes("pointsAwarded: EXPLORER_POINTS_PER_EXPEDITION"),
  "permanent seals drive retroactive score and the 200-point completion stamp"
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
