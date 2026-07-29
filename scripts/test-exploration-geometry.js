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
const liveRoute = require("../src/services/liveRoute.ts");
const recordingState = require("../src/services/recordingState.ts");
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
    dataToolsSource.indexOf("await restoreBackupData(backup)") <
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
    walkRepositorySource.includes(
      "An active recording cannot be included in a backup"
    ) &&
    dataToolsSource.includes(
      "Finish or discard the active recording before exporting a backup"
    ),
  "backup export rejects active recordings and reads one consistent database snapshot"
);
assert(
  dataToolsSource.includes('from "expo-file-system/legacy"') &&
    dataToolsSource.includes("writeAsStringAsync") &&
    dataToolsSource.includes("parsed.version >= 2") &&
    walkRepositorySource.includes(
      "WHERE session_id = walk_sessions.id"
    ) &&
    !walkRepositorySource.includes(
      "A recently stopped recording is still accepting late GPS fixes."
    ),
  "backup exports visible finalized recordings asynchronously and preserves V2/V3 route snapshots"
);
assert(
  explorationMapSource.includes(
    "memo(function ExplorationMap"
  ) &&
    mapScreenSource.includes("onLoadWalkDetails") &&
    mapScreenSource.includes("loadDetailedWalk(sessionId)") &&
    !mapScreenSource.includes("if (!historyVisible)"),
  "menu visibility changes avoid full map reconciliation and History loads route details on demand"
);
assert(
  completionModalSource.includes("InteractionManager.runAfterInteractions") &&
    completionModalSource.includes("abortController.abort()") &&
    zoneCompletionSource.includes("COMPLETION_SCAN_YIELD_INTERVAL") &&
    zoneCompletionSource.includes("await yieldToEventLoop()"),
  "completion zone scans yield to navigation and cancel when the menu closes"
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
    explorationMapSource.includes("{playerLocation ? (") &&
    explorationMapSource.includes(
      "activeRouteEndPoint ?? currentLocation"
    ) &&
    explorationMapSource.includes(
      "const followTarget = activeRouteEndPoint"
    ) &&
    explorationMapSource.includes(
      "tracksViewChanges={isMoving || !isMarkerImageLoaded}"
    ) &&
    explorationMapSource.includes("PLAYER_MOTION_FRESHNESS_MS") &&
    explorationMapSource.includes("isSubstantiallyMoreAccurate") &&
    explorationMapSource.includes(
      "onLoad={() => setIsMarkerImageLoaded(true)}"
    ),
  "the complete live route and accepted player location survive recovery while stale marker motion settles"
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
  exploredAreaBuildSource.includes("activeExplorationCellIds") &&
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
