import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const arguments_ = process.argv.slice(2);
const sourcePaths = arguments_.filter((argument) => !argument.startsWith("--"));
const [inseePath, merimeePath, museofilePath] = sourcePaths;
const cacheArgument = arguments_.find((argument) => argument.startsWith("--cache-dir="));

if (!inseePath || !merimeePath || !museofilePath) {
  throw new Error(
    "Usage: node scripts/generate-france-medal-catalog.mjs <donnees_communes.csv> <merimee.csv> <museofile.csv> [--cache-dir=<directory>]"
  );
}

const ROOT = process.cwd();
const OUTPUT_DIRECTORY = path.join(ROOT, "assets", "medals", "france");
const MANIFEST_PATH = path.join(
  ROOT,
  "src",
  "data",
  "generated",
  "franceMedalAlbumManifest.ts"
);
const SOURCE_SNAPSHOT_PATH = path.join(
  ROOT,
  "assets",
  "medals",
  "france-top-500-sources.json"
);
const PUBLISHED_AT = "2026-08-26";
const CATALOG_CITY_COUNT = 500;
const TOP_CITY_COUNT = 100;
const TOP_CITY_MIN_MEDALS = 20;
const OTHER_CITY_MIN_MEDALS = 10;
const CACHE_DIRECTORY = cacheArgument
  ? path.resolve(ROOT, cacheArgument.slice("--cache-dir=".length))
  : null;
let nextWikidataRequestAt = 0;
let nextNominatimRequestAt = 0;

const MAYOTTE_2017_POPULATIONS = [
  { department: "976", inseeCode: "97601", name: "Acoua", population: 5192 },
  { department: "976", inseeCode: "97602", name: "Bandraboua", population: 13989 },
  { department: "976", inseeCode: "97603", name: "Bandrele", population: 10282 },
  { department: "976", inseeCode: "97604", name: "Bouéni", population: 6189 },
  { department: "976", inseeCode: "97605", name: "Chiconi", population: 8295 },
  { department: "976", inseeCode: "97606", name: "Chirongui", population: 8920 },
  { department: "976", inseeCode: "97607", name: "Dembeni", population: 15848 },
  { department: "976", inseeCode: "97608", name: "Dzaoudzi", population: 17831 },
  { department: "976", inseeCode: "97609", name: "Kani-Kéli", population: 5507 },
  { department: "976", inseeCode: "97610", name: "Koungou", population: 32156 },
  { department: "976", inseeCode: "97611", name: "Mamoudzou", population: 71437 },
  { department: "976", inseeCode: "97612", name: "Mtsamboro", population: 7705 },
  { department: "976", inseeCode: "97613", name: "M'Tsangamouji", population: 6432 },
  { department: "976", inseeCode: "97614", name: "Ouangani", population: 10203 },
  { department: "976", inseeCode: "97615", name: "Pamandzi", population: 11442 },
  { department: "976", inseeCode: "97616", name: "Sada", population: 11156 },
  { department: "976", inseeCode: "97617", name: "Tsingoni", population: 13934 }
];

// Latest official municipal populations for overseas collectivities whose
// communes can enter the current top 500. The next-largest omitted commune is
// Moorea-Maiao (18,201 inhabitants), below the catalogue cutoff.
const OVERSEAS_COLLECTIVITY_TOP_500_POPULATIONS = [
  { department: "978", inseeCode: "97801", name: "Saint-Martin", population: 31160 },
  { department: "987", inseeCode: "98715", name: "Faaa", population: 29826 },
  { department: "987", inseeCode: "98735", name: "Papeete", population: 26654 },
  { department: "987", inseeCode: "98738", name: "Punaauia", population: 28781 },
  { department: "988", inseeCode: "98805", name: "Dumbéa", population: 34926 },
  { department: "988", inseeCode: "98817", name: "Le Mont-Dore", population: 25303 },
  { department: "988", inseeCode: "98818", name: "Nouméa", population: 85976 },
  { department: "988", inseeCode: "98821", name: "Païta", population: 27609 }
];

const curatedFilesByInseeCode = new Map([
  ["75056", "../paris-v1.json"],
  ["13055", "../marseille-v1.json"],
  ["69123", "../lyon-v1.json"],
  ["69266", "../villeurbanne-v1.json"],
  ["74281", "../thonon-les-bains-v1.json"]
]);
const osmRelationOverridesByInseeCode = new Map([
  ["42207", 122931],
  ["73065", 74386],
  ["97801", 299354],
  ["98715", 6093624],
  ["98735", 5829526],
  ["98738", 6093629],
  ["98805", 377753],
  ["98817", 377754],
  ["98818", 377752],
  ["98821", 377755]
]);
const sparseBoundaryCityCodes = new Set([
  "26058", "59271", "77285", "78383", "83047", "95555"
]);

function getMinimumMedalCount(rank) {
  return rank <= TOP_CITY_COUNT ? TOP_CITY_MIN_MEDALS : OTHER_CITY_MIN_MEDALS;
}

function parseDelimitedRecord(record, delimiter) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < record.length; index += 1) {
    const character = record[index];

    if (character === '"') {
      if (quoted && record[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

function hasBalancedQuotes(value) {
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '"') {
      continue;
    }

    if (quoted && value[index + 1] === '"') {
      index += 1;
    } else {
      quoted = !quoted;
    }
  }

  return !quoted;
}

async function readDelimitedRows(filePath, delimiter, onRow) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ crlfDelay: Infinity, input });
  let headers = null;
  let pending = "";

  for await (const line of lines) {
    pending = pending ? `${pending}\n${line}` : line;

    if (!hasBalancedQuotes(pending)) {
      continue;
    }

    const fields = parseDelimitedRecord(pending, delimiter);
    pending = "";

    if (!headers) {
      headers = fields.map((field) => field.replace(/^\uFEFF/, ""));
      continue;
    }

    const row = Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
    await onRow(row);
  }
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function parseCoordinate(value) {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value ?? "");

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function parseWktPoint(value) {
  const match = /^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/.exec(value ?? "");
  return match
    ? { latitude: Number(match[2]), longitude: Number(match[1]) }
    : null;
}

function classifyLandmark(name, denomination = "") {
  const text = normalizeText(`${name} ${denomination}`);
  const normalizedName = normalizeText(name);

  if (/musee|theatre|opera|bibliotheque|cinema|mediatheque|archives|conservatoire/.test(text)) {
    return "culture";
  }

  if (/^(parc|jardin|arboretum|grotte|cascade|fontaine|ile|bois|lac)\b/.test(normalizedName)) {
    return "nature";
  }

  if (/statue|sculpture|fresque|mosa[iï]que|monument aux morts/.test(text)) {
    return "art";
  }

  if (/abbaye|chateau|fort|citadelle|rempart|porte|tour|dolmen|oppidum|amphitheatre|vestige|ruine|archeolog/.test(text)) {
    return "history";
  }

  return "architecture";
}

function scoreLandmark(name, detail, protection = "") {
  const text = normalizeText(`${name} ${detail}`);
  let score = /classe/.test(normalizeText(protection)) ? 35 : 20;
  const weights = [
    [/cathedrale|basilique|abbaye|chateau|citadelle|beffroi/, 42],
    [/hotel de ville|palais|opera|theatre|musee/, 36],
    [/eglise|synagogue|temple|mosquee|fort|porte|tour|pont/, 28],
    [/gare|halle|marche|bibliotheque|jardin|parc|fontaine/, 20],
    [/maison|villa|hotel|immeuble/, 8]
  ];

  for (const [pattern, weight] of weights) {
    if (pattern.test(text)) {
      score += weight;
      break;
    }
  }

  if (/facade|toiture|escalier|vestiges?|restes?|parties?/.test(text)) {
    score -= 14;
  }

  return score;
}

function cleanName(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^Ancien(?:ne)?\s+/i, "Ancien ")
    .trim();
}

function isEligibleWikidataLandmark(name, instanceLabel, description) {
  const text = normalizeText(`${name} ${instanceLabel} ${description}`);
  const normalizedName = normalizeText(name);
  const rejected =
    /arret |ligne de transport|voie publique|voie de communication|attentat|festival|competition sportive|tournoi|championnat|election/.test(text) ||
    /^(rue|avenue|boulevard|route|chemin)\b/.test(normalizedName) ||
    (/^allee\b/.test(normalizedName) && !/^allee couverte\b/.test(normalizedName));
  const landmark =
    /abbaye|aerodrome|aeroport|amphitheatre|aquarium|arboretum|arena|arbre remarquable|base aerienne|basilique|beffroi|bibliotheque|bois|camp memorial|campus|canal|cathedrale|centre commercial|centre culturel|centre de design|centre hospitalier|centre technique|chapelle|chateau|cimetiere|cinema|citadelle|college|colline|commune francaise|complexe sportif|croix|domaine|ecole|edifice|eglise|entreprise technologique|equipement|etablissement d enseignement|fleuve|foret|fort |fortification|fontaine|gare ferroviaire|grange|grotte|gymnase|halle|hameau|hopital|hotel de ville|ile de loisirs|installation sportive|institut|jardin|lac|lavoir|lycee|mairie|manoir|marche|mediatheque|memorial|monument|montagne|mosquee|moulin|musee|oeuvre architecturale|opera|oppidum|ouvrage d art|palais|parc |patinoire|phare|piscine|place |plage|point de vue|pont |porte |prieure|quartier|riviere|salle de spectacle|sculpture|siege social|square jardin|stade|station de metro|station de rer|station de tramway|synagogue|temple|theatre|tour |tunnel|universite|velodrome|village|base sous marine|batiment|zone commerciale/.test(text);

  return !rejected && landmark;
}

function isEligibleBoundaryWikidataCandidate(name, instanceLabel, description) {
  if (isEligibleWikidataLandmark(name, instanceLabel, description)) {
    return true;
  }
  const text = normalizeText(`${name} ${instanceLabel} ${description}`);
  return !(
    /arret |station de velopartage|ligne de transport|attentat|festival|combat |competition sportive|tournoi|championnat|election|personne|etre humain/.test(text)
  );
}

function buildNameTokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 2 && !["ancien", "ancienne", "actuel", "actuellement", "dite", "dit"].includes(token))
  );
}

function areNamesSimilar(left, right) {
  const leftTokens = buildNameTokenSet(left);
  const rightTokens = buildNameTokenSet(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && intersection / union >= 0.65;
}

function createTemplateDescription(category, name, language) {
  const templates = {
    architecture: {
      en: `${name} is a distinctive architectural landmark in the city.`,
      fr: `${name} est un repère architectural remarquable de la ville.`
    },
    art: {
      en: `${name} is a notable work of public art and local memory.`,
      fr: `${name} est une œuvre marquante de l’art public et de la mémoire locale.`
    },
    culture: {
      en: `${name} is one of the city's notable cultural landmarks.`,
      fr: `${name} compte parmi les lieux culturels marquants de la ville.`
    },
    history: {
      en: `${name} is an important witness to the city's history.`,
      fr: `${name} est un témoin important de l’histoire de la ville.`
    },
    nature: {
      en: `${name} is one of the city's notable green or natural landmarks.`,
      fr: `${name} compte parmi les repères naturels ou paysagers de la ville.`
    }
  };

  return templates[category][language];
}

function createCandidate({
  category,
  citySlug,
  descriptionEn,
  descriptionFr,
  externalId,
  externalSource,
  externalType,
  latitude,
  longitude,
  name,
  score
}) {
  const clean = cleanName(name);
  const resolvedCategory = category ?? classifyLandmark(clean);

  return {
    category: resolvedCategory,
    description: {
      en: descriptionEn || createTemplateDescription(resolvedCategory, clean, "en"),
      fr: descriptionFr || createTemplateDescription(resolvedCategory, clean, "fr")
    },
    externalIdentity: {
      id: externalId,
      source: externalSource,
      type: externalType
    },
    id: `${citySlug}-${slugify(clean)}-${slugify(String(externalId))}`,
    latitude,
    longitude,
    name: { en: clean, fr: clean },
    score
  };
}

function deduplicateAndSelect(candidates, maximum, minimum = maximum) {
  const selected = [];
  const normalizedNames = new Set();
  const coordinateKeys = new Set();
  const categoryCounts = new Map();
  const deferred = [];
  const categoryLimit = Math.max(2, Math.ceil(maximum / 3));

  function trySelect(candidate, enforceCategoryLimit) {
    const normalizedName = normalizeText(candidate.name.fr);
    const coordinateKey = `${candidate.latitude.toFixed(5)}:${candidate.longitude.toFixed(5)}`;

    if (
      !normalizedName ||
      normalizedNames.has(normalizedName) ||
      selected.some((existing) => areNamesSimilar(existing.name.fr, candidate.name.fr)) ||
      coordinateKeys.has(coordinateKey) ||
      /^(immeuble|maison|villa|hotel particulier)( |$)/.test(normalizedName) && selected.length >= minimum
    ) {
      return false;
    }

    if (
      enforceCategoryLimit &&
      (categoryCounts.get(candidate.category) ?? 0) >= categoryLimit
    ) {
      return false;
    }

    selected.push(candidate);
    normalizedNames.add(normalizedName);
    coordinateKeys.add(coordinateKey);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) ?? 0) + 1);
    return true;
  }

  for (const candidate of [...candidates].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id)
  )) {
    if (!trySelect(candidate, true)) {
      deferred.push(candidate);
    }

    if (selected.length >= maximum) {
      break;
    }
  }

  for (const candidate of deferred) {
    if (selected.length >= minimum) {
      break;
    }

    trySelect(candidate, false);
  }

  return selected.slice(0, maximum).map(({ score: _score, ...candidate }) => candidate);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function readCache(namespace, cacheKey) {
  if (!CACHE_DIRECTORY) {
    return null;
  }
  const cachePath = path.join(CACHE_DIRECTORY, `${namespace}-${cacheKey}.json`);
  return fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
    : null;
}

function writeCache(namespace, cacheKey, value) {
  if (!CACHE_DIRECTORY) {
    return;
  }
  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
  fs.writeFileSync(
    path.join(CACHE_DIRECTORY, `${namespace}-${cacheKey}.json`),
    `${JSON.stringify(value)}\n`,
    "utf8"
  );
}

async function fetchWithTimeout(url, options, timeoutMilliseconds) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function queryWikidata(query, cacheKey, { required = true } = {}) {
  const cached = readCache("wikidata", cacheKey);
  if (cached) {
    return cached;
  }
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  let lastError;

  const maximumAttempts = required ? 4 : 2;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const waitMilliseconds = Math.max(0, nextWikidataRequestAt - Date.now());
      if (waitMilliseconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
      }
      nextWikidataRequestAt = Date.now() + 1100;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      let response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/sparql-results+json",
            "User-Agent": "StreetExplorerCatalog/0.33 (offline catalogue generator)"
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(`Wikidata returned ${response.status}`);
      }

      const bindings = (await response.json()).results.bindings;
      writeCache("wikidata", cacheKey, bindings);
      return bindings;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  if (required) {
    throw lastError;
  }
  console.warn(`Skipping optional Wikidata batch ${cacheKey}: ${lastError?.message ?? lastError}`);
  return [];
}

async function queryOsmRelationIds(inseeCodes) {
  if (inseeCodes.length === 0) {
    return new Map();
  }

  const cacheKey = stableHash(inseeCodes.join("|"));
  const cached = readCache("osm-relations", cacheKey);
  if (cached) {
    return new Map(cached);
  }
  const pattern = `^(${inseeCodes.join("|")})$`;
  const query = `[out:json][timeout:180];relation["boundary"="administrative"]["ref:INSEE"~"${pattern}"];out tags;`;
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  let lastStatus = "unavailable";

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "StreetExplorerCatalog/0.33"
          },
          method: "POST"
        }, 45000);
        lastStatus = String(response.status);

        if (!response.ok) {
          throw new Error(`${endpoint} returned ${response.status}`);
        }

        const elements = (await response.json()).elements;
        const relations = elements
          .filter((element) => element.type === "relation" && element.tags?.["ref:INSEE"])
          .map((element) => [element.tags["ref:INSEE"], element.id]);
        writeCache("osm-relations", cacheKey, relations);
        return new Map(relations);
      } catch (error) {
        lastStatus = error.message;
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    }
  }

  throw new Error(`Overpass returned ${lastStatus} for missing commune identities`);
}

function getOsmCoordinate(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function isPointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if (
      (y > latitude) !== (previousY > latitude) &&
      longitude < ((previousX - x) * (latitude - y)) / (previousY - y) + x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInPolygon(longitude, latitude, rings) {
  return rings.length > 0 &&
    isPointInRing(longitude, latitude, rings[0]) &&
    !rings.slice(1).some((ring) => isPointInRing(longitude, latitude, ring));
}

function isPointInGeoJson(longitude, latitude, geometry) {
  if (geometry?.type === "Polygon") {
    return isPointInPolygon(longitude, latitude, geometry.coordinates);
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) =>
      isPointInPolygon(longitude, latitude, polygon)
    );
  }
  return false;
}

async function queryNominatimBoundary(relationId) {
  const cacheKey = String(relationId);
  const cached = readCache("osm-boundary", cacheKey);
  if (cached) {
    return cached;
  }
  const waitMilliseconds = Math.max(0, nextNominatimRequestAt - Date.now());
  if (waitMilliseconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
  }
  nextNominatimRequestAt = Date.now() + 1100;
  const url = "https://nominatim.openstreetmap.org/lookup?" + new URLSearchParams({
    format: "jsonv2",
    osm_ids: `R${relationId}`,
    polygon_geojson: "1"
  });
  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": "StreetExplorerCatalog/0.33" }
  }, 45000);
  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }
  const boundary = (await response.json())[0];
  if (!boundary?.boundingbox || !boundary?.geojson) {
    throw new Error(`Nominatim returned no boundary for relation ${relationId}`);
  }
  writeCache("osm-boundary", cacheKey, boundary);
  return boundary;
}

async function addBoundaryWikidataCandidates(city, boundary, candidates) {
  const [south, north, west, east] = boundary.boundingbox.map(Number);
  const includeItemsWithoutSitelinks = sparseBoundaryCityCodes.has(city.inseeCode);
  const query = `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    SELECT ?item ?coord ?sitelinks ?frLabel ?enLabel ?frDescription ?enDescription
      (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
    WHERE {
      SERVICE wikibase:box {
        ?item wdt:P625 ?coord.
        bd:serviceParam wikibase:cornerWest "Point(${west} ${south})"^^geo:wktLiteral.
        bd:serviceParam wikibase:cornerEast "Point(${east} ${north})"^^geo:wktLiteral.
      }
      ?item wikibase:sitelinks ?sitelinks.
      ${includeItemsWithoutSitelinks ? "" : "FILTER(?sitelinks >= 1)"}
      OPTIONAL { ?item rdfs:label ?frLabel. FILTER(LANG(?frLabel) = "fr") }
      OPTIONAL { ?item rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
      OPTIONAL { ?item schema:description ?frDescription. FILTER(LANG(?frDescription) = "fr") }
      OPTIONAL { ?item schema:description ?enDescription. FILTER(LANG(?enDescription) = "en") }
      OPTIONAL {
        ?item wdt:P31 ?instance.
        ?instance rdfs:label ?instanceLabel.
        FILTER(LANG(?instanceLabel) = "fr")
      }
    }
    GROUP BY ?item ?coord ?sitelinks ?frLabel ?enLabel ?frDescription ?enDescription
  `;
  const bindings = await queryWikidata(
    query,
    `boundary-landmarks${includeItemsWithoutSitelinks ? "-all" : ""}-${city.inseeCode}-${stableHash(boundary.boundingbox.join("|"))}`,
    { required: false }
  );

  for (const binding of bindings) {
    const coordinate = parseWktPoint(binding.coord.value);
    const name = binding.frLabel?.value || binding.enLabel?.value;
    const instanceLabel = binding.instanceLabels?.value ?? "";
    const description = `${binding.frDescription?.value ?? ""} ${binding.enDescription?.value ?? ""}`;
    if (
      !coordinate ||
      !name ||
      !isPointInGeoJson(coordinate.longitude, coordinate.latitude, boundary.geojson) ||
      !isEligibleBoundaryWikidataCandidate(name, instanceLabel, description)
    ) {
      continue;
    }
    const itemId = binding.item.value.split("/").at(-1);
    const sitelinks = Number(binding.sitelinks.value);
    candidates.push(createCandidate({
      category: classifyLandmark(name, instanceLabel),
      citySlug: city.catalogSlug,
      descriptionEn: binding.enDescription?.value,
      descriptionFr: binding.frDescription?.value,
      externalId: itemId,
      externalSource: "wikidata",
      externalType: "item",
      ...coordinate,
      name,
      score: Math.min(66, 28 + Math.log2(Math.max(1, sitelinks)) * 6) +
        scoreLandmark(name, instanceLabel) / 4
    }));
  }
}

function isEligibleOsmLandmark(name, detail) {
  const text = normalizeText(`${name} ${detail}`);
  const normalizedName = normalizeText(name);
  const rejected =
    /ecole|college|lycee|universite|hopital|clinique|pharmacie|supermarche|restaurant|bar |bureau|entreprise|parking|station service|arret|gare routiere|aeroport|terrain de sport|salle de sport|lotissement|quartier|zone industrielle/.test(text) ||
    /^(rue|avenue|boulevard|route|chemin|place|allee)\b/.test(normalizedName);
  const landmark =
    /abbaye|aquarium|arboretum|arts centre|basilique|bibliotheque|campanile|cascade|cathedrale|chapelle|chateau|cinema|citadelle|eglise|fort |fontaine|galerie|grotte|jardin|lighthouse|marche|mairie|memorial|mosquee|moulin|musee|monument|opera|palais|parc |phare|pont |porte |sculpture|stade|synagogue|temple|theatre|tour |viewpoint|zoo|attraction|historic|heritage|museum|nature reserve|peak|beach|waterfall|cave entrance|townhall|place of worship/.test(text);
  return !rejected && landmark;
}

async function queryOsmLandmarksForRelation(relationId) {
  const cacheKey = String(relationId);
  const cached = readCache("osm-landmarks", cacheKey);
  if (cached) {
    return cached;
  }
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  let lastError;

  // Overpass area indexes are incomplete for some valid French commune relations.
  // Query the cached bounding box, then keep only coordinates inside the exact polygon.
  try {
    const boundary = await queryNominatimBoundary(relationId);
    const [south, north, west, east] = boundary.boundingbox.map(Number);
    const bbox = `${south},${west},${north},${east}`;
    const bboxQuery = `[out:json][timeout:90];(` +
      `nw(${bbox})["name"]["historic"];` +
      `nw(${bbox})["name"]["tourism"~"^(museum|attraction|gallery|zoo|viewpoint|aquarium|theme_park)$"];` +
      `nw(${bbox})["name"]["amenity"~"^(place_of_worship|theatre|arts_centre|library|townhall|marketplace|community_centre)$"];` +
      `nw(${bbox})["name"]["leisure"~"^(park|garden|stadium|nature_reserve)$"];` +
      `nw(${bbox})["name"]["man_made"~"^(tower|lighthouse|bridge|watermill|windmill)$"];` +
      `nw(${bbox})["name"]["natural"~"^(peak|beach|waterfall|cave_entrance|bay)$"];` +
      `nw(${bbox})["name"]["building"~"^(cathedral|church|chapel|mosque|synagogue|temple|castle|civic)$"];` +
      `);out center tags qt 400;`;
    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithTimeout(endpoint, {
          body: `data=${encodeURIComponent(bboxQuery)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "StreetExplorerCatalog/0.33"
          },
          method: "POST"
        }, 45000);
        if (!response.ok) {
          throw new Error(`${endpoint} returned ${response.status}`);
        }
        const elements = ((await response.json()).elements ?? []).filter((element) => {
          const coordinate = getOsmCoordinate(element);
          return coordinate && isPointInGeoJson(
            coordinate.longitude,
            coordinate.latitude,
            boundary.geojson
          );
        });
        writeCache("osm-landmarks", cacheKey, elements);
        return elements;
      } catch (error) {
        lastError = error;
      }
    }
  } catch (error) {
    lastError = error;
  }
  throw lastError;
}

function addOsmCandidates(city, elements, candidates) {
  for (const element of elements) {
    const coordinate = getOsmCoordinate(element);
    const tags = element.tags ?? {};
    const name = tags["name:fr"] || tags.name;
    const detail = [
      tags.historic,
      tags.tourism,
      tags.amenity,
      tags.leisure,
      tags.man_made,
      tags.natural,
      tags.building,
      tags.heritage,
      tags["heritage:operator"]
    ].filter(Boolean).join(" ");

    if (!coordinate || !name || !isEligibleOsmLandmark(name, detail)) {
      continue;
    }
    const category = classifyLandmark(name, detail);
    candidates.push(
      createCandidate({
        category,
        citySlug: city.catalogSlug,
        externalId: `${element.type}/${element.id}`,
        externalSource: "openstreetmap",
        externalType: element.type,
        ...coordinate,
        name,
        score: (tags.heritage || tags["heritage:operator"] ? 48 : 22) +
          scoreLandmark(name, detail) / 2
      })
    );
  }
}

const communes = [];
const municipalArrondissements = [];
await readDelimitedRows(inseePath, ";", (row) => {
  const commune = {
    department: row.DEP,
    inseeCode: row.COM,
    name: row.Commune,
    population: Number(row.PMUN)
  };

  if (/^(Paris|Marseille|Lyon) \d+(?:er|e) Arrondissement$/.test(commune.name)) {
    municipalArrondissements.push(commune);
  } else {
    communes.push(commune);
  }
});

if (!communes.some((commune) => commune.department === "976")) {
  communes.push(...MAYOTTE_2017_POPULATIONS);
}
for (const overseasCommune of OVERSEAS_COLLECTIVITY_TOP_500_POPULATIONS) {
  if (!communes.some((commune) => commune.inseeCode === overseasCommune.inseeCode)) {
    communes.push(overseasCommune);
  }
}

for (const aggregate of [
  { department: "75", inseeCode: "75056", name: "Paris" },
  { department: "13", inseeCode: "13055", name: "Marseille" },
  { department: "69", inseeCode: "69123", name: "Lyon" }
]) {
  const aliases = municipalArrondissements
    .filter((arrondissement) => arrondissement.name.startsWith(`${aggregate.name} `))
    .map((arrondissement) => arrondissement.inseeCode);
  const population = municipalArrondissements
    .filter((arrondissement) => aliases.includes(arrondissement.inseeCode))
    .reduce((total, arrondissement) => total + arrondissement.population, 0);
  communes.push({ ...aggregate, aliases, population });
}

const topCities = communes
  .sort((left, right) => right.population - left.population)
  .slice(0, CATALOG_CITY_COUNT)
  .map((city, index) => ({ ...city, rank: index + 1 }));
const catalogCities = topCities;
const normalizedCityNameCounts = catalogCities.reduce((counts, city) => {
  const normalizedName = normalizeText(city.name);
  counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
  return counts;
}, new Map());
for (const city of catalogCities) {
  const baseSlug = slugify(city.name);
  city.catalogSlug = normalizedCityNameCounts.get(normalizeText(city.name)) > 1
    ? `${baseSlug}-${city.inseeCode.toLowerCase()}`
    : baseSlug;
}
const cityByCode = new Map(
  catalogCities.flatMap((city) => [
    [city.inseeCode, city],
    ...(city.aliases ?? []).map((alias) => [alias, city])
  ])
);
const candidatesByCode = new Map(catalogCities.map((city) => [city.inseeCode, []]));
const previousAlbumByInseeCode = new Map();

if (fs.existsSync(SOURCE_SNAPSHOT_PATH)) {
  const previousSnapshot = JSON.parse(fs.readFileSync(SOURCE_SNAPSHOT_PATH, "utf8"));
  const previousEntries = [
    ...(previousSnapshot.cities ?? []),
    ...(previousSnapshot.curatedExtraCities ?? [])
  ];
  const previousInseeByAlbumId = new Map(
    previousEntries.map((entry) => [entry.albumId, entry.inseeCode])
  );
  const albumPaths = [
    ...fs.readdirSync(OUTPUT_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(OUTPUT_DIRECTORY, entry.name)),
    ...new Set(
      [...curatedFilesByInseeCode.values()].map((relativePath) =>
        path.resolve(OUTPUT_DIRECTORY, relativePath)
      )
    )
  ];

  for (const albumPath of albumPaths) {
    if (!fs.existsSync(albumPath)) {
      continue;
    }
    const album = JSON.parse(fs.readFileSync(albumPath, "utf8"));
    const inseeCode = previousInseeByAlbumId.get(album.id);
    if (inseeCode) {
      previousAlbumByInseeCode.set(inseeCode, album);
    }
  }
}

for (const city of catalogCities) {
  const previousAlbum = previousAlbumByInseeCode.get(city.inseeCode);
  if (!previousAlbum) {
    continue;
  }
  candidatesByCode.get(city.inseeCode).push(
    ...previousAlbum.medals.map((medal) => ({ ...medal, score: 1000 }))
  );
}

await readDelimitedRows(merimeePath, "|", (row) => {
  const city = cityByCode.get(row.COG_Insee_lors_de_la_protection);
  const coordinate = parseCoordinate(row.coordonnees_au_format_WGS84);
  const name = cleanName(
    row.Titre_editorial_de_la_notice ||
      row.Autre_appellation_de_l_edifice ||
      row.Denomination_de_l_edifice
  );

  if (!city || !coordinate || !name) {
    return;
  }

  const citySlug = city.catalogSlug;
  candidatesByCode.get(city.inseeCode).push(
    createCandidate({
      category: classifyLandmark(name, row.Denomination_de_l_edifice),
      citySlug,
      externalId: row.Reference,
      externalSource: "merimee",
      externalType: "record",
      ...coordinate,
      name,
      score: scoreLandmark(
        name,
        row.Denomination_de_l_edifice,
        `${row.Nature_de_la_protection} ${row.Date_et_typologie_de_la_protection}`
      )
    })
  );
});

const citiesByNormalizedName = new Map(
  catalogCities.map((city) => [normalizeText(city.name), city])
);

await readDelimitedRows(museofilePath, "|", (row) => {
  const city = citiesByNormalizedName.get(normalizeText(row.Ville));
  const coordinate = parseCoordinate(row.Coordonnees);
  const name = cleanName(row.Nom_officiel);

  if (!city || !coordinate || !name) {
    return;
  }

  candidatesByCode.get(city.inseeCode).push(
    createCandidate({
      category: "culture",
      citySlug: city.catalogSlug,
      externalId: row.Identifiant,
      externalSource: "museofile",
      externalType: "record",
      ...coordinate,
      name,
      score: 72
    })
  );
});

const codeValues = catalogCities.map((city) => `"${city.inseeCode}"`).join(" ");
const cityBindings = await queryWikidata(`
  SELECT ?city ?insee ?osm ?coord WHERE {
    VALUES ?insee { ${codeValues} }
    ?city wdt:P374 ?insee; wdt:P625 ?coord.
    OPTIONAL { ?city wdt:P402 ?osm }
  }
`, `city-identities-${stableHash(codeValues)}`);
const wikidataCityByCode = new Map();

for (const binding of cityBindings) {
  const candidateIdentity = {
    center: parseWktPoint(binding.coord.value),
    osmRelationId: binding.osm?.value ? Number(binding.osm.value) : null,
    wikidataId: binding.city.value.split("/").at(-1)
  };
  const existingIdentity = wikidataCityByCode.get(binding.insee.value);
  if (!existingIdentity || (!existingIdentity.osmRelationId && candidateIdentity.osmRelationId)) {
    wikidataCityByCode.set(binding.insee.value, candidateIdentity);
  }
}

for (const [inseeCode, osmRelationId] of osmRelationOverridesByInseeCode) {
  const identity = wikidataCityByCode.get(inseeCode);
  if (identity) {
    identity.osmRelationId = osmRelationId;
  }
}

const missingOsmCodes = catalogCities
  .filter((city) => !wikidataCityByCode.get(city.inseeCode)?.osmRelationId)
  .map((city) => city.inseeCode);
const fallbackOsmRelations = await queryOsmRelationIds(missingOsmCodes);

for (const inseeCode of missingOsmCodes) {
  const identity = wikidataCityByCode.get(inseeCode) ?? {
    center: null,
    osmRelationId: null,
    wikidataId: null
  };
  identity.osmRelationId = fallbackOsmRelations.get(inseeCode) ?? null;
  wikidataCityByCode.set(inseeCode, identity);
}

const citiesNeedingWikidata = catalogCities.filter((city) => {
  const minimum = getMinimumMedalCount(city.rank);
  return deduplicateAndSelect(
    candidatesByCode.get(city.inseeCode),
    minimum,
    minimum
  ).length < minimum;
});
const wikidataIds = citiesNeedingWikidata
  .map((city) => wikidataCityByCode.get(city.inseeCode)?.wikidataId)
  .filter(Boolean);
const cityByWikidataId = new Map(
  citiesNeedingWikidata.map((city) => [
    wikidataCityByCode.get(city.inseeCode)?.wikidataId,
    city
  ])
);

for (let offset = 0; offset < wikidataIds.length; offset += 5) {
  const batch = wikidataIds.slice(offset, offset + 5);
  const bindings = await queryWikidata(`
    SELECT ?city ?item ?coord ?sitelinks ?frLabel ?enLabel ?frDescription ?enDescription
      (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
    WHERE {
      VALUES ?city { ${batch.map((id) => `wd:${id}`).join(" ")} }
      ?item wdt:P131/wdt:P131? ?city; wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
      FILTER(?item != ?city && ?sitelinks >= 1)
      OPTIONAL { ?item rdfs:label ?frLabel. FILTER(LANG(?frLabel) = "fr") }
      OPTIONAL { ?item rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
      OPTIONAL { ?item schema:description ?frDescription. FILTER(LANG(?frDescription) = "fr") }
      OPTIONAL { ?item schema:description ?enDescription. FILTER(LANG(?enDescription) = "en") }
      OPTIONAL {
        ?item wdt:P31 ?instance.
        ?instance rdfs:label ?instanceLabel.
        FILTER(LANG(?instanceLabel) = "fr")
      }
    }
    GROUP BY ?city ?item ?coord ?sitelinks ?frLabel ?enLabel ?frDescription ?enDescription
  `, `landmarks-v2-${offset}-${stableHash(batch.join("|"))}`, { required: false });

  for (const binding of bindings) {
    const wikidataId = binding.city.value.split("/").at(-1);
    const city = cityByWikidataId.get(wikidataId);
    const coordinate = parseWktPoint(binding.coord.value);
    const name = binding.frLabel?.value || binding.enLabel?.value;

    if (!city || !coordinate || !name) {
      continue;
    }

    const itemId = binding.item.value.split("/").at(-1);
    const instanceLabel = binding.instanceLabels?.value ?? "";
    const sitelinks = Number(binding.sitelinks.value);
    const description = `${binding.frDescription?.value ?? ""} ${binding.enDescription?.value ?? ""}`;

    if (!isEligibleWikidataLandmark(name, instanceLabel, description)) {
      continue;
    }

    candidatesByCode.get(city.inseeCode).push(
      createCandidate({
        category: classifyLandmark(name, instanceLabel),
        citySlug: city.catalogSlug,
        descriptionEn: binding.enDescription?.value,
        descriptionFr: binding.frDescription?.value,
        externalId: itemId,
        externalSource: "wikidata",
        externalType: "item",
        ...coordinate,
        name,
        score: Math.min(66, 28 + Math.log2(Math.max(1, sitelinks)) * 6) +
          scoreLandmark(name, instanceLabel) / 4
      })
    );
  }

  console.log(
    `Loaded Wikidata landmark batch ${offset + 1}-${Math.min(offset + 5, wikidataIds.length)}.`
  );
}

const osmFallbackTasks = [];
for (let index = 0; index < catalogCities.length; index += 1) {
  const city = catalogCities[index];
  const minimum = getMinimumMedalCount(city.rank);
  const candidates = candidatesByCode.get(city.inseeCode);
  const relativeCuratedFile = curatedFilesByInseeCode.get(city.inseeCode);
  const curatedMedals = relativeCuratedFile
    ? JSON.parse(
      fs.readFileSync(path.resolve(OUTPUT_DIRECTORY, relativeCuratedFile), "utf8")
    ).medals.map((medal) => ({ ...medal, score: Number.MAX_SAFE_INTEGER }))
    : [];
  const previewCandidates = [...curatedMedals, ...candidates];
  const preview = deduplicateAndSelect(previewCandidates, minimum, minimum);

  if (preview.length >= minimum) {
    continue;
  }
  osmFallbackTasks.push({ city, curatedMedals, index, minimum, preview });
}

async function loadOsmFallbackTask({ city, curatedMedals, index, minimum, preview }) {
  const candidates = candidatesByCode.get(city.inseeCode);
  const relationId = wikidataCityByCode.get(city.inseeCode)?.osmRelationId;
  if (!relationId) {
    throw new Error(`Missing OSM relation for ${city.name} (${city.inseeCode})`);
  }
  const boundary = await queryNominatimBoundary(relationId);
  await addBoundaryWikidataCandidates(city, boundary, candidates);
  const wikidataPreview = deduplicateAndSelect(
    [...curatedMedals, ...candidates],
    minimum,
    minimum
  );
  if (wikidataPreview.length >= minimum) {
    console.log(
      `Loaded boundary Wikidata fallback ${index + 1}/${catalogCities.length} for ${city.name}: ` +
      `${preview.length} -> ${wikidataPreview.length}.`
    );
    return;
  }
  let elements;
  try {
    elements = await queryOsmLandmarksForRelation(relationId);
  } catch (error) {
    throw new Error(
      `OSM fallback failed for ${city.name} (${city.inseeCode}, relation ${relationId}): ` +
      `${error?.message ?? error}`
    );
  }
  addOsmCandidates(city, elements, candidates);
  console.log(
    `Loaded OSM fallback ${index + 1}/${catalogCities.length} for ${city.name}: ` +
    `${preview.length} -> ${deduplicateAndSelect(
      [...curatedMedals, ...candidates], minimum, minimum
    ).length}.`
  );
}

const osmFallbackConcurrency = Math.min(2, osmFallbackTasks.length);
let nextOsmFallbackTask = 0;
const osmFallbackFailures = [];
await Promise.all(Array.from({ length: osmFallbackConcurrency }, async () => {
  while (nextOsmFallbackTask < osmFallbackTasks.length) {
    const task = osmFallbackTasks[nextOsmFallbackTask];
    nextOsmFallbackTask += 1;
    try {
      await loadOsmFallbackTask(task);
    } catch (error) {
      osmFallbackFailures.push(error);
      console.warn(error.message);
    }
  }
}));
if (osmFallbackFailures.length > 0) {
  throw new Error(
    `${osmFallbackFailures.length} OSM fallback request(s) failed; rerun to resume from cache.`
  );
}

const snapshot = {
  generatedAt: `${PUBLISHED_AT}T00:00:00.000Z`,
  ranking: {
    definition: "French communes ranked by municipal population, including overseas territories",
    effectiveDate: "2026-01-01",
    source:
      "INSEE populations de référence 2023; Mayotte 2017; Nouvelle-Calédonie 2025; " +
      "Polynésie française 2022; latest official commune censuses",
    url: "https://www.insee.fr/fr/statistiques/8680726",
    mayotteUrl: "https://www.insee.fr/fr/statistiques/3291775",
    overseasCollectivitiesUrl: "https://www.insee.fr/fr/statistiques/8680667",
    newCaledoniaUrl: "https://www.insee.fr/fr/statistiques/8658726",
    frenchPolynesiaUrl:
      "https://www.ispf.pf/content/uploads/Chiffres_de_populations_legales_2022_301ac91426.pdf"
  },
  landmarkSources: [
    {
      name: "Ministry of Culture Mérimée",
      url: "https://www.data.gouv.fr/datasets/immeubles-proteges-au-titre-des-monuments-historiques-2"
    },
    {
      name: "Ministry of Culture Muséofile",
      url: "https://www.data.gouv.fr/datasets/musees-de-france-base-museofile"
    },
    {
      name: "Ville de Marseille arrondissement guides",
      url: "https://www.marseille.fr/decouvrir-marseille/les111-quartiers"
    },
    {
      name: "Ville de Thonon-les-Bains culture and heritage",
      url: "https://www.ville-thonon.fr/decouvrir-la-ville/culture/"
    },
    {
      name: "Ville de Thonon-les-Bains parks and forests",
      url: "https://www.ville-thonon.fr/plein-air/parcs-et-forets/"
    },
    {
      name: "Thonon-les-Bains Tourist Office remarkable sites",
      url: "https://www.thononlesbains.com/visiter/sites-remarquables/"
    },
    { name: "Wikidata", url: "https://www.wikidata.org/" },
    { name: "OpenStreetMap", url: "https://www.openstreetmap.org/" }
  ],
  cities: []
};
const manifestEntries = [];
fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
for (const entry of fs.readdirSync(OUTPUT_DIRECTORY, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".json")) {
    fs.unlinkSync(path.join(OUTPUT_DIRECTORY, entry.name));
  }
}
fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });

for (const city of catalogCities) {
  const identity = wikidataCityByCode.get(city.inseeCode);

  if (!identity) {
    throw new Error(`Missing Wikidata/OSM identity for ${city.name} (${city.inseeCode})`);
  }

  const relativeCuratedFile = curatedFilesByInseeCode.get(city.inseeCode);
  const citySlug = city.catalogSlug;
  const minimumMedalCount = getMinimumMedalCount(city.rank);
  let albumId = `${citySlug}-v1`;
  let albumVersion = 1;
  let medals;
  let fileName;

  if (relativeCuratedFile) {
    const absoluteCuratedFile = path.resolve(OUTPUT_DIRECTORY, relativeCuratedFile);
    const curatedAlbum = JSON.parse(fs.readFileSync(absoluteCuratedFile, "utf8"));
    albumId = curatedAlbum.id;
    const curatedCandidates = curatedAlbum.medals.map((medal) => ({
      ...medal,
      score: Number.MAX_SAFE_INTEGER
    }));
    medals = [...curatedAlbum.medals];
    if (medals.length < minimumMedalCount) {
      const selectedCandidates = deduplicateAndSelect(
        [...curatedCandidates, ...candidatesByCode.get(city.inseeCode)],
        minimumMedalCount + curatedAlbum.medals.length,
        minimumMedalCount
      );
      const existingIds = new Set(medals.map((medal) => medal.id));
      for (const candidate of selectedCandidates) {
        if (!existingIds.has(candidate.id)) {
          medals.push(candidate);
          existingIds.add(candidate.id);
        }
        if (medals.length >= minimumMedalCount) {
          break;
        }
      }
    }
    const expanded = medals.length > curatedAlbum.medals.length;
    albumVersion = expanded ? curatedAlbum.version + 1 : curatedAlbum.version;
    fileName = relativeCuratedFile;
    if (expanded) {
      const expandedAlbum = {
        ...curatedAlbum,
        version: albumVersion,
        publishedAt: PUBLISHED_AT,
        sourceAttribution:
          `${curatedAlbum.sourceAttribution} Expansion candidates: French Ministry of Culture ` +
          "Mérimée and Muséofile open datasets, Wikidata (CC0), and reviewed OpenStreetMap fallback (ODbL 1.0).",
        medals
      };
      fs.writeFileSync(
        absoluteCuratedFile,
        `${JSON.stringify(expandedAlbum, null, 2)}\n`,
        "utf8"
      );
    }
  } else {
    medals = deduplicateAndSelect(
      candidatesByCode.get(city.inseeCode),
      minimumMedalCount,
      minimumMedalCount
    );

    if (medals.length < minimumMedalCount) {
      throw new Error(
        `Only ${medals.length} relevant landmark candidates for ${city.name} (${city.inseeCode})`
      );
    }
    const previousAlbum = previousAlbumByInseeCode.get(city.inseeCode);
    if (previousAlbum) {
      albumId = previousAlbum.id;
      albumVersion = JSON.stringify(previousAlbum.medals) === JSON.stringify(medals)
        ? previousAlbum.version
        : previousAlbum.version + 1;
    }

    const album = {
      id: albumId,
      cityId: `${citySlug}-fr`,
      cityZoneId: `relation/${identity.osmRelationId}`,
      cityName: { en: city.name, fr: city.name },
      version: albumVersion,
      publishedAt: PUBLISHED_AT,
      sourceAttribution:
        "Roster and coordinates derived from the French Ministry of Culture Mérimée and Muséofile open datasets; gaps reviewed with Wikidata (CC0). Commune identity: OpenStreetMap relation via Wikidata.",
      medals
    };
    fileName = `${String(city.rank).padStart(3, "0")}-${citySlug}-v1.json`;
    fs.writeFileSync(
      path.join(OUTPUT_DIRECTORY, fileName),
      `${JSON.stringify(album, null, 2)}\n`,
      "utf8"
    );
  }

  manifestEntries.push({
    albumId,
    cityId: `${citySlug}-fr`,
    cityName: city.name,
    cityZoneId: `relation/${identity.osmRelationId}`,
    fileName,
    inseeCode: city.inseeCode,
    medalCount: medals.length,
    population: city.population,
    rank: city.rank,
    version: albumVersion
  });
  const sourceSnapshotEntry = {
    albumId,
    cityName: city.name,
    cityZoneId: `relation/${identity.osmRelationId}`,
    inseeCode: city.inseeCode,
    medalCount: medals.length,
    population: city.population,
    rank: city.rank,
    sourceCounts: medals.reduce((counts, medal) => {
      const source = medal.externalIdentity.source;
      counts[source] = (counts[source] ?? 0) + 1;
      return counts;
    }, {})
  };

  snapshot.cities.push(sourceSnapshotEntry);
}

const manifestSource = `/* Generated by scripts/generate-france-medal-catalog.mjs. */
import type { MedalAlbumDefinition } from "../../types/medal";

export type FranceMedalAlbumManifestEntry = {
  albumId: string;
  cityId: string;
  cityName: { en: string; fr: string };
  cityZoneId: string;
  inseeCode: string;
  load: () => MedalAlbumDefinition;
  medalCount: number;
  population: number;
  rank: number;
  version: number;
};

export const FRANCE_MEDAL_ALBUM_MANIFEST: readonly FranceMedalAlbumManifestEntry[] = [
${manifestEntries.map((entry) => `  {
    albumId: ${JSON.stringify(entry.albumId)}, cityId: ${JSON.stringify(entry.cityId)},
    cityName: { en: ${JSON.stringify(entry.cityName)}, fr: ${JSON.stringify(entry.cityName)} },
    cityZoneId: ${JSON.stringify(entry.cityZoneId)}, inseeCode: ${JSON.stringify(entry.inseeCode)},
    medalCount: ${entry.medalCount}, population: ${entry.population}, rank: ${entry.rank}, version: ${entry.version},
    load: () => require(${JSON.stringify(`../../../assets/medals/france/${entry.fileName}`)}) as MedalAlbumDefinition
  }`).join(",\n")}
];
`;

fs.writeFileSync(MANIFEST_PATH, manifestSource, "utf8");
fs.writeFileSync(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

const totalMedals = snapshot.cities.reduce((total, city) => total + city.medalCount, 0);
console.log(`Generated ${snapshot.cities.length} city albums with ${totalMedals} medals.`);
