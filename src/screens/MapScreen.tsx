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
  TouchableOpacity,
  View
} from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
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
  createWalkSession,
  deleteWalkSession,
  getAllWalksWithPoints,
  getGpsPointsForSession,
  getLifetimeStats,
  getWalkSessionById,
  getWalkHistory,
  updateWalkSessionName
} from "../database/walkRepository";
import {
  clearActiveRecordingSettings,
  getActiveRecordingSettings,
  getSavedCompletionObjective,
  saveActiveRecordingSettings,
  saveCompletionObjective
} from "../database/settingsRepository";
import {
  CachedZone,
  deleteExploredCellsForSession,
  deleteLoopFillDataForMode,
  getCachedZones,
  getExploredCellRecords,
  getLoopFillCellKeys,
  getLoopFillSessionSummaries,
  LoopFillSessionSummary,
  saveExploredCells,
  saveLoopFill
} from "../database/completionRepository";
import {
  isBackgroundLocationTaskAvailable,
  requestBackgroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking
} from "../services/backgroundLocationTask";
import {
  calculateExploredAreaSquareMeters,
  calculateExploredCellCount,
  calculateNewCellsForActivePath,
  collectExploredCellIdsBySource,
  collectExploredCellIdsForPath
} from "../services/explorationArea";
import { analyzeLoopFillsForCells } from "../services/loopFill";
import {
  getStreetSegmentsNear
} from "../database/streetRepository";
import { calculateStreetCompletion } from "../services/streetCompletion";
import {
  calculateZoneCompletionStats,
  countExploredCellKeysInsideZone,
  ZoneCompletionStats
} from "../services/zoneCompletion";
import { buildPathSegments } from "../services/pathInference";
import { exportBackupJson, exportWalkGpx, importBackupJson } from "../services/dataTools";
import {
  getCurrentGpsPoint,
  LocationPermissionState,
  requestForegroundLocationPermission,
  watchGpsPoints
} from "../services/locationService";
import {
  appendGpsPoint,
  createActiveWalk,
  finishPersistedActiveWalk,
  persistAcceptedGpsPoint
} from "../services/walkRecorder";
import { calculatePathDistanceMeters, formatDistance } from "../services/distance";
import {
  getStepCountBetween,
  StepSubscription,
  watchStepCount
} from "../services/pedometerService";
import { calculateRecordingQuality } from "../services/recordingQuality";
import {
  ActiveWalk,
  ActivityMode,
  GpsPoint,
  LifetimeStats,
  WalkSession,
  WalkWithPoints
} from "../types/walk";
import { MapLayerState } from "../types/mapLayers";
import { OsmStreetSegment, StreetCompletionSummary } from "../types/street";

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

type MapScreenProps = {
  activityMode: ActivityMode;
  onChangeMode: (mode: ActivityMode) => void;
};

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

export function MapScreen({ activityMode, onChangeMode }: MapScreenProps) {
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("unknown");
  const [currentLocation, setCurrentLocation] = useState<GpsPoint | null>(null);
  const [walks, setWalks] = useState<WalkWithPoints[]>([]);
  const [history, setHistory] = useState<WalkSession[]>([]);
  const [activeWalk, setActiveWalk] = useState<ActiveWalk | null>(null);
  const [stats, setStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [streetSegments, setStreetSegments] = useState<OsmStreetSegment[]>([]);
  const [streetStatus, setStreetStatus] = useState<StreetCompletionSummary["status"]>("empty");
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [isComputingRecording, setIsComputingRecording] = useState(false);
  const [loopFillCellIds, setLoopFillCellIds] = useState<string[]>([]);
  const [loopFillSummaries, setLoopFillSummaries] = useState<Record<number, LoopFillSessionSummary>>({});
  const [objective, setObjective] = useState<CompletionObjective | null>(null);
  const [objectiveStats, setObjectiveStats] = useState<ZoneCompletionStats | null>(null);
  const [pathDisplayMode, setPathDisplayMode] = useState<PathDisplayMode>("today");
  const [selectedZone, setSelectedZone] = useState<CachedZone | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [recoverableRecording, setRecoverableRecording] = useState<RecoverableRecording | null>(
    null
  );
  const [backgroundTrackingMessage, setBackgroundTrackingMessage] = useState<string | null>(null);
  const [backgroundTrackingStatus, setBackgroundTrackingStatus] =
    useState<BackgroundTrackingStatus>("idle");
  const [isLaunchDismissed, setIsLaunchDismissed] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isSavedDataReady, setIsSavedDataReady] = useState(false);
  const [layers, setLayers] = useState<MapLayerState>({
    showExploredCells: true,
    showMarkers: true,
    showPaths: false
  });
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const stepSubscriptionRef = useRef<StepSubscription | null>(null);
  const lastAutoObjectiveZoneIdRef = useRef<string | null>(null);
  const recoveryPromptedSessionRef = useRef<number | null>(null);
  const streetCacheCenterRef = useRef<GpsPoint | null>(null);
  const streetCompletion = useMemo(
    () =>
      calculateStreetCompletion(
        walks,
        activeWalk?.points ?? [],
        streetSegments,
        streetStatus
      ),
    [activeWalk?.points, streetSegments, streetStatus, walks]
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
    permissionState !== "unknown" &&
    (permissionState !== "granted" || Boolean(currentLocation));
  const todayObjectiveCellCount = useMemo(() => {
    if (!objective) {
      return 0;
    }

    const todayWalks = walks.filter((walk) => isToday(walk.startedAt));
    const todayCellKeys = [
      ...todayWalks.flatMap((walk) =>
        collectExploredCellIdsForPath(walk.points, walk.activityMode)
      ),
      ...collectExploredCellIdsForPath(activeWalk?.points ?? [], activityMode)
    ];

    return countExploredCellKeysInsideZone(objective.zone, todayCellKeys);
  }, [activeWalk?.points, activityMode, objective, walks]);

  const refreshSavedData = useCallback(async () => {
    const [
      savedWalks,
      lifetimeStats,
      savedHistory,
      savedLoopFillCellIds,
      savedLoopFillSummaries
    ] = await Promise.all([
      getAllWalksWithPoints(activityMode),
      getLifetimeStats(activityMode),
      getWalkHistory(activityMode),
      getLoopFillCellKeys(activityMode),
      getLoopFillSessionSummaries(activityMode)
    ]);
    const latestWalk = savedHistory[0] ?? null;
    const longestWalk = savedHistory.reduce<WalkSession | null>((longest, walk) => {
      if (!longest || walk.distanceMeters > longest.distanceMeters) {
        return walk;
      }

      return longest;
    }, null);
    const todayWalks = savedHistory.filter((walk) => isToday(walk.startedAt));

    setWalks(savedWalks);
    setLoopFillCellIds(savedLoopFillCellIds);
    setLoopFillSummaries(savedLoopFillSummaries);
    await saveExploredCells(
      savedWalks.flatMap((walk) =>
        collectExploredCellIdsForPath(walk.points, walk.activityMode).map((cellKey) => ({
          cellKey,
          mode: walk.activityMode,
          sessionId: walk.id,
          source: "gps" as const
        }))
      )
    );
    setStats({
      ...lifetimeStats,
      approximateExploredAreaSquareMeters: calculateExploredAreaSquareMeters(savedWalks),
      exploredCellCount: calculateExploredCellCount(savedWalks),
      latestRecordingDistanceMeters: latestWalk?.distanceMeters ?? 0,
      latestRecordingStartedAt: latestWalk?.startedAt ?? null,
      longestRecordingDistanceMeters: longestWalk?.distanceMeters ?? 0,
      newCellsThisRecording: calculateNewCellsForActivePath(
        savedWalks,
        activeWalk?.points ?? [],
        activityMode
      ),
      todayDistanceMeters: todayWalks.reduce((distance, walk) => distance + walk.distanceMeters, 0),
      todayRecordingCount: todayWalks.length,
      todayStepCount: todayWalks.reduce((steps, walk) => steps + walk.stepCount, 0)
    });
    setHistory(savedHistory);
    setSelectedSessionId((currentSessionId) =>
      currentSessionId && savedHistory.some((walk) => walk.id === currentSessionId)
        ? currentSessionId
        : null
    );
    setIsSavedDataReady(true);
  }, [activeWalk?.points, activityMode]);

  const toggleLayer = useCallback((layer: keyof MapLayerState) => {
    setLayers((current) => ({
      ...current,
      [layer]: !current[layer]
    }));
  }, []);

  useEffect(() => {
    refreshSavedData();
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

  useEffect(() => {
    if (
      !currentLocation ||
      !objective ||
      !["city", "district"].includes(objective.zone.type)
    ) {
      return;
    }

    let isMounted = true;

    getCachedZones(objective.zone.type)
      .then(async (zones) => {
        if (!isMounted) {
          return;
        }

        const containingZone = zones.find((zone) => isPointInsideZone(currentLocation, zone));

        if (
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
      })
      .catch((error) => console.warn("Failed to auto-switch completion objective", error));

    return () => {
      isMounted = false;
    };
  }, [currentLocation, objective]);

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    if (
      streetCacheCenterRef.current &&
      calculatePathDistanceMeters([streetCacheCenterRef.current, currentLocation]) < 250
    ) {
      return;
    }

    streetCacheCenterRef.current = currentLocation;

    getStreetSegmentsNear(
      currentLocation.latitude,
      currentLocation.longitude,
      OSM_STREET_RADIUS_METERS
    )
      .then((cachedSegments) => {
        setStreetSegments(cachedSegments);
        setStreetStatus(cachedSegments.length > 0 ? "ready" : "empty");
      })
      .catch((error) => {
        console.warn("Failed to load cached OSM streets", error);
        setStreetStatus("error");
      });
  }, [currentLocation]);

  useEffect(() => {
    requestForegroundLocationPermission()
      .then(async (permission) => {
        setPermissionState(permission);

        if (permission === "granted") {
          const point = await getCurrentGpsPoint();
          setCurrentLocation(point);
        }
      })
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
  }, [activeWalk]);

  const stopLocationWatch = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  }, []);

  const stopStepWatch = useCallback(() => {
    stepSubscriptionRef.current?.remove();
    stepSubscriptionRef.current = null;
  }, []);

  const startStepWatch = useCallback(
    async (startedAt: string, recordingMode: ActivityMode) => {
      stopStepWatch();

      if (recordingMode !== "walk") {
        return;
      }

      const baseSteps = await getStepCountBetween(startedAt, new Date().toISOString());

      setActiveWalk((walk) => (walk ? { ...walk, stepCount: baseSteps } : walk));

      stepSubscriptionRef.current = await watchStepCount((liveSteps) => {
        setActiveWalk((walk) => (walk ? { ...walk, stepCount: baseSteps + liveSteps } : walk));
      });
    },
    [stopStepWatch]
  );

  const startForegroundWatch = useCallback(async () => {
    const currentPoint = await getCurrentGpsPoint();
    if (currentPoint) {
      setCurrentLocation(currentPoint);
      setActiveWalk((walk) => {
        if (!walk) {
          return walk;
        }

        const next = appendGpsPoint(walk, currentPoint);

        if (next.points.length > walk.points.length) {
          persistAcceptedGpsPoint(walk.sessionId, walk.activityMode, currentPoint).catch((error) =>
            console.warn("Failed to persist current GPS point", error)
          );
        }

        return next;
      });
    }

    subscriptionRef.current = await watchGpsPoints((point) => {
      setCurrentLocation(point);
      setActiveWalk((walk) => {
        if (!walk) {
          return walk;
        }

        const next = appendGpsPoint(walk, point);

        if (next.points.length > walk.points.length) {
          persistAcceptedGpsPoint(walk.sessionId, walk.activityMode, point).catch((error) =>
            console.warn("Failed to persist watched GPS point", error)
          );
        }

        return next;
      });
    });
  }, []);

  const syncActiveWalkFromDatabase = useCallback(async () => {
    if (!activeWalk) {
      return;
    }

    const points = await getGpsPointsForSession(activeWalk.sessionId);
    const lastSpeedMetersPerSecond = calculateLastSpeedMetersPerSecond(points);

    setActiveWalk((currentWalk) => {
      if (!currentWalk || currentWalk.sessionId !== activeWalk.sessionId) {
        return currentWalk;
      }

      return {
        ...currentWalk,
        acceptedGpsPointCount: points.length,
        currentSpeedMetersPerSecond: lastSpeedMetersPerSecond,
        distanceMeters: calculatePathDistanceMeters(points),
        points,
        stepCount: currentWalk.stepCount
      };
    });
  }, [activeWalk]);

  const enableBackgroundTracking = useCallback(async () => {
    try {
      const canUseBackgroundTasks = await isBackgroundLocationTaskAvailable();

      if (!canUseBackgroundTasks) {
        setBackgroundTrackingStatus("unavailable");
        setBackgroundTrackingMessage(
          "Background tracking needs a development build; Expo Go will record only while open."
        );
        return;
      }

      const backgroundPermission = await requestBackgroundLocationPermission();

      if (backgroundPermission.granted) {
        await startBackgroundLocationTracking(activityMode);
        setBackgroundTrackingStatus("enabled");
        setBackgroundTrackingMessage(
          "Background tracking enabled. Keep this recording stopped before switching mode."
        );
        return;
      }

      setBackgroundTrackingStatus("foreground-only");
      const settingsHint = backgroundPermission.backgroundCanAskAgain
        ? "iOS may show another permission prompt after recording starts."
        : "Open iPhone Settings > Street Explorer > Location and choose Always. If Always is missing, reinstall the latest development build.";

      setBackgroundTrackingMessage(
        `Background recording is not enabled yet. Foreground recording is active. ${settingsHint}`
      );
    } catch (error) {
      console.warn("Background tracking setup failed", error);
      setBackgroundTrackingStatus("unavailable");
      setBackgroundTrackingMessage(
        "Background tracking is unavailable here; foreground recording is still active."
      );
    }
  }, [activityMode]);

  useEffect(() => {
    let isMounted = true;

    getActiveRecordingSettings()
      .then(async (activeRecording) => {
        if (
          !isMounted ||
          activeWalk ||
          recoverableRecording ||
          !activeRecording ||
          activeRecording.activityMode !== activityMode ||
          recoveryPromptedSessionRef.current === activeRecording.sessionId
        ) {
          return;
        }

        recoveryPromptedSessionRef.current = activeRecording.sessionId;

        const [session, points] = await Promise.all([
          getWalkSessionById(activeRecording.sessionId),
          getGpsPointsForSession(activeRecording.sessionId)
        ]);

        if (!session || !isMounted) {
          await clearActiveRecordingSettings();
          recoveryPromptedSessionRef.current = null;
          return;
        }

        setRecoverableRecording({ points, session });
      })
      .catch((error) => console.warn("Failed to recover active recording", error));

    return () => {
      isMounted = false;
    };
  }, [activeWalk, activityMode, recoverableRecording]);

  const handleStartWalk = useCallback(async () => {
    let permission = permissionState;

    if (permission !== "granted") {
      permission = await requestForegroundLocationPermission();
      setPermissionState(permission);
    }

    if (permission !== "granted") {
      Alert.alert("Location denied", "Enable location permission to record a walk.");
      return;
    }

    stopLocationWatch();
    const startedAt = new Date().toISOString();
    const sessionId = await createWalkSession({
      activityMode,
      distanceMeters: 0,
      durationSeconds: 0,
      endedAt: startedAt,
      startedAt
    });
    const nextWalk = createActiveWalk(activityMode, sessionId, startedAt);
    setActiveWalk(nextWalk);
    setElapsedSeconds(0);
    setBackgroundTrackingStatus("starting");
    await saveActiveRecordingSettings({ activityMode, sessionId });

    await startStepWatch(startedAt, activityMode);
    await enableBackgroundTracking();

    await startForegroundWatch();
  }, [
    activityMode,
    enableBackgroundTracking,
    permissionState,
    startForegroundWatch,
    startStepWatch,
    stopLocationWatch
  ]);

  const reprocessModeExploration = useCallback(
    async (mode: ActivityMode): Promise<LoopProcessingResult & { recordingCount: number }> => {
      const savedWalks = await getAllWalksWithPoints(mode);
      const boundaryCellIds = new Set<string>();

      for (const walk of savedWalks) {
        await deleteExploredCellsForSession(walk.id);

        const cellIdsBySource = collectExploredCellIdsBySource(
          walk.points,
          walk.activityMode,
          streetSegments
        );

        for (const cellKey of [...cellIdsBySource.gps, ...cellIdsBySource.inferred]) {
          boundaryCellIds.add(cellKey);
        }

        await saveExploredCells(
          cellIdsBySource.gps.map((cellKey) => ({
            cellKey,
            mode: walk.activityMode,
            sessionId: walk.id,
            source: "gps"
          }))
        );
        await saveExploredCells(
          cellIdsBySource.inferred.map((cellKey) => ({
            cellKey,
            mode: walk.activityMode,
            sessionId: walk.id,
            source: "inferred"
          }))
        );
      }

      await deleteLoopFillDataForMode(mode);

      const loopFills = analyzeLoopFillsForCells({
        activityMode: mode,
        boundaryCellIds: [...boundaryCellIds],
        exploredStreetIds: streetCompletion.exploredStreetIds,
        streetSegments
      });
      const acceptedLoopFills = loopFills.filter((loopFill) => loopFill.accepted);
      const rejectedLoopFills = loopFills.filter((loopFill) => !loopFill.accepted);
      const filledCellKeys = new Set(acceptedLoopFills.flatMap((loopFill) => loopFill.cellIds));

      for (const loopFill of loopFills) {
        await saveLoopFill({
          accepted: loopFill.accepted,
          areaM2: loopFill.areaM2,
          mode,
          polygonJson: JSON.stringify(loopFill.polygon),
          rejectionReason: loopFill.rejectionReason,
          sessionId: null,
          totalWalkableStreetLengthM: loopFill.totalWalkableStreetLengthM,
          unwalkedWalkableStreetLengthM: loopFill.unwalkedWalkableStreetLengthM
        });
      }

      if (filledCellKeys.size > 0) {
        await saveExploredCells(
          [...filledCellKeys].map((cellKey) => ({
            cellKey,
            mode,
            sessionId: null,
            source: "loop_fill"
          }))
        );
      }

      if (acceptedLoopFills.length > 0) {
        return {
          filledCellCount: filledCellKeys.size,
          filledLoopCount: acceptedLoopFills.length,
          recordingCount: savedWalks.length,
          rejectedLoopCount: rejectedLoopFills.length,
          rejectionReason: null,
          status: "filled"
        };
      }

      if (rejectedLoopFills.length > 0) {
        return {
          filledCellCount: 0,
          filledLoopCount: 0,
          recordingCount: savedWalks.length,
          rejectedLoopCount: rejectedLoopFills.length,
          rejectionReason: rejectedLoopFills[0]?.rejectionReason ?? "not_closed_enough",
          status: "rejected"
        };
      }

      return {
        recordingCount: savedWalks.length,
        status: "not_checked"
      };
    },
    [streetCompletion.exploredStreetIds, streetSegments]
  );

  const handleStopWalk = useCallback(async () => {
    stopLocationWatch();
    stopStepWatch();

    if (!activeWalk) {
      return;
    }

    setIsComputingRecording(true);

    try {
      const endedAt = new Date().toISOString();
      const finalStepCount =
        activeWalk.activityMode === "walk"
          ? await getStepCountBetween(activeWalk.startedAt, endedAt)
          : activeWalk.stepCount;

      const finalBackgroundStatus = backgroundTrackingStatus;
      await stopBackgroundLocationTracking();
      stopStepWatch();
      await clearActiveRecordingSettings();
      const savedSessionId = await finishPersistedActiveWalk(activeWalk, endedAt, finalStepCount);
      setActiveWalk(null);
      setElapsedSeconds(0);
      setBackgroundTrackingStatus("idle");
      setBackgroundTrackingMessage(null);

      if (!savedSessionId) {
        setIsComputingRecording(false);
        Alert.alert("Walk discarded", "At least 2 valid GPS points are required to save a walk.");
        return;
      }

      const loopResult = await reprocessModeExploration(activeWalk.activityMode);
      await refreshSavedData();
      setIsComputingRecording(false);
      showRecordingResultAlert({
        activeWalk,
        backgroundStatus: finalBackgroundStatus,
        finalStepCount,
        loopResult,
        quality: recordingQuality
      });
    } catch (error) {
      console.warn("Failed to stop recording", error);
      setIsComputingRecording(false);
      Alert.alert("Recording failed", "Street Explorer could not finish this recording.");
    }
  }, [
    activeWalk,
    backgroundTrackingStatus,
    recordingQuality,
    refreshSavedData,
    reprocessModeExploration,
    stopLocationWatch,
    stopStepWatch
  ]);

  const handleReprocessRecordings = useCallback(() => {
    if (activeWalk) {
      Alert.alert("Recording active", "Stop the current recording before reprocessing saved walks.");
      return;
    }

    Alert.alert(
      "Reprocess saved recordings?",
      `This rebuilds explored cells and loop fills for saved ${ACTIVITY_MODE_LABELS[
        activityMode
      ].toLowerCase()} recordings using the current rules.`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Reprocess",
          onPress: async () => {
            const summary = await reprocessModeExploration(activityMode);

            await refreshSavedData();
            Alert.alert(
              "Reprocess complete",
              `${summary.recordingCount} recordings checked.\nFilled loops: ${
                summary.status === "filled" ? summary.filledLoopCount : 0
              }\nRejected loops: ${
                summary.status === "not_checked" ? 0 : summary.rejectedLoopCount
              }\nLoop cells added: ${
                summary.status === "filled" ? summary.filledCellCount : 0
              }`
            );
          }
        }
      ]
    );
  }, [activeWalk, activityMode, refreshSavedData, reprocessModeExploration]);

  const handleResumeRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording) {
      return;
    }

    const { points, session } = recoverableRecording;
    setRecoverableRecording(null);
    setActiveWalk({
      activityMode: session.activityMode,
      acceptedGpsPointCount: points.length,
      currentSpeedMetersPerSecond: calculateLastSpeedMetersPerSecond(points),
      distanceMeters: calculatePathDistanceMeters(points),
      lastRejectedPointReason: null,
      points,
      sessionId: session.id,
      startedAt: session.startedAt,
      rejectedGpsPointCount: 0,
      stepCount: session.stepCount
    });
    setBackgroundTrackingMessage("Recovered unfinished recording.");
    setBackgroundTrackingStatus("starting");
    await startStepWatch(session.startedAt, session.activityMode);
    await enableBackgroundTracking();
    await startForegroundWatch();
  }, [activityMode, enableBackgroundTracking, recoverableRecording, startForegroundWatch, startStepWatch]);

  const handleFinishRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording) {
      return;
    }

    const { points, session } = recoverableRecording;
    const recoveredWalk: ActiveWalk = {
      activityMode: session.activityMode,
      acceptedGpsPointCount: points.length,
      currentSpeedMetersPerSecond: calculateLastSpeedMetersPerSecond(points),
      distanceMeters: calculatePathDistanceMeters(points),
      lastRejectedPointReason: null,
      points,
      sessionId: session.id,
      startedAt: session.startedAt,
      rejectedGpsPointCount: 0,
      stepCount: session.stepCount
    };
    const endedAt = new Date().toISOString();
    const finalStepCount =
      recoveredWalk.activityMode === "walk"
        ? await getStepCountBetween(recoveredWalk.startedAt, endedAt)
        : recoveredWalk.stepCount;

    await stopBackgroundLocationTracking();
    await clearActiveRecordingSettings();
    const savedSessionId = await finishPersistedActiveWalk(
      recoveredWalk,
      endedAt,
      finalStepCount
    );

    if (savedSessionId) {
      await reprocessModeExploration(recoveredWalk.activityMode);
    }

    setRecoverableRecording(null);
    recoveryPromptedSessionRef.current = null;
    await refreshSavedData();
  }, [activityMode, recoverableRecording, refreshSavedData, reprocessModeExploration, stopStepWatch]);

  const handleDiscardRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording) {
      return;
    }

    stopStepWatch();
    await stopBackgroundLocationTracking();
    await clearActiveRecordingSettings();
    await deleteWalkSession(recoverableRecording.session.id);
    setRecoverableRecording(null);
    recoveryPromptedSessionRef.current = null;
    await refreshSavedData();
  }, [recoverableRecording, refreshSavedData, stopStepWatch]);

  const handleDeleteWalk = useCallback(
    (sessionId: number) => {
      Alert.alert("Delete recording?", "This removes the path from this mode only.", [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteExploredCellsForSession(sessionId);
            await deleteWalkSession(sessionId);
            setSelectedSessionId((currentSessionId) =>
              currentSessionId === sessionId ? null : currentSessionId
            );
            await refreshSavedData();
          }
        }
      ]);
    },
    [refreshSavedData]
  );

  const handleRenameWalk = useCallback(
    async (sessionId: number, displayName: string) => {
      await updateWalkSessionName(sessionId, displayName);
      await refreshSavedData();
    },
    [refreshSavedData]
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
      Alert.alert("Backup failed", "Street Explorer could not create the backup file.");
    }
  }, []);

  const handleImportBackup = useCallback(() => {
    if (activeWalk) {
      Alert.alert("Recording active", "Stop the current recording before restoring a backup.");
      return;
    }

    Alert.alert(
      "Restore backup?",
      "This replaces all local recordings with the selected backup file.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Restore",
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
              Alert.alert("Restore failed", "Street Explorer could not restore this backup file.");
            }
          }
        }
      ]
    );
  }, [activeWalk, refreshSavedData]);

  const handleChangeMode = useCallback((mode: ActivityMode) => {
    if (activeWalk) {
      Alert.alert("Recording active", "Stop the current recording before changing mode.");
      return;
    }

    onChangeMode(mode);
  }, [activeWalk, onChangeMode]);

  useEffect(() => {
    return () => {
      stopLocationWatch();
      stopStepWatch();
    };
  }, [stopLocationWatch, stopStepWatch]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        syncActiveWalkFromDatabase().catch((error) =>
          console.warn("Failed to sync active recording", error)
        );
      }
    });

    return () => subscription.remove();
  }, [syncActiveWalkFromDatabase]);

  return (
    <View style={styles.screen}>
      <ExplorationMap
        walks={walks}
        pathWalks={displayedWalks}
        activePoints={activeWalk?.points ?? []}
        activeMode={activityMode}
        currentLocation={currentLocation}
        highlightedSessionId={selectedSessionId}
        layers={layers}
        loopFillCellIds={loopFillCellIds}
        onMapReady={() => setIsMapReady(true)}
        selectedZone={selectedZone}
        streetSegments={streetSegments}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topPanel}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Image
                resizeMode="contain"
                source={require("../../assets/transplogo.png")}
                style={styles.logo}
              />
              <Text style={styles.version}>v{APP_VERSION}</Text>
            </View>
          </View>
          <View style={styles.objectiveRow}>
            {objective ? (
              <ObjectiveHud
                objective={objective}
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
            <Text style={styles.permissionTitle}>Location permission is off</Text>
            <Text style={styles.permissionText}>
              You can still view saved walks, but location permission is required to record a new
              walk.
            </Text>
          </View>
        ) : null}

        <View style={styles.bottomPanel}>
          <View style={styles.bottomTabs}>
            <TouchableOpacity
              accessibilityLabel="Details"
              accessibilityRole="button"
              onPress={() => setDashboardExpanded(true)}
              style={[styles.bottomTab, dashboardExpanded ? styles.activeBottomTab : null]}
            >
              <Ionicons
                name="list-outline"
                size={19}
                color={dashboardExpanded ? "#02060a" : "#f8fafc"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="History"
              accessibilityRole="button"
              onPress={() => setHistoryVisible(true)}
              style={styles.bottomTab}
            >
              <Ionicons name="time-outline" size={19} color="#f8fafc" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Completion"
              accessibilityRole="button"
              onPress={() => setCompletionVisible(true)}
              style={styles.bottomTab}
            >
              <Ionicons name="trophy-outline" size={19} color="#f8fafc" />
            </TouchableOpacity>
          </View>
          <WalkControls
            activityMode={activityMode}
            isRecording={Boolean(activeWalk)}
            distanceMeters={activeWalk?.distanceMeters ?? 0}
            durationSeconds={elapsedSeconds}
            gpsAccuracyMeters={currentLocation?.accuracy}
            gpsStatus={activeWalk?.lastRejectedPointReason}
            pointCount={activeWalk?.points.length ?? 0}
            speedMetersPerSecond={activeWalk?.currentSpeedMetersPerSecond ?? 0}
            stepCount={activeWalk?.stepCount ?? 0}
            todayStepCount={stats.todayStepCount + (activeWalk?.stepCount ?? 0)}
            recordingQuality={recordingQuality}
            onStart={handleStartWalk}
            onStop={handleStopWalk}
          />
        </View>
      </SafeAreaView>

      <DetailsModal
        activeWalk={activeWalk}
        activityMode={activityMode}
        backgroundMessage={backgroundTrackingMessage}
        backgroundStatus={backgroundTrackingStatus}
        currentLocation={currentLocation}
        layers={layers}
        mode={pathDisplayMode}
        onChangeMode={setPathDisplayMode}
        onClose={() => setDashboardExpanded(false)}
        onOpenHistory={() => {
          setDashboardExpanded(false);
          setHistoryVisible(true);
        }}
        onReprocessRecordings={handleReprocessRecordings}
        recordingQuality={recordingQuality}
        selectedSessionId={selectedSessionId}
        stats={stats}
        visible={dashboardExpanded}
      />

      <WalkHistoryModal
        activityMode={activityMode}
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
        currentLocation={currentLocation}
        onClose={() => setCompletionVisible(false)}
        onFocusZone={(zone) => {
          setSelectedZone(zone);
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
      <ComputingRecordingModal visible={isComputingRecording} />
      {!isLaunchDismissed ? (
        <LaunchLoadingOverlay
          activityMode={activityMode}
          isReady={isLaunchReady}
          onChangeMode={handleChangeMode}
          onStart={() => setIsLaunchDismissed(true)}
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
  stats,
  todayCellCount,
  onClear
}: {
  objective: CompletionObjective;
  stats: ZoneCompletionStats | null;
  todayCellCount: number;
  onClear: () => void;
}) {
  const remainingCells = getObjectiveRemainingCells(stats);

  return (
    <View style={styles.objectiveHud}>
      <View style={styles.objectiveText}>
        <Text style={styles.objectiveLabel}>
          {objective.zone.type === "district" ? "District objective" : `${objective.zone.type} objective`}
        </Text>
        <Text numberOfLines={1} style={styles.objectiveName}>{objective.zone.name}</Text>
        <View style={styles.objectiveMetricRow}>
          <Text style={styles.objectivePercent}>{formatObjectiveCompletion(stats)}</Text>
          <Text style={styles.objectiveMeta}>{formatObjectiveMode(objective.mode)}</Text>
        </View>
        <Text style={styles.objectiveMeta}>
          {remainingCells === null
            ? `${stats?.exploredCells ?? 0} cells explored`
            : `${remainingCells} cells remaining`}
        </Text>
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

function ComputingRecordingModal({ visible }: { visible: boolean }) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.computingOverlay}>
        <View style={styles.computingDialog}>
          <ActivityIndicator color="#9cff00" size="large" />
          <Text style={styles.computingTitle}>Computing information</Text>
          <Text style={styles.computingText}>
            Updating your route, explored area, loops, and recording report.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function DetailsModal({
  activeWalk,
  activityMode,
  backgroundMessage,
  backgroundStatus,
  currentLocation,
  layers,
  mode,
  onChangeMode,
  onClose,
  onOpenHistory,
  onReprocessRecordings,
  recordingQuality,
  selectedSessionId,
  stats,
  visible
}: {
  activeWalk: ActiveWalk | null;
  activityMode: ActivityMode;
  backgroundMessage: string | null;
  backgroundStatus: BackgroundTrackingStatus;
  currentLocation: GpsPoint | null;
  layers: MapLayerState;
  mode: PathDisplayMode;
  onChangeMode: (mode: PathDisplayMode) => void;
  onClose: () => void;
  onOpenHistory: () => void;
  onReprocessRecordings: () => void;
  recordingQuality: ReturnType<typeof calculateRecordingQuality>;
  selectedSessionId: number | null;
  stats: LifetimeStats;
  visible: boolean;
}) {
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
            <Text style={styles.fullScreenTitle}>Details</Text>
            <Text style={styles.fullScreenSubtitle}>
              {ACTIVITY_MODE_LABELS[activityMode]} exploration map
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.detailsContent}>
          <StatsPanel activityMode={activityMode} stats={stats} />
          <PathDisplayControls
            mode={mode}
            selectedSessionId={selectedSessionId}
            onChangeMode={onChangeMode}
          />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onReprocessRecordings}
            style={styles.dashboardToggle}
          >
            <Ionicons name="sync-outline" size={18} color="#f8fafc" />
            <Text style={styles.dashboardToggleText}>Reprocess recordings</Text>
          </TouchableOpacity>
          <MapLegend
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
          <ModeProfilePanel activityMode={activityMode} />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onOpenHistory}
            style={styles.dashboardToggle}
          >
            <Ionicons name="time-outline" size={18} color="#f8fafc" />
            <Text style={styles.dashboardToggleText}>Open history</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PathDisplayControls({
  mode,
  selectedSessionId,
  onChangeMode
}: {
  mode: PathDisplayMode;
  selectedSessionId: number | null;
  onChangeMode: (mode: PathDisplayMode) => void;
}) {
  const options: Array<{ label: string; value: PathDisplayMode; disabled?: boolean }> = [
    { label: "Today", value: "today" },
    { label: "7 days", value: "last7" },
    { label: "All", value: "all" },
    { disabled: selectedSessionId === null, label: "Selected", value: "selected" }
  ];

  return (
    <View style={styles.pathDisplayPanel}>
      <Text style={styles.pathDisplayTitle}>Paths</Text>
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

function formatObjectiveMode(mode: CompletionObjective["mode"]) {
  return mode === "all" ? "All modes" : ACTIVITY_MODE_LABELS[mode];
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
      `Gaps: ${rejectedGapCount} hidden/rejected. Street inference is paused for gameplay safety.`,
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

function isPointInsideZone(point: GpsPoint, zone: CachedZone) {
  const coordinate = {
    latitude: point.latitude,
    longitude: point.longitude
  };
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(coordinate, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(coordinate, ring));

  return insideOuter && !insideHole;
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
    zIndex: 2
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
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 10
  },
  modeButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
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
    height: 292,
    marginBottom: -86,
    marginTop: -46,
    maxWidth: "180%",
    width: 1260
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
  topPanel: {
    gap: 2
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
});
