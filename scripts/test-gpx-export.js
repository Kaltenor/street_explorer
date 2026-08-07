const fs = require("fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  module._compile(output, filename);
};

const {
  buildBulkGpxFilename,
  buildGpx
} = require("../src/services/gpxExport.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

const walk = {
  activityMode: "walk",
  displayName: "Croix-Rousse: matin/été?",
  distanceMeters: 1200,
  durationSeconds: 900,
  endedAt: "2026-08-07T08:15:00.000Z",
  id: 42,
  pointCount: 2,
  startedAt: "2026-08-07T08:00:00.000Z",
  stepCount: 1500
};
const points = [
  {
    accuracy: 4,
    latitude: 45.774,
    longitude: 4.832,
    pointIndex: 0,
    timestamp: "2026-08-07T08:00:00.000Z"
  },
  {
    accuracy: 5,
    latitude: 45.775,
    longitude: 4.833,
    pointIndex: 1,
    timestamp: "2026-08-07T08:00:10.000Z"
  }
];

const gpx = buildGpx({ ...walk, displayName: "A&B <walk>" }, points);
assert(
  gpx.includes("<name>A&amp;B &lt;walk&gt;</name>"),
  "GPX metadata and track names escape XML-sensitive text"
);
assert(
  (gpx.match(/<trkpt /g) ?? []).length === points.length &&
    gpx.includes('lat="45.774" lon="4.832"'),
  "GPX output preserves every accepted point and coordinate"
);
assert(
  gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>') &&
    gpx.includes('xmlns="http://www.topografix.com/GPX/1/1"'),
  "GPX output declares the expected GPX 1.1 document"
);

const filename = buildBulkGpxFilename(walk);
assert(
  filename === "2026-08-07-Croix-Rousse-matin-ete-42.gpx",
  "bulk GPX filenames are portable, readable, and uniquely tied to session IDs"
);
assert(
  !/[<>:"/\\|?*]/.test(filename),
  "bulk GPX filenames exclude reserved filesystem characters"
);
