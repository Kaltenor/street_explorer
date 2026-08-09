# Downloadable Medal Country Packs

Street Explorer v0.23 keeps the existing 100-city, 851-medal France catalogue bundled for immediate offline compatibility. Every newer country catalogue is a versioned downloadable pack. The app bundles only a compact city-zone manifest, downloads one country when one of its supported cities is first selected, verifies the compressed byte count and SHA-256 checksum, expands and validates the schema, then retains the gzip file in the app document directory for offline reuse.

## Pack Contract

- `country-packs/v1/<country>-v<version>.json.gz` is the distributable payload.
- `<country>-v<version>-descriptor.json` records its URL, version, languages, city-zone roster, sizes, and checksum.
- `<country>-v<version>-quality.json` records population coverage, candidate counts, selected source composition, and known limitations.
- `src/data/generated/downloadableMedalCountryPackManifest.ts` is generated from descriptors and deliberately omits city labels, population, and rank so the Expo bundle carries only runtime lookup and validation fields.
- Album IDs, city-zone IDs, and medal IDs are globally unique. Every medal requires finite coordinates plus English, French, and the album's local-language name and description.

`medalCountryPackStore.ts` admits HTTPS URLs only, coalesces simultaneous requests for the same country/version, verifies the compressed checksum before parsing, validates all albums and medals against the descriptor pinned in the app bundle, installs through a temporary file and atomic rename, and removes superseded files for that country only after the replacement succeeds. A corrupt cached file is discarded and fetched again. A valid installed pack requires no network.

Pack download failure is isolated from normal saved-data hydration. Core saved-data queries complete before country download, validation, or catalogue seeding begins. The medal rail reports Downloading, or Album unavailable with a tap-to-retry action, while History, exploration, objectives, recording state, and any durable route/exploration cache repair continue to load. A failed country/version is latched so automatic refreshes do not repeat the same network request; only the explicit retry action clears that failure. Identical in-flight saved-data refreshes are coalesced. Medal evaluation for a repaired recording stays in the asynchronous medal lane. Pending presentations from available albums remain usable even if another country is unavailable.

## Coverage Policy

Population ranking determines where catalogue effort is spent; it does not determine landmark quality. Each country starts with at least 30 municipalities, expands until the selected cities cover 50% of national population, and stops at 100 cities. The 100-city cap prevents Germany or Italy from dominating download and editorial cost. A city must have at least five qualified landmarks. The three largest cities request richer rosters of 20, ranks 4-10 request 12, and later cities request up to 8.

Official national or regional heritage data is preferred. Coordinate-bearing Wikidata or OpenStreetMap records fill only measured gaps and remain explicitly identified in each medal and quality report. Candidate selection rejects obvious people, organizations, roads, events, and administrative entities; deduplicates names and coordinates; balances the five medal categories; and keeps stable source IDs.

## Netherlands Pilot

The pilot used Statistics Netherlands (CBS) 2025 municipality populations and the Rijksdienst voor het Cultureel Erfgoed Rijksmonumentenregister extract. Its top 30 municipalities cover 36.96% of the country. Amsterdam, Rotterdam, and Maastricht received manual 20-medal curation to exercise dense historic, modern port, and regional-border catalogues. Expansion reached the 50% target at 58 municipalities.

The final Netherlands v1 pack contains 58 albums and 492 medals. It measures 46,085 bytes compressed and 436,982 bytes expanded. The full expansion evaluated 3,892 qualified candidates; 430 selected medals come from the official RCE register and 62 from reviewed Wikidata fallback.

## Size Gate

Before the parallel wave, the measured Dutch bytes-per-city projected Belgium, Germany, Italy, and Spain at 391 albums, about 3,316 medals, 310,677 compressed bytes, and 2,945,861 expanded bytes. The approved budgets are 250,000 compressed bytes per country, 1,000,000 compressed bytes for the wave, and 8,000,000 expanded bytes for the wave. The reproducible input, formula, official population sources, and go decision are frozen in `country-packs/v1/wave-1-size-estimate.json`.

Belgium reaches the coverage target at 91 municipalities. Germany and Italy stop at 100 municipalities, covering 34.24% and 30.48% respectively; reaching 50% would require 375 and 420. Spain also stops at 100, covering 46.49%; 125 would reach 50%. This confirms that “the largest 100” is a useful ceiling, not a universal target.

The completed wave is smaller than estimated: 391 albums, 3,358 medals, and 46,890 evaluated candidates occupy 286,643 compressed bytes and 2,824,842 expanded bytes. That uses 28.66% of the 1 MB download budget and 35.31% of the 8 MB expanded-cache budget. Including the Netherlands pilot, the downloadable catalogue totals 449 albums and 3,850 medals.

| Pack | Albums | Medals | Population | Compressed | Expanded | Selected source mix |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Netherlands | 58 | 492 | 50.26% | 46,085 B | 436,982 B | 430 RCE, 62 Wikidata |
| Belgium | 91 | 782 | 50.07% | 66,511 B | 762,005 B | 493 Flanders Inventaris, 87 AWaP, 202 Wikidata |
| Germany | 100 | 864 | 34.24% | 73,212 B | 687,040 B | 864 Wikidata; 848 carry heritage-designation signals |
| Italy | 100 | 854 | 30.48% | 70,980 B | 665,823 B | 838 Wikidata, 16 OSM |
| Spain | 100 | 858 | 46.49% | 75,940 B | 709,974 B | 832 Wikidata, 26 OSM |

Belgium demonstrates that regional official feeds can provide most of a national roster. Germany has no normalized national monument feed with complete coordinates, so v1 uses a bounded Wikidata catalogue while official Destatis data controls selection. Italy attempted the official MiC/ICCD ArCo endpoint once; after that request failed, it skipped the remaining batches and used checkpointed Wikidata plus OSM only for Aprilia and Olbia. Spain v1 likewise uses official INE population selection but community-source landmarks, with OSM restricted to five sparse cities. These are explicit v1 limitations and clear targets for later source-normalization work, not hidden equivalence claims.

The generated results and estimate variance are written to `country-packs/v1/wave-1-results.json`. `npm run test:country-packs` verifies every gzip size and checksum, schema and locale completeness, global identity uniqueness, the five-medal floor, and the approved download/cache budgets.

## Build And Publish Workflow

1. Download the cited official population and heritage inputs. Large source exports and query caches stay outside the repository.
2. Run the country generator in `scripts/country-packs/`. Each generator writes the gzip, descriptor, and quality report and fails rather than publishing an underfilled or unidentified city.
3. Run `npm run build:country-pack-report` and review coverage, candidate counts, source mix, actual size, and limitations.
4. Run `npm run build:country-pack-manifest`, `npm run test:country-packs`, and `npm run test:medals`.
5. Publish the immutable versioned gzip files at the HTTPS URLs pinned in the descriptors before releasing the app manifest. A development checkout cannot download unpublished raw GitHub artifacts.
6. Increment a country pack's version whenever its roster, coordinates, copy, or source identity changes. Never replace bytes behind an existing version/checksum pair.

The generators are reproducible transformation and review tools, not runtime code. Their temporary PowerShell network transport exists only for the Windows authoring environment when direct Node networking is sandboxed; the mobile app uses Expo's native HTTPS file download path.
