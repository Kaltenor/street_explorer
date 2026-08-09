import fs from "node:fs/promises";

const [inputPath] = process.argv.slice(2);
if (!inputPath) throw new Error("Usage: summarize-germany.mjs <GV100AD.txt>");

const text = (await fs.readFile(inputPath)).toString("utf8");
const municipalities = text.split(/\r?\n/)
  .filter((line) => line.startsWith("60"))
  .map((line) => ({
    code: line.slice(10, 18),
    name: line.slice(22, 72).trim(),
    population: Number(line.slice(139, 150)),
  }))
  .filter((row) => row.code && row.name && Number.isFinite(row.population) && row.population > 0)
  .sort((a, b) => b.population - a.population);
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
