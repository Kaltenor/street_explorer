import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const appJson = JSON.parse(read("app.json"));
const version = packageJson.version;

assert.equal(packageLock.version, version);
assert.equal(packageLock.packages[""].version, version);
assert.equal(appJson.expo.version, version);
assert.equal(Number(appJson.expo.ios.buildNumber), appJson.expo.android.versionCode);
assert(Number.isInteger(appJson.expo.android.versionCode));
console.log("PASS package, lock, Expo, iOS, and Android release metadata agree");

const contextFiles = [
  "AGENTS.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/CHANGELOG.md",
  "docs/DEVELOPMENT_BUILD.md",
  "docs/MEDAL_SYSTEM_IMPLEMENTATION_PLAN.md",
  "docs/PROJECT_OVERVIEW.md",
  "docs/ROADMAP.md",
  "docs/TESTING.md",
  "assets/player/README.md",
  "assets/sounds/README.md"
];

for (const relativePath of contextFiles) {
  assert(fs.existsSync(path.join(root, relativePath)), `${relativePath} is missing`);
}
console.log("PASS every product, developer, historical, and asset context file exists");

const readme = read("README.md");
const changelog = read("docs/CHANGELOG.md");
assert(readme.includes(`Current version: \`v${version}\``));
assert.equal(changelog.match(/^## v(.+)$/m)?.[1], version);
console.log("PASS README and newest changelog release match the canonical version");

for (const relativePath of contextFiles) {
  const markdown = read(relativePath);
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
    const target = path.resolve(root, path.dirname(relativePath), match[1]);
    assert(
      fs.existsSync(target),
      `${relativePath} link target is missing: ${match[1]}`
    );
  }
}
console.log("PASS local Markdown links resolve across every context file");

const currentContext = [
  readme,
  read("docs/ARCHITECTURE.md"),
  read("docs/PROJECT_OVERVIEW.md"),
  read("docs/ROADMAP.md")
].join("\n");
for (const claim of [
  "851",
  "top 100",
  "Wikipedia",
  "200",
  "Explorer Points",
  "Daylight",
  "Backup V5"
]) {
  assert(currentContext.includes(claim), `Current context is missing: ${claim}`);
}
console.log("PASS current context covers recent catalogue, reader, score, appearance, and backup behavior");

const developmentBuild = read("docs/DEVELOPMENT_BUILD.md");
for (const claim of [
  "clean-cache build 159",
  "France top-100",
  "+200 PTS",
  "Daylight",
  "Wikipedia"
]) {
  assert(developmentBuild.includes(claim), `Development-build context is missing: ${claim}`);
}
console.log("PASS development-build context covers current native and physical-device checks");

const medalHistory = read("docs/MEDAL_SYSTEM_IMPLEMENTATION_PLAN.md");
assert(medalHistory.includes("HISTORICAL DECISION RECORD"));
assert(medalHistory.includes(`Current shipped medal contract (v${version})`));
assert(medalHistory.includes("851 medals"));
console.log("PASS the legacy medal plan is clearly historical and points to the shipped contract");

const agentInstructions = read("AGENTS.md");
for (const requirement of [
  "re-open every affected Markdown/context file",
  "refresh stale descriptions, version references, commands, test procedures, and implementation-status claims",
  "Updating only docs/CHANGELOG.md does not satisfy this requirement"
]) {
  assert(
    agentInstructions.includes(requirement),
    `Agent documentation-sync instruction is missing: ${requirement}`
  );
}
console.log("PASS agent instructions require affected Markdown/context files to be refreshed");

assert.equal(packageJson.scripts["test:docs"], "node scripts/test-doc-consistency.mjs");
console.log("Documentation consistency checks passed.");
