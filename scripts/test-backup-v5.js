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
  BACKUP_V5_ARCHIVE_POINT_LIMIT,
  BACKUP_V5_HOT_SESSION_COUNT,
  BACKUP_V5_RECORD_HEADER_BYTES,
  BACKUP_V5_RECORD_KIND,
  assertBackupV5Manifest,
  buildBackupV5BlockPlans,
  createBackupV5BlockPayload,
  createBackupV5Manifest,
  decodeBackupV5BlockPayload,
  decodeBackupV5RecordHeader,
  decodeBackupV5RecordPayload,
  encodeBackupV5Record
} = require("../src/services/backupV5.ts");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS " + message);
}

function session(id, pointCount, month = 0) {
  const startedAt = new Date(Date.UTC(2026, month, id, 8, 0, 0)).toISOString();
  const endedAt = new Date(Date.UTC(2026, month, id, 9, 0, 0)).toISOString();

  return {
    activityMode: "walk",
    displayName: "Walk " + id,
    distanceMeters: id * 100,
    durationSeconds: 3600,
    endedAt,
    id,
    pointCount,
    startedAt,
    stepCount: id * 1000
  };
}

function point(sessionId, pointIndex) {
  return {
    accuracy: 4 + (pointIndex % 3),
    id: sessionId * 100000 + pointIndex + 1,
    latitude: 45.75 + pointIndex * 0.00001,
    longitude: 4.8 + pointIndex * 0.00001,
    pointIndex,
    sessionId,
    timestamp: new Date(Date.UTC(2026, 0, 1, 8, 0, pointIndex)).toISOString()
  };
}

function routeEvidence() {
  return {
    acceptanceReason: "exact_topology",
    endSnapDistanceMeters: 2,
    endpointJoinCount: 1,
    gapDistanceMeters: 30,
    gapDurationSeconds: 20,
    inferredCellCount: 2,
    intersectionJoinCount: 1,
    maxEndpointJoinDistanceMeters: 4,
    routeDistanceMeters: 34,
    schemaVersion: 1,
    sourceStreetSegmentCount: 2,
    startSnapDistanceMeters: 2,
    straightDistanceMeters: 28
  };
}

const groupedSessions = Array.from({ length: 25 }, (_, index) =>
  session(index + 1, 100)
);
const plans = buildBackupV5BlockPlans(groupedSessions);
const archivePlans = plans.filter((plan) => plan.kind === "archive");
const hotPlans = plans.filter((plan) => plan.kind === "hot");
const coveredIds = plans.flatMap((plan) => plan.sessionIds);

assert(
  hotPlans.length === BACKUP_V5_HOT_SESSION_COUNT,
  "the newest 20 sessions remain individual hot records"
);
assert(
  hotPlans.every((plan) => plan.sessionIds.length === 1),
  "hot records never merge logical walks"
);
assert(
  archivePlans.length === 1 && archivePlans[0].sessionIds.length === 5,
  "older walks are physically consolidated into a bounded archive block"
);
assert(
  coveredIds.length === groupedSessions.length &&
    new Set(coveredIds).size === groupedSessions.length &&
    groupedSessions.every((walk) => coveredIds.includes(walk.id)),
  "every logical session appears exactly once across archive plans"
);

const pointHeavySessions = [
  session(1, BACKUP_V5_ARCHIVE_POINT_LIMIT - 1),
  session(2, 2),
  ...Array.from({ length: 20 }, (_, index) => session(index + 3, 1))
];
const pointHeavyPlans = buildBackupV5BlockPlans(pointHeavySessions);
assert(
  pointHeavyPlans.filter((plan) => plan.kind === "archive").length === 2,
  "archive records split before their combined point budget is exceeded"
);

const rawPoints = Array.from({ length: 4000 }, (_, index) => point(1, index));
rawPoints[2000] = {
  ...rawPoints[2000],
  pointIndex: rawPoints[1999].pointIndex
};
const inferredPoint = {
  accuracy: 7,
  heading: 120,
  latitude: 45.79,
  longitude: 4.89,
  pointIndex: 4000,
  sessionId: 1,
  speedMetersPerSecond: 1.25,
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, 0, 0)).toISOString()
};
const sessionData = {
  points: rawPoints,
  routeSnapshot: {
    algorithmVersion: 5,
    createdAt: "2026-01-01T09:00:01.000Z",
    segments: [
      {
        points: rawPoints.slice(0, 2000),
        type: "confirmed"
      },
      {
        bridgeEvidence: routeEvidence(),
        confidence: "high",
        points: [inferredPoint, { ...inferredPoint, longitude: 4.891, pointIndex: 4001 }],
        type: "inferred"
      },
      {
        points: rawPoints.slice(2000),
        type: "confirmed"
      }
    ],
    sessionId: 1,
    sourceMaxPointId: rawPoints.at(-1).id,
    sourcePointCount: rawPoints.length
  },
  sessionId: 1
};
const blockPlan = {
  expectedPointCount: rawPoints.length,
  id: "hot-1",
  kind: "hot",
  label: "2026-01-01T08:00:00.000Z",
  sessionIds: [1]
};
const compactPayload = createBackupV5BlockPayload(blockPlan, [sessionData]);
const record = encodeBackupV5Record(
  BACKUP_V5_RECORD_KIND.hotBlock,
  compactPayload
);
const header = decodeBackupV5RecordHeader(
  record.bytes.slice(0, BACKUP_V5_RECORD_HEADER_BYTES)
);
const decodedPayload = decodeBackupV5RecordPayload(
  header,
  record.bytes.slice(BACKUP_V5_RECORD_HEADER_BYTES)
);
const restored = decodeBackupV5BlockPayload(decodedPayload, blockPlan)[0];

assert(
  JSON.stringify(restored.points) === JSON.stringify(rawPoints),
  "raw GPS points round-trip losslessly"
);
assert(
  JSON.stringify(restored.routeSnapshot) === JSON.stringify(sessionData.routeSnapshot),
  "confirmed references and inferred route geometry round-trip losslessly"
);

const duplicateV4Shape = JSON.stringify({
  points: rawPoints,
  routeSnapshots: [{ segments: [{ points: rawPoints, type: "confirmed" }] }]
});
assert(
  record.bytes.length < Buffer.byteLength(duplicateV4Shape) * 0.55,
  "compressed point references are materially smaller than duplicated V4 JSON"
);
assert(
  restored.points[2000].pointIndex === restored.points[1999].pointIndex,
  "legacy duplicate point indexes are preserved losslessly"
);

const corrupted = record.bytes.slice();
corrupted[corrupted.length - 20] ^= 0xff;
let rejectedCorruption = false;

try {
  const corruptedHeader = decodeBackupV5RecordHeader(
    corrupted.slice(0, BACKUP_V5_RECORD_HEADER_BYTES)
  );
  decodeBackupV5RecordPayload(
    corruptedHeader,
    corrupted.slice(BACKUP_V5_RECORD_HEADER_BYTES)
  );
} catch {
  rejectedCorruption = true;
}

assert(rejectedCorruption, "corrupted compressed records are rejected");

const manifest = createBackupV5Manifest({
  appVersion: "0.11.0",
  exportedAt: "2026-08-02T12:00:00.000Z",
  medalSystem: {
    acquisitionEvents: [],
    collectedMedals: [],
    retroScanSettings: []
  },
  sessions: groupedSessions,
  zoneAchievements: []
});
assertBackupV5Manifest(manifest);
assert(
  manifest.totals.sessionCount === 25 &&
    manifest.totals.pointCount === 2500 &&
    manifest.totals.archiveBlockCount === 1,
  "manifest totals describe logical sessions and physical archive blocks"
);

const expeditionManifest = createBackupV5Manifest({
  appVersion: "0.16.24",
  expeditionSystem: {
    expeditions: [{
      abandonedAt: null,
      acceptedAt: "2026-08-02T08:00:00.000Z",
      completedAt: "2026-08-02T09:00:00.000Z",
      districtId: "relation/9",
      districtName: "Test District",
      id: "expedition-1",
      kind: "close_loop",
      localDate: "2026-08-02",
      progress: 1,
      slot: 1,
      target: 1,
      updatedAt: "2026-08-02T09:00:00.000Z"
    }],
    loopEvidence: [{
      detectedAt: "2026-08-02T08:30:00.000Z",
      expeditionId: "expedition-1",
      sessionId: 1
    }],
    seals: [{
      districtId: "relation/9",
      districtName: "Test District",
      earnedAt: "2026-08-02T09:00:00.000Z",
      expeditionId: "expedition-1",
      id: "seal-expedition-1",
      kind: "close_loop",
      localDate: "2026-08-02"
    }]
  },
  exportedAt: "2026-08-02T12:00:00.000Z",
  medalSystem: {
    acquisitionEvents: [],
    collectedMedals: [],
    retroScanSettings: []
  },
  sessions: groupedSessions,
  zoneAchievements: []
});
assertBackupV5Manifest(expeditionManifest);
assert(
  expeditionManifest.expeditionSystem.seals.length === 1,
  "V5 manifests preserve district expedition choices, loop evidence, and seals"
);

let rejectedOrphanedExpeditionEvidence = false;
try {
  assertBackupV5Manifest({
    ...expeditionManifest,
    expeditionSystem: {
      ...expeditionManifest.expeditionSystem,
      loopEvidence: [{
        detectedAt: "2026-08-02T08:30:00.000Z",
        expeditionId: "expedition-1",
        sessionId: 99999
      }]
    }
  });
} catch {
  rejectedOrphanedExpeditionEvidence = true;
}
assert(
  rejectedOrphanedExpeditionEvidence,
  "V5 validation rejects expedition evidence for a missing walk"
);

console.log("Backup V5 regression checks passed.");

