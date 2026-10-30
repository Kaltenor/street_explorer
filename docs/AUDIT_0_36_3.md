# Visual and performance maintenance - 0.36.3

Date: 2026-10-17. Reviewed the existing dirty working tree at version 0.36.2 / build 257; preserved prior work. This patch advances to 0.36.3 / build 258. No commit, native dependency, schema change or remote build.

## Changes and evidence

- Atlas presentation: descriptive planning choices, a distinct gold validation action, separated distance summary, blue-accent guidance, grouped statistics, aligned numeric glyphs and more consistent recording-card spacing. History buttons use minimum heights and wrapping instead of fixed 42-point heights. Busy/expanded states and the rename input have accessible metadata. Both appearance palettes include the guidance accent.
- Guidance correctness: the previous nearest-vertex loop reports a point in the middle of a 1.1 km straight path as over 500 m away. The new nearest-segment calculation reports zero at that midpoint, clamps at endpoints, preserves corners and wraps longitude. Missing GPS displays a waiting state. The projection is for the planner's short routes, not long-distance navigation.
- History performance: report construction and inferred-cell enumeration ran on every name-input render. Memoized results now follow the source walk/GPS/loop data. The executable component harness verifies 30 edits and disclosure changes cause no additional geometry calls; new GPS or loop results recalculate.

## Desktop measurements

Run `node scripts/test-refinement.js --benchmark` for a warmed, 101-sample median on 15,000 vertices. This run measured 0.661 ms for the old nearest-vertex scan and 0.043 ms for the prepared segment scan per location update. The metrics have different semantics; this measures the old and corrected implementations, not equivalent geometric algorithms. Preparation runs once when route geometry changes.

Run `npm run measure:polygons` for the existing map fixtures. Results from this Windows host:

| Fixture | Cells | Polygons / vertices | Partition median | Contour median |
| --- | ---: | ---: | ---: | ---: |
| Corridor | 5,000 | 1 / 4 | 2.8 ms | 9.6 ms |
| Solid area | 50,000 | 1 / 4 | 16.0 ms | 27.9 ms |
| Disconnected islands | 3,025 | 3,025 / 12,100 | 0.8 ms | 16.9 ms |

The one-cell-growth fixture retained its polygon key. These are desktop measurements; many disconnected islands still require many native polygons. No native frame-rate or battery improvement is established.

## Validation and remaining device checks

Both the initial 0.36.2 and final 0.36.3 aggregate `npm test` suites passed, including typecheck, geometry, resilience, planning, UI and documentation checks. The new geometry and component regressions pass; source assertions were adjusted to permit larger-than-44-point controls and cosmetic corner-radius changes. `git diff --check` passed. The iOS export succeeded with 1,337 modules and a 5.98 MB Hermes bundle after redirecting TEMP/TMP into the writable project `.tmp` directory. The first attempt failed because Hermes could not write to the sandbox's system temporary directory.

The component harness executes production functions and hooks with mocked native primitives; it does not produce native screenshots. Physical appearance, text scaling, touch layout, GPS, persistence across a real app restart and device frame times require the numbered [manual protocol](TESTING.md#visual-refinement-and-guidance---0363). Use both providers and appearances with a compatible SDK 54 client. No physical-device or simulator run was performed on this Windows host.
