import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyLandmark,
  createTemplateDescription,
  parseWktPoint,
  queryOsmLandmarksForRelation,
  queryOsmMunicipalityRelations,
  queryWikidata,
  scoreLandmark,
  selectBalancedCandidates,
  slugify,
  writeCountryPackArtifacts
} from "./lib/country-pack-build.mjs";

const PUBLISHED_AT = "2026-08-09";
const PACK_VERSION = 1;
const MAX_CITY_COUNT = 100;
const MIN_MEDALS_PER_CITY = 5;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const populationSourcePath = path.join(
  repositoryRoot,
  "scripts/country-packs/sources/spain-ine-2023-top100.json"
);
const cacheDirectory = path.join(os.tmpdir(), "street-explorer-country-pack-cache", "spain-v1");
const populationSource = JSON.parse(fs.readFileSync(populationSourcePath, "utf8"));
const targetCities = populationSource.municipalities.slice(0, MAX_CITY_COUNT);
const identities = await loadCityIdentities(targetCities.map((city) => city.code));
const candidatesByCode = new Map();

fs.mkdirSync(cacheDirectory, { recursive: true });
for (let offset = 0; offset < targetCities.length; offset += 4) {
  const batch = targetCities.slice(offset, offset + 4);
  const results = await Promise.all(batch.map(async (city) => {
    const identity = identities.get(city.code);
    if (!identity?.wikidataId) return [city.code, []];
    const candidates = await loadWikidataCandidates(city, identity);
    if (candidates.length < 8 && identity.osmRelationId) {
      candidates.push(...await loadOsmCandidates(city, identity));
    }
    return [city.code, candidates];
  }));
  for (const [code, candidates] of results) candidatesByCode.set(code, candidates);
  console.log(`Loaded Spanish landmark candidates for ${Math.min(offset + 4, targetCities.length)}/${targetCities.length} cities.`);
}

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
  const selection = selectBalancedCandidates(candidates, requestedMedalCount, MIN_MEDALS_PER_CITY);
  if (selection.medals.length < MIN_MEDALS_PER_CITY) {
    throw new Error(`Only ${selection.medals.length} selected landmarks for ${city.name} (${city.code}).`);
  }

  const cityName = {
    en: identity.labels.en || identity.labels.es || city.name,
    fr: identity.labels.fr || identity.labels.es || city.name,
    es: identity.labels.es || city.name
  };
  const citySlug = slugify(cityName.es);
  const albumId = `es-${citySlug}`;
  const album = {
    id: albumId,
    cityId: `${citySlug}-es`,
    cityZoneId: `relation/${identity.osmRelationId}`,
    cityName,
    countryCode: "es",
    localLanguage: "es",
    version: PACK_VERSION,
    publishedAt: PUBLISHED_AT,
    sourceAttribution:
      "Population ranking: Instituto Nacional de Estadística (INE), official municipal population figures at 1 January 2023. Landmark names, coordinates and identifiers: Wikidata (CC0), reviewed through bounded landmark filtering. Municipality boundary identity: OpenStreetMap relation via Wikidata P402 and ref:ine.",
    medals: selection.medals
  };
  albums.push(album);
  cityReports.push({
    albumId,
    candidateCount: candidates.length,
    categoryCounts: countBy(selection.medals, (medal) => medal.category),
    cityCode: city.code,
    cityId: album.cityId,
    cityName,
    cityZoneId: album.cityZoneId,
    localLanguage: "es",
    population: city.population,
    province: city.province,
    rank: index + 1,
    rejected: selection.rejected,
    selectedCount: selection.medals.length,
    sourceCounts: countBy(selection.medals, (medal) => medal.externalIdentity.source),
    version: PACK_VERSION
  });
}

const selectedPopulation = targetCities.reduce((sum, city) => sum + city.population, 0);
const qualityReport = {
  countryCode: "es",
  generatedAt: new Date().toISOString(),
  methodology: {
    coverageTarget: 0.5,
    maximumCityCount: MAX_CITY_COUNT,
    minimumMedalsPerCity: MIN_MEDALS_PER_CITY,
    populationDefinition: populationSource.source,
    selectionResult: "Maximum city cap reached before the population coverage target.",
    landmarkSource: "Bounded coordinate-bearing Wikidata landmark candidates"
  },
  expansion: {
    cityCount: targetCities.length,
    citiesNeededForCoverageTarget: populationSource.citiesNeededForHalf,
    nationalPopulation: populationSource.nationalPopulation,
    population: selectedPopulation,
    populationCoverage: selectedPopulation / populationSource.nationalPopulation
  },
  sources: {
    inePopulation: populationSource.sourceUrl,
    wikidata: "https://query.wikidata.org/",
    openStreetMap: "https://www.openstreetmap.org/"
  },
  limitations: [
    "Spain v1 uses the official INE population ranking but does not ingest a normalized national heritage point feed; landmark records are community-source candidates.",
    "Wikidata coverage and classification vary by municipality, and five sparse cities require bounded OpenStreetMap fallback.",
    "The top-100 cap reaches 46.49% rather than the 50% population target; 125 municipalities would be required."
  ],
  cities: cityReports
};
const pack = {
  albums,
  countryCode: "es",
  formatVersion: 1,
  generatedAt: qualityReport.generatedAt,
  languages: ["en", "fr", "es"],
  publishedAt: PUBLISHED_AT,
  sourceAttribution: albums[0].sourceAttribution,
  version: PACK_VERSION
};
const artifacts = writeCountryPackArtifacts({
  descriptorUrl:
    "https://raw.githubusercontent.com/Kaltenor/street_explorer/main/country-packs/v1/es-v1.json.gz",
  outputDirectory: path.join(repositoryRoot, "country-packs/v1"),
  pack,
  qualityReport
});
console.log(
  `Generated ${albums.length} Spanish albums with ${artifacts.descriptor.medalCount} medals ` +
  `(${artifacts.descriptor.compressedBytes} compressed bytes).`
);

async function loadCityIdentities(codes) {
  const identities = new Map();
  for (let offset = 0; offset < codes.length; offset += 20) {
    const batch = codes.slice(offset, offset + 20);
    const bindings = await queryWikidata(`
      SELECT ?city ?code ?osm ?coord ?esLabel ?enLabel ?frLabel WHERE {
        VALUES ?code { ${batch.map((code) => `"${code}"`).join(" ")} }
        ?city wdt:P772 ?code; wdt:P625 ?coord.
        OPTIONAL { ?city wdt:P402 ?osm }
        OPTIONAL { ?city rdfs:label ?esLabel. FILTER(LANG(?esLabel) = "es") }
        OPTIONAL { ?city rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
        OPTIONAL { ?city rdfs:label ?frLabel. FILTER(LANG(?frLabel) = "fr") }
      }
    `);
    for (const binding of bindings) {
      identities.set(binding.code.value, {
        center: parseWktPoint(binding.coord.value),
        labels: {
          en: binding.enLabel?.value,
          es: binding.esLabel?.value,
          fr: binding.frLabel?.value
        },
        osmRelationId: binding.osm?.value ? Number(binding.osm.value) : null,
        wikidataId: binding.city.value.split("/").at(-1)
      });
    }
  }

  const missingCodes = codes.filter((code) => !identities.get(code)?.osmRelationId);
  if (missingCodes.length > 0) {
    const relations = await queryOsmMunicipalityRelations(missingCodes, "ref:ine");
    for (const code of missingCodes) {
      const identity = identities.get(code) ?? { labels: {} };
      identity.osmRelationId = relations.get(code) ?? null;
      identities.set(code, identity);
    }
  }
  return identities;
}

async function loadWikidataCandidates(city, identity) {
  const cachePath = path.join(cacheDirectory, `${city.code}.json`);
  let bindings;
  if (fs.existsSync(cachePath)) {
    bindings = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } else {
    bindings = await queryWikidata(`
      SELECT ?item ?coord ?sitelinks ?esLabel ?enLabel ?frLabel
        ?esDescription ?enDescription ?frDescription
        (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
      WHERE {
        ?item wdt:P131* wd:${identity.wikidataId}; wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
        FILTER(?item != wd:${identity.wikidataId} && ?sitelinks >= 1)
        OPTIONAL { ?item rdfs:label ?esLabel. FILTER(LANG(?esLabel) = "es") }
        OPTIONAL { ?item rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
        OPTIONAL { ?item rdfs:label ?frLabel. FILTER(LANG(?frLabel) = "fr") }
        OPTIONAL { ?item schema:description ?esDescription. FILTER(LANG(?esDescription) = "es") }
        OPTIONAL { ?item schema:description ?enDescription. FILTER(LANG(?enDescription) = "en") }
        OPTIONAL { ?item schema:description ?frDescription. FILTER(LANG(?frDescription) = "fr") }
        OPTIONAL {
          ?item wdt:P31 ?instance.
          ?instance rdfs:label ?instanceLabel.
          FILTER(LANG(?instanceLabel) = "en")
        }
      }
      GROUP BY ?item ?coord ?sitelinks ?esLabel ?enLabel ?frLabel
        ?esDescription ?enDescription ?frDescription
      ORDER BY DESC(?sitelinks)
      LIMIT 350
    `);
    fs.writeFileSync(cachePath, `${JSON.stringify(bindings)}\n`);
  }

  const candidates = [];
  for (const binding of bindings) {
    const coordinate = parseWktPoint(binding.coord?.value);
    const name = binding.esLabel?.value || binding.enLabel?.value || binding.frLabel?.value;
    const detail = [
      binding.instanceLabels?.value,
      binding.enDescription?.value,
      binding.esDescription?.value
    ].filter(Boolean).join(" ");
    if (!coordinate || !name || !isEligibleLandmark(name, detail)) continue;
    const category = classifyLandmark(name, detail);
    const itemId = binding.item.value.split("/").at(-1);
    const cityNames = identity.labels;
    candidates.push({
      category,
      description: {
        en: binding.enDescription?.value || createTemplateDescription(category, name, cityNames.en || city.name, "en"),
        fr: binding.frDescription?.value || createTemplateDescription(category, name, cityNames.fr || city.name, "fr"),
        es: binding.esDescription?.value || createTemplateDescription(category, name, cityNames.es || city.name, "es")
      },
      externalIdentity: { id: itemId, source: "wikidata", type: "item" },
      id: `es-${slugify(cityNames.es || city.name)}-wikidata-${itemId.toLowerCase()}`,
      ...coordinate,
      name: {
        en: binding.enLabel?.value || name,
        fr: binding.frLabel?.value || name,
        es: binding.esLabel?.value || name
      },
      score: Math.min(88, 32 + Math.log2(Math.max(1, Number(binding.sitelinks?.value))) * 7) +
        scoreLandmark(name, detail) / 5
    });
  }
  return candidates.sort((left, right) => right.score - left.score);
}

async function loadOsmCandidates(city, identity) {
  const cachePath = path.join(cacheDirectory, `${city.code}-osm.json`);
  let elements;
  if (fs.existsSync(cachePath)) {
    elements = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } else {
    elements = await queryOsmLandmarksForRelation(identity.osmRelationId);
    fs.writeFileSync(cachePath, `${JSON.stringify(elements)}\n`);
  }

  return elements.flatMap((element) => {
    const coordinate = Number.isFinite(element.lat) && Number.isFinite(element.lon)
      ? { latitude: element.lat, longitude: element.lon }
      : Number.isFinite(element.center?.lat) && Number.isFinite(element.center?.lon)
        ? { latitude: element.center.lat, longitude: element.center.lon }
        : null;
    const tags = element.tags ?? {};
    const name = tags["name:es"] || tags.name || tags["name:en"] || tags["name:fr"];
    if (!coordinate || !name) return [];
    const detail = [tags.historic, tags.tourism, tags.amenity, tags.leisure, tags.man_made].filter(Boolean).join(" ");
    const category = classifyLandmark(name, detail);
    const cityNames = identity.labels;
    return [{
      category,
      description: {
        en: createTemplateDescription(category, name, cityNames.en || city.name, "en"),
        fr: createTemplateDescription(category, name, cityNames.fr || city.name, "fr"),
        es: createTemplateDescription(category, name, cityNames.es || city.name, "es")
      },
      externalIdentity: { id: String(element.id), source: "openstreetmap", type: element.type },
      id: `es-${slugify(cityNames.es || city.name)}-osm-${element.type}-${element.id}`,
      ...coordinate,
      name: {
        en: tags["name:en"] || name,
        fr: tags["name:fr"] || name,
        es: tags["name:es"] || name
      },
      score: 35 + scoreLandmark(name, detail) / 4
    }];
  });
}

function isEligibleLandmark(name, detail) {
  const text = `${name} ${detail}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rejected = /person|human|football club|company|school|hospital|street|road|neighbourhood|district|event|election|railway station|airport|municipality|settlement/.test(text);
  const landmark = /abbey|amphitheatre|aqueduct|archaeological|architecture|art |basilica|bridge|castle|cathedral|church|cinema|convent|fort|garden|heritage|historic|library|memorial|monastery|monument|mosque|museum|palace|park|sculpture|stadium|synagogue|temple|theatre|tower|unesco|windmill|zoo|abadia|acueducto|arqueolog|arte |basilica|castillo|catedral|convento|iglesia|jardin|monasterio|monumento|museo|palacio|parque|patrimonio|puente|teatro|torre/.test(text);
  return !rejected && landmark;
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
