import assert from "node:assert/strict";
import fs from "node:fs";

import {
  getWikipediaSearchUrl,
  isAllowedWikipediaReadingUrl,
  isConfidentWikipediaTitle,
  selectWikipediaSitelink
} from "../src/services/wikipedia.ts";

const selectedFrench = selectWikipediaSitelink(
  {
    enwiki: { title: "Eiffel Tower" },
    frwiki: { title: "Tour Eiffel" }
  },
  "fr"
);
assert.deepEqual(selectedFrench, {
  kind: "article",
  language: "fr",
  url: "https://fr.wikipedia.org/wiki/Tour_Eiffel"
});
console.log("PASS selected-language Wikidata sitelinks win");

const fallbackEnglish = selectWikipediaSitelink(
  { enwiki: { title: "Eiffel Tower" } },
  "fr"
);
assert.equal(fallbackEnglish?.language, "en");
assert.equal(fallbackEnglish?.url, "https://en.wikipedia.org/wiki/Eiffel_Tower");
console.log("PASS missing selected-language articles fall back to the other app language");

assert.equal(
  getWikipediaSearchUrl("fr", "Musée des Arts et Métiers Paris"),
  "https://fr.wikipedia.org/w/index.php?search=Mus%C3%A9e%20des%20Arts%20et%20M%C3%A9tiers%20Paris"
);
assert(isConfidentWikipediaTitle("Musée d'Orsay (Paris)", "Musée d’Orsay"));
assert(!isConfidentWikipediaTitle("Orsay station", "Musée d’Orsay"));
console.log("PASS article confidence and same-language search URLs are deterministic");

assert(isAllowedWikipediaReadingUrl("https://fr.wikipedia.org/wiki/Tour_Eiffel"));
assert(isAllowedWikipediaReadingUrl("https://en.m.wikipedia.org/wiki/Eiffel_Tower"));
assert(isAllowedWikipediaReadingUrl("https://fr.wikipedia.org/w/index.php?search=Tour+Eiffel"));
assert(!isAllowedWikipediaReadingUrl("http://fr.wikipedia.org/wiki/Tour_Eiffel"));
assert(!isAllowedWikipediaReadingUrl("https://fr.wikipedia.org/w/index.php?title=Tour_Eiffel&action=edit"));
assert(!isAllowedWikipediaReadingUrl("https://fr.wikipedia.org/wiki/Special:UserLogin"));
assert(!isAllowedWikipediaReadingUrl("https://example.com/wiki/Tour_Eiffel"));
console.log("PASS the read-only navigation policy allows Wikipedia reading and blocks editing or external hosts");

const collectionSource = fs.readFileSync(
  new URL("../src/components/MedalCollectionModal.tsx", import.meta.url),
  "utf8"
);
const readerSource = fs.readFileSync(
  new URL("../src/components/MedalWikipediaReader.tsx", import.meta.url),
  "utf8"
);
assert(collectionSource.includes("medal.isCollected ? ("));
assert(collectionSource.includes('accessibilityRole="link"'));
assert(collectionSource.includes("onOpenWikipedia(medal, event)"));
assert(readerSource.includes("react-native-webview"));
assert(!readerSource.includes('import { WebView } from "react-native-webview"'));
assert(!readerSource.includes('UIManager.getViewManagerConfig?.("RNCWebView")'));
assert(readerSource.includes('if (!TurboModuleRegistry.get("RNCWebViewModule"))'));
const lazyLoader = readerSource.match(
  /function getEmbeddedWebView\(\): ComponentType<WebViewProps> \| null \{([\s\S]*?)\n\}/
);
assert(lazyLoader);
assert(lazyLoader[1].includes("try {"));
assert(lazyLoader[1].includes('require("react-native-webview")'));
assert(lazyLoader[1].includes("catch {"));
assert(
  lazyLoader[1].indexOf('TurboModuleRegistry.get("RNCWebViewModule")') <
    lazyLoader[1].indexOf("try {") &&
  lazyLoader[1].indexOf("try {") <
    lazyLoader[1].indexOf('require("react-native-webview")')
);
assert(readerSource.includes("isAllowedWikipediaReadingUrl(request.url)"));
assert(readerSource.includes("Linking.openURL(resolution.url)"));
assert(readerSource.includes("useReducedMotionPreference"));
console.log("PASS only unlocked descriptions wire the morphing reader with browser and reduced-motion fallbacks");

console.log("Wikipedia reader regression checks passed.");
