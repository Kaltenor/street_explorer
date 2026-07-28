import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type DimensionValue,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Region } from "react-native-maps";

import { APP_VERSION } from "../constants/config";
import { CompletionModal, CompletionObjective } from "../components/CompletionModal";
import { ExplorationMap } from "../components/ExplorationMap";
import { LaunchLoadingOverlay } from "../components/LaunchLoadingOverlay";
import { MapLegend } from "../components/MapLegend";
import { ModeProfilePanel } from "../components/ModeProfilePanel";
import {
  BackgroundTrackingStatus,
  RecordingHealthPanel
} from "../components/RecordingHealthPanel";
import { RecordingDiagnosticsPanel } from "../components/RecordingDiagnosticsPanel";
import { RecordingDiagnosticsModal } from "../components/RecordingDiagnosticsModal";
import {
  RecoverableRecording,
  RecordingRecoveryModal
} from "../components/RecordingRecoveryModal";
import { StatsPanel } from "../components/StatsPanel";
import { WalkControls } from "../components/WalkControls";
import { WalkHistoryModal } from "../components/WalkHistoryModal";
import {
  clearPendingRecordingRepair,
  deleteWalkSession,
  getAllWalksWithPoints,
  getGpsPointCountForSession,
  getGpsPointsAfterIndex,
  getGpsPointsForSession,
  getLastGpsPointForSession,
  getLifetimeStats,
  getPendingRecordingRepairSessionIds,
  getWalkSessionById,
  getWalkHistory,
  updateWalkSessionName,
  updateWalkSessionStepCount
} from "../database/walkRepository";
import {
  ActiveRecordingConflictError,
  clearActiveRecordingSettings,
  createActiveRecordingSession,
  getActiveRecordingSettings,
  getSavedCompletionObjective,
  saveCompletionObjective
} from "../database/settingsRepository";
import {
  CachedZone,
  commitPendingRecordingRepair,
  getCachedZones,
  getExploredCellKeys,
  getExploredCellRecords,
  getLoopFillCellKeys,
  getLoopFillSessionSummaries,
  getTodayNewExploredCellKeys,
  LoopFillSessionSummary,
  replaceExplorationForMode,
  upsertZones
} from "../database/completionRepository";
import {
  persistDeliveredBackgroundLocationBatch,
  subscribeToFinalizedBackgroundLocationChanges
} from "../services/backgroundLocationOutbox";
import {
  isBackgroundLocationTaskAvailable,
  requestBackgroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking
} from "../services/backgroundLocationTask";
import { collectExploredCellIdsByRouteSegments } from "../services/explorationArea";
import { analyzeLoopFillsForCells } from "../services/loopFill";
import {
  getStreetSegmentsNear,
  upsertStreetSegments
} from "../database/streetRepository";
import { matchGpsPointsToStreetSegments } from "../services/streetCompletion";
import {
  calculateZoneCompletionStats,
  countExploredCellKeysInsideZone,
  fetchNearbyOsmZonesWithDebug,
  ZoneCompletionStats
} from "../services/zoneCompletion";
import { buildPathSegments } from "../services/pathInference";
import { fetchNearbyOsmStreetSegments } from "../services/osmStreetService";
import {
  createRouteSnapshotIfMissing,
  rebuildRouteSnapshot,
  repairStreetCoverageForRecordings,
  replaceRouteSnapshot
} from "../services/routeSnapshot";
import { exportBackupJson, exportWalkGpx, importBackupJson } from "../services/dataTools";
import {
  getForegroundLocationPermission,
  LocationPermissionState,
  requestForegroundLocationPermission
} from "../services/locationService";
import { useReliableForegroundLocation } from "../hooks/useReliableForegroundLocation";
import { buildLiveRouteChunks } from "../services/liveRoute";
import {
  ACTIVE_RAW_POINT_LIMIT,
  acknowledgeGpsPersistenceFullSyncRequest,
  appendPersistedGpsPoint,
  applyRejectedGpsEvaluation,
  canQueueAcceptedGpsPoint,
  collectConfirmedLiveExploredCellIds,
  consumeGpsPersistenceFullSyncRequest,
  createActiveWalk,
  discardPendingGpsPoints,
  finishPersistedActiveWalk,
  flushPendingGpsPoints,
  persistAcceptedGpsPoint
} from "../services/walkRecorder";
import { calculatePathDistanceMeters, formatDistance, formatDuration } from "../services/distance";
import {
  getStepCountBetween,
  StepSubscription,
  watchStepCount
} from "../services/pedometerService";
import { calculateRecordingQuality } from "../services/recordingQuality";
import {
  ACTIVITY_MODE_TEXT,
  APP_LANGUAGES,
  AppLanguage,
  getStrings,
  interpolate
} from "../i18n";
import {
  ActiveWalk,
  ActivityMode,
  GpsPoint,
  LifetimeStats,
  RenderedRouteSegment,
  WalkSession,
  WalkWithPoints
} from "../types/walk";
import { MapLayerState } from "../types/mapLayers";
import { OsmStreetSegment } from "../types/street";

const EMPTY_STATS: LifetimeStats = {
  walkCount: 0,
  totalDistanceMeters: 0,
  totalDurationSeconds: 0,
  approximateExploredAreaSquareMeters: 0,
  exploredCellCount: 0,
  latestRecordingDistanceMeters: 0,
  latestRecordingStartedAt: null,
  longestRecordingDistanceMeters: 0,
  newCellsThisRecording: 0,
  todayDistanceMeters: 0,
  todayRecordingCount: 0,
  todayStepCount: 0
};

const OSM_STREET_RADIUS_METERS = 1600;
const OSM_STREET_FETCH_RADIUS_METERS = 800;
const OSM_STREET_LOCAL_COVERAGE_RADIUS_METERS = 200;
const OSM_STREET_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_OBJECTIVE_CHECK_DISTANCE_METERS = 25;
const AUTO_OBJECTIVE_FETCH_DISTANCE_METERS = 500;
const AUTO_OBJECTIVE_FETCH_INTERVAL_MS = 10 * 60 * 1000;
const OSM_STREET_RETRY_DELAY_MS = 30_000;

function getGpsTimestamp(point: GpsPoint) {
  const timestamp = new Date(point.timestamp).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

type MapScreenProps = {
  language: AppLanguage;
  onChangeLanguage: (language: AppLanguage) => void;
};

const GPS_STORAGE_PAUSED_REASON =
  "Storage unavailable; recording paused until queued GPS writes recover.";

type PathDisplayMode = "today" | "last7" | "all" | "selected";

type LoopProcessingResult =
  | {
      status: "filled";
      filledCellCount: number;
      filledLoopCount: number;
      rejectionReason: null;
      rejectedLoopCount: number;
    }
  | {
      status: "rejected";
      filledCellCount: number;
      filledLoopCount: number;
      rejectionReason: string | null;
      rejectedLoopCount: number;
    }
  | {
      status: "not_checked";
    };

type ReprocessProgress = {
  completed: number;
  phase: "preparing" | "streets" | "routes" | "contours" | "saving" | "refreshing";
  total: number;
};
type ReprocessSummary = LoopProcessingResult & {
  boundaryCellCount: number;
  failedRecordingCount: number;
  inferredCellCount: number;
  streetCoverageError: string | null;
  streetCoverageSegmentCount: number;
  streetCoverageStatus: "failed" | "not_needed" | "refreshed";
  preservedPreviousProgress: boolean;
  previousCellCount: number;
  recordingCount: number;
  rebuiltCellCount: number;
};
type RecordingSummary = {
  backgroundStatus: BackgroundTrackingStatus;
  distanceMeters: number;
  durationSeconds: number;
  finalStepCount: number;
  gpsPausedEventCount: number;
  loopResult: LoopProcessingResult;
  newCellCount: number;
  objectiveAfter: ZoneCompletionStats | null;
  objectiveBefore: ZoneCompletionStats | null;
  quality: ReturnType<typeof calculateRecordingQuality>;
  sessionId: number;
};

function getPersistedGpsGeneration(points: GpsPoint[]) {
  let sourceMaxPointId = 0;

  for (const point of points) {
    if (
      typeof point.id !== "number" ||
      !Number.isInteger(point.id) ||
      point.id <= 0
    ) {
      throw new Error(
        "Cannot persist recording exploration from uncommitted GPS points."
      );
    }

    sourceMaxPointId = Math.max(sourceMaxPointId, point.id);
  }

  return {
    sourceMaxPointId,
    sourcePointCount: points.length
  };
}

async function persistRecordingExplorationDelta(
  sessionId: number,
  activityMode: ActivityMode,
  points: GpsPoint[]
) {
  const sourceGeneration = getPersistedGpsGeneration(points);
  let routeSegments: RenderedRouteSegment[];

  try {
    routeSegments = await createRouteSnapshotIfMissing(
      sessionId,
      activityMode,
      points
    );
  } catch (error) {
    console.warn("Failed to freeze finalized route geometry", error);
    throw error;
  }

  const cellIdsBySource = collectExploredCellIdsByRouteSegments(routeSegments);
  const committed = await commitPendingRecordingRepair({
    activityMode,
    expectedSourceMaxPointId: sourceGeneration.sourceMaxPointId,
    expectedSourcePointCount: sourceGeneration.sourcePointCount,
    expectedRouteSegments: routeSegments,
    gpsCellIds: cellIdsBySource.gps,
    inferredCellIds: cellIdsBySource.inferred,
    sessionId
  });

  if (!committed) {
    return [];
  }

  return [...new Set([...cellIdsBySource.gps, ...cellIdsBySource.inferred])];
}

async function repairPendingRecordingCaches() {
  let sessionIds: number[];

  try {
    sessionIds = await getPendingRecordingRepairSessionIds();
  } catch (error) {
    console.warn("Failed to inspect pending recording repairs", error);
    return;
  }

  for (const sessionId of sessionIds) {
    try {
      const session = await getWalkSessionById(sessionId);

      if (
        !session ||
        new Date(session.endedAt).getTime() <=
          new Date(session.startedAt).getTime()
      ) {
        await clearPendingRecordingRepair(sessionId);
        continue;
      }

      const points = await getGpsPointsForSession(sessionId);
      await persistRecordingExplorationDelta(
        sessionId,
        session.activityMode,
        points
      );
    } catch (error) {
      console.warn(`Failed to repair finalized recording ${sessionId}`, error);
    }
  }
}

function createRecoveredActiveWalk(
  session: WalkSession,
  points: GpsPoint[]
): ActiveWalk {
  const nextPointIndex = points.reduce(
    (highestIndex, point) => Math.max(highestIndex, point.pointIndex + 1),
    points.length
  );

  return {
    activityMode: session.activityMode,
    acceptedGpsPointCount: nextPointIndex,
    currentSpeedMetersPerSecond: calculateLastSpeedMetersPerSecond(points),
    distanceMeters: Math.max(
      session.distanceMeters,
      calculatePathDistanceMeters(points)
    ),
    exploredCellIds: collectConfirmedLiveExploredCellIds(points, session.activityMode),
    gpsPausedEventCount: 0,
    lastRejectedPointReason: null,
    points: points.slice(-ACTIVE_RAW_POINT_LIMIT),
    rejectedGpsPointCount: 0,
    routeChunks: buildLiveRouteChunks(points, session.activityMode),
    sessionId: session.id,
    startedAt: session.startedAt,
    stepCount: session.stepCount
  };
}


export function MapScreen({
  language,
  onChangeLanguage
}: MapScreenProps) {
  const activityMode: ActivityMode = "walk";
  const strings = getStrings(language);
  const modeText = ACTIVITY_MODE_TEXT[language];
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("unknown");
  const [currentLocation, setCurrentLocation] = useState<GpsPoint | null>(null);
  const [walks, setWalks] = useState<WalkWithPoints[]>([]);
  const [history, setHistory] = useState<WalkSession[]>([]);
  const [activeWalk, setActiveWalk] = useState<ActiveWalk | null>(null);
  const [stats, setStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [streetSegments, setStreetSegments] = useState<OsmStreetSegment[]>([]);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [isComputingRecording, setIsComputingRecording] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState<ReprocessProgress | null>(null);
  const [stopConfirmationVisible, setStopConfirmationVisible] = useState(false);
  const [recordingSummary, setRecordingSummary] = useState<RecordingSummary | null>(null);
  const [loopFillCellIds, setLoopFillCellIds] = useState<string[]>([]);
  const [loopFillSummaries, setLoopFillSummaries] = useState<Record<number, LoopFillSessionSummary>>({});
  const [objective, setObjective] = useState<CompletionObjective | null>(null);
  const [objectiveStats, setObjectiveStats] = useState<ZoneCompletionStats | null>(null);
  const [pathDisplayMode, setPathDisplayMode] = useState<PathDisplayMode>("today");
  const [selectedZone, setSelectedZone] = useState<CachedZone | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [mapViewportCenter, setMapViewportCenter] = useState<GpsPoint | null>(null);
  const [zoneFocusRequestId, setZoneFocusRequestId] = useState(0);
  const [recoverableRecording, setRecoverableRecording] = useState<RecoverableRecording | null>(
    null
  );
  const [backgroundTrackingMessage, setBackgroundTrackingMessage] = useState<string | null>(null);
  const [backgroundTrackingStatus, setBackgroundTrackingStatus] =
    useState<BackgroundTrackingStatus>("idle");
  const [isLaunchDismissed, setIsLaunchDismissed] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isSavedDataReady, setIsSavedDataReady] = useState(false);
  const [isExplorationEnabled, setIsExplorationEnabled] = useState(false);
  const [savedExplorationCellIds, setSavedExplorationCellIds] = useState<string[]>([]);
  const [savedTodayNewCellIds, setSavedTodayNewCellIds] = useState<string[]>([]);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [isRecoveryCheckComplete, setIsRecoveryCheckComplete] = useState(false);
  const [recoveryCheckRevision, setRecoveryCheckRevision] = useState(0);
  const [streetRetryRevision, setStreetRetryRevision] = useState(0);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const [layers, setLayers] = useState<MapLayerState>({
    showExploredCells: true,
    showMarkers: true,
    showPaths: false
  });
  const stepSubscriptionRef = useRef<StepSubscription | null>(null);
  const activeSessionIdRef = useRef<number | null>(null);
  const activeWalkRef = useRef<ActiveWalk | null>(null);
  const recordingLifecycleGenerationRef = useRef(0);
  const appStateTransitionGenerationRef = useRef(0);
  const autoObjectiveCheckCenterRef = useRef<GpsPoint | null>(null);
  const autoObjectiveFetchCenterRef = useRef<GpsPoint | null>(null);
  const autoObjectiveFetchTimestampRef = useRef(0);
  const lastAutoObjectiveZoneIdRef = useRef<string | null>(null);
  const recoveryPromptedSessionRef = useRef<number | null>(null);
  const recoveryResumeTransitionRef = useRef<{
    activityMode: ActivityMode;
    sessionId: number;
  } | null>(null);
  const streetCacheCenterRef = useRef<GpsPoint | null>(null);
  const streetRetryAfterRef = useRef(0);
  const streetRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const streetLoadRequestRef = useRef(0);
  const isStartingRecordingRef = useRef(false);
  const isStoppingRecordingRef = useRef(false);
  const isMapReadyRef = useRef(false);
  const detailedWalksModeRef = useRef<ActivityMode | null>(null);
  const handleLocationPoint = useCallback((point: GpsPoint) => {
    setCurrentLocation((currentPoint) =>
      !currentPoint || getGpsTimestamp(point) >= getGpsTimestamp(currentPoint)
        ? point
        : currentPoint
    );

    const walk = activeWalkRef.current;
    const transition = recoveryResumeTransitionRef.current;
    const recordingTarget = walk
      ? { activityMode: walk.activityMode, sessionId: walk.sessionId }
      : transition;

    if (!recordingTarget) {
      return;
    }

    if (!canQueueAcceptedGpsPoint(recordingTarget.sessionId)) {
      void persistDeliveredBackgroundLocationBatch(
        [point],
        recordingTarget.sessionId
      ).catch((error) =>
        console.warn("Failed to journal the foreground GPS backlog", error)
      );

      if (walk) {
        setActiveWalk((currentWalk) => {
          if (!currentWalk || currentWalk.sessionId !== recordingTarget.sessionId) {
            return currentWalk;
          }

          const nextWalk = {
            ...currentWalk,
            currentSpeedMetersPerSecond: 0,
            gpsPausedEventCount:
              currentWalk.lastRejectedPointReason === GPS_STORAGE_PAUSED_REASON
                ? currentWalk.gpsPausedEventCount
                : currentWalk.gpsPausedEventCount + 1,
            lastRejectedPointReason: GPS_STORAGE_PAUSED_REASON
          };
          activeWalkRef.current = nextWalk;
          return nextWalk;
        });
      }

      return;
    }

    persistAcceptedGpsPoint(
      recordingTarget.sessionId,
      recordingTarget.activityMode,
      point
    )
      .then((result) => {
        if (!walk) {
          return;
        }

        setActiveWalk((currentWalk) => {
          if (
            !currentWalk ||
            currentWalk.sessionId !== recordingTarget.sessionId
          ) {
            return currentWalk;
          }

          const nextWalk = result.point
            ? appendPersistedGpsPoint(currentWalk, result.point)
            : !result.evaluation.accepted
              ? applyRejectedGpsEvaluation(currentWalk, result.evaluation)
              : currentWalk;
          activeWalkRef.current = nextWalk;
          return nextWalk;
        });
      })
      .catch((error) => {
        console.warn("Failed to persist GPS point", error);
        void persistDeliveredBackgroundLocationBatch(
          [point],
          recordingTarget.sessionId
        ).catch((journalError) =>
          console.warn("Failed to journal the foreground GPS point", journalError)
        );

        if (!walk) {
          return;
        }

        setActiveWalk((currentWalk) => {
          if (
            !currentWalk ||
            currentWalk.sessionId !== recordingTarget.sessionId
          ) {
            return currentWalk;
          }

          const nextWalk = {
            ...currentWalk,
            currentSpeedMetersPerSecond: 0,
            gpsPausedEventCount:
              currentWalk.lastRejectedPointReason === GPS_STORAGE_PAUSED_REASON
                ? currentWalk.gpsPausedEventCount
                : currentWalk.gpsPausedEventCount + 1,
            lastRejectedPointReason: GPS_STORAGE_PAUSED_REASON
          };
          activeWalkRef.current = nextWalk;
          return nextWalk;
        });
      });
  }, []);

  useEffect(() => {
    activeWalkRef.current = activeWalk;
  }, [activeWalk]);

  const {
    initialLocationResolved,
    refreshCurrentLocation
  } = useReliableForegroundLocation({
    enabled: permissionState === "granted" && isAppActive,
    isRecording: Boolean(activeWalk),
    onPoint: handleLocationPoint
  });

  const savedExplorationCellIdSet = useMemo(
    () => new Set(savedExplorationCellIds),
    [savedExplorationCellIds]
  );
  const activeNewCellIds = useMemo(
    () => (activeWalk?.exploredCellIds ?? []).filter(
      (cellId) => !savedExplorationCellIdSet.has(cellId)
    ),
    [activeWalk?.exploredCellIds, savedExplorationCellIdSet]
  );
  const todayNewCellIds = useMemo(
    () => [...new Set([...savedTodayNewCellIds, ...activeNewCellIds])],
    [activeNewCellIds, savedTodayNewCellIds]
  );
  const displayedWalks = useMemo(
    () => filterWalksForPathDisplay(walks, pathDisplayMode, selectedSessionId),
    [pathDisplayMode, selectedSessionId, walks]
  );
  const recordingQuality = useMemo(
    () =>
      calculateRecordingQuality({
        activeWalk,
        backgroundStatus: backgroundTrackingStatus,
        currentLocation,
        elapsedSeconds
      }),
    [activeWalk, backgroundTrackingStatus, currentLocation, elapsedSeconds]
  );
  const isLaunchReady =
    isMapReady &&
    isSavedDataReady &&
    isRecoveryCheckComplete &&
    permissionState !== "unknown" &&
    (permissionState !== "granted" || initialLocationResolved);
  useEffect(() => {
    if (isLaunchReady) {
      setIsLaunchDismissed(true);
    }
  }, [isLaunchReady]);
  const todayObjectiveCellCount = useMemo(
    () => objective
      ? countExploredCellKeysInsideZone(objective.zone, todayNewCellIds)
      : 0,
    [objective, todayNewCellIds]
  );
  const displayStats = useMemo(
    () => ({
      ...stats,
      newCellsThisRecording: activeNewCellIds.length
    }),
    [activeNewCellIds.length, stats]
  );
  const completionReferenceLocation = activeWalk ? currentLocation : mapViewportCenter ?? currentLocation;

  const handleVisibleRegionChange = useCallback((region: Region) => {
    setMapViewportCenter({
      accuracy: null,
      latitude: region.latitude,
      longitude: region.longitude,
      pointIndex: 0,
      timestamp: new Date().toISOString()
    });
  }, []);

  const loadDetailedWalks = useCallback(async () => {
    const savedWalks = await getAllWalksWithPoints(activityMode);
    detailedWalksModeRef.current = activityMode;
    setWalks(savedWalks);
  }, [activityMode]);

  const refreshSavedData = useCallback(async () => {
    setIsExplorationEnabled(false);

    try {
      await repairPendingRecordingCaches();
      const [
        lifetimeStats,
        savedHistory,
        savedLoopFillCellIds,
        savedLoopFillSummaries,
        exploredCellIds,
        todayNewExploredCellIds
      ] = await Promise.all([
        getLifetimeStats(activityMode),
        getWalkHistory(activityMode),
        getLoopFillCellKeys(activityMode),
        getLoopFillSessionSummaries(activityMode),
        getExploredCellKeys(activityMode),
        getTodayNewExploredCellKeys(activityMode)
      ]);
      const latestWalk = savedHistory[0] ?? null;
      const longestWalk = savedHistory.reduce<WalkSession | null>(
        (longest, walk) => {
          if (!longest || walk.distanceMeters > longest.distanceMeters) {
            return walk;
          }

          return longest;
        },
        null
      );
      const todayWalks = savedHistory.filter((walk) =>
        isToday(walk.startedAt)
      );

      if (detailedWalksModeRef.current !== activityMode) {
        setWalks([]);
      }

      setLoopFillCellIds(savedLoopFillCellIds);
      setLoopFillSummaries(savedLoopFillSummaries);
      setSavedExplorationCellIds(exploredCellIds);
      setSavedTodayNewCellIds(todayNewExploredCellIds);
      setStats({
        ...lifetimeStats,
        approximateExploredAreaSquareMeters: exploredCellIds.length * 15 * 15,
        exploredCellCount: exploredCellIds.length,
        latestRecordingDistanceMeters: latestWalk?.distanceMeters ?? 0,
        latestRecordingStartedAt: latestWalk?.startedAt ?? null,
        longestRecordingDistanceMeters: longestWalk?.distanceMeters ?? 0,
        newCellsThisRecording: 0,
        todayDistanceMeters: todayWalks.reduce(
          (distance, walk) => distance + walk.distanceMeters,
          0
        ),
        todayRecordingCount: todayWalks.length,
        todayStepCount: todayWalks.reduce(
          (steps, walk) => steps + walk.stepCount,
          0
        )
      });
      setHistory(savedHistory);
      setSelectedSessionId((currentSessionId) =>
        currentSessionId &&
        savedHistory.some((walk) => walk.id === currentSessionId)
          ? currentSessionId
          : null
      );
      setIsSavedDataReady(true);

      if (detailedWalksModeRef.current === activityMode) {
        loadDetailedWalks().catch((error) =>
          console.warn("Failed to refresh detailed recordings", error)
        );
      }
    } finally {
      // A failed cache refresh must never leave already valid exploration hidden.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      if (isMapReadyRef.current) {
        setIsExplorationEnabled(true);
      }
    }
  }, [activityMode, loadDetailedWalks]);

  const toggleLayer = useCallback((layer: keyof MapLayerState) => {
    if (layer === "showPaths" && !layers.showPaths) {
      loadDetailedWalks().catch((error) =>
        console.warn("Failed to load saved paths", error)
      );
    }

    setLayers((current) => ({
      ...current,
      [layer]: !current[layer]
    }));
  }, [layers.showPaths, loadDetailedWalks]);

  useEffect(() => {
    refreshSavedData().catch((error) =>
      console.warn("Failed to refresh saved map data", error)
    );
  }, [refreshSavedData]);

  useEffect(() => {
    let isMounted = true;
    let refreshChain = Promise.resolve();

    const unsubscribe = subscribeToFinalizedBackgroundLocationChanges(() => {
      refreshChain = refreshChain
        .then(async () => {
          if (!isMounted) {
            return;
          }

          if (isMounted) {
            await refreshSavedData();
          }
        })
        .catch((error) => {
          if (isMounted) {
            console.warn(
              "Failed to refresh a late finalized GPS merge",
              error
            );
          }
        });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [refreshSavedData]);

  useEffect(() => {
    getSavedCompletionObjective()
      .then((savedObjective) => {
        if (!savedObjective) {
          return;
        }

        setObjective(savedObjective);
        setSelectedZone(savedObjective.zone);
      })
      .catch((error) => console.warn("Failed to load saved completion objective", error));
  }, []);

  useEffect(() => {
    if (!objective) {
      setObjectiveStats(null);
      return;
    }

    getExploredCellRecords(objective.mode)
      .then((cells) => calculateZoneCompletionStats(objective.zone, cells))
      .then(setObjectiveStats)
      .catch((error) => console.warn("Failed to calculate objective completion", error));
  }, [loopFillCellIds, objective, walks]);

  const shouldFetchAutoObjectiveZones = useCallback((location: GpsPoint) => {
    const previousFetchCenter = autoObjectiveFetchCenterRef.current;
    const previousFetchTimestamp = autoObjectiveFetchTimestampRef.current;
    const isFetchRecentlyAttempted =
      Date.now() - previousFetchTimestamp < AUTO_OBJECTIVE_FETCH_INTERVAL_MS;
    const isNearPreviousFetch =
      previousFetchCenter &&
      calculatePathDistanceMeters([previousFetchCenter, location]) <
        AUTO_OBJECTIVE_FETCH_DISTANCE_METERS;

    return !isFetchRecentlyAttempted || !isNearPreviousFetch;
  }, []);

  useEffect(() => {
    if (
      !completionReferenceLocation ||
      !objective ||
      !["city", "district"].includes(objective.zone.type)
    ) {
      return;
    }

    let isMounted = true;
    const checkedCenter = autoObjectiveCheckCenterRef.current;

    if (
      checkedCenter &&
      calculatePathDistanceMeters([checkedCenter, completionReferenceLocation]) <
        AUTO_OBJECTIVE_CHECK_DISTANCE_METERS
    ) {
      return;
    }

    autoObjectiveCheckCenterRef.current = completionReferenceLocation;

    const updateObjectiveForReferenceLocation = async () => {
      let zones = await getCachedZones(objective.zone.type);
      let containingZone = findContainingZone(completionReferenceLocation, zones);

      if (!containingZone && shouldFetchAutoObjectiveZones(completionReferenceLocation)) {
        autoObjectiveFetchCenterRef.current = completionReferenceLocation;
        autoObjectiveFetchTimestampRef.current = Date.now();

        try {
          const result = await fetchNearbyOsmZonesWithDebug(completionReferenceLocation);
          await upsertZones(result.zones);
          zones = result.zones.filter((zone) => zone.type === objective.zone.type);
          containingZone = findContainingZone(completionReferenceLocation, zones);
        } catch (error) {
          console.warn("Failed to refresh zones for auto objective", error);
        }
      }

      if (
        !isMounted ||
        !containingZone ||
        containingZone.id === objective.zone.id ||
        containingZone.id === lastAutoObjectiveZoneIdRef.current
      ) {
        return;
      }

      lastAutoObjectiveZoneIdRef.current = containingZone.id;
      const nextObjective = {
        mode: objective.mode,
        zone: containingZone
      };

      setObjective(nextObjective);
      setSelectedZone(containingZone);
      await saveCompletionObjective({
        mode: nextObjective.mode,
        zoneId: containingZone.id
      });
    };

    updateObjectiveForReferenceLocation()
      .catch((error) => console.warn("Failed to auto-switch completion objective", error));

    return () => {
      isMounted = false;
    };
  }, [completionReferenceLocation, objective, shouldFetchAutoObjectiveZones]);

  useEffect(() => {
    if (activeWalk || objective || !mapViewportCenter) {
      return;
    }

    let isMounted = true;
    const checkedCenter = autoObjectiveCheckCenterRef.current;

    if (
      checkedCenter &&
      calculatePathDistanceMeters([checkedCenter, mapViewportCenter]) <
        AUTO_OBJECTIVE_CHECK_DISTANCE_METERS
    ) {
      return;
    }

    autoObjectiveCheckCenterRef.current = mapViewportCenter;

    const updateViewedDistrict = async () => {
      let zones = await getCachedZones("district");
      let containingZone = findContainingZone(mapViewportCenter, zones);

      if (!containingZone && shouldFetchAutoObjectiveZones(mapViewportCenter)) {
        autoObjectiveFetchCenterRef.current = mapViewportCenter;
        autoObjectiveFetchTimestampRef.current = Date.now();

        try {
          const result = await fetchNearbyOsmZonesWithDebug(mapViewportCenter);
          await upsertZones(result.zones);
          zones = result.zones.filter((zone) => zone.type === "district");
          containingZone = findContainingZone(mapViewportCenter, zones);
        } catch (error) {
          console.warn("Failed to refresh zones for viewed district", error);
        }
      }

      if (!isMounted || !containingZone || containingZone.id === selectedZone?.id) {
        return;
      }

      setSelectedZone(containingZone);
    };

    updateViewedDistrict()
      .catch((error) => console.warn("Failed to update viewed district", error));

    return () => {
      isMounted = false;
    };
  }, [activeWalk, mapViewportCenter, objective, selectedZone?.id, shouldFetchAutoObjectiveZones]);

  const clearStreetCoverageRetry = useCallback(() => {
    streetRetryAfterRef.current = 0;

    if (streetRetryTimerRef.current) {
      clearTimeout(streetRetryTimerRef.current);
      streetRetryTimerRef.current = null;
    }
  }, []);

  const scheduleStreetCoverageRetry = useCallback(() => {
    if (streetRetryTimerRef.current) {
      clearTimeout(streetRetryTimerRef.current);
    }

    streetRetryAfterRef.current = Date.now() + OSM_STREET_RETRY_DELAY_MS;
    streetRetryTimerRef.current = setTimeout(() => {
      streetRetryTimerRef.current = null;
      streetRetryAfterRef.current = 0;
      streetCacheCenterRef.current = null;
      setStreetRetryRevision((revision) => revision + 1);
    }, OSM_STREET_RETRY_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    if (streetRetryAfterRef.current > Date.now()) {
      return;
    }

    if (
      streetCacheCenterRef.current &&
      calculatePathDistanceMeters([streetCacheCenterRef.current, currentLocation]) < 250
    ) {
      return;
    }

    streetCacheCenterRef.current = currentLocation;
    const requestId = streetLoadRequestRef.current + 1;
    streetLoadRequestRef.current = requestId;

    const loadStreetCoverage = async () => {
      const [cachedSegments, localSegments] = await Promise.all([
        getStreetSegmentsNear(
          currentLocation.latitude,
          currentLocation.longitude,
          OSM_STREET_RADIUS_METERS
        ),
        getStreetSegmentsNear(
          currentLocation.latitude,
          currentLocation.longitude,
          OSM_STREET_LOCAL_COVERAGE_RADIUS_METERS
        )
      ]);

      if (requestId !== streetLoadRequestRef.current) {
        return;
      }

      setStreetSegments(cachedSegments);

      const freshAfter = Date.now() - OSM_STREET_CACHE_MAX_AGE_MS;
      const hasFreshLocalCoverage = localSegments.some(
        (segment) => new Date(segment.fetchedAt).getTime() >= freshAfter
      );

      if (hasFreshLocalCoverage) {
        clearStreetCoverageRetry();
        return;
      }

      try {
        const fetchedSegments = await fetchNearbyOsmStreetSegments(
          currentLocation,
          OSM_STREET_FETCH_RADIUS_METERS
        );
        await upsertStreetSegments(fetchedSegments);

        if (requestId !== streetLoadRequestRef.current) {
          return;
        }

        const refreshedSegments = await getStreetSegmentsNear(
          currentLocation.latitude,
          currentLocation.longitude,
          OSM_STREET_RADIUS_METERS
        );

        if (requestId !== streetLoadRequestRef.current) {
          return;
        }

        setStreetSegments(refreshedSegments);
        clearStreetCoverageRetry();
      } catch (error) {
        if (requestId !== streetLoadRequestRef.current) {
          return;
        }

        console.warn("Failed to refresh nearby OSM streets", error);
        streetCacheCenterRef.current = null;
        scheduleStreetCoverageRetry();
      }
    };

    loadStreetCoverage().catch((error) => {
      if (requestId !== streetLoadRequestRef.current) {
        return;
      }

      console.warn("Failed to load cached OSM streets", error);
      streetCacheCenterRef.current = null;
      scheduleStreetCoverageRetry();
    });
  }, [
    clearStreetCoverageRetry,
    currentLocation,
    scheduleStreetCoverageRetry,
    streetRetryRevision
  ]);

  useEffect(
    () => () => {
      if (streetRetryTimerRef.current) {
        clearTimeout(streetRetryTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    requestForegroundLocationPermission()
      .then(setPermissionState)
      .catch((error) => {
        console.error("Failed to request location permission", error);
        setPermissionState("denied");
      });
  }, []);

  useEffect(() => {
    if (!activeWalk) {
      setElapsedSeconds(0);
      return;
    }

    const timerId = setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.round((Date.now() - new Date(activeWalk.startedAt).getTime()) / 1000))
      );
    }, 1000);

    return () => clearInterval(timerId);
  }, [activeWalk?.startedAt]);

  const stopStepWatch = useCallback(() => {
    stepSubscriptionRef.current?.remove();
    stepSubscriptionRef.current = null;
  }, []);

  const beginRecordingLifecycle = useCallback((sessionId: number) => {
    recordingLifecycleGenerationRef.current += 1;
    activeSessionIdRef.current = sessionId;
    return recordingLifecycleGenerationRef.current;
  }, []);

  const invalidateRecordingLifecycle = useCallback(() => {
    recordingLifecycleGenerationRef.current += 1;
    activeSessionIdRef.current = null;
  }, []);

  const isRecordingLifecycleCurrent = useCallback(
    (sessionId: number, lifecycleGeneration: number) =>
      activeSessionIdRef.current === sessionId &&
      recordingLifecycleGenerationRef.current === lifecycleGeneration,
    []
  );

  const startStepWatch = useCallback(
    async (
      startedAt: string,
      sessionId: number,
      lifecycleGeneration: number
    ) => {
      stopStepWatch();

      const baseSteps = await getStepCountBetween(
        startedAt,
        new Date().toISOString()
      );

      if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
        return;
      }

      setActiveWalk((walk) =>
        walk?.sessionId === sessionId
          ? { ...walk, stepCount: baseSteps }
          : walk
      );

      const subscription = await watchStepCount((liveSteps) => {
        if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
          return;
        }

        setActiveWalk((walk) =>
          walk?.sessionId === sessionId
            ? { ...walk, stepCount: baseSteps + liveSteps }
            : walk
        );
      });

      if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
        subscription?.remove();
        return;
      }

      stepSubscriptionRef.current = subscription;
    },
    [isRecordingLifecycleCurrent, stopStepWatch]
  );

  const syncActiveWalkFromDatabase = useCallback(async (sessionId: number) => {
    const [persistedPoints, session] = await Promise.all([
      getGpsPointsForSession(sessionId),
      getWalkSessionById(sessionId)
    ]);
    const latestPoint = persistedPoints.at(-1);

    if (latestPoint) {
      setCurrentLocation((currentPoint) =>
        !currentPoint ||
        getGpsTimestamp(latestPoint) >= getGpsTimestamp(currentPoint)
          ? latestPoint
          : currentPoint
      );
    }

    setActiveWalk((currentWalk) => {
      if (!currentWalk || currentWalk.sessionId !== sessionId) {
        return currentWalk;
      }

      // A canonical observation rebuild can intentionally remove or replace
      // accepted points, so the full database result is authoritative.
      const points = persistedPoints;
      const nextWalk: ActiveWalk = {
        ...currentWalk,
        acceptedGpsPointCount: points.reduce(
          (highestPointCount, point) =>
            Math.max(highestPointCount, point.pointIndex + 1),
          0
        ),
        currentSpeedMetersPerSecond: calculateLastSpeedMetersPerSecond(points),
        distanceMeters:
          session?.distanceMeters ?? calculatePathDistanceMeters(points),
        exploredCellIds: collectConfirmedLiveExploredCellIds(
          points,
          currentWalk.activityMode
        ),
        points: points.slice(-ACTIVE_RAW_POINT_LIMIT),
        routeChunks: buildLiveRouteChunks(points, currentWalk.activityMode)
      };
      activeWalkRef.current = nextWalk;
      return nextWalk;
    });
  }, []);

  const syncActiveWalkTailFromDatabase = useCallback(async (sessionId: number) => {
    const walk = activeWalkRef.current;

    if (!walk || walk.sessionId !== sessionId) {
      return;
    }

    const lastRenderedPoint =
      walk.routeChunks.at(-1)?.points.at(-1) ?? walk.points.at(-1);
    const [persistedPoints, session] = await Promise.all([
      getGpsPointsAfterIndex(sessionId, lastRenderedPoint?.pointIndex ?? -1),
      getWalkSessionById(sessionId)
    ]);

    if (persistedPoints.length === 0) {
      return;
    }

    setActiveWalk((currentWalk) => {
      if (!currentWalk || currentWalk.sessionId !== sessionId) {
        return currentWalk;
      }

      const nextWalk = persistedPoints.reduce(
        (walkState, point) => appendPersistedGpsPoint(walkState, point),
        currentWalk
      );
      const synchronizedWalk = {
        ...nextWalk,
        distanceMeters: Math.max(
          nextWalk.distanceMeters,
          session?.distanceMeters ?? 0
        )
      };
      activeWalkRef.current = synchronizedWalk;
      return synchronizedWalk;
    });
  }, []);

  useEffect(() => {
    const sessionId = activeWalk?.sessionId;

    if (!sessionId || !isAppActive) {
      return;
    }

    let syncInFlight = false;
    const synchronizeTail = () => {
      if (syncInFlight) {
        return;
      }

      syncInFlight = true;
      const fullSyncGeneration =
        consumeGpsPersistenceFullSyncRequest(sessionId);
      const synchronizeOperation = fullSyncGeneration !== null
        ? syncActiveWalkFromDatabase(sessionId).then(() => {
            acknowledgeGpsPersistenceFullSyncRequest(
              sessionId,
              fullSyncGeneration
            );
          })
        : syncActiveWalkTailFromDatabase(sessionId);

      synchronizeOperation
        .catch((error) =>
          console.warn("Failed to synchronize active GPS route", error)
        )
        .finally(() => {
          syncInFlight = false;
        });
    };
    const intervalId = setInterval(synchronizeTail, 1000);
    synchronizeTail();

    return () => clearInterval(intervalId);
  }, [
    activeWalk?.sessionId,
    isAppActive,
    syncActiveWalkFromDatabase,
    syncActiveWalkTailFromDatabase
  ]);

  const enableBackgroundTracking = useCallback(async (
    recordingMode: ActivityMode,
    sessionId: number,
    lifecycleGeneration: number
  ) => {
    try {
      const canUseBackgroundTasks = await isBackgroundLocationTaskAvailable();

      if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
        return;
      }

      if (!canUseBackgroundTasks) {
        setBackgroundTrackingStatus("unavailable");
        setBackgroundTrackingMessage(strings.map.backgroundNeedsDevelopmentBuild);
        return;
      }

      const backgroundPermission = await requestBackgroundLocationPermission();

      if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
        return;
      }

      if (backgroundPermission.granted) {
        const backgroundOwner = `${sessionId}:${lifecycleGeneration}`;
        const didStart = await startBackgroundLocationTracking(
          recordingMode,
          backgroundOwner
        );

        if (!didStart) {
          return;
        }

        if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
          await stopBackgroundLocationTracking(backgroundOwner).catch((error) =>
            console.warn("Failed to stop stale background tracking", error)
          );
          return;
        }

        setBackgroundTrackingStatus("enabled");
        setBackgroundTrackingMessage(strings.map.backgroundEnabled);
        return;
      }

      setBackgroundTrackingStatus("foreground-only");
      const settingsHint = backgroundPermission.backgroundCanAskAgain
        ? strings.map.foregroundHintAskAgain
        : strings.map.foregroundHintSettings;

      setBackgroundTrackingMessage(
        interpolate(strings.map.backgroundForegroundOnly, { hint: settingsHint })
      );
    } catch (error) {
      if (!isRecordingLifecycleCurrent(sessionId, lifecycleGeneration)) {
        return;
      }

      console.warn("Background tracking setup failed", error);
      setBackgroundTrackingStatus("unavailable");
      setBackgroundTrackingMessage(strings.map.backgroundUnavailable);
    }
  }, [isRecordingLifecycleCurrent, strings]);

  useEffect(() => {
    let claimedSessionId: number | null = null;
    let didCommitRecovery = false;
    let isMounted = true;
    setIsRecoveryCheckComplete(false);

    const detectRecoverableRecording = async () => {
      if (
        isStartingRecordingRef.current ||
        isStoppingRecordingRef.current
      ) {
        return;
      }

      const activeRecording = await getActiveRecordingSettings();

      if (
        !isMounted ||
        isStartingRecordingRef.current ||
        isStoppingRecordingRef.current ||
        activeWalk ||
        recoverableRecording ||
        !activeRecording ||
        recoveryPromptedSessionRef.current === activeRecording.sessionId
      ) {
        return;
      }

      recoveryPromptedSessionRef.current = activeRecording.sessionId;
      claimedSessionId = activeRecording.sessionId;
      const [session, totalPointCount, lastPoint] = await Promise.all([
        getWalkSessionById(activeRecording.sessionId),
        getGpsPointCountForSession(activeRecording.sessionId),
        getLastGpsPointForSession(activeRecording.sessionId)
      ]);

      if (
        !isMounted ||
        isStartingRecordingRef.current ||
        isStoppingRecordingRef.current
      ) {
        return;
      }

      if (!session) {
        await clearActiveRecordingSettings(activeRecording.sessionId);
        recoveryPromptedSessionRef.current = null;
        return;
      }

      if (
        new Date(session.endedAt).getTime() >
        new Date(session.startedAt).getTime()
      ) {
        await clearActiveRecordingSettings(activeRecording.sessionId);
        recoveryPromptedSessionRef.current = null;
        await refreshSavedData();
        return;
      }

      setRecoverableRecording({
        lastPoint,
        session,
        totalPointCount
      });
      didCommitRecovery = true;
    };

    detectRecoverableRecording()
      .catch((error) =>
        console.warn("Failed to recover active recording", error)
      )
      .finally(() => {
        if (
          claimedSessionId !== null &&
          !didCommitRecovery &&
          recoveryPromptedSessionRef.current === claimedSessionId
        ) {
          recoveryPromptedSessionRef.current = null;
        }

        if (isMounted) {
          setIsRecoveryCheckComplete(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeWalk?.sessionId,
    recoverableRecording?.session.id,
    recoveryCheckRevision,
    refreshSavedData
  ]);

  const handleStartWalk = useCallback(async () => {
    if (
      activeWalk ||
      recoverableRecording ||
      !isRecoveryCheckComplete ||
      isStartingRecordingRef.current ||
      isStoppingRecordingRef.current
    ) {
      return;
    }

    isStartingRecordingRef.current = true;
    setIsStartingRecording(true);

    try {
      let permission = permissionState;

      if (permission !== "granted") {
        permission = await requestForegroundLocationPermission();
        setPermissionState(permission);
      }

      if (permission !== "granted") {
        Alert.alert(strings.map.locationOff, strings.map.locationOffText);
        return;
      }

      const startedAt = new Date().toISOString();
      const sessionId = await createActiveRecordingSession({
        activityMode,
        startedAt
      });
      const nextWalk = createActiveWalk(activityMode, sessionId, startedAt);
      const lifecycleGeneration = beginRecordingLifecycle(sessionId);

      activeWalkRef.current = nextWalk;
      setActiveWalk(nextWalk);
      setElapsedSeconds(0);
      setBackgroundTrackingStatus("starting");

      refreshCurrentLocation({ allowLastKnown: false }).catch((error) =>
        console.warn("Failed to refresh starting GPS fix", error)
      );
      startStepWatch(
        startedAt,
        sessionId,
        lifecycleGeneration
      ).catch((error) =>
        console.warn("Failed to initialize step counting", error)
      );
      enableBackgroundTracking(
        activityMode,
        sessionId,
        lifecycleGeneration
      ).catch((error) =>
        console.warn("Failed to initialize background tracking", error)
      );
    } catch (error) {
      if (error instanceof ActiveRecordingConflictError) {
        recoveryPromptedSessionRef.current = null;

        setRecoveryCheckRevision((revision) => revision + 1);
        Alert.alert(
          "Unfinished recording found",
          "Resolve the existing recording before starting a new one."
        );
        return;
      }

      console.warn("Failed to start recording", error);
      Alert.alert("Recording failed", "Street Explorer could not start this recording.");
    } finally {
      isStartingRecordingRef.current = false;
      setIsStartingRecording(false);
    }
  }, [
    activeWalk,
    beginRecordingLifecycle,
    enableBackgroundTracking,
    isRecoveryCheckComplete,
    permissionState,
    recoverableRecording,
    refreshCurrentLocation,
    startStepWatch,
    strings
  ]);

  const reprocessModeExploration = useCallback(
    async (
      mode: ActivityMode,
      options: {
        rebuildRouteSnapshots?: boolean;
        onProgress?: (progress: ReprocessProgress) => void;
      } = {}
    ): Promise<ReprocessSummary> => {
      const savedWalks = await getAllWalksWithPoints(mode);
      const historicalExploredStreetIds = matchGpsPointsToStreetSegments(
        savedWalks.flatMap((walk) => walk.points),
        streetSegments
      );
      options.onProgress?.({
        completed: 0,
        phase: "preparing",
        total: savedWalks.length
      });
      let streetCoverageRepair = {
        corridorCount: 0,
        error: null as string | null,
        segmentCount: 0,
        status: "not_needed" as "failed" | "not_needed" | "refreshed"
      };

      if (options.rebuildRouteSnapshots) {
        options.onProgress?.({
          completed: 0,
          phase: "streets",
          total: 1
        });
        streetCoverageRepair = await repairStreetCoverageForRecordings(savedWalks);

        if (streetCoverageRepair.status === "failed") {
          throw new Error(
            `Street coverage repair failed: ${streetCoverageRepair.error ?? "unknown error"}. ` +
              "Existing routes and progress were left unchanged. Check your connection and retry."
          );
        }
        options.onProgress?.({
          completed: 1,
          phase: "streets",
          total: 1
        });
      }
      const previousRecords = await getExploredCellRecords(mode);
      const previousCellCount = new Set(previousRecords.map((record) => record.cellKey)).size;
      const boundaryCellIds = new Set<string>();
      const inferredCellIds = new Set<string>();
      let failedRecordingCount = 0;
      const rebuiltWalkCells: Array<{
        gps: string[];
        inferred: string[];
        replaceSnapshot: boolean;
        routeSegments: RenderedRouteSegment[];
        walk: WalkWithPoints;
      }> = [];

      // Build the complete candidate in memory first. Reprocessing must never erase
      // already-earned exploration merely because a network/cache rebuild is weaker.
      for (const [walkIndex, walk] of savedWalks.entries()) {
        options.onProgress?.({
          completed: walkIndex,
          phase: "routes",
          total: savedWalks.length
        });

        let replaceSnapshot = false;
        let routeSegments: RenderedRouteSegment[];

        try {
          routeSegments = options.rebuildRouteSnapshots
            ? await rebuildRouteSnapshot(
                walk.id,
                walk.activityMode,
                walk.points,
                streetSegments,
                {
                  persist: false,
                  refreshStreetCoverage: false
                }
              )
            : walk.routeSegments ?? await createRouteSnapshotIfMissing(
                walk.id,
                walk.activityMode,
                walk.points
              );
          replaceSnapshot = Boolean(options.rebuildRouteSnapshots);
        } catch (error) {
          failedRecordingCount += 1;
          console.warn("Unable to rebuild recording; preserving its frozen route", walk.id, error);
          routeSegments = walk.routeSegments ?? [];
        }
        const cellIdsBySource = collectExploredCellIdsByRouteSegments(routeSegments);

        for (const cellKey of cellIdsBySource.gps) {
          boundaryCellIds.add(cellKey);
        }

        for (const cellKey of cellIdsBySource.inferred) {
          boundaryCellIds.add(cellKey);
          inferredCellIds.add(cellKey);
        }

        rebuiltWalkCells.push({
          gps: cellIdsBySource.gps,
          inferred: cellIdsBySource.inferred,
          replaceSnapshot,
          routeSegments,
          walk
        });
        options.onProgress?.({
          completed: walkIndex + 1,
          phase: "routes",
          total: savedWalks.length
        });
      }

      options.onProgress?.({
        completed: savedWalks.length,
        phase: "contours",
        total: savedWalks.length
      });
      const loopFills = analyzeLoopFillsForCells({
        activityMode: mode,
        boundaryCellIds: [...boundaryCellIds],
        exploredStreetIds: historicalExploredStreetIds,
        streetSegments
      });
      const acceptedLoopFills = loopFills.filter((loopFill) => loopFill.accepted);
      const rejectedLoopFills = loopFills.filter((loopFill) => !loopFill.accepted);
      const filledCellKeys = new Set(acceptedLoopFills.flatMap((loopFill) => loopFill.cellIds));
      const rebuiltCellKeys = new Set([...boundaryCellIds, ...filledCellKeys]);
      const preservedPreviousProgress = rebuiltCellKeys.size < previousCellCount;

      if (!preservedPreviousProgress) {
        options.onProgress?.({
          completed: savedWalks.length,
          phase: "saving",
          total: savedWalks.length
        });

        for (const rebuilt of rebuiltWalkCells) {
          if (rebuilt.replaceSnapshot) {
            await replaceRouteSnapshot(
              rebuilt.walk.id,
              rebuilt.walk.points,
              rebuilt.routeSegments
            );
          }
        }

        const replacementCells = [
          ...rebuiltWalkCells.flatMap((rebuilt) =>
            rebuilt.gps.map((cellKey) => ({
              cellKey,
              mode: rebuilt.walk.activityMode,
              sessionId: rebuilt.walk.id,
              source: "gps" as const
            }))
          ),
          ...rebuiltWalkCells.flatMap((rebuilt) =>
            rebuilt.inferred.map((cellKey) => ({
              cellKey,
              mode: rebuilt.walk.activityMode,
              sessionId: rebuilt.walk.id,
              source: "inferred" as const
            }))
          ),
          ...[...filledCellKeys].map((cellKey) => ({
            cellKey,
            mode,
            sessionId: null,
            source: "loop_fill" as const
          }))
        ];
        const replacementLoopFills = loopFills.map((loopFill) => ({
          accepted: loopFill.accepted,
          areaM2: loopFill.areaM2,
          mode,
          polygonJson: JSON.stringify(loopFill.polygon),
          rejectionReason: loopFill.rejectionReason,
          sessionId: null,
          totalWalkableStreetLengthM: loopFill.totalWalkableStreetLengthM,
          unwalkedWalkableStreetLengthM: loopFill.unwalkedWalkableStreetLengthM
        }));

        await replaceExplorationForMode(mode, replacementCells, replacementLoopFills);
      }

      const diagnostics = {
        boundaryCellCount: boundaryCellIds.size,
        failedRecordingCount,
        inferredCellCount: inferredCellIds.size,
        streetCoverageError: streetCoverageRepair.error,
        streetCoverageSegmentCount: streetCoverageRepair.segmentCount,
        streetCoverageStatus: streetCoverageRepair.status,
        preservedPreviousProgress,
        previousCellCount,
        rebuiltCellCount: rebuiltCellKeys.size,
        recordingCount: savedWalks.length
      };

      if (acceptedLoopFills.length > 0) {
        return {
          ...diagnostics,
          filledCellCount: filledCellKeys.size,
          filledLoopCount: acceptedLoopFills.length,
          rejectedLoopCount: rejectedLoopFills.length,
          rejectionReason: null,
          status: "filled"
        };
      }

      if (rejectedLoopFills.length > 0) {
        return {
          ...diagnostics,
          filledCellCount: 0,
          filledLoopCount: 0,
          rejectedLoopCount: rejectedLoopFills.length,
          rejectionReason: rejectedLoopFills[0]?.rejectionReason ?? "not_closed_enough",
          status: "rejected"
        };
      }

      return {
        ...diagnostics,
        status: "not_checked"
      };
    },
    [streetSegments]
  );
  const restoreRecordingAfterFailedStop = useCallback(
    (walk: ActiveWalk, message: string) => {
      const lifecycleGeneration = beginRecordingLifecycle(walk.sessionId);
      activeWalkRef.current = walk;
      setActiveWalk(walk);
      setBackgroundTrackingStatus("starting");
      setBackgroundTrackingMessage(message);
      startStepWatch(
        walk.startedAt,
        walk.sessionId,
        lifecycleGeneration
      ).catch((error) =>
        console.warn("Failed to resume step counting", error)
      );
      enableBackgroundTracking(
        walk.activityMode,
        walk.sessionId,
        lifecycleGeneration
      ).catch((error) =>
        console.warn("Failed to resume background tracking", error)
      );
    },
    [beginRecordingLifecycle, enableBackgroundTracking, startStepWatch]
  );

  const handleStopWalk = useCallback(async () => {
    if (!activeWalk || isStoppingRecordingRef.current) {
      return;
    }

    isStoppingRecordingRef.current = true;
    const walkToStop = activeWalk;
    let endedAt = new Date().toISOString();
    const finalBackgroundStatus = backgroundTrackingStatus;
    const savedCellIdsBeforeStop = savedExplorationCellIdSet;

    setStopConfirmationVisible(false);
    setIsComputingRecording(true);
    setActiveWalk(null);
    activeWalkRef.current = null;
    setElapsedSeconds(0);
    setBackgroundTrackingStatus("idle");
    setBackgroundTrackingMessage(null);
    invalidateRecordingLifecycle();
    stopStepWatch();

    const backgroundStopPromise = stopBackgroundLocationTracking();

    try {
      await waitForMapRenderCommit();

      try {
        await backgroundStopPromise;
        endedAt = new Date().toISOString();
      } catch (error) {
        console.warn("Background tracking did not stop; restoring recording", error);
        restoreRecordingAfterFailedStop(
          walkToStop,
          "Background tracking could not stop. Recording was restored so you can retry."
        );
        Alert.alert(
          "Recording not stopped",
          "Street Explorer could not verify that background tracking stopped, so the recording remains active."
        );
        return;
      }

      let savedSessionId: number | null;

      try {
        savedSessionId = await finishPersistedActiveWalk(
          walkToStop,
          endedAt,
          walkToStop.stepCount
        );
      } catch (error) {
        console.warn("Core recording finalization failed; restoring recording", error);
        restoreRecordingAfterFailedStop(
          walkToStop,
          "Finalization failed. Recording was restored so you can retry."
        );
        Alert.alert(
          "Recording not finished",
          "Street Explorer kept the recording active because its saved GPS points could not be finalized."
        );
        return;
      }

      try {
        await clearActiveRecordingSettings(walkToStop.sessionId);
      } catch (error) {
        console.warn("Finished recording but could not clear recovery settings", error);
      }

      if (!savedSessionId) {
        Alert.alert(
          "Walk discarded",
          "At least 2 valid GPS points are required to save a walk."
        );
        return;
      }

      let finalStepCount = walkToStop.stepCount;

      if (walkToStop.activityMode === "walk") {
        try {
          finalStepCount = await getStepCountBetween(walkToStop.startedAt, endedAt);
          await updateWalkSessionStepCount(savedSessionId, finalStepCount);
        } catch (error) {
          console.warn("Failed to finalize step count", error);
        }
      }

      const finalizedPoints = await getGpsPointsForSession(savedSessionId);
      let recordingCellIds: string[] = [];

      try {
        recordingCellIds = await persistRecordingExplorationDelta(
          savedSessionId,
          walkToStop.activityMode,
          finalizedPoints
        );
      } catch (error) {
        console.warn("Recording saved but exploration cache update failed", error);
      }

      const finalizedSession = await getWalkSessionById(savedSessionId);
      const finalizedDistanceMeters =
        finalizedSession?.distanceMeters ?? walkToStop.distanceMeters;
      const newCellCount = recordingCellIds.filter(
        (cellId) => !savedCellIdsBeforeStop.has(cellId)
      ).length;
      const objectiveBefore = objectiveStats;
      const loopResult: LoopProcessingResult = { status: "not_checked" };

      try {
        await refreshSavedData();
      } catch (error) {
        console.warn("Recording saved but the map refresh failed", error);
      }

      let objectiveAfter: ZoneCompletionStats | null = null;

      if (objective) {
        try {
          objectiveAfter = await calculateObjectiveStats(objective);
        } catch (error) {
          console.warn("Recording saved but objective refresh failed", error);
        }
      }

      await waitForMapRenderCommit();
      setRecordingSummary({
        backgroundStatus: finalBackgroundStatus,
        distanceMeters: finalizedDistanceMeters,
        durationSeconds: Math.max(
          0,
          Math.round(
            (new Date(endedAt).getTime() -
              new Date(walkToStop.startedAt).getTime()) /
              1000
          )
        ),
        finalStepCount,
        gpsPausedEventCount: walkToStop.gpsPausedEventCount,
        loopResult,
        newCellCount,
        objectiveAfter,
        objectiveBefore,
        quality: recordingQuality,
        sessionId: savedSessionId
      });
    } catch (error) {
      console.warn("Recording was saved but post-save refresh failed", error);
      Alert.alert(
        "Recording saved",
        "The walk is safe. Some map details will refresh the next time the app becomes active."
      );
    } finally {
      isStoppingRecordingRef.current = false;
      setIsComputingRecording(false);
    }
  }, [
    activeWalk,
    backgroundTrackingStatus,
    invalidateRecordingLifecycle,
    objective,
    objectiveStats,
    recordingQuality,
    refreshSavedData,
    savedExplorationCellIdSet,
    restoreRecordingAfterFailedStop,
    stopStepWatch
  ]);

  const handleRequestStopWalk = useCallback(() => {
    if (
      !activeWalk ||
      isComputingRecording ||
      isStoppingRecordingRef.current
    ) {
      return;
    }

    setStopConfirmationVisible(true);
  }, [activeWalk, isComputingRecording]);

  const handleReprocessRecordings = useCallback(() => {
    if (activeWalk) {
      Alert.alert(strings.map.recordingActive, strings.map.recordingActiveReprocess);
      return;
    }

    setOptionsVisible(false);
    setHistoryVisible(false);
    setCompletionVisible(false);
    setDiagnosticsVisible(false);
    setDashboardExpanded(false);

    setTimeout(() => {
      Alert.alert(
        "Reprocess saved recordings?",
        `This rebuilds frozen street-matched routes, explored cells, and loop fills for saved ${modeText.labels[
          activityMode
        ].toLowerCase()} recordings. Street coverage is repaired once before validated bridge cells are calculated.`,
        [
          {
            text: strings.common.cancel,
            style: "cancel"
          },
          {
            text: "Reprocess",
            onPress: async () => {
              setReprocessProgress({ completed: 0, phase: "preparing", total: 0 });

              try {
                const summary = await reprocessModeExploration(activityMode, {
                  onProgress: setReprocessProgress,
                  rebuildRouteSnapshots: true
                });

                setReprocessProgress({
                  completed: summary.recordingCount,
                  phase: "refreshing",
                  total: summary.recordingCount
                });
                await refreshSavedData();
                setReprocessProgress(null);
                Alert.alert(
                  "Reprocess complete",
                  `${summary.recordingCount} recordings checked.\nFilled loops: ${
                    summary.status === "filled" ? summary.filledLoopCount : 0
                  }\nRejected loops: ${
                    summary.status === "not_checked" ? 0 : summary.rejectedLoopCount
                  }\nLoop cells added: ${
                    summary.status === "filled" ? summary.filledCellCount : 0
                  }\nDirect + validated boundary cells: ${
                    summary.boundaryCellCount
                  }\nValidated inferred cells: ${
                    summary.inferredCellCount
                  }\nStreet coverage: ${
                    summary.streetCoverageStatus === "refreshed"
                      ? `${summary.streetCoverageSegmentCount} cached road segments refreshed`
                      : summary.streetCoverageStatus === "failed"
                        ? `repair failed (${summary.streetCoverageError ?? "unknown error"}); existing cache used`
                        : "not needed"
                  }\nRecordings preserved after an individual failure: ${
                    summary.failedRecordingCount
                  }\nPrevious / rebuilt total: ${summary.previousCellCount} / ${
                    summary.rebuiltCellCount
                  }${
                    summary.preservedPreviousProgress
                      ? "\nSafety stop: the weaker rebuild was not allowed to replace existing progress."
                      : ""
                  }`
                );
              } catch (error) {
                console.error("Reprocess recordings failed", error);
                setReprocessProgress(null);
                Alert.alert(
                  "Reprocess failed",
                  error instanceof Error
                    ? error.message
                    : "An unexpected error stopped the rebuild. Existing progress was preserved."
                );
              }
            }
          }
        ]
      );
    }, 50);
  }, [activeWalk, activityMode, modeText, refreshSavedData, reprocessModeExploration, strings]);

  const restoreRecoverableRecordingProtection = useCallback(
    async (recording: RecoverableRecording) => {
      const sessionId = recording.session.id;
      const transition = {
        activityMode: recording.session.activityMode,
        sessionId
      };

      recoveryResumeTransitionRef.current = transition;
      setRecoverableRecording(recording);
      recoveryPromptedSessionRef.current = sessionId;

      try {
        const didStart = await startBackgroundLocationTracking(
          recording.session.activityMode,
          `recovery:${sessionId}`
        );

        if (!didStart) {
          throw new Error("Recovery background ownership changed before startup.");
        }

        if (recoveryResumeTransitionRef.current === transition) {
          recoveryResumeTransitionRef.current = null;
        }

        setBackgroundTrackingStatus("enabled");
        setBackgroundTrackingMessage(
          "Unfinished recording protection was restored."
        );
      } catch (error) {
        console.warn("Failed to restore recovery background protection", error);
        setBackgroundTrackingStatus("foreground-only");
        setBackgroundTrackingMessage(
          "Keep Street Explorer open while retrying recovery."
        );
      }
    },
    []
  );

  const handleResumeRecoveredRecording = useCallback(async () => {
    if (
      !recoverableRecording ||
      isStartingRecordingRef.current ||
      isStoppingRecordingRef.current
    ) {
      return;
    }

    const recordingToResume = recoverableRecording;
    const sessionId = recordingToResume.session.id;
    const resumeTransition = {
      activityMode: recordingToResume.session.activityMode,
      sessionId
    };
    let backgroundStopAttempted = false;

    isStartingRecordingRef.current = true;
    recoveryResumeTransitionRef.current = resumeTransition;
    setIsStartingRecording(true);
    setRecoverableRecording(null);

    try {
      const session = await getWalkSessionById(sessionId);

      if (!session) {
        backgroundStopAttempted = true;
        await stopBackgroundLocationTracking();
        backgroundStopAttempted = false;
        await clearActiveRecordingSettings(sessionId).catch((error) =>
          console.warn("Failed to clear missing recovery settings", error)
        );
        recoveryPromptedSessionRef.current = null;
        Alert.alert(
          "Recording unavailable",
          "The unfinished recording no longer exists."
        );
        return;
      }

      if (
        new Date(session.endedAt).getTime() >
        new Date(session.startedAt).getTime()
      ) {
        backgroundStopAttempted = true;
        await stopBackgroundLocationTracking();
        backgroundStopAttempted = false;
        await clearActiveRecordingSettings(sessionId).catch((error) =>
          console.warn("Failed to clear finalized recovery settings", error)
        );
        recoveryPromptedSessionRef.current = null;
        await refreshSavedData();
        Alert.alert(
          "Recording already saved",
          "This recording was finalized before recovery completed."
        );
        return;
      }

      backgroundStopAttempted = true;
      await stopBackgroundLocationTracking();
      await flushPendingGpsPoints(sessionId);
      const points = await getGpsPointsForSession(sessionId);
      const resumedWalk = createRecoveredActiveWalk(session, points);
      const lifecycleGeneration = beginRecordingLifecycle(session.id);
      const latestPoint = points.at(-1);

      if (latestPoint) {
        setCurrentLocation((currentPoint) =>
          !currentPoint ||
          getGpsTimestamp(latestPoint) >= getGpsTimestamp(currentPoint)
            ? latestPoint
            : currentPoint
        );
      }

      activeWalkRef.current = resumedWalk;
      setActiveWalk(resumedWalk);
      setBackgroundTrackingMessage("Recovered unfinished recording.");
      setBackgroundTrackingStatus("starting");

      refreshCurrentLocation({ allowLastKnown: false }).catch((error) =>
        console.warn("Failed to refresh resumed GPS fix", error)
      );
      startStepWatch(
        session.startedAt,
        session.id,
        lifecycleGeneration
      ).catch((error) =>
        console.warn("Failed to resume step counting", error)
      );
      enableBackgroundTracking(
        session.activityMode,
        session.id,
        lifecycleGeneration
      ).catch((error) =>
        console.warn("Failed to resume background tracking", error)
      );
    } catch (error) {
      console.warn("Failed to resume recovered recording", error);

      if (backgroundStopAttempted) {
        await restoreRecoverableRecordingProtection(recordingToResume);
      } else {
        setRecoverableRecording(recordingToResume);
        recoveryPromptedSessionRef.current = sessionId;
      }

      Alert.alert(
        "Recording not resumed",
        "The unfinished recording was kept so you can retry."
      );
    } finally {
      if (recoveryResumeTransitionRef.current === resumeTransition) {
        recoveryResumeTransitionRef.current = null;
      }

      isStartingRecordingRef.current = false;
      setIsStartingRecording(false);
    }
  }, [
    beginRecordingLifecycle,
    enableBackgroundTracking,
    recoverableRecording,
    refreshCurrentLocation,
    refreshSavedData,
    restoreRecoverableRecordingProtection,
    startStepWatch
  ]);

  const handleFinishRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording || isStoppingRecordingRef.current) {
      return;
    }

    isStoppingRecordingRef.current = true;
    invalidateRecordingLifecycle();
    setIsComputingRecording(true);
    const recordingToFinish = recoverableRecording;
    const sessionId = recordingToFinish.session.id;
    let endedAt = new Date().toISOString();
    const finishTransition = {
      activityMode: recordingToFinish.session.activityMode,
      sessionId
    };

    recoveryResumeTransitionRef.current = finishTransition;
    setRecoverableRecording(null);

    try {
      try {
        await stopBackgroundLocationTracking();
      } catch (error) {
        console.warn("Failed to stop background tracking", error);
        await restoreRecoverableRecordingProtection(recordingToFinish);
        Alert.alert(
          "Recording not finished",
          "Background tracking is still active. The unfinished recording was kept so you can retry."
        );
        return;
      }

      if (recoveryResumeTransitionRef.current === finishTransition) {
        recoveryResumeTransitionRef.current = null;
      }

      let session: WalkSession | null;
      let points: GpsPoint[];

      try {
        await flushPendingGpsPoints(sessionId);
        [session, points] = await Promise.all([
          getWalkSessionById(sessionId),
          getGpsPointsForSession(sessionId)
        ]);
      } catch (error) {
        console.warn("Failed to synchronize recovered recording", error);
        await restoreRecoverableRecordingProtection(recordingToFinish);
        Alert.alert(
          "Recording not finished",
          "The unfinished recording was kept so you can retry."
        );
        return;
      }

      if (!session) {
        await clearActiveRecordingSettings(sessionId).catch((error) =>
          console.warn("Failed to clear missing recovery settings", error)
        );
        recoveryPromptedSessionRef.current = null;
        Alert.alert(
          "Recording unavailable",
          "The unfinished recording no longer exists."
        );
        return;
      }

      if (
        new Date(session.endedAt).getTime() >
        new Date(session.startedAt).getTime()
      ) {
        await clearActiveRecordingSettings(sessionId).catch((error) =>
          console.warn("Failed to clear finalized recovery settings", error)
        );
        recoveryPromptedSessionRef.current = null;
        await refreshSavedData().catch((error) =>
          console.warn("Failed to refresh an already-saved recording", error)
        );
        Alert.alert(
          "Recording already saved",
          "This recording was already finalized."
        );
        return;
      }

      const recoveredWalk = createRecoveredActiveWalk(session, points);
      let savedSessionId: number | null;

      try {
        savedSessionId = await finishPersistedActiveWalk(
          recoveredWalk,
          endedAt,
          recoveredWalk.stepCount
        );
      } catch (error) {
        console.warn("Failed to finish recovered recording", error);
        await restoreRecoverableRecordingProtection(recordingToFinish);
        Alert.alert(
          "Recording not finished",
          "The unfinished recording was kept so you can retry."
        );
        return;
      }

      try {
        await clearActiveRecordingSettings(sessionId);
      } catch (error) {
        console.warn(
          "Finished recovered recording but could not clear settings",
          error
        );
      }
      recoveryPromptedSessionRef.current = null;

      if (!savedSessionId) {
        Alert.alert(
          "Walk discarded",
          "At least 2 valid GPS points are required to save a walk."
        );
        return;
      }

      try {
        if (recoveredWalk.activityMode === "walk") {
          try {
            const finalStepCount = await getStepCountBetween(
              recoveredWalk.startedAt,
              endedAt
            );
            await updateWalkSessionStepCount(savedSessionId, finalStepCount);
          } catch (error) {
            console.warn("Failed to finalize recovered step count", error);
          }
        }

        try {
          const finalizedPoints = await getGpsPointsForSession(savedSessionId);
          await persistRecordingExplorationDelta(
            savedSessionId,
            recoveredWalk.activityMode,
            finalizedPoints
          );
        } catch (error) {
          console.warn(
            "Recovered recording saved but cache update failed",
            error
          );
        }

        await refreshSavedData();
        await waitForMapRenderCommit();
      } catch (error) {
        console.warn("Recovered recording saved but refresh failed", error);
        Alert.alert(
          "Recording saved",
          "The recording is safe. Some map details will refresh later."
        );
      }
    } finally {
      if (recoveryResumeTransitionRef.current === finishTransition) {
        recoveryResumeTransitionRef.current = null;
      }

      isStoppingRecordingRef.current = false;
      setIsComputingRecording(false);
    }
  }, [
    invalidateRecordingLifecycle,
    recoverableRecording,
    refreshSavedData,
    restoreRecoverableRecordingProtection
  ]);

  const handleDiscardRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording || isStoppingRecordingRef.current) {
      return;
    }

    const recordingToDiscard = recoverableRecording;
    const discardTransition = {
      activityMode: recordingToDiscard.session.activityMode,
      sessionId: recordingToDiscard.session.id
    };

    isStoppingRecordingRef.current = true;
    invalidateRecordingLifecycle();
    setIsComputingRecording(true);
    recoveryResumeTransitionRef.current = discardTransition;
    setRecoverableRecording(null);
    stopStepWatch();

    try {
      try {
        await stopBackgroundLocationTracking();
      } catch (error) {
        console.warn("Failed to stop background tracking before discard", error);
        await restoreRecoverableRecordingProtection(recordingToDiscard);
        Alert.alert(
          "Recording not discarded",
          "Background tracking is still active. The unfinished recording was kept so you can retry."
        );
        return;
      }

      if (recoveryResumeTransitionRef.current === discardTransition) {
        recoveryResumeTransitionRef.current = null;
      }

      try {
        await deleteWalkSession(recordingToDiscard.session.id);
      } catch (error) {
        console.warn("Failed to discard recovered recording", error);
        await restoreRecoverableRecordingProtection(recordingToDiscard);
        Alert.alert(
          "Recording not discarded",
          "The unfinished recording was kept so you can retry."
        );
        return;
      }

      discardPendingGpsPoints(recordingToDiscard.session.id);

      try {
        await clearActiveRecordingSettings(recordingToDiscard.session.id);
      } catch (error) {
        console.warn("Discarded recording but could not clear settings", error);
      }
      recoveryPromptedSessionRef.current = null;

      try {
        await refreshSavedData();
      } catch (error) {
        console.warn("Discarded recording but refresh failed", error);
      }
    } finally {
      if (recoveryResumeTransitionRef.current === discardTransition) {
        recoveryResumeTransitionRef.current = null;
      }

      isStoppingRecordingRef.current = false;
      setIsComputingRecording(false);
    }
  }, [
    invalidateRecordingLifecycle,
    recoverableRecording,
    refreshSavedData,
    restoreRecoverableRecordingProtection,
    stopStepWatch
  ]);

  const handleDeleteWalk = useCallback(
    (sessionId: number) => {
      Alert.alert("Delete recording?", "This removes the walk and its exploration progress.", [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteWalkSession(sessionId);
              setSelectedSessionId((currentSessionId) =>
                currentSessionId === sessionId ? null : currentSessionId
              );
              await refreshSavedData();
            } catch (error) {
              console.warn("Failed to delete recording", error);
              Alert.alert(
                "Recording not deleted",
                "Street Explorer kept the recording because its data could not be removed safely."
              );
            }
          }
        }
      ]);
    },
    [refreshSavedData]
  );

  const handleRenameWalk = useCallback(
    async (sessionId: number, displayName: string) => {
      await updateWalkSessionName(sessionId, displayName);
      setWalks((currentWalks) =>
        currentWalks.map((walk) => (walk.id === sessionId ? { ...walk, displayName } : walk))
      );
      setHistory((currentHistory) =>
        currentHistory.map((walk) => (walk.id === sessionId ? { ...walk, displayName } : walk))
      );
    },
    []
  );

  const handleExportWalkGpx = useCallback(async (sessionId: number) => {
    try {
      const [session, points] = await Promise.all([
        getWalkSessionById(sessionId),
        getGpsPointsForSession(sessionId)
      ]);

      if (!session) {
        Alert.alert("Export unavailable", "This recording could not be found.");
        return;
      }

      if (points.length === 0) {
        Alert.alert("Export unavailable", "This recording has no GPS points.");
        return;
      }

      await exportWalkGpx(session, points);
    } catch (error) {
      console.warn("Failed to export GPX", error);
      Alert.alert("Export failed", "Street Explorer could not export this recording.");
    }
  }, []);

  const handleExportBackup = useCallback(async () => {
    try {
      await exportBackupJson();
    } catch (error) {
      console.warn("Failed to export backup", error);
      Alert.alert(strings.map.backupFailedTitle, strings.map.backupFailedMessage);
    }
  }, [strings]);

  const handleImportBackup = useCallback(() => {
    if (activeWalk) {
      Alert.alert(strings.map.recordingActive, strings.map.recordingActiveBackup);
      return;
    }

    Alert.alert(
      strings.map.restoreBackupTitle,
      strings.map.restoreBackupMessage,
      [
        {
          text: strings.common.cancel,
          style: "cancel"
        },
        {
          text: strings.common.restore,
          style: "destructive",
          onPress: async () => {
            try {
              const imported = await importBackupJson();

              if (imported) {
                await clearActiveRecordingSettings();
                setSelectedSessionId(null);
                await refreshSavedData();
              }
            } catch (error) {
              console.warn("Failed to import backup", error);
              Alert.alert(strings.map.restoreFailedTitle, strings.map.restoreFailedMessage);
            }
          }
        }
      ]
    );
  }, [activeWalk, refreshSavedData, strings]);

  useEffect(() => {
    if (!historyVisible) {
      return;
    }

    loadDetailedWalks().catch((error) =>
      console.warn("Failed to load recording details", error)
    );
  }, [historyVisible, loadDetailedWalks]);

  useEffect(
    () => () => {
      invalidateRecordingLifecycle();
      stopStepWatch();
    },
    [invalidateRecordingLifecycle, stopStepWatch]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateTransitionGenerationRef.current += 1;
      const transitionGeneration = appStateTransitionGenerationRef.current;

      if (nextState !== "active") {
        setIsAppActive(false);
        return;
      }

      setIsAppActive(true);
      const permissionRefresh = getForegroundLocationPermission()
        .then(setPermissionState)
        .catch((error) =>
          console.warn("Failed to refresh foreground permission", error)
        );
      const sessionId = activeWalk?.sessionId;
      const recordingSync = sessionId
        ? syncActiveWalkFromDatabase(sessionId).catch((error) =>
            console.warn("Failed to sync active recording", error)
          )
        : Promise.resolve();

      Promise.allSettled([permissionRefresh, recordingSync]).finally(() => {
        if (
          appStateTransitionGenerationRef.current === transitionGeneration &&
          AppState.currentState === "active"
        ) {
          setIsAppActive(true);
        }
      });
    });

    return () => {
      appStateTransitionGenerationRef.current += 1;
      subscription.remove();
    };
  }, [activeWalk?.sessionId, syncActiveWalkFromDatabase]);

  return (
    <View style={styles.screen}>
      <ExplorationMap
        activeExplorationCellIds={activeWalk?.exploredCellIds ?? []}
        activeRouteChunks={activeWalk?.routeChunks ?? []}
        walks={walks}
        explorationEnabled={isExplorationEnabled}
        pathWalks={displayedWalks}
        activePoints={activeWalk?.points ?? []}
        activeMode={activeWalk?.activityMode ?? activityMode}
        currentLocation={currentLocation}
        highlightedSessionId={selectedSessionId}
        layers={layers}
        onMapReady={() => {
          isMapReadyRef.current = true;
          setIsMapReady(true);
          setTimeout(() => setIsExplorationEnabled(true), 0);
        }}
        onVisibleRegionChange={handleVisibleRegionChange}
        selectedZone={selectedZone}
        savedExplorationCellIds={savedExplorationCellIds}
        todayNewCellIds={todayNewCellIds}
        zoneFocusRequestId={zoneFocusRequestId}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topPanel}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Image
                resizeMode="contain"
                source={require("../../assets/title.png")}
                style={styles.logo}
              />
              <Text style={styles.version}>v{APP_VERSION}</Text>
            </View>
          </View>
          <View style={styles.objectiveRow}>
            {objective ? (
              <ObjectiveHud
                objective={objective}
                language={language}
                stats={objectiveStats}
                todayCellCount={todayObjectiveCellCount}
                onClear={async () => {
                  setObjective(null);
                  setObjectiveStats(null);
                  await saveCompletionObjective(null);
                }}
              />
            ) : (
              <View style={styles.objectiveSpacer} />
            )}
            <LayerControls layers={layers} onToggleLayer={toggleLayer} />
          </View>
        </View>

        {permissionState === "denied" ? (
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionTitle}>{strings.map.locationOff}</Text>
            <Text style={styles.permissionText}>
              {strings.map.locationOffText}
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomPanel}>
          <View style={styles.bottomTabs}>
            <TouchableOpacity
              accessibilityLabel={strings.common.details}
              accessibilityRole="button"
              onPress={() => setDashboardExpanded(true)}
              style={[styles.bottomTab, dashboardExpanded ? styles.activeBottomTab : null]}
            >
              <Ionicons
                name="footsteps-outline"
                size={19}
                color={dashboardExpanded ? "#02060a" : "#f8fafc"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={strings.common.history}
              accessibilityRole="button"
              onPress={() => setHistoryVisible(true)}
              style={styles.bottomTab}
            >
              <Ionicons name="time-outline" size={19} color="#f8fafc" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={strings.common.completion}
              accessibilityRole="button"
              onPress={() => setCompletionVisible(true)}
              style={styles.bottomTab}
            >
              <Ionicons name="trophy-outline" size={19} color="#f8fafc" />
            </TouchableOpacity>
            <View style={styles.bottomTabSpacer} />
            <TouchableOpacity
              accessibilityLabel={strings.common.options}
              accessibilityRole="button"
              onPress={() => setOptionsVisible(true)}
              style={[styles.bottomTab, optionsVisible ? styles.activeBottomTab : null]}
            >
              <Ionicons
                name="options-outline"
                size={19}
                color={optionsVisible ? "#02060a" : "#f8fafc"}
              />
            </TouchableOpacity>
          </View>
          <WalkControls
            activityMode={activeWalk?.activityMode ?? activityMode}
            acceptedGpsPointCount={activeWalk?.acceptedGpsPointCount ?? 0}
            backgroundStatus={backgroundTrackingStatus}
            isFinalizing={isComputingRecording}
            isRecording={Boolean(activeWalk)}
            isStarting={isStartingRecording}
            distanceMeters={activeWalk?.distanceMeters ?? 0}
            durationSeconds={elapsedSeconds}
            gpsAccuracyMeters={currentLocation?.accuracy}
            gpsStatus={activeWalk?.lastRejectedPointReason}
            latestPointTimestamp={activeWalk?.points.at(-1)?.timestamp ?? null}
            pointCount={activeWalk?.acceptedGpsPointCount ?? 0}
            rejectedGpsPointCount={activeWalk?.rejectedGpsPointCount ?? 0}
            speedMetersPerSecond={activeWalk?.currentSpeedMetersPerSecond ?? 0}
            stepCount={activeWalk?.stepCount ?? 0}
            todayStepCount={stats.todayStepCount + (activeWalk?.stepCount ?? 0)}
            language={language}
            recordingQuality={recordingQuality}
            onStart={handleStartWalk}
            onStop={handleRequestStopWalk}
          />
        </View>
      </SafeAreaView>

      <OptionsModal
        language={language}
        layers={layers}
        mode={pathDisplayMode}
        onChangeLanguage={onChangeLanguage}
        onChangePathDisplayMode={setPathDisplayMode}
        onClose={() => setOptionsVisible(false)}
        onToggleLayer={toggleLayer}
        selectedSessionId={selectedSessionId}
        visible={optionsVisible}
      />
      <DetailsModal
        activeWalk={activeWalk}
        activityMode={activityMode}
        backgroundMessage={backgroundTrackingMessage}
        backgroundStatus={backgroundTrackingStatus}
        currentLocation={currentLocation}
        language={language}
        layers={layers}
        mode={pathDisplayMode}
        onChangeMode={setPathDisplayMode}
        onClose={() => setDashboardExpanded(false)}
        onOpenHistory={() => {
          setDashboardExpanded(false);
          setHistoryVisible(true);
        }}
        onReprocessRecordings={handleReprocessRecordings}
        objectiveStats={objectiveStats}
        recordingQuality={recordingQuality}
        selectedSessionId={selectedSessionId}
        stats={displayStats}
        visible={dashboardExpanded}
        history={history}
      />

      <WalkHistoryModal
        activityMode={activityMode}
        detailedWalks={walks}
        language={language}
        loopFillSummaries={loopFillSummaries}
        visible={historyVisible}
        walks={history}
        selectedSessionId={selectedSessionId}
        onClose={() => setHistoryVisible(false)}
        onDeleteWalk={handleDeleteWalk}
        onExportBackup={handleExportBackup}
        onExportWalkGpx={handleExportWalkGpx}
        onImportBackup={handleImportBackup}
        onRenameWalk={handleRenameWalk}
        onSelectWalk={setSelectedSessionId}
        onOpenDiagnostics={() => {
          setHistoryVisible(false);
          setDiagnosticsVisible(true);
        }}
      />
      <RecordingRecoveryModal
        onDiscard={handleDiscardRecoveredRecording}
        onFinish={handleFinishRecoveredRecording}
        onResume={handleResumeRecoveredRecording}
        recording={recoverableRecording}
      />
      <CompletionModal
        currentObjective={objective}
        currentObjectiveStats={objectiveStats}
        currentObjectiveTodayCells={todayObjectiveCellCount}
        currentLocation={completionReferenceLocation}
        language={language}
        onClose={() => setCompletionVisible(false)}
        onFocusZone={(zone) => {
          setSelectedZone(zone);
          setZoneFocusRequestId((requestId) => requestId + 1);
          setCompletionVisible(false);
        }}
        onSetObjective={(nextObjective) => {
          setObjective(nextObjective);
          setSelectedZone(nextObjective.zone);
          saveCompletionObjective({
            mode: nextObjective.mode,
            zoneId: nextObjective.zone.id
          }).catch((error) => console.warn("Failed to save completion objective", error));
          setCompletionVisible(false);
        }}
        visible={completionVisible}
      />
      <RecordingDiagnosticsModal
        activeWalk={activeWalk}
        backgroundMessage={backgroundTrackingMessage}
        backgroundStatus={backgroundTrackingStatus}
        currentLocation={currentLocation}
        onClose={() => setDiagnosticsVisible(false)}
        recordingQuality={recordingQuality}
        visible={diagnosticsVisible}
      />
      <StopRecordingConfirmationModal
        activityMode={activeWalk?.activityMode ?? activityMode}
        language={language}
        onCancel={() => setStopConfirmationVisible(false)}
        onConfirm={handleStopWalk}
        visible={stopConfirmationVisible}
      />
      <RecordingSummaryModal
        language={language}
        onClose={() => setRecordingSummary(null)}
        onSaveName={async (displayName) => {
          if (!recordingSummary || displayName.trim().length === 0) {
            setRecordingSummary(null);
            return;
          }

          await updateWalkSessionName(recordingSummary.sessionId, displayName.trim());
          setWalks((currentWalks) =>
            currentWalks.map((walk) =>
              walk.id === recordingSummary.sessionId
                ? { ...walk, displayName: displayName.trim() }
                : walk
            )
          );
          setHistory((currentHistory) =>
            currentHistory.map((walk) =>
              walk.id === recordingSummary.sessionId
                ? { ...walk, displayName: displayName.trim() }
                : walk
            )
          );
          setRecordingSummary(null);
        }}
        summary={recordingSummary}
      />
      <ReprocessingModal language={language} progress={reprocessProgress} />
      {!isLaunchDismissed ? (
        <LaunchLoadingOverlay
          isReady={isLaunchReady}
          language={language}
        />
      ) : null}
    </View>
  );
}

function calculateLastSpeedMetersPerSecond(points: GpsPoint[]) {
  const previousPoint = points.at(-2);
  const latestPoint = points.at(-1);

  if (!previousPoint || !latestPoint) {
    return 0;
  }

  const secondsBetweenPoints = Math.max(
    0,
    (new Date(latestPoint.timestamp).getTime() - new Date(previousPoint.timestamp).getTime()) /
      1000
  );

  if (secondsBetweenPoints === 0) {
    return 0;
  }

  return calculatePathDistanceMeters([previousPoint, latestPoint]) / secondsBetweenPoints;
}

function ObjectiveHud({
  objective,
  language,
  stats,
  todayCellCount,
  onClear
}: {
  objective: CompletionObjective;
  language: AppLanguage;
  stats: ZoneCompletionStats | null;
  todayCellCount: number;
  onClear: () => void;
}) {
  const remainingCells = getObjectiveRemainingCells(stats);
  const objectiveProgress =
    stats?.completionPercent === null || stats?.completionPercent === undefined
      ? 0
      : Math.max(0, Math.min(100, stats.completionPercent));

  return (
    <View style={styles.objectiveHud}>
      <View style={styles.objectiveText}>
        <Text style={styles.objectiveLabel}>
          {objective.zone.type === "district" ? "District objective" : `${objective.zone.type} objective`}
        </Text>
        <Text numberOfLines={1} style={styles.objectiveName}>{objective.zone.name}</Text>
        <View style={styles.objectiveMetricRow}>
          <Text style={styles.objectivePercent}>{formatObjectiveCompletion(stats)}</Text>
          <Text style={styles.objectiveMeta}>{formatObjectiveMode(objective.mode, language)}</Text>
        </View>
        <Text style={styles.objectiveMeta}>
          {remainingCells === null
            ? `${stats?.exploredCells ?? 0} cells explored`
            : `${remainingCells} cells remaining`}
        </Text>
        <View style={styles.objectiveProgressTrack}>
          <View style={[styles.objectiveProgressFill, { width: `${objectiveProgress}%` }]} />
        </View>
        <Text style={styles.objectiveToday}>+{todayCellCount} cells today</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" onPress={onClear} style={styles.objectiveClear}>
        <Ionicons name="close" size={17} color="#f8fafc" />
      </TouchableOpacity>
    </View>
  );
}

function LayerControls({
  layers,
  onToggleLayer
}: {
  layers: MapLayerState;
  onToggleLayer: (layer: keyof MapLayerState) => void;
}) {
  return (
    <View style={styles.layerControls}>
      <LayerIconButton
        active={layers.showPaths}
        accessibilityLabel="Toggle paths"
        icon="git-branch-outline"
        onPress={() => onToggleLayer("showPaths")}
      />
      <LayerIconButton
        active={layers.showExploredCells}
        accessibilityLabel="Toggle explored cells"
        icon="grid-outline"
        onPress={() => onToggleLayer("showExploredCells")}
      />
      <LayerIconButton
        active={layers.showMarkers}
        accessibilityLabel="Toggle pins"
        icon="flag-outline"
        onPress={() => onToggleLayer("showMarkers")}
      />
    </View>
  );
}

function LayerIconButton({
  accessibilityLabel,
  active,
  icon,
  onPress
}: {
  accessibilityLabel: string;
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.layerControlButton, active ? styles.activeLayerControlButton : null]}
    >
      <Ionicons name={icon} size={14} color={active ? "#02060a" : "#f8fafc"} />
    </TouchableOpacity>
  );
}

function ReprocessingModal({
  language,
  progress
}: {
  language: AppLanguage;
  progress: ReprocessProgress | null;
}) {
  if (!progress) {
    return null;
  }

  const isFrench = language === "fr";
  const phaseLabels: Record<ReprocessProgress["phase"], string> = isFrench
    ? {
        contours: "Calcul des zones fermées",
        preparing: "Préparation des enregistrements",
        refreshing: "Actualisation de la carte",
        routes: "Reconstruction des trajets",
        saving: "Enregistrement sécurisé",
        streets: "Réparation unique du réseau routier"
      }
    : {
        contours: "Calculating enclosed areas",
        preparing: "Preparing recordings",
        refreshing: "Refreshing the map",
        routes: "Rebuilding routes",
        saving: "Saving verified progress",
        streets: "Repairing street coverage once"
      };
  const routeProgress = progress.total > 0
    ? Math.max(0, Math.min(1, progress.completed / progress.total))
    : 0;
  const displayedProgress = progress.phase === "preparing"
    ? 0.03
    : progress.phase === "streets"
      ? 0.05 + routeProgress * 0.12
      : progress.phase === "routes"
        ? 0.17 + routeProgress * 0.63
        : progress.phase === "contours"
          ? 0.84
          : progress.phase === "saving"
            ? 0.93
            : 0.98;
  const progressWidth = (Math.round(displayedProgress * 100) + "%") as DimensionValue;

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.computingOverlay}>
        <View style={styles.computingDialog}>
          <ActivityIndicator color="#9cff00" size="large" />
          <Text style={styles.computingTitle}>
            {isFrench ? "Recalcul en cours" : "Reprocessing"}
          </Text>
          <Text style={styles.computingText}>{phaseLabels[progress.phase]}</Text>
          {progress.total > 0 ? (
            <Text style={styles.reprocessCounter}>
              {progress.completed} / {progress.total}
            </Text>
          ) : null}
          <View style={styles.reprocessProgressTrack}>
            <View
              style={[
                styles.reprocessProgressFill,
                { width: progressWidth }
              ]}
            />
          </View>
          <Text style={styles.computingText}>
            {isFrench
              ? "Ne fermez pas l'application. Votre progression existante reste protégée."
              : "Keep the app open. Existing progress remains protected."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const STOP_CONFIRM_HOLD_MS = 1300;

function StopRecordingConfirmationModal({
  activityMode,
  language,
  onCancel,
  onConfirm,
  visible
}: {
  activityMode: ActivityMode;
  language: AppLanguage;
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartedAtRef = useRef<number | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFrench = language === "fr";
  const recordingNoun = ACTIVITY_MODE_TEXT[language].recordingNouns[activityMode];

  const clearHold = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    holdStartedAtRef.current = null;
    setHoldProgress(0);
  }, []);

  useEffect(() => {
    if (!visible) {
      clearHold();
    }

    return clearHold;
  }, [clearHold, visible]);

  const startHold = useCallback(() => {
    clearHold();
    holdStartedAtRef.current = Date.now();
    setHoldProgress(0);

    progressTimerRef.current = setInterval(() => {
      if (!holdStartedAtRef.current) {
        return;
      }

      const elapsed = Date.now() - holdStartedAtRef.current;
      setHoldProgress(Math.min(1, elapsed / STOP_CONFIRM_HOLD_MS));
    }, 40);
  }, [clearHold]);

  const confirmQuit = useCallback(() => {
    clearHold();
    onConfirm();
  }, [clearHold, onConfirm]);

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={styles.stopConfirmOverlay}>
        <View style={styles.stopConfirmDialog}>
          <View style={styles.stopConfirmIcon}>
            <Ionicons name="stop-circle" size={30} color="#fecaca" />
          </View>
          <Text style={styles.stopConfirmTitle}>
            {isFrench ? "Quitter l'enregistrement ?" : `Quit ${recordingNoun}?`}
          </Text>
          <Text style={styles.stopConfirmText}>
            {isFrench
              ? "Touchez Continuer pour garder l'enregistrement actif. Maintenez Quitter pour terminer."
              : "Tap Continue to keep recording. Hold Quit to finish."}
          </Text>
          <View style={styles.stopConfirmActions}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.stopConfirmContinue}
            >
              <Text style={styles.stopConfirmContinueText}>
                {isFrench ? "Continuer" : "Continue"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityActions={[
                {
                  label: isFrench
                    ? "Terminer l'enregistrement"
                    : "Finish recording",
                  name: "confirmQuit"
                }
              ]}
              accessibilityHint={
                isFrench
                  ? "Maintenez, ou utilisez l'action Terminer l'enregistrement"
                  : "Press and hold, or use the Finish recording accessibility action"
              }
              accessibilityLabel={
                isFrench ? "Maintenir Quitter" : "Hold Quit"
              }
              accessibilityRole="button"
              delayLongPress={STOP_CONFIRM_HOLD_MS}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "confirmQuit") {
                  confirmQuit();
                }
              }}
              onLongPress={confirmQuit}
              onPress={clearHold}
              onPressIn={startHold}
              onPressOut={clearHold}
              style={styles.stopConfirmQuit}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.stopConfirmQuitFill,
                  { width: `${Math.round(holdProgress * 100)}%` }
                ]}
              />
              <View style={styles.stopConfirmQuitContent}>
                <Ionicons name="hand-left-outline" size={17} color="#ffffff" />
                <Text style={styles.stopConfirmQuitText}>
                  {isFrench ? "Maintenir Quitter" : "Hold Quit"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RecordingSummaryModal({
  language,
  onClose,
  onSaveName,
  summary
}: {
  language: AppLanguage;
  onClose: () => void;
  onSaveName: (displayName: string) => void;
  summary: RecordingSummary | null;
}) {
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (summary) {
      setDisplayName("");
    }
  }, [summary]);

  if (!summary) {
    return null;
  }

  const isFrench = language === "fr";
  const objectiveDelta = getObjectiveProgressDelta(summary.objectiveBefore, summary.objectiveAfter);
  const milestoneBadges = getRecordingMilestones(summary, language);

  return (
    <Modal animationType="slide" transparent visible>
      <View style={styles.summaryBackdrop}>
        <View style={styles.summaryDialog}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryTitle}>
                {isFrench ? "Enregistrement terminé" : "Recording complete"}
              </Text>
              <Text style={styles.summarySubtitle}>
                {isFrench ? "Résumé et nom de la sortie" : "Summary and recording name"}
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.summaryClose}>
              <Ionicons name="close" size={20} color="#f8fafc" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryMetric label={isFrench ? "Distance" : "Distance"} value={formatDistance(summary.distanceMeters)} />
            <SummaryMetric label={isFrench ? "Durée" : "Duration"} value={formatDuration(summary.durationSeconds)} />
            <SummaryMetric label={isFrench ? "Pas" : "Steps"} value={summary.finalStepCount.toLocaleString()} />
            <SummaryMetric label={isFrench ? "Qualité" : "Quality"} value={`${summary.quality.label} ${summary.quality.score}/100`} />
            <SummaryMetric label={isFrench ? "Nouvelles cellules" : "New cells"} value={String(summary.newCellCount)} />
            <SummaryMetric label={isFrench ? "Boucles" : "Loops"} value={formatLoopResultShort(summary.loopResult, language)} />
          </View>

          <View style={styles.summaryGrid}>
            <SummaryMetric label={isFrench ? "Objectif" : "Objective"} value={formatObjectiveDelta(objectiveDelta, language)} />
            <SummaryMetric label="GPS" value={formatGpsSummary(summary.gpsPausedEventCount, language)} />
          </View>
          <View style={styles.summaryProgressPanel}>
            <Text style={styles.summaryNote}>
              {formatObjectiveProgressLine(summary.objectiveBefore, summary.objectiveAfter, language)}
            </Text>
            <Text style={styles.summaryNote}>{formatLoopResultLine(summary.loopResult)}</Text>
          </View>
          {milestoneBadges.length > 0 ? (
            <View style={styles.badgeRow}>
              {milestoneBadges.map((badge) => (
                <View key={badge.label} style={[styles.badge, styles.unlockedBadge]}>
                  <Ionicons name={badge.icon} size={15} color="#02060a" />
                  <Text style={[styles.badgeText, styles.unlockedBadgeText]}>{badge.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.summaryNote}>{summary.quality.reason}</Text>
          <TextInput
            onChangeText={setDisplayName}
            placeholder={isFrench ? "Nom de l'enregistrement" : "Recording name"}
            placeholderTextColor="#64748b"
            style={styles.summaryInput}
            value={displayName}
          />

          <View style={styles.summaryActions}>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.summarySecondary}>
              <Text style={styles.summarySecondaryText}>{isFrench ? "Ignorer" : "Skip"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => onSaveName(displayName)}
              style={styles.summaryPrimary}
            >
              <Ionicons name="checkmark" size={18} color="#ffffff" />
              <Text style={styles.summaryPrimaryText}>{isFrench ? "Enregistrer" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}

function getObjectiveProgressDelta(
  before: ZoneCompletionStats | null,
  after: ZoneCompletionStats | null
) {
  return {
    cells: (after?.exploredCells ?? 0) - (before?.exploredCells ?? 0),
    percent:
      after?.completionPercent !== null &&
      after?.completionPercent !== undefined &&
      before?.completionPercent !== null &&
      before?.completionPercent !== undefined
        ? Math.round((after.completionPercent - before.completionPercent) * 10) / 10
        : null
  };
}

function formatObjectiveDelta(
  delta: { cells: number; percent: number | null },
  language: AppLanguage
) {
  if (delta.cells === 0 && (delta.percent === null || delta.percent === 0)) {
    return language === "fr" ? "inchange" : "unchanged";
  }

  const percentText = delta.percent !== null && delta.percent !== 0
    ? `, ${delta.percent > 0 ? "+" : ""}${delta.percent}%`
    : "";

  return `${delta.cells > 0 ? "+" : ""}${delta.cells} cells${percentText}`;
}

function formatObjectiveProgressLine(
  before: ZoneCompletionStats | null,
  after: ZoneCompletionStats | null,
  language: AppLanguage
) {
  if (!after) {
    return language === "fr"
      ? "Aucun objectif actif pendant cette sortie."
      : "No active objective during this recording.";
  }

  const remainingCells = after.totalZoneCells === null
    ? null
    : Math.max(0, after.totalZoneCells - after.exploredCells);
  const delta = getObjectiveProgressDelta(before, after);
  const completion = after.completionPercent === null
    ? getStrings(language).common.pending
    : `${after.completionPercent}%`;

  if (language === "fr") {
    return `${completion} sur l'objectif, ${remainingCells ?? "?"} cellules restantes, ${delta.cells >= 0 ? "+" : ""}${delta.cells} cellules sur cette sortie.`;
  }

  return `${completion} objective progress, ${remainingCells ?? "?"} cells remaining, ${delta.cells >= 0 ? "+" : ""}${delta.cells} cells from this recording.`;
}

function formatGpsSummary(pausedEventCount: number, language: AppLanguage) {
  if (pausedEventCount === 0) {
    return language === "fr" ? "propre" : "clean";
  }

  return language === "fr" ? `${pausedEventCount} pauses` : `${pausedEventCount} paused`;
}

function getRecordingMilestones(summary: RecordingSummary, language: AppLanguage) {
  const isFrench = language === "fr";
  const milestones: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string }> = [];

  if (summary.newCellCount >= 1000) {
    milestones.push({
      icon: "grid-outline",
      label: isFrench ? "1000 cellules" : "1000 cells"
    });
  }

  if (summary.distanceMeters >= 25000) {
    milestones.push({ icon: "map-outline", label: "25 km" });
  } else if (summary.distanceMeters >= 10000) {
    milestones.push({ icon: "map-outline", label: "10 km" });
  } else if (summary.distanceMeters >= 5000) {
    milestones.push({ icon: "map-outline", label: "5 km" });
  }

  if ((summary.objectiveAfter?.completionPercent ?? 0) >= 5) {
    milestones.push({
      icon: "flag-outline",
      label: isFrench ? "Quartier 5%" : "District 5%"
    });
  }

  if (summary.gpsPausedEventCount === 0 && summary.quality.score >= 80) {
    milestones.push({
      icon: "checkmark-circle-outline",
      label: isFrench ? "GPS propre" : "Clean GPS"
    });
  }

  return milestones;
}

function formatLoopResultShort(result: LoopProcessingResult, language: AppLanguage) {
  if (result.status === "filled") {
    return language === "fr"
      ? `${result.filledLoopCount} / ${result.filledCellCount} cellules`
      : `${result.filledLoopCount} / ${result.filledCellCount} cells`;
  }

  if (result.status === "rejected") {
    return language === "fr" ? `${result.rejectedLoopCount} rejetées` : `${result.rejectedLoopCount} rejected`;
  }

  return language === "fr" ? "aucune" : "none";
}

function OptionsModal({
  language,
  layers,
  mode,
  onChangeLanguage,
  onChangePathDisplayMode,
  onClose,
  onToggleLayer,
  selectedSessionId,
  visible
}: {
  language: AppLanguage;
  layers: MapLayerState;
  mode: PathDisplayMode;
  onChangeLanguage: (language: AppLanguage) => void;
  onChangePathDisplayMode: (mode: PathDisplayMode) => void;
  onClose: () => void;
  onToggleLayer: (layer: keyof MapLayerState) => void;
  selectedSessionId: number | null;
  visible: boolean;
}) {
  const strings = getStrings(language);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.detailsScreen}>
        <View style={styles.fullScreenHeader}>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.backToMapButton}>
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </TouchableOpacity>
          <View>
            <Text style={styles.fullScreenTitle}>{strings.common.options}</Text>
            <Text style={styles.fullScreenSubtitle}>{strings.options.subtitle}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.detailsContent}>
          <View style={styles.optionPanel}>
            <Text style={styles.pathDisplayTitle}>{strings.common.language}</Text>
            <View style={styles.optionRows}>
              {APP_LANGUAGES.map((option) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={option.code}
                  onPress={() => onChangeLanguage(option.code)}
                  style={[
                    styles.optionButton,
                    language === option.code ? styles.selectedPathDisplayButton : null
                  ]}
                >
                  <Ionicons name="language-outline" size={17} color="#f8fafc" />
                  <Text
                    style={[
                      styles.pathDisplayButtonText,
                      language === option.code ? styles.selectedPathDisplayButtonText : null
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <PathDisplayControls
            language={language}
            mode={mode}
            selectedSessionId={selectedSessionId}
            onChangeMode={onChangePathDisplayMode}
          />

          <View style={styles.optionPanel}>
            <Text style={styles.pathDisplayTitle}>{strings.options.layers}</Text>
            <View style={styles.optionRows}>
              <OptionToggle
                active={layers.showPaths}
                icon="git-branch-outline"
                label={strings.mapLegend.savedRoute}
                onPress={() => onToggleLayer("showPaths")}
              />
              <OptionToggle
                active={layers.showExploredCells}
                icon="grid-outline"
                label={strings.mapLegend.exploredCells}
                onPress={() => onToggleLayer("showExploredCells")}
              />
              <OptionToggle
                active={layers.showMarkers}
                icon="flag-outline"
                label={language === "fr" ? "Repères" : "Pins"}
                onPress={() => onToggleLayer("showMarkers")}
              />
            </View>
          </View>

          <ModeProfilePanel activityMode="walk" language={language} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function OptionToggle({
  active,
  icon,
  label,
  onPress
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.optionButton, active ? styles.selectedPathDisplayButton : null]}
    >
      <Ionicons name={icon} size={17} color={active ? "#ffffff" : "#f8fafc"} />
      <Text
        style={[
          styles.pathDisplayButtonText,
          active ? styles.selectedPathDisplayButtonText : null
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DetailsModal({
  activeWalk,
  activityMode,
  backgroundMessage,
  backgroundStatus,
  currentLocation,
  language,
  layers,
  mode,
  onChangeMode,
  onClose,
  onOpenHistory,
  onReprocessRecordings,
  objectiveStats,
  recordingQuality,
  selectedSessionId,
  stats,
  visible,
  history
}: {
  activeWalk: ActiveWalk | null;
  activityMode: ActivityMode;
  backgroundMessage: string | null;
  backgroundStatus: BackgroundTrackingStatus;
  currentLocation: GpsPoint | null;
  language: AppLanguage;
  layers: MapLayerState;
  mode: PathDisplayMode;
  onChangeMode: (mode: PathDisplayMode) => void;
  onClose: () => void;
  onOpenHistory: () => void;
  onReprocessRecordings: () => void;
  objectiveStats: ZoneCompletionStats | null;
  recordingQuality: ReturnType<typeof calculateRecordingQuality>;
  selectedSessionId: number | null;
  stats: LifetimeStats;
  visible: boolean;
  history: WalkSession[];
}) {
  const strings = getStrings(language);
  const modeLabel = ACTIVITY_MODE_TEXT[language].labels[activityMode];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.detailsScreen}>
        <View style={styles.fullScreenHeader}>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.backToMapButton}>
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </TouchableOpacity>
          <View>
            <Text style={styles.fullScreenTitle}>{strings.common.details}</Text>
            <Text style={styles.fullScreenSubtitle}>
              {interpolate(strings.details.mapSubtitle, { mode: modeLabel })}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.detailsContent}>
          <StatsPanel activityMode={activityMode} language={language} stats={stats} />
          <GameProgressPanel
            language={language}
            objectiveStats={objectiveStats}
            stats={stats}
            sessions={history}
          />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onReprocessRecordings}
            style={styles.dashboardToggle}
          >
            <Ionicons name="sync-outline" size={18} color="#f8fafc" />
            <Text style={styles.dashboardToggleText}>{strings.details.reprocessRecordings}</Text>
          </TouchableOpacity>
          <MapLegend
            language={language}
            showExploredCells={layers.showExploredCells}
            showPaths={layers.showPaths}
          />
          <RecordingDiagnosticsPanel
            activeWalk={activeWalk}
            backgroundMessage={backgroundMessage}
            backgroundStatus={backgroundStatus}
            currentLocation={currentLocation}
            recordingQuality={recordingQuality}
          />
          <RecordingHealthPanel
            activeWalk={activeWalk}
            backgroundMessage={backgroundMessage}
            backgroundStatus={backgroundStatus}
          />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onOpenHistory}
            style={styles.dashboardToggle}
          >
            <Ionicons name="time-outline" size={18} color="#f8fafc" />
            <Text style={styles.dashboardToggleText}>{strings.details.openHistory}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function GameProgressPanel({
  language,
  objectiveStats,
  stats,
  sessions
}: {
  language: AppLanguage;
  objectiveStats: ZoneCompletionStats | null;
  stats: LifetimeStats;
  sessions: WalkSession[];
}) {
  const isFrench = language === "fr";
  const weekDistanceMeters = getRecentDistanceMeters(sessions, 7);
  const dailyCellGoal = 50;
  const weeklyDistanceGoalMeters = 10000;
  const objectivePercent = objectiveStats?.completionPercent ?? null;
  const badges = getAchievementBadges(stats, objectiveStats, language);

  return (
    <View style={styles.gamePanel}>
      <Text style={styles.gamePanelTitle}>{isFrench ? "Objectifs et badges" : "Goals and badges"}</Text>
      <View style={styles.goalList}>
        <GoalRow
          label={isFrench ? "Cellules aujourd'hui" : "Cells today"}
          value={`${Math.min(stats.newCellsThisRecording, dailyCellGoal)}/${dailyCellGoal}`}
          progress={dailyCellGoal > 0 ? stats.newCellsThisRecording / dailyCellGoal : 0}
        />
        <GoalRow
          label={isFrench ? "Distance cette semaine" : "Weekly distance"}
          value={`${formatDistance(Math.min(weekDistanceMeters, weeklyDistanceGoalMeters))}/${formatDistance(weeklyDistanceGoalMeters)}`}
          progress={weeklyDistanceGoalMeters > 0 ? weekDistanceMeters / weeklyDistanceGoalMeters : 0}
        />
        <GoalRow
          label={isFrench ? "Objectif de zone" : "Zone objective"}
          value={objectivePercent === null ? (isFrench ? "en attente" : "pending") : `${objectivePercent}%`}
          progress={objectivePercent === null ? 0 : objectivePercent / 100}
        />
      </View>
      <View style={styles.badgeRow}>
        {badges.map((badge) => (
          <View
            key={badge.label}
            style={[styles.badge, badge.unlocked ? styles.unlockedBadge : null]}
          >
            <Ionicons
              name={badge.icon}
              size={15}
              color={badge.unlocked ? "#02060a" : "#94a3b8"}
            />
            <Text style={[styles.badgeText, badge.unlocked ? styles.unlockedBadgeText : null]}>
              {badge.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function GoalRow({
  label,
  progress,
  value
}: {
  label: string;
  progress: number;
  value: string;
}) {
  const boundedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.goalRow}>
      <View style={styles.goalHeader}>
        <Text style={styles.goalLabel}>{label}</Text>
        <Text style={styles.goalValue}>{value}</Text>
      </View>
      <View style={styles.goalTrack}>
        <View style={[styles.goalFill, { width: `${Math.round(boundedProgress * 100)}%` }]} />
      </View>
    </View>
  );
}

function getAchievementBadges(
  stats: LifetimeStats,
  objectiveStats: ZoneCompletionStats | null,
  language: AppLanguage
) {
  const isFrench = language === "fr";

  return [
    {
      icon: "footsteps-outline" as keyof typeof Ionicons.glyphMap,
      label: isFrench ? "Première sortie" : "First recording",
      unlocked: stats.walkCount > 0
    },
    {
      icon: "map-outline" as keyof typeof Ionicons.glyphMap,
      label: "5 km",
      unlocked: stats.totalDistanceMeters >= 5000
    },
    {
      icon: "map-outline" as keyof typeof Ionicons.glyphMap,
      label: "10 km",
      unlocked: stats.totalDistanceMeters >= 10000
    },
    {
      icon: "map-outline" as keyof typeof Ionicons.glyphMap,
      label: "25 km",
      unlocked: stats.totalDistanceMeters >= 25000
    },
    {
      icon: "grid-outline" as keyof typeof Ionicons.glyphMap,
      label: isFrench ? "1000 cellules" : "1000 cells",
      unlocked: stats.exploredCellCount >= 1000
    },
    {
      icon: "flag-outline" as keyof typeof Ionicons.glyphMap,
      label: isFrench ? "Quartier 5%" : "District 5%",
      unlocked: (objectiveStats?.completionPercent ?? 0) >= 5
    },
    {
      icon: "trophy-outline" as keyof typeof Ionicons.glyphMap,
      label: isFrench ? "Record perso" : "Longest walk",
      unlocked: stats.longestRecordingDistanceMeters > 0
    }
  ];
}

function PathDisplayControls({
  language,
  mode,
  selectedSessionId,
  onChangeMode
}: {
  language: AppLanguage;
  mode: PathDisplayMode;
  selectedSessionId: number | null;
  onChangeMode: (mode: PathDisplayMode) => void;
}) {
  const strings = getStrings(language);
  const options: Array<{ label: string; value: PathDisplayMode; disabled?: boolean }> = [
    { label: strings.details.today, value: "today" },
    { label: strings.details.sevenDays, value: "last7" },
    { label: strings.common.all, value: "all" },
    { disabled: selectedSessionId === null, label: strings.details.selected, value: "selected" }
  ];

  return (
    <View style={styles.pathDisplayPanel}>
      <Text style={styles.pathDisplayTitle}>{strings.details.paths}</Text>
      <View style={styles.pathDisplayOptions}>
        {options.map((option) => (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={option.disabled}
            key={option.value}
            onPress={() => onChangeMode(option.value)}
            style={[
              styles.pathDisplayButton,
              mode === option.value ? styles.selectedPathDisplayButton : null,
              option.disabled ? styles.disabledPathDisplayButton : null
            ]}
          >
            <Text
              style={[
                styles.pathDisplayButtonText,
                mode === option.value ? styles.selectedPathDisplayButtonText : null
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function filterWalksForPathDisplay(
  walks: WalkWithPoints[],
  mode: PathDisplayMode,
  selectedSessionId: number | null
) {
  if (mode === "all") {
    return walks;
  }

  if (mode === "selected") {
    return selectedSessionId
      ? walks.filter((walk) => walk.id === selectedSessionId)
      : [];
  }

  if (mode === "last7") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    return walks.filter((walk) => new Date(walk.startedAt) >= cutoff);
  }

  return walks.filter((walk) => isToday(walk.startedAt));
}

async function calculateObjectiveStats(objective: CompletionObjective) {
  const cells = await getExploredCellRecords(objective.mode);

  return calculateZoneCompletionStats(objective.zone, cells);
}


function getRecentDistanceMeters(sessions: WalkSession[], dayCount: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dayCount);

  return sessions
    .filter((session) => new Date(session.startedAt) >= cutoff)
    .reduce((total, session) => total + session.distanceMeters, 0);
}

function formatObjectiveMode(mode: CompletionObjective["mode"], language: AppLanguage) {
  return ACTIVITY_MODE_TEXT[language].labels[mode];
}

function formatObjectiveCompletion(stats: ZoneCompletionStats | null) {
  if (!stats || stats.completionPercent === null) {
    return "pending";
  }

  return `${stats.completionPercent}%`;
}

function showRecordingResultAlert({
  activeWalk,
  backgroundStatus,
  finalStepCount,
  loopResult,
  quality
}: {
  activeWalk: ActiveWalk;
  backgroundStatus: BackgroundTrackingStatus;
  finalStepCount: number;
  loopResult: LoopProcessingResult;
  quality: ReturnType<typeof calculateRecordingQuality>;
}) {
  const segments = buildPathSegments(activeWalk.points, activeWalk.activityMode);
  const rejectedGapCount = segments.filter((segment) => segment.type === "rejected").length;
  const gpsTotal = activeWalk.acceptedGpsPointCount + activeWalk.rejectedGpsPointCount;
  const acceptRate = gpsTotal > 0
    ? Math.round((activeWalk.acceptedGpsPointCount / gpsTotal) * 100)
    : 0;

  Alert.alert(
    `Recording saved - ${quality.label}`,
    [
      `Distance: ${formatDistance(activeWalk.distanceMeters)} from accepted GPS path.`,
      `GPS: ${activeWalk.acceptedGpsPointCount} accepted, ${activeWalk.rejectedGpsPointCount} rejected (${acceptRate}% accepted).`,
      `Gaps: ${rejectedGapCount} required validation; street-matched bridges count, unmatched gaps stay hidden.`,
      `Steps: ${finalStepCount.toLocaleString()}.`,
      `Background: ${formatBackgroundStatus(backgroundStatus)}.`,
      `Quality: ${quality.reason}`,
      formatLoopResultLine(loopResult)
    ].join("\n"),
    [
      {
        text: "Add new data on map"
      }
    ]
  );
}

function formatLoopResultLine(result: LoopProcessingResult) {
  if (result.status === "not_checked") {
    return "Loops: no enclosed cell area detected.";
  }

  if (result.status === "filled") {
    return `Loops: ${result.filledLoopCount} filled, ${result.filledCellCount} cells added.`;
  }

  return `Loops: rejected - ${formatLoopRejectionReason(result.rejectionReason)}`;
}

function formatBackgroundStatus(status: BackgroundTrackingStatus) {
  switch (status) {
    case "enabled":
      return "enabled";
    case "foreground-only":
      return "foreground only";
    case "starting":
      return "starting";
    case "unavailable":
      return "unavailable";
    default:
      return "idle";
  }
}

function getObjectiveRemainingCells(stats: ZoneCompletionStats | null) {
  if (!stats || stats.totalZoneCells === null) {
    return null;
  }

  return Math.max(0, stats.totalZoneCells - stats.exploredCells);
}

function formatLoopRejectionReason(reason: string | null) {
  switch (reason) {
    case "loop_area_too_large":
      return "The loop area was too large for V1.";
    case "loop_area_too_small":
      return "The loop area was too small to fill.";
    case "loop_distance_too_short":
      return "The closed section was shorter than the minimum loop distance.";
    case "loop_duration_too_short":
      return "The closed section was shorter than the minimum loop duration.";
    case "not_closed_enough":
      return "The route did not come back close enough to an earlier GPS point.";
    default:
      return "The loop was detected, but it did not pass the V1 fill rules.";
  }
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function waitForMapRenderCommit() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function isPointInsideZone(point: GpsPoint, zone: CachedZone) {
  const coordinate = {
    latitude: point.latitude,
    longitude: point.longitude
  };
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(coordinate, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(coordinate, ring));

  return insideOuter && !insideHole;
}

function findContainingZone(point: GpsPoint, zones: CachedZone[]) {
  return zones.find((zone) => isPointInsideZone(point, zone)) ?? null;
}

function pointInPolygon(
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>
) {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (!current || !previous) {
      continue;
    }

    const intersects =
      current.longitude > point.longitude !== previous.longitude > point.longitude &&
      point.latitude <
        ((previous.latitude - current.latitude) * (point.longitude - current.longitude)) /
          (previous.longitude - current.longitude) +
          current.latitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

const styles = StyleSheet.create({
  bottomPanel: {
    marginTop: "auto"
  },
  activeBottomTab: {
    backgroundColor: "#9cff00",
    borderColor: "#9cff00"
  },
  bottomTab: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.92)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  bottomTabs: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginBottom: -1,
    marginLeft: 10,
    marginRight: 10,
    zIndex: 2
  },
  bottomTabSpacer: {
    flex: 1
  },
  computingDialog: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.94)",
    borderColor: "rgba(156, 255, 0, 0.35)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 28,
    paddingHorizontal: 22,
    paddingVertical: 20
  },
  computingOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.62)",
    flex: 1,
    justifyContent: "center"
  },
  computingText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  reprocessCounter: {
    color: "#9cff00",
    fontSize: 14,
    fontWeight: "900"
  },
  reprocessProgressFill: {
    backgroundColor: "#9cff00",
    borderRadius: 999,
    height: "100%"
  },
  reprocessProgressTrack: {
    backgroundColor: "rgba(248, 250, 252, 0.14)",
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%"
  },
  computingTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900"
  },
  dashboardToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  dashboardToggleText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  backToMapButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  detailsContent: {
    gap: 12,
    padding: 16,
    paddingBottom: 28
  },
  detailsScreen: {
    backgroundColor: "#071016",
    flex: 1
  },
  disabledPathDisplayButton: {
    opacity: 0.45
  },
  fullScreenHeader: {
    alignItems: "center",
    backgroundColor: "#02060a",
    borderBottomColor: "rgba(156, 255, 0, 0.22)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingTop: 58
  },
  fullScreenSubtitle: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 3
  },
  fullScreenTitle: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "900"
  },
  badge: {
    alignItems: "center",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  badgeText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "800"
  },
  gamePanel: {
    backgroundColor: "rgba(11, 21, 29, 0.96)",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  gamePanelTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  goalFill: {
    backgroundColor: "#9cff00",
    borderRadius: 999,
    height: "100%"
  },
  goalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  goalLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "800"
  },
  goalList: {
    gap: 9
  },
  goalRow: {
    gap: 5
  },
  goalTrack: {
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    borderRadius: 999,
    height: 7,
    overflow: "hidden"
  },
  goalValue: {
    color: "#9cff00",
    fontSize: 12,
    fontWeight: "900"
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "center"
  },
  headerText: {
    alignItems: "center",
    flex: 1
  },
  historyButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  historyButtonText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "700"
  },
  activeLayerControlButton: {
    backgroundColor: "#9cff00",
    borderColor: "#9cff00"
  },
  layerControlButton: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  layerControls: {
    gap: 6,
    justifyContent: "center"
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modeButton: {
    alignItems: "center",
    backgroundColor: "rgba(11, 21, 29, 0.96)",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 10
  },
  modeButtonText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  optionButton: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  optionPanel: {
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  optionHelpText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  optionRows: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  objectiveClear: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  objectiveHud: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.88)",
    borderColor: "rgba(156, 255, 0, 0.35)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minWidth: 260,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  objectiveLabel: {
    color: "#9cff00",
    fontSize: 10,
    fontWeight: "900"
  },
  objectiveMeta: {
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1
  },
  objectiveMetricRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 7,
    marginTop: 2
  },
  objectivePercent: {
    color: "#f87171",
    fontSize: 16,
    fontWeight: "900"
  },
  objectiveToday: {
    color: "#9cff00",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 2
  },
  objectiveName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "900",
    maxWidth: 300
  },
  objectiveProgressFill: {
    backgroundColor: "#9cff00",
    borderRadius: 999,
    height: "100%"
  },
  objectiveProgressTrack: {
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    borderRadius: 999,
    height: 6,
    marginTop: 6,
    overflow: "hidden"
  },
  objectiveText: {
    flex: 1,
    flexShrink: 1
  },
  objectiveRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 8
  },
  objectiveSpacer: {
    flex: 1
  },
  overlay: {
    flex: 1,
    padding: 16
  },
  logo: {
    height: 136,
    marginBottom: -8,
    marginTop: -8,
    width: "100%"
  },
  pathDisplayButton: {
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  pathDisplayButtonText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  pathDisplayOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  pathDisplayPanel: {
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  pathDisplayTitle: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "900"
  },
  permissionPanel: {
    backgroundColor: "rgba(69, 10, 10, 0.9)",
    borderColor: "rgba(252, 165, 165, 0.45)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  permissionText: {
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  permissionTitle: {
    color: "#fee2e2",
    fontSize: 14,
    fontWeight: "700"
  },
  screen: {
    backgroundColor: "#e2e8f0",
    flex: 1
  },
  selectedPathDisplayButton: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  selectedPathDisplayButtonText: {
    color: "#ffffff"
  },
  subtitle: {
    color: "#475569",
    fontSize: 13,
    marginBottom: 10
  },
  statusRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  stopConfirmActions: {
    flexDirection: "row",
    gap: 10
  },
  stopConfirmContinue: {
    alignItems: "center",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46
  },
  stopConfirmContinueText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "900"
  },
  stopConfirmDialog: {
    alignItems: "center",
    backgroundColor: "#0b151d",
    borderColor: "rgba(252, 165, 165, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 13,
    marginHorizontal: 18,
    maxWidth: 440,
    padding: 16,
    width: "100%"
  },
  stopConfirmIcon: {
    alignItems: "center",
    backgroundColor: "rgba(220, 38, 38, 0.18)",
    borderColor: "rgba(252, 165, 165, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50
  },
  stopConfirmOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.68)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  stopConfirmQuit: {
    alignItems: "center",
    backgroundColor: "#dc2626",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    overflow: "hidden"
  },
  stopConfirmQuitContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center"
  },
  stopConfirmQuitFill: {
    backgroundColor: "#991b1b",
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0
  },
  stopConfirmQuitText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  stopConfirmText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  stopConfirmTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  topPanel: {
    gap: 2
  },
  summaryActions: {
    flexDirection: "row",
    gap: 10
  },
  summaryBackdrop: {
    backgroundColor: "rgba(2, 6, 10, 0.62)",
    flex: 1,
    justifyContent: "flex-end",
    padding: 16
  },
  summaryClose: {
    alignItems: "center",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  summaryDialog: {
    backgroundColor: "#0b151d",
    borderColor: "rgba(156, 255, 0, 0.26)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 13,
    padding: 14
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summaryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  summaryInput: {
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  summaryMetric: {
    backgroundColor: "#16232e",
    borderColor: "rgba(148, 163, 184, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "31%",
    flexGrow: 1,
    padding: 9
  },
  summaryMetricLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
  },
  summaryMetricValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900"
  },
  summaryNote: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  summaryProgressPanel: {
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10
  },
  summaryPrimary: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 42
  },
  summaryPrimaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  summarySecondary: {
    alignItems: "center",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  summarySecondaryText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800"
  },
  summarySubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  summaryTitle: {
    color: "#f8fafc",
    fontSize: 20,
    fontWeight: "900"
  },
  version: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "700",
    marginTop: -4,
    textShadowColor: "rgba(2, 6, 10, 0.75)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 2
  }
  ,
  unlockedBadge: {
    backgroundColor: "#9cff00",
    borderColor: "#9cff00"
  },
  unlockedBadgeText: {
    color: "#02060a"
  }
});
