import type { AppLanguage } from "../i18n";
import type { CollectedMedal, LocalizedMedalText } from "../types/medal";

export type WikipediaResolution = {
  kind: "article" | "search";
  language: AppLanguage;
  url: string;
};

type WikipediaSitelink = { title?: string };

const REQUEST_TIMEOUT_MS = 7_500;
const resolutionCache = new Map<string, Promise<WikipediaResolution>>();

function getFallbackLanguage(language: AppLanguage): AppLanguage {
  return language === "fr" ? "en" : "fr";
}

function getArticleUrl(language: AppLanguage, title: string) {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;
}

export function getWikipediaSearchUrl(language: AppLanguage, query: string) {
  return `https://${language}.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`;
}

export function selectWikipediaSitelink(
  sitelinks: Record<string, WikipediaSitelink> | undefined,
  language: AppLanguage
): WikipediaResolution | null {
  const selected = sitelinks?.[`${language}wiki`]?.title;

  if (selected) {
    return { kind: "article", language, url: getArticleUrl(language, selected) };
  }

  const fallbackLanguage = getFallbackLanguage(language);
  const fallback = sitelinks?.[`${fallbackLanguage}wiki`]?.title;
  return fallback
    ? {
        kind: "article",
        language: fallbackLanguage,
        url: getArticleUrl(fallbackLanguage, fallback)
      }
    : null;
}

function normalizeWikipediaTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isConfidentWikipediaTitle(candidate: string, requested: string) {
  const normalizedCandidate = normalizeWikipediaTitle(candidate);
  const normalizedRequested = normalizeWikipediaTitle(requested);

  if (!normalizedCandidate || !normalizedRequested) {
    return false;
  }

  return normalizedCandidate === normalizedRequested;
}

export function isAllowedWikipediaReadingUrl(rawUrl: string) {
  if (rawUrl === "about:blank") {
    return true;
  }

  try {
    const url = new URL(rawUrl);
    const hostAllowed =
      url.hostname === "wikipedia.org" || url.hostname.endsWith(".wikipedia.org");
    const action = url.searchParams.get("action");

    return (
      url.protocol === "https:" &&
      hostAllowed &&
      action !== "edit" &&
      action !== "submit" &&
      !url.pathname.startsWith("/wiki/Special:")
    );
  } catch {
    return false;
  }
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Wikipedia request failed with status ${response.status}`);
    }

    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveWikidataSitelink(
  wikidataId: string,
  language: AppLanguage
) {
  const fallbackLanguage = getFallbackLanguage(language);
  const params = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: wikidataId,
    origin: "*",
    props: "sitelinks",
    sitefilter: `${language}wiki|${fallbackLanguage}wiki`
  });
  const data = await fetchJson(`https://www.wikidata.org/w/api.php?${params}`);
  return selectWikipediaSitelink(data.entities?.[wikidataId]?.sitelinks, language);
}

async function findConfidentArticle(
  language: AppLanguage,
  requestedNames: string[],
  cityName: string
) {
  const query = `${requestedNames[0]} ${cityName}`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    origin: "*",
    srnamespace: "0",
    srlimit: "5",
    srsearch: query
  });
  const data = await fetchJson(
    `https://${language}.wikipedia.org/w/api.php?${params}`
  );
  const match = (data.query?.search ?? []).find((candidate: { title?: string }) =>
    candidate.title
      ? requestedNames.some((name) => isConfidentWikipediaTitle(candidate.title!, name))
      : false
  );

  return match?.title
    ? {
        kind: "article" as const,
        language,
        url: getArticleUrl(language, match.title)
      }
    : null;
}

async function resolveUncached(input: {
  cityName: LocalizedMedalText;
  language: AppLanguage;
  medal: CollectedMedal;
}): Promise<WikipediaResolution> {
  const { cityName, language, medal } = input;
  const fallbackLanguage = getFallbackLanguage(language);
  const wikidataId =
    medal.externalIdentity.source === "wikidata" &&
    /^Q\d+$/.test(String(medal.externalIdentity.id))
      ? String(medal.externalIdentity.id)
      : null;

  if (wikidataId) {
    try {
      const exact = await resolveWikidataSitelink(wikidataId, language);
      if (exact) {
        return exact;
      }
    } catch {
      // Continue through the name-based language fallback below.
    }
  }

  const namesByLanguage: Record<AppLanguage, string[]> = {
    en: [...new Set([medal.name.en, medal.name.fr])],
    fr: [...new Set([medal.name.fr, medal.name.en])]
  };

  try {
    const [selected, fallback] = await Promise.all([
      findConfidentArticle(language, namesByLanguage[language], cityName[language]),
      findConfidentArticle(
        fallbackLanguage,
        namesByLanguage[fallbackLanguage],
        cityName[fallbackLanguage]
      )
    ]);

    if (selected) {
      return selected;
    }
    if (fallback) {
      return fallback;
    }
  } catch {
    // A readable Wikipedia search is the deterministic offline-resolution fallback.
  }

  return {
    kind: "search",
    language,
    url: getWikipediaSearchUrl(language, `${medal.name[language]} ${cityName[language]}`)
  };
}

export function resolveMedalWikipedia(input: {
  cityName: LocalizedMedalText;
  language: AppLanguage;
  medal: CollectedMedal;
}) {
  const key = [
    input.language,
    input.medal.externalIdentity.source,
    input.medal.externalIdentity.id,
    input.medal.name.en,
    input.medal.name.fr
  ].join("|");
  const cached = resolutionCache.get(key);

  if (cached) {
    return cached;
  }

  const resolution = resolveUncached(input).catch(() => ({
    kind: "search" as const,
    language: input.language,
    url: getWikipediaSearchUrl(
      input.language,
      `${input.medal.name[input.language]} ${input.cityName[input.language]}`
    )
  }));
  resolutionCache.set(key, resolution);
  return resolution;
}
