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
const streetCompletion = require("../src/services/streetCompletion.ts");
const liveRoute = require("../src/services/liveRoute.ts");
const recordingState = require("../src/services/recordingState.ts");
const config = require("../src/constants/config.ts");
const Module = require("module");
const originalModuleLoad = Module._load;
Module._load = function loadWithExpoSqliteStub(request, parent, isMain) {
  if (request === "expo-sqlite") {
    return {};
  }

  return originalModuleLoad.call(this, request, parent, isMain);
};
const zoneCompletion = require("../src/services/zoneCompletion.ts");
Module._load = originalModuleLoad;
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

function streetFixture(id, from, to, overrides = {}) {
  return {
    access: null,
    bridge: false,
    coordinates: [from, to],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    foot: null,
    highway: "residential",
    id,
    layer: 0,
    maxLatitude: Math.max(from.latitude, to.latitude),
    maxLongitude: Math.max(from.longitude, to.longitude),
    minLatitude: Math.min(from.latitude, to.latitude),
    minLongitude: Math.min(from.longitude, to.longitude),
    name: id,
    tunnel: false,
    ...overrides
  };
}

function routeFixture(points) {
  return [{
    points: points.map((point, index) => ({
      accuracy: 5,
      latitude: point.latitude,
      longitude: point.longitude,
      pointIndex: index,
      timestamp: new Date(Date.UTC(2026, 0, 1, 12, 0, index * 5)).toISOString()
    })),
    type: "confirmed"
  }];
}

const v2StreetStart = { latitude: 45.75, longitude: 4.8 };
const v2StreetEnd = { latitude: 45.75, longitude: 4.801 };
const v2ParallelOffset = 8 / 111320;
const v2MainStreet = streetFixture("way/100/part/0", v2StreetStart, v2StreetEnd);
const v2ParallelStreet = streetFixture(
  "way/200/part/0",
  { latitude: 45.75 + v2ParallelOffset, longitude: 4.8 },
  { latitude: 45.75 + v2ParallelOffset, longitude: 4.801 }
);
const v2PartialCoverage = streetCompletion.calculateStreetCoverageForRouteSegments(
  routeFixture([
    v2StreetStart,
    { latitude: 45.75, longitude: 4.8005 }
  ]),
  [v2MainStreet, v2ParallelStreet]
);
const v2PartialMain = v2PartialCoverage.find(
  (coverage) => coverage.segmentId === v2MainStreet.id
);
assert(
  Boolean(v2PartialMain) &&
    v2PartialMain.walkedDistanceMeters > v2PartialMain.totalDistanceMeters * 0.35 &&
    v2PartialMain.walkedDistanceMeters < v2PartialMain.totalDistanceMeters * 0.7,
  "street completion V2 awards proportional metres instead of a whole street"
);
assert(
  !v2PartialCoverage.some((coverage) => coverage.segmentId === v2ParallelStreet.id),
  "street completion V2 credits only the nearest compatible parallel street"
);
const v2RepeatedBins = new Map();
streetCompletion.addStreetCoverageToAggregate(v2RepeatedBins, v2PartialCoverage);
const v2UniqueBinCount = v2RepeatedBins.get(v2MainStreet.id)?.size ?? 0;
streetCompletion.addStreetCoverageToAggregate(v2RepeatedBins, v2PartialCoverage);
assert(
  v2RepeatedBins.get(v2MainStreet.id)?.size === v2UniqueBinCount,
  "street completion V2 does not double-count repeated walks over the same bins"
);
const v2PerpendicularCoverage = streetCompletion.calculateStreetCoverageForRouteSegments(
  routeFixture([
    { latitude: 45.7498, longitude: 4.8005 },
    { latitude: 45.7502, longitude: 4.8005 }
  ]),
  [v2MainStreet]
);
assert(
  v2PerpendicularCoverage.length === 0,
  "street completion V2 rejects close but direction-incompatible crossings"
);
const v2ReverseCoverage = streetCompletion.calculateStreetCoverageForRouteSegments(
  routeFixture([v2StreetEnd, v2StreetStart]),
  [v2MainStreet]
)[0];
assert(
  Boolean(v2ReverseCoverage) &&
    v2ReverseCoverage.walkedDistanceMeters >= v2ReverseCoverage.totalDistanceMeters * 0.9,
  "street completion V2 accepts either walking direction and reaches the 90 percent threshold"
);
const v2PrivateCoverage = streetCompletion.calculateStreetCoverageForRouteSegments(
  routeFixture([v2StreetStart, v2StreetEnd]),
  [streetFixture("way/300/part/0", v2StreetStart, v2StreetEnd, { access: "private" })]
);
assert(
  v2PrivateCoverage.length === 0,
  "street completion V2 excludes non-walkable OSM access"
);

assert(
  config.APP_VERSION === packageMetadata.version,
  "every menu version label uses the canonical package version"
);
assert(
  Object.keys(config.MODE_LOCATION_CONFIG).length === 1 &&
    Object.keys(loopFill.LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode).length === 1 &&
    loopFill.LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode.walk === 150000,
  "only the walking tracking and fill profiles remain"
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
assert(
  ring[0].id !== visuallyFilledRing[0].id,
  "a filled hole changes native polygon identity so MapKit cannot retain stale geometry"
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
  "completion includes every qualifying enclosed cell rendered as solid light orange"
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
  access: null,
  bridge: false,
  coordinates: [
    { latitude: 45.75, longitude: 4.8 },
    { latitude: 45.75, longitude: 4.801 }
  ],
  fetchedAt: "2026-01-01T00:00:00.000Z",
  foot: null,
  highway: "residential",
  id: "way/test/part/0",
  layer: 0,
  maxLatitude: 45.75,
  maxLongitude: 4.801,
  minLatitude: 45.75,
  minLongitude: 4.8,
  name: "Test street",
  tunnel: false
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
const topologySegment = (id, coordinates, overrides = {}) => ({
  ...safeStreetSegment,
  coordinates,
  id,
  maxLatitude: Math.max(...coordinates.map((point) => point.latitude)),
  maxLongitude: Math.max(...coordinates.map((point) => point.longitude)),
  minLatitude: Math.min(...coordinates.map((point) => point.latitude)),
  minLongitude: Math.min(...coordinates.map((point) => point.longitude)),
  ...overrides
});
const crossingStart = gpsPoint(0, 0, 0);
const crossingEnd = {
  ...gpsPoint(0.0005, 1, 80),
  latitude: 45.7506
};
const crossingHorizontal = topologySegment("way/crossing-horizontal/part/0", [
  { latitude: 45.75, longitude: 4.8 },
  { latitude: 45.75, longitude: 4.801 }
]);
const crossingVertical = topologySegment("way/crossing-vertical/part/0", [
  { latitude: 45.75, longitude: 4.8005 },
  { latitude: 45.7506, longitude: 4.8005 }
]);
const crossingResult = pathInference.inferPathBetweenPoints(
  crossingStart,
  crossingEnd,
  "walk",
  [crossingHorizontal, crossingVertical]
);
assert(
  crossingResult.status === "inferred" &&
    crossingResult.segment.bridgeEvidence.acceptanceReason === "geometric_crossing" &&
    crossingResult.segment.bridgeEvidence.intersectionJoinCount === 1,
  "ground-level geometric crossings create an evidenced street bridge"
);
const overpassResult = pathInference.inferPathBetweenPoints(
  crossingStart,
  crossingEnd,
  "walk",
  [
    crossingHorizontal,
    topologySegment(
      "way/crossing-bridge/part/0",
      crossingVertical.coordinates,
      { bridge: true, layer: 1 }
    )
  ]
);
assert(
  overpassResult.status === "rejected",
  "bridge and ground geometry crossings remain disconnected"
);
const endpointJoinResult = pathInference.inferPathBetweenPoints(
  gpsPoint(0, 0, 0),
  gpsPoint(0.001, 1, 80),
  "walk",
  [
    topologySegment("way/endpoint-left/part/0", [
      { latitude: 45.75, longitude: 4.8 },
      { latitude: 45.75, longitude: 4.8005 }
    ]),
    topologySegment("way/endpoint-right/part/0", [
      { latitude: 45.75, longitude: 4.80055 },
      { latitude: 45.75, longitude: 4.801 }
    ])
  ]
);
assert(
  endpointJoinResult.status === "inferred" &&
    endpointJoinResult.segment.confidence === "medium" &&
    endpointJoinResult.segment.bridgeEvidence.acceptanceReason === "near_endpoint_join" &&
    endpointJoinResult.segment.bridgeEvidence.maxEndpointJoinDistanceMeters <= 8,
  "compatible street endpoints within eight metres create a medium-confidence evidenced bridge"
);

const legacyGapStart = gpsPoint(0, 0, 0);
const legacyGapEnd = gpsPoint(0.0007, 1, 20);
const legacyGapWithoutCoverage = pathInference.buildPathSegments(
  [legacyGapStart, legacyGapEnd],
  "walk"
);
const legacyGapWithCoverage = pathInference.buildPathSegmentsWithInference(
  [legacyGapStart, legacyGapEnd],
  "walk",
  [safeStreetSegment]
);
assert(
  legacyGapWithoutCoverage.length === 1 &&
    legacyGapWithoutCoverage[0].type === "rejected" &&
    legacyGapWithCoverage.length === 1 &&
    legacyGapWithCoverage[0].type === "inferred",
  "the v0.3.50 legacy-gap regression is repaired after consolidated street coverage loads"
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
const corridorParts = osmStreetService.splitWayIntoStableCorridorSegments(
  overlappingWay,
  [[
    { latitude: 45.75, longitude: 4.8008 },
    { latitude: 45.75, longitude: 4.8018 }
  ]],
  75
);
assert(
  corridorParts.length > 0 && corridorParts.length < westernParts.length + easternParts.length,
  "consolidated street repair clips stable OSM parts to walked-route corridors"
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

let longActiveWalk = recordingState.createActiveWalk(
  "walk",
  1001,
  "2026-01-01T12:00:00.000Z"
);
let everyLongRoutePointAccepted = true;
let acceptedPointStillExposedAfterRawTailLimit = true;
let firstFrozenChunk = null;
let firstFrozenChunkStayedStable = true;

for (let pointIndex = 0; pointIndex < 1000; pointIndex += 1) {
  const result = recordingState.appendGpsPoint(
    longActiveWalk,
    gpsPoint(pointIndex * 0.00002, pointIndex, pointIndex)
  );

  everyLongRoutePointAccepted =
    everyLongRoutePointAccepted && result.acceptedPoint !== null;

  if (pointIndex >= recordingState.ACTIVE_RAW_POINT_LIMIT) {
    acceptedPointStillExposedAfterRawTailLimit =
      acceptedPointStillExposedAfterRawTailLimit &&
      result.acceptedPoint?.pointIndex === pointIndex;
  }

  longActiveWalk = result.walk;

  if (!firstFrozenChunk && longActiveWalk.routeChunks[0]?.isFrozen) {
    firstFrozenChunk = longActiveWalk.routeChunks[0];
  }

  if (
    firstFrozenChunk &&
    longActiveWalk.routeChunks[0] !== firstFrozenChunk
  ) {
    firstFrozenChunkStayedStable = false;
  }
}

assert(
  everyLongRoutePointAccepted &&
    acceptedPointStillExposedAfterRawTailLimit &&
    longActiveWalk.acceptedGpsPointCount === 1000 &&
    longActiveWalk.points.length === recordingState.ACTIVE_RAW_POINT_LIMIT &&
    longActiveWalk.points[0].pointIndex === 700 &&
    longActiveWalk.points.at(-1).pointIndex === 999,
  "accepted GPS points remain persistable after the 300-point raw-state tail fills"
);

const continuousChunkBoundaries = longActiveWalk.routeChunks
  .slice(1)
  .every(
    (chunk, index) =>
      longActiveWalk.routeChunks[index].points.at(-1).pointIndex ===
      chunk.points[0].pointIndex
  );
assert(
  longActiveWalk.routeChunks.length === 4 &&
    longActiveWalk.routeChunks[0].points[0].pointIndex === 0 &&
    longActiveWalk.routeChunks.at(-1).points.at(-1).pointIndex === 999 &&
    longActiveWalk.routeChunks.every(
      (chunk) =>
        chunk.rawPointCount <= liveRoute.LIVE_ROUTE_MAX_RAW_VERTICES
    ) &&
    continuousChunkBoundaries &&
    firstFrozenChunkStayedStable,
  "a 1,000-point live route stays complete, bounded by chunk, stable, and seam-free"
);

const canonicalPoints = [
  gpsPoint(0, 0, 0),
  gpsPoint(0.00002, 1, 5),
  gpsPoint(0.00004, 2, 10)
];
const emptyPersistedWalk = recordingState.createActiveWalk(
  "walk",
  1003,
  "2026-01-01T12:00:00.000Z"
);
const skippedInitialPointWalk = recordingState.appendPersistedGpsPoint(
  emptyPersistedWalk,
  canonicalPoints[1]
);
let orderedPersistedWalk = recordingState.appendPersistedGpsPoint(
  emptyPersistedWalk,
  canonicalPoints[0]
);
const skippedMiddlePointWalk = recordingState.appendPersistedGpsPoint(
  orderedPersistedWalk,
  canonicalPoints[2]
);
orderedPersistedWalk = recordingState.appendPersistedGpsPoint(
  orderedPersistedWalk,
  canonicalPoints[1]
);
orderedPersistedWalk = recordingState.appendPersistedGpsPoint(
  orderedPersistedWalk,
  canonicalPoints[2]
);
assert(
  skippedInitialPointWalk === emptyPersistedWalk &&
    skippedMiddlePointWalk.acceptedGpsPointCount === 1 &&
    orderedPersistedWalk.acceptedGpsPointCount === 3 &&
    orderedPersistedWalk.points
      .map((point) => point.pointIndex)
      .join(",") === "0,1,2",
  "canonical live drawing waits for missing database indexes before advancing"
);

let outageWalk = recordingState.createActiveWalk(
  "walk",
  1002,
  "2026-01-01T12:00:00.000Z"
);
let everyOutagePointAccepted = true;
const outagePoints = [
  gpsPoint(0, 0, 0),
  gpsPoint(0.00002, 1, 1),
  gpsPoint(0.001, 2, 61),
  gpsPoint(0.00102, 3, 62)
];

for (const point of outagePoints) {
  const result = recordingState.appendGpsPoint(outageWalk, point);
  everyOutagePointAccepted =
    everyOutagePointAccepted && result.acceptedPoint !== null;
  outageWalk = result.walk;
}

const preOutageChunk = outageWalk.routeChunks[0];
const postOutageChunk = outageWalk.routeChunks[1];
const confirmedOutageCellIds = new Set([
  ...explorationArea.collectExploredCellIdsForPath(
    [outagePoints[0], outagePoints[1]],
    "walk"
  ),
  ...explorationArea.collectExploredCellIdsForPath(
    [outagePoints[2], outagePoints[3]],
    "walk"
  )
]);
const outageBridgeOnlyCellIds = explorationArea
  .collectExploredCellIdsByRouteSegments([
    {
      points: [outagePoints[1], outagePoints[2]],
      type: "confirmed"
    }
  ])
  .gps.filter((cellId) => !confirmedOutageCellIds.has(cellId));
assert(
  everyOutagePointAccepted &&
    outageWalk.acceptedGpsPointCount === 4 &&
    outageWalk.routeChunks.length === 2 &&
    preOutageChunk.isFrozen &&
    preOutageChunk.points[0].pointIndex === 0 &&
    preOutageChunk.points.at(-1).pointIndex === 1 &&
    postOutageChunk.points[0].pointIndex === 2 &&
    postOutageChunk.points.at(-1).pointIndex === 3,
  "location recovery preserves the old route without a fake outage diagonal"
);
assert(
  outageBridgeOnlyCellIds.length > 0 &&
    outageBridgeOnlyCellIds.every(
      (cellId) => !outageWalk.exploredCellIds.includes(cellId)
    ),
  "location recovery leaves the unexplored outage corridor empty"
);

const fragmentedOuterRing = zoneCompletion.assembleWaysIntoRings([
  [{ latitude: 0, longitude: 1 }, { latitude: 1, longitude: 1 }],
  [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }],
  [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }],
  [{ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 0 }]
]);
assert(
  fragmentedOuterRing.rings.length === 1 &&
    fragmentedOuterRing.unclosedWayCount === 0 &&
    fragmentedOuterRing.rings[0].length === 5,
  "zone V2 assembles reversed and unordered OSM way fragments into a closed ring"
);
const multipleOuterRings = zoneCompletion.assembleWaysIntoRings([
  [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 1 }, { latitude: 1, longitude: 0 }, { latitude: 0, longitude: 0 }],
  [{ latitude: 2, longitude: 2 }, { latitude: 2, longitude: 3 }, { latitude: 3, longitude: 3 }, { latitude: 3, longitude: 2 }, { latitude: 2, longitude: 2 }]
]);
assert(
  multipleOuterRings.rings.length === 2 && multipleOuterRings.unclosedWayCount === 0,
  "zone V2 retains every closed outer component in a complex multipolygon"
);
const malformedOuterRing = zoneCompletion.assembleWaysIntoRings([
  [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }],
  [{ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 0 }]
]);
assert(
  malformedOuterRing.rings.length === 0 && malformedOuterRing.unclosedWayCount === 2,
  "zone V2 rejects incomplete multipolygon fragments for completion"
);
assert(
  zoneCompletion.isBoundaryRefreshStale(null) &&
    zoneCompletion.isBoundaryRefreshStale("2025-01-01T00:00:00.000Z", Date.parse("2025-02-01T00:00:00.000Z")) &&
    !zoneCompletion.isBoundaryRefreshStale("2025-01-15T00:00:00.000Z", Date.parse("2025-02-01T00:00:00.000Z")),
  "zone V2 refreshes missing or 30-day-stale boundary caches"
);
const exactTestZone = {
  fetchedAt: "2025-01-01T00:00:00.000Z",
  geometry: multipleOuterRings.rings,
  holes: [],
  id: "relation/1",
  name: "Exact",
  parentZoneId: null,
  source: "openstreetmap",
  type: "district"
};
assert(
  zoneCompletion.isZoneCompletionEligible(exactTestZone) &&
    !zoneCompletion.isZoneCompletionEligible({
      ...exactTestZone,
      source: "openstreetmap_incomplete_fallback"
    }) &&
    zoneCompletion.getZoneGeometryFingerprint(exactTestZone) !==
      zoneCompletion.getZoneGeometryFingerprint({
        ...exactTestZone,
        holes: [[
          { latitude: 0.2, longitude: 0.2 },
          { latitude: 0.2, longitude: 0.3 },
          { latitude: 0.3, longitude: 0.3 },
          { latitude: 0.2, longitude: 0.2 }
        ]]
      }),
  "zone V2 separates display fallbacks from award geometry and fingerprints denominator inputs"
);
const mapScreenSource = fs.readFileSync(
  require.resolve("../src/screens/MapScreen.tsx"),
  "utf8"
);
const explorationMapSource = fs.readFileSync(
  require.resolve("../src/components/ExplorationMap.tsx"),
  "utf8"
);
const completionModalSource = fs.readFileSync(
  require.resolve("../src/components/CompletionModal.tsx"),
  "utf8"
);
const recordingRecoveryModalSource = fs.readFileSync(
  require.resolve("../src/components/RecordingRecoveryModal.tsx"),
  "utf8"
);

const zoneCompletionSource = fs.readFileSync(
  require.resolve("../src/services/zoneCompletion.ts"),
  "utf8"
);
const locationHookSource = fs.readFileSync(
  require.resolve("../src/hooks/useReliableForegroundLocation.ts"),
  "utf8"
);
const locationServiceSource = fs.readFileSync(
  require.resolve("../src/services/locationService.ts"),
  "utf8"
);
const backgroundLocationTaskSource = fs.readFileSync(
  require.resolve("../src/services/backgroundLocationTask.ts"),
  "utf8"
);
const backgroundLocationOutboxSource = fs.readFileSync(
  require.resolve("../src/services/backgroundLocationOutbox.ts"),
  "utf8"
);
const databaseSource = fs.readFileSync(
  require.resolve("../src/database/db.ts"),
  "utf8"
);
const completionRepositorySource = fs.readFileSync(
  require.resolve("../src/database/completionRepository.ts"),
  "utf8"
);
const streetCompletionRepositorySource = fs.readFileSync(
  require.resolve("../src/database/streetCompletionRepository.ts"),
  "utf8"
);
const streetCompletionV2Source = fs.readFileSync(
  require.resolve("../src/services/streetCompletionV2.ts"),
  "utf8"
);
const streetCompletionPanelSource = fs.readFileSync(
  require.resolve("../src/components/StreetCompletionPanel.tsx"),
  "utf8"
);
const routeSnapshotSource = fs.readFileSync(
  require.resolve("../src/services/routeSnapshot.ts"),
  "utf8"
);
const recordingStateSource = fs.readFileSync(
  require.resolve("../src/services/recordingState.ts"),
  "utf8"
);
const walkRecorderSource = fs.readFileSync(
  require.resolve("../src/services/walkRecorder.ts"),
  "utf8"
);
const walkRepositorySource = fs.readFileSync(
  require.resolve("../src/database/walkRepository.ts"),
  "utf8"
);
const gpsObservationRepositorySource = fs.readFileSync(
  require.resolve("../src/database/gpsObservationRepository.ts"),
  "utf8"
);
const dataToolsSource = fs.readFileSync(
  require.resolve("../src/services/dataTools.ts"),
  "utf8"
);
const appSource = fs.readFileSync(require.resolve("../App.tsx"), "utf8");
const backupV5Source = fs.readFileSync(
  require.resolve("../src/services/backupV5.ts"),
  "utf8"
);
const backupV5FileSource = fs.readFileSync(
  require.resolve("../src/services/backupV5File.ts"),
  "utf8"
);
const walkControlsSource = fs.readFileSync(
  require.resolve("../src/components/WalkControls.tsx"),
  "utf8"
);
const walkHistorySource = fs.readFileSync(
  require.resolve("../src/components/WalkHistoryModal.tsx"),
  "utf8"
);
const medalEnclosureSource = fs.readFileSync(
  require.resolve("../src/services/medalEnclosure.ts"),
  "utf8"
);
const performanceSource = fs.readFileSync(
  require.resolve("../src/services/performance.ts"),
  "utf8"
);
const backupDataSource = walkRepositorySource.slice(
  walkRepositorySource.indexOf("export async function withBackupV5Snapshot"),
  walkRepositorySource.indexOf("export async function restoreBackupV5Data")
);
const refreshSavedDataSource = mapScreenSource.slice(
  mapScreenSource.indexOf("const refreshSavedData"),
  mapScreenSource.indexOf("const toggleLayer")
);
const handleLocationPointStart = mapScreenSource.indexOf(
  "const handleLocationPoint"
);
const handleLocationPointSource = mapScreenSource.slice(
  handleLocationPointStart,
  mapScreenSource.indexOf(
    "useReliableForegroundLocation({",
    handleLocationPointStart
  )
);
const stopWalkSource = mapScreenSource.slice(
  mapScreenSource.indexOf("const handleStopWalk"),
  mapScreenSource.indexOf("const handleRequestStopWalk")
);
const finishRecoverySource = mapScreenSource.slice(
  mapScreenSource.indexOf("const handleFinishRecoveredRecording"),
  mapScreenSource.indexOf("const handleDiscardRecoveredRecording")
);
const foregroundResumeSyncSource = mapScreenSource.slice(
  mapScreenSource.indexOf("const syncActiveWalkFromDatabase"),
  mapScreenSource.indexOf("const syncActiveWalkTailFromDatabase")
);
const tailSyncSource = mapScreenSource.slice(
  mapScreenSource.indexOf("const syncActiveWalkTailFromDatabase"),
  mapScreenSource.indexOf("const enableBackgroundTracking")
);
const activeRouteRenderStart = explorationMapSource.indexOf(
  "{activeRouteStartPoint"
);
const activeRouteRenderSource = explorationMapSource.slice(
  activeRouteRenderStart,
  explorationMapSource.indexOf("{playerLocation ?", activeRouteRenderStart)
);
const exploredAreaBuildSource = explorationMapSource.slice(
  explorationMapSource.indexOf("const renderedExplorationCellIds"),
  explorationMapSource.indexOf("const explorationOutlineSegments")
);

assert(
  refreshSavedDataSource.includes("getExploredCellKeys") &&
    !refreshSavedDataSource.includes("getAllWalksWithPoints") &&
    !refreshSavedDataSource.includes("createRouteSnapshot"),
  "normal startup reads the saved cell cache without loading or rebuilding route history"
);
assert(
  handleLocationPointSource.includes("persistAcceptedGpsPoint") &&
    handleLocationPointSource.includes("appendPersistedGpsPoint") &&
    handleLocationPointSource.includes("result.point") &&
    !handleLocationPointSource.includes("points.length"),
  "canonical persisted GPS points drive foreground drawing instead of optimistic array length"
);

const stopFinalizationIndex = stopWalkSource.indexOf(
  "finishPersistedActiveWalk"
);
const stopClearIndex = stopWalkSource.indexOf(
  "clearActiveRecordingSettings"
);
assert(
  stopFinalizationIndex >= 0 &&
    stopClearIndex > stopFinalizationIndex &&
    !stopWalkSource.includes("reprocessModeExploration") &&
    mapScreenSource.includes("onStop={handleRequestStopWalk}") &&
    mapScreenSource.includes("onConfirm={handleStopWalk}"),
  "Stop requires confirmation and clears recovery state only after durable finalization"
);

const immediateStopSummaryIndex = stopWalkSource.indexOf(
  "setRecordingSummary({"
);
const deferredExplorationIndex = stopWalkSource.indexOf(
  "persistRecordingExplorationDelta("
);
assert(
  immediateStopSummaryIndex > stopClearIndex &&
    deferredExplorationIndex > immediateStopSummaryIndex &&
    stopWalkSource.includes("void (async () => {") &&
    stopWalkSource.includes("hideExplorationDuringRefresh: false") &&
    stopWalkSource.includes("repairPendingCaches: false") &&
    refreshSavedDataSource.includes("repairPendingCaches?: boolean"),
  "Stop releases the UI after durable save while derived caches reconcile asynchronously"
);

assert(
  recordingRecoveryModalSource.includes("<MapView") &&
    recordingRecoveryModalSource.includes("<Polyline") &&
    recordingRecoveryModalSource.includes("buildPreviewPoints") &&
    recordingRecoveryModalSource.includes('finishRecommended = recoveryStatus !== "active"') &&
    recordingRecoveryModalSource.includes("onFinish(finishName.trim())") &&
    recordingRecoveryModalSource.includes("Alert.alert(strings.discardTitle") &&
    backgroundLocationTaskSource.includes("getBackgroundLocationRecoveryStatus") &&
    backgroundLocationTaskSource.includes("hasStartedLocationUpdatesAsync") &&
    mapScreenSource.includes("getBackgroundLocationRecoveryStatus()") &&
    finishRecoverySource.includes("displayName") &&
    walkRepositorySource.includes("input.displayName !== undefined"),
  "recovery V2 previews the full saved route, verifies runtime status, recommends a safe action, and names finalization atomically"
);

const recoveryFinalizationIndex = finishRecoverySource.indexOf(
  "finishPersistedActiveWalk"
);
const recoveryClearIndex = finishRecoverySource.lastIndexOf(
  "clearActiveRecordingSettings"
);
assert(
  recoveryFinalizationIndex >= 0 &&
    recoveryClearIndex > recoveryFinalizationIndex &&
    !finishRecoverySource.includes("reprocessModeExploration") &&
    mapScreenSource.includes(
      "routeChunks: buildLiveRouteChunks(points, session.activityMode)"
    ) &&
    mapScreenSource.includes(
      "points: points.slice(-ACTIVE_RAW_POINT_LIMIT)"
    ) &&
    !mapScreenSource.includes("RECOVERY_ROUTE_POINT_LIMIT"),
  "recovery rebuilds the complete chunked route while bounding only the raw point tail"
);
assert(
  recordingStateSource.includes("activeWalk.distanceMeters +") &&
    recordingStateSource.includes("haversineDistanceMeters") &&
    walkRepositorySource.includes("distance_meters = distance_meters + ?"),
  "recording distance advances incrementally in memory and persistent storage"
);
assert(
  walkRecorderSource.includes("queue.jobs.push(job)") &&
    walkRecorderSource.includes("export async function flushPendingGpsPoints") &&
    walkRecorderSource.includes("queue.jobs.splice(completedJobIndex, 1)") &&
    walkRecorderSource.includes("for (const pendingJob of queue.jobs)"),
  "GPS persistence removes jobs by identity, settles failures, and flushes before finalization"
);
assert(
  backgroundLocationTaskSource.includes(
    "persistDeliveredBackgroundLocationBatch"
  ) &&
    backgroundLocationOutboxSource.includes(
      "writeBackgroundLocationBatch(points, preferredSessionId)"
    ) &&
    backgroundLocationOutboxSource.includes(
      "temporaryFile.write(JSON.stringify(batch))"
    ) &&
    backgroundLocationOutboxSource.includes(
      "temporaryFile.rename(`${id}.json`)"
    ) &&
    backgroundLocationOutboxSource.includes(
      "recoverTemporaryBackgroundLocationBatches"
    ),
  "every delivered background batch is atomically published before database processing"
);
assert(
  backgroundLocationOutboxSource.includes(
    "getWalkSessionsIntersectingRange"
  ) &&
    backgroundLocationOutboxSource.includes(
      "selectSessionForPoint"
    ) &&
    backgroundLocationOutboxSource.includes(
      "replaceFinalizedWalkGpsPointsFromObservations"
    ) &&
    backgroundLocationTaskSource.includes(
      "getBackgroundTrackingSessionId()"
    ) &&
    backgroundLocationOutboxSource.includes(
      "allowUniqueSessionFallback"
    ) &&
    backgroundLocationOutboxSource.includes(
      "matchingSessions.length === 1"
    ),
  "queued batches route each point to its recording and late Stop events rebuild finalized routes"
);
assert(
  backgroundLocationTaskSource.includes(
    "inFlightBackgroundLocationHandlers"
  ) &&
    backgroundLocationTaskSource.includes(
      "waitForBackgroundLocationHandlers"
    ) &&
    backgroundLocationTaskSource.includes(
      "await waitForBackgroundLocationHandlers()"
    ) &&
    backgroundLocationTaskSource.includes(
      "left.timestamp - right.timestamp"
    ) &&
    backgroundLocationTaskSource.includes(
      "await drainPendingBackgroundLocationBatches()"
    ) &&
    backgroundLocationTaskSource.includes("} finally {"),
  "background shutdown drains entered handlers, the durable outbox, and each ordered native batch"
);
assert(
  walkRecorderSource.includes("GPS_PERSISTENCE_REORDER_WINDOW_MS") &&
    walkRecorderSource.includes("arrivalSequence") &&
    walkRecorderSource.includes("orderPersistenceJobs(queue.jobs)") &&
    walkRecorderSource.includes(
      "buildCanonicalGpsPoints"
    ) &&
    walkRecorderSource.includes(
      "replaceActiveWalkGpsPointsFromObservations"
    ) &&
    gpsObservationRepositorySource.includes(
      "saveActiveGpsObservation"
    ) &&
    gpsObservationRepositorySource.includes(
      "requiresRebuild"
    ) &&
    databaseSource.includes(
      "retain_order-independent_gps_observations"
    ) &&
    !foregroundResumeSyncSource.includes("flushPendingGpsPoints"),
  "raw observations make late GPS arrival order-independent while the bounded queue remains a fast path"
);
assert(
  backgroundLocationOutboxSource.includes(
    "ACTIVE_SESSION_PERSISTENCE_CHUNK_SIZE"
  ) &&
    backgroundLocationOutboxSource.includes("Promise.allSettled") &&
    walkRecorderSource.includes("GpsPersistenceSessionClosedError") &&
    backgroundLocationOutboxSource.includes(
      "currentSession.endedAt !== currentSession.startedAt"
    ),
  "large background backlogs apply backpressure and closed-session races pivot to finalized recovery"
);
assert(
  dataToolsSource.includes("closeBackgroundLocationOutboxAdmission") &&
    dataToolsSource.includes("closeGpsPersistenceAdmission") &&
    dataToolsSource.includes(
      "discardAllGpsPersistenceForDataReplacement"
    ) &&
    dataToolsSource.includes("await stopBackgroundLocationTracking()") &&
    dataToolsSource.indexOf("await restoreBackupV5Data(") <
      dataToolsSource.indexOf("await discardPendingBackgroundLocationBatches()") &&
    backgroundLocationOutboxSource.includes(
      "outboxAdmissionCloseDepth"
    ),
  "backup restore closes GPS admission, quiesces native tracking, and discards journals only after commit"
);
assert(
  backgroundLocationOutboxSource.includes("deferredPointCount") &&
    backgroundLocationOutboxSource.includes(
      "BACKGROUND_LOCATION_RECOVERY_GRACE_MS"
    ) &&
    databaseSource.includes("pending_recording_discards") &&
    walkRepositorySource.includes(
      "purgeExpiredUnderfilledRecordings"
    ) &&
    gpsObservationRepositorySource.includes(
      "promoteRecoveredFinalizedRecording"
    ),
  "ownerless and underfilled late GPS remains recoverable for a bounded durable grace window"
);
assert(
  walkRepositorySource.includes("withExclusiveTransactionAsync") &&
    backupDataSource.includes(
      "app_settings.key = 'active_recording_session_id'"
    ) &&
    backupDataSource.includes("WHERE ended_at > started_at") &&
    !backupDataSource.includes("sessionRows.some") &&
    walkRepositorySource.includes(
      "An active recording cannot be included in a backup"
    ) &&
    dataToolsSource.includes(
      "Finish or discard the active recording before exporting a backup"
    ),
  "backup export rejects the authoritative active recording, ignores orphan unfinished rows, and reads one consistent database snapshot"
);
assert(
  dataToolsSource.includes("new File(") &&
    dataToolsSource.includes("Paths.cache") &&
    dataToolsSource.includes("verifyExternallySavedBackup") &&
    dataToolsSource.includes("inspectBackupV5File(selected, expectedBackupId)") &&
    dataToolsSource.includes('new BackupExportError("write", error)') &&
    dataToolsSource.includes('new BackupExportError("share", error)') &&
    dataToolsSource.includes('new BackupExportError("verify", error)') &&
    !dataToolsSource.includes('from "expo-file-system/legacy"') &&
    dataToolsSource.includes("parsed.version !== 4") &&
    backupV5Source.includes("BACKUP_V5_HOT_SESSION_COUNT = 20") &&
    backupV5Source.includes("encodePointPositionRuns") &&
    backupV5FileSource.includes("handle.writeBytes") &&
    backupV5FileSource.includes("assertBackupV5Footer") &&
    walkRepositorySource.includes(
      "WHERE session_id = walk_sessions.id"
    ) &&
    !walkRepositorySource.includes(
      "A recently stopped recording is still accepting late GPS fixes."
    ),
  "Backup V5 exports visible finalized recordings in bounded verified blocks and preserves lossless route snapshots"
);
assert(
  mapScreenSource.includes("dataOperationRef.current !== null") &&
    mapScreenSource.includes('beginDataOperation("backup")') &&
    mapScreenSource.includes('beginDataOperation("restore")') &&
    mapScreenSource.includes("await waitForMapRenderCommit()") &&
    mapScreenSource.includes('finishDataOperation("backup")') &&
    mapScreenSource.includes('finishDataOperation("restore")') &&
    walkHistorySource.includes('dataOperation === "backup"') &&
    walkHistorySource.includes('dataOperation === "restore"') &&
    walkHistorySource.includes("<ActivityIndicator") &&
    walkHistorySource.includes("dataOperationHint") &&
    walkHistorySource.includes("disabled={dataOperation !== null}"),
  "backup, conversion, and restore are single-flight operations with immediate busy feedback"
);
assert(
  explorationMapSource.includes(
    "memo(function ExplorationMap"
  ) &&
    mapScreenSource.includes("onLoadWalkDetails") &&
    mapScreenSource.includes("loadDetailedWalk(sessionId)") &&
    mapScreenSource.includes("{historyVisible ? <WalkHistoryModal") &&
    mapScreenSource.includes("{completionVisible ? <CompletionModal") &&
    mapScreenSource.includes("{medalsVisible ? <MedalCollectionModal") &&
    walkHistorySource.includes("<FlatList") &&
    walkHistorySource.includes("removeClippedSubviews") &&
    !mapScreenSource.includes("if (!historyVisible)"),
  "hidden menus unmount, History virtualizes rows, and details remain lazy"
);
assert(
  !mapScreenSource.includes("setElapsedSeconds") &&
    walkControlsSource.includes("setInterval(updateDuration, 1000)") &&
    mapScreenSource.includes("setInterval(synchronizeTail, 3000)") &&
    tailSyncSource.indexOf("if (persistedPoints.length === 0)") <
      tailSyncSource.indexOf("const session = await getWalkSessionById(sessionId)") &&
    explorationMapSource.includes("useCoalescedValue(") &&
    explorationMapSource.includes("latestValueRef.current") &&
    explorationMapSource.includes("timerRef.current") &&
    explorationMapSource.includes("settledActiveExplorationCellIds") &&
    explorationMapSource.includes("settledTodayNewCellIds") &&
    explorationMapSource.includes("memo(function ExplorationSurfaceOverlay") &&
    medalEnclosureSource.includes("getMedalsInsideBoundaryBounds") &&
    medalEnclosureSource.includes("medals.anchor-gated-enclosure") &&
    mapScreenSource.includes("}, 650);") &&
    performanceSource.includes("usePerformanceRenderCounter") &&
    performanceSource.includes("[performance]"),
  "map timers, polling, non-starving surfaces, medals, and render diagnostics use bounded performance paths"
);
assert(
  databaseSource.includes('applyMigration(21, "add_exploration_query_indexes"') &&
    databaseSource.includes("explored_cells_coordinate_cover_index") &&
    completionRepositorySource.includes("WITH loop_summary AS") &&
    completionRepositorySource.includes("cell_summary AS") &&
    !completionRepositorySource.includes("COUNT(DISTINCT cell_x || ':' || cell_y)") &&
    !completionRepositorySource.includes("date(current_sessions.started_at)") &&
    walkRepositorySource.includes("export type WalkPointLoadScope") &&
    walkRepositorySource.includes("${scopeSql}") &&
    walkRepositorySource.indexOf("const placeholders = sessionIds") >
      walkRepositorySource.indexOf("withBackupV5Snapshot") &&
    mapScreenSource.includes("getWalkPointLoadScope") &&
    appSource.indexOf("setDatabaseReady(true)") <
      appSource.indexOf("void drainPendingBackgroundLocationBatches()") &&
    mapScreenSource.includes("await drainPendingBackgroundLocationBatches()"),
  "startup, scoped paths, database indexes, and aggregate queries avoid unnecessary blocking work"
);
assert(
  mapScreenSource.includes("const focusSavedWalkOnMap") &&
    mapScreenSource.includes('setPathDisplayMode("selected")') &&
    mapScreenSource.includes("{ ...current, showPaths: true }") &&
    mapScreenSource.includes("onSelectWalk={focusSavedWalkOnMap}") &&
    mapScreenSource.includes("doesWalkOverlapToday") &&
    mapScreenSource.includes("endedAfter: todayStart.toISOString()") &&
    walkRepositorySource.includes(
      "walk_sessions.ended_at > ? AND walk_sessions.started_at < ?"
    ),
  "Focus on map reveals the selected route and Today includes midnight-overlap walks"
);assert(
  databaseSource.includes('applyMigration(22, "add_zone_completion_v2"') &&
    databaseSource.includes("CREATE TABLE IF NOT EXISTS zone_achievements") &&
    databaseSource.includes("CREATE TABLE IF NOT EXISTS zone_refresh_state") &&
    completionRepositorySource.includes("INSERT OR IGNORE INTO zone_achievements") &&
    completionRepositorySource.includes("geometry_fingerprint = ?") &&
    completionModalSource.includes("isBoundaryRefreshStale") &&
    completionModalSource.includes("achievementRollup.district") &&
    zoneCompletionSource.includes('"invalid_boundary"') &&
    walkRepositorySource.includes("zoneAchievements: ZoneAchievement[]") &&
    dataToolsSource.includes("parsed.version !== 4"),
  "zone V2 persists permanent rollups, refresh state, geometry-bound denominators, and Backup V5"
);
assert(
  databaseSource.includes('applyMigration(25, "cache_zone_completion_snapshots"') &&
    databaseSource.includes("CREATE TABLE IF NOT EXISTS exploration_revisions") &&
    databaseSource.includes("explored_cells_revision_after_insert") &&
    databaseSource.includes("explored_cells_revision_after_delete") &&
    databaseSource.includes("CREATE TABLE IF NOT EXISTS zone_completion_snapshots") &&
    completionRepositorySource.includes("getExplorationRevision") &&
    completionRepositorySource.includes("getZoneCompletionSnapshot") &&
    completionRepositorySource.includes("saveZoneCompletionSnapshot") &&
    completionRepositorySource.includes(
      "DELETE FROM zone_completion_snapshots WHERE zone_id = ?"
    ) &&
    mapScreenSource.includes("objectiveStatsCacheRef") &&
    mapScreenSource.includes("objectiveScopePairRef") &&
    mapScreenSource.includes("const durableSnapshots = await Promise.all") &&
    mapScreenSource.includes("const calculationResults = await Promise.all") &&
    mapScreenSource.includes("isCalculating && !stats"),
  "objective scope switching restores valid memory/SQLite snapshots and precomputes paired city/district stats"
);
assert(
  databaseSource.includes('applyMigration(24, "add_street_completion_v2"') &&
    databaseSource.includes("street_completion_v1_evidence") &&
    databaseSource.includes("street_completion_session_coverage") &&
    databaseSource.includes("street_completion_segments") &&
    streetCompletionRepositorySource.includes("covered_bins_json") &&
    streetCompletionRepositorySource.includes("walked_distance_m >= total_distance_m * 0.9") &&
    streetCompletionRepositorySource.includes("street_totals AS") &&
    !streetCompletionRepositorySource.includes("const completed = await") &&
    streetCompletionRepositorySource.includes("active_recording_session_id") &&
    streetCompletionV2Source.includes("walk.routeSegments") &&
    streetCompletionV2Source.includes("markStreetCompletionPending") &&
    streetCompletionV2Source.includes("yieldToEventLoop") &&
    mapScreenSource.includes("Automatic Street Completion V2 rebuild failed") &&
    mapScreenSource.includes("deferred street completion failed") &&
    completionModalSource.includes("<StreetCompletionPanel") &&
    streetCompletionPanelSource.includes("summary.completedStreetCount") &&
    walkRepositorySource.includes("DELETE FROM street_completion_v1_evidence"),
  "street completion V2 persists frozen-route metre coverage and runs outside active recording"
);
assert(
  databaseSource.includes('applyMigration(23, "add_street_topology_metadata"') &&
    databaseSource.includes("DELETE FROM osm_street_segments") &&
    routeSnapshotSource.includes("ROUTE_SNAPSHOT_ALGORITHM_VERSION = 4") &&
    routeSnapshotSource.includes("refreshSuspiciousGapTopology") &&
    routeSnapshotSource.includes("inferredCellCount: collectExploredCellIdsForPath") &&
    walkRepositorySource.includes("isRouteBridgeEvidence") &&
    walkHistorySource.includes("strings.history.bridgeSummary") &&
    walkHistorySource.includes("formatBridgeEvidence"),
  "path inference V3 persists safe topology metadata and reviewable bridge evidence"
);assert(
  completionModalSource.includes("InteractionManager.runAfterInteractions") &&
    completionModalSource.includes("abortController.abort()") &&
    zoneCompletionSource.includes("COMPLETION_SCAN_YIELD_INTERVAL") &&
    zoneCompletionSource.includes("await yieldToEventLoop()"),
  "completion zone scans yield to navigation and cancel when the menu closes"
);
assert(
  mapScreenSource.includes("activeObjectiveCellIds") &&
    mapScreenSource.includes("collectFillableEnclosedExplorationCellIds(") &&
    mapScreenSource.includes("activeObjectiveFillCellKey") &&
    mapScreenSource.includes("objectiveClosureRevision") &&
    mapScreenSource.includes("hasNewEnclosedCell") &&
    mapScreenSource.includes(
      "[loopFillCellIds, objective, objectiveClosureRevision, walks]"
    ) &&
    !mapScreenSource.includes("activeObjectiveCellKey") &&
    mapScreenSource.includes("mergeActiveExplorationCells(") &&
    mapScreenSource.includes("{ persistAchievement: !usesLivePreview }") &&
    mapScreenSource.includes(
      "objectiveStatsRequestRef.current += 1;\n            setObjectiveStats(objectiveAfter)"
    ) &&
    zoneCompletionSource.includes("options.persistAchievement !== false"),
  "district objective progress refreshes on new live closures and Stop without recalculating for open-line cells"
);
assert(
  routeSnapshotSource.includes("getRouteSnapshot(sessionId)") &&
    routeSnapshotSource.includes("return existingRouteSegments") &&
    walkRepositorySource.includes(
      "expectedSourceMaxPointId"
    ) &&
    walkRepositorySource.includes(
      "route_snapshots.source_max_point_id ="
    ) &&
    walkRepositorySource.includes(
      "OR source_max_point_id <>"
    ) &&
    completionRepositorySource.includes(
      "JOIN route_snapshots"
    ) &&
    databaseSource.includes(
      "track_route_snapshot_gps_generation"
    ),
  "create-if-missing replaces stale frozen routes and validates their exact GPS generation"
);
assert(
  routeSnapshotSource.includes("const hasSuspiciousGap") &&
    routeSnapshotSource.includes('segment.type === "rejected"') &&
    routeSnapshotSource.includes("createConfirmedRouteSnapshotIfMissing("),
  "continuous finalized routes skip unnecessary street-corridor inference"
);
assert(
  databaseSource.includes("track_pending_recording_repairs") &&
    walkRepositorySource.includes(
      "INSERT INTO pending_recording_repairs"
    ) &&
    mapScreenSource.includes("repairPendingRecordingCaches") &&
    mapScreenSource.includes("clearPendingRecordingRepair"),
  "finalized recordings retain a durable repair marker until route and exploration caches exist"
);
assert(
  completionRepositorySource.includes(
    "commitPendingRecordingRepair"
  ) &&
    completionRepositorySource.includes(
      "walk_sessions.ended_at > walk_sessions.started_at"
    ) &&
    completionRepositorySource.includes(
      "DELETE FROM pending_recording_repairs WHERE session_id = ?"
    ) &&
    completionRepositorySource.includes(
      "input.expectedSourceMaxPointId"
    ) &&
    completionRepositorySource.includes(
      "JSON.stringify(input.expectedRouteSegments)"
    ) &&
    mapScreenSource.includes("commitPendingRecordingRepair({") &&
    mapScreenSource.includes(
      "expectedSourcePointCount: sourceGeneration.sourcePointCount"
    ) &&
    !mapScreenSource.includes("await saveExploredCells(["),
  "repair cells and their marker commit atomically against deletion, route replacement, or GPS generation changes"
);
assert(
  walkRepositorySource.includes(
    "DELETE FROM explored_cells WHERE session_id = ?"
  ) &&
    walkRepositorySource.includes(
      "DELETE FROM loop_fills WHERE session_id = ?"
    ) &&
    walkRepositorySource.includes(
      "DELETE FROM pending_recording_repairs WHERE session_id = ?"
    ) &&
    !mapScreenSource.includes("deleteExploredCellsForSession"),
  "recording deletion removes every session-owned row in one repository transaction"
);
assert(
  mapScreenSource.includes("acceptedGpsPointCount: points.reduce(") &&
    mapScreenSource.includes(
      "restoreRecoverableRecordingProtection(recordingToResume)"
    ) &&
    mapScreenSource.includes(
      "restoreRecoverableRecordingProtection(recordingToFinish)"
    ) &&
    mapScreenSource.includes(
      "restoreRecoverableRecordingProtection(recordingToDiscard)"
    ),
  "long-session synchronization is bounded and failed recovery actions restore recording protection"
);
assert(
  mapScreenSource.includes("useReliableForegroundLocation({") &&
    mapScreenSource.includes(
      'enabled: permissionState === "granted" && isAppActive'
    ) &&
    mapScreenSource.includes(
      'permissionState !== "granted" || initialLocationResolved'
    ) &&
    locationHookSource.includes(
      "locationResolution.enabled && locationResolution.resolved"
    ),
  "launch resolves and centers an enabled current-location lifecycle before dismissing"
);
assert(
  locationHookSource.includes("RETRY_DELAYS_MS") &&
    locationHookSource.includes("onError: failWatch") &&
    locationHookSource.includes("RECORDING_WATCHDOG_INTERVAL_MS") &&
    locationHookSource.includes("recording watchdog could not obtain a fresh GPS fix") &&
    locationServiceSource.includes("options.onError"),
  "foreground location errors retry with a recording watchdog instead of silently stopping"
);
assert(
  activeRouteRenderSource.includes("segments={activeRouteChunks}") &&
    !activeRouteRenderSource.includes("shouldShowRoutes") &&
    !activeRouteRenderSource.includes('renderLevel === "close"') &&
    mapScreenSource.includes("playerVisible={isLaunchDismissed}") &&
    mapScreenSource.includes("getSavedPlayerLocation") &&
    mapScreenSource.includes("savePlayerLocation") &&
    mapScreenSource.includes("playerLocationPersistenceCandidate") &&
    explorationMapSource.includes("pendingPlayerFocusTimestampRef") &&
    explorationMapSource.includes(
      "activeRouteEndPoint ?? currentLocation"
    ) &&
    explorationMapSource.includes("persistentPlayerLocationRef") &&
    explorationMapSource.includes("shouldAdoptPlayerLocation") &&
    explorationMapSource.includes("PlayerLocationMarker") &&
    explorationMapSource.includes('identifier="street-explorer-player"') &&
    explorationMapSource.includes("coordinate={pointToCoordinate(location)}") &&
    explorationMapSource.includes("tracksViewChanges") &&
    explorationMapSource.includes("collapsable={false}") &&
    explorationMapSource.includes("onPanDrag={handleMapPan}") &&
    explorationMapSource.includes("showsUserLocation={false}") &&
    explorationMapSource.includes("PLAYER_MOTION_FRESHNESS_MS") &&
    explorationMapSource.includes("isSubstantiallyMoreAccurate") &&
    explorationMapSource.includes("PLAYER_SPRITES") &&
    explorationMapSource.includes("PLAYER_SPRITE_LAYERS.map") &&
    explorationMapSource.includes("source={frame.source}") &&
    explorationMapSource.includes("styles.playerSpriteImage") &&
    explorationMapSource.includes("PLAYER_WALK_FRAME_INTERVAL_MS = 170") &&
    explorationMapSource.includes("getPlayerDirection") &&
    explorationMapSource.includes("getPlayerHeading") &&
    explorationMapSource.includes("opacity: frame.source === visibleSpriteSource ? 1 : 0") &&
    !explorationMapSource.includes("pointForCoordinate") &&
    !explorationMapSource.includes("schedulePlayerProjection") &&
    !explorationMapSource.includes("playerScreenPoint") &&
    !explorationMapSource.includes("animateCamera") &&
    !explorationMapSource.includes("isAutoFollowEnabled") &&
    !explorationMapSource.includes("isMapMoving") &&
    !explorationMapSource.includes("Marker.Animated") &&
    !explorationMapSource.includes("new AnimatedRegion") &&
    !explorationMapSource.includes("image={") &&
    !explorationMapSource.includes("PLAYER_NATIVE_FRAMES") &&
    (explorationMapSource.match(/identifier="street-explorer-player"/g) ?? []).length === 1,
  "the complete live route and single native animated player marker survive recovery, recording transitions, stale GPS, and MapKit redraws"
);
assert(
  foregroundResumeSyncSource.includes("const points = persistedPoints") &&
    !foregroundResumeSyncSource.includes("mergeSynchronizedGpsPoints") &&
    mapScreenSource.includes(
      "acknowledgeGpsPersistenceFullSyncRequest("
    ) &&
    mapScreenSource.includes(
      "fullSyncGeneration"
    ) &&
    mapScreenSource.includes("history={history}") &&
    mapScreenSource.includes("sessions={history}") &&
    mapScreenSource.includes(
      "subscribeToFinalizedBackgroundLocationChanges"
    ) &&
    mapScreenSource.includes(
      "Failed to refresh a late finalized GPS merge"
    ) &&
    mapScreenSource.includes('name: "confirmQuit"') &&
    mapScreenSource.includes("onLongPress={confirmQuit}") &&
    mapScreenSource.includes("} finally {") &&
    mapScreenSource.includes(
      "A failed cache refresh must never leave already valid exploration hidden"
    ),
  "canonical full sync, history totals, accessible Stop, and exploration refresh recovery remain wired"
);
assert(
  exploredAreaBuildSource.includes("settledActiveExplorationCellIds") &&
    exploredAreaBuildSource.includes("maxFilledHoleAreaSquareMeters"),
  "live and saved explored cells share one hole-filled surface without visual seams"
);
const largeSolidCells = rectangle(250, 200);
const startedAt = Date.now();
const largeSolid = explorationArea.buildMergedExplorationPolygons(largeSolidCells);
const elapsedMs = Date.now() - startedAt;
assert(
  largeSolid.length === 1 && largeSolid[0].coordinates.length === 4,
  "50,000 adjacent cells collapse to one four-corner native polygon"
);
console.log("Geometry benchmark: " + elapsedMs + "ms");
