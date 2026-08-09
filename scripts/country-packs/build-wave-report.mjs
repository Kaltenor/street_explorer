import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDirectory = path.join(repositoryRoot, "country-packs/v1");
const estimate = JSON.parse(
  fs.readFileSync(path.join(outputDirectory, "wave-1-size-estimate.json"), "utf8")
);
const countries = ["be", "de", "it", "es"].map((countryCode) => {
  const descriptor = JSON.parse(
    fs.readFileSync(path.join(outputDirectory, `${countryCode}-v1-descriptor.json`), "utf8")
  );
  const quality = JSON.parse(
    fs.readFileSync(path.join(outputDirectory, `${countryCode}-v1-quality.json`), "utf8")
  );
  const projected = estimate.countries.find((country) => country.countryCode === countryCode);
  const sourceCounts = quality.cities.reduce((totals, city) => {
    for (const [source, count] of Object.entries(city.sourceCounts ?? {})) {
      totals[source] = (totals[source] ?? 0) + count;
    }
    return totals;
  }, {});
  const candidateCount = quality.cities.reduce(
    (total, city) => total + (city.candidateCount ?? 0),
    0
  );

  return {
    countryCode,
    cityCount: descriptor.albums.length,
    medalCount: descriptor.medalCount,
    candidateCount,
    populationCoverage: quality.expansion.populationCoverage,
    compressedBytes: descriptor.compressedBytes,
    uncompressedBytes: descriptor.uncompressedBytes,
    projectedCompressedBytes: projected.projectedCompressedBytes,
    compressedEstimateRatio: descriptor.compressedBytes / projected.projectedCompressedBytes,
    sourceCounts
  };
});
const totals = countries.reduce((result, country) => ({
  cityCount: result.cityCount + country.cityCount,
  medalCount: result.medalCount + country.medalCount,
  candidateCount: result.candidateCount + country.candidateCount,
  compressedBytes: result.compressedBytes + country.compressedBytes,
  uncompressedBytes: result.uncompressedBytes + country.uncompressedBytes
}), { cityCount: 0, medalCount: 0, candidateCount: 0, compressedBytes: 0, uncompressedBytes: 0 });
const report = {
  generatedAt: new Date().toISOString(),
  estimateDecision: estimate.decision,
  budgets: estimate.budgets,
  countries,
  totals: {
    ...totals,
    compressedBudgetUtilization:
      totals.compressedBytes / estimate.budgets.maximumCompressedBytesForWave,
    expandedBudgetUtilization:
      totals.uncompressedBytes / estimate.budgets.maximumExpandedBytesForWave
  }
};

if (report.totals.compressedBudgetUtilization > 1 || report.totals.expandedBudgetUtilization > 1) {
  throw new Error("The generated country-pack wave exceeds its approved storage budget.");
}
fs.writeFileSync(
  path.join(outputDirectory, "wave-1-results.json"),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(
  `Measured ${totals.cityCount} albums / ${totals.medalCount} medals: ` +
  `${totals.compressedBytes} compressed bytes, ${totals.uncompressedBytes} expanded bytes.`
);
