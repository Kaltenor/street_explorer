import crypto from "node:crypto";
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const MEDAL_CATEGORIES = [
  "architecture",
  "art",
  "culture",
  "history",
  "nature"
];
let nextWikidataRequestAt = 0;

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(value) {
  return normalizeText(value).replace(/ /g, "-");
}

export function parseWktPoint(value) {
  const match = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(value ?? "");

  if (!match) {
    return null;
  }

  return {
    latitude: Number(match[2]),
    longitude: Number(match[1])
  };
}

export function dutchRdToWgs84(rdX, rdY) {
  const x = (rdX - 155000) / 100000;
  const y = (rdY - 463000) / 100000;
  const latitudeSeconds =
    3235.65389 * y +
    -32.58297 * x ** 2 +
    -0.2475 * y ** 2 +
    -0.84978 * x ** 2 * y +
    -0.0655 * y ** 3 +
    -0.01709 * x ** 2 * y ** 2 +
    -0.00738 * x +
    0.0053 * x ** 4 +
    -0.00039 * x ** 2 * y ** 3 +
    0.00033 * x ** 4 * y +
    -0.00012 * x * y;
  const longitudeSeconds =
    5260.52916 * x +
    105.94684 * x * y +
    2.45656 * x * y ** 2 +
    -0.81885 * x ** 3 +
    0.05594 * x * y ** 3 +
    -0.05607 * x ** 3 * y +
    0.01199 * y +
    -0.00256 * x ** 3 * y ** 2 +
    0.00128 * x * y ** 4 +
    0.00022 * y ** 2 +
    -0.00022 * x ** 2 +
    0.00026 * x ** 5;

  return {
    latitude: 52.1551744 + latitudeSeconds / 3600,
    longitude: 5.38720621 + longitudeSeconds / 3600
  };
}

export function classifyLandmark(name, detail = "") {
  const text = normalizeText(`${name} ${detail}`);

  if (/park|tuin|garden|arboretum|begraafplaats|cemetery|landgoed|estate|natuur/.test(text)) {
    return "nature";
  }
  if (/museum|galerie|gallery|beeld|sculpt|kunst|art |atelier|concert/.test(text)) {
    return "art";
  }
  if (/kerk|church|basiliek|basilica|kathedraal|synagoge|moskee|theater|schouwburg|bibliotheek/.test(text)) {
    return "culture";
  }
  if (/fort|vesting|kasteel|castle|poort|gate|stadhuis|town hall|raadhuis|paleis|palace|monument|gedenk/.test(text)) {
    return "history";
  }

  return "architecture";
}

export function scoreLandmark(name, detail = "", featured = false) {
  const text = normalizeText(`${name} ${detail}`);
  let score = featured ? 95 : 48;
  const weights = [
    [/paleis|palace|kathedraal|basiliek|basilica|kasteel|castle|citadel|fort |vesting/, 38],
    [/stadhuis|town hall|raadhuis|museum|theater|schouwburg|kerk|church|synagoge|poort|gate/, 30],
    [/molen|windmill|brug|bridge|toren|tower|station|park|tuin|garden|landgoed/, 22],
    [/huis|house|boerderij|farm|villa|pakhuis|warehouse/, 8]
  ];

  for (const [pattern, weight] of weights) {
    if (pattern.test(text)) {
      score += weight;
      break;
    }
  }

  if (/voormalig|former|restant|onderdeel|gevel|facade|hek|muur|wall/.test(text)) {
    score -= 10;
  }

  return score;
}

export function selectBalancedCandidates(candidates, maximum, minimum = 5) {
  const selected = [];
  const rejected = {
    categoryLimit: 0,
    duplicateCoordinate: 0,
    duplicateName: 0
  };
  const names = new Set();
  const coordinateKeys = new Set();
  const categoryCounts = new Map();
  const deferred = [];
  const categoryLimit = Math.max(2, Math.ceil(maximum / 3));

  function trySelect(candidate, enforceBalance) {
    const name = normalizeText(candidate.name.en);
    const coordinateKey = `${candidate.latitude.toFixed(5)}:${candidate.longitude.toFixed(5)}`;

    if (names.has(name) || selected.some((item) => areNamesSimilar(item.name.en, candidate.name.en))) {
      rejected.duplicateName += 1;
      return false;
    }
    if (coordinateKeys.has(coordinateKey)) {
      rejected.duplicateCoordinate += 1;
      return false;
    }
    if (enforceBalance && (categoryCounts.get(candidate.category) ?? 0) >= categoryLimit) {
      rejected.categoryLimit += 1;
      return false;
    }

    selected.push(candidate);
    names.add(name);
    coordinateKeys.add(coordinateKey);
    categoryCounts.set(candidate.category, (categoryCounts.get(candidate.category) ?? 0) + 1);
    return true;
  }

  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
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

  return {
    medals: selected.slice(0, maximum).map(({ score: _score, ...medal }) => medal),
    rejected
  };
}

export function createTemplateDescription(category, name, cityName, language) {
  const templates = {
    en: {
      architecture: `${name} is a nationally protected architectural landmark in ${cityName}.`,
      art: `${name} is a protected place associated with art and design in ${cityName}.`,
      culture: `${name} is a nationally protected cultural landmark in ${cityName}.`,
      history: `${name} preserves part of the documented history of ${cityName}.`,
      nature: `${name} is a protected historic landscape or green landmark in ${cityName}.`
    },
    fr: {
      architecture: `${name} est un monument architectural protégé d’intérêt national à ${cityName}.`,
      art: `${name} est un lieu protégé associé à l’art et au design à ${cityName}.`,
      culture: `${name} est un monument culturel protégé d’intérêt national à ${cityName}.`,
      history: `${name} conserve une partie de l’histoire documentée de ${cityName}.`,
      nature: `${name} est un paysage historique ou espace vert protégé à ${cityName}.`
    },
    nl: {
      architecture: `${name} is een rijksbeschermd architectonisch monument in ${cityName}.`,
      art: `${name} is een beschermde plek voor kunst en vormgeving in ${cityName}.`,
      culture: `${name} is een rijksbeschermd cultureel monument in ${cityName}.`,
      history: `${name} bewaart een deel van de gedocumenteerde geschiedenis van ${cityName}.`,
      nature: `${name} is een beschermd historisch landschap of groen monument in ${cityName}.`
    },
    de: {
      architecture: `${name} ist ein geschütztes architektonisches Wahrzeichen in ${cityName}.`,
      art: `${name} ist ein geschützter Ort für Kunst und Gestaltung in ${cityName}.`,
      culture: `${name} ist ein geschütztes kulturelles Wahrzeichen in ${cityName}.`,
      history: `${name} bewahrt einen Teil der dokumentierten Geschichte von ${cityName}.`,
      nature: `${name} ist eine geschützte historische Landschaft oder Grünanlage in ${cityName}.`
    },
    es: {
      architecture: `${name} es un monumento arquitectónico protegido de ${cityName}.`,
      art: `${name} es un lugar protegido vinculado al arte y al diseño de ${cityName}.`,
      culture: `${name} es un monumento cultural protegido de ${cityName}.`,
      history: `${name} conserva parte de la historia documentada de ${cityName}.`,
      nature: `${name} es un paisaje histórico o espacio verde protegido de ${cityName}.`
    },
    it: {
      architecture: `${name} è un monumento architettonico tutelato di ${cityName}.`,
      art: `${name} è un luogo tutelato legato all'arte e al design di ${cityName}.`,
      culture: `${name} è un monumento culturale tutelato di ${cityName}.`,
      history: `${name} conserva una parte della storia documentata di ${cityName}.`,
      nature: `${name} è un paesaggio storico o spazio verde tutelato di ${cityName}.`
    }
  };

  return templates[language][category];
}

export function writeCountryPackArtifacts({
  descriptorUrl,
  outputDirectory,
  pack,
  qualityReport
}) {
  validateCountryPack(pack);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const json = `${JSON.stringify(pack, null, 2)}\n`;
  const compressed = zlib.gzipSync(Buffer.from(json), { level: 9, mtime: 0 });
  const fileName = `${pack.countryCode}-v${pack.version}.json.gz`;
  const packPath = path.join(outputDirectory, fileName);
  fs.writeFileSync(packPath, compressed);
  const sha256 = crypto.createHash("sha256").update(compressed).digest("hex");
  const descriptor = {
    albums: qualityReport.cities.map((city) => ({
      albumId: city.albumId,
      cityId: city.cityId,
      cityName: city.cityName,
      cityZoneId: city.cityZoneId,
      countryCode: pack.countryCode,
      localLanguage: city.localLanguage,
      medalCount: city.selectedCount,
      population: city.population,
      rank: city.rank,
      version: city.version
    })),
    compressedBytes: compressed.byteLength,
    countryCode: pack.countryCode,
    formatVersion: 1,
    languages: pack.languages,
    medalCount: pack.albums.reduce((total, album) => total + album.medals.length, 0),
    publishedAt: pack.publishedAt,
    sha256,
    uncompressedBytes: Buffer.byteLength(json),
    url: descriptorUrl,
    version: pack.version
  };
  const report = {
    ...qualityReport,
    artifact: {
      compressedBytes: descriptor.compressedBytes,
      medalCount: descriptor.medalCount,
      sha256,
      uncompressedBytes: descriptor.uncompressedBytes,
      url: descriptorUrl
    }
  };
  fs.writeFileSync(
    path.join(outputDirectory, `${pack.countryCode}-v${pack.version}-descriptor.json`),
    `${JSON.stringify(descriptor, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(outputDirectory, `${pack.countryCode}-v${pack.version}-quality.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );

  return { descriptor, packPath, report };
}

export async function queryWikidata(query) {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const waitMilliseconds = Math.max(0, nextWikidataRequestAt - Date.now());
      if (waitMilliseconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
      }
      nextWikidataRequestAt = Date.now() + 1100;
      const payload = await fetchJson(url, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "StreetExplorerCatalog/0.23 (offline country-pack builder)"
        }
      });
      return payload.results.bindings;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }

  throw lastError;
}

export async function queryOsmMunicipalityRelations(codes, tag) {
  const pattern = `^(${codes.join("|")})$`;
  const query = `[out:json][timeout:90];relation["boundary"="administrative"]["${tag}"~"${pattern}"];out tags;`;
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter"
  ];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson(endpoint, {
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "StreetExplorerCatalog/0.23"
        },
        method: "POST"
      });
      const elements = payload.elements;
      return new Map(
        elements
          .filter((element) => element.type === "relation" && element.tags?.[tag])
          .map((element) => [element.tags[tag], element.id])
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function queryOsmLandmarksForRelation(relationId) {
  const query = `[out:json][timeout:90];relation(${Number(relationId)});map_to_area->.searchArea;(` +
    `nwr(area.searchArea)["name"]["historic"];` +
    `nwr(area.searchArea)["name"]["tourism"~"^(museum|attraction|gallery|zoo|viewpoint)$"];` +
    `nwr(area.searchArea)["name"]["amenity"~"^(place_of_worship|theatre|arts_centre|library)$"];` +
    `nwr(area.searchArea)["name"]["leisure"~"^(park|garden|stadium)$"];` +
    `nwr(area.searchArea)["name"]["man_made"~"^(tower|lighthouse|bridge)$"];` +
    `);out center tags qt 250;`;
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter"
  ];
  let lastError;

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson(endpoint, {
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "StreetExplorerCatalog/0.23"
        },
        method: "POST"
      });
      return payload.elements ?? [];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function fetchJson(url, options) {
  if (process.env.STREET_EXPLORER_POWERSHELL_NETWORK === "1" && process.platform === "win32") {
    return fetchJsonWithPowerShell(url, options);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function fetchJsonWithPowerShell(url, options) {
  const method = options?.method ?? "GET";
  const headers = options?.headers ?? {};
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$headers = ConvertFrom-Json $env:STREET_EXPLORER_REQUEST_HEADERS",
    "$headerTable = @{}",
    "$headers.psobject.Properties | ForEach-Object { $headerTable[$_.Name] = [string]$_.Value }",
    "$params = @{ Uri = $env:STREET_EXPLORER_REQUEST_URL; Method = $env:STREET_EXPLORER_REQUEST_METHOD; Headers = $headerTable; UseBasicParsing = $true; TimeoutSec = 90 }",
    "if ($env:STREET_EXPLORER_REQUEST_BODY) { $params.Body = $env:STREET_EXPLORER_REQUEST_BODY }",
    "$response = Invoke-WebRequest @params",
    "if ($response.Content -is [byte[]]) { $content = [Text.Encoding]::UTF8.GetString($response.Content) } else { $content = [string]$response.Content }",
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
    "[Console]::Out.Write($content)"
  ].join("; ");
  const output = childProcess.execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        STREET_EXPLORER_REQUEST_BODY: options?.body ?? "",
        STREET_EXPLORER_REQUEST_HEADERS: JSON.stringify(headers),
        STREET_EXPLORER_REQUEST_METHOD: method,
        STREET_EXPLORER_REQUEST_URL: url
      },
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120000
    }
  );
  return JSON.parse(output.replace(/^\uFEFF/, ""));
}

function validateCountryPack(pack) {
  if (pack.formatVersion !== 1 || !Array.isArray(pack.albums) || pack.albums.length === 0) {
    throw new Error("Country pack must contain at least one album.");
  }

  const albumIds = new Set();
  const cityZoneIds = new Set();
  const medalIds = new Set();

  for (const album of pack.albums) {
    if (
      albumIds.has(album.id) ||
      cityZoneIds.has(album.cityZoneId) ||
      album.countryCode !== pack.countryCode ||
      album.medals.length < 5
    ) {
      throw new Error(`Invalid or duplicate album ${album.id}.`);
    }
    albumIds.add(album.id);
    cityZoneIds.add(album.cityZoneId);

    for (const medal of album.medals) {
      if (
        medalIds.has(medal.id) ||
        !MEDAL_CATEGORIES.includes(medal.category) ||
        !Number.isFinite(medal.latitude) ||
        !Number.isFinite(medal.longitude) ||
        !medal.name.en ||
        !medal.name.fr ||
        !medal.name[album.localLanguage] ||
        !medal.description.en ||
        !medal.description.fr ||
        !medal.description[album.localLanguage]
      ) {
        throw new Error(`Invalid or duplicate medal ${medal.id}.`);
      }
      medalIds.add(medal.id);
    }
  }
}

function areNamesSimilar(left, right) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter((token) => token.length > 2));
  const rightTokens = new Set(normalizeText(right).split(" ").filter((token) => token.length > 2));
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared >= 2 && shared / Math.max(leftTokens.size, rightTokens.size) >= 0.75;
}
