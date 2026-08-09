import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, mode, outputPath] = process.argv.slice(2);
if (!inputPath) throw new Error("Usage: inspect-workbook.mjs <input.xlsx>");

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const result = [];
for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange();
  if (mode === "preview") {
    const values = used?.values ?? [];
    result.push({ name: sheet.name, address: used?.address ?? null, values: values.slice(0, 20).map((row) => row.slice(0, 20)) });
    continue;
  }
  if (mode === "population-summary" || mode === "population-source") {
    const values = used?.values ?? [];
    const headerIndex = values.findIndex((row) =>
      row.some((value) => String(value ?? "").toUpperCase().startsWith("POB")),
    );
    const header = values[headerIndex] ?? [];
    const populationIndex = header.findIndex((value) =>
      String(value ?? "").toUpperCase().startsWith("POB"),
    );
    const nameIndex = header.findIndex((value) =>
      ["NOMBRE", "NAME", "MUNICIPALITY"].includes(String(value ?? "").toUpperCase()),
    );
    const provinceCodeIndex = header.findIndex((value) => String(value ?? "").toUpperCase() === "CPRO");
    const municipalityCodeIndex = header.findIndex((value) => String(value ?? "").toUpperCase() === "CMUN");
    const provinceIndex = header.findIndex((value) => String(value ?? "").toUpperCase() === "PROVINCIA");
    const municipalities = values
      .slice(headerIndex + 1)
      .map((row) => ({
        code: provinceCodeIndex >= 0 && municipalityCodeIndex >= 0
          ? `${String(row[provinceCodeIndex] ?? "").padStart(2, "0")}${String(row[municipalityCodeIndex] ?? "").padStart(3, "0")}`
          : undefined,
        name: String(row[nameIndex] ?? ""),
        population: Number(row[populationIndex]),
        province: provinceIndex >= 0 ? String(row[provinceIndex] ?? "") : undefined,
      }))
      .filter((row) => row.name && Number.isFinite(row.population) && row.population > 0)
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
    if (mode === "population-source") {
      const source = {
        source: "INE official municipal population workbook, 1 January 2023",
        sourceUrl: "https://www.ine.es/en/pob_xls/pobmun_en.zip",
        municipalityCount: municipalities.length,
        nationalPopulation: totalPopulation,
        citiesNeededForHalf: citiesForHalf,
        top100Population,
        top100Share: top100Population / totalPopulation,
        municipalities: municipalities.slice(0, 100),
      };
      if (!outputPath) throw new Error("population-source mode requires an output path");
      await fs.mkdir(new URL(".", `file:///${outputPath.replaceAll("\\", "/")}`).pathname, { recursive: true }).catch(() => {});
      await fs.writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`);
      result.push({ outputPath, municipalityCount: source.municipalities.length });
      continue;
    }
    result.push({
      name: sheet.name,
      municipalityCount: municipalities.length,
      totalPopulation,
      citiesForHalf,
      top100Population,
      top100Share: top100Population / totalPopulation,
      top10: municipalities.slice(0, 10),
    });
    continue;
  }
  result.push({
    name: sheet.name,
    address: used?.address ?? null,
    values: used?.values ?? [],
  });
}
process.stdout.write(JSON.stringify(result));
