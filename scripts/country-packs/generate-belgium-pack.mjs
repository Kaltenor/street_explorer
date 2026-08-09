import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import {
  normalizeText,
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
const PILOT_CITY_COUNT = 30;
const COVERAGE_TARGET = 0.5;
const MAX_CITY_COUNT = 100;
const MIN_MEDALS_PER_CITY = 5;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const options = parseArguments(process.argv.slice(2));

if (!options.statbel) {
  throw new Error(
    "Usage: node scripts/country-packs/generate-belgium-pack.mjs --statbel=<Statbel pipe-delimited population file>"
  );
}

const allMunicipalities = await readStatbelMunicipalities(path.resolve(options.statbel));
const nationalPopulation = allMunicipalities.reduce((sum, city) => sum + city.population, 0);
const targetCities = selectCitiesForCoverage(allMunicipalities, nationalPopulation);
const identities = await loadCityIdentities(targetCities);
const candidatesByCode = new Map();
const officialFailures = [];

await mapConcurrent(targetCities, 5, async (city) => {
  const identity = identities.get(city.code);
  let candidates = [];

  try {
    if (city.regionCode === "02000") {
      candidates = await loadFlandersCandidates(city, identity);
    } else if (city.regionCode === "03000") {
      candidates = await loadWalloniaCandidates(city);
    }
  } catch (error) {
    officialFailures.push({ cityCode: city.code, cityName: city.nameEn, error: String(error) });
  }

  candidatesByCode.set(city.code, candidates);
});

const fallbackCities = targetCities.filter(
  (city) => (candidatesByCode.get(city.code)?.length ?? 0) < 12
);
await mapConcurrent(fallbackCities, 3, async (city) => {
  const candidates = candidatesByCode.get(city.code) ?? [];
  const identity = identities.get(city.code);
  await addWikidataCandidates(city, identity, candidates);
  candidatesByCode.set(city.code, candidates);
});
const osmFallbackCities = fallbackCities.filter(
  (city) => (candidatesByCode.get(city.code)?.length ?? 0) < MIN_MEDALS_PER_CITY
);
for (const city of osmFallbackCities) {
  const candidates = candidatesByCode.get(city.code) ?? [];
  await addOpenStreetMapCandidates(city, identities.get(city.code), candidates);
  candidatesByCode.set(city.code, candidates);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const albums = [];
const cityReports = [];

for (let index = 0; index < targetCities.length; index += 1) {
  const city = targetCities[index];
  const identity = identities.get(city.code);
  const candidates = candidatesByCode.get(city.code) ?? [];
  const requestedMedalCount = index < 3 ? 20 : index < 10 ? 12 : 8;
  const selection = selectBalancedCandidates(
    candidates,
    requestedMedalCount,
    MIN_MEDALS_PER_CITY
  );

  if (!identity?.osmRelationId) {
    throw new Error(`Missing OSM municipality relation for ${city.nameEn} (${city.code}).`);
  }
  if (selection.medals.length < MIN_MEDALS_PER_CITY) {
    throw new Error(
      `Only ${selection.medals.length} selected landmarks for ${city.nameEn} (${city.code}); ` +
      `${candidates.length} candidates were available.`
    );
  }

  const citySlug = slugify(city.nameEn);
  const cityName = { en: city.nameEn, fr: city.nameFr, nl: city.nameNl };
  const albumId = `be-${citySlug}`;
  const sourceAttribution =
    "Population ranking: Statbel, population by place of residence on 1 January 2025. " +
    "Heritage records and coordinates: Agentschap Onroerend Erfgoed (Flanders; Flemish " +
    "Model Licence for Free Reuse / CC BY-SA 4.0) and Sources des données: Service public " +
    "de Wallonie / Agence wallonne du Patrimoine (Wallonia); sparse-city " +
    "gaps reviewed with Wikidata (CC0). Municipality identity: OpenStreetMap relation " +
    "via Wikidata NIS/INS code and OSM ref:INS.";
  const album = {
    id: albumId,
    cityId: `${citySlug}-be`,
    cityZoneId: `relation/${identity.osmRelationId}`,
    cityName,
    countryCode: "be",
    localLanguage: city.localLanguage,
    version: 1,
    publishedAt: PUBLISHED_AT,
    sourceAttribution,
    medals: selection.medals
  };
  albums.push(album);
  cityReports.push({
    albumId,
    candidateCount: candidates.length,
    categoryCounts: countBy(selection.medals, (medal) => medal.category),
    cityId: album.cityId,
    cityName,
    cityZoneId: album.cityZoneId,
    curated: false,
    localLanguage: city.localLanguage,
    officialCandidateCount: candidates.filter(
      (candidate) => candidate.externalIdentity.source !== "wikidata"
    ).length,
    population: city.population,
    rank: index + 1,
    regionCode: city.regionCode,
    rejected: selection.rejected,
    selectedCount: selection.medals.length,
    sourceCounts: countBy(selection.medals, (medal) => medal.externalIdentity.source),
    version: 1,
    wikidataCandidateCount: candidates.filter(
      (candidate) => candidate.externalIdentity.source === "wikidata"
    ).length
  });
}

const selectedPopulation = targetCities.reduce((sum, city) => sum + city.population, 0);
const selectedSourceCounts = countBy(
  albums.flatMap((album) => album.medals),
  (medal) => medal.externalIdentity.source
);
const qualityReport = {
  countryCode: "be",
  generatedAt: new Date().toISOString(),
  methodology: {
    coverageTarget: COVERAGE_TARGET,
    maximumCityCount: MAX_CITY_COUNT,
    minimumMedalsPerCity: MIN_MEDALS_PER_CITY,
    populationDefinition: "Statbel municipality population on 1 January 2025",
    officialSourceSelection:
      "Official regional inventory objects near the municipality centre, ranked for landmark specificity and category balance",
    sparseCityFallback:
      "Coordinate-bearing Wikidata landmarks within the municipality hierarchy, queried only when fewer than 12 official candidates were available; a bounded 6 km Wikidata proximity query and then named OpenStreetMap features inside the exact municipality relation provide the final five-medal floor"
  },
  pilot: summarizeCoverage(targetCities.slice(0, PILOT_CITY_COUNT), cityReports.slice(0, PILOT_CITY_COUNT), nationalPopulation),
  expansion: {
    cityCount: targetCities.length,
    nationalPopulation,
    population: selectedPopulation,
    populationCoverage: selectedPopulation / nationalPopulation
  },
  sources: {
    officialFailures,
    selectedMedalsBySource: selectedSourceCounts,
    statbelFile: path.basename(path.resolve(options.statbel)),
    statbelUrl: "https://statbel.fgov.be/en/open-data/population-place-residence-nationality-marital-status-age-and-sex-16",
    flandersInventory: "Agentschap Onroerend Erfgoed WFS, vioe_geoportaal:bouwkundig_element",
    flandersInventoryUrl: "https://geo.onroerenderfgoed.be/downloads",
    flandersReuseUrl: "https://inventaris.onroerenderfgoed.be/hergebruik",
    walloniaInventory: "SPW/AWaP ArcGIS service, AMENAGEMENT_TERRITOIRE/IPIC layer 0",
    walloniaInventoryUrl: "https://geodata.wallonie.be/id/a25cdf65-d35b-4883-beaf-5f89713726db",
    brusselsInventoryLimitation:
      "The Brussels official inventory does not expose a comparable bulk point feed in this builder; Brussels municipalities use the bounded Wikidata fallback."
  },
  cities: cityReports
};
const pack = {
  albums,
  countryCode: "be",
  formatVersion: 1,
  generatedAt: qualityReport.generatedAt,
  languages: ["en", "fr", "nl"],
  publishedAt: PUBLISHED_AT,
  sourceAttribution: albums[0].sourceAttribution,
  version: PACK_VERSION
};
const artifacts = writeCountryPackArtifacts({
  descriptorUrl:
    "https://raw.githubusercontent.com/Kaltenor/street_explorer/main/country-packs/v1/be-v1.json.gz",
  outputDirectory: path.join(repositoryRoot, "country-packs/v1"),
  pack,
  qualityReport
});

console.log(
  `Generated ${albums.length} Belgian albums with ${artifacts.descriptor.medalCount} medals ` +
  `(${artifacts.descriptor.compressedBytes} compressed bytes, ` +
  `${(selectedPopulation / nationalPopulation * 100).toFixed(1)}% population coverage).`
);

async function readStatbelMunicipalities(filePath) {
  const groups = new Map();
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let header;

  for await (const line of lines) {
    if (!header) {
      header = line.replace(/^\uFEFF/, "").split("|");
      continue;
    }
    const values = line.split("|");
    const row = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    const code = row.CD_REFNIS;
    const population = Number(row.MS_POPULATION);

    if (!/^\d{5}$/.test(code) || !Number.isFinite(population)) {
      continue;
    }

    const group = groups.get(code) ?? {
      code,
      nameFr: cleanCityName(row.TX_DESCR_FR),
      nameNl: cleanCityName(row.TX_DESCR_NL),
      population: 0,
      regionCode: row.CD_RGN_REFNIS
    };
    group.population += population;
    groups.set(code, group);
  }

  return [...groups.values()]
    .map((city) => ({
      ...city,
      localLanguage: city.regionCode === "02000" ? "nl" : "fr",
      nameEn: localizeEnglishCity(city)
    }))
    .sort((left, right) => right.population - left.population);
}

function selectCitiesForCoverage(cities, nationalPopulation) {
  const selected = [];
  let population = 0;

  for (const city of cities) {
    selected.push(city);
    population += city.population;
    if (selected.length >= PILOT_CITY_COUNT && population / nationalPopulation >= COVERAGE_TARGET) break;
    if (selected.length >= MAX_CITY_COUNT) break;
  }
  return selected;
}

async function loadCityIdentities(cities) {
  const identities = new Map();

  for (let offset = 0; offset < cities.length; offset += 20) {
    const batch = cities.slice(offset, offset + 20);
    const bindings = await queryWikidata(`
      SELECT ?city ?code ?osm ?coord WHERE {
        VALUES ?code { ${batch.map((city) => `"${city.code}"`).join(" ")} }
        ?city wdt:P1567 ?code; wdt:P625 ?coord.
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

  const missingRelationCodes = cities
    .filter((city) => !identities.get(city.code)?.osmRelationId)
    .map((city) => city.code);
  if (missingRelationCodes.length > 0) {
    const relations = await queryOsmMunicipalityRelations(missingRelationCodes, "ref:INS");
    for (const code of missingRelationCodes) {
      const identity = identities.get(code) ?? {};
      identity.osmRelationId = relations.get(code) ?? null;
      identities.set(code, identity);
    }
  }
  return identities;
}

async function loadFlandersCandidates(city, identity) {
  if (!identity?.center) return [];
  const { latitude, longitude } = identity.center;
  const latitudeDelta = 0.055;
  const longitudeDelta = 0.085;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: "vioe_geoportaal:bouwkundig_element",
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: "800",
    propertyName: "erfgoed_id,naam,locatie,geom",
    bbox: `${longitude - longitudeDelta},${latitude - latitudeDelta},${longitude + longitudeDelta},${latitude + latitudeDelta},EPSG:4326`
  });
  const payload = await fetchJsonWithRetry(
    `https://geo.onroerenderfgoed.be/geoserver/wfs?${params}`
  );
  const cityName = normalizeText(city.nameNl);
  return payload.features.flatMap((feature) => {
    const name = cleanLandmarkName(feature.properties?.naam);
    const location = normalizeText(feature.properties?.locatie);
    if (!isEligibleOfficialLandmark(name) || (location && !location.includes(cityName))) return [];
    const coordinate = geometryCentroid(feature.geometry);
    if (!coordinate) return [];
    return [createCandidate({
      city,
      coordinate,
      id: String(feature.properties.erfgoed_id),
      name,
      source: "flanders-inventaris",
      detail: feature.properties?.locatie ?? "",
      featured: true
    })];
  }).sort((left, right) => right.score - left.score);
}

async function loadWalloniaCandidates(city) {
  const params = new URLSearchParams({
    f: "json",
    where: `CODECARTO LIKE '${city.code}-%'`,
    outFields: "OBJECTID,CODECARTO,LIBELLE,NATURE,LIENDOC",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "1000"
  });
  const payload = await fetchJsonWithRetry(
    `https://geoservices.wallonie.be/arcgis/rest/services/AMENAGEMENT_TERRITOIRE/IPIC/MapServer/0/query?${params}`
  );
  return (payload.features ?? []).flatMap((feature) => {
    const name = cleanLandmarkName(feature.attributes?.LIBELLE);
    if (!isEligibleOfficialLandmark(name)) return [];
    const coordinate = arcGisCoordinate(feature.geometry);
    if (!coordinate) return [];
    return [createCandidate({
      city,
      coordinate,
      id: feature.attributes.CODECARTO || String(feature.attributes.OBJECTID),
      name,
      source: "wallonia-awap",
      detail: feature.attributes.NATURE ?? "",
      featured: /pastill|class/i.test(`${feature.attributes.NATURE ?? ""}`)
    })];
  }).sort((left, right) => right.score - left.score);
}

async function addWikidataCandidates(city, identity, candidates) {
  if (!identity?.wikidataId) return;
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
    LIMIT 250
  `);

  appendWikidataBindings(city, bindings, candidates);

  if (candidates.length < MIN_MEDALS_PER_CITY && identity.center) {
    const nearbyBindings = await queryWikidata(`
      SELECT ?item ?coord ?sitelinks ?nlLabel ?enLabel ?frLabel
        ?nlDescription ?enDescription ?frDescription
        (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
      WHERE {
        SERVICE wikibase:around {
          ?item wdt:P625 ?coord.
          bd:serviceParam wikibase:center "Point(${identity.center.longitude} ${identity.center.latitude})"^^geo:wktLiteral;
            wikibase:radius "6".
        }
        ?item wikibase:sitelinks ?sitelinks.
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
      LIMIT 250
    `);
    appendWikidataBindings(city, nearbyBindings, candidates);
  }
  candidates.sort((left, right) => right.score - left.score);
}

function appendWikidataBindings(city, bindings, candidates) {
  const existingIds = new Set(candidates.map((candidate) => candidate.id));
  for (const binding of bindings) {
    const coordinate = parseWktPoint(binding.coord?.value);
    const name = binding[`${city.localLanguage}Label`]?.value || binding.enLabel?.value || binding.frLabel?.value || binding.nlLabel?.value;
    const detail = `${binding.instanceLabels?.value ?? ""} ${binding.enDescription?.value ?? ""}`;
    if (!coordinate || !name || !isEligibleWikidataLandmark(name, detail)) continue;
    const itemId = binding.item.value.split("/").at(-1);
    const category = classifyBelgianLandmark(name, detail);
    const id = `be-${slugify(city.nameEn)}-wikidata-${itemId.toLowerCase()}`;
    if (existingIds.has(id)) continue;
    candidates.push({
      category,
      description: {
        en: binding.enDescription?.value || createDescription(category, name, city.nameEn, "en"),
        fr: binding.frDescription?.value || createDescription(category, name, city.nameFr, "fr"),
        nl: binding.nlDescription?.value || createDescription(category, name, city.nameNl, "nl")
      },
      externalIdentity: { id: itemId, source: "wikidata", type: "item" },
      id,
      ...coordinate,
      name: {
        en: binding.enLabel?.value || name,
        fr: binding.frLabel?.value || name,
        nl: binding.nlLabel?.value || name
      },
      score: Math.min(88, 32 + Math.log2(Math.max(1, Number(binding.sitelinks?.value))) * 7) + scoreLandmark(name, detail) / 5
    });
    existingIds.add(id);
  }
}

async function addOpenStreetMapCandidates(city, identity, candidates) {
  if (!identity?.osmRelationId) return;
  const elements = await queryOsmLandmarksForRelation(identity.osmRelationId);

  for (const element of elements) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const tags = element.tags ?? {};
    const name = tags[`name:${city.localLanguage}`] || tags.name;
    const detail = Object.entries(tags)
      .filter(([key]) => ["amenity", "building", "heritage", "historic", "leisure", "tourism"].includes(key))
      .map(([key, value]) => `${key} ${value}`)
      .join(" ");
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !name || !isEligibleWikidataLandmark(name, detail)) continue;
    const category = classifyBelgianLandmark(name, detail);
    candidates.push({
      category,
      description: {
        en: createDescription(category, tags["name:en"] || name, city.nameEn, "en"),
        fr: createDescription(category, tags["name:fr"] || name, city.nameFr, "fr"),
        nl: createDescription(category, tags["name:nl"] || name, city.nameNl, "nl")
      },
      externalIdentity: { id: String(element.id), source: "openstreetmap", type: element.type },
      id: `be-${slugify(city.nameEn)}-osm-${element.type}-${element.id}`,
      latitude,
      longitude,
      name: {
        en: tags["name:en"] || name,
        fr: tags["name:fr"] || name,
        nl: tags["name:nl"] || name
      },
      score: scoreLandmark(name, detail) + specificityBonus(name)
    });
  }
  candidates.sort((left, right) => right.score - left.score);
}

function createCandidate({ city, coordinate, detail, featured, id, name, source }) {
  const category = classifyBelgianLandmark(name, detail);
  return {
    category,
    description: {
      en: createDescription(category, name, city.nameEn, "en"),
      fr: createDescription(category, name, city.nameFr, "fr"),
      nl: createDescription(category, name, city.nameNl, "nl")
    },
    externalIdentity: { id, source, type: "record" },
    id: `be-${slugify(city.nameEn)}-${source}-${slugify(id)}`,
    ...coordinate,
    name: { en: name, fr: name, nl: name },
    score: scoreLandmark(name, detail, featured) + specificityBonus(name)
  };
}

function createDescription(category, name, city, language) {
  const templates = {
    en: {
      architecture: `${name} is a documented architectural landmark in ${city}.`,
      art: `${name} is a documented place associated with art and design in ${city}.`,
      culture: `${name} is a documented cultural landmark in ${city}.`,
      history: `${name} preserves part of the documented history of ${city}.`,
      nature: `${name} is a historic landscape or green landmark in ${city}.`
    },
    fr: {
      architecture: `${name} est un repère architectural inventorié à ${city}.`,
      art: `${name} est un lieu inventorié associé à l’art et au design à ${city}.`,
      culture: `${name} est un repère culturel inventorié à ${city}.`,
      history: `${name} conserve une partie de l’histoire documentée de ${city}.`,
      nature: `${name} est un paysage historique ou espace vert inventorié à ${city}.`
    },
    nl: {
      architecture: `${name} is een geïnventariseerd architecturaal herkenningspunt in ${city}.`,
      art: `${name} is een geïnventariseerde plek voor kunst en vormgeving in ${city}.`,
      culture: `${name} is een geïnventariseerd cultureel herkenningspunt in ${city}.`,
      history: `${name} bewaart een deel van de gedocumenteerde geschiedenis van ${city}.`,
      nature: `${name} is een geïnventariseerd historisch landschap of groen herkenningspunt in ${city}.`
    }
  };
  return templates[language][category];
}

function classifyBelgianLandmark(name, detail = "") {
  const text = normalizeText(`${name} ${detail}`);
  if (/park|tuin|jardin|garden|arboretum|begraafplaats|cimetiere|cemetery|landgoed|domaine|nature/.test(text)) return "nature";
  if (/museum|musee|galerie|beeld|sculpt|kunst|art |atelier|concert/.test(text)) return "art";
  if (/kerk|eglise|church|basiliek|basilique|basilica|kathedraal|cathedrale|synagoge|mosquee|theater|theatre|bibliotheek|bibliotheque|abdij|abbaye/.test(text)) return "culture";
  if (/fort|vesting|kasteel|chateau|castle|poort|porte|gate|stadhuis|hotel de ville|town hall|paleis|palais|palace|monument|gedenk|memorial|beffroi|belfort/.test(text)) return "history";
  return "architecture";
}

function isEligibleOfficialLandmark(name) {
  const value = normalizeText(name);
  return value.length >= 5 &&
    !/^(habitation|woning|huis|gebouw|immeuble|villa|ferme|hoeve|ensemble|monument|eglise|kerk|chapelle|kapel|chateau|kasteel)$/.test(value) &&
    !/^(burgerhuis|herenhuis|arbeiderswoning|stadswoning|dorpswoning|woonhuis|appartementsgebouw)( |$)/.test(value);
}

function isEligibleWikidataLandmark(name, detail) {
  const text = normalizeText(`${name} ${detail}`);
  const rejected = /person|human|football club|company|school|hospital|street|road|neighbourhood|district|event|election|bus stop|airport|municipality|village/.test(text);
  const landmark = /abbey|amphitheatre|art|basilica|basilique|beffroi|belfry|bridge|castle|cathedral|church|cinema|fort|garden|heritage|library|memorial|monument|mosque|museum|palace|park|sculpture|stadium|synagogue|theatre|tower|windmill|zoo|abbaye|chateau|eglise|musee|kerk|kasteel|museum/.test(text);
  return !rejected && landmark;
}

function geometryCentroid(geometry) {
  const points = [];
  collectCoordinates(geometry?.coordinates, points);
  if (points.length === 0) return null;
  return {
    longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length
  };
}

function collectCoordinates(value, points) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    points.push(value);
    return;
  }
  for (const child of value) collectCoordinates(child, points);
}

function arcGisCoordinate(geometry) {
  if (Number.isFinite(geometry?.x) && Number.isFinite(geometry?.y)) {
    return { longitude: geometry.x, latitude: geometry.y };
  }
  const points = geometry?.points ?? geometry?.paths?.flat() ?? geometry?.rings?.flat();
  if (!Array.isArray(points) || points.length === 0) return null;
  return {
    longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length
  };
}

async function fetchJsonWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "StreetExplorerCatalog/0.23" } });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("json")) throw new Error(`${url} returned ${contentType}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }));
}

function specificityBonus(name) {
  const value = normalizeText(name);
  let score = Math.min(20, value.split(" ").length * 2);
  if (/museum|musee|stadhuis|hotel de ville|kathedraal|cathedrale|belfort|beffroi|kasteel|chateau|abdij|abbaye/.test(value)) score += 20;
  return score;
}

function summarizeCoverage(cities, reports, nationalPopulation) {
  const population = cities.reduce((sum, city) => sum + city.population, 0);
  return {
    candidateCount: reports.reduce((sum, city) => sum + city.candidateCount, 0),
    cityCount: cities.length,
    medalCount: reports.reduce((sum, city) => sum + city.selectedCount, 0),
    population,
    populationCoverage: population / nationalPopulation
  };
}

function localizeEnglishCity(city) {
  const special = {
    "Antwerpen": "Antwerp",
    "Brussel": "Brussels",
    "Gent": "Ghent",
    "Luik": "Liège",
    "Mechelen": "Mechelen",
    "Bergen": "Mons",
    "Doornik": "Tournai",
    "Brugge": "Bruges"
  };
  return special[city.nameNl] ?? (city.regionCode === "02000" ? city.nameNl : city.nameFr);
}

function cleanCityName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanLandmarkName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
  return Object.fromEntries(args.map((argument) => {
    const [key, ...valueParts] = argument.replace(/^--/, "").split("=");
    return [key, valueParts.length > 0 ? valueParts.join("=") : true];
  }));
}
