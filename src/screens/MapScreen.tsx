import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import { APP_VERSION } from "../constants/config";
import { ExplorationMap } from "../components/ExplorationMap";
import { GpsStatusPanel } from "../components/GpsStatusPanel";
import { LayerControls, MapLayerState } from "../components/LayerControls";
import { ModeProfilePanel } from "../components/ModeProfilePanel";
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
  newCellsThisRecording: 0
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [backgroundTrackingMessage, setBackgroundTrackingMessage] = useState<string | null>(null);
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

    setWalks(savedWalks);
    setStats({
      ...lifetimeStats,
      approximateExploredAreaSquareMeters: calculateExploredAreaSquareMeters(savedWalks),
      exploredCellCount: calculateExploredCellCount(savedWalks),
      latestRecordingDistanceMeters: latestWalk?.distanceMeters ?? 0,
      latestRecordingStartedAt: latestWalk?.startedAt ?? null,
      longestRecordingDistanceMeters: longestWalk?.distanceMeters ?? 0,
      newCellsThisRecording: calculateNewCellsForActivePath(savedWalks, activeWalk?.points ?? [])
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

  useEffect(() => {
    let isMounted = true;

    getActiveRecordingSettings()
      .then(async (activeRecording) => {
        if (
          !isMounted ||
          activeWalk ||
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
          return;
        }

        Alert.alert("Unfinished recording", "A previous recording was still active.", [
          {
            text: "Finish",
            onPress: async () => {
              const recoveredWalk: ActiveWalk = {
                activityMode,
                currentSpeedMetersPerSecond: 0,
                distanceMeters: session.distanceMeters,
                lastRejectedPointReason: null,
                points,
                sessionId: session.id,
                startedAt: session.startedAt
              };

              await stopBackgroundLocationTracking();
              await clearActiveRecordingSettings();
              await finishPersistedActiveWalk(recoveredWalk, new Date().toISOString());
              await refreshSavedData();
              recoveryPromptedSessionRef.current = null;
            }
          },
          {
            text: "Resume",
            onPress: async () => {
              setActiveWalk({
                activityMode,
                currentSpeedMetersPerSecond: 0,
                distanceMeters: session.distanceMeters,
                lastRejectedPointReason: null,
                points,
                sessionId: session.id,
                startedAt: session.startedAt
              });
              setBackgroundTrackingMessage("Recovered unfinished recording.");
              await startForegroundWatch();
            }
          }
        ]);
      })
      .catch((error) => console.warn("Failed to recover active recording", error));

    return () => {
      isMounted = false;
    };
  }, [activeWalk, activityMode, startForegroundWatch]);

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
    await saveActiveRecordingSettings({ activityMode, sessionId });

    try {
      const canUseBackgroundTasks = await isBackgroundLocationTaskAvailable();

      if (!canUseBackgroundTasks) {
        setBackgroundTrackingMessage(
          "Background tracking needs a development build; Expo Go will record only while open."
        );
      } else {
        const backgroundPermission = await requestBackgroundLocationPermission();

        if (backgroundPermission.granted) {
          await startBackgroundLocationTracking(activityMode);
          setBackgroundTrackingMessage(
            "Background tracking enabled. Keep this recording stopped before switching mode."
          );
        } else {
          const settingsHint = backgroundPermission.backgroundCanAskAgain
            ? "iOS may show another permission prompt after recording starts."
            : "Open iPhone Settings > Street Explorer > Location and choose Always. If Always is missing, reinstall the latest development build.";

          setBackgroundTrackingMessage(
            `Background recording is not enabled yet. Foreground recording is active. ${settingsHint}`
          );
        }
      }
    } catch (error) {
      console.warn("Background tracking setup failed", error);
      setBackgroundTrackingMessage(
        "Background tracking is unavailable here; foreground recording is still active."
      );
    }

    await startForegroundWatch();
  }, [activityMode, permissionState, startForegroundWatch, stopLocationWatch]);

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
    setBackgroundTrackingMessage(null);

    if (!savedSessionId) {
      Alert.alert("Walk discarded", "At least 2 valid GPS points are required to save a walk.");
      return;
    }

    await refreshSavedData();
  }, [activeWalk, refreshSavedData, stopLocationWatch]);

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
              <Text style={styles.subtitle}>
                {ACTIVITY_MODE_LABELS[activityMode]} exploration map
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleChangeMode}
              style={styles.iconButton}
            >
              <Ionicons name="swap-horizontal" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <StatsPanel activityMode={activityMode} stats={stats} />
          <LayerControls layers={layers} onToggleLayer={toggleLayer} />
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

        {backgroundTrackingMessage ? (
          <View style={styles.backgroundPanel}>
            <Text style={styles.backgroundTitle}>Background recording</Text>
            <Text style={styles.backgroundText}>{backgroundTrackingMessage}</Text>
          </View>
        ) : null}

        <ModeProfilePanel activityMode={activityMode} />

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
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundPanel: {
    backgroundColor: "rgba(239, 246, 255, 0.96)",
    borderColor: "#bfdbfe",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  backgroundText: {
    color: "#1e3a8a",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  backgroundTitle: {
    color: "#1e3a8a",
    fontSize: 14,
    fontWeight: "700"
  },
  bottomPanel: {
    marginTop: "auto"
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
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
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
