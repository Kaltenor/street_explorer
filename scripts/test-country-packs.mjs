import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packDirectory = path.join(repositoryRoot, "country-packs/v1");
const expectedCountries = ["be", "de", "es", "it", "nl"];
const albumIds = new Set();
const zoneIds = new Set();
const medalIds = new Set();
let totalAlbums = 0;
let totalMedals = 0;

for (const countryCode of expectedCountries) {
  const descriptorPath = path.join(packDirectory, `${countryCode}-v1-descriptor.json`);
  const qualityPath = path.join(packDirectory, `${countryCode}-v1-quality.json`);
  const packPath = path.join(packDirectory, `${countryCode}-v1.json.gz`);
  assert(fs.existsSync(descriptorPath), `${countryCode} descriptor exists`);
  assert(fs.existsSync(qualityPath), `${countryCode} quality report exists`);
  assert(fs.existsSync(packPath), `${countryCode} compressed pack exists`);

  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
  const quality = JSON.parse(fs.readFileSync(qualityPath, "utf8"));
  const compressed = fs.readFileSync(packPath);
  const expanded = zlib.gunzipSync(compressed);
  const pack = JSON.parse(expanded.toString("utf8"));

  assert(descriptor.countryCode === countryCode, `${countryCode} descriptor identity matches`);
  assert(descriptor.compressedBytes === compressed.byteLength, `${countryCode} compressed size matches`);
  assert(descriptor.uncompressedBytes === expanded.byteLength, `${countryCode} expanded size matches`);
  assert(
    descriptor.sha256 === crypto.createHash("sha256").update(compressed).digest("hex"),
    `${countryCode} checksum matches`
  );
  assert(descriptor.compressedBytes <= 250000, `${countryCode} remains inside the per-pack budget`);
  assert(pack.countryCode === countryCode && pack.version === descriptor.version, `${countryCode} pack metadata matches`);
  assert(pack.albums.length === descriptor.albums.length, `${countryCode} album count matches`);
  assert(quality.cities.length === pack.albums.length, `${countryCode} quality roster matches`);

  let countryMedals = 0;
  for (const album of pack.albums) {
    verify(!albumIds.has(album.id), `Duplicate album id ${album.id}`);
    verify(!zoneIds.has(album.cityZoneId), `Duplicate zone id ${album.cityZoneId}`);
    verify(album.countryCode === countryCode, `${album.id} has the wrong country identity`);
    verify(album.medals.length >= 5, `${album.id} is below the five-medal floor`);
    albumIds.add(album.id);
    zoneIds.add(album.cityZoneId);

    for (const medal of album.medals) {
      verify(!medalIds.has(medal.id), `Duplicate medal id ${medal.id}`);
      verify(
        medal.name.en && medal.name.fr && medal.name[album.localLanguage] &&
          medal.description.en && medal.description.fr && medal.description[album.localLanguage],
        `${medal.id} has English, French, and local-language copy`
      );
      verify(
        Number.isFinite(medal.latitude) && Number.isFinite(medal.longitude),
        `${medal.id} has finite coordinates`
      );
      verify(
        !JSON.stringify(medal).includes("\uFFFD"),
        `${medal.id} contains no Unicode replacement characters`
      );
      medalIds.add(medal.id);
      countryMedals += 1;
    }
  }
  assert(true, `${countryCode} album, zone, medal, locale, and coordinate integrity passes`);
  assert(countryMedals === descriptor.medalCount, `${countryCode} medal count matches`);
  totalAlbums += pack.albums.length;
  totalMedals += countryMedals;
}

const estimate = JSON.parse(
  fs.readFileSync(path.join(packDirectory, "wave-1-size-estimate.json"), "utf8")
);
const results = JSON.parse(
  fs.readFileSync(path.join(packDirectory, "wave-1-results.json"), "utf8")
);
assert(estimate.decision === "go", "the recorded pre-build size gate passed");
assert(results.totals.compressedBudgetUtilization <= 1, "the actual wave fits its download budget");
assert(results.totals.expandedBudgetUtilization <= 1, "the actual wave fits its cache budget");
assert(totalAlbums === results.totals.cityCount + 58, "catalogue album rollup includes the Dutch pilot");
assert(totalMedals === results.totals.medalCount + 492, "catalogue medal rollup includes the Dutch pilot");

const storageReport = JSON.parse(
  fs.readFileSync(path.join(packDirectory, "medal-storage-report.json"), "utf8")
);
assert(
  storageReport.countries.fr.albumCount === 500 &&
    storageReport.countries.fr.medalCount === 6082 &&
    storageReport.countries.fr.sqliteBytes === 3682304,
  "France storage report matches the frozen top-500 catalogue"
);
for (const countryCode of expectedCountries) {
  const descriptor = JSON.parse(
    fs.readFileSync(path.join(packDirectory, `${countryCode}-v1-descriptor.json`), "utf8")
  );
  const storage = storageReport.countries[countryCode];
  assert(
    storage.albumCount === descriptor.albums.length &&
      storage.medalCount === descriptor.medalCount &&
      storage.distributedBytes === descriptor.compressedBytes &&
      storage.sqliteBytes > storage.sqliteEmptySchemaBytes,
    `${countryCode} storage report matches the published pack`
  );
}

console.log(`All country-pack checks passed for ${totalAlbums} albums and ${totalMedals} medals.`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function verify(condition, message) {
  if (!condition) throw new Error(message);
}
