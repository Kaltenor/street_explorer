import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyLandmark,
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
const MAX_CITY_COUNT = 100;
const MIN_MEDALS_PER_CITY = 5;
const CANDIDATE_BATCH_SIZE = 1;
const OSM_RELATION_OVERRIDES = new Map([["06435014", 535895]]);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const options = parseArguments(globalThis.process?.argv?.slice(2) ?? []);

if (!options.destatis && globalThis.nodeRepl) {
  options.destatis = path.join(
    repositoryRoot,
    ".tmp-country-pack-size/germany/GV100AD_31122024.txt"
  );
}

if (!options.destatis) {
  throw new Error(
    "Usage: node scripts/country-packs/generate-germany-pack.mjs " +
    "--destatis=<GV100AD_31122024.txt>"
  );
}

const allMunicipalities = parseDestatisMunicipalities(
  fs.readFileSync(path.resolve(options.destatis), "utf8")
);
const nationalPopulation = allMunicipalities.reduce(
  (total, city) => total + city.population,
  0
);
const targetCities = allMunicipalities.slice(0, MAX_CITY_COUNT);
const targetCodes = targetCities.map((city) => city.code);
const cachePath = path.resolve(
  options.cache ??
  path.join(
    globalThis.process?.env?.TEMP ?? path.join(repositoryRoot, ".tmp-country-pack-size/germany"),
    "street-explorer-germany-candidate-cache-v1.json"
  )
);
let identities;
let candidatesByCode;

if (fs.existsSync(cachePath)) {
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  identities = new Map(cache.identities);
  candidatesByCode = new Map(cache.candidatesByCode);
  const missingCacheCodes = targetCodes.filter(
    (code) => !identities.has(code) || !candidatesByCode.has(code)
  );
  if (missingCacheCodes.length > 0) {
    throw new Error(`Germany cache is incomplete for AGS: ${missingCacheCodes.join(", ")}.`);
  }
  console.log(`Loaded reproducible Germany candidate snapshot ${cachePath}.`);
} else {
  identities = await loadCityIdentities(targetCodes);
  candidatesByCode = await loadWikidataCandidates(targetCities, identities);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      identities: [...identities],
      candidatesByCode: [...candidatesByCode]
    }, null, 2)}\n`
  );
  console.log(`Wrote reproducible Germany candidate snapshot ${cachePath}.`);
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

  const cityNames = localizeCityName(city.name, identity);
  const citySlug = slugify(city.name);
  const albumId = `de-${citySlug}-${city.code}`;
  const album = {
    id: albumId,
    cityId: `${citySlug}-de-${city.code}`,
    cityZoneId: `relation/${identity.osmRelationId}`,
    cityName: cityNames,
    countryCode: "de",
    localLanguage: "de",
    version: 1,
    publishedAt: PUBLISHED_AT,
    sourceAttribution:
      "Population ranking: Statistisches Bundesamt (Destatis), GV100AD, 31 December 2024 (Census 2022 basis). Landmark identities, coordinates, labels and heritage-designation signals: Wikidata (CC0), used as a bounded fallback because Germany's official monument registers are maintained separately by its states; sparse results may be supplemented by OpenStreetMap (ODbL). Municipality boundary identity: OpenStreetMap relation via Wikidata P402 or de:amtlicher_gemeindeschluessel.",
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
    curated: false,
    heritageDesignatedCandidateCount: candidates.filter(
      (candidate) => candidate.heritageDesignated
    ).length,
    heritageDesignatedSelectedCount: selection.medals.filter(
      (medal) => medal.heritageDesignated
    ).length,
    localLanguage: "de",
    population: city.population,
    rank: index + 1,
    rejected: selection.rejected,
    requestedMedalCount,
    selectedCount: selection.medals.length,
    sourceCounts: countBy(
      selection.medals,
      (medal) => medal.externalIdentity.source
    ),
    version: 1,
    openStreetMapCandidateCount: candidates.filter(
      (candidate) => candidate.externalIdentity.source === "openstreetmap"
    ).length,
    wikidataCandidateCount: candidates.filter(
      (candidate) => candidate.externalIdentity.source === "wikidata"
    ).length
  });
}

for (const album of albums) {
  for (const medal of album.medals) {
    delete medal.heritageDesignated;
  }
}

const selectedPopulation = targetCities.reduce(
  (total, city) => total + city.population,
  0
);
const candidateCount = cityReports.reduce(
  (total, city) => total + city.candidateCount,
  0
);
const selectedMedalCount = cityReports.reduce(
  (total, city) => total + city.selectedCount,
  0
);
const qualityReport = {
  countryCode: "de",
  generatedAt: new Date().toISOString(),
  methodology: {
    citySelection: "Top 100 municipalities by official population; the 50% target is not reached before the catalogue cap.",
    maximumCityCount: MAX_CITY_COUNT,
    minimumMedalsPerCity: MIN_MEDALS_PER_CITY,
    populationDefinition: "Destatis GV100AD municipality population at 31 December 2024 (Census 2022 basis)",
    sparseCityFallback:
      "Up to 250 coordinate-bearing Wikidata places administratively located in each municipality; heritage-designated candidates are prioritized, with bounded OSM fallback only below five eligible results.",
    stateRegisterConstraint:
      "Germany has no single normalized national monument register with complete coordinates; direct state-register ingestion is deferred and fallback usage is reported per city."
  },
  expansion: {
    cityCount: targetCities.length,
    nationalPopulation,
    population: selectedPopulation,
    populationCoverage: selectedPopulation / nationalPopulation
  },
  candidateQuality: {
    candidateCount,
    heritageDesignatedCandidateCount: cityReports.reduce(
      (total, city) => total + city.heritageDesignatedCandidateCount,
      0
    ),
    heritageDesignatedSelectedCount: cityReports.reduce(
      (total, city) => total + city.heritageDesignatedSelectedCount,
      0
    ),
    selectedMedalCount,
    openStreetMapCandidateCount: cityReports.reduce(
      (total, city) => total + city.openStreetMapCandidateCount,
      0
    ),
    openStreetMapSelectedCount: cityReports.reduce(
      (total, city) => total + (city.sourceCounts.openstreetmap ?? 0),
      0
    ),
    wikidataFallbackCandidateCount: cityReports.reduce(
      (total, city) => total + city.wikidataCandidateCount,
      0
    ),
    wikidataFallbackSelectedCount: cityReports.reduce(
      (total, city) => total + (city.sourceCounts.wikidata ?? 0),
      0
    )
  },
  sources: {
    destatisDataset: "GV100AD_31122024",
    destatisPublisher: "Statistisches Bundesamt (Destatis)",
    destatisReferenceDate: "2024-12-31",
    landmarkSource: "Wikidata (CC0), with bounded OpenStreetMap (ODbL) sparse-city fallback",
    municipalityBoundarySource: "OpenStreetMap relation IDs via Wikidata P402 or de:amtlicher_gemeindeschluessel",
    municipalityBoundaryOverrides: {
      "06435014": "relation/535895 (Hanau; OSM relation cross-checked through Wikidata P402)"
    }
  },
  limitations: [
    "German v1 candidates are community-source records rather than direct state monument-register extracts.",
    "Wikidata administrative-location and heritage statements vary in completeness; sparse cities may use OpenStreetMap features.",
    "Descriptions are localized templates when Wikidata lacks a suitable English, French, or German description.",
    "The top-100 cap covers less than half of Germany's population because the population is distributed across many municipalities."
  ],
  cities: cityReports
};
const pack = {
  albums,
  countryCode: "de",
  formatVersion: 1,
  generatedAt: qualityReport.generatedAt,
  languages: ["en", "fr", "de"],
  publishedAt: PUBLISHED_AT,
  sourceAttribution: albums[0].sourceAttribution,
  version: PACK_VERSION
};
const artifacts = writeCountryPackArtifacts({
  descriptorUrl:
    "https://raw.githubusercontent.com/Kaltenor/street_explorer/main/country-packs/v1/de-v1.json.gz",
  outputDirectory: path.join(repositoryRoot, "country-packs/v1"),
  pack,
  qualityReport
});

console.log(
  `Generated ${albums.length} German albums with ${artifacts.descriptor.medalCount} medals ` +
  `(${artifacts.descriptor.compressedBytes} compressed bytes, ` +
  `${(qualityReport.expansion.populationCoverage * 100).toFixed(2)}% population coverage).`
);

function parseDestatisMunicipalities(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.slice(0, 2) === "60")
    .map((line) => ({
      code: line.slice(10, 18),
      name: cleanMunicipalityName(line.slice(22, 72)),
      population: Number(line.slice(139, 150))
    }))
    .filter(
      (city) => /^\d{8}$/.test(city.code) && city.name && Number.isFinite(city.population)
    )
    .sort((left, right) =>
      right.population - left.population || left.code.localeCompare(right.code)
    );
}

async function loadCityIdentities(codes) {
  const identities = new Map();

  for (let offset = 0; offset < codes.length; offset += 5) {
    const batch = codes.slice(offset, offset + 5);
    const bindings = await queryWikidata(`
      SELECT ?city ?code ?osm WHERE {
        VALUES ?code { ${batch.map((code) => `"${code}"`).join(" ")} }
        ?city wdt:P439 ?code.
        OPTIONAL { ?city wdt:P402 ?osm }
      }
    `);
    for (const binding of bindings) {
      identities.set(binding.code.value, {
        osmRelationId: binding.osm?.value ? Number(binding.osm.value) : null,
        wikidataId: binding.city.value.split("/").at(-1)
      });
    }
    console.log(`Loaded identity batch ${offset + 1}-${Math.min(offset + 5, codes.length)}.`);
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  for (const [code, relationId] of OSM_RELATION_OVERRIDES) {
    const identity = identities.get(code) ?? {};
    identity.osmRelationId ||= relationId;
    identities.set(code, identity);
  }

  const missingRelations = codes.filter((code) => !identities.get(code)?.osmRelationId);
  if (missingRelations.length > 0) {
    const osmRelations = await queryOsmMunicipalityRelations(
      missingRelations,
      "de:amtlicher_gemeindeschluessel"
    );
    for (const code of missingRelations) {
      const identity = identities.get(code) ?? {};
      identity.osmRelationId = osmRelations.get(code) ?? null;
      identities.set(code, identity);
    }
  }

  const missingIdentities = codes.filter((code) => !identities.get(code)?.osmRelationId);
  if (missingIdentities.length > 0) {
    throw new Error(`Missing municipality identities for AGS: ${missingIdentities.join(", ")}.`);
  }

  return identities;
}

async function loadWikidataCandidates(cities, identities) {
  const candidatesByCode = new Map(cities.map((city) => [city.code, []]));

  for (let offset = 0; offset < cities.length; offset += CANDIDATE_BATCH_SIZE) {
    const batch = cities.slice(offset, offset + CANDIDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (city) => ({
        city,
        bindings: await queryWikidata(`
          SELECT ?item ?coord ?sitelinks
            (SAMPLE(?deLabelValue) AS ?deLabel)
            (SAMPLE(?enLabelValue) AS ?enLabel)
            (SAMPLE(?frLabelValue) AS ?frLabel)
            (SAMPLE(?deDescriptionValue) AS ?deDescription)
            (SAMPLE(?enDescriptionValue) AS ?enDescription)
            (SAMPLE(?frDescriptionValue) AS ?frDescription)
            (COUNT(DISTINCT ?heritage) AS ?heritageCount)
          WHERE {
            ?item wdt:P131* wd:${identities.get(city.code).wikidataId};
              wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
            FILTER(?item != wd:${identities.get(city.code).wikidataId} && ?sitelinks >= 1)
            OPTIONAL { ?item rdfs:label ?deLabelValue. FILTER(LANG(?deLabelValue) = "de") }
            OPTIONAL { ?item rdfs:label ?enLabelValue. FILTER(LANG(?enLabelValue) = "en") }
            OPTIONAL { ?item rdfs:label ?frLabelValue. FILTER(LANG(?frLabelValue) = "fr") }
            OPTIONAL { ?item schema:description ?deDescriptionValue. FILTER(LANG(?deDescriptionValue) = "de") }
            OPTIONAL { ?item schema:description ?enDescriptionValue. FILTER(LANG(?enDescriptionValue) = "en") }
            OPTIONAL { ?item schema:description ?frDescriptionValue. FILTER(LANG(?frDescriptionValue) = "fr") }
            OPTIONAL { ?item wdt:P1435 ?heritage }
          }
          GROUP BY ?item ?coord ?sitelinks
          ORDER BY DESC(?sitelinks)
          LIMIT 250
        `)
      }))
    );

    for (const { city, bindings } of results) {
      const localNames = localizeCityName(city.name, identities.get(city.code));
      for (const binding of bindings) {
        const coordinate = parseWktPoint(binding.coord?.value);
        const name = binding.deLabel?.value || binding.enLabel?.value || binding.frLabel?.value;
        const detail = [
          binding.deDescription?.value,
          binding.enDescription?.value,
          binding.frDescription?.value
        ].filter(Boolean).join(" ");

        if (!coordinate || !name || !isEligibleLandmark(name, detail)) {
          continue;
        }

        const category = classifyGermanLandmark(name, detail);
        const heritageDesignated = Number(binding.heritageCount?.value ?? 0) > 0;
        const itemId = binding.item.value.split("/").at(-1);
        candidatesByCode.get(city.code).push({
          category,
          description: {
            de: binding.deDescription?.value || createGermanDescription(category, name, localNames.de),
            en: binding.enDescription?.value || createEnglishDescription(category, name, localNames.en),
            fr: binding.frDescription?.value || createFrenchDescription(category, name, localNames.fr)
          },
          externalIdentity: { id: itemId, source: "wikidata", type: "item" },
          heritageDesignated,
          id: `de-${slugify(city.name)}-${city.code}-wikidata-${itemId.toLowerCase()}`,
          ...coordinate,
          name: {
            de: binding.deLabel?.value || name,
            en: binding.enLabel?.value || name,
            fr: binding.frLabel?.value || name
          },
          score: (heritageDesignated ? 45 : 0) +
            Math.min(58, 20 + Math.log2(Math.max(1, Number(binding.sitelinks?.value))) * 6) +
            scoreLandmark(name, detail) / 5
        });
      }
    }

    console.log(
      `Loaded candidate batch ${offset + 1}-${Math.min(offset + CANDIDATE_BATCH_SIZE, cities.length)}.`
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  const sparseCities = cities.filter(
    (city) => (candidatesByCode.get(city.code)?.length ?? 0) < MIN_MEDALS_PER_CITY
  );
  for (const city of sparseCities) {
    const elements = await queryOsmLandmarksWithRetry(identities.get(city.code).osmRelationId);
    addOsmCandidates(city, identities.get(city.code), elements, candidatesByCode.get(city.code));
  }

  for (const candidates of candidatesByCode.values()) {
    candidates.sort((left, right) =>
      right.score - left.score || left.id.localeCompare(right.id)
    );
  }

  const remainingSparseCities = cities.filter(
    (city) => (candidatesByCode.get(city.code)?.length ?? 0) < MIN_MEDALS_PER_CITY
  );
  if (remainingSparseCities.length > 0) {
    throw new Error(
      `Fewer than ${MIN_MEDALS_PER_CITY} eligible candidates for: ` +
      remainingSparseCities.map((city) => `${city.name} (${city.code})`).join(", ")
    );
  }

  return candidatesByCode;
}

function addOsmCandidates(city, identity, elements, candidates) {
  const localNames = localizeCityName(city.name, identity);

  for (const element of elements) {
    const coordinate = getOsmCoordinate(element);
    const tags = element.tags ?? {};
    const name = tags["name:de"] || tags.name;
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

    if (!coordinate || !name || !isEligibleLandmark(name, detail)) continue;

    const category = classifyGermanLandmark(name, detail);
    const heritageDesignated = Boolean(
      tags.heritage || tags["heritage:operator"] || tags["ref:lda"] || tags["ref:denkmal"]
    );
    candidates.push({
      category,
      description: {
        de: createGermanDescription(category, name, localNames.de),
        en: createEnglishDescription(category, tags["name:en"] || name, localNames.en),
        fr: createFrenchDescription(category, tags["name:fr"] || name, localNames.fr)
      },
      externalIdentity: {
        id: `${element.type}/${element.id}`,
        source: "openstreetmap",
        type: element.type
      },
      heritageDesignated,
      id: `de-${slugify(city.name)}-${city.code}-osm-${element.type}-${element.id}`,
      ...coordinate,
      name: {
        de: name,
        en: tags["name:en"] || name,
        fr: tags["name:fr"] || name
      },
      score: (heritageDesignated ? 45 : 0) + 30 + scoreLandmark(name, detail) / 2
    });
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

function getOsmCoordinate(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function classifyGermanLandmark(name, detail) {
  const text = normalizeText(`${name} ${detail}`);

  if (/park|garten|friedhof|landschaft|naturdenkmal|botanisch|zoo/.test(text)) {
    return "nature";
  }
  if (/museum|galerie|kunst|skulptur|plastik|konzerthaus|opera|oper /.test(text)) {
    return "art";
  }
  if (/kirche|dom |munster|basilika|synagoge|moschee|theater|bibliothek|kapelle|kloster/.test(text)) {
    return "culture";
  }
  if (/burg|schloss|festung|tor |rathaus|palais|denkmal|gedenk|histor/.test(text)) {
    return "history";
  }

  return classifyLandmark(name, detail);
}

function isEligibleLandmark(name, detail) {
  const text = normalizeText(`${name} ${detail}`);
  const rejected =
    /human|person|football club|sports team|company|school|university|hospital|street|road|quarter|neighbourhood|district|event|election|railway line|airport|bus stop|administrative territorial entity/.test(text);
  const landmark =
    /abbey|amphitheatre|aquarium|art|arts centre|attraction|basilica|bridge|building|castle|cathedral|chapel|church|cinema|concert hall|cultural heritage|fort|fountain|gallery|garden|heritage|historic|library|lighthouse|memorial|monastery|monument|mosque|museum|opera|palace|park|place of worship|sculpture|stadium|synagogue|theatre|tower|town hall|viewpoint|windmill|zoo|architektur|bauwerk|bibliothek|brucke|burg|denkmal|festung|garten|kirche|kloster|kunst|museum|park|rathaus|schloss|theater|tor|turm/.test(text);
  return !rejected && landmark;
}

function createGermanDescription(category, name, cityName) {
  const templates = {
    architecture: `${name} ist ein architektonisches Wahrzeichen in ${cityName}.`,
    art: `${name} ist ein Ort für Kunst und Gestaltung in ${cityName}.`,
    culture: `${name} ist ein kulturelles Wahrzeichen in ${cityName}.`,
    history: `${name} bewahrt einen Teil der dokumentierten Geschichte von ${cityName}.`,
    nature: `${name} ist eine historische Landschaft oder grüne Sehenswürdigkeit in ${cityName}.`
  };
  return templates[category];
}

function createEnglishDescription(category, name, cityName) {
  const templates = {
    architecture: `${name} is an architectural landmark in ${cityName}.`,
    art: `${name} is a place associated with art and design in ${cityName}.`,
    culture: `${name} is a cultural landmark in ${cityName}.`,
    history: `${name} preserves part of the documented history of ${cityName}.`,
    nature: `${name} is a historic landscape or green landmark in ${cityName}.`
  };
  return templates[category];
}

function createFrenchDescription(category, name, cityName) {
  const templates = {
    architecture: `${name} est un monument architectural à ${cityName}.`,
    art: `${name} est un lieu associé à l’art et au design à ${cityName}.`,
    culture: `${name} est un monument culturel à ${cityName}.`,
    history: `${name} conserve une partie de l’histoire documentée de ${cityName}.`,
    nature: `${name} est un paysage historique ou espace vert remarquable à ${cityName}.`
  };
  return templates[category];
}

function cleanMunicipalityName(value) {
  return String(value ?? "")
    .trim()
    .replace(/, (Freie und )?Hansestadt$/, "")
    .replace(/, (Bundes|Landes|Universitäts|Kreis|Große Kreis|Hansestadt, )*Landeshauptstadt$/, "")
    .replace(/, (Hansestadt|Universitätsstadt|Stadt|Bundesstadt|Kreisstadt|documenta-Stadt)$/, "")
    .replace(/, Stadt der documenta$/, "")
    .trim();
}

function localizeCityName(name, identity) {
  return {
    de: identity.deLabel || name,
    en: identity.enLabel || identity.deLabel || name,
    fr: identity.frLabel || identity.deLabel || name
  };
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
