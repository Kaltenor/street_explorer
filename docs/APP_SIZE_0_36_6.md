# Production bundle and asset audit - 0.36.6

Measured on 2026-10-29 from the existing working tree, before and after optimization. Version 0.36.5 -> 0.36.6; iOS/Android build 260 -> 261. Existing features and artwork are retained.

## Measured runtime payload

Both comparisons use npx expo export --platform all without source maps, on the same installed dependencies and production Hermes settings. Source-map exports were used only for inspection; they produce different bytecode sizes and are excluded from these comparisons. Byte counts below are exact, MB in summaries is decimal.

| Payload | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| ios Hermes bundle | 5,967,766 | 4,009,030 | 32.8% |
| ios Assets | 5,886,136 | 5,247,860 | 10.8% |
| ios Total runtime payload | 11,853,902 | 9,256,890 | 21.9% |
| ios Gzip comparison | 7,090,709 | 6,469,736 | 8.8% |
| android Hermes bundle | 5,974,483 | 4,015,630 | 32.8% |
| android Assets | 5,886,136 | 5,247,860 | 10.8% |
| android Total runtime payload | 11,860,619 | 9,263,490 | 21.9% |
| android Gzip comparison | 7,093,878 | 6,472,803 | 8.8% |

Each platform still exports 31 assets. Totals count the platform's Hermes bundle and unique exported assets, excluding metadata and audit artifacts. Gzip comparison sums deterministic level-9 gzip sizes of each file; it illustrates compressibility and is not a measured store download size.

These are production runtime payload sizes, not complete APK/AAB/IPA or installed-app measurements. Native libraries, signing, store thinning, native splash compilation and container compression are outside the export. No current native artifact was available in this workspace and no credentialed remote build was started. The two platform totals are separate; a phone does not ship both. Development-client binaries include debugging tools and should not be compared with release builds.

## Changes and equivalence evidence

- France catalogue: all 500 cities / 6,082 medals remain offline. Generated compressed payload JSON is 625,879 bytes. Per-city raw DEFLATE streams share a compressed 32 KiB dictionary. The dictionary inflates once; a city inflates and parses on first access, then reuses the same cached object. No network, asynchronous filesystem access, coordinate rounding, text truncation or schema change. Original JSON remains the authoring source. Tests deeply compare every decoded album with its original, including all floating-point coordinates and localized strings.
- Icons: 389,724 -> 28,700 bytes. Metro redirects only the existing Ionicons import to an 89-name subset. Preloading and the ionicons family stay unchanged. Every retained glyph has identical outlines, advance widths and font metrics; FreeType renders matched pixel-for-pixel at 14, 20, 32 and 64 px. The scanner covers source string literals, JSX attributes, conditional branches and category maps. Dynamic icon names must remain explicitly enumerated in source. Runtime tests fail when the generated map is stale.
- Images: lossless PNG recompression and removal of non-rendering authoring metadata. All 25 processed files passed decoded RGBA and dimension equality, including hidden RGB under transparency. ICC/gamma/chromaticity, pixel density and JPEG EXIF/orientation/color transforms are retained. No resizing, palette quantization or JPEG re-encoding. The native splash source separately shrank from 3,933,629 to 3,576,406 bytes; that 357,223-byte source saving is not included in the Metro totals above and is not a measured compiled-native saving.
- No runtime dependency was added or removed. Existing SDK compatibility pins, both map providers, WebView, recording/background-location support, font character coverage for user text and sound waveforms are retained. WAV audio stays unchanged to preserve existing playback behavior; no new codec or lossy encode was introduced.

## Build and maintenance

- npm run build:bundled-medals rebuilds the lossless catalogue payload from source albums selected by the generated France manifest. The France generator invokes it automatically. Run it after manual album edits.
- npm run build:icon-subset requires Python with fonttools and Pillow (install the pinned authoring tools with python -m pip install -r scripts/requirements-asset-tools.txt) and runs the AST scanner before subsetting. The checked-in font and glyph map are sufficient for ordinary npm installs/builds; Python is not a runtime/native dependency. Source license: assets/fonts/LICENSE-Ionicons.txt.
- python scripts/optimize-images-lossless.py requires Pillow and zopfli. It replaces a file only when smaller and after pixel equality succeeds. The cartographer authoring sheet is excluded.
- npm run test:bundle-assets verifies generated-catalogue freshness, complete album equality, cached identity, icon coverage and Metro resolution. It is included in npm test.
- npm run measure:export -- <export-directory> reports raw runtime bytes and the separate gzip comparison.
- npm run measure:medal-storage now measures the generated France payload instead of counting pretty-printed source JSON as distributed bytes. SQLite catalogue size remains 3,682,304 bytes.

Initial desktop cold-decode measurement for all 500 compressed albums was 112.9 ms total, 4.9 ms maximum for one album. This is not a device performance guarantee; cached reads skip decompression. Native launch, font rasterization and catalogue-first-open latency still require the manual checks below.

## Validation

PASS: full npm test, including typecheck, all existing focused regressions, documentation consistency and the new bundle-asset equivalence suite. PASS: iOS and Android production exports, image pixel equality, glyph-outline/metrics checks, font raster comparisons, catalogue equality, regenerated-font equality with measured exports and git diff --check. Native-device tests and signed native release builds were not run.

## Device smoke protocol

Prerequisites: compatible SDK 54 development client loading this bundle, or a new standalone build 261. Native splash optimization requires rebuilding the binary to inspect it. Test iOS and Android, both appearances and French/English; use existing saved walks and collected medals, with location permission enabled. Native checks have not been performed automatically.

1. Cold-launch and visit all Atlas pages, including planning, Options and Medals. Expect the same artwork, layout, fonts and every conditional icon; toggle expanded/collapsed and recording states.
2. In airplane mode, select multiple bundled French cities, including Paris and a smaller city, then open medal descriptions and collected cards. Expect the same names, coordinates, text and counts without a download. Reopen a city; expect no repeated decode delay.
3. Record and finish a short walk, trigger available sounds/haptics, and reopen the app. Expect unchanged recording, feedback, saved paths, medals and planning recovery.
4. With networking restored, open Wikipedia and a downloadable foreign catalogue; then reopen that catalogue offline. Expect existing reader and country-pack behavior.
5. For final store-size confirmation, compare native release artifacts built from before/after source with the same toolchain, architecture and signing configuration. Compare installed size and store-thinned download size separately.
