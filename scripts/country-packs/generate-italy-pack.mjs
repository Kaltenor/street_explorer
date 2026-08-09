import fs from "node:fs";
import childProcess from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  normalizeText,
  parseWktPoint,
  queryOsmLandmarksForRelation,
  queryOsmMunicipalityRelations,
  queryWikidata,
  selectBalancedCandidates,
  slugify,
  writeCountryPackArtifacts
} from "./lib/country-pack-build.mjs";

const PUBLISHED_AT = "2026-08-09";
const PACK_VERSION = 1;
const MAX_CITY_COUNT = 100;
const MIN_MEDALS_PER_CITY = 5;
const ICCD_FALLBACK_THRESHOLD = 12;
const ARCO_BATCH_SIZE = 5;
const WIKIDATA_BATCH_SIZE = 1;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const options = parseArguments(process.argv.slice(2));

if (!options.istat) {
  throw new Error(
    "Usage: node scripts/country-packs/generate-italy-pack.mjs --istat=<ISTAT POSAS 2025 municipality CSV>"
  );
}

const inputPath = path.resolve(options.istat);
const cacheDirectory = path.resolve(
  options.cache ?? path.join(path.dirname(inputPath), "generator-cache")
);
fs.mkdirSync(cacheDirectory, { recursive: true });

const allMunicipalities = parseIstatMunicipalities(inputPath);
const nationalPopulation = allMunicipalities.reduce(
  (total, city) => total + city.population,
  0
);
const targetCities = allMunicipalities.slice(0, MAX_CITY_COUNT);
const selectedPopulation = targetCities.reduce(
  (total, city) => total + city.population,
  0
);
console.log(
  `Parsed ${allMunicipalities.length} ISTAT municipalities; top ${targetCities.length} cover ` +
  `${(selectedPopulation / nationalPopulation * 100).toFixed(2)}% of ${nationalPopulation} residents.`
);
const identityCachePath = path.join(cacheDirectory, "identities-v1.json");
const identities = fs.existsSync(identityCachePath)
  ? new Map(JSON.parse(fs.readFileSync(identityCachePath, "utf8")))
  : await loadCityIdentities(targetCities.map((city) => city.code));

if (!fs.existsSync(identityCachePath)) {
  fs.writeFileSync(identityCachePath, `${JSON.stringify([...identities.entries()])}\n`);
}
console.log(`Resolved ${[...identities.values()].filter((identity) => identity.osmRelationId).length} OSM municipality relations.`);
const arcoCachePath = path.join(cacheDirectory, "arco-v1.json");
let candidatesByCode;
let arcoRun;

if (fs.existsSync(arcoCachePath)) {
  const arcoCache = JSON.parse(fs.readFileSync(arcoCachePath, "utf8"));
  candidatesByCode = new Map(arcoCache.candidatesByCode);
  arcoRun = {
    ...arcoCache.run,
    failedBatches: arcoCache.run.failedBatches.map((failure) => ({
      ...failure,
      error: summarizeArcoFailure(failure.error)
    }))
  };
} else {
  candidatesByCode = new Map(targetCities.map((city) => [city.code, []]));
  arcoRun = await addArcoCandidates(targetCities, candidatesByCode);
  fs.writeFileSync(
    arcoCachePath,
    `${JSON.stringify({ candidatesByCode: [...candidatesByCode.entries()], run: arcoRun })}\n`
  );
}
const fallbackCities = targetCities.filter(
  (city) => (candidatesByCode.get(city.code)?.length ?? 0) < ICCD_FALLBACK_THRESHOLD
);
await addWikidataFallbackCandidates(
  fallbackCities,
  identities,
  candidatesByCode,
  cacheDirectory
);
const osmFallbackCities = targetCities.filter(
  (city) => (candidatesByCode.get(city.code)?.length ?? 0) < MIN_MEDALS_PER_CITY
);
await addOsmFallbackCandidates(
  osmFallbackCities,
  identities,
  candidatesByCode,
  cacheDirectory
);

const albums = [];
const cityReports = [];

for (let index = 0; index < targetCities.length; index += 1) {
  const city = targetCities[index];
  const identity = identities.get(city.code);

  if (!identity?.osmRelationId) {
    throw new Error(`Missing OSM municipality relation for ${city.name} (${city.code}).`);
  }

  const candidates = candidatesByCode.get(city.code) ?? [];
  const requestedMedalCount = index < 3 ? 20 : index < 10 ? 12 : 8;
  const selection = selectBalancedCandidates(
    candidates,
    requestedMedalCount,
    MIN_MEDALS_PER_CITY
  );

  if (selection.medals.length < MIN_MEDALS_PER_CITY) {
    throw new Error(
      `Only ${selection.medals.length} selected landmarks for ${city.name} (${city.code}).`
    );
  }
  const outOfBoundsMedal = selection.medals.find(
    (medal) =>
      medal.latitude < 35 || medal.latitude > 48 ||
      medal.longitude < 6 || medal.longitude > 19
  );

  if (outOfBoundsMedal) {
    throw new Error(
      `Out-of-bounds Italian coordinate for ${outOfBoundsMedal.id}: ` +
      `${outOfBoundsMedal.latitude}, ${outOfBoundsMedal.longitude}.`
    );
  }

  const cityNames = localizeCityName(city.name);
  const citySlug = slugify(city.name);
  const albumId = `it-${citySlug}`;
  const album = {
    id: albumId,
    cityId: `${citySlug}-it`,
    cityZoneId: `relation/${identity.osmRelationId}`,
    cityName: cityNames,
    countryCode: "it",
    localLanguage: "it",
    version: 1,
    publishedAt: PUBLISHED_AT,
    sourceAttribution:
      buildSourceAttribution(arcoRun),
    medals: selection.medals
  };
  const sourceCounts = countBy(
    selection.medals,
    (medal) => medal.externalIdentity.source
  );
  const candidateSourceCounts = countBy(
    candidates,
    (candidate) => candidate.externalIdentity.source
  );
  albums.push(album);
  cityReports.push({
    albumId,
    candidateCount: candidates.length,
    candidateSourceCounts,
    categoryCounts: countBy(selection.medals, (medal) => medal.category),
    cityId: album.cityId,
    cityName: cityNames,
    cityZoneId: album.cityZoneId,
    curated: false,
    eligibleIccdCount: candidateSourceCounts.icc ?? 0,
    fallbackUsed: fallbackCities.some((fallbackCity) => fallbackCity.code === city.code),
    localLanguage: "it",
    population: city.population,
    rank: index + 1,
    rejected: selection.rejected,
    selectedCount: selection.medals.length,
    sourceCounts,
    version: 1,
    wikidataCandidateCount: candidateSourceCounts.wikidata ?? 0
  });
}

const selectedSourceCounts = countBy(
  albums.flatMap((album) => album.medals),
  (medal) => medal.externalIdentity.source
);
const candidateSourceCounts = countBy(
  [...candidatesByCode.values()].flat(),
  (candidate) => candidate.externalIdentity.source
);
const generatedAt = new Date().toISOString();
const qualityReport = {
  countryCode: "it",
  generatedAt,
  methodology: {
    citySelection: "Top 100 municipalities by official ISTAT 2025 resident population",
    maximumCityCount: MAX_CITY_COUNT,
    minimumMedalsPerCity: MIN_MEDALS_PER_CITY,
    coordinateBounds: "35..48 latitude and 6..19 longitude",
    populationDefinition: "ISTAT resident population at 1 January 2025; age 999 aggregate rows only",
    primaryCandidateSource: "MiC/ICCD ArCo coordinate-bearing immovable cultural properties",
    sparseCityFallback: `Coordinate-bearing Wikidata landmarks when fewer than ${ICCD_FALLBACK_THRESHOLD} eligible ICCD candidates were available`
  },
  expansion: {
    capReached: targetCities.length === MAX_CITY_COUNT,
    cityCount: targetCities.length,
    nationalMunicipalityCount: allMunicipalities.length,
    nationalPopulation,
    population: selectedPopulation,
    populationCoverage: selectedPopulation / nationalPopulation
  },
  sources: {
    arco: {
      attemptedBatchCount: arcoRun.attemptedBatchCount,
      endpoint: "https://dati.cultura.gov.it/sparql",
      failedBatches: arcoRun.failedBatches,
      license: "CC BY-SA 4.0",
      requestCount: arcoRun.requestCount,
      skippedBatchCount: arcoRun.skippedBatchCount,
      successfulBatchCount: arcoRun.successfulBatchCount
    },
    istat: {
      dataset: "Popolazione residente per eta, sesso e stato civile al 1 gennaio 2025 - Comuni",
      inputFile: path.basename(inputPath),
      municipalityCount: allMunicipalities.length
    },
    wikidata: {
      fallbackCityCount: fallbackCities.length,
      license: "CC0"
    },
    openstreetmap: {
      fallbackCityCount: osmFallbackCities.length,
      license: "ODbL 1.0"
    }
  },
  limitations: [
    "The official MiC/ICCD ArCo endpoint failed its first bounded batch during this build, so the remaining 19 batches were skipped rather than delaying generation.",
    "Italy v1 therefore uses community-source Wikidata candidates for every city, with OpenStreetMap used only for Aprilia and Olbia to satisfy the five-medal floor.",
    "The top-100 cap reaches 30.48% rather than the 50% population target; 420 municipalities would be required."
  ],
  candidateSourceCounts,
  selectedSourceCounts,
  cities: cityReports
};
const pack = {
  albums,
  countryCode: "it",
  formatVersion: 1,
  generatedAt,
  languages: ["en", "fr", "it"],
  publishedAt: PUBLISHED_AT,
  sourceAttribution: albums[0].sourceAttribution,
  version: PACK_VERSION
};
const outputDirectory = path.join(repositoryRoot, "country-packs/v1");
const artifacts = writeCountryPackArtifacts({
  descriptorUrl:
    "https://raw.githubusercontent.com/Kaltenor/street_explorer/main/country-packs/v1/it-v1.json.gz",
  outputDirectory,
  pack,
  qualityReport
});

console.log(
  `Generated ${albums.length} Italian albums with ${artifacts.descriptor.medalCount} medals ` +
  `(${artifacts.descriptor.compressedBytes} compressed bytes; ` +
  `${(selectedPopulation / nationalPopulation * 100).toFixed(2)}% population coverage; ` +
  `${selectedSourceCounts.icc ?? 0} ICCD and ${selectedSourceCounts.wikidata ?? 0} Wikidata selections).`
);

function parseIstatMunicipalities(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('"Codice comune";'));

  if (headerIndex < 0) {
    throw new Error("ISTAT municipality CSV header was not found.");
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const codeIndex = headers.indexOf("Codice comune");
  const cityIndex = headers.indexOf("Comune");
  const ageIndex = headers.indexOf("Eta") >= 0
    ? headers.indexOf("Eta")
    : headers.findIndex((header) => normalizeText(header) === "eta");
  const totalIndex = headers.indexOf("Totale");
  const cities = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) {
      continue;
    }

    const columns = parseCsvLine(line);

    if (columns[ageIndex] !== "999") {
      continue;
    }

    const population = Number(columns[totalIndex]);
    const code = String(columns[codeIndex] ?? "").trim().padStart(6, "0");
    const name = String(columns[cityIndex] ?? "").trim();

    if (code && name && Number.isFinite(population)) {
      cities.push({ code, name, population });
    }
  }

  if (cities.length < MAX_CITY_COUNT) {
    throw new Error(`Only ${cities.length} aggregate municipality rows were parsed from ISTAT.`);
  }

  return cities.sort((left, right) =>
    right.population - left.population || left.code.localeCompare(right.code)
  );
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ";" && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  result.push(current);
  return result;
}

async function loadCityIdentities(codes) {
  const identities = new Map();

  const batchSize = 15;

  for (let offset = 0; offset < codes.length; offset += batchSize) {
    const batch = codes.slice(offset, offset + batchSize);
    console.log(`Municipality identity batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil(codes.length / batchSize)}.`);
    const bindings = await queryWikidata(`
      SELECT ?city ?code ?osm WHERE {
        VALUES ?code { ${batch.map((code) => `"${code}"`).join(" ")} }
        ?city wdt:P635 ?code.
        OPTIONAL { ?city wdt:P402 ?osm }
      }
    `);

    for (const binding of bindings) {
      const code = binding.code.value.padStart(6, "0");
      const wikidataId = binding.city.value.split("/").at(-1);
      const candidate = {
        osmRelationId: binding.osm?.value ? Number(binding.osm.value) : null,
        wikidataId
      };
      const current = identities.get(code);
      const currentNumber = Number(current?.wikidataId?.replace(/^Q/, "")) || Number.MAX_SAFE_INTEGER;
      const candidateNumber = Number(wikidataId.replace(/^Q/, "")) || Number.MAX_SAFE_INTEGER;

      if (
        !current ||
        (!current.osmRelationId && candidate.osmRelationId) ||
        (Boolean(current.osmRelationId) === Boolean(candidate.osmRelationId) && candidateNumber < currentNumber)
      ) {
        identities.set(code, candidate);
      }
    }
  }

  const missingCodes = codes.filter((code) => !identities.get(code)?.osmRelationId);

  if (missingCodes.length > 0) {
    console.log(`Resolving ${missingCodes.length} missing OSM relations through ref:ISTAT.`);

    for (let offset = 0; offset < missingCodes.length; offset += 10) {
      const batch = missingCodes.slice(offset, offset + 10);
      const osmRelations = await queryOsmMunicipalityRelations(batch, "ref:ISTAT");

      for (const code of batch) {
        const identity = identities.get(code) ?? {};
        identity.osmRelationId = osmRelations.get(code) ?? null;
        identities.set(code, identity);
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return identities;
}

async function addArcoCandidates(cities, candidatesByCode) {
  const run = {
    attemptedBatchCount: 0,
    failedBatches: [],
    requestCount: 0,
    skippedBatchCount: 0,
    successfulBatchCount: 0
  };
  let endpointUnavailable = false;

  for (let offset = 0; offset < cities.length; offset += ARCO_BATCH_SIZE) {
    const batch = cities.slice(offset, offset + ARCO_BATCH_SIZE);
    run.attemptedBatchCount += 1;
    console.log(`ArCo batch ${run.attemptedBatchCount}/${Math.ceil(cities.length / ARCO_BATCH_SIZE)}: ${batch.map((city) => city.name).join(", ")}`);

    if (endpointUnavailable) {
      run.skippedBatchCount += 1;
      run.failedBatches.push({
        cityCodes: batch.map((city) => city.code),
        error: "Skipped after the official ArCo endpoint failed its first batch."
      });
      continue;
    }

    try {
      run.requestCount += 1;
      const bindings = await queryArco(`
        PREFIX arco: <https://w3id.org/arco/ontology/arco/>
        PREFIX a-loc: <https://w3id.org/arco/ontology/location/>
        PREFIX clv: <https://w3id.org/italia/onto/CLV/>
        PREFIX dc: <http://purl.org/dc/elements/1.1/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?city ?item ?wkt (SAMPLE(?label) AS ?name) (SAMPLE(?objectType) AS ?detail)
        WHERE {
          VALUES ?city { ${batch.map((city) => `<${arcoCityUri(city.name)}>`).join(" ")} }
          VALUES ?kind { arco:ArchitecturalOrLandscapeHeritage arco:ArchaeologicalProperty }
          ?address clv:hasCity ?city; a-loc:isCulturalPropertyAddressOf ?item.
          ?item a ?kind; rdfs:label ?label.
          FILTER(LANG(?label) = "" || LANGMATCHES(LANG(?label), "it"))
          OPTIONAL { ?item dc:type ?objectType }
          ?geometry clv:isGeometryFor ?item; clv:serialization ?wkt.
          FILTER(REGEX(STR(?wkt), "POINT\\\\s*\\\\(", "i"))
        }
        GROUP BY ?city ?item ?wkt
        LIMIT 2500
      `);
      const cityByUri = new Map(batch.map((city) => [arcoCityUri(city.name), city]));

      for (const binding of bindings) {
        const city = cityByUri.get(binding.city?.value);
        const coordinate = parseFlexibleWktPoint(binding.wkt?.value);
        const name = cleanLandmarkName(binding.name?.value);
        const detail = cleanLandmarkName(binding.detail?.value);

        if (!city || !coordinate || !isEligibleLandmark(name, detail)) {
          continue;
        }

        const category = classifyItalianLandmark(name, detail);
        const itemId = binding.item.value.split("/").at(-1);
        const localizedCityName = localizeCityName(city.name);
        const candidates = candidatesByCode.get(city.code) ?? [];
        candidates.push({
          category,
          description: localizeDescription(category, name, localizedCityName),
          externalIdentity: { id: itemId, source: "icc", type: "record" },
          id: `it-${slugify(city.name)}-icc-${slugify(itemId)}`,
          ...coordinate,
          name: { en: name, fr: name, it: name },
          score: scoreItalianLandmark(name, detail, true)
        });
        candidatesByCode.set(city.code, candidates);
      }

      run.successfulBatchCount += 1;
    } catch (error) {
      run.failedBatches.push({
        cityCodes: batch.map((city) => city.code),
        error: summarizeArcoFailure(error?.message ?? error)
      });
      endpointUnavailable = run.successfulBatchCount === 0;
    }
  }

  for (const candidates of candidatesByCode.values()) {
    candidates.sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id)
    );
  }

  return run;
}

async function addWikidataFallbackCandidates(
  cities,
  identities,
  candidatesByCode,
  cacheDirectoryPath
) {
  for (let offset = 0; offset < cities.length; offset += WIKIDATA_BATCH_SIZE) {
    const batch = cities.slice(offset, offset + WIKIDATA_BATCH_SIZE).filter(
      (city) => identities.get(city.code)?.wikidataId
    );

    if (batch.length === 0) {
      continue;
    }

    console.log(
      `Wikidata fallback batch ${Math.floor(offset / WIKIDATA_BATCH_SIZE) + 1}/${Math.ceil(cities.length / WIKIDATA_BATCH_SIZE)}: ` +
      batch.map((city) => city.name).join(", ")
    );

    const cacheKey = `${batch[0].code}-${batch.at(-1).code}`;
    const cachePath = path.join(cacheDirectoryPath, `wikidata-${cacheKey}.json`);
    let bindings;

    if (fs.existsSync(cachePath)) {
      bindings = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      bindings = await queryWikidata(`
      SELECT ?municipality ?item ?coord ?sitelinks ?itLabel ?enLabel ?frLabel
        ?itDescription ?enDescription ?frDescription
        (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
      WHERE {
        VALUES ?municipality { ${batch.map((city) => `wd:${identities.get(city.code).wikidataId}`).join(" ")} }
        ?item wdt:P131* ?municipality; wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
        FILTER(?item != ?municipality && ?sitelinks >= 1)
        OPTIONAL { ?item rdfs:label ?itLabel. FILTER(LANG(?itLabel) = "it") }
        OPTIONAL { ?item rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
        OPTIONAL { ?item rdfs:label ?frLabel. FILTER(LANG(?frLabel) = "fr") }
        OPTIONAL { ?item schema:description ?itDescription. FILTER(LANG(?itDescription) = "it") }
        OPTIONAL { ?item schema:description ?enDescription. FILTER(LANG(?enDescription) = "en") }
        OPTIONAL { ?item schema:description ?frDescription. FILTER(LANG(?frDescription) = "fr") }
        OPTIONAL {
          ?item wdt:P31 ?instance.
          ?instance rdfs:label ?instanceLabel.
          FILTER(LANG(?instanceLabel) = "en")
        }
      }
      GROUP BY ?municipality ?item ?coord ?sitelinks ?itLabel ?enLabel ?frLabel
        ?itDescription ?enDescription ?frDescription
      ORDER BY DESC(?sitelinks)
      LIMIT 350
      `);
      fs.writeFileSync(cachePath, `${JSON.stringify(bindings)}\n`);
    }
    const cityByWikidata = new Map(
      batch.map((city) => [
        `http://www.wikidata.org/entity/${identities.get(city.code).wikidataId}`,
        city
      ])
    );

    for (const binding of bindings) {
      const city = cityByWikidata.get(binding.municipality?.value);
      const coordinate = parseWktPoint(binding.coord?.value);
      const name = binding.itLabel?.value || binding.enLabel?.value || binding.frLabel?.value;
      const detail = `${binding.instanceLabels?.value ?? ""} ${binding.enDescription?.value ?? ""} ${binding.itDescription?.value ?? ""}`;

      if (!city || !coordinate || !name || !isEligibleLandmark(name, detail)) {
        continue;
      }

      const category = classifyItalianLandmark(name, detail);
      const itemId = binding.item.value.split("/").at(-1);
      const localizedCityName = localizeCityName(city.name);
      const candidates = candidatesByCode.get(city.code) ?? [];
      candidates.push({
        category,
        description: {
          en: binding.enDescription?.value || localizeDescription(category, name, localizedCityName).en,
          fr: binding.frDescription?.value || localizeDescription(category, name, localizedCityName).fr,
          it: binding.itDescription?.value || localizeDescription(category, name, localizedCityName).it
        },
        externalIdentity: { id: itemId, source: "wikidata", type: "item" },
        id: `it-${slugify(city.name)}-wikidata-${itemId.toLowerCase()}`,
        ...coordinate,
        name: {
          en: binding.enLabel?.value || name,
          fr: binding.frLabel?.value || name,
          it: binding.itLabel?.value || name
        },
        score: Math.min(84, 31 + Math.log2(Math.max(1, Number(binding.sitelinks?.value))) * 7) +
          scoreItalianLandmark(name, detail, false) / 5
      });
      candidatesByCode.set(city.code, candidates);
    }
  }

  for (const candidates of candidatesByCode.values()) {
    candidates.sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id)
    );
  }
}

async function addOsmFallbackCandidates(
  cities,
  identities,
  candidatesByCode,
  cacheDirectoryPath
) {
  for (const city of cities) {
    const relationId = identities.get(city.code)?.osmRelationId;

    if (!relationId) {
      continue;
    }

    console.log(`OpenStreetMap sparse-city fallback: ${city.name}.`);
    const cachePath = path.join(cacheDirectoryPath, `osm-${city.code}.json`);
    let elements;

    if (fs.existsSync(cachePath)) {
      elements = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } else {
      elements = await queryOsmLandmarksWithRetry(relationId);
      fs.writeFileSync(cachePath, `${JSON.stringify(elements)}\n`);
    }

    const candidates = candidatesByCode.get(city.code) ?? [];
    const cityNames = localizeCityName(city.name);

    for (const element of elements) {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      const tags = element.tags ?? {};
      const name = tags["name:it"] || tags.name || tags["name:en"] || tags["name:fr"];
      const detail = [
        tags.historic,
        tags.tourism,
        tags.amenity,
        tags.leisure,
        tags.man_made,
        tags.building,
        tags.heritage,
        tags["heritage:operator"]
      ].filter(Boolean).join(" ");

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !name ||
        !isEligibleLandmark(name, detail)
      ) {
        continue;
      }

      const category = classifyItalianLandmark(name, detail);
      candidates.push({
        category,
        description: localizeDescription(category, name, cityNames),
        externalIdentity: {
          id: `${element.type}/${element.id}`,
          source: "openstreetmap",
          type: element.type
        },
        id: `it-${slugify(city.name)}-osm-${element.type}-${element.id}`,
        latitude,
        longitude,
        name: {
          en: tags["name:en"] || name,
          fr: tags["name:fr"] || name,
          it: tags["name:it"] || name
        },
        score: 42 + scoreItalianLandmark(name, detail, false) / 3
      });
    }

    candidates.sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id)
    );
    candidatesByCode.set(city.code, candidates);
  }
}

async function queryOsmLandmarksWithRetry(relationId) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await queryOsmLandmarksForRelation(relationId);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function queryArco(query) {
  const url = `https://dati.cultura.gov.it/sparql?query=${encodeURIComponent(query)}&format=application%2Fsparql-results%2Bjson`;
  let lastError;

  for (let attempt = 0; attempt < 1; attempt += 1) {
    try {
      if (process.env.STREET_EXPLORER_POWERSHELL_NETWORK === "1" && process.platform === "win32") {
        return queryArcoWithPowerShell(url);
      }

      const response = await fetch(url, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "StreetExplorerCatalog/0.23 (offline country-pack builder)"
        },
        signal: AbortSignal.timeout(45_000)
      });

      if (!response.ok) {
        throw new Error(`ArCo returned ${response.status}`);
      }

      return (await response.json()).results.bindings;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError;
}

function queryArcoWithPowerShell(url) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$headers = @{ Accept = 'application/sparql-results+json'; 'User-Agent' = 'StreetExplorerCatalog/0.23 (offline country-pack builder)' }",
    "$response = Invoke-WebRequest -Uri $env:STREET_EXPLORER_ARCO_URL -Headers $headers -UseBasicParsing -TimeoutSec 45",
    "if ($response.Content -is [byte[]]) { $content = [Text.Encoding]::UTF8.GetString($response.Content) } else { $content = [string]$response.Content }",
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    "[Console]::Out.Write($content)"
  ].join("; ");
  const output = childProcess.execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      env: { ...process.env, STREET_EXPLORER_ARCO_URL: url },
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60000
    }
  );
  return JSON.parse(output.replace(/^\uFEFF/, "")).results.bindings;
}

function arcoCityUri(name) {
  return `https://w3id.org/arco/resource/City/${slugify(name)}`;
}

function parseFlexibleWktPoint(value) {
  const match = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(value ?? "");

  if (!match) {
    return null;
  }

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function cleanLandmarkName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isEligibleLandmark(name, detail) {
  const normalizedName = normalizeText(name);
  const text = normalizeText(`${name} ${detail}`);

  if (
    normalizedName.length < 4 ||
    /^(bene culturale|edificio|fabbricato|casa|palazzo|chiesa|monumento|villa|property|building)$/.test(normalizedName)
  ) {
    return false;
  }

  const rejected = /person|human|football club|company|school|hospital|street|road|neighbourhood|district|event|election|bus stop|airport|painting|dipinto|photograph|fotografia|manuscript|manoscritto|coin|moneta|vase|vaso|reperto mobile|sculpture object/.test(text);
  const landmark = /abbey|abbazia|amphitheatre|anfiteatro|archaeolog|archeolog|arena|art |arte|basilica|bridge|castle|castello|cathedral|cattedrale|chiesa|church|cinema|fort|garden|giardino|heritage|library|memorial|monument|moschea|mosque|museum|museo|palace|palazzo|park|parco|piazza|porta|rocca|santuario|stadium|stadio|synagogue|sinagoga|teatro|theatre|torre|tower|villa|walls|mura/.test(text);
  return !rejected && landmark;
}

function classifyItalianLandmark(name, detail) {
  const nameText = normalizeText(name);
  const text = normalizeText(`${name} ${detail}`);

  if (/parco|park|giardino|garden|orto botanico|paesaggio|landscape|riserva/.test(nameText)) {
    return "nature";
  }
  if (/chiesa|church|basilica|cattedrale|cathedral|sinagoga|synagogue|moschea|mosque|teatro|theatre|biblioteca|library|santuario/.test(nameText)) {
    return "culture";
  }
  if (/castel|castle|fort|rocca|porta|gate|palazzo|palace|monumento|monument|memorial|mura|walls|torre|tower|archeolog|archaeolog|pantheon|vittoriano/.test(nameText)) {
    return "history";
  }
  if (/museo|museum|galleria|gallery|arte|art |design|scultura|sculpt/.test(nameText)) {
    return "art";
  }
  if (/parco|park|giardino|garden|orto botanico|paesaggio|landscape|riserva/.test(text)) {
    return "nature";
  }
  if (/museo|museum|galleria|gallery|arte|art |design|scultura|sculpt/.test(text)) {
    return "art";
  }
  if (/chiesa|church|basilica|cattedrale|cathedral|sinagoga|synagogue|moschea|mosque|teatro|theatre|biblioteca|library|santuario/.test(text)) {
    return "culture";
  }
  if (/castello|castle|fort|rocca|porta|gate|palazzo|palace|monumento|monument|memorial|mura|walls|torre|tower|archeolog|archaeolog/.test(text)) {
    return "history";
  }

  return "architecture";
}

function scoreItalianLandmark(name, detail, official) {
  const text = normalizeText(`${name} ${detail}`);
  let score = official ? 62 : 44;
  const weights = [
    [/cattedrale|cathedral|basilica|castello|castle|palazzo reale|royal palace|anfiteatro|amphitheatre|arena|rocca/, 38],
    [/museo|museum|teatro|theatre|chiesa|church|santuario|monumento|monument|fort|porta|gate/, 30],
    [/torre|tower|ponte|bridge|parco|park|giardino|garden|villa|stadio|stadium/, 22],
    [/palazzo|palace|abbazia|abbey|biblioteca|library|mura|walls/, 18]
  ];

  for (const [pattern, weight] of weights) {
    if (pattern.test(text)) {
      score += weight;
      break;
    }
  }

  if (/rudere|resti|frammento|facciata|muro|wall fragment|former|gia /.test(text)) {
    score -= 10;
  }

  return score;
}

function localizeDescription(category, name, cityName) {
  const templates = {
    architecture: {
      en: `${name} is a notable architectural landmark in ${cityName.en}.`,
      fr: `${name} est un monument architectural remarquable de ${cityName.fr}.`,
      it: `${name} è un importante punto di riferimento architettonico di ${cityName.it}.`
    },
    art: {
      en: `${name} is a place associated with art and design in ${cityName.en}.`,
      fr: `${name} est un lieu lié à l’art et au design à ${cityName.fr}.`,
      it: `${name} è un luogo legato all'arte e al design di ${cityName.it}.`
    },
    culture: {
      en: `${name} is a significant cultural landmark in ${cityName.en}.`,
      fr: `${name} est un monument culturel majeur de ${cityName.fr}.`,
      it: `${name} è un importante luogo culturale di ${cityName.it}.`
    },
    history: {
      en: `${name} preserves part of the documented history of ${cityName.en}.`,
      fr: `${name} conserve une partie de l’histoire documentée de ${cityName.fr}.`,
      it: `${name} conserva una parte della storia documentata di ${cityName.it}.`
    },
    nature: {
      en: `${name} is a historic landscape or green landmark in ${cityName.en}.`,
      fr: `${name} est un paysage historique ou un espace vert remarquable de ${cityName.fr}.`,
      it: `${name} è un paesaggio storico o uno spazio verde significativo di ${cityName.it}.`
    }
  };

  return templates[category];
}

function localizeCityName(name) {
  const translations = {
    Firenze: { en: "Florence", fr: "Florence", it: "Firenze" },
    Genova: { en: "Genoa", fr: "Genes", it: "Genova" },
    Milano: { en: "Milan", fr: "Milan", it: "Milano" },
    Napoli: { en: "Naples", fr: "Naples", it: "Napoli" },
    Padova: { en: "Padua", fr: "Padoue", it: "Padova" },
    Roma: { en: "Rome", fr: "Rome", it: "Roma" },
    Torino: { en: "Turin", fr: "Turin", it: "Torino" },
    Venezia: { en: "Venice", fr: "Venise", it: "Venezia" }
  };

  return translations[name] ?? { en: name, fr: name, it: name };
}

function buildSourceAttribution(arcoRun) {
  const heritageSource = arcoRun.successfulBatchCount > 0
    ? "Official cultural-property candidates: Italian Ministry of Culture / ICCD ArCo knowledge graph (CC BY-SA 4.0); sparse-city gaps reviewed with Wikidata (CC0) and OpenStreetMap (ODbL)."
    : "The Italian Ministry of Culture / ICCD ArCo endpoint was unavailable during this build; landmark candidates were therefore sourced from Wikidata (CC0), with bounded OpenStreetMap fallback (ODbL) for sparse cities.";
  return "Population ranking: ISTAT, resident population by municipality at 1 January 2025 (POSAS). " +
    `${heritageSource} Municipality identity: OpenStreetMap relation via Wikidata and ref:ISTAT.`;
}

function summarizeArcoFailure(value) {
  const message = String(value ?? "");

  if (message.startsWith("Skipped after")) {
    return message;
  }
  if (/timed out|timeout|delai|délai/i.test(message)) {
    return "Official ArCo endpoint unavailable during generation (request timeout).";
  }

  return "Official ArCo endpoint unavailable during generation (connection failure).";
}

function countBy(items, selector) {
  return Object.fromEntries(
    [...items.reduce((counts, item) => {
      const key = selector(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right))
  );
}

function parseArguments(args) {
  return Object.fromEntries(
    args.map((argument) => {
      const [key, ...valueParts] = argument.replace(/^--/, "").split("=");
      return [key, valueParts.length > 0 ? valueParts.join("=") : true];
    })
  );
}
