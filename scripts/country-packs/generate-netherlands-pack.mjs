import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  classifyLandmark,
  createTemplateDescription,
  dutchRdToWgs84,
  normalizeText,
  parseWktPoint,
  queryOsmMunicipalityRelations,
  queryWikidata,
  scoreLandmark,
  selectBalancedCandidates,
  slugify,
  writeCountryPackArtifacts
} from "./lib/country-pack-build.mjs";

const PUBLISHED_AT = "2026-08-09";
const PACK_VERSION = 1;
const PILOT_CITY_COUNT = 30;
const COVERAGE_TARGET = 0.5;
const MAX_CITY_COUNT = 100;
const MIN_MEDALS_PER_CITY = 5;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const options = parseArguments(process.argv.slice(2));

if (!options.cbs || !options.rce) {
  throw new Error(
    "Usage: node scripts/country-packs/generate-netherlands-pack.mjs --cbs=<CBS TypedDataSet JSON> --rce=<RCE extraction JSON> [--preview]"
  );
}

const cbsRows = JSON.parse(fs.readFileSync(path.resolve(options.cbs), "utf8")).value;
const rcePayload = JSON.parse(fs.readFileSync(path.resolve(options.rce), "utf8"));
const allMunicipalities = cbsRows
  .filter((row) => String(row.RegioS).trim().startsWith("GM"))
  .map((row) => ({
    code: String(row.RegioS).trim().replace(/^GM/, ""),
    name: cleanMunicipalityName(row.Naam_2),
    population: Number(row.Inwonertal_56)
  }))
  .filter((city) => city.code && city.name && Number.isFinite(city.population))
  .sort((left, right) => right.population - left.population);
const nationalPopulation = allMunicipalities.reduce(
  (total, city) => total + city.population,
  0
);
const targetCities = selectCitiesForCoverage(allMunicipalities);
const targetCodes = targetCities.map((city) => city.code);
const identities = await loadCityIdentities(targetCodes);
const recordsByMunicipality = groupRceRecords(rcePayload.records);
const rceRecordsByIdentity = new Map(
  rcePayload.records.map((record) => [
    `dutch-rce:${record.rijksmonumentNumber}`,
    record
  ])
);
const candidatesByCode = new Map();

for (const city of targetCities) {
  candidatesByCode.set(
    city.code,
    buildRceCandidates(city, recordsByMunicipality.get(normalizeMunicipalityName(city.name)) ?? [])
  );
}

const fallbackCities = targetCities.filter(
  (city) => (candidatesByCode.get(city.code)?.length ?? 0) < 12
);
await addWikidataFallbackCandidates(fallbackCities, identities, candidatesByCode);

const curatedCityCodes = new Set(["0363", "0599", "0935"]);
const curationDirectory = path.join(
  repositoryRoot,
  "scripts/country-packs/curation/netherlands"
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
  const curationPath = path.join(curationDirectory, `${city.code}.json`);
  let selection;
  let curated = false;

  if (curatedCityCodes.has(city.code) && fs.existsSync(curationPath)) {
    selection = selectCuratedCandidates(
      JSON.parse(fs.readFileSync(curationPath, "utf8")),
      candidates,
      city,
      rceRecordsByIdentity
    );
    curated = true;
  } else {
    if (curatedCityCodes.has(city.code) && !options.preview) {
      throw new Error(`Missing required manual curation file ${curationPath}.`);
    }
    selection = selectBalancedCandidates(
      candidates,
      requestedMedalCount,
      MIN_MEDALS_PER_CITY
    );
  }

  if (selection.medals.length < MIN_MEDALS_PER_CITY) {
    throw new Error(
      `Only ${selection.medals.length} selected landmarks for ${city.name} (${city.code}).`
    );
  }

  const cityNames = localizeCityName(city.name);
  const citySlug = slugify(city.name);
  const albumId = `nl-${citySlug}`;
  const album = {
    id: albumId,
    cityId: `${citySlug}-nl`,
    cityZoneId: `relation/${identity.osmRelationId}`,
    cityName: cityNames,
    countryCode: "nl",
    localLanguage: "nl",
    version: 1,
    publishedAt: PUBLISHED_AT,
    sourceAttribution:
      "Population ranking: Statistics Netherlands (CBS), Gebieden in Nederland 2025. Protected landmarks and coordinates: Rijksdienst voor het Cultureel Erfgoed, Rijksmonumentenregister Extract_MRS (CC BY 4.0); sparse-city gaps reviewed with Wikidata (CC0). Municipality identity: OpenStreetMap relation via Wikidata and ref:gemeentecode.",
    medals: selection.medals
  };
  albums.push(album);
  cityReports.push({
    albumId,
    candidateCount: candidates.length,
    categoryCounts: countBy(selection.medals, (medal) => medal.category),
    cityId: album.cityId,
    cityName: cityNames,
    cityZoneId: album.cityZoneId,
    curated,
    eligibleRceCount: candidates.filter(
      (candidate) => candidate.externalIdentity.source === "dutch-rce"
    ).length,
    localLanguage: "nl",
    medalCandidates: options.preview && curatedCityCodes.has(city.code)
      ? candidates.slice(0, 50).map(({ score, ...candidate }) => ({ ...candidate, score }))
      : undefined,
    population: city.population,
    rank: index + 1,
    rejected: selection.rejected,
    selectedCount: selection.medals.length,
    sourceCounts: countBy(
      selection.medals,
      (medal) => medal.externalIdentity.source
    ),
    version: 1,
    wikidataCandidateCount: candidates.filter(
      (candidate) => candidate.externalIdentity.source === "wikidata"
    ).length
  });
}

const selectedPopulation = targetCities.reduce(
  (total, city) => total + city.population,
  0
);
const pilotCities = cityReports.slice(0, PILOT_CITY_COUNT);
const qualityReport = {
  countryCode: "nl",
  generatedAt: new Date().toISOString(),
  methodology: {
    coverageTarget: COVERAGE_TARGET,
    maximumCityCount: MAX_CITY_COUNT,
    minimumMedalsPerCity: MIN_MEDALS_PER_CITY,
    populationDefinition: "CBS 2025 municipality population",
    sparseCityFallback: "Reviewed coordinate-bearing Wikidata landmarks"
  },
  pilot: {
    candidateCount: pilotCities.reduce((total, city) => total + city.candidateCount, 0),
    cityCount: PILOT_CITY_COUNT,
    medalCount: pilotCities.reduce((total, city) => total + city.selectedCount, 0),
    population: targetCities
      .slice(0, PILOT_CITY_COUNT)
      .reduce((total, city) => total + city.population, 0),
    populationCoverage:
      targetCities
        .slice(0, PILOT_CITY_COUNT)
        .reduce((total, city) => total + city.population, 0) /
      nationalPopulation
  },
  expansion: {
    cityCount: targetCities.length,
    nationalPopulation,
    population: selectedPopulation,
    populationCoverage: selectedPopulation / nationalPopulation
  },
  sources: {
    cbsDataset: "86059NED",
    rceExtract: rcePayload.sourceFile,
    rceExtractedAt: rcePayload.extractedAt,
    rceGeocodedRecordCount: rcePayload.recordCount
  },
  cities: cityReports
};
const pack = {
  albums,
  countryCode: "nl",
  formatVersion: 1,
  generatedAt: qualityReport.generatedAt,
  languages: ["en", "fr", "nl"],
  publishedAt: PUBLISHED_AT,
  sourceAttribution: albums[0].sourceAttribution,
  version: PACK_VERSION
};

if (options.preview) {
  const previewPath = path.resolve(
    options.previewOutput ?? path.join(process.env.TEMP ?? repositoryRoot, "netherlands-pack-preview.json")
  );
  fs.writeFileSync(previewPath, `${JSON.stringify({ pack, qualityReport }, null, 2)}\n`);
  console.log(`Wrote Netherlands preview to ${previewPath}`);
} else {
  const outputDirectory = path.join(repositoryRoot, "country-packs/v1");
  const artifacts = writeCountryPackArtifacts({
    descriptorUrl:
      "https://raw.githubusercontent.com/Kaltenor/street_explorer/main/country-packs/v1/nl-v1.json.gz",
    outputDirectory,
    pack,
    qualityReport
  });
  console.log(
    `Generated ${albums.length} Dutch albums with ${artifacts.descriptor.medalCount} medals ` +
    `(${artifacts.descriptor.compressedBytes} compressed bytes).`
  );
}

function buildRceCandidates(city, records) {
  return records.flatMap((record) => {
    const name = cleanLandmarkName(record.name);
    const detail = `${record.function} ${record.buildingType} ${record.protectionType}`;

    if (!isEligibleRceLandmark(name, detail)) {
      return [];
    }

    const coordinate = dutchRdToWgs84(record.rdX, record.rdY);
    const category = classifyLandmark(name, detail);
    const localizedName = { en: name, fr: name, nl: name };
    return [{
      category,
      description: {
        en: createTemplateDescription(category, name, localizeCityName(city.name).en, "en"),
        fr: createTemplateDescription(category, name, localizeCityName(city.name).fr, "fr"),
        nl: createTemplateDescription(category, name, localizeCityName(city.name).nl, "nl")
      },
      externalIdentity: {
        id: String(record.rijksmonumentNumber),
        source: "dutch-rce",
        type: "record"
      },
      id: `nl-${slugify(city.name)}-rce-${record.rijksmonumentNumber}`,
      ...coordinate,
      name: localizedName,
      score: scoreLandmark(name, detail, record.top100)
    }];
  }).sort((left, right) => right.score - left.score);
}

async function addWikidataFallbackCandidates(cities, identities, candidatesByCode) {
  for (const city of cities) {
    const identity = identities.get(city.code);

    if (!identity?.wikidataId) {
      continue;
    }

    const bindings = await queryWikidata(`
      SELECT ?item ?coord ?sitelinks ?nlLabel ?enLabel ?frLabel
        ?nlDescription ?enDescription ?frDescription
        (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
      WHERE {
        ?item wdt:P131* wd:${identity.wikidataId}; wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
        FILTER(?item != wd:${identity.wikidataId} && ?sitelinks >= 1)
        OPTIONAL { ?item rdfs:label ?nlLabel. FILTER(LANG(?nlLabel) = "nl") }
        OPTIONAL { ?item rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
        OPTIONAL { ?item rdfs:label ?frLabel. FILTER(LANG(?frLabel) = "fr") }
        OPTIONAL { ?item schema:description ?nlDescription. FILTER(LANG(?nlDescription) = "nl") }
        OPTIONAL { ?item schema:description ?enDescription. FILTER(LANG(?enDescription) = "en") }
        OPTIONAL { ?item schema:description ?frDescription. FILTER(LANG(?frDescription) = "fr") }
        OPTIONAL {
          ?item wdt:P31 ?instance.
          ?instance rdfs:label ?instanceLabel.
          FILTER(LANG(?instanceLabel) = "en")
        }
      }
      GROUP BY ?item ?coord ?sitelinks ?nlLabel ?enLabel ?frLabel
        ?nlDescription ?enDescription ?frDescription
      LIMIT 300
    `);
    const candidates = candidatesByCode.get(city.code) ?? [];

    for (const binding of bindings) {
      const coordinate = parseWktPoint(binding.coord?.value);
      const name = binding.nlLabel?.value || binding.enLabel?.value || binding.frLabel?.value;
      const detail = `${binding.instanceLabels?.value ?? ""} ${binding.enDescription?.value ?? ""}`;

      if (!coordinate || !name || !isEligibleWikidataLandmark(name, detail)) {
        continue;
      }

      const category = classifyLandmark(name, detail);
      const itemId = binding.item.value.split("/").at(-1);
      candidates.push({
        category,
        description: {
          en: binding.enDescription?.value || createTemplateDescription(category, name, city.name, "en"),
          fr: binding.frDescription?.value || createTemplateDescription(category, name, city.name, "fr"),
          nl: binding.nlDescription?.value || createTemplateDescription(category, name, city.name, "nl")
        },
        externalIdentity: { id: itemId, source: "wikidata", type: "item" },
        id: `nl-${slugify(city.name)}-wikidata-${itemId.toLowerCase()}`,
        ...coordinate,
        name: {
          en: binding.enLabel?.value || name,
          fr: binding.frLabel?.value || name,
          nl: binding.nlLabel?.value || name
        },
        score: Math.min(82, 30 + Math.log2(Math.max(1, Number(binding.sitelinks?.value))) * 7) +
          scoreLandmark(name, detail) / 5
      });
    }

    candidates.sort((left, right) => right.score - left.score);
    candidatesByCode.set(city.code, candidates);
  }
}

async function loadCityIdentities(codes) {
  const identities = new Map();

  for (let offset = 0; offset < codes.length; offset += 20) {
    const batch = codes.slice(offset, offset + 20);
    const bindings = await queryWikidata(`
      SELECT ?city ?code ?osm ?coord WHERE {
        VALUES ?code { ${batch.map((code) => `"${code}"`).join(" ")} }
        ?city wdt:P382 ?code; wdt:P625 ?coord.
        OPTIONAL { ?city wdt:P402 ?osm }
      }
    `);

    for (const binding of bindings) {
      identities.set(binding.code.value, {
        center: parseWktPoint(binding.coord.value),
        osmRelationId: binding.osm?.value ? Number(binding.osm.value) : null,
        wikidataId: binding.city.value.split("/").at(-1)
      });
    }
  }

  const missingCodes = codes.filter((code) => !identities.get(code)?.osmRelationId);

  if (missingCodes.length > 0) {
    const osmRelations = await queryOsmMunicipalityRelations(
      missingCodes,
      "ref:gemeentecode"
    );

    for (const code of missingCodes) {
      const identity = identities.get(code) ?? {};
      identity.osmRelationId = osmRelations.get(code) ?? null;
      identities.set(code, identity);
    }
  }

  return identities;
}

function selectCuratedCandidates(
  curation,
  candidates,
  city,
  rceRecordsByIdentity
) {
  if (curation.cityCode !== city.code || !Array.isArray(curation.medals)) {
    throw new Error(`Invalid curation file for ${city.name}.`);
  }

  const byIdentity = new Map(
    candidates.map((candidate) => [
      `${candidate.externalIdentity.source}:${candidate.externalIdentity.id}`,
      candidate
    ])
  );
  const medals = curation.medals.map((entry) => {
    const identityKey = `${entry.source}:${entry.id}`;
    let candidate = byIdentity.get(identityKey);

    if (!candidate && entry.source === "dutch-rce") {
      const record = rceRecordsByIdentity.get(identityKey);

      if (record && normalizeMunicipalityName(record.municipality) === normalizeMunicipalityName(city.name)) {
        candidate = {
          category: entry.category,
          description: entry.description,
          externalIdentity: {
            id: String(record.rijksmonumentNumber),
            source: "dutch-rce",
            type: "record"
          },
          id: `nl-${slugify(city.name)}-rce-${record.rijksmonumentNumber}`,
          ...dutchRdToWgs84(record.rdX, record.rdY),
          name: entry.name,
          score: 100
        };
      }
    }

    if (!candidate) {
      throw new Error(
        `Curated ${entry.source}:${entry.id} is not available for ${city.name}.`
      );
    }

    return {
      ...candidate,
      category: entry.category,
      description: entry.description,
      name: entry.name
    };
  });

  return {
    medals: medals.map(({ score: _score, ...medal }) => medal),
    rejected: { categoryLimit: 0, duplicateCoordinate: 0, duplicateName: 0 }
  };
}

function selectCitiesForCoverage(cities) {
  const selected = [];
  let population = 0;

  for (const city of cities) {
    selected.push(city);
    population += city.population;

    if (
      selected.length >= PILOT_CITY_COUNT &&
      population / nationalPopulation >= COVERAGE_TARGET
    ) {
      break;
    }
    if (selected.length >= MAX_CITY_COUNT) {
      break;
    }
  }

  return selected;
}

function groupRceRecords(records) {
  const result = new Map();

  for (const record of records) {
    const key = normalizeMunicipalityName(record.municipality);
    const group = result.get(key) ?? [];
    group.push(record);
    result.set(key, group);
  }

  return result;
}

function normalizeMunicipalityName(value) {
  return normalizeText(value)
    .replace(/ gemeente$/, "")
    .replace(/ o$/, "");
}

function cleanMunicipalityName(value) {
  return String(value ?? "")
    .trim()
    .replace(/ \(gemeente\)$/, "");
}

function cleanLandmarkName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isEligibleRceLandmark(name, detail) {
  const normalizedName = normalizeText(name);
  const text = normalizeText(`${name} ${detail}`);

  return Boolean(
    normalizedName.length >= 4 &&
    !/^(pand|woonhuis|huis|boerderij|schuur|kerk|molen|brug|object|monument)$/.test(normalizedName) &&
    !/^(voormalig )?(woonhuis|boerderij|schuur|winkel)( |$)/.test(normalizedName) &&
    !/transformator|hekwerk|muurrestant|grenspaal|lantaarnpaal/.test(text)
  );
}

function isEligibleWikidataLandmark(name, detail) {
  const text = normalizeText(`${name} ${detail}`);
  const rejected = /person|human|football club|company|school|hospital|street|road|neighbourhood|district|event|election|station|bus stop|airport/.test(text);
  const landmark = /abbey|amphitheatre|art|basilica|bridge|castle|cathedral|church|cinema|fort|garden|heritage|library|memorial|monument|mosque|museum|palace|park|sculpture|stadium|synagogue|theatre|tower|windmill|zoo/.test(text);
  return !rejected && landmark;
}

function localizeCityName(name) {
  if (name === "'s-Gravenhage") {
    return { en: "The Hague", fr: "La Haye", nl: "Den Haag" };
  }
  if (name === "'s-Hertogenbosch") {
    return { en: "'s-Hertogenbosch", fr: "Bois-le-Duc", nl: "'s-Hertogenbosch" };
  }

  return { en: name, fr: name, nl: name };
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
