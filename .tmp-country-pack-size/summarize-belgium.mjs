import fs from "node:fs";
import readline from "node:readline";

const [inputPath] = process.argv.slice(2);
if (!inputPath) throw new Error("Usage: summarize-belgium.mjs <Statbel.txt>");

const populations = new Map();
const names = new Map();
const stream = fs.createReadStream(inputPath, { encoding: "utf8" });
const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
let header;
for await (const line of lines) {
  const fields = line.split("|");
  if (!header) {
    header = new Map(fields.map((field, index) => [field.replace(/^\uFEFF/, ""), index]));
    continue;
  }
  const code = fields[header.get("CD_REFNIS")];
  const population = Number(fields[header.get("MS_POPULATION")]);
  if (!code || !Number.isFinite(population)) continue;
  populations.set(code, (populations.get(code) ?? 0) + population);
  names.set(code, fields[header.get("TX_DESCR_EN")] || fields[header.get("TX_DESCR_FR")] || fields[header.get("TX_DESCR_NL")]);
}

const municipalities = [...populations].map(([code, population]) => ({
  code,
  name: names.get(code),
  population,
})).sort((a, b) => b.population - a.population);
const totalPopulation = municipalities.reduce((sum, row) => sum + row.population, 0);
let cumulative = 0;
let citiesForHalf = 0;
for (const municipality of municipalities) {
  if (cumulative >= totalPopulation * 0.5) break;
  cumulative += municipality.population;
  citiesForHalf += 1;
}
const top100Population = municipalities.slice(0, 100).reduce((sum, row) => sum + row.population, 0);
process.stdout.write(JSON.stringify({
  municipalityCount: municipalities.length,
  totalPopulation,
  citiesForHalf,
  top100Population,
  top100Share: top100Population / totalPopulation,
  top10: municipalities.slice(0, 10),
}));
