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

const explorationArea = require("../src/services/explorationArea.ts");
const loopFill = require("../src/services/loopFill.ts");
const osmStreetService = require("../src/services/osmStreetService.ts");
const pathInference = require("../src/services/pathInference.ts");
const config = require("../src/constants/config.ts");
const packageMetadata = require("../package.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

function rectangle(width, height, skipped = new Set()) {
  const cells = [];

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const key = x + ":" + y;

      if (!skipped.has(key)) {
        cells.push(key);
      }
    }
  }

  return cells;
}

function perimeter(size) {
  const cells = new Set();

  for (let index = 0; index < size; index += 1) {
    cells.add(index + ":0");
    cells.add(index + ":" + (size - 1));
    cells.add("0:" + index);
    cells.add(size - 1 + ":" + index);
  }

  return [...cells];
}

function offsetPerimeter(size, offsetX, offsetY) {
  return perimeter(size).map((cell) => {
    const [x, y] = cell.split(":").map(Number);
    return (x + offsetX) + ":" + (y + offsetY);
  });
}

function analyzeWalkingLoop(size) {
  return loopFill.analyzeLoopFillsForCells({
    activityMode: "walk",
    boundaryCellIds: perimeter(size),
    exploredStreetIds: new Set(),
    streetSegments: []
  });
}
function gpsPoint(longitudeOffset, pointIndex, seconds = pointIndex * 5) {
  return {
    accuracy: 5,
    latitude: 45.75,
    longitude: 4.8 + longitudeOffset,
    pointIndex,
    timestamp: new Date(Date.UTC(2026, 0, 1, 12, 0, seconds)).toISOString()
  };
}

assert(
  config.APP_VERSION === packageMetadata.version,
  "every menu version label uses the canonical package version"
);
assert(
  loopFill.LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode.walk === 150000 &&
    loopFill.LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode.wheel === 400000 &&
    loopFill.LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode.car === 5000000,
  "the existing walk, wheel, and car fill limits remain unchanged"
);
const solid = explorationArea.buildMergedExplorationPolygons(rectangle(3, 3));
assert(
  solid.length === 1 &&
    solid[0].holes.length === 0 &&
    solid[0].coordinates.length === 4,
  "solid cells render as one seamless polygon"
);

const ring = explorationArea.buildMergedExplorationPolygons(
  rectangle(3, 3, new Set(["1:1"]))
);
assert(
  ring.length === 1 && ring[0].holes.length === 1,
  "a genuinely unfilled enclosed cell remains an explicit polygon hole"
);

const visuallyFilledRing = explorationArea.buildMergedExplorationPolygons(
  rectangle(3, 3, new Set(["1:1"])),
  { maxFilledHoleAreaSquareMeters: 150000 }
);
assert(
  visuallyFilledRing.length === 1 && visuallyFilledRing[0].holes.length === 0,
  "small enclosed display holes are filled within the active mode limit"
);

const filledRingWithNestedIsland = explorationArea.buildMergedExplorationPolygons(
  [...new Set([...perimeter(9), "4:4"])],
  { maxFilledHoleAreaSquareMeters: 150000 }
);
assert(
  filledRingWithNestedIsland.length === 1 &&
    filledRingWithNestedIsland[0].holes.length === 0,
  "filling a hole also removes redundant nested island artifacts"
);

const oversizedDisplayRing = explorationArea.buildMergedExplorationPolygons(
  perimeter(30),
  { maxFilledHoleAreaSquareMeters: 150000 }
);
assert(
  oversizedDisplayRing.length === 1 && oversizedDisplayRing[0].holes.length === 1,
  "oversized enclosed display surfaces remain unfilled"
);

const diagonal = explorationArea.buildMergedExplorationPolygons(["0:0", "1:1"]);
assert(diagonal.length === 2, "diagonally touching cells remain separate islands");

const outline = explorationArea.buildExplorationOutlineSegments(
  rectangle(3, 3, new Set(["1:1"]))
);
assert(outline.length === 2, "black outlines include exterior and retained hole frontiers");

const filledOutline = explorationArea.buildExplorationOutlineSegments(
  rectangle(3, 3, new Set(["1:1"])),
  { maxFilledHoleAreaSquareMeters: 150000 }
);
assert(filledOutline.length === 1, "filled holes do not leave internal black outlines");

const openCorridor = explorationArea.buildMergedExplorationPolygons(
  Array.from({ length: 40 }, (_, x) => [x + ":0", x + ":1"]).flat()
);
assert(
  openCorridor.length === 1 && openCorridor[0].holes.length === 0,
  "walked open corridors remain solid without internal holes"
);
const frozenRouteCells = explorationArea.collectExploredCellIdsByRouteSegments([
  {
    points: [gpsPoint(0, 0), gpsPoint(0.0001, 1)],
    type: "confirmed"
  },
  {
    confidence: "medium",
    points: [0.0001, 0.00025, 0.0004, 0.00055, 0.0007, 0.00085, 0.001, 0.0011]
      .map((offset, index) => gpsPoint(offset, index + 1)),
    type: "inferred"
  },
  {
    points: [gpsPoint(0.0011, 8), gpsPoint(0.0012, 9)],
    type: "confirmed"
  }
]);
const frozenRouteSurface = explorationArea.buildMergedExplorationPolygons([
  ...frozenRouteCells.gps,
  ...frozenRouteCells.inferred
]);
assert(
  frozenRouteCells.gps.length > 0 &&
    frozenRouteCells.inferred.length > 0 &&
    frozenRouteSurface.length === 1 &&
    frozenRouteSurface[0].holes.length === 0,
  "validated frozen street bridges count as continuous explored cells"
);

const rejectedStraightGapCells = explorationArea.collectExploredCellIdsBySource(
  [gpsPoint(0, 0, 0), gpsPoint(0.002, 1, 20)],
  "walk",
  []
);
assert(
  rejectedStraightGapCells.gps.length === 0 && rejectedStraightGapCells.inferred.length === 0,
  "a GPS gap without a valid street route never receives a straight-line exploration fallback"
);
const unvalidatedFrozenCells = explorationArea.collectExploredCellIdsByRouteSegments([{
  points: [gpsPoint(0, 0), gpsPoint(0.001, 1)],
  type: "inferred"
}]);
assert(
  unvalidatedFrozenCells.inferred.length === 0,
  "an inferred frozen segment without high or medium confidence contributes no cells"
);

const acceptedLoops = analyzeWalkingLoop(10).filter((result) => result.accepted);
const acceptedCells = acceptedLoops.flatMap((result) => result.cellIds);
const filledSurface = explorationArea.buildMergedExplorationPolygons([
  ...new Set([...perimeter(10), ...acceptedCells])
]);
assert(
  acceptedLoops.length === 1 &&
    acceptedCells.length === 64 &&
    filledSurface.length === 1 &&
    filledSurface[0].holes.length === 0,
  "a qualifying cumulative loop becomes completely solid"
);

const adjacentLoopBoundary = [
  ...offsetPerimeter(6, 0, 0),
  ...offsetPerimeter(6, 10, 0),
  "6:2",
  "7:2",
  "8:2",
  "9:2"
];
const adjacentLoops = loopFill.analyzeLoopFillsForCells({
  activityMode: "walk",
  boundaryCellIds: adjacentLoopBoundary,
  exploredStreetIds: new Set(),
  streetSegments: []
}).filter((result) => result.accepted);
assert(
  adjacentLoops.length === 2 &&
    adjacentLoops.every((result) => result.cellIds.length === 16),
  "independent enclosed areas persist separately instead of being merged by loop tolerance"
);

const nestedExplorationBoundary = [
  ...perimeter(12),
  ...offsetPerimeter(4, 4, 4)
];
const renderedNestedSurface = explorationArea.buildMergedExplorationPolygons(
  nestedExplorationBoundary,
  { maxFilledHoleAreaSquareMeters: 150000 }
);
const authoritativeContourCells = new Set(
  explorationArea.collectEnclosedExplorationCellGroups(nestedExplorationBoundary).flat()
);
const persistedNestedCells = new Set(
  loopFill.analyzeLoopFillsForCells({
    activityMode: "walk",
    boundaryCellIds: nestedExplorationBoundary,
    exploredStreetIds: new Set(),
    streetSegments: []
  })
    .filter((result) => result.accepted)
    .flatMap((result) => result.cellIds)
);
assert(
  renderedNestedSurface.length === 1 &&
    renderedNestedSurface[0].holes.length === 0 &&
    authoritativeContourCells.size > 0 &&
    persistedNestedCells.size === authoritativeContourCells.size &&
    [...persistedNestedCells].every((cellId) => authoritativeContourCells.has(cellId)),
  "persisted loop cells exactly match the enclosed contours filled by the renderer"
);

const completionContourCells = new Set(
  explorationArea.collectFillableEnclosedExplorationCellIds(
    nestedExplorationBoundary,
    150000
  )
);
assert(
  completionContourCells.size === authoritativeContourCells.size &&
    [...completionContourCells].every((cellId) => authoritativeContourCells.has(cellId)),
  "completion includes every qualifying enclosed cell rendered as solid red"
);
const safeSnapStart = {
  ...gpsPoint(0.0002, 0, 0),
  latitude: 45.75003
};
const safeSnapEnd = {
  ...gpsPoint(0.0008, 1, 20),
  latitude: 45.75003
};
const safeStreetSegment = {
  coordinates: [
    { latitude: 45.75, longitude: 4.8 },
    { latitude: 45.75, longitude: 4.801 }
  ],
  fetchedAt: "2026-01-01T00:00:00.000Z",
  highway: "residential",
  id: "way/test/part/0",
  maxLatitude: 45.75,
  maxLongitude: 4.801,
  minLatitude: 45.75,
  minLongitude: 4.8,
  name: "Test street"
};
const safeSnapResult = pathInference.inferPathBetweenPoints(
  safeSnapStart,
  safeSnapEnd,
  "walk",
  [safeStreetSegment]
);
assert(
  safeSnapResult.status === "inferred" &&
    safeSnapResult.segment.confidence === "high" &&
    safeSnapResult.segment.points[0].latitude === safeSnapStart.latitude &&
    safeSnapResult.segment.points.at(-1).latitude === safeSnapEnd.latitude,
  "high-confidence street matches close their short endpoint seams"
);
const overlappingWay = [
  { latitude: 45.75, longitude: 4.8 },
  { latitude: 45.75, longitude: 4.804 }
];
const westernParts = osmStreetService.splitWayIntoStableLocalSegments(
  overlappingWay,
  { latitude: 45.75, longitude: 4.801 },
  190
);
const easternParts = osmStreetService.splitWayIntoStableLocalSegments(
  overlappingWay,
  { latitude: 45.75, longitude: 4.803 },
  190
);
const easternById = new Map(easternParts.map((part) => [part.partIndex, part.coordinates]));
const sharedStableParts = westernParts.filter((part) => easternById.has(part.partIndex));
assert(
  sharedStableParts.length > 0 &&
    sharedStableParts.every((part) =>
      JSON.stringify(part.coordinates) === JSON.stringify(easternById.get(part.partIndex))
    ),
  "overlapping OSM fetches keep stable identities for the same physical road pieces"
);
const oversizedLoops = analyzeWalkingLoop(30);
assert(
  oversizedLoops.length === 1 &&
    oversizedLoops[0].accepted === false &&
    oversizedLoops[0].rejectionReason === "loop_area_too_large",
  "the existing walking-area cap rejects oversized surfaces"
);

const openPathLoops = loopFill.analyzeLoopFillsForCells({
  activityMode: "walk",
  boundaryCellIds: Array.from({ length: 40 }, (_, index) => index + ":0"),
  exploredStreetIds: new Set(),
  streetSegments: []
});
assert(openPathLoops.length === 0, "an open walked corridor never fills a surface");

const largeSolidCells = rectangle(250, 200);
const startedAt = Date.now();
const largeSolid = explorationArea.buildMergedExplorationPolygons(largeSolidCells);
const elapsedMs = Date.now() - startedAt;
assert(
  largeSolid.length === 1 && largeSolid[0].coordinates.length === 4,
  "50,000 adjacent cells collapse to one four-corner native polygon"
);
console.log("Geometry benchmark: " + elapsedMs + "ms");
