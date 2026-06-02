import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import { APP_VERSION } from "../constants/config";
import { ExplorationMap } from "../components/ExplorationMap";
import { GpsStatusPanel } from "../components/GpsStatusPanel";
import { LayerControls, MapLayerState } from "../components/LayerControls";
import { MapLegend } from "../components/MapLegend";
import { ModeProfilePanel } from "../components/ModeProfilePanel";
import {
  BackgroundTrackingStatus,
  RecordingHealthPanel
} from "../components/RecordingHealthPanel";
import {
  RecoverableRecording,
  RecordingRecoveryModal
} from "../components/RecordingRecoveryModal";
import { StatsPanel } from "../components/StatsPanel";
import { StreetCompletionPanel } from "../components/StreetCompletionPanel";
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
  saveActiveRecordingSettings
} from "../database/settingsRepository";
import {
  isBackgroundLocationTaskAvailable,
  requestBackgroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking
} from "../services/backgroundLocationTask";
import {
  calculateExploredAreaSquareMeters,
  calculateExploredCellCount,
  calculateNewCellsForActivePath
} from "../services/explorationArea";
import { getStreetCompletionSummary } from "../services/streetCompletion";
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
import { calculatePathDistanceMeters } from "../services/distance";
import {
  ActiveWalk,
  ActivityMode,
  GpsPoint,
  LifetimeStats,
  WalkSession,
  WalkWithPoints
} from "../types/walk";

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
  todayRecordingCount: 0
};

type MapScreenProps = {
  activityMode: ActivityMode;
  onChangeMode: () => void;
};

export function MapScreen({ activityMode, onChangeMode }: MapScreenProps) {
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("unknown");
  const [currentLocation, setCurrentLocation] = useState<GpsPoint | null>(null);
  const [walks, setWalks] = useState<WalkWithPoints[]>([]);
  const [history, setHistory] = useState<WalkSession[]>([]);
  const [activeWalk, setActiveWalk] = useState<ActiveWalk | null>(null);
  const [stats, setStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [recoverableRecording, setRecoverableRecording] = useState<RecoverableRecording | null>(
    null
  );
  const [backgroundTrackingMessage, setBackgroundTrackingMessage] = useState<string | null>(null);
  const [backgroundTrackingStatus, setBackgroundTrackingStatus] =
    useState<BackgroundTrackingStatus>("idle");
  const [layers, setLayers] = useState<MapLayerState>({
    showExploredCells: true,
    showMarkers: true,
    showPaths: true,
    showStreetLayer: false
  });
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const recoveryPromptedSessionRef = useRef<number | null>(null);

  const refreshSavedData = useCallback(async () => {
    const [savedWalks, lifetimeStats, savedHistory] = await Promise.all([
      getAllWalksWithPoints(activityMode),
      getLifetimeStats(activityMode),
      getWalkHistory(activityMode)
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
    setStats({
      ...lifetimeStats,
      approximateExploredAreaSquareMeters: calculateExploredAreaSquareMeters(savedWalks),
      exploredCellCount: calculateExploredCellCount(savedWalks),
      latestRecordingDistanceMeters: latestWalk?.distanceMeters ?? 0,
      latestRecordingStartedAt: latestWalk?.startedAt ?? null,
      longestRecordingDistanceMeters: longestWalk?.distanceMeters ?? 0,
      newCellsThisRecording: calculateNewCellsForActivePath(savedWalks, activeWalk?.points ?? []),
      todayDistanceMeters: todayWalks.reduce((distance, walk) => distance + walk.distanceMeters, 0),
      todayRecordingCount: todayWalks.length
    });
    setHistory(savedHistory);
    setSelectedSessionId((currentSessionId) =>
      currentSessionId && savedHistory.some((walk) => walk.id === currentSessionId)
        ? currentSessionId
        : null
    );
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
        currentSpeedMetersPerSecond: lastSpeedMetersPerSecond,
        distanceMeters: calculatePathDistanceMeters(points),
        points
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

    await enableBackgroundTracking();

    await startForegroundWatch();
  }, [activityMode, enableBackgroundTracking, permissionState, startForegroundWatch, stopLocationWatch]);

  const handleStopWalk = useCallback(async () => {
    stopLocationWatch();

    if (!activeWalk) {
      return;
    }

    const endedAt = new Date().toISOString();
    await stopBackgroundLocationTracking();
    await clearActiveRecordingSettings();
    const savedSessionId = await finishPersistedActiveWalk(activeWalk, endedAt);
    setActiveWalk(null);
    setElapsedSeconds(0);
    setBackgroundTrackingStatus("idle");
    setBackgroundTrackingMessage(null);

    if (!savedSessionId) {
      Alert.alert("Walk discarded", "At least 2 valid GPS points are required to save a walk.");
      return;
    }

    await refreshSavedData();
  }, [activeWalk, refreshSavedData, stopLocationWatch]);

  const handleResumeRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording) {
      return;
    }

    const { points, session } = recoverableRecording;
    setRecoverableRecording(null);
    setActiveWalk({
      activityMode,
      currentSpeedMetersPerSecond: calculateLastSpeedMetersPerSecond(points),
      distanceMeters: calculatePathDistanceMeters(points),
      lastRejectedPointReason: null,
      points,
      sessionId: session.id,
      startedAt: session.startedAt
    });
    setBackgroundTrackingMessage("Recovered unfinished recording.");
    setBackgroundTrackingStatus("starting");
    await enableBackgroundTracking();
    await startForegroundWatch();
  }, [activityMode, enableBackgroundTracking, recoverableRecording, startForegroundWatch]);

  const handleFinishRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording) {
      return;
    }

    const { points, session } = recoverableRecording;
    const recoveredWalk: ActiveWalk = {
      activityMode,
      currentSpeedMetersPerSecond: calculateLastSpeedMetersPerSecond(points),
      distanceMeters: calculatePathDistanceMeters(points),
      lastRejectedPointReason: null,
      points,
      sessionId: session.id,
      startedAt: session.startedAt
    };

    await stopBackgroundLocationTracking();
    await clearActiveRecordingSettings();
    await finishPersistedActiveWalk(recoveredWalk, new Date().toISOString());
    setRecoverableRecording(null);
    recoveryPromptedSessionRef.current = null;
    await refreshSavedData();
  }, [activityMode, recoverableRecording, refreshSavedData]);

  const handleDiscardRecoveredRecording = useCallback(async () => {
    if (!recoverableRecording) {
      return;
    }

    await stopBackgroundLocationTracking();
    await clearActiveRecordingSettings();
    await deleteWalkSession(recoverableRecording.session.id);
    setRecoverableRecording(null);
    recoveryPromptedSessionRef.current = null;
    await refreshSavedData();
  }, [recoverableRecording, refreshSavedData]);

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

  const handleChangeMode = useCallback(() => {
    if (activeWalk) {
      Alert.alert("Recording active", "Stop the current recording before changing mode.");
      return;
    }

    onChangeMode();
  }, [activeWalk, onChangeMode]);

  useEffect(() => {
    return () => stopLocationWatch();
  }, [stopLocationWatch]);

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
        activePoints={activeWalk?.points ?? []}
        currentLocation={currentLocation}
        highlightedSessionId={selectedSessionId}
        layers={layers}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topPanel}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Street Explorer</Text>
              <Text style={styles.version}>v{APP_VERSION}</Text>
              {dashboardExpanded ? (
                <Text style={styles.subtitle}>
                  {ACTIVITY_MODE_LABELS[activityMode]} exploration map
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleChangeMode}
              style={styles.modeButton}
            >
              <Ionicons name="swap-horizontal" size={22} color="#0f172a" />
              <Text style={styles.modeButtonText}>{ACTIVITY_MODE_LABELS[activityMode]}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickActions}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setDashboardExpanded((expanded) => !expanded)}
              style={styles.dashboardToggle}
            >
              <Ionicons
                name={dashboardExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color="#0f172a"
              />
              <Text style={styles.dashboardToggleText}>
                {dashboardExpanded ? "Hide details" : "Show details"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setHistoryVisible(true)}
              style={styles.dashboardToggle}
            >
              <Ionicons name="time-outline" size={18} color="#0f172a" />
              <Text style={styles.dashboardToggleText}>History</Text>
            </TouchableOpacity>
          </View>

          {dashboardExpanded ? (
            <>
              <StatsPanel activityMode={activityMode} stats={stats} />
              <LayerControls layers={layers} onToggleLayer={toggleLayer} />
              <MapLegend
                showExploredCells={layers.showExploredCells}
                showPaths={layers.showPaths}
              />
              <View style={styles.statusRow}>
                <GpsStatusPanel
                  activityMode={activityMode}
                  currentLocation={currentLocation}
                  isRecording={Boolean(activeWalk)}
                  lastRejectedPointReason={activeWalk?.lastRejectedPointReason ?? null}
                  speedMetersPerSecond={activeWalk?.currentSpeedMetersPerSecond ?? 0}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setHistoryVisible(true)}
                  style={styles.historyButton}
                >
                  <Ionicons name="time-outline" size={18} color="#0f172a" />
                  <Text style={styles.historyButtonText}>History</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
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

        {dashboardExpanded ? (
          <>
            <RecordingHealthPanel
              activeWalk={activeWalk}
              backgroundMessage={backgroundTrackingMessage}
              backgroundStatus={backgroundTrackingStatus}
            />

            <ModeProfilePanel activityMode={activityMode} />
          </>
        ) : null}

        {layers.showStreetLayer ? (
          <StreetCompletionPanel summary={getStreetCompletionSummary(walks)} />
        ) : null}

        <View style={styles.bottomPanel}>
          <WalkControls
            activityMode={activityMode}
            isRecording={Boolean(activeWalk)}
            distanceMeters={activeWalk?.distanceMeters ?? 0}
            durationSeconds={elapsedSeconds}
            pointCount={activeWalk?.points.length ?? 0}
            onStart={handleStartWalk}
            onStop={handleStopWalk}
          />
        </View>
      </SafeAreaView>

      <WalkHistoryModal
        activityMode={activityMode}
        visible={historyVisible}
        walks={history}
        selectedSessionId={selectedSessionId}
        onClose={() => setHistoryVisible(false)}
        onDeleteWalk={handleDeleteWalk}
        onRenameWalk={handleRenameWalk}
        onSelectWalk={setSelectedSessionId}
      />
      <RecordingRecoveryModal
        onDiscard={handleDiscardRecoveredRecording}
        onFinish={handleFinishRecoveredRecording}
        onResume={handleResumeRecoveredRecording}
        recording={recoverableRecording}
      />
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

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

const styles = StyleSheet.create({
  bottomPanel: {
    marginTop: "auto"
  },
  dashboardToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  dashboardToggleText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1
  },
  historyButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  historyButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700"
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
  overlay: {
    flex: 1,
    padding: 16
  },
  permissionPanel: {
    backgroundColor: "rgba(254, 242, 242, 0.96)",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  permissionText: {
    color: "#7f1d1d",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  permissionTitle: {
    color: "#7f1d1d",
    fontSize: 14,
    fontWeight: "700"
  },
  screen: {
    backgroundColor: "#e2e8f0",
    flex: 1
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
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800"
  },
  topPanel: {
    gap: 2
  },
  version: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1
  }
});
