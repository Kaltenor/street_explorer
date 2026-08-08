import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [, , inseePath, merimeePath, museofilePath] = process.argv;

if (!inseePath || !merimeePath || !museofilePath) {
  throw new Error(
    "Usage: node scripts/generate-france-medal-catalog.mjs <donnees_communes.csv> <merimee.csv> <museofile.csv>"
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
  "france-top-100-sources.json"
);
const PUBLISHED_AT = "2026-08-08";
const MIN_MEDALS_PER_CITY = 5;
const MAX_MEDALS_PER_CITY = 8;

const curatedFilesByInseeCode = new Map([
  ["75056", "../paris-v1.json"],
  ["69123", "../lyon-v1.json"],
  ["69266", "../villeurbanne-v1.json"]
]);

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

function isMetropolitanDepartment(department) {
  return /^(?:0[1-9]|[1-8][0-9]|9[0-5]|2A|2B)$/.test(department);
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
    /station|arret |gare ferroviaire|ligne de transport|ligne de tramway|voie publique|voie de communication|commune francaise|quartier de|etablissement d enseignement|universite|ecole d ingenieurs|hopital|attentat|festival|competition sportive|tournoi|championnat|election|aeroport/.test(text) ||
    /^(rue|avenue|boulevard|place|route|chemin)\b/.test(normalizedName) ||
    (/^allee\b/.test(normalizedName) && !/^allee couverte\b/.test(normalizedName));
  const landmark =
    /abbaye|amphitheatre|arena|basilique|beffroi|bibliotheque|camp memorial|cathedrale|chateau|cimetiere|citadelle|eglise|edifice|fort |fortification|fontaine|halle|hotel de ville|jardin|marche|mairie|memorial|monument|mosquee|musee|opera|palais|parc |phare|pont |porte |sculpture|stade|synagogue|temple|theatre|tour |velodrome|base sous marine|canal|chapelle|ile de loisirs|oeuvre architecturale|batiment/.test(text);

  return !rejected && landmark;
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

function deduplicateAndSelect(candidates) {
  const selected = [];
  const normalizedNames = new Set();
  const coordinateKeys = new Set();
  const categoryCounts = new Map();
  const deferred = [];
  const categoryLimits = {
    architecture: 3,
    art: 2,
    culture: 3,
    history: 3,
    nature: 2
  };

  function trySelect(candidate, enforceCategoryLimit) {
    const normalizedName = normalizeText(candidate.name.fr);
    const coordinateKey = `${candidate.latitude.toFixed(5)}:${candidate.longitude.toFixed(5)}`;

    if (
      !normalizedName ||
      normalizedNames.has(normalizedName) ||
      selected.some((existing) => areNamesSimilar(existing.name.fr, candidate.name.fr)) ||
      coordinateKeys.has(coordinateKey) ||
      /^(immeuble|maison|villa|hotel particulier)( |$)/.test(normalizedName) && selected.length >= MIN_MEDALS_PER_CITY
    ) {
      return false;
    }

    if (
      enforceCategoryLimit &&
      (categoryCounts.get(candidate.category) ?? 0) >= categoryLimits[candidate.category]
    ) {
      return false;
    }

    selected.push(candidate);
    normalizedNames.add(normalizedName);
    coordinateKeys.add(coordinateKey);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) ?? 0) + 1);
    return true;
  }

  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
    if (!trySelect(candidate, true)) {
      deferred.push(candidate);
    }

    if (selected.length >= MAX_MEDALS_PER_CITY) {
      break;
    }
  }

  for (const candidate of deferred) {
    if (selected.length >= MIN_MEDALS_PER_CITY) {
      break;
    }

    trySelect(candidate, false);
  }

  return selected.map(({ score: _score, ...candidate }) => candidate);
}

async function queryWikidata(query) {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "StreetExplorerCatalog/0.20 (offline catalogue generator)"
        }
      });

      if (!response.ok) {
        throw new Error(`Wikidata returned ${response.status}`);
      }

      return (await response.json()).results.bindings;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function queryOsmRelationIds(inseeCodes) {
  if (inseeCodes.length === 0) {
    return new Map();
  }

  const pattern = `^(${inseeCodes.join("|")})$`;
  const query = `[out:json][timeout:60];relation["boundary"="administrative"]["ref:INSEE"~"${pattern}"];out tags;`;
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter"
  ];
  let lastStatus = "unavailable";

  for (const endpoint of endpoints) {
    const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "StreetExplorerCatalog/0.20" }
    });
    lastStatus = String(response.status);

    if (!response.ok) {
      continue;
    }

    const elements = (await response.json()).elements;
    return new Map(
      elements
        .filter((element) => element.type === "relation" && element.tags?.["ref:INSEE"])
        .map((element) => [element.tags["ref:INSEE"], element.id])
    );
  }

  throw new Error(`Overpass returned ${lastStatus} for missing commune identities`);
}

const communes = [];
const municipalArrondissements = [];
await readDelimitedRows(inseePath, ";", (row) => {
  if (isMetropolitanDepartment(row.DEP)) {
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
  }
});

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
  .slice(0, 100)
  .map((city, index) => ({ ...city, rank: index + 1 }));
const cityByCode = new Map(
  topCities.flatMap((city) => [
    [city.inseeCode, city],
    ...(city.aliases ?? []).map((alias) => [alias, city])
  ])
);
const candidatesByCode = new Map(topCities.map((city) => [city.inseeCode, []]));

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

  const citySlug = slugify(city.name);
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
  topCities.map((city) => [normalizeText(city.name), city])
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
      citySlug: slugify(city.name),
      externalId: row.Identifiant,
      externalSource: "museofile",
      externalType: "record",
      ...coordinate,
      name,
      score: 72
    })
  );
});

const codeValues = topCities.map((city) => `"${city.inseeCode}"`).join(" ");
const cityBindings = await queryWikidata(`
  SELECT ?city ?insee ?osm ?coord WHERE {
    VALUES ?insee { ${codeValues} }
    ?city wdt:P374 ?insee; wdt:P625 ?coord.
    OPTIONAL { ?city wdt:P402 ?osm }
  }
`);
const wikidataCityByCode = new Map();

for (const binding of cityBindings) {
  wikidataCityByCode.set(binding.insee.value, {
    center: parseWktPoint(binding.coord.value),
    osmRelationId: binding.osm?.value ? Number(binding.osm.value) : null,
    wikidataId: binding.city.value.split("/").at(-1)
  });
}

const missingOsmCodes = topCities
  .filter((city) => !wikidataCityByCode.get(city.inseeCode)?.osmRelationId)
  .map((city) => city.inseeCode);
const fallbackOsmRelations = await queryOsmRelationIds(missingOsmCodes);

for (const inseeCode of missingOsmCodes) {
  const identity = wikidataCityByCode.get(inseeCode);

  if (identity) {
    identity.osmRelationId = fallbackOsmRelations.get(inseeCode) ?? null;
  }
}

const wikidataIds = topCities
  .map((city) => wikidataCityByCode.get(city.inseeCode)?.wikidataId)
  .filter(Boolean);

for (let offset = 0; offset < wikidataIds.length; offset += 5) {
  const batch = wikidataIds.slice(offset, offset + 5);
  const bindings = await queryWikidata(`
    SELECT ?city ?item ?coord ?sitelinks ?frLabel ?enLabel ?frDescription ?enDescription
      (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instanceLabels)
    WHERE {
      VALUES ?city { ${batch.map((id) => `wd:${id}`).join(" ")} }
      ?item wdt:P131 ?city; wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
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
  `);

  for (const binding of bindings) {
    const wikidataId = binding.city.value.split("/").at(-1);
    const city = topCities.find(
      (candidate) => wikidataCityByCode.get(candidate.inseeCode)?.wikidataId === wikidataId
    );
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
        citySlug: slugify(city.name),
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
}

const snapshot = {
  generatedAt: `${PUBLISHED_AT}T00:00:00.000Z`,
  ranking: {
    definition: "Metropolitan French communes ranked by 2023 municipal population",
    effectiveDate: "2026-01-01",
    source: "INSEE populations de référence 2023",
    url: "https://www.insee.fr/fr/statistiques/8680726"
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

for (const city of topCities) {
  const identity = wikidataCityByCode.get(city.inseeCode);

  if (!identity) {
    throw new Error(`Missing Wikidata/OSM identity for ${city.name} (${city.inseeCode})`);
  }

  const relativeCuratedFile = curatedFilesByInseeCode.get(city.inseeCode);
  const citySlug = slugify(city.name);
  let albumId = `${citySlug}-v1`;
  let albumVersion = 1;
  let medals;
  let fileName;

  if (relativeCuratedFile) {
    const absoluteCuratedFile = path.resolve(OUTPUT_DIRECTORY, relativeCuratedFile);
    const curatedAlbum = JSON.parse(fs.readFileSync(absoluteCuratedFile, "utf8"));
    albumId = curatedAlbum.id;
    albumVersion = curatedAlbum.version;
    medals = curatedAlbum.medals;
    fileName = relativeCuratedFile;
  } else {
    medals = deduplicateAndSelect(candidatesByCode.get(city.inseeCode));

    if (medals.length < MIN_MEDALS_PER_CITY) {
      throw new Error(
        `Only ${medals.length} relevant landmark candidates for ${city.name} (${city.inseeCode})`
      );
    }

    const album = {
      id: `${citySlug}-v1`,
      cityId: `${citySlug}-fr`,
      cityZoneId: `relation/${identity.osmRelationId}`,
      cityName: { en: city.name, fr: city.name },
      version: 1,
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
  snapshot.cities.push({
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
  });
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
