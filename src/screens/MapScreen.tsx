import { MapLocationLabel, type MapLocationMessage } from "../components/MapLocationLabel";
import { canChangeMapProvider, type MapProvider } from "../services/mapProvider";
import { publishLatestSnapshot } from "../services/latestSnapshot";
import { createIncrementalEnclosureCollector } from "../services/explorationArea";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  APPEARANCE_MODES,
  AppearanceMode,
  createAppearanceStyles
} from "../constants/appearance";
import {
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  AppState,
  ImageBackground,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type DimensionValue,
  type LayoutChangeEvent,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Region } from "react-native-maps";

import {
  AtlasModalHeader,
  ATLAS_NAVIGATION_DOCK_HEIGHT,
  AtlasNavigationDockLayer,
  AtlasNavigationProvider,
  AtlasScreen,
  AtlasSectionLabel,
  AtlasStamp,
  playAtlasSound,
  type AtlasStampMessage,
  type AtlasPageId,
  useReducedMotionPreference
} from "../components/AtlasCabinet";
import { AtlasHudDivider, AtlasHudTexture } from "../components/AtlasHudDecor";
import { CompletionModal, CompletionObjective } from "../components/CompletionModal";
import { ExplorationMap } from "../components/ExplorationMap";
import { ExplorerScorePanel } from "../components/ExplorerScorePanel";
import { ForbiddenZoneCommentModal } from "../components/ForbiddenZoneCommentModal";
import {
  MedalCelebration,
  MedalFlightTarget
} from "../components/MedalCelebration";
import { MedalCollectionModal } from "../components/MedalCollectionModal";
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
import { APP_COLORS, ATLAS_DISPLAY_FONT, GPS_STATUS_COLORS } from "../constants/theme";
import {
  clearPendingRecordingRepair,
  deleteWalkSession,
  getAllWalksWithPoints,
  getGpsPointsAfterIndex,
  getGpsPointsForSession,
  getLifetimeStats,
  getPendingRecordingRepairSessionIds,
  getRouteSnapshot,
  getWalkSessionById,
  getWalkHistory,
  type WalkPointLoadScope,
  updateActiveWalkDistance,
  updateWalkSessionName,
  updateWalkSessionStepCount
} from "../database/walkRepository";
import {
  ActiveRecordingConflictError,
  clearActiveRecordingSettings,
  createActiveRecordingSession,
  getActiveRecordingSettings,
  type InvalidActiveRecordingDiagnostic,
  getSavedPlayerLocation,
  getSavedCompletionObjective,
  savePlayerLocation,
  saveCompletionObjective
} from "../database/settingsRepository";
import {
  getCollectedMedalCities,
  getMedalAlbumProgress,
  getPendingMedalPresentations,
  hasCompletedMedalRetroScan,
  markMedalPresentationState
} from "../database/medalRepository";
import { getMedalAlbumIdForZone } from "../data/medalAlbums";
import {
  CachedZone,
  commitPendingRecordingRepair,
  getCachedZones,
  getExploredCellKeys,
  getExploredCellRecords,
  getExplorationRevision,
  type ZoneCompletionSnapshot,
  getLoopFillCellKeys,
  getLoopFillSessionSummaries,
  getTodayNewExploredCellKeys,
  LoopFillSessionSummary,
  replaceExplorationForMode,
  upsertZones
} from "../database/completionRepository";
import {
  drainPendingBackgroundLocationBatches,
  persistDeliveredBackgroundLocationBatch,
  subscribeToFinalizedBackgroundLocationChanges
} from "../services/backgroundLocationOutbox";
import {
  getBackgroundLocationRecoveryStatus,
  isBackgroundLocationTaskAvailable,
  requestBackgroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking
} from "../services/backgroundLocationTask";
import {
  playImpactHaptic,
  playSelectionHaptic
} from "../services/feedbackPreferences";
import {
  collectExploredCellIdsByRouteSegments,
  collectFillableEnclosedExplorationCellIds,
  coordinateToExplorationCellKey
} from "../services/explorationArea";
import {
  calculateExplorerScore,
  type ExplorerScore
} from "../services/explorerScore";
import {
  awardMedalsInDiscoveredCells,
  evaluateLiveMedalCollection,
  evaluateMedalCollectionForRecording,
  runMedalRetroScan
} from "../services/medalEnclosure";
import { resetMedalCountryPackFailure } from "../services/medalCountryPackStore";
import {
  analyzeLoopFillsForCells,
  LOOP_FILL_CONFIG
} from "../services/loopFill";
import {
  getAllStreetSegments,
  getStreetSegmentsNear,
  upsertStreetSegments
} from "../database/streetRepository";
import { matchGpsPointsToStreetSegments } from "../services/streetCompletion";
import { rebuildStreetCompletionV2 } from "../services/streetCompletionV2";
import { getStreetCompletionState } from "../database/streetCompletionRepository";
import {
  calculateZoneCompletionSnapshot,
  countExploredCellKeysInsideZone,
  fetchNearbyOsmZonesWithDebug,
  getZoneGeometryFingerprint,
  getZoneBounds,
  hydrateZoneCompletionSnapshots,
  isZoneCompletionEligible,
  isOfficialDistrictZone,
  ZoneCompletionStats
} from "../services/zoneCompletion";
import {
  buildCompletionHydrationZones,
  getPresentedCompletionPercent,
  getPresentedRemainingCells,
  shouldRunExpensiveCompletionMaintenance
} from "../services/zoneCompletionLifecycle";
import { doesDistrictGeometryBelongToCity } from "../services/zoneBoundaryPolicy";
import {
  buildMapZoneSelectionProbeCoordinates,
  resolveMapSelection,
  shouldOfferMapZoneScopeChoice,
  shouldSelectCountryside
} from "../services/mapZoneSelection";
import { buildPathSegments } from "../services/pathInference";
import {
  measureAsyncPerformance,
  measurePerformance,
  usePerformanceRenderCounter
} from "../services/performance";
import { fetchNearbyOsmStreetSegments } from "../services/osmStreetService";
import {
  createRouteSnapshotIfMissing,
  rebuildRouteSnapshot,
  repairStreetCoverageForRecordings,
  replaceRouteSnapshot
} from "../services/routeSnapshot";
import {
  BackupExportError,
  exportAllWalksGpx,
  exportBackupV5,
  exportWalkGpx,
  restoreBackupV5,
  selectBackupV5ForRestore
} from "../services/dataTools";
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
  calculateTrustedGpsDistanceMeters,
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

import {
  CollectedMedal,
  CollectedMedalCity,
  MedalAlbumProgress
} from "../types/medal";
import { MODE_LOCATION_CONFIG } from "../constants/config";
import {
  createForbiddenZone,
  deleteForbiddenZone,
  getForbiddenZonePersistenceFailureReason,
  getForbiddenZones,
  updateForbiddenZoneComment,
  type ForbiddenZone
} from "../database/forbiddenZoneRepository";
import {
  analyzeForbiddenZoneSelection,
  formatForbiddenZoneArea
} from "../services/forbiddenZones";

const PLAYER_LOCATION_PERSIST_INTERVAL_MS = 5_000;
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

const EMPTY_CELL_IDS: string[] = [];
const EMPTY_GPS_POINTS: GpsPoint[] = [];
const EMPTY_LIVE_ROUTE_CHUNKS: ActiveWalk["routeChunks"] = [];
const EMPTY_MEDALS: CollectedMedal[] = [];
const OSM_STREET_RADIUS_METERS = 1600;
const OSM_STREET_FETCH_RADIUS_METERS = 800;
const OSM_STREET_LOCAL_COVERAGE_RADIUS_METERS = 200;
const OSM_STREET_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OSM_STREET_RETRY_DELAY_MS = 30_000;

function getGpsTimestamp(point: GpsPoint) {
  const timestamp = new Date(point.timestamp).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

type MapScreenProps = {
  mapProvider: MapProvider;
  googleMapsAvailable: boolean;
  isSavingMapProvider: boolean;
  onChangeMapProvider: (provider: MapProvider) => Promise<void>;
  appearanceMode: AppearanceMode;
  hapticsEnabled: boolean;
  isLaunchDismissed: boolean;
  language: AppLanguage;
  onChangeAppearanceMode: (mode: AppearanceMode) => void;
  onChangeHapticsEnabled: (enabled: boolean) => void;
  onChangeLanguage: (language: AppLanguage) => void;
  onChangeSoundEnabled: (enabled: boolean) => void;
  onLaunchReadyChange: (isReady: boolean) => void;
  soundEnabled: boolean;
};

type MapZoneSelection = {
  city: CachedZone | null;
  district: CachedZone | null;
};

type MapBoundaryContext = {
  city: CachedZone | null;
  districts: CachedZone[];
};

const EMPTY_MAP_BOUNDARY_CONTEXT: MapBoundaryContext = {
  city: null,
  districts: []
};
function isSelectableMapObjectiveZone(zone: CachedZone) {
  return zone.type !== "district" || isOfficialDistrictZone(zone);
}



const GPS_STORAGE_PAUSED_REASON =
  "Storage unavailable; recording paused until queued GPS writes recover.";

type PathDisplayMode = "today" | "last7" | "all" | "selected";

type DataOperation = "backup" | "bulkGpx" | "restorePreview" | "restore" | null;
type MedalPackLoadState = "idle" | "loading" | "ready" | "unavailable";

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
  targetBridgeCount: number;
  targetHiddenGapCount: number;
  targetInferredCellCount: number;
  targetSessionId: number | null;
  streetCoverageSegmentCount: number;
  streetCoverageStatus: "not_needed" | "refreshed";
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

let pendingRecordingRepairOperation: Promise<number[]> | null = null;
function repairPendingRecordingCaches() {
  if (!pendingRecordingRepairOperation) {
    pendingRecordingRepairOperation = performPendingRecordingRepairs().finally(() => {
      pendingRecordingRepairOperation = null;
    });
  }
  return pendingRecordingRepairOperation;
}
async function performPendingRecordingRepairs() {
  let sessionIds: number[];

  try {
    sessionIds = await getPendingRecordingRepairSessionIds();
  } catch (error) {
    console.warn("Failed to inspect pending recording repairs", error);
    return [];
  }

  const repairedSessionIds: number[] = [];

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
      repairedSessionIds.push(sessionId);
    } catch (error) {
      console.warn(`Failed to repair finalized recording ${sessionId}`, error);
    }
  }

  return repairedSessionIds;
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
    distanceMeters: calculateTrustedGpsDistanceMeters(
      points,
      session.activityMode
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

function returnToMapFromAtlas(onReturn: () => void) {
  playAtlasSound("page");
  onReturn();
}


export function MapScreen({
  mapProvider,
  googleMapsAvailable,
  isSavingMapProvider,
  onChangeMapProvider,
  appearanceMode,
  hapticsEnabled,
  isLaunchDismissed,
  language,
  onChangeAppearanceMode,
  onChangeHapticsEnabled,
  onChangeLanguage,
  onChangeSoundEnabled,
  onLaunchReadyChange,
  soundEnabled
}: MapScreenProps) {
  usePerformanceRenderCounter("MapScreen");
  const activityMode: ActivityMode = "walk";
  const strings = getStrings(language);
  const modeText = ACTIVITY_MODE_TEXT[language];
  const safeAreaInsets = useSafeAreaInsets();
  const reducedMotion = useReducedMotionPreference();
  const wordmarkCollapseProgress = useRef(new Animated.Value(0)).current;
  const recordingLayoutProgress = useRef(new Animated.Value(0)).current;
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("unknown");
  const [currentLocation, setCurrentLocation] = useState<GpsPoint | null>(null);
  const [launchObjectiveLocation, setLaunchObjectiveLocation] = useState<GpsPoint | null>(null);
  const [walks, setWalks] = useState<WalkWithPoints[]>([]);
  const [history, setHistory] = useState<WalkSession[]>([]);
  const [activeWalk, setActiveWalk] = useState<ActiveWalk | null>(null);
  const isRecording = Boolean(activeWalk);
  const [stats, setStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [streetSegments, setStreetSegments] = useState<OsmStreetSegment[]>([]);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [medalsVisible, setMedalsVisible] = useState(false);
  const [medalProgress, setMedalProgress] = useState<MedalAlbumProgress | null>(null);
  const [collectedMedalCities, setCollectedMedalCities] = useState<CollectedMedalCity[]>([]);
  const [medalPackLoadState, setMedalPackLoadState] = useState<MedalPackLoadState>("idle");
  const [medalPresentationQueue, setMedalPresentationQueue] = useState<CollectedMedal[]>([]);
  const [celebrationMedal, setCelebrationMedal] = useState<CollectedMedal | null>(null);
  const [medalFlightTarget, setMedalFlightTarget] = useState<MedalFlightTarget | null>(null);
  const [medalTabPulse, setMedalTabPulse] = useState(false);
  const [focusedMedal, setFocusedMedal] = useState<CollectedMedal | null>(null);
  const [medalFocusRequestId, setMedalFocusRequestId] = useState(0);
  const [medalRetroScanComplete, setMedalRetroScanComplete] = useState(false);
  const [liveMedalEvaluationRevision, setLiveMedalEvaluationRevision] = useState(0);
  const [isScanningMedals, setIsScanningMedals] = useState(false);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [dataOperation, setDataOperation] = useState<DataOperation>(null);
  const [isComputingRecording, setIsComputingRecording] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState<ReprocessProgress | null>(null);
  const [reprocessingSessionId, setReprocessingSessionId] = useState<number | null>(null);
  const [stopConfirmationVisible, setStopConfirmationVisible] = useState(false);
  const [recordingSummary, setRecordingSummary] = useState<RecordingSummary | null>(null);
  const [loopFillCellIds, setLoopFillCellIds] = useState<string[]>([]);
  const [forbiddenZones, setForbiddenZones] = useState<ForbiddenZone[]>([]);
  const [visibleForbiddenZoneLabel, setVisibleForbiddenZoneLabel] = useState<{
    coordinate: { latitude: number; longitude: number };
    districtId: string;
    zoneId: number;
  } | null>(null);
  const [forbiddenZoneCommentEditor, setForbiddenZoneCommentEditor] = useState<{
    isCreation: boolean;
    zoneId: number;
  } | null>(null);
  const [isForbiddenZoneModeActive, setIsForbiddenZoneModeActive] = useState(false);
  const [isForbiddenZoneProcessing, setIsForbiddenZoneProcessing] = useState(false);
  const [loopFillSummaries, setLoopFillSummaries] = useState<Record<number, LoopFillSessionSummary>>({});
  const [objective, setObjective] = useState<CompletionObjective | null>(null);
  const [isCountrysideSelected, setIsCountrysideSelected] = useState(false);
  const [objectiveHudVisible, setObjectiveHudVisible] = useState(true);
  const [objectiveStats, setObjectiveStats] = useState<ZoneCompletionStats | null>(null);
  const [isObjectiveStatsCalculating, setIsObjectiveStatsCalculating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<MapLocationMessage | null>(null);
  const locationMessageIdRef = useRef(0);
  const [atlasStampMessage, setAtlasStampMessage] = useState<AtlasStampMessage | null>(null);
  const [mapOverlayPanelHeights, setMapOverlayPanelHeights] = useState({
    bottom: 0,
    top: 0
  });
  const [objectiveMaintenanceRevision, setObjectiveMaintenanceRevision] = useState(0);
  const [mapBoundaryContext, setMapBoundaryContext] = useState<MapBoundaryContext>(
    EMPTY_MAP_BOUNDARY_CONTEXT
  );
  const [mapZoneSelection, setMapZoneSelection] = useState<MapZoneSelection | null>(null);
  const [isMapZoneSelectionLoading, setIsMapZoneSelectionLoading] = useState(false);
  const [pathDisplayMode, setPathDisplayMode] = useState<PathDisplayMode>("today");
  const [selectedZone, setSelectedZone] = useState<CachedZone | null>(null);
  const [knownCityZones, setKnownCityZones] = useState<CachedZone[]>([]);
  const activeDistrictObjectiveId = objective?.zone.type === "district"
    ? objective.zone.id
    : null;
  const visibleForbiddenZoneLabelData = useMemo(() => {
    if (
      !visibleForbiddenZoneLabel ||
      visibleForbiddenZoneLabel.districtId !== activeDistrictObjectiveId
    ) {
      return null;
    }

    const zone = forbiddenZones.find(
      (candidate) => candidate.id === visibleForbiddenZoneLabel.zoneId
    );

    return zone
      ? { coordinate: visibleForbiddenZoneLabel.coordinate, zone }
      : null;
  }, [activeDistrictObjectiveId, forbiddenZones, visibleForbiddenZoneLabel]);
  const forbiddenZoneCommentEditorZone = forbiddenZoneCommentEditor
    ? forbiddenZones.find((zone) => zone.id === forbiddenZoneCommentEditor.zoneId) ?? null
    : null;

  useEffect(() => {
    setVisibleForbiddenZoneLabel((current) =>
      current?.districtId === activeDistrictObjectiveId ? current : null
    );
  }, [activeDistrictObjectiveId]);

  const activeMedalAlbumId = useMemo(
    () => getMedalAlbumIdForZone(objective?.zone),
    [objective?.zone.id, objective?.zone.parentZoneId]
  );
  const activeMedalAlbumIdRef = useRef(activeMedalAlbumId);
  activeMedalAlbumIdRef.current = activeMedalAlbumId;
  const activeMedalProgress = medalProgress?.album.id === activeMedalAlbumId
    ? medalProgress
    : null;
  const visibleMapMedals = useMemo(() => {
    const activeMedals = activeMedalProgress?.medals ?? EMPTY_MEDALS;

    if (
      !focusedMedal ||
      activeMedals.some((medal) =>
        medal.albumId === focusedMedal.albumId && medal.id === focusedMedal.id
      )
    ) {
      return activeMedals;
    }

    return [...activeMedals, focusedMedal];
  }, [activeMedalProgress?.medals, focusedMedal]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [routeFocusRequestId, setRouteFocusRequestId] = useState(0);
  const [mapViewportCenter, setMapViewportCenter] = useState<GpsPoint | null>(null);
  const [playerFocusRequestId, setPlayerFocusRequestId] = useState(0);
  const [zoneFocusRequestId, setZoneFocusRequestId] = useState(0);
  const [recoverableRecording, setRecoverableRecording] = useState<RecoverableRecording | null>(
    null
  );
  const [backgroundTrackingMessage, setBackgroundTrackingMessage] = useState<string | null>(null);
  const [recordingResumeNotice, setRecordingResumeNotice] = useState<string | null>(null);
  const [backgroundTrackingStatus, setBackgroundTrackingStatus] =
    useState<BackgroundTrackingStatus>("idle");
  const [isMapWordmarkCollapsed, setIsMapWordmarkCollapsed] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isSavedDataReady, setIsSavedDataReady] = useState(false);
  const [isSavedObjectiveReady, setIsSavedObjectiveReady] = useState(false);
  const [isLaunchObjectiveResolved, setIsLaunchObjectiveResolved] = useState(false);
  const [isObjectiveCacheHydrated, setIsObjectiveCacheHydrated] = useState(false);
  const [isExplorationEnabled, setIsExplorationEnabled] = useState(false);
  const [savedExplorationCellIds, setSavedExplorationCellIds] = useState<string[]>([]);
  const [savedTodayNewCellIds, setSavedTodayNewCellIds] = useState<string[]>([]);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [isRecoveryCheckComplete, setIsRecoveryCheckComplete] = useState(false);
  const [recoveryCheckRevision, setRecoveryCheckRevision] = useState(0);
  const [streetRetryRevision, setStreetRetryRevision] = useState(0);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const isLaunchDismissedRef = useRef(isLaunchDismissed);
  isLaunchDismissedRef.current = isLaunchDismissed;
  const mapViewportRegionRef = useRef<Region | null>(null);
  const [layers, setLayers] = useState<MapLayerState>({
    showExploredCells: true,
    showMarkers: true,
    showPaths: false
  });
  const activeAtlasPage: AtlasPageId | null = diagnosticsVisible
    ? "history"
    : dashboardExpanded
      ? "details"
      : historyVisible
        ? "history"
        : completionVisible
          ? "completion"
            : medalsVisible
              ? "medals"
              : optionsVisible
                ? "options"
                : null;
  const stepSubscriptionRef = useRef<StepSubscription | null>(null);
  useEffect(() => {
    wordmarkCollapseProgress.stopAnimation();
    if (reducedMotion) {
      wordmarkCollapseProgress.setValue(isMapWordmarkCollapsed ? 1 : 0);
      return;
    }

    const animation = Animated.timing(wordmarkCollapseProgress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: isMapWordmarkCollapsed ? 1 : 0,
      useNativeDriver: false
    });
    animation.start();
    return () => animation.stop();
  }, [isMapWordmarkCollapsed, reducedMotion, wordmarkCollapseProgress]);

  useEffect(() => {
    recordingLayoutProgress.stopAnimation();

    if (isRecording) {
      setIsMapWordmarkCollapsed(true);
    }

    if (reducedMotion) {
      recordingLayoutProgress.setValue(isRecording ? 1 : 0);
      return;
    }

    const animation = Animated.timing(recordingLayoutProgress, {
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
      toValue: isRecording ? 1 : 0,
      useNativeDriver: false
    });
    animation.start();
    return () => animation.stop();
  }, [isRecording, recordingLayoutProgress, reducedMotion]);

  const activeSessionIdRef = useRef<number | null>(null);
  const activeWalkRef = useRef<ActiveWalk | null>(null);
  const medalTabRef = useRef<ComponentRef<typeof TouchableOpacity>>(null);
  const dataOperationRef = useRef<DataOperation>(null);
  const liveMedalEvaluationRef = useRef({
    evaluatedBoundaryCellCount: -1,
    inFlight: false,
    latestBoundaryCellCount: -1,
    sessionId: null as number | null
  });
  const recordingLifecycleGenerationRef = useRef(0);
  const appStateTransitionGenerationRef = useRef(0);
  const districtZoneLoadRequestRef = useRef(0);
  const mapBoundaryContextRef = useRef<MapBoundaryContext>(EMPTY_MAP_BOUNDARY_CONTEXT);
  const mapBoundarySwapChainRef = useRef(Promise.resolve());
  const mapBoundarySwapGenerationRef = useRef(0);
  const launchObjectiveSelectionStartedRef = useRef(false);
  const mapZoneSelectionRequestRef = useRef(0);
  const mapZoneSelectionAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => mapZoneSelectionAbortRef.current?.abort(), []);
  const forbiddenZoneRequestRef = useRef(0);
  const objectiveSaveChainRef = useRef(Promise.resolve());
  const objectiveStatsRequestRef = useRef(0);
  const objectiveFinalizationAbortRef = useRef<AbortController | null>(null);
  const objectiveRef = useRef<CompletionObjective | null>(null);
  const legacyObjectiveRefreshIdsRef = useRef(new Set<string>());
  const objectiveScopePairRef = useRef<MapZoneSelection | null>(null);
  const objectiveStatsCacheRef = useRef(new Map<string, ZoneCompletionSnapshot>());
  const activeClosureMonitorRef = useRef<{
    contextKey: string | null;
    fillCellIds: Set<string>;
  }>({ contextKey: null, fillCellIds: new Set() });
  const recoveryPromptedSessionRef = useRef<number | null>(null);
  const recoveryFailureAlertShownRef = useRef(false);
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
  const streetCompletionMigrationStartedRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const isChangingMapProviderRef = useRef(false);
  const isStoppingRecordingRef = useRef(false);
  const lastPlayerLocationPersistedAtRef = useRef(0);
  const latestPlayerLocationForPersistenceRef = useRef<GpsPoint | null>(null);
  const isMapReadyRef = useRef(false);
  const detailedWalksModeRef = useRef<ActivityMode | null>(null);
  const pathDisplayModeRef = useRef<PathDisplayMode>(pathDisplayMode);
  const selectedSessionIdRef = useRef<number | null>(selectedSessionId);
  objectiveRef.current = objective;
  pathDisplayModeRef.current = pathDisplayMode;
  selectedSessionIdRef.current = selectedSessionId;

  useEffect(() => {
    if (!recordingResumeNotice) {
      return;
    }

    const timer = setTimeout(() => setRecordingResumeNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [recordingResumeNotice]);

  useEffect(() => {
    objectiveFinalizationAbortRef.current?.abort();
    objectiveFinalizationAbortRef.current = null;
  }, [objective?.mode, objective?.zone.id]);

  const publishCurrentLocation = useCallback((point: GpsPoint) => {
    setCurrentLocation((currentPoint) =>
      !currentPoint || getGpsTimestamp(point) >= getGpsTimestamp(currentPoint)
        ? point
        : currentPoint
    );
  }, []);

  const handleLocationPoint = useCallback((point: GpsPoint) => {
    setLaunchObjectiveLocation((launchPoint) => launchPoint ?? point);
    const walk = activeWalkRef.current;
    const transition = recoveryResumeTransitionRef.current;
    const recordingTarget = walk
      ? { activityMode: walk.activityMode, sessionId: walk.sessionId }
      : transition;

    if (!recordingTarget) {
      publishCurrentLocation(point);
      return;
    }

    if (!canQueueAcceptedGpsPoint(recordingTarget.sessionId)) {
      publishCurrentLocation(point);
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
        // React batches this raw-fix publication with the canonical persisted
        // walk update, avoiding two complete map-screen renders per GPS fix.
        publishCurrentLocation(point);

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
        publishCurrentLocation(point);
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
  const [canMountInitialMap, setCanMountInitialMap] = useState(false);
  useEffect(() => {
    if (permissionState !== "unknown" &&
        (permissionState !== "granted" || initialLocationResolved)) {
      setCanMountInitialMap(true);
    }
  }, [initialLocationResolved, permissionState]);
  const playerLocationPersistenceCandidate =
    activeWalk?.routeChunks.at(-1)?.points.at(-1) ??
    activeWalk?.points.at(-1) ??
    currentLocation;
  latestPlayerLocationForPersistenceRef.current =
    playerLocationPersistenceCandidate;

  useEffect(() => {
    let mounted = true;

    getSavedPlayerLocation()
      .then((savedLocation) => {
        if (!mounted || !savedLocation) {
          return;
        }

        lastPlayerLocationPersistedAtRef.current = Date.now();
        setCurrentLocation((currentPoint) =>
          !currentPoint ||
          getGpsTimestamp(savedLocation) > getGpsTimestamp(currentPoint)
            ? savedLocation
            : currentPoint
        );
      })
      .catch((error) =>
        console.warn("Failed to restore the last player position", error)
      );

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isTrustworthyPlayerPersistencePoint(playerLocationPersistenceCandidate)) {
      return;
    }

    const delay = Math.max(
      0,
      lastPlayerLocationPersistedAtRef.current +
        PLAYER_LOCATION_PERSIST_INTERVAL_MS -
        Date.now()
    );
    const timer = setTimeout(() => {
      const latestPoint = latestPlayerLocationForPersistenceRef.current;

      if (!isTrustworthyPlayerPersistencePoint(latestPoint)) {
        return;
      }

      lastPlayerLocationPersistedAtRef.current = Date.now();
      savePlayerLocation(latestPoint).catch((error) =>
        console.warn("Failed to persist the player position", error)
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [playerLocationPersistenceCandidate]);

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
  const activeClosureBoundaryCellIds = useMemo(
    () => activeWalk ? [...new Set(activeWalk.exploredCellIds)] : [],
    [activeWalk?.exploredCellIds]
  );
  const activeClosureContextKey = activeWalk
    ? `${activeWalk.sessionId}:${activeWalk.activityMode}`
    : null;
  const collectActiveEnclosures = useMemo(() => createIncrementalEnclosureCollector(
    savedExplorationCellIds, LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode[activityMode]
  ), [savedExplorationCellIds, activityMode]);
  const activeClosureFillCellIds = useMemo(() => {
    if (!activeClosureContextKey || !activeWalk) {
      return [];
    }

    return measurePerformance(
      "map.live-enclosure",
      () => collectActiveEnclosures(activeClosureBoundaryCellIds).slice().sort(),
      12
    );
  }, [
    collectActiveEnclosures,
    activeClosureBoundaryCellIds,
    activeClosureContextKey,
    activeWalk?.activityMode,
    savedExplorationCellIds
  ]);
  const activeClosureFillCellKey = activeClosureFillCellIds.join("|");
  const forbiddenZoneCellIds = useMemo(
    () => [...new Set(forbiddenZones.flatMap((zone) => zone.cellIds))],
    [forbiddenZones]
  );
  const explorerScore = useMemo(
    () => measurePerformance(
      "map.explorer-score",
      () => calculateExplorerScore({
        derivedEnclosedCellIds: activeWalk
          ? activeClosureFillCellIds
          : undefined,
        exploredCellIds: [
          ...savedExplorationCellIds,
          ...(activeWalk?.exploredCellIds ?? [])
        ],
        forbiddenCellIds: forbiddenZoneCellIds,
        loopFillCellIds,
        maxEnclosedAreaSquareMeters:
          LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode[
            activeWalk?.activityMode ?? activityMode
          ]
      }),
      12
    ),
    [
      activeClosureFillCellIds,
      activeWalk?.activityMode,
      activeWalk?.exploredCellIds,
      activityMode,
      forbiddenZoneCellIds,
      loopFillCellIds,
      savedExplorationCellIds
    ]
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
        elapsedSeconds: activeWalk ? getElapsedSeconds(activeWalk.startedAt) : 0
      }),
    [activeWalk, backgroundTrackingStatus, currentLocation]
  );
  const isLaunchReady =
    isMapReady &&
    isSavedDataReady &&
    isLaunchObjectiveResolved &&
    isObjectiveCacheHydrated &&
    isRecoveryCheckComplete &&
    permissionState !== "unknown" &&
    (permissionState !== "granted" || initialLocationResolved);
  useEffect(() => {
    onLaunchReadyChange(isLaunchReady);
  }, [isLaunchReady, onLaunchReadyChange]);
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
  const visibleMapBoundaryContext = useMemo(() => {
    if (!objective || !mapBoundaryContext.city) {
      return objective ? EMPTY_MAP_BOUNDARY_CONTEXT : mapBoundaryContext;
    }

    const objectiveMatchesCity = objective.zone.type === "city"
      ? objective.zone.id === mapBoundaryContext.city.id
      : doesDistrictBelongToCity(objective.zone, mapBoundaryContext.city);

    return objectiveMatchesCity ? mapBoundaryContext : EMPTY_MAP_BOUNDARY_CONTEXT;
  }, [mapBoundaryContext, objective]);


  const handleMapInteraction = useCallback(() => {
    setIsMapWordmarkCollapsed(true);
  }, []);

  const handleVisibleRegionChange = useCallback((region: Region) => {
    mapViewportRegionRef.current = region;
    setMapViewportCenter({
      accuracy: null,
      latitude: region.latitude,
      longitude: region.longitude,
      pointIndex: 0,
      timestamp: new Date().toISOString()
    });
  }, []);

  const handleMapMedalPress = useCallback((medal: CollectedMedal) => {
    if (!medal.isCollected) {
      return;
    }

    setFocusedMedal(medal);
    setMedalsVisible(true);
  }, []);

  const handleMapReady = useCallback(() => {
    isMapReadyRef.current = true;
    setIsMapReady(true);
    setTimeout(() => setIsExplorationEnabled(true), 0);
  }, []);

  const loadDetailedWalk = useCallback(async (sessionId: number) => {
    const [session, points, routeSegments] = await measureAsyncPerformance(
      "map.selected-walk-load",
      () => Promise.all([
        getWalkSessionById(sessionId),
        getGpsPointsForSession(sessionId),
        getRouteSnapshot(sessionId)
      ]),
      50
    );

    if (!session) {
      return;
    }

    const detailedWalk: WalkWithPoints = {
      ...session,
      points,
      routeSegments
    };

    setWalks((currentWalks) => {
      const existingIndex = currentWalks.findIndex((walk) => walk.id === sessionId);

      if (existingIndex < 0) {
        return [...currentWalks, detailedWalk];
      }

      const nextWalks = [...currentWalks];
      nextWalks[existingIndex] = detailedWalk;
      return nextWalks;
    });
  }, []);

  const loadDetailedWalks = useCallback(async (options?: {
    mode?: PathDisplayMode;
    selectedSessionId?: number | null;
  }) => {
    const mode = options?.mode ?? pathDisplayModeRef.current;
    const scope = getWalkPointLoadScope(
      mode,
      options?.selectedSessionId ?? selectedSessionIdRef.current
    );
    const savedWalks = await measureAsyncPerformance(
      "map.path-history-load",
      () => getAllWalksWithPoints(activityMode, scope),
      100
    );
    detailedWalksModeRef.current = activityMode;
    setWalks(savedWalks);
  }, [activityMode]);

  const savedDataRefreshOperationRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);
  const discoveredMedalAwardOperationRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);

  const savedDataRefreshGenerationRef = useRef(0);
  const forbiddenZoneLoadGenerationRef = useRef(0);
  const refreshForbiddenZones = useCallback(async () => {
    try {
      await publishLatestSnapshot(
        forbiddenZoneLoadGenerationRef,
        getForbiddenZones,
        setForbiddenZones
      );
    } catch (error) {
      console.warn("Failed to load Forbidden Zones", error);
    }
  }, []);
  const savedDataRefreshOperationsRef = useRef(new Set<Promise<void>>());
  const refreshSavedData = useCallback((options: {
    hideExplorationDuringRefresh?: boolean;
    repairPendingCaches?: boolean;
  } = {}) => {
    const hideExplorationDuringRefresh =
      options.hideExplorationDuringRefresh ?? true;
    const repairPendingCaches = options.repairPendingCaches ?? true;
    const operationKey = [
      activityMode,
      activeMedalAlbumId ?? "none",
      hideExplorationDuringRefresh ? "hide" : "show",
      repairPendingCaches ? "repair" : "skip-repair"
    ].join(":");
    const existingOperation = savedDataRefreshOperationRef.current;

    if (existingOperation?.key === operationKey) {
      return existingOperation.promise;
    }

    const refreshGeneration = ++savedDataRefreshGenerationRef.current;
    const operation = (async () => {

      if (hideExplorationDuringRefresh) {
        setIsExplorationEnabled(false);
      }

      try {
        setMedalPackLoadState(activeMedalAlbumId ? "loading" : "idle");
        const repairedSessionIds = repairPendingCaches
        ? await repairPendingRecordingCaches()
        : [];
      const loadMedalData = async (
        discoveredCellIds: readonly string[],
        explorationRevision: number
      ) => {
        try {
          const awardOperationKey = `${activityMode}:${explorationRevision}`;

          if (
            discoveredMedalAwardOperationRef.current?.key !== awardOperationKey
          ) {
            discoveredMedalAwardOperationRef.current = {
              key: awardOperationKey,
              promise: awardMedalsInDiscoveredCells(discoveredCellIds).then(
                () => undefined
              )
            };
          }
          const awardOperation = discoveredMedalAwardOperationRef.current;

          try {
            await awardOperation.promise;
          } catch (error) {
            if (discoveredMedalAwardOperationRef.current === awardOperation) {
              discoveredMedalAwardOperationRef.current = null;
            }
            console.warn(
              "Failed to award medals from discovered areas; the next refresh will retry",
              error
            );
          }

          if (activeMedalAlbumId) {
            for (const sessionId of repairedSessionIds) {
              await evaluateMedalCollectionForRecording(
                sessionId,
                activeMedalAlbumId
              );
            }
          }
          const [
            savedCollectedMedalCities,
            savedMedalProgress,
            pendingMedalPresentations,
            retroScanComplete
          ] =
            await Promise.all([
              getCollectedMedalCities().catch((error) => {
                console.warn("Failed to load the all-cities medal collection", error);
                return [];
              }),
              activeMedalAlbumId
                ? getMedalAlbumProgress(activeMedalAlbumId)
                : Promise.resolve(null),
              getPendingMedalPresentations(),
              activeMedalAlbumId
                ? hasCompletedMedalRetroScan(activeMedalAlbumId)
                : Promise.resolve(false)
            ]);

          return {
            savedCollectedMedalCities,
            pendingMedalPresentations,
            retroScanComplete,
            savedMedalProgress,
            state: activeMedalAlbumId ? "ready" : "idle"
          } as const;
        } catch (error) {
          console.warn(
            `Failed to load medal data for ${activeMedalAlbumId ?? "no active album"}`,
            error
          );
          return {
            savedCollectedMedalCities: [] as CollectedMedalCity[],
            pendingMedalPresentations: [] as CollectedMedal[],
            retroScanComplete: false,
            savedMedalProgress: null,
            state: activeMedalAlbumId ? "unavailable" : "idle"
          } as const;
        }
      };
      const [
        lifetimeStats,
        savedHistory,
        savedLoopFillCellIds,
        savedLoopFillSummaries,
        exploredCellIds,
        todayNewExploredCellIds,
        explorationRevision,
        savedCityZones
      ] = await measureAsyncPerformance(
        "map.saved-data-queries",
        () => Promise.all([
          getLifetimeStats(activityMode),
          getWalkHistory(activityMode),
          getLoopFillCellKeys(activityMode),
          getLoopFillSessionSummaries(activityMode),
          getExploredCellKeys(activityMode),
          getTodayNewExploredCellKeys(activityMode),
          getExplorationRevision(activityMode),
          getCachedZones("city")
        ]),
        100
      );
      if (refreshGeneration !== savedDataRefreshGenerationRef.current) return;
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
      setKnownCityZones(savedCityZones.filter(isZoneCompletionEligible));
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
      // Optional catalogue/network work must never hold local map readiness.
      if (hideExplorationDuringRefresh && isMapReadyRef.current) setIsExplorationEnabled(true);
      // Hydrate the independent purple layer before optional medal scans.
      if (isLaunchDismissedRef.current) void refreshForbiddenZones();
      const medalData = await loadMedalData(exploredCellIds, explorationRevision);
      if (refreshGeneration === savedDataRefreshGenerationRef.current) {
        setMedalPresentationQueue(medalData.pendingMedalPresentations);
        setCollectedMedalCities(medalData.savedCollectedMedalCities);
        if (activeMedalAlbumId === activeMedalAlbumIdRef.current) {
          setMedalPackLoadState(medalData.state);
          if (medalData.savedMedalProgress?.album.id === activeMedalAlbumIdRef.current) {
            setMedalProgress(medalData.savedMedalProgress);
            setMedalRetroScanComplete(medalData.retroScanComplete);
          } else if (medalData.state === "unavailable") {
            setMedalProgress(null);
            setMedalRetroScanComplete(false);
          }
        }

      }

      if (detailedWalksModeRef.current === activityMode) {
        loadDetailedWalks().catch((error) =>
          console.warn("Failed to refresh detailed recordings", error)
        );
      }
      } finally {
        if (hideExplorationDuringRefresh) {
          // A failed cache refresh must never leave already valid exploration hidden.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));

          if (isMapReadyRef.current && refreshGeneration === savedDataRefreshGenerationRef.current) {
            setIsExplorationEnabled(true);
          }
        }
      }
    })();
    const trackedOperation = operation.finally(() => {
      savedDataRefreshOperationsRef.current.delete(trackedOperation);
      if (savedDataRefreshOperationRef.current?.promise === trackedOperation) {
        savedDataRefreshOperationRef.current = null;
      }
    });
    savedDataRefreshOperationRef.current = {
      key: operationKey,
      promise: trackedOperation
    };
    savedDataRefreshOperationsRef.current.add(trackedOperation);
    return trackedOperation;
  }, [activeMedalAlbumId, activityMode, loadDetailedWalks, refreshForbiddenZones]);

  useEffect(() => {
    if (
      !isLaunchDismissed ||
      !isSavedDataReady ||
      !isRecoveryCheckComplete ||
      activeWalk ||
      recoverableRecording ||
      streetCompletionMigrationStartedRef.current
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (streetCompletionMigrationStartedRef.current) {
        return;
      }

      streetCompletionMigrationStartedRef.current = true;
      getStreetCompletionState()
        .then(async (state) => {
          await repairPendingRecordingCaches();
          return state.needsRebuild ? rebuildStreetCompletionV2({
            refreshStreetCoverage: true,
            shouldAbort: () => Boolean(activeWalkRef.current)
          }) : null;
        })
        .catch((error) =>
          console.warn("Automatic Street Completion V2 rebuild failed", error)
        );
    }, 0);

    return () => clearTimeout(timer);
  }, [activeWalk, isLaunchDismissed, isRecoveryCheckComplete, isSavedDataReady, recoverableRecording]);

  const toggleLayer = useCallback((layer: keyof MapLayerState) => {
    setLayers((current) => ({
      ...current,
      [layer]: !current[layer]
    }));
  }, []);
  const clearLocationMessage = useCallback((id: number) => {
    setLocationMessage((current) => current?.id === id ? null : current);
  }, []);
  useEffect(() => {
    if (!isAppActive || activeAtlasPage || atlasStampMessage || celebrationMedal) setLocationMessage(null);
  }, [isAppActive, activeAtlasPage, atlasStampMessage, celebrationMedal, locationMessage?.id]);
  const clearAtlasStamp = useCallback(() => {
    setAtlasStampMessage(null);
  }, []);

  const handleMapTopPanelLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setMapOverlayPanelHeights((current) =>
      current.top === nextHeight ? current : { ...current, top: nextHeight }
    );
  }, []);

  const handleMapBottomPanelLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setMapOverlayPanelHeights((current) =>
      current.bottom === nextHeight ? current : { ...current, bottom: nextHeight }
    );
  }, []);

  const mapStampInsets = useMemo(
    () => ({
      bottom: safeAreaInsets.bottom + mapOverlayPanelHeights.bottom + 26,
      top: safeAreaInsets.top + mapOverlayPanelHeights.top + 26
    }),
    [
      mapOverlayPanelHeights.bottom,
      mapOverlayPanelHeights.top,
      safeAreaInsets.bottom,
      safeAreaInsets.top
    ]
  );


  const focusSavedWalkOnMap = useCallback((sessionId: number) => {
    setRouteFocusRequestId((requestId) => requestId + 1);
    setSelectedSessionId(sessionId);
    setPathDisplayMode("selected");
    setLayers((current) => current.showPaths
      ? current
      : { ...current, showPaths: true });
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = () => refreshSavedData({ repairPendingCaches: isLaunchDismissedRef.current }).catch((error) => {
      console.warn("Failed to refresh saved map data", error);
      if (mounted) Alert.alert(
        language === "fr" ? "Chargement impossible" : "Unable to load saved map",
        language === "fr" ? "Vos données sont conservées. Réessayez le chargement." : "Your saved data is preserved. Retry loading it.",
        [{ text: language === "fr" ? "Réessayer" : "Retry", onPress: () => { void load(); } }]
      );
    });
    void load();
    return () => { mounted = false; };
  }, [refreshSavedData, language]);

  useEffect(() => {
    if (!isLaunchDismissed || !isSavedDataReady) {
      return;
    }

    void getPendingRecordingRepairSessionIds().then((ids) => {
      if (ids.length && !activeWalkRef.current) {
        return refreshSavedData({ hideExplorationDuringRefresh: false });
      }
    }).catch((error) => console.warn("Deferred recording repair will retry", error));
    void refreshForbiddenZones();
  }, [isLaunchDismissed, isSavedDataReady, refreshForbiddenZones, refreshSavedData]);

  useEffect(() => {
    if (!layers.showPaths) {
      return;
    }

    loadDetailedWalks({
      mode: pathDisplayMode,
      selectedSessionId
    }).catch((error) =>
      console.warn("Failed to load scoped saved paths", error)
    );
  }, [
    layers.showPaths,
    loadDetailedWalks,
    pathDisplayMode,
    selectedSessionId
  ]);

  useEffect(() => {
    const nextMedal = medalPresentationQueue[0];

    if (!isLaunchDismissed || celebrationMedal || !nextMedal) {
      return;
    }

    setMedalPresentationQueue((current) => current.slice(1));
    setCelebrationMedal(nextMedal);
    markMedalPresentationState(nextMedal.albumId, nextMedal.id, "presenting").catch(
      (error) => console.warn("Failed to start medal presentation", error)
    );
  }, [celebrationMedal, isLaunchDismissed, medalPresentationQueue]);

  useEffect(() => {
    if (!celebrationMedal) {
      setMedalFlightTarget(null);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      medalTabRef.current?.measureInWindow((x, y, width, height) => {
        setMedalFlightTarget({
          x: x + width / 2,
          y: y + height / 2
        });
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [celebrationMedal]);

  useEffect(() => {
    if (!medalTabPulse) {
      return;
    }

    const timerId = setTimeout(() => setMedalTabPulse(false), 900);
    return () => clearTimeout(timerId);
  }, [medalTabPulse]);

  useEffect(() => {
    const evaluation = liveMedalEvaluationRef.current;

    if (!activeWalk) {
      evaluation.evaluatedBoundaryCellCount = -1;
      evaluation.inFlight = false;
      evaluation.latestBoundaryCellCount = -1;
      evaluation.sessionId = null;
      return;
    }

    if (evaluation.sessionId !== activeWalk.sessionId) {
      evaluation.evaluatedBoundaryCellCount = -1;
      evaluation.inFlight = false;
      evaluation.latestBoundaryCellCount = -1;
      evaluation.sessionId = activeWalk.sessionId;
    }

    const activeBoundaryCellCount = activeWalk.exploredCellIds.length;
    const validatedSurfaceBoundaryCellIds = [
      ...new Set([...savedExplorationCellIds, ...activeWalk.exploredCellIds])
    ];
    const boundaryCellCount = validatedSurfaceBoundaryCellIds.length;
    evaluation.latestBoundaryCellCount = boundaryCellCount;

    if (
      !activeMedalProgress ||
      activeBoundaryCellCount < 1 ||
      evaluation.evaluatedBoundaryCellCount === boundaryCellCount ||
      evaluation.inFlight
    ) {
      return;
    }

    const input = {
      albumId: activeMedalProgress.album.id,
      boundaryCellIds: [...activeWalk.exploredCellIds],
      eligibleMedalIds: activeMedalProgress.medals
        .filter((medal) => !medal.isCollected)
        .map((medal) => medal.id),
      sessionId: activeWalk.sessionId,
      validatedSurfaceCellIds: activeClosureFillCellIds,
      walkedDistanceMeters: activeWalk.distanceMeters
    };
    const timerId = setTimeout(() => {
      evaluation.inFlight = true;

      void evaluateLiveMedalCollection(input)
        .then(async (result) => {
          if (result.collected.length === 0) {
            return;
          }

          const [progress, pendingPresentations, collectedCities] = await Promise.all([
            getMedalAlbumProgress(input.albumId),
            getPendingMedalPresentations(),
            getCollectedMedalCities()
          ]);
          if (progress?.album.id === activeMedalAlbumIdRef.current) {
            setMedalProgress(progress);
          }
          setMedalPresentationQueue(pendingPresentations);
          setCollectedMedalCities(collectedCities);
        })
        .catch((error) =>
          console.warn("Live medal evaluation failed", error)
        )
        .finally(() => {
          evaluation.evaluatedBoundaryCellCount = boundaryCellCount;
          evaluation.inFlight = false;

          if (
            evaluation.latestBoundaryCellCount !==
            evaluation.evaluatedBoundaryCellCount
          ) {
            setLiveMedalEvaluationRevision((revision) => revision + 1);
          }
        });
    }, 650);

    return () => clearTimeout(timerId);
  }, [
    activeWalk?.distanceMeters,
    activeWalk?.exploredCellIds.length,
    activeWalk?.sessionId,
    activeMedalAlbumId,
    liveMedalEvaluationRevision,
    activeMedalProgress?.album.id,
    activeMedalProgress?.collectedCount,
    activeClosureFillCellKey,
    savedExplorationCellIds.length
  ]);
  const handleCompleteMedalCelebration = useCallback(async () => {
    if (!celebrationMedal) {
      return;
    }

    try {
      await markMedalPresentationState(
        celebrationMedal.albumId,
        celebrationMedal.id,
        "presented"
      );
      const [progress, collectedCities] = await Promise.all([
        activeMedalAlbumId
          ? getMedalAlbumProgress(activeMedalAlbumId)
          : Promise.resolve(null),
        getCollectedMedalCities()
      ]);

      if (progress?.album.id === activeMedalAlbumIdRef.current) {
        setMedalProgress(progress);
      }
      setCollectedMedalCities(collectedCities);
    } catch (error) {
      console.warn("Failed to finish medal presentation", error);
    } finally {
      setCelebrationMedal(null);
      setMedalTabPulse(true);
    }
  }, [activeMedalAlbumId, celebrationMedal]);

  const handleRunMedalRetroScan = useCallback(() => {
    if (!activeMedalAlbumId) {
      return;
    }

    const isFrench = language === "fr";

    Alert.alert(
      isFrench ? "Analyser les parcours pr\u00e9c\u00e9dents ?" : "Scan past walks?",
      isFrench
        ? "Les m\u00eames r\u00e8gles de fermeture de boucle que la carte seront utilis\u00e9es."
        : "The same loop-closing rules as the exploration map will be used.",
      [
        { text: isFrench ? "Annuler" : "Cancel", style: "cancel" },
        {
          text: isFrench ? "Analyser" : "Scan",
          onPress: async () => {
            setIsScanningMedals(true);

            try {
              const result = await runMedalRetroScan(activeMedalAlbumId);
              await refreshSavedData();
              Alert.alert(
                isFrench ? "Analyse termin\u00e9e" : "Scan complete",
                isFrench
                  ? `${result.collected.length} nouvelle(s) m\u00e9daille(s) trouv\u00e9e(s).`
                  : `${result.collected.length} new medal(s) found.`
              );
            } catch (error) {
              console.warn("Failed to scan past walks for medals", error);
              Alert.alert(
                isFrench ? "Analyse impossible" : "Scan failed",
                isFrench
                  ? "Street Explorer n\u2019a pas pu analyser les parcours."
                  : "Street Explorer could not scan the saved walks."
              );
            } finally {
              setIsScanningMedals(false);
            }
          }
        }
      ]
    );
  }, [activeMedalAlbumId, language, refreshSavedData]);

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

  const reloadSavedCompletionObjective = useCallback(async () => {
    const savedObjective = await getSavedCompletionObjective();

    if (!savedObjective) {
      setObjective(null);
      setSelectedZone(null);
      setObjectiveStats(null);
      objectiveScopePairRef.current = null;
      mapBoundarySwapGenerationRef.current += 1;
      districtZoneLoadRequestRef.current += 1;
      mapBoundaryContextRef.current = EMPTY_MAP_BOUNDARY_CONTEXT;
      setMapBoundaryContext(EMPTY_MAP_BOUNDARY_CONTEXT);
      return null;
    }

    setIsCountrysideSelected(false);
    setObjective(savedObjective);
    setSelectedZone(savedObjective.zone);
    const cachedSnapshot = objectiveStatsCacheRef.current.get(
      `${savedObjective.mode}:${savedObjective.zone.id}`
    );
    const cachedStats = cachedSnapshot?.geometryFingerprint ===
      getZoneGeometryFingerprint(savedObjective.zone)
        ? cachedSnapshot.stats
        : null;
    setObjectiveStats((currentStats) =>
      cachedStats ??
      (objectiveRef.current?.mode === savedObjective.mode &&
      objectiveRef.current.zone.id === savedObjective.zone.id &&
      currentStats?.permanentlyCompleted
        ? currentStats
        : null)
    );
    return savedObjective;
  }, []);

  const commitMapBoundaryContext = useCallback(async (
    nextContext: MapBoundaryContext
  ) => {
    const generation = mapBoundarySwapGenerationRef.current + 1;
    mapBoundarySwapGenerationRef.current = generation;

    const swapPromise = mapBoundarySwapChainRef.current.then(async () => {
      if (mapBoundarySwapGenerationRef.current !== generation) {
        return;
      }

      const previousContext = mapBoundaryContextRef.current;
      const isCrossCitySwap =
        previousContext.city !== null &&
        previousContext.city.id !== nextContext.city?.id;

      if (isCrossCitySwap) {
        mapBoundaryContextRef.current = EMPTY_MAP_BOUNDARY_CONTEXT;
        setMapBoundaryContext(EMPTY_MAP_BOUNDARY_CONTEXT);
        await waitForMapRenderCommit();

        if (mapBoundarySwapGenerationRef.current !== generation) {
          return;
        }
      }

      mapBoundaryContextRef.current = nextContext;
      setMapBoundaryContext(nextContext);
    });

    mapBoundarySwapChainRef.current = swapPromise.catch(() => undefined);
    await swapPromise;
  }, []);

  const loadVisibleDistrictZones = useCallback(async (referenceLocation: GpsPoint) => {
    const requestId = districtZoneLoadRequestRef.current + 1;
    districtZoneLoadRequestRef.current = requestId;
    const [cities, districts] = await Promise.all([
      getCachedZones("city"),
      getCachedZones("district")
    ]);
    setKnownCityZones(cities.filter(isZoneCompletionEligible));
    const currentCity = findContainingZone(referenceLocation, cities);
    const nextDistrictZones = currentCity
      ? districts.filter(
          (zone) =>
            isZoneCompletionEligible(zone) &&
            doesDistrictBelongToCity(zone, currentCity)
        )
      : [];

    if (districtZoneLoadRequestRef.current === requestId) {
      await commitMapBoundaryContext({
        city: currentCity,
        districts: nextDistrictZones
      });
    }

    return nextDistrictZones;
  }, [commitMapBoundaryContext]);

  const loadDistrictZonesForObjectiveZone = useCallback(async (zone: CachedZone) => {
    const requestId = districtZoneLoadRequestRef.current + 1;
    districtZoneLoadRequestRef.current = requestId;
    const [cities, districts] = await Promise.all([
      getCachedZones("city"),
      getCachedZones("district")
    ]);
    setKnownCityZones(cities.filter(isZoneCompletionEligible));
    const currentCity = zone.type === "city"
      ? cities.find((city) => city.id === zone.id) ?? zone
      : cities.find((city) => doesDistrictBelongToCity(zone, city)) ?? null;
    const cityDistrictZones = currentCity
      ? districts.filter(
          (district) =>
            isZoneCompletionEligible(district) &&
            doesDistrictBelongToCity(district, currentCity)
        )
      : [];
    const nextDistrictZones =
      zone.type === "district" &&
      isZoneCompletionEligible(zone) &&
      !cityDistrictZones.some((district) => district.id === zone.id)
        ? [...cityDistrictZones, zone]
        : cityDistrictZones;

    if (districtZoneLoadRequestRef.current === requestId) {
      await commitMapBoundaryContext({
        city: currentCity,
        districts: nextDistrictZones
      });

      if (districtZoneLoadRequestRef.current === requestId) {
        objectiveScopePairRef.current = currentCity && zone.type === "district"
          ? { city: currentCity, district: zone }
          : null;
      }
    }

    return nextDistrictZones;
  }, [commitMapBoundaryContext]);

  const hydrateObjectiveZonesIntoCache = useCallback(async (
    zones: CachedZone[],
    mode: ActivityMode,
    signal?: AbortSignal
  ) => {
    const hydration = await hydrateZoneCompletionSnapshots(zones, mode, signal);

    for (const entry of hydration.hydrated) {
      if (entry.authoritativeSnapshot) {
        objectiveStatsCacheRef.current.set(
          `${mode}:${entry.zone.id}`,
          entry.authoritativeSnapshot
        );
      }
    }

    return hydration;
  }, []);

  const commitMapObjective = useCallback((
    zone: CachedZone,
    options: { showSelectionStamp?: boolean } = {}
  ) => {
    if (!isSelectableMapObjectiveZone(zone)) {
      return;
    }

    const nextObjective: CompletionObjective = {
      mode: "walk",
      zone
    };

    setIsCountrysideSelected(false);
    setObjective(nextObjective);
    setObjectiveHudVisible(true);
    setSelectedZone(zone);
    const cachedSnapshot = objectiveStatsCacheRef.current.get(`walk:${zone.id}`);
    const cachedStats = cachedSnapshot?.geometryFingerprint ===
      getZoneGeometryFingerprint(zone)
        ? cachedSnapshot.stats
        : null;
    setObjectiveStats((currentStats) =>
      cachedStats ??
      (objectiveRef.current?.mode === nextObjective.mode &&
      objectiveRef.current.zone.id === nextObjective.zone.id &&
      currentStats?.permanentlyCompleted
        ? currentStats
        : null)
    );
    if (options.showSelectionStamp !== false) {
      setLocationMessage({
        id: ++locationMessageIdRef.current,
        expiresAt: Date.now() + 3200,
        name: zone.name,
        scope: zone.type === "city"
          ? language === "fr" ? "VILLE" : "CITY"
          : language === "fr" ? "QUARTIER" : "DISTRICT"
      });
    }
    objectiveSaveChainRef.current = objectiveSaveChainRef.current
      .then(() => saveCompletionObjective({
        mode: nextObjective.mode,
        zoneId: nextObjective.zone.id
      }))
      .catch((error) => {
        console.warn("Failed to save completion objective", error);
      });
  }, [language]);

  const applyMapObjective = useCallback((zone: CachedZone) => {
    mapZoneSelectionAbortRef.current?.abort();
    mapZoneSelectionRequestRef.current += 1;
    setIsMapZoneSelectionLoading(false);
    commitMapObjective(zone);
  }, [commitMapObjective]);

  const commitCountrysideSelection = useCallback(async (requestId: number) => {
    districtZoneLoadRequestRef.current += 1;
    await commitMapBoundaryContext(EMPTY_MAP_BOUNDARY_CONTEXT);
    if (mapZoneSelectionRequestRef.current !== requestId) return;
    setIsCountrysideSelected(true);
    setObjective(null);
    setObjectiveHudVisible(true);
    setObjectiveStats(null);
    setIsObjectiveStatsCalculating(false);
    setSelectedZone(null);
    setMapZoneSelection(null);
    objectiveScopePairRef.current = null;
    setLocationMessage({
      id: ++locationMessageIdRef.current,
      expiresAt: Date.now() + 3200,
      name: language === "fr" ? "La campagne" : "The countryside",
      scope: language === "fr" ? "EXPLORATION" : "EXPLORING"
    });
    objectiveSaveChainRef.current = objectiveSaveChainRef.current
      .then(() => saveCompletionObjective(null))
      .catch((error) => {
        console.warn("Failed to clear completion objective for countryside", error);
      });
  }, [commitMapBoundaryContext, language]);

  const handleMapLongPress = useCallback(async (coordinate: {
    latitude: number;
    longitude: number;
  }, showFailure = true) => {
    const requestId = mapZoneSelectionRequestRef.current + 1;
    mapZoneSelectionRequestRef.current = requestId;
    mapZoneSelectionAbortRef.current?.abort();
    const selectionController = new AbortController();
    mapZoneSelectionAbortRef.current = selectionController;
    setIsMapZoneSelectionLoading(true);
    setMapZoneSelection(null);

    try {
      objectiveScopePairRef.current = null;
      void playSelectionHaptic();

      const visible = mapBoundaryContextRef.current;
      let countries: CachedZone[] = [];
      let cities = visible.city ? [visible.city] : [];
      let districts = visible.districts;
      const resolveHeldZones = () => {
        const eligibleCities = cities.filter(isZoneCompletionEligible);
        const city = findContainingZoneForMapHold(
          coordinate, eligibleCities, mapViewportRegionRef.current
        );
        const eligibleDistricts = districts === visible.districts && city === visible.city
          ? districts
          : districts.filter((candidate) =>
          isZoneCompletionEligible(candidate) &&
          (!city || doesDistrictBelongToCity(candidate, city))
        );
        const district = findContainingZoneForMapHold(
          coordinate, eligibleDistricts, mapViewportRegionRef.current
        );
        const country = !city && !district
          ? findContainingZone(coordinate, countries.filter(isZoneCompletionEligible))
          : null;
        return { city, country, district };
      };
      const visibleResult = resolveHeldZones();
      let loadedCache = false;
      const { city, country, district } = await resolveMapSelection({
        visible: visibleResult.city && visibleResult.district ? visibleResult : null,
        hasObjective: (result) => Boolean(result.city || result.district),
        signal: selectionController.signal,
        loadCached: async () => {
          [cities, districts] = await Promise.all([
            getCachedZones("city"), getCachedZones("district")
          ]);
          loadedCache = true;
          return resolveHeldZones();
        },
        loadRemote: async () => {
          countries = await getCachedZones("country");
          if (selectionController.signal.aborted) return resolveHeldZones();
          try {
            const result = await fetchNearbyOsmZonesWithDebug(coordinate, selectionController.signal);
            if (selectionController.signal.aborted) return resolveHeldZones();
            await upsertZones(result.zones);
            [countries, cities, districts] = await Promise.all([
              getCachedZones("country"), getCachedZones("city"), getCachedZones("district")
            ]);
          } catch (error) {
            if (!selectionController.signal.aborted) {
              console.warn("Failed to load boundaries for map long press", error);
              throw error;
            }
          }
          return resolveHeldZones();
        }
      });

      if (mapZoneSelectionRequestRef.current !== requestId) {
        return;
      }

      if (loadedCache) setKnownCityZones(cities.filter(isZoneCompletionEligible));

      if (shouldSelectCountryside({
        hasContainingCity: Boolean(city),
        hasContainingCountry: Boolean(country),
        hasContainingDistrict: Boolean(district)
      })) {
        await commitCountrysideSelection(requestId);
        return;
      }

      if (!city && !district) {
        // Open ocean has neither an exact city nor country boundary and is not selectable.
        return;
      }

      const currentCityId = objective?.zone.type === "city"
        ? objective.zone.id
        : mapBoundaryContextRef.current.city?.id ?? null;
      const cityDistrictZones = city === visible.city && districts === visible.districts
        ? districts
        : city
        ? districts.filter(
            (zone) =>
              isZoneCompletionEligible(zone) && doesDistrictBelongToCity(zone, city)
          )
        : [];
      const nextDistrictZones =
        district &&
        isZoneCompletionEligible(district) &&
        !cityDistrictZones.some((zone) => zone.id === district.id)
          ? [...cityDistrictZones, district]
          : cityDistrictZones;
      districtZoneLoadRequestRef.current += 1;
      await commitMapBoundaryContext({
        city,
        districts: nextDistrictZones
      });

      if (mapZoneSelectionRequestRef.current !== requestId) {
        return;
      }

      const choices = { city, district };
      const shouldOfferScopeChoice = shouldOfferMapZoneScopeChoice({
        currentCityId,
        hasHeldDistrict: Boolean(district),
        heldCityId: city?.id ?? null
      });
      setMapZoneSelection(shouldOfferScopeChoice ? choices : null);
      // The objective effect hydrates/recalculates progress after selection.
      // SQLite completion reads must not delay acknowledgement of the hold.
      const preferredZone = shouldOfferScopeChoice && objective?.zone.type === "city"
        ? city ?? district
        : district ?? city;
      objectiveScopePairRef.current = city && district ? choices : null;

      if (preferredZone) {
        applyMapObjective(preferredZone);
      }
    } catch (error) {
      if (!selectionController.signal.aborted && mapZoneSelectionRequestRef.current === requestId) {
        console.warn("Failed to select map area", error);
        if (showFailure) Alert.alert(
          language === "fr" ? "Limites indisponibles" : "Boundaries unavailable",
          language === "fr"
            ? "Impossible de charger les villes et arrondissements. Vérifiez votre connexion, puis réessayez avec un appui long."
            : "Could not load cities and districts. Check your connection, then long-press to try again."
        );
      }
    } finally {
      if (mapZoneSelectionRequestRef.current === requestId) {
        setIsMapZoneSelectionLoading(false);
      }
    }
  }, [
    applyMapObjective,
    commitCountrysideSelection,
    commitMapBoundaryContext,
    language,
    objective?.zone.id,
    objective?.zone.type
  ]);

  const initialBoundaryLookupStarted = useRef(false);
  useEffect(() => {
    if (!isLaunchDismissed || !isLaunchObjectiveResolved || !currentLocation ||
        objective || activeWalk || initialBoundaryLookupStarted.current ||
        mapZoneSelectionRequestRef.current !== 0) return;
    initialBoundaryLookupStarted.current = true;
    // Never block launch on the network. A user hold supersedes this request.
    void handleMapLongPress(currentLocation, false);
  }, [isLaunchDismissed, isLaunchObjectiveResolved, currentLocation, objective, activeWalk, handleMapLongPress]);

  const handleToggleForbiddenZoneMode = useCallback(() => {
    if (activeWalkRef.current) {
      return;
    }

    forbiddenZoneRequestRef.current += 1;
    setIsForbiddenZoneProcessing(false);
    setMapZoneSelection(null);
    mapZoneSelectionRequestRef.current += 1;
    mapZoneSelectionAbortRef.current?.abort();
    setIsMapZoneSelectionLoading(false);
    setIsForbiddenZoneModeActive((active) => !active);
  }, []);

  useEffect(() => {
    if (!activeWalk) {
      return;
    }

    forbiddenZoneRequestRef.current += 1;
    setIsForbiddenZoneModeActive(false);
    setIsForbiddenZoneProcessing(false);
  }, [activeWalk?.sessionId]);

  const handleForbiddenZoneLongPress = useCallback(async (coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    if (activeWalkRef.current || isForbiddenZoneProcessing) {
      return;
    }

    const requestId = forbiddenZoneRequestRef.current + 1;
    forbiddenZoneRequestRef.current = requestId;
    setIsForbiddenZoneProcessing(true);

    try {
      await playSelectionHaptic();
      await waitForMapRenderCommit();

      if (forbiddenZoneRequestRef.current !== requestId) {
        return;
      }

      const targetCellId = coordinateToExplorationCellKey(coordinate);
      const existingZone = forbiddenZones.find((zone) =>
        zone.cellIds.includes(targetCellId)
      );

      if (existingZone) {
        Alert.alert(
          language === "fr" ? "Supprimer la Zone interdite ?" : "Remove Forbidden Zone?",
          language === "fr"
            ? "Cette zone comptera de nouveau dans la progression d’exploration."
            : "This area will once again count toward exploration completion.",
          [
            { text: language === "fr" ? "Annuler" : "Cancel", style: "cancel" },
            {
              text: language === "fr" ? "Supprimer" : "Remove",
              style: "destructive",
              onPress: () => {
                setIsForbiddenZoneProcessing(true);
                void deleteForbiddenZone(existingZone.id)
                  .then(() => {
                    forbiddenZoneLoadGenerationRef.current += 1;
                    setForbiddenZones((zones) =>
                      zones.filter((zone) => zone.id !== existingZone.id)
                    );
                    setVisibleForbiddenZoneLabel((current) =>
                      current?.zoneId === existingZone.id ? null : current
                    );
                    setForbiddenZoneCommentEditor((current) =>
                      current?.zoneId === existingZone.id ? null : current
                    );
                    objectiveStatsCacheRef.current.clear();
                    setObjectiveMaintenanceRevision((revision) => revision + 1);
                    setIsForbiddenZoneModeActive(false);
                  })
                  .catch((error) => {
                    console.warn("Failed to remove Forbidden Zone", error);
                    Alert.alert(
                      language === "fr" ? "Suppression impossible" : "Removal failed",
                      language === "fr"
                        ? "Mapbound a conservé la Zone interdite."
                        : "Mapbound kept the Forbidden Zone."
                    );
                  })
                  .finally(() => setIsForbiddenZoneProcessing(false));
              }
            }
          ]
        );
        return;
      }

      const records = await getExploredCellRecords("walk");

      if (
        forbiddenZoneRequestRef.current !== requestId ||
        activeWalkRef.current
      ) {
        return;
      }

      const boundaryCellIds = [
        ...new Set(
          records
            .filter((record) => record.source !== "loop_fill")
            .map((record) => record.cellKey)
        )
      ];
      const selection = analyzeForbiddenZoneSelection({
        activityMode: "walk",
        boundaryCellIds,
        coordinate
      });

      if (selection.classification === "not_enclosed") {
        Alert.alert(
          language === "fr" ? "Zone interdite impossible" : "Cannot create Forbidden Zone",
          language === "fr"
            ? "Cette zone n’a pas encore été complètement entourée."
            : "This area has not been completely surrounded yet."
        );
        return;
      }

      if (selection.classification === "normal_loop_candidate") {
        Alert.alert(
          language === "fr" ? "Zone interdite impossible" : "Cannot create Forbidden Zone",
          language === "fr"
            ? "Cette zone entourée est assez petite pour être capturée normalement."
            : "This enclosed area is small enough to be captured normally."
        );
        return;
      }

      if (selection.classification === "too_large") {
        Alert.alert(
          language === "fr" ? "Zone interdite impossible" : "Cannot create Forbidden Zone",
          language === "fr"
            ? "La zone sélectionnée est trop grande."
            : "The selected area is too large."
        );
        return;
      }

      const created = await createForbiddenZone({
        areaM2: selection.areaM2,
        cellIds: selection.cellIds,
        polygons: selection.polygons
      });

      forbiddenZoneLoadGenerationRef.current += 1;
      setForbiddenZones((zones) => [...zones, created]);
      objectiveStatsCacheRef.current.clear();
      setObjectiveMaintenanceRevision((revision) => revision + 1);
      setIsForbiddenZoneModeActive(false);
      const districtId = objective?.zone.type === "district"
        ? objective.zone.id
        : null;

      if (districtId) {
        setVisibleForbiddenZoneLabel({ coordinate, districtId, zoneId: created.id });
      }

      setForbiddenZoneCommentEditor({ isCreation: true, zoneId: created.id });
    } catch (error) {
      const failureReason = getForbiddenZonePersistenceFailureReason(error);
      console.warn("Failed to process Forbidden Zone selection", {
        error,
        failureReason
      });
      Alert.alert(
        language === "fr" ? "Zone interdite impossible" : "Cannot create Forbidden Zone",
        getForbiddenZonePersistenceFailureMessage(failureReason, language)
      );
    } finally {
      if (forbiddenZoneRequestRef.current === requestId) {
        setIsForbiddenZoneProcessing(false);
      }
    }
  }, [
    forbiddenZones,
    isForbiddenZoneProcessing,
    language,
    objective?.zone.id,
    objective?.zone.type
  ]);

  const handleCompletionZonesUpdated = useCallback(async () => {
    const savedObjective = await reloadSavedCompletionObjective();

    if (savedObjective) {
      await loadDistrictZonesForObjectiveZone(savedObjective.zone);
    } else if (completionReferenceLocation) {
      await loadVisibleDistrictZones(completionReferenceLocation);
    }
  }, [
    completionReferenceLocation,
    loadDistrictZonesForObjectiveZone,
    loadVisibleDistrictZones,
    reloadSavedCompletionObjective
  ]);

  useEffect(() => {
    let isMounted = true;

    reloadSavedCompletionObjective()
      .catch((error) => console.warn("Failed to load saved completion objective", error))
      .finally(() => {
        if (isMounted) {
          setIsSavedObjectiveReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reloadSavedCompletionObjective]);
  useEffect(() => {
    const zone = objective?.zone;

    if (
      !isLaunchDismissed ||
      isRecording ||
      !zone ||
      zone.type === "country" ||
      (zone.adminLevel !== null && zone.adminLevel !== undefined) ||
      legacyObjectiveRefreshIdsRef.current.has(zone.id)
    ) {
      return;
    }

    const bounds = getZoneBounds(zone);

    if (!bounds) {
      return;
    }

    legacyObjectiveRefreshIdsRef.current.add(zone.id);
    let cancelled = false;
    const abortController = new AbortController();

    fetchNearbyOsmZonesWithDebug({
      latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
      longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
    }, abortController.signal)
      .then(async (result) => {
        await upsertZones(result.zones);

        if (!cancelled) {
          await reloadSavedCompletionObjective();
        }
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.warn("Failed to classify legacy objective boundaries", error);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    isLaunchDismissed,
    isRecording,
    objective?.zone.adminLevel,
    objective?.zone.id,
    objective?.zone.type,
    reloadSavedCompletionObjective
  ]);

  useEffect(() => {
    if (!objective) {
      return;
    }

    loadDistrictZonesForObjectiveZone(objective.zone)
      .catch((error) => console.warn("Failed to load objective city districts", error));
  }, [
    loadDistrictZonesForObjectiveZone,
    objective?.zone.fetchedAt,
    objective?.zone.id
  ]);

  useEffect(() => {
    if (
      !isSavedObjectiveReady ||
      launchObjectiveSelectionStartedRef.current ||
      permissionState === "unknown" ||
      (permissionState === "granted" && !initialLocationResolved)
    ) {
      return;
    }

    launchObjectiveSelectionStartedRef.current = true;

    const selectLaunchObjective = async () => {
      const savedZone = objective?.zone ?? null;
      const canResolveNearbyZones =
        permissionState === "granted" && Boolean(launchObjectiveLocation);
      const [cities, districts] = canResolveNearbyZones
        ? await Promise.all([
        getCachedZones("city"),
        getCachedZones("district")
      ])
        : [[], []];
      if (canResolveNearbyZones) {
        setKnownCityZones(cities.filter(isZoneCompletionEligible));
      }
      const currentCity = launchObjectiveLocation
        ? findContainingZone(launchObjectiveLocation, cities)
        : null;
      const cityDistricts = currentCity
        ? districts.filter(
            (district) =>
              isZoneCompletionEligible(district) &&
              doesDistrictBelongToCity(district, currentCity)
          )
        : [];
      const currentDistrict = launchObjectiveLocation
        ? findContainingZone(launchObjectiveLocation, cityDistricts)
        : null;
      const pair = currentCity
        ? { city: currentCity, district: currentDistrict }
        : null;
      const preferredZone = currentDistrict ?? currentCity ?? savedZone;
      const hydrationZones = buildCompletionHydrationZones(savedZone, pair);
      const hydration = await hydrateObjectiveZonesIntoCache(
        hydrationZones,
        objective?.mode ?? "walk"
      );

      if (currentCity) {
        await commitMapBoundaryContext({ city: currentCity, districts: cityDistricts });
      }

      objectiveScopePairRef.current = pair;

      if (preferredZone) {
        commitMapObjective(preferredZone, { showSelectionStamp: false });
        const preferredHydration = hydration.hydrated.find(
          (entry) => entry.zone.id === preferredZone.id
        );

        if (preferredHydration?.fallbackStats) {
          setObjectiveStats(preferredHydration.fallbackStats);
        }

        await objectiveSaveChainRef.current;
      }
    };

    selectLaunchObjective()
      .catch((error) => {
        console.warn(
          "Failed to auto-select the launch completion objective; keeping the saved objective",
          error
        );
      })
      .finally(() => {
        setIsObjectiveCacheHydrated(true);
        setIsLaunchObjectiveResolved(true);
      });
  }, [
    commitMapBoundaryContext,
    commitMapObjective,
    hydrateObjectiveZonesIntoCache,
    initialLocationResolved,
    isSavedObjectiveReady,
    launchObjectiveLocation,
    objective,
    permissionState
  ]);

  useEffect(() => {
    const previousMonitor = activeClosureMonitorRef.current;

    if (!activeClosureContextKey) {
      activeClosureMonitorRef.current = {
        contextKey: null,
        fillCellIds: new Set()
      };
      return;
    }

    if (previousMonitor.contextKey !== activeClosureContextKey) {
      activeClosureMonitorRef.current = {
        contextKey: activeClosureContextKey,
        fillCellIds: new Set(activeClosureFillCellIds)
      };
      return;
    }

    const newlyEnclosedCellIds = activeClosureFillCellIds.filter(
      (cellId) => !previousMonitor.fillCellIds.has(cellId)
    );

    activeClosureMonitorRef.current = {
      contextKey: activeClosureContextKey,
      fillCellIds: new Set(activeClosureFillCellIds)
    };

    if (newlyEnclosedCellIds.length > 0) {

      setAtlasStampMessage({
        detail: language === "fr"
          ? `${newlyEnclosedCellIds.length} CASE${newlyEnclosedCellIds.length === 1 ? "" : "S"} RÉVÉLÉE${newlyEnclosedCellIds.length === 1 ? "" : "S"}`
          : `${newlyEnclosedCellIds.length} CELL${newlyEnclosedCellIds.length === 1 ? "" : "S"} REVEALED`,
        id: Date.now(),
        pointsAwarded: newlyEnclosedCellIds.length * 2,
        presentation: "map-selection",
        sound: "reward",
        title: language === "fr" ? "ZONE ENCLOSE" : "AREA ENCLOSED"
      });

    }
  }, [
    activeClosureContextKey,
    activeClosureFillCellKey,
    activeWalk?.activityMode,
    activeWalk?.sessionId,
    language,
    objective?.mode,
    objective?.zone.id
  ]);

  const handleMapPressEvent = useCallback((coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    if (isForbiddenZoneModeActive || !activeDistrictObjectiveId) {
      return;
    }

    const cellId = coordinateToExplorationCellKey(coordinate);
    const zone = forbiddenZones.find((candidate) =>
      candidate.cellIds.includes(cellId)
    );

    if (!zone) {
      return;
    }

    setVisibleForbiddenZoneLabel({
      coordinate,
      districtId: activeDistrictObjectiveId,
      zoneId: zone.id
    });
    void playSelectionHaptic();
  }, [activeDistrictObjectiveId, forbiddenZones, isForbiddenZoneModeActive]);

  const handleForbiddenZoneLabelPress = useCallback((zone: ForbiddenZone) => {
    setForbiddenZoneCommentEditor({ isCreation: false, zoneId: zone.id });
  }, []);

  const handleSaveForbiddenZoneComment = useCallback(async (comment: string) => {
    if (!forbiddenZoneCommentEditor) {
      return;
    }

    try {
      const update = await updateForbiddenZoneComment(
        forbiddenZoneCommentEditor.zoneId,
        comment
      );
      forbiddenZoneLoadGenerationRef.current += 1;
      setForbiddenZones((zones) => zones.map((zone) =>
        zone.id === forbiddenZoneCommentEditor.zoneId
          ? { ...zone, comment: update.comment, updatedAt: update.updatedAt }
          : zone
      ));
      setForbiddenZoneCommentEditor(null);
    } catch (error) {
      console.warn("Failed to save Forbidden Zone comment", error);
      Alert.alert(
        language === "fr" ? "Commentaire non enregistré" : "Comment not saved",
        language === "fr"
          ? "Mapbound a conservé le commentaire précédent."
          : "Mapbound kept the previous comment."
      );
    }
  }, [forbiddenZoneCommentEditor, language]);

  const handleMapLongPressEvent = useCallback((coordinate: {
    latitude: number;
    longitude: number;
  }) => {
    if (isForbiddenZoneModeActive) {
      void handleForbiddenZoneLongPress(coordinate);
      return;
    }

    void handleMapLongPress(coordinate).catch((error) =>
      console.warn("Failed to select map objective", error)
    );
  }, [
    handleForbiddenZoneLongPress,
    handleMapLongPress,
    isForbiddenZoneModeActive
  ]);

  useEffect(() => {
    const requestId = objectiveStatsRequestRef.current + 1;
    objectiveStatsRequestRef.current = requestId;

    if (!isLaunchDismissed) {
      setIsObjectiveStatsCalculating(false);
      return;
    }

    if (!objective) {
      setObjectiveStats(null);
      setIsObjectiveStatsCalculating(false);
      return;
    }

    const abortController = new AbortController();
    const selectedCacheKey = `${objective.mode}:${objective.zone.id}`;
    const immediateSnapshot = objectiveStatsCacheRef.current.get(selectedCacheKey);
    const geometryFingerprint = getZoneGeometryFingerprint(objective.zone);
    const immediateStats = immediateSnapshot?.geometryFingerprint === geometryFingerprint
      ? immediateSnapshot.stats
      : null;

    if (immediateStats) {
      setObjectiveStats(immediateStats);
    }
    setIsObjectiveStatsCalculating(false);

    const refreshCompletionSnapshot = async () => {
      const hydration = await hydrateObjectiveZonesIntoCache(
        [objective.zone],
        objective.mode,
        abortController.signal
      );
      const hydrated = hydration.hydrated[0];
      const usableStats = hydrated?.fallbackStats ?? immediateStats;

      if (
        usableStats &&
        !abortController.signal.aborted &&
        objectiveStatsRequestRef.current === requestId
      ) {
        setObjectiveStats(usableStats);
      }

      if (hydrated?.authoritativeSnapshot) {
        return;
      }

      if (!shouldRunExpensiveCompletionMaintenance(
        isRecording || isComputingRecording
      )) {
        return;
      }

      if (!usableStats) {
        setIsObjectiveStatsCalculating(true);
      }

      const snapshot = await calculateZoneCompletionSnapshot(
        objective.zone,
        objective.mode,
        hydration.explorationRevision,
        abortController.signal
      );
      const currentRevision = await getExplorationRevision(objective.mode);

      if (
        currentRevision !== snapshot.explorationRevision ||
        abortController.signal.aborted ||
        objectiveStatsRequestRef.current !== requestId
      ) {
        return;
      }

      objectiveStatsCacheRef.current.set(selectedCacheKey, snapshot);
      setObjectiveStats(snapshot.stats);
    };

    refreshCompletionSnapshot()
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.warn("Failed to refresh objective completion cache", error);
        }
      })
      .finally(() => {
        if (objectiveStatsRequestRef.current === requestId) {
          setIsObjectiveStatsCalculating(false);
        }
      });

    return () => abortController.abort();
  }, [
    hydrateObjectiveZonesIntoCache,
    isComputingRecording,
    isLaunchDismissed,
    isRecording,
    objective?.mode,
    objective?.zone,
    objectiveMaintenanceRevision
  ]);

  const closeAllAtlasPages = useCallback(() => {
    setDashboardExpanded(false);
    setHistoryVisible(false);
    setCompletionVisible(false);
    setMedalsVisible(false);
    setOptionsVisible(false);
    setDiagnosticsVisible(false);
  }, [publishCurrentLocation]);
  const handleReturnToMapFromAtlas = useCallback(() => {
    if (!activeWalkRef.current) {
      setIsMapWordmarkCollapsed(false);
    }
    returnToMapFromAtlas(closeAllAtlasPages);
  }, [closeAllAtlasPages]);
  const navigateAtlasPage = useCallback((page: AtlasPageId) => {
    if (page === "map") {
      if (activeAtlasPage) {
        handleReturnToMapFromAtlas();
      }
      return;
    }

    if (activeAtlasPage === page) {
      handleReturnToMapFromAtlas();
      return;
    }

    closeAllAtlasPages();
    switch (page) {
      case "details":
        setDashboardExpanded(true);
        break;
      case "history":
        setHistoryVisible(true);
        break;
      case "completion":
        setCompletionVisible(true);
        break;
      case "medals":
        setMedalsVisible(true);
        break;
      case "options":
        setOptionsVisible(true);
        break;
    }
  }, [activeAtlasPage, closeAllAtlasPages, handleReturnToMapFromAtlas]);

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

  const rebuildPendingStreetCompletion = useCallback(() => {
    if (activeWalkRef.current) {
      return;
    }

    getStreetCompletionState()
      .then((state) =>
        state.needsRebuild
          ? rebuildStreetCompletionV2({
              shouldAbort: () => Boolean(activeWalkRef.current)
            })
          : null
      )
      .catch((error) =>
        console.warn("Pending Street Completion V2 rebuild failed", error)
      );
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
        rebuildPendingStreetCompletion();
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
        rebuildPendingStreetCompletion();
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
    rebuildPendingStreetCompletion,
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
    const persistedPoints = await getGpsPointsForSession(sessionId);
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
        distanceMeters: calculateTrustedGpsDistanceMeters(
          points,
          currentWalk.activityMode
        ),
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
    const persistedPoints = await getGpsPointsAfterIndex(
      sessionId,
      lastRenderedPoint?.pointIndex ?? -1
    );

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
      activeWalkRef.current = nextWalk;
      return nextWalk;
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
    const intervalId = setInterval(synchronizeTail, 3000);
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
        console.info("[recording] background task status", {
          sessionId,
          status: "unavailable"
        });
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
        console.info("[recording] background task status", {
          sessionId,
          status: "enabled"
        });
        return;
      }

      setBackgroundTrackingStatus("foreground-only");
      console.info("[recording] background task status", {
        sessionId,
        status: "foreground-only"
      });
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
      console.info("[recording] background task status", {
        sessionId,
        status: "unavailable"
      });
      setBackgroundTrackingStatus("unavailable");
      setBackgroundTrackingMessage(strings.map.backgroundUnavailable);
    }
  }, [isRecordingLifecycleCurrent, strings]);

  useEffect(() => {
    let claimedSessionId: number | null = null;
    let didCommitRecovery = false;
    let recoveryCheckFailed = false;
    let isMounted = true;
    setIsRecoveryCheckComplete(false);

    if (permissionState === "unknown") {
      return () => {
        isMounted = false;
      };
    }

    const detectRecoverableRecording = async () => {
      if (
        isStartingRecordingRef.current ||
        isStoppingRecordingRef.current
      ) {
        return;
      }

      await drainPendingBackgroundLocationBatches();
      const invalidActiveRecordings: InvalidActiveRecordingDiagnostic[] = [];
      const activeRecording = await getActiveRecordingSettings((diagnostic) => {
        invalidActiveRecordings.push(diagnostic);
      });
      const invalidActiveRecording = invalidActiveRecordings[0];

      if (
        invalidActiveRecording &&
        invalidActiveRecording.reason !== "finalized_session"
      ) {
        console.warn("[recording] invalid active recording metadata cleared", {
          reason: invalidActiveRecording.reason,
          sessionId: invalidActiveRecording.sessionId
        });
        Alert.alert(
          "Recording recovery unavailable",
          "The active recording metadata was unusable and has been cleared. Existing saved walks were not changed."
        );
      }

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

      recoveryFailureAlertShownRef.current = false;

      recoveryPromptedSessionRef.current = activeRecording.sessionId;
      claimedSessionId = activeRecording.sessionId;
      console.info("[recording] startup detected unfinished session", {
        activityMode: activeRecording.activityMode,
        sessionId: activeRecording.sessionId
      });
      const [session, points, recoveryStatus] = await Promise.all([
        getWalkSessionById(activeRecording.sessionId),
        getGpsPointsForSession(activeRecording.sessionId),
        getBackgroundLocationRecoveryStatus()
      ]);

      if (
        !isMounted ||
        isStartingRecordingRef.current ||
        isStoppingRecordingRef.current
      ) {
        return;
      }

      if (!session) {
        console.warn("[recording] recovery failed: active session row is missing", {
          sessionId: activeRecording.sessionId
        });
        await clearActiveRecordingSettings(activeRecording.sessionId);
        recoveryPromptedSessionRef.current = null;
        Alert.alert(
          "Recording recovery unavailable",
          "The saved active recording referred to a missing session. Its invalid active marker was cleared without changing other saved walks."
        );
        return;
      }

      if (
        new Date(session.endedAt).getTime() >
        new Date(session.startedAt).getTime()
      ) {
        console.info("[recording] stale active marker referenced a finalized session", {
          sessionId: activeRecording.sessionId
        });
        await clearActiveRecordingSettings(activeRecording.sessionId);
        recoveryPromptedSessionRef.current = null;
        await refreshSavedData();
        return;
      }

      const fallbackRecording: RecoverableRecording = {
        points,
        recoveryStatus,
        session,
        totalPointCount: points.length
      };

      console.info("[recording] persisted GPS points restored", {
        backgroundTaskStatus: recoveryStatus,
        pointCount: points.length,
        sessionId: session.id
      });

      if (permissionState !== "granted") {
        setRecoverableRecording({
          ...fallbackRecording,
          recoveryStatus: "uncertain"
        });
        setBackgroundTrackingStatus("unavailable");
        setBackgroundTrackingMessage(
          "Location permission is required before this walk can resume."
        );
        didCommitRecovery = true;
        return;
      }

      const resumeTransition = {
        activityMode: session.activityMode,
        sessionId: session.id
      };
      recoveryResumeTransitionRef.current = resumeTransition;
      console.info("[recording] automatic recovery started", {
        backgroundTaskStatus: recoveryStatus,
        sessionId: session.id
      });

      try {
        // Establish one coherent checkpoint before the foreground watcher
        // switches from idle tracking to recording mode.
        await stopBackgroundLocationTracking();
        await flushPendingGpsPoints(session.id);
        await drainPendingBackgroundLocationBatches();

        const [currentSession, currentPoints] = await Promise.all([
          getWalkSessionById(session.id),
          getGpsPointsForSession(session.id)
        ]);

        if (!currentSession) {
          throw new Error("The active session disappeared during recovery.");
        }

        if (
          new Date(currentSession.endedAt).getTime() >
          new Date(currentSession.startedAt).getTime()
        ) {
          throw new Error("The active session finalized during recovery.");
        }

        const trustedDistanceMeters = calculateTrustedGpsDistanceMeters(
          currentPoints,
          currentSession.activityMode
        );
        await updateActiveWalkDistance(
          currentSession.id,
          trustedDistanceMeters
        );

        if (!isMounted) {
          return;
        }

        const resumedWalk = createRecoveredActiveWalk(
          { ...currentSession, distanceMeters: trustedDistanceMeters },
          currentPoints
        );
        const lifecycleGeneration = beginRecordingLifecycle(currentSession.id);
        const latestPoint = currentPoints.at(-1);

        if (latestPoint) {
          publishCurrentLocation(latestPoint);
        }

        activeWalkRef.current = resumedWalk;
        setActiveWalk(resumedWalk);
        setRecoverableRecording(null);
        setBackgroundTrackingStatus("starting");
        setBackgroundTrackingMessage("Walk resumed after interruption.");
        setRecordingResumeNotice(
          language === "fr"
            ? "Marche reprise après interruption"
            : "Walk resumed after interruption"
        );
        setPlayerFocusRequestId((requestId) => requestId + 1);
        didCommitRecovery = true;

        void startStepWatch(
          currentSession.startedAt,
          currentSession.id,
          lifecycleGeneration
        ).catch((error) =>
          console.warn("Failed to restore step counting", error)
        );
        void enableBackgroundTracking(
          currentSession.activityMode,
          currentSession.id,
          lifecycleGeneration
        );
        void refreshCurrentLocation({ allowLastKnown: false }).catch((error) =>
          console.warn("Failed to refresh recovered GPS fix", error)
        );
        console.info("[recording] automatic recovery completed", {
          distanceMeters: trustedDistanceMeters,
          pointCount: currentPoints.length,
          sessionId: currentSession.id,
          startedAt: currentSession.startedAt
        });
      } catch (error) {
        console.warn("[recording] automatic recovery failed", {
          error,
          sessionId: session.id
        });

        if (isMounted) {
          setRecoverableRecording({
            ...fallbackRecording,
            recoveryStatus: "uncertain"
          });
          setBackgroundTrackingStatus("foreground-only");
          setBackgroundTrackingMessage(
            "Automatic resume failed. The unfinished walk was kept for recovery."
          );
          didCommitRecovery = true;
        }

        void startBackgroundLocationTracking(
          session.activityMode,
          `recovery:${session.id}`
        ).catch((protectionError) =>
          console.warn(
            "Failed to restore background protection after automatic recovery",
            protectionError
          )
        );
      } finally {
        if (recoveryResumeTransitionRef.current === resumeTransition) {
          recoveryResumeTransitionRef.current = null;
        }
      }
    };

    detectRecoverableRecording()
      .catch((error) => {
        recoveryCheckFailed = true;
        console.warn("[recording] startup recovery check failed", error);

        if (isMounted && !recoveryFailureAlertShownRef.current) {
          recoveryFailureAlertShownRef.current = true;
          Alert.alert(
            "Recording check failed",
            "Mapbound could not safely verify whether a walk is active. Starting another walk remains disabled until the check succeeds.",
            [
              {
                onPress: () => {
                  recoveryFailureAlertShownRef.current = false;
                  setRecoveryCheckRevision((revision) => revision + 1);
                },
                text: "Retry"
              }
            ]
          );
        }
      })
      .finally(() => {
        if (
          claimedSessionId !== null &&
          !didCommitRecovery &&
          recoveryPromptedSessionRef.current === claimedSessionId
        ) {
          recoveryPromptedSessionRef.current = null;
        }

        if (isMounted) {
          setIsRecoveryCheckComplete(!recoveryCheckFailed);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeWalk?.sessionId,
    beginRecordingLifecycle,
    enableBackgroundTracking,
    language,
    permissionState,
    publishCurrentLocation,
    recoverableRecording?.session.id,
    refreshCurrentLocation,
    recoveryCheckRevision,
    refreshSavedData,
    startStepWatch
  ]);

  const handleStartWalk = useCallback(async () => {
    if (
      isChangingMapProviderRef.current ||
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
      console.info("[recording] recording started", {
        activityMode,
        sessionId,
        startedAt
      });
      setBackgroundTrackingStatus("starting");
      setPlayerFocusRequestId((requestId) => requestId + 1);

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
    activeMedalAlbumId,
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
        targetSessionId?: number;
      } = {}
    ): Promise<ReprocessSummary> => {
      const savedWalks = await getAllWalksWithPoints(mode);
      const targetSessionId = options.targetSessionId ?? null;
      const targetWalk = targetSessionId === null
        ? null
        : savedWalks.find((walk) => walk.id === targetSessionId) ?? null;

      if (targetSessionId !== null && !targetWalk) {
        throw new Error("The selected recording no longer exists.");
      }

      const reportingRecordingCount = targetWalk ? 1 : savedWalks.length;
      options.onProgress?.({
        completed: 0,
        phase: "preparing",
        total: reportingRecordingCount
      });
      let streetCoverageRepair: {
        segmentCount: number;
        status: "not_needed" | "refreshed";
      } = {
        segmentCount: 0,
        status: "not_needed"
      };

      if (options.rebuildRouteSnapshots) {
        options.onProgress?.({
          completed: 0,
          phase: "streets",
          total: 1
        });
        const repairResult = await repairStreetCoverageForRecordings(
          targetWalk ? [targetWalk] : savedWalks
        );

        if (repairResult.status === "failed") {
          throw new Error(
            `Street coverage repair failed: ${repairResult.error ?? "unknown error"}. ` +
              "Existing routes and progress were left unchanged. OpenStreetMap may be busy; wait a moment and retry, then check your connection if it continues."
          );
        }
        streetCoverageRepair = {
          segmentCount: repairResult.segmentCount,
          status: repairResult.status
        };
        options.onProgress?.({
          completed: 1,
          phase: "streets",
          total: 1
        });
      }
      const routingStreetSegments = options.rebuildRouteSnapshots
        ? await getAllStreetSegments()
        : streetSegments;
      const historicalExploredStreetIds = matchGpsPointsToStreetSegments(
        savedWalks.flatMap((walk) => walk.points),
        routingStreetSegments
      );
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
      let rebuiltRouteProgress = 0;
      for (const [walkIndex, walk] of savedWalks.entries()) {
        const shouldRebuildSnapshot = Boolean(options.rebuildRouteSnapshots) &&
          (targetSessionId === null || walk.id === targetSessionId);

        if (targetSessionId === null || shouldRebuildSnapshot) {
          options.onProgress?.({
            completed: targetSessionId === null ? walkIndex : rebuiltRouteProgress,
            phase: "routes",
            total: reportingRecordingCount
          });
        }

        let replaceSnapshot = false;
        let routeSegments: RenderedRouteSegment[];

        try {
          routeSegments = shouldRebuildSnapshot
            ? await rebuildRouteSnapshot(
                walk.id,
                walk.activityMode,
                walk.points,
                routingStreetSegments,
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
          replaceSnapshot = shouldRebuildSnapshot;
        } catch (error) {
          if (targetSessionId !== null && walk.id === targetSessionId) {
            const detail = error instanceof Error ? ` ${error.message}` : "";
            throw new Error(
              `Unable to rebuild the selected recording. Its existing route and progress were left unchanged.${detail}`
            );
          }

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
        if (targetSessionId === null || shouldRebuildSnapshot) {
          rebuiltRouteProgress += 1;
          options.onProgress?.({
            completed: targetSessionId === null ? walkIndex + 1 : rebuiltRouteProgress,
            phase: "routes",
            total: reportingRecordingCount
          });
        }
      }

      options.onProgress?.({
        completed: reportingRecordingCount,
        phase: "contours",
        total: reportingRecordingCount
      });
      const loopFills = analyzeLoopFillsForCells({
        activityMode: mode,
        boundaryCellIds: [...boundaryCellIds],
        exploredStreetIds: historicalExploredStreetIds,
        streetSegments: routingStreetSegments
      });
      const acceptedLoopFills = loopFills.filter((loopFill) => loopFill.accepted);
      const rejectedLoopFills = loopFills.filter((loopFill) => !loopFill.accepted);
      const filledCellKeys = new Set(acceptedLoopFills.flatMap((loopFill) => loopFill.cellIds));
      const rebuiltCellKeys = new Set([...boundaryCellIds, ...filledCellKeys]);
      const preservedPreviousProgress = rebuiltCellKeys.size < previousCellCount;

      if (!preservedPreviousProgress) {
        options.onProgress?.({
          completed: reportingRecordingCount,
          phase: "saving",
          total: reportingRecordingCount
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

      const rebuiltTarget = targetSessionId === null
        ? null
        : rebuiltWalkCells.find((rebuilt) => rebuilt.walk.id === targetSessionId) ?? null;
      const targetBridgeCount = rebuiltTarget?.routeSegments.filter(
        (segment) => segment.type === "inferred"
      ).length ?? 0;
      const targetHiddenGapCount = targetWalk
        ? buildPathSegments(targetWalk.points, targetWalk.activityMode).filter(
            (segment) => segment.type === "rejected"
          ).length
        : 0;

      const diagnostics = {
        boundaryCellCount: boundaryCellIds.size,
        failedRecordingCount,
        inferredCellCount: inferredCellIds.size,
        targetBridgeCount,
        targetHiddenGapCount,
        targetInferredCellCount: rebuiltTarget?.inferred.length ?? 0,
        targetSessionId,
        streetCoverageSegmentCount: streetCoverageRepair.segmentCount,
        streetCoverageStatus: streetCoverageRepair.status,
        preservedPreviousProgress,
        previousCellCount,
        rebuiltCellCount: rebuiltCellKeys.size,
        recordingCount: reportingRecordingCount
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
    const objectiveBefore = objectiveStats;
    const summaryQuality = recordingQuality;

    setStopConfirmationVisible(false);
    setIsComputingRecording(true);
    setActiveWalk(null);
    activeWalkRef.current = null;
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

      console.info("[recording] recording finalized", {
        endedAt,
        sessionId: walkToStop.sessionId
      });

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

      const durationSeconds = Math.max(
        0,
        Math.round(
          (new Date(endedAt).getTime() -
            new Date(walkToStop.startedAt).getTime()) /
            1000
        )
      );
      const immediateCellIds = [...new Set(walkToStop.exploredCellIds)];
      const immediateNewCellIds = immediateCellIds.filter(
        (cellId) => !savedCellIdsBeforeStop.has(cellId)
      );
      const immediateNewCellCount = immediateNewCellIds.length;
      const immediateSession: WalkSession = {
        activityMode: walkToStop.activityMode,
        displayName: null,
        distanceMeters: walkToStop.distanceMeters,
        durationSeconds,
        endedAt,
        id: savedSessionId,
        pointCount: walkToStop.acceptedGpsPointCount,
        startedAt: walkToStop.startedAt,
        stepCount: walkToStop.stepCount
      };

      // The live route is already confirmed. Keep it visible immediately while
      // route inference and the durable repair outbox finish in the background.
      setSavedExplorationCellIds((currentCellIds) => [
        ...new Set([...currentCellIds, ...immediateCellIds])
      ]);
      if (isToday(endedAt)) {
        setSavedTodayNewCellIds((currentCellIds) => [
          ...new Set([...currentCellIds, ...immediateNewCellIds])
        ]);
      }
      setHistory((currentHistory) => [
        immediateSession,
        ...currentHistory.filter((session) => session.id !== savedSessionId)
      ]);
      setStats((currentStats) => ({
        ...currentStats,
        approximateExploredAreaSquareMeters:
          (savedCellIdsBeforeStop.size + immediateNewCellCount) * 15 * 15,
        exploredCellCount: savedCellIdsBeforeStop.size + immediateNewCellCount,
        latestRecordingDistanceMeters: walkToStop.distanceMeters,
        latestRecordingStartedAt: walkToStop.startedAt,
        longestRecordingDistanceMeters: Math.max(
          currentStats.longestRecordingDistanceMeters,
          walkToStop.distanceMeters
        ),
        newCellsThisRecording: immediateNewCellCount,
        todayDistanceMeters:
          currentStats.todayDistanceMeters +
          (isToday(endedAt) ? walkToStop.distanceMeters : 0),
        todayRecordingCount:
          currentStats.todayRecordingCount + (isToday(endedAt) ? 1 : 0),
        todayStepCount:
          currentStats.todayStepCount +
          (isToday(endedAt) ? walkToStop.stepCount : 0),
        totalDistanceMeters:
          currentStats.totalDistanceMeters + walkToStop.distanceMeters,
        totalDurationSeconds:
          currentStats.totalDurationSeconds + durationSeconds,
        walkCount: currentStats.walkCount + 1
      }));
      setRecordingSummary({
        backgroundStatus: finalBackgroundStatus,
        distanceMeters: walkToStop.distanceMeters,
        durationSeconds,
        finalStepCount: walkToStop.stepCount,
        gpsPausedEventCount: walkToStop.gpsPausedEventCount,
        loopResult: { status: "not_checked" },
        newCellCount: immediateNewCellCount,
        objectiveAfter: null,
        objectiveBefore,
        quality: summaryQuality,
        sessionId: savedSessionId
      });

      // Everything below is derived data. The finalized session and its repair
      // marker are already durable, so this must not keep Stop or Start blocked.
      void (async () => {
        let finalStepCount = walkToStop.stepCount;
        let recordingCellIds = immediateCellIds;

        const stepCountPromise = walkToStop.activityMode === "walk"
          ? getStepCountBetween(walkToStop.startedAt, endedAt)
              .then(async (stepCount) => {
                await updateWalkSessionStepCount(savedSessionId, stepCount);
                return stepCount;
              })
              .catch((error) => {
                console.warn("Failed to reconcile finalized step count", error);
                return walkToStop.stepCount;
              })
          : Promise.resolve(walkToStop.stepCount);

        try {
          const finalizedPoints = await getGpsPointsForSession(savedSessionId);
          recordingCellIds = await persistRecordingExplorationDelta(
            savedSessionId,
            walkToStop.activityMode,
            finalizedPoints
          );
        } catch (error) {
          console.warn("Recording saved; deferred exploration repair remains pending", error);
        }

        try {
          await rebuildStreetCompletionV2({ shouldAbort: () => Boolean(activeWalkRef.current) });
        } catch (error) {
          console.warn("Recording saved but deferred street completion failed", error);
        }

        try {
          await evaluateMedalCollectionForRecording(
            savedSessionId,
            activeMedalAlbumId
          );
        } catch (error) {
          console.warn("Recording saved but deferred medal evaluation failed", error);
        }

        finalStepCount = await stepCountPromise;
        const finalizedSession = await getWalkSessionById(savedSessionId).catch(
          (error) => {
            console.warn("Failed to reload the finalized recording", error);
            return null;
          }
        );
        let objectiveAfter: ZoneCompletionStats | null = null;

        if (objective) {
          const objectiveAbortController = new AbortController();
          objectiveFinalizationAbortRef.current?.abort();
          objectiveFinalizationAbortRef.current = objectiveAbortController;

          try {
            objectiveAfter = await calculateObjectiveStats(
              objective,
              objectiveAbortController.signal
            );
            const currentObjective = objectiveRef.current;
            const achievementCompletedAtMs = objectiveAfter.completedAt
              ? Date.parse(objectiveAfter.completedAt)
              : Number.NaN;
            const walkStartedAtMs = Date.parse(walkToStop.startedAt);
            const achievementWasEarnedDuringWalk =
              objectiveAfter.permanentlyCompleted &&
              Number.isFinite(achievementCompletedAtMs) &&
              Number.isFinite(walkStartedAtMs) &&
              achievementCompletedAtMs >= walkStartedAtMs &&
              achievementCompletedAtMs <= Date.now();

            if (
              !objectiveBefore?.permanentlyCompleted &&
              achievementWasEarnedDuringWalk &&
              isLaunchDismissedRef.current
            ) {
              setAtlasStampMessage({
                detail: objective.zone.name,
                id: Date.now(),
                title: objective.zone.type === "city"
                  ? language === "fr" ? "VILLE COMPL\u00c8TE" : "CITY COMPLETE"
                  : language === "fr" ? "QUARTIER COMPL\u00c9T\u00c9" : "DISTRICT COMPLETE"
              });
            }

            if (
              currentObjective?.mode === objective.mode &&
              currentObjective.zone.id === objective.zone.id &&
              getZoneGeometryFingerprint(currentObjective.zone) ===
                getZoneGeometryFingerprint(objective.zone)
            ) {
              objectiveStatsRequestRef.current += 1;
              setObjectiveStats(objectiveAfter);
              setIsObjectiveStatsCalculating(false);
            }
          } catch (error) {
            if (!objectiveAbortController.signal.aborted) {
              console.warn("Recording saved but deferred objective refresh failed", error);
            }
          } finally {
            if (objectiveFinalizationAbortRef.current === objectiveAbortController) {
              objectiveFinalizationAbortRef.current = null;
            }
          }
        }

        try {
          await refreshSavedData({
            hideExplorationDuringRefresh: false,
            repairPendingCaches: false
          });
        } catch (error) {
          console.warn("Recording saved but deferred map refresh failed", error);
        }

        const reconciledNewCellCount = recordingCellIds.filter(
          (cellId) => !savedCellIdsBeforeStop.has(cellId)
        ).length;
        setRecordingSummary((currentSummary) =>
          currentSummary?.sessionId === savedSessionId
            ? {
                ...currentSummary,
                distanceMeters:
                  finalizedSession?.distanceMeters ?? currentSummary.distanceMeters,
                finalStepCount,
                newCellCount: reconciledNewCellCount,
                objectiveAfter
              }
            : currentSummary
        );
      })().catch((error) =>
        console.warn("Deferred recording reconciliation failed", error)
      );
    } catch (error) {
      console.warn("Recording was saved but immediate UI finalization failed", error);
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
    language,
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

                const streetCompletion = await rebuildStreetCompletionV2({ shouldAbort: () => Boolean(activeWalkRef.current) });

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
                      : "not needed"
                  }\nStreet completion: ${formatDistance(streetCompletion.exploredDistanceMeters)} / ${formatDistance(streetCompletion.totalDistanceMeters)} (${streetCompletion.completionPercent}%), ${streetCompletion.completedStreetCount} streets complete\nRecordings preserved after an individual failure: ${
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
                console.warn("Reprocess recordings failed", error);
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

  const handleReprocessWalk = useCallback((sessionId: number) => {
    const walk = history.find((candidate) => candidate.id === sessionId);

    if (!walk) {
      Alert.alert(
        language === "fr" ? "Enregistrement introuvable" : "Recording unavailable",
        language === "fr"
          ? "Cette marche n'existe plus. Actualisez l'historique et r\u00e9essayez."
          : "This walk no longer exists. Refresh History and try again."
      );
      return;
    }

    if (activeWalk) {
      Alert.alert(strings.map.recordingActive, strings.map.recordingActiveReprocess);
      return;
    }

    if (reprocessProgress) {
      return;
    }

    Alert.alert(
      language === "fr" ? "Recalculer cette marche ?" : "Reprocess this walk?",
      language === "fr"
        ? "Seule cette trace sera recalcul\u00e9e avec un r\u00e9seau OSM actualis\u00e9. Les totaux partag\u00e9s seront ensuite r\u00e9concili\u00e9s depuis les autres traces fig\u00e9es."
        : "Only this route will be rebuilt with refreshed OSM coverage. Shared totals will then be reconciled from the other frozen routes.",
      [
        { text: strings.common.cancel, style: "cancel" },
        {
          text: strings.history.reprocessWalk,
          onPress: async () => {
            setReprocessingSessionId(sessionId);
            setReprocessProgress({ completed: 0, phase: "preparing", total: 1 });

            try {
              const summary = await reprocessModeExploration(walk.activityMode, {
                onProgress: setReprocessProgress,
                rebuildRouteSnapshots: true,
                targetSessionId: sessionId
              });
              const streetCompletion = await rebuildStreetCompletionV2({
                shouldAbort: () => Boolean(activeWalkRef.current)
              });

              setReprocessProgress({ completed: 1, phase: "refreshing", total: 1 });
              await refreshSavedData({
                hideExplorationDuringRefresh: false,
                repairPendingCaches: false
              });
              await loadDetailedWalk(sessionId);
              setReprocessProgress(null);
              setReprocessingSessionId(null);

              Alert.alert(
                language === "fr" ? "Marche recalcul\u00e9e" : "Walk reprocessed",
                language === "fr"
                  ? `${summary.targetHiddenGapCount} coupure(s) d\u00e9tect\u00e9e(s).\n${summary.targetBridgeCount} pont(s) accept\u00e9(s).\n${summary.targetInferredCellCount} cellule(s) d\u00e9duite(s) r\u00e9cup\u00e9r\u00e9e(s).\nProgression des rues : ${streetCompletion.completionPercent}%.`
                  : `${summary.targetHiddenGapCount} gap(s) detected.\n${summary.targetBridgeCount} bridge(s) accepted.\n${summary.targetInferredCellCount} inferred cell(s) recovered.\nStreet completion: ${streetCompletion.completionPercent}%.`
              );
            } catch (error) {
              console.warn(`Reprocess recording ${sessionId} failed`, error);
              setReprocessProgress(null);
              setReprocessingSessionId(null);
              Alert.alert(
                language === "fr" ? "Recalcul impossible" : "Reprocess failed",
                error instanceof Error
                  ? error.message
                  : language === "fr"
                    ? "Une erreur inattendue a interrompu le recalcul. La progression existante a \u00e9t\u00e9 conserv\u00e9e."
                    : "An unexpected error stopped the rebuild. Existing progress was preserved."
              );
            }
          }
        }
      ]
    );
  }, [
    activeWalk,
    history,
    language,
    loadDetailedWalk,
    refreshSavedData,
    reprocessModeExploration,
    reprocessProgress,
    strings
  ]);

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

        setRecoverableRecording({
          ...recording,
          recoveryStatus: "active"
        });
        setBackgroundTrackingStatus("enabled");
        setBackgroundTrackingMessage(
          "Unfinished recording protection was restored."
        );
      } catch (error) {
        console.warn("Failed to restore recovery background protection", error);
        setRecoverableRecording({
          ...recording,
          recoveryStatus: "uncertain"
        });
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
      isChangingMapProviderRef.current ||
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

    try {
      let permission = permissionState;

      if (permission !== "granted") {
        permission = await requestForegroundLocationPermission();
        setPermissionState(permission);
      }

      if (permission !== "granted") {
        Alert.alert(
          strings.map.locationOff,
          "Location permission is required before the unfinished walk can resume."
        );
        return;
      }

      setRecoverableRecording(null);
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
      const trustedDistanceMeters = calculateTrustedGpsDistanceMeters(
        points,
        session.activityMode
      );
      await updateActiveWalkDistance(session.id, trustedDistanceMeters);
      const resumedWalk = createRecoveredActiveWalk(
        { ...session, distanceMeters: trustedDistanceMeters },
        points
      );
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
      setBackgroundTrackingMessage("Walk resumed after interruption.");
      setRecordingResumeNotice(
        language === "fr"
          ? "Marche reprise après interruption"
          : "Walk resumed after interruption"
      );
      setBackgroundTrackingStatus("starting");
      setPlayerFocusRequestId((requestId) => requestId + 1);

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
    language,
    permissionState,
    recoverableRecording,
    refreshCurrentLocation,
    refreshSavedData,
    restoreRecoverableRecordingProtection,
    startStepWatch,
    strings
  ]);

  const handleFinishRecoveredRecording = useCallback(async (displayName: string) => {
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
          recoveredWalk.stepCount,
          displayName
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

        void rebuildStreetCompletionV2({ shouldAbort: () => Boolean(activeWalkRef.current) }).catch((error) =>
          console.warn("Recovered recording saved but deferred street completion failed", error)
        );

        try {
          await evaluateMedalCollectionForRecording(
            savedSessionId,
            activeMedalAlbumId
          );
        } catch (error) {
          console.warn("Recovered recording saved but medal evaluation failed", error);
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
    activeMedalAlbumId,
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
              void rebuildStreetCompletionV2({ shouldAbort: () => Boolean(activeWalkRef.current) }).catch((error) =>
                console.warn("Failed to rebuild street completion after deletion", error)
              );
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

  const beginDataOperation = useCallback(async (
    operation: Exclude<DataOperation, null>
  ) => {
    if (dataOperationRef.current !== null) {
      return false;
    }

    dataOperationRef.current = operation;
    setDataOperation(operation);
    await waitForMapRenderCommit();
    return true;
  }, []);

  const finishDataOperation = useCallback((
    operation: Exclude<DataOperation, null>
  ) => {
    if (dataOperationRef.current !== operation) {
      return;
    }

    dataOperationRef.current = null;
    setDataOperation(null);
  }, []);

  const handleExportBackup = useCallback(async () => {
    if (!await beginDataOperation("backup")) {
      return;
    }

    try {
      const result = await exportBackupV5();
      Alert.alert(
        strings.map.backupVerifiedTitle,
        interpolate(strings.map.backupVerifiedMessage, {
          blocks: result.archiveBlockCount,
          points: result.pointCount,
          sessions: result.sessionCount,
          size: formatBackupFileSize(result.fileSize)
        })
      );
    } catch (error) {
      console.warn("Failed to export backup", error);

      if (error instanceof BackupExportError) {
        const stageMessage = {
          prepare: strings.map.backupFailedPrepareMessage,
          share: strings.map.backupFailedShareMessage,
          verify: strings.map.backupFailedVerifyMessage,
          write: strings.map.backupFailedWriteMessage
        }[error.stage];

        Alert.alert(
          strings.map.backupFailedTitle,
          `${stageMessage}\n\n${strings.map.backupFailureDetail}: ${error.detail}`
        );
        return;
      }

      Alert.alert(strings.map.backupFailedTitle, strings.map.backupFailedMessage);
    } finally {
      finishDataOperation("backup");
    }
  }, [beginDataOperation, finishDataOperation, strings]);

  const handleExportAllGpx = useCallback(async () => {
    if (!await beginDataOperation("bulkGpx")) {
      return;
    }

    try {
      const result = await exportAllWalksGpx();
      Alert.alert(
        strings.map.bulkGpxExportedTitle,
        interpolate(strings.map.bulkGpxExportedMessage, {
          points: result.pointCount,
          sessions: result.walkCount,
          size: formatBackupFileSize(result.fileSize)
        })
      );
    } catch (error) {
      console.warn("Failed to export all GPX files", error);
      Alert.alert(
        strings.map.bulkGpxExportFailedTitle,
        strings.map.bulkGpxExportFailedMessage
      );
    } finally {
      finishDataOperation("bulkGpx");
    }
  }, [beginDataOperation, finishDataOperation, strings]);

  const handleImportBackup = useCallback(async () => {
    if (dataOperationRef.current !== null) {
      return;
    }

    if (activeWalk) {
      Alert.alert(strings.map.recordingActive, strings.map.recordingActiveBackup);
      return;
    }

    if (!await beginDataOperation("restorePreview")) {
      return;
    }

    let candidate;

    try {
      candidate = await selectBackupV5ForRestore();
    } catch (error) {
      console.warn("Failed to inspect backup", error);
      Alert.alert(strings.map.restoreFailedTitle, strings.map.restoreInspectFailedMessage);
      return;
    } finally {
      finishDataOperation("restorePreview");
    }

    if (!candidate) {
      return;
    }

    Alert.alert(
      strings.map.restorePreviewTitle,
      interpolate(strings.map.restorePreviewMessage, {
        achievements: candidate.preview.zoneAchievementCount,
        date: formatBackupExportDate(candidate.preview.exportedAt, language),
        medals: candidate.preview.medalCount,
        points: candidate.preview.pointCount,
        sessions: candidate.preview.sessionCount,
        size: formatBackupFileSize(candidate.preview.fileSize),
        version: candidate.preview.appVersion
      }),
      [
        {
          text: strings.common.cancel,
          style: "cancel"
        },
        {
          text: strings.common.restore,
          style: "destructive",
          onPress: async () => {
            if (!await beginDataOperation("restore")) {
              return;
            }

            try {
              await Promise.allSettled([...savedDataRefreshOperationsRef.current]);
              savedDataRefreshGenerationRef.current += 1;
              savedDataRefreshOperationRef.current = null;
              await restoreBackupV5(candidate);
              await clearActiveRecordingSettings();
              setSelectedSessionId(null);
              await refreshSavedData();
              void rebuildStreetCompletionV2({
                refreshStreetCoverage: true,
                shouldAbort: () => Boolean(activeWalkRef.current)
              }).catch((error) =>
                console.warn("Failed to rebuild street completion after restore", error)
              );
            } catch (error) {
              console.warn("Failed to import backup", error);
              Alert.alert(strings.map.restoreFailedTitle, strings.map.restoreFailedMessage);
            } finally {
              finishDataOperation("restore");
            }
          }
        }
      ]
    );
  }, [
    activeWalk,
    beginDataOperation,
    finishDataOperation,
    language,
    refreshSavedData,
    strings
  ]);
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
        const latestPlayerLocation =
          latestPlayerLocationForPersistenceRef.current;

        if (isTrustworthyPlayerPersistencePoint(latestPlayerLocation)) {
          lastPlayerLocationPersistedAtRef.current = Date.now();
          savePlayerLocation(latestPlayerLocation).catch((error) =>
            console.warn("Failed to persist the backgrounded player position", error)
          );
        }

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
    <AtlasNavigationProvider
      value={{
        activePage: activeAtlasPage ?? "map",
        language,
        onNavigate: navigateAtlasPage
      }}
    >
    <View style={styles.screen}>
      {canMountInitialMap ? <ExplorationMap
        mapProvider={mapProvider}
        activeExplorationCellIds={activeWalk?.exploredCellIds ?? EMPTY_CELL_IDS}
        activeRouteChunks={activeWalk?.routeChunks ?? EMPTY_LIVE_ROUTE_CHUNKS}
        appearanceMode={appearanceMode}
        walks={walks}
        explorationEnabled={isExplorationEnabled}
        pathWalks={displayedWalks}
        activePoints={activeWalk?.points ?? EMPTY_GPS_POINTS}
        activeMode={activeWalk?.activityMode ?? activityMode}
        gpsAccuracyMeters={currentLocation?.accuracy ?? null}
        gpsStatus={activeWalk?.lastRejectedPointReason ?? null}
        isRecording={Boolean(activeWalk)}
        language={language}
        focusedMedal={focusedMedal}
        forbiddenZoneLabel={
          isForbiddenZoneModeActive ? null : visibleForbiddenZoneLabelData
        }
        forbiddenZones={forbiddenZones}
        medalFocusRequestId={medalFocusRequestId}
        lockedMedalLabel={language === "fr" ? "Verrouillée" : "Locked"}
        medals={visibleMapMedals}
        onMedalPress={handleMapMedalPress}
        currentLocation={currentLocation}
        cityZone={visibleMapBoundaryContext.city}
        knownCityZones={knownCityZones}
        districtZones={visibleMapBoundaryContext.districts}
        highlightedSessionId={selectedSessionId}
        routeFocusRequestId={routeFocusRequestId}
        layers={layers}
        onForbiddenZoneLabelPress={handleForbiddenZoneLabelPress}
        onMapPress={handleMapPressEvent}
        onMapLongPress={handleMapLongPressEvent}
        onMapReady={handleMapReady}
        onMapInteraction={handleMapInteraction}
        onVisibleRegionChange={handleVisibleRegionChange}
        playerFocusRequestId={playerFocusRequestId}
        playerVisible={isLaunchDismissed}
        recordingDistanceMeters={activeWalk?.distanceMeters ?? 0}
        recordingExploredCellCount={activeNewCellIds.length}
        recordingSpeedMetersPerSecond={activeWalk?.currentSpeedMetersPerSecond ?? 0}
        selectedZone={selectedZone}
        savedExplorationCellIds={savedExplorationCellIds}
        todayNewCellIds={todayNewCellIds}
        zoneFocusRequestId={zoneFocusRequestId}
      /> : null}

      {isLaunchDismissed && isAppActive && !activeAtlasPage && !atlasStampMessage && !celebrationMedal && locationMessage ? (
        <MapLocationLabel
          key={locationMessage.id}
          mapContentInsets={mapStampInsets}
          message={locationMessage}
          onDismiss={clearLocationMessage}
        />
      ) : null}
      <AtlasStamp
        mapContentInsets={mapStampInsets}
        message={isLaunchDismissed ? atlasStampMessage : null}
        onDismiss={clearAtlasStamp}
      />
      <ForbiddenZoneCommentModal
        areaLabel={
          forbiddenZoneCommentEditorZone
            ? `${language === "fr" ? "Surface" : "Area"}: ${formatForbiddenZoneArea(forbiddenZoneCommentEditorZone.areaM2)}`
            : ""
        }
        initialComment={forbiddenZoneCommentEditorZone?.comment ?? null}
        isCreation={forbiddenZoneCommentEditor?.isCreation ?? false}
        language={language}
        onCancel={() => setForbiddenZoneCommentEditor(null)}
        onSave={handleSaveForbiddenZoneComment}
        visible={Boolean(forbiddenZoneCommentEditorZone)}
      />
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View onLayout={handleMapTopPanelLayout} style={styles.topPanel}>
          <Animated.View
            style={[
              styles.logoFrame,
              {
                height: Animated.multiply(
                  wordmarkCollapseProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [98, 38]
                  }),
                  recordingLayoutProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0]
                  })
                )
              }
            ]}
          >
            <Animated.Image
              resizeMode="contain"
              source={require("../../assets/title.png")}
              style={[
                styles.logo,
                {
                  opacity: Animated.multiply(
                    wordmarkCollapseProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
                    recordingLayoutProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
                  ),
                  transform: [{ scale: wordmarkCollapseProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.385] }) }]
                }
              ]}
            />
          </Animated.View>
          {isCountrysideSelected ? (
            <CountrysideStatus language={language} />
          ) : (
            <CityMedalProgress
              hasObjective={Boolean(objective)}
              language={language}
              loadState={medalPackLoadState}
              objectiveVisible={Boolean(objective && objectiveHudVisible)}
              onObjectivePress={() => {
                if (!objective) {
                  navigateAtlasPage("completion");
                  return;
                }

                setObjectiveHudVisible((visible) => !visible);
              }}
              onPress={() => {
                if (medalPackLoadState === "unavailable") {
                  if (activeMedalAlbumId) {
                    resetMedalCountryPackFailure(activeMedalAlbumId);
                  }
                  refreshSavedData({ hideExplorationDuringRefresh: false }).catch((error) =>
                    console.warn("Failed to retry medal country pack", error)
                  );
                  return;
                }

                navigateAtlasPage("medals");
              }}
              progress={activeMedalProgress}
            />
          )}
          {!isCountrysideSelected && objective && objectiveHudVisible ? (
            <ObjectiveHud
              isCalculating={isObjectiveStatsCalculating}
              objective={objective}
              language={language}
              stats={objectiveStats}
              todayCellCount={todayObjectiveCellCount}
            />
          ) : null}
          {isForbiddenZoneProcessing || isMapZoneSelectionLoading ? (
            <View style={styles.mapZoneSelectionLoading}>
              <ActivityIndicator color={APP_COLORS.gold} size="small" />
              <Text style={styles.mapZoneSelectionLoadingText}>
                {isForbiddenZoneProcessing
                  ? language === "fr" ? "Analyse de la Zone interdite…" : "Checking Forbidden Zone…"
                  : language === "fr" ? "Recherche de la zone…" : "Finding area…"}
              </Text>
            </View>
          ) : null}
          {mapZoneSelection?.city && mapZoneSelection.district ? (
            <MapZoneScopePicker
              city={mapZoneSelection.city}
              district={mapZoneSelection.district}
              language={language}
              onClose={() => setMapZoneSelection(null)}
              onSelect={applyMapObjective}
              selectedZoneId={objective?.zone.id ?? null}
            />
          ) : null}
        </View>

        {permissionState === "denied" ? (
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionTitle}>{strings.map.locationOff}</Text>
            <Text style={styles.permissionText}>
              {strings.map.locationOffText}
            </Text>
          </View>
        ) : null}

        {recordingResumeNotice ? (
          <View accessibilityLiveRegion="polite" style={styles.recordingResumeNotice}>
            <Ionicons color="#86efac" name="refresh-circle" size={18} />
            <Text style={styles.recordingResumeNoticeText}>
              {recordingResumeNotice}
            </Text>
          </View>
        ) : null}

        <Animated.View
          onLayout={handleMapBottomPanelLayout}
          style={[
            styles.bottomPanel,
            {
              paddingBottom: recordingLayoutProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [ATLAS_NAVIGATION_DOCK_HEIGHT + 6, ATLAS_NAVIGATION_DOCK_HEIGHT]
              })
            }
          ]}
        >
          <WalkControls
            activityMode={activeWalk?.activityMode ?? activityMode}
            acceptedGpsPointCount={activeWalk?.acceptedGpsPointCount ?? 0}
            backgroundStatus={backgroundTrackingStatus}
            isFinalizing={isComputingRecording}
            isRecording={Boolean(activeWalk)}
            isStarting={isStartingRecording || !isRecoveryCheckComplete}
            explorerScore={explorerScore.points}
            forbiddenZoneModeActive={isForbiddenZoneModeActive}
            forbiddenZoneModeDisabled={Boolean(activeWalk)}
            distanceMeters={activeWalk?.distanceMeters ?? 0}
            startedAt={activeWalk?.startedAt ?? null}
            gpsAccuracyMeters={currentLocation?.accuracy}
            gpsStatus={activeWalk?.lastRejectedPointReason}
            locationPermission={permissionState}
            locationResolved={initialLocationResolved}
            latestFixTimestamp={currentLocation?.timestamp ?? null}
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
            onToggleForbiddenZoneMode={handleToggleForbiddenZoneMode}
          />
        </Animated.View>
      </SafeAreaView>

      <AtlasNavigationDockLayer
        activePage="map"
        language={language}
        medalPulse={medalTabPulse}
        medalTabRef={medalTabRef}
        onNavigate={navigateAtlasPage}
        placement="map"
      />

      {optionsVisible ? <OptionsModal
        mapProvider={mapProvider}
        googleMapsAvailable={googleMapsAvailable}
        mapProviderDisabled={isSavingMapProvider || !canChangeMapProvider({
          platform: Platform.OS, recording: isRecording, starting: isStartingRecording,
          stopping: isComputingRecording, recovering: !isRecoveryCheckComplete || Boolean(recoverableRecording)
        })}
        onChangeMapProvider={(provider) => {
          if (isChangingMapProviderRef.current || isSavingMapProvider || !canChangeMapProvider({
            platform: Platform.OS, recording: Boolean(activeWalkRef.current),
            starting: isStartingRecordingRef.current, stopping: isStoppingRecordingRef.current,
            recovering: !isRecoveryCheckComplete || Boolean(recoverableRecording)
          })) return;
          isChangingMapProviderRef.current = true;
          void onChangeMapProvider(provider).finally(() => {
            isChangingMapProviderRef.current = false;
          });
        }}
        appearanceMode={appearanceMode}
        hapticsEnabled={hapticsEnabled}
        language={language}
        layers={layers}
        mode={pathDisplayMode}
        onChangeAppearanceMode={onChangeAppearanceMode}
        onChangeHapticsEnabled={onChangeHapticsEnabled}
        onChangeLanguage={onChangeLanguage}
        onChangeSoundEnabled={onChangeSoundEnabled}
        onChangePathDisplayMode={setPathDisplayMode}
        onClose={handleReturnToMapFromAtlas}
        onToggleLayer={toggleLayer}
        onReprocessRecordings={handleReprocessRecordings}
        selectedSessionId={selectedSessionId}
        soundEnabled={soundEnabled}
        visible={optionsVisible}
      /> : null}
      {dashboardExpanded ? <DetailsModal
        activeWalk={activeWalk}
        activityMode={activityMode}
        backgroundMessage={backgroundTrackingMessage}
        backgroundStatus={backgroundTrackingStatus}
        currentLocation={currentLocation}
        language={language}
        layers={layers}
        mode={pathDisplayMode}
        onChangeMode={setPathDisplayMode}
        onClose={handleReturnToMapFromAtlas}
        onOpenHistory={() => navigateAtlasPage("history")}
        onReprocessRecordings={handleReprocessRecordings}
        objectiveStats={objectiveStats}
        explorerScore={explorerScore}
        recordingQuality={recordingQuality}
        selectedSessionId={selectedSessionId}
        stats={displayStats}
        visible={dashboardExpanded}
        history={history}
      /> : null}
      {historyVisible ? <WalkHistoryModal
        activityMode={activityMode}
        detailedWalks={walks}
        language={language}
        loopFillSummaries={loopFillSummaries}
        visible={historyVisible}
        dataOperation={dataOperation}
        reprocessDisabled={Boolean(activeWalk) || reprocessProgress !== null || dataOperation !== null}
        reprocessingSessionId={reprocessingSessionId}
        walks={history}
        selectedSessionId={selectedSessionId}
        onClose={handleReturnToMapFromAtlas}
        onDeleteWalk={handleDeleteWalk}
        onExportAllGpx={handleExportAllGpx}
        onExportBackup={handleExportBackup}
        onExportWalkGpx={handleExportWalkGpx}
        onImportBackup={handleImportBackup}
        onLoadWalkDetails={(sessionId) => {
          loadDetailedWalk(sessionId).catch((error) =>
            console.warn("Failed to load recording details", error)
          );
        }}
        onRenameWalk={handleRenameWalk}
        onReprocessWalk={handleReprocessWalk}
        onSelectWalk={focusSavedWalkOnMap}
        onOpenDiagnostics={() => {
          setHistoryVisible(false);
          setDiagnosticsVisible(true);
        }}
      /> : null}
      <RecordingRecoveryModal
        language={language}
        onDiscard={handleDiscardRecoveredRecording}
        onFinish={handleFinishRecoveredRecording}
        onResume={handleResumeRecoveredRecording}
        recording={recoverableRecording}
      />
      {completionVisible ? <CompletionModal
        currentObjective={objective}
        currentObjectiveStats={objectiveStats}
        currentObjectiveTodayCells={todayObjectiveCellCount}
        currentLocation={completionReferenceLocation}
        isRecording={isRecording}
        language={language}
        onClose={handleReturnToMapFromAtlas}
        onFocusZone={(zone) => {
          void loadDistrictZonesForObjectiveZone(zone).catch((error) =>
            console.warn("Failed to load focused zone city context", error)
          );
          setSelectedZone(zone);
          setZoneFocusRequestId((requestId) => requestId + 1);
          returnToMapFromAtlas(() => setCompletionVisible(false));
        }}
        onSetObjective={(nextObjective) => {
          applyMapObjective(nextObjective.zone);
          returnToMapFromAtlas(() => setCompletionVisible(false));
        }}
        onZonesUpdated={handleCompletionZonesUpdated}
        visible={completionVisible}
      /> : null}

      {medalsVisible ? <MedalCollectionModal
        collectedCities={collectedMedalCities}
        districtZones={visibleMapBoundaryContext.districts}
        language={language}
        onClose={handleReturnToMapFromAtlas}
        onFocusMedal={(medal) => {
          setFocusedMedal(medal);
          setMedalFocusRequestId((requestId) => requestId + 1);
          returnToMapFromAtlas(() => setMedalsVisible(false));
        }}
        onRunRetroScan={handleRunMedalRetroScan}
        progress={activeMedalProgress}
        retroScanComplete={medalRetroScanComplete}
        scanning={isScanningMedals}
        visible={medalsVisible}
      /> : null}
      <MedalCelebration
        flightTarget={medalFlightTarget}
        language={language}
        medal={celebrationMedal}
        onComplete={handleCompleteMedalCelebration}
      />
      {diagnosticsVisible ? <RecordingDiagnosticsModal
        activeWalk={activeWalk}
        backgroundMessage={backgroundTrackingMessage}
        backgroundStatus={backgroundTrackingStatus}
        currentLocation={currentLocation}
        onClose={() => {
          setDiagnosticsVisible(false);
          setHistoryVisible(true);
        }}
        recordingQuality={recordingQuality}
        visible={diagnosticsVisible}
      /> : null}
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
    </View>
    </AtlasNavigationProvider>
  );
}

function getElapsedSeconds(startedAt: string) {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
  );
}

function isTrustworthyPlayerPersistencePoint(
  point: GpsPoint | null
): point is GpsPoint {
  return Boolean(
    point &&
      Number.isFinite(point.latitude) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      Number.isFinite(point.longitude) &&
      point.longitude >= -180 &&
      point.longitude <= 180 &&
      typeof point.accuracy === "number" &&
      Number.isFinite(point.accuracy) &&
      point.accuracy >= 0 &&
      point.accuracy <= MODE_LOCATION_CONFIG.walk.maxAcceptedAccuracyMeters &&
      Number.isFinite(new Date(point.timestamp).getTime())
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

function MapZoneScopePicker({
  city,
  district,
  language,
  onClose,
  onSelect,
  selectedZoneId
}: {
  city: CachedZone;
  district: CachedZone;
  language: AppLanguage;
  onClose: () => void;
  onSelect: (zone: CachedZone) => void;
  selectedZoneId: string | null;
}) {
  const selectZone = (zone: CachedZone) => {
    onSelect(zone);
    onClose();
  };

  return (
    <View style={styles.mapZoneSelection}>
      <AtlasHudTexture opacity={0.1} />
      <View style={styles.mapZoneSelectionHeader}>
        <View style={styles.mapZoneSelectionTitleBlock}>
          <Text style={styles.mapZoneSelectionEyebrow}>
            {language === "fr" ? "APPUI LONG" : "LONG PRESS"}
          </Text>
          <Text numberOfLines={1} style={styles.mapZoneSelectionTitle}>
            {language === "fr" ? "Choisir la portée" : "Choose objective scope"}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityLabel={language === "fr" ? "Fermer" : "Close"}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onClose}
          style={styles.mapZoneSelectionClose}
        >
          <Ionicons color={APP_COLORS.textSecondary} name="close" size={18} />
        </TouchableOpacity>
      </View>
      <AtlasHudDivider />
      <View style={styles.mapZoneSelectionOptions}>
        {[district, city].map((zone) => {
          const isSelected = selectedZoneId === zone.id;
          const label = zone.type === "district"
            ? language === "fr" ? "Quartier" : "District"
            : language === "fr" ? "Ville" : "City";

          return (
            <TouchableOpacity
              accessibilityLabel={`${label}: ${zone.name}`}
              accessibilityRole="button"
              key={zone.id}
              onPress={() => selectZone(zone)}
              style={[
                styles.mapZoneSelectionOption,
                isSelected ? styles.mapZoneSelectionOptionActive : null
              ]}
            >
              <Text style={[
                styles.mapZoneSelectionOptionLabel,
                isSelected ? styles.mapZoneSelectionOptionLabelActive : null
              ]}>
                {label}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.mapZoneSelectionOptionName,
                  isSelected ? styles.mapZoneSelectionOptionNameActive : null
                ]}
              >
                {zone.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ObjectiveHud({
  isCalculating,
  objective,
  language,
  stats,
  todayCellCount
}: {
  isCalculating: boolean;
  objective: CompletionObjective;
  language: AppLanguage;
  stats: ZoneCompletionStats | null;
  todayCellCount: number;
}) {
  const remainingCells = getPresentedRemainingCells(stats);
  const presentedPercent = getPresentedCompletionPercent(stats);
  const objectiveProgress = presentedPercent === null
    ? 0
    : Math.max(0, Math.min(100, presentedPercent));

  return (
    <View style={styles.objectiveHud}>
      <AtlasHudTexture opacity={0.1} />
      <View style={styles.objectiveHeader}>
        <View style={styles.objectiveSeal}>
          <Ionicons color={APP_COLORS.gold} name="map-outline" size={18} />
        </View>
        <View style={styles.objectiveTitleBlock}>
          <Text style={styles.objectiveLabel}>
            {objective.zone.type === "district"
              ? language === "fr" ? "OBJECTIF DU QUARTIER" : "DISTRICT OBJECTIVE"
              : language === "fr" ? "OBJECTIF DE LA VILLE" : "CITY OBJECTIVE"}
          </Text>
          <Text numberOfLines={1} style={styles.objectiveName}>{objective.zone.name}</Text>
        </View>
        <Text style={styles.objectivePercent}>
          {isCalculating && !stats
            ? language === "fr" ? "Calcul…" : "Calculating…"
            : formatObjectiveCompletion(stats)}
        </Text>
      </View>
      <AtlasHudDivider />
      <View style={styles.objectiveProgressTrack}>
        <View style={[styles.objectiveProgressFill, { width: (objectiveProgress + "%") as DimensionValue }]} />
      </View>
      <View style={styles.objectiveFooter}>
        <Text style={styles.objectiveMeta}>
          {isCalculating
            ? objective.zone.type === "district"
              ? language === "fr" ? "Mise \u00e0 jour du quartier..." : "Updating district..."
              : language === "fr" ? "Mise \u00e0 jour de la ville..." : "Updating city..."
            : remainingCells === null
              ? String(stats?.exploredCells ?? 0) + (language === "fr" ? " cellules explor\u00e9es" : " cells explored")
              : String(remainingCells) + (language === "fr" ? " cellules restantes" : " cells remaining")}
        </Text>
        <Text style={styles.objectiveToday}>+{todayCellCount} {language === "fr" ? "aujourd’hui" : "today"}</Text>
      </View>

    </View>
  );
}

function CityMedalProgress({
  hasObjective,
  language,
  loadState,
  objectiveVisible,
  onObjectivePress,
  onPress,
  progress
}: {
  hasObjective: boolean;
  language: AppLanguage;
  loadState: MedalPackLoadState;
  objectiveVisible: boolean;
  onObjectivePress: () => void;
  onPress: () => void;
  progress: MedalAlbumProgress | null;
}) {
  const collected = progress?.collectedCount ?? 0;
  const total = progress?.medals.length ?? 0;
  const ratio = total > 0 ? Math.min(100, (collected / total) * 100) : 0;
  const city = progress?.album.cityName[language] ?? (
    loadState === "loading"
      ? language === "fr" ? "Téléchargement de l’album…" : "Downloading city album…"
      : loadState === "unavailable"
        ? language === "fr" ? "Album indisponible — toucher pour réessayer" : "Album unavailable — tap to retry"
        : language === "fr" ? "Aucun album local" : "No local album"
  );
  const count = loadState === "loading"
    ? "…"
    : loadState === "unavailable"
      ? "!"
      : `${collected}/${total}`;

  return (
    <View style={styles.cityMedalHud}>
      <AtlasHudTexture opacity={0.07} />
      <TouchableOpacity
        accessibilityLabel={language === "fr" ? "Progression des m\u00e9dailles de la ville" : "City medal progress"}
        accessibilityRole="button"
        disabled={loadState === "loading"}
        onPress={onPress}
        style={styles.cityMedalMain}
      >
        <View style={styles.cityMedalIcon}>
          <Ionicons color={APP_COLORS.gold} name="medal" size={18} />
        </View>
        <View style={styles.cityMedalContent}>
          <View style={styles.cityMedalHeader}>
            <Text numberOfLines={1} style={styles.cityMedalName}>{city}</Text>
            <Text style={styles.cityMedalCount}>{count}</Text>
          </View>
          <View style={styles.cityMedalTrack}>
            <View style={[styles.cityMedalFill, { width: (ratio + "%") as DimensionValue }]} />
          </View>
        </View>
        <Ionicons color={APP_COLORS.textMuted} name="chevron-forward" size={15} />
      </TouchableOpacity>
      <View style={styles.cityMedalActionDivider} />
      <ObjectiveToggleButton
        hasObjective={hasObjective}
        language={language}
        onPress={onObjectivePress}
        visible={objectiveVisible}
      />
    </View>
  );
}

function ObjectiveToggleButton({
  hasObjective,
  language,
  onPress,
  visible
}: {
  hasObjective: boolean;
  language: AppLanguage;
  onPress: () => void;
  visible: boolean;
}) {
  const label = hasObjective
    ? visible
      ? language === "fr" ? "Masquer l’objectif de zone" : "Hide area objective"
      : language === "fr" ? "Afficher l’objectif de zone" : "Show area objective"
    : language === "fr" ? "Choisir un objectif de zone" : "Choose an area objective";

  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ expanded: visible }}
      onPress={onPress}
      style={[styles.objectiveToggle, visible ? styles.objectiveToggleActive : null]}
    >

      <Ionicons
        color={visible || hasObjective ? APP_COLORS.gold : APP_COLORS.textMuted}
        name={visible ? "flag" : "flag-outline"}
        size={20}
      />
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
          <ActivityIndicator color={APP_COLORS.gold} size="large" />
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
const STOP_CONFIRM_BORDEAUX = "#6b1029";
const STOP_CONFIRM_HOLD_ORANGE = "#c2410c";

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
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConfirmingRef = useRef(false);
  const isFrench = language === "fr";
  const recordingNoun = ACTIVITY_MODE_TEXT[language].recordingNouns[activityMode];

  const clearHoldTimers = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  const clearHold = useCallback(() => {
    clearHoldTimers();
    holdStartedAtRef.current = null;
    setHoldProgress(0);
  }, [clearHoldTimers]);

  useEffect(() => {
    if (!visible) {
      clearHold();
    } else {
      isConfirmingRef.current = false;
    }

    return clearHold;
  }, [clearHold, visible]);

  const confirmQuit = useCallback(() => {
    if (isConfirmingRef.current) {
      return;
    }

    isConfirmingRef.current = true;
    clearHoldTimers();
    holdStartedAtRef.current = null;
    setHoldProgress(1);
    void playImpactHaptic();
    onConfirm();
  }, [clearHoldTimers, onConfirm]);

  const startHold = useCallback(() => {
    if (isConfirmingRef.current) {
      return;
    }

    clearHold();
    holdStartedAtRef.current = Date.now();
    setHoldProgress(0);

    progressTimerRef.current = setInterval(() => {
      if (!holdStartedAtRef.current) {
        return;
      }

      const elapsed = Date.now() - holdStartedAtRef.current;
      if (elapsed >= STOP_CONFIRM_HOLD_MS) {
        confirmQuit();
        return;
      }

      setHoldProgress(elapsed / STOP_CONFIRM_HOLD_MS);
    }, 40);

    completionTimerRef.current = setTimeout(confirmQuit, STOP_CONFIRM_HOLD_MS);
  }, [clearHold, confirmQuit]);

  const finishOrCancelHold = useCallback(() => {
    const startedAt = holdStartedAtRef.current;

    if (
      startedAt !== null &&
      Date.now() - startedAt >= STOP_CONFIRM_HOLD_MS
    ) {
      confirmQuit();
      return;
    }

    clearHold();
  }, [clearHold, confirmQuit]);

  if (!visible) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <View style={styles.stopConfirmOverlay}>
        <ImageBackground
          imageStyle={styles.dialogPaperTexture}
          source={require("../../assets/ui/atlas-paper-texture.png")}
          style={styles.stopConfirmDialog}
        >
          <View pointerEvents="none" style={styles.dialogInkWash} />
          <View style={styles.stopConfirmIcon}>
            <Ionicons name="stop-circle" size={30} color="#fecaca" />
          </View>
          <Text style={styles.dialogEyebrow}>
            {isFrench ? "CONTR\u00d4LE DU PARCOURS" : "RECORDING CONTROL"}
          </Text>
          <Text style={styles.stopConfirmTitle}>
            {isFrench ? "Quitter l'enregistrement ?" : `Quit ${recordingNoun}?`}
          </Text>
          <AtlasDialogDivider />
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
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "confirmQuit") {
                  confirmQuit();
                }
              }}
              onPressIn={startHold}
              onPressOut={finishOrCancelHold}
              pressRetentionOffset={{ bottom: 32, left: 32, right: 32, top: 32 }}
              style={styles.stopConfirmQuit}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.stopConfirmQuitFill,
                  {
                    borderRightWidth: holdProgress > 0 && holdProgress < 1 ? 3 : 0,
                    width: `${Math.round(holdProgress * 100)}%`
                  }
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
        </ImageBackground>
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
  const milestoneBadges = getRecordingMilestones(summary, language);

  return (
    <Modal animationType="slide" transparent visible>
      <View style={styles.summaryBackdrop}>
        <ImageBackground
          imageStyle={styles.dialogPaperTexture}
          source={require("../../assets/ui/atlas-paper-texture.png")}
          style={styles.summaryDialog}
        >
          <View pointerEvents="none" style={styles.dialogInkWash} />
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryEyebrow}>
                {isFrench ? "CARNET D'ATLAS" : "ATLAS LOG"}
              </Text>
              <Text style={styles.summaryTitle}>
                {isFrench ? "Enregistrement terminé" : "Recording complete"}
              </Text>
              <Text style={styles.summarySubtitle}>
                {isFrench ? "Résumé et nom de la sortie" : "Summary and recording name"}
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.summaryClose}>
              <Ionicons name="close" size={20} color={APP_COLORS.text} />
            </TouchableOpacity>
          </View>

          <AtlasDialogDivider />
          <View style={[styles.summaryQualityPanel, getSummaryQualityStyle(summary.quality.label)]}>
            <Ionicons
              name={summary.quality.label === "Good" ? "checkmark-circle" : "alert-circle"}
              size={22}
              color={summary.quality.label === "Good" ? GPS_STATUS_COLORS.good : APP_COLORS.gold}
            />
            <View style={styles.summaryQualityCopy}>
              <Text style={styles.summaryQualityTitle}>
                {isFrench ? "Qualité du parcours" : "Route quality"} · {summary.quality.score}/100
              </Text>
              <Text style={styles.summaryQualityReason}>{summary.quality.reason}</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryMetric label={isFrench ? "Distance" : "Distance"} value={formatDistance(summary.distanceMeters)} />
            <SummaryMetric label={isFrench ? "Dur\u00e9e" : "Duration"} value={formatDuration(summary.durationSeconds)} />
            <SummaryMetric label={isFrench ? "Pas" : "Steps"} value={summary.finalStepCount.toLocaleString()} />
            <SummaryMetric label={isFrench ? "Nouvelles cellules" : "New cells"} value={String(summary.newCellCount)} />
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
                  <Ionicons name={badge.icon} size={15} color={APP_COLORS.inkOnGold} />
                  <Text style={[styles.badgeText, styles.unlockedBadgeText]}>{badge.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <TextInput
            onChangeText={setDisplayName}
            placeholder={isFrench ? "Nom de l'enregistrement" : "Recording name"}
            placeholderTextColor={APP_COLORS.textMuted}
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
              <Ionicons name="checkmark" size={18} color={APP_COLORS.inkOnGold} />
              <Text style={styles.summaryPrimaryText}>{isFrench ? "Enregistrer" : "Save"}</Text>
            </TouchableOpacity>
          </View>
        </ImageBackground>
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

function AtlasDialogDivider() {
  return (
    <View pointerEvents="none" style={styles.dialogDivider}>
      <View style={styles.dialogDividerLine} />
      <View style={styles.dialogDividerDiamond} />
      <View style={styles.dialogDividerLine} />
    </View>
  );
}

function getSummaryQualityStyle(
  label: ReturnType<typeof calculateRecordingQuality>["label"]
) {
  if (label === "Good") {
    return styles.summaryQualityGood;
  }

  if (label === "Poor") {
    return styles.summaryQualityPoor;
  }

  return styles.summaryQualityOk;
}

function getObjectiveProgressDelta(
  before: ZoneCompletionStats | null,
  after: ZoneCompletionStats | null
) {
  const beforePercent = getPresentedCompletionPercent(before);
  const afterPercent = getPresentedCompletionPercent(after);

  return {
    cells: (after?.exploredCells ?? 0) - (before?.exploredCells ?? 0),
    percent:
      afterPercent !== null && beforePercent !== null
        ? Math.round((afterPercent - beforePercent) * 10) / 10
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

  const remainingCells = getPresentedRemainingCells(after);
  const delta = getObjectiveProgressDelta(before, after);
  const presentedPercent = getPresentedCompletionPercent(after);
  const completion = presentedPercent === null
    ? getStrings(language).common.pending
    : `${presentedPercent}%`;

  if (language === "fr") {
    return `${completion} sur l'objectif, ${remainingCells ?? "?"} cellules restantes, ${delta.cells >= 0 ? "+" : ""}${delta.cells} cellules sur cette sortie.`;
  }

  return `${completion} objective progress, ${remainingCells ?? "?"} cells remaining, ${delta.cells >= 0 ? "+" : ""}${delta.cells} cells from this recording.`;
}

function formatBackupFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatBackupExportDate(value: string, language: AppLanguage) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleString(language === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
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

  if ((getPresentedCompletionPercent(summary.objectiveAfter) ?? 0) >= 5) {
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
  mapProvider,
  googleMapsAvailable,
  mapProviderDisabled,
  onChangeMapProvider,
  appearanceMode,
  hapticsEnabled,
  language,
  layers,
  mode,
  onChangeAppearanceMode,
  onChangeHapticsEnabled,
  onChangeLanguage,
  onChangePathDisplayMode,
  onChangeSoundEnabled,
  onClose,
  onToggleLayer,
  onReprocessRecordings,
  selectedSessionId,
  soundEnabled,
  visible
}: {
  mapProvider: MapProvider;
  googleMapsAvailable: boolean;
  mapProviderDisabled: boolean;
  onChangeMapProvider: (provider: MapProvider) => void;
  appearanceMode: AppearanceMode;
  hapticsEnabled: boolean;
  language: AppLanguage;
  layers: MapLayerState;
  mode: PathDisplayMode;
  onChangeAppearanceMode: (mode: AppearanceMode) => void;
  onChangeHapticsEnabled: (enabled: boolean) => void;
  onChangeLanguage: (language: AppLanguage) => void;
  onChangePathDisplayMode: (mode: PathDisplayMode) => void;
  onChangeSoundEnabled: (enabled: boolean) => void;
  onClose: () => void;
  onToggleLayer: (layer: keyof MapLayerState) => void;
  onReprocessRecordings: () => void;
  selectedSessionId: number | null;
  soundEnabled: boolean;
  visible: boolean;
}) {
  const strings = getStrings(language);
  const appearanceOptions = APPEARANCE_MODES.map((value) => {
    if (value === "daylight") {
      return {
        description: language === "fr"
          ? "Palette claire \u00e0 contraste renforc\u00e9 pour une lecture en plein soleil."
          : "High-contrast light palette for clear reading in direct sunlight.",
        icon: "sunny-outline" as const,
        label: "Daylight",
        value
      };
    }
    return {
      description: language === "fr"
        ? "Palette sombre actuelle de l'atlas."
        : "Current dark atlas palette.",
      icon: "compass-outline" as const,
      label: "Explorator",
      value
    };
  });

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <AtlasScreen onSwipeBack={onClose} visible={visible}>
        <AtlasModalHeader
          emblem="options-outline"
          eyebrow={language === "fr" ? "N\u00c9CESSAIRE DU CARTOGRAPHE" : "CARTOGRAPHER'S KIT"}
          onBack={onClose}
          subtitle={strings.options.subtitle}
          title={strings.common.options}
        />

        <ScrollView contentContainerStyle={styles.detailsContent}>
          <AtlasSectionLabel
            icon="language-outline"
            title={language === "fr" ? "R\u00c9GLAGES DE L'ATLAS" : "ATLAS SETTINGS"}
          />
          {Platform.OS === "ios" ? (
            <View style={styles.optionPanel}>
              <Text style={styles.pathDisplayTitle}>
                {language === "fr" ? "Fournisseur de carte" : "Map provider"}
              </Text>
              <View style={styles.appearanceOptions}>
                {(["apple", "google"] as const).map((provider) => {
                  const selected = mapProvider === provider;
                  const disabled = mapProviderDisabled || (provider === "google" && !googleMapsAvailable);
                  return (
                    <TouchableOpacity
                      key={provider}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() => onChangeMapProvider(provider)}
                      style={[
                        styles.appearanceOption,
                        selected ? styles.selectedPathDisplayButton : null,
                        disabled ? { opacity: 0.5 } : null
                      ]}
                    >
                      <Text style={[styles.pathDisplayButtonText, selected ? styles.selectedPathDisplayButtonText : null]}>
                        {provider === "apple" ? "Apple Maps" : "Google Maps"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.optionHelpText}>
                {!googleMapsAvailable
                  ? language === "fr" ? "Installez la nouvelle version de l'app pour utiliser Google Maps." : "Install the new app build to use Google Maps."
                  : mapProviderDisabled
                    ? language === "fr" ? "Disponible une fois la marche terminée et enregistrée." : "Available once your walk has finished and saved."
                    : language === "fr" ? "Votre choix est conservé. Vos marches et découvertes restent les mêmes." : "Your choice is remembered. Your walks and discoveries stay the same."}
              </Text>
            </View>
          ) : null}
          <View style={styles.optionPanel}>
            <Text style={styles.pathDisplayTitle}>
              {language === "fr" ? "Apparence" : "Appearance"}
            </Text>
            <View style={styles.appearanceOptions}>
              {appearanceOptions.map((option) => {
                const selected = appearanceMode === option.value;

                return (
                  <TouchableOpacity
                    accessibilityHint={option.description}
                    accessibilityLabel={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.value}
                    onPress={() => onChangeAppearanceMode(option.value)}
                    style={[
                      styles.appearanceOption,
                      selected ? styles.selectedPathDisplayButton : null
                    ]}
                  >
                    <Ionicons
                      color={selected ? APP_COLORS.inkOnGold : APP_COLORS.text}
                      name={option.icon}
                      size={20}
                    />
                    <View style={styles.appearanceOptionCopy}>
                      <Text
                        style={[
                          styles.pathDisplayButtonText,
                          selected ? styles.selectedPathDisplayButtonText : null
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text
                        style={[
                          styles.appearanceOptionDescription,
                          selected ? styles.selectedAppearanceOptionDescription : null
                        ]}
                      >
                        {option.description}
                      </Text>
                    </View>
                    {selected ? (
                      <Ionicons
                        color={APP_COLORS.inkOnGold}
                        name="checkmark-circle"
                        size={20}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.optionPanel}>
            <Text style={styles.pathDisplayTitle}>
              {language === "fr" ? "Retour sensoriel" : "Feedback"}
            </Text>
            <View style={styles.optionRows}>
              <OptionToggle
                active={soundEnabled}
                icon="volume-high-outline"
                label={language === "fr" ? "Effets sonores" : "Sound effects"}
                onPress={() => onChangeSoundEnabled(!soundEnabled)}
              />
              <OptionToggle
                active={hapticsEnabled}
                icon="phone-portrait-outline"
                label={language === "fr" ? "Vibrations" : "Haptics"}
                onPress={() => onChangeHapticsEnabled(!hapticsEnabled)}
              />
            </View>
            <Text style={styles.optionHelpText}>
              {language === "fr"
                ? "Contrôle les sons et vibrations de navigation et de récompense."
                : "Controls navigation and reward sounds and haptics."}
            </Text>
          </View>

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
                  <Ionicons
                    name="language-outline"
                    size={17}
                    color={language === option.code ? APP_COLORS.inkOnGold : APP_COLORS.text}
                  />
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

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onReprocessRecordings}
            style={styles.maintenanceButton}
          >
            <Ionicons name="sync-outline" size={18} color={APP_COLORS.gold} />
            <View style={styles.maintenanceText}>
              <Text style={styles.pathDisplayTitle}>{strings.details.reprocessRecordings}</Text>
              <Text style={styles.optionHelpText}>
                {language === "fr" ? "Outil de maintenance pour recalculer les anciens parcours." : "Maintenance tool for rebuilding older recordings."}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </AtlasScreen>
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
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.optionButton, active ? styles.selectedPathDisplayButton : null]}
    >
      <Ionicons name={icon} size={17} color={active ? APP_COLORS.inkOnGold : APP_COLORS.text} />
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
  explorerScore,
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
  explorerScore: ExplorerScore;
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
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <AtlasScreen onSwipeBack={onClose} visible={visible}>
        <AtlasModalHeader
          emblem="stats-chart-outline"
          eyebrow={language === "fr" ? "CARNET DE L'EXPLORATEUR" : "EXPLORER'S LEDGER"}
          onBack={onClose}
          subtitle={interpolate(strings.details.mapSubtitle, { mode: modeLabel })}
          title={strings.common.details}
        />

        <ScrollView contentContainerStyle={styles.detailsContent}>
          <AtlasSectionLabel
            icon="sparkles-outline"
            title={language === "fr" ? "SCORE D'EXPLORATION" : "EXPLORATION SCORE"}
          />
          <ExplorerScorePanel language={language} score={explorerScore} />
          <AtlasSectionLabel
            icon="navigate-circle-outline"
            title={language === "fr" ? "STATISTIQUES" : "EXPLORATION STATUS"}
          />
          <StatsPanel activityMode={activityMode} language={language} stats={stats} />
          <GameProgressPanel
            language={language}
            objectiveStats={objectiveStats}
            stats={stats}
            sessions={history}
          />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onOpenHistory}
            style={styles.dashboardToggle}
          >
            <Ionicons name="time-outline" size={18} color={APP_COLORS.text} />
            <Text style={styles.dashboardToggleText}>{strings.details.openHistory}</Text>
          </TouchableOpacity>
        </ScrollView>
      </AtlasScreen>
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
  const objectivePercent = getPresentedCompletionPercent(objectiveStats);

  return (
    <View style={styles.gamePanel}>
      <Text style={styles.gamePanelTitle}>{isFrench ? "Objectifs" : "Goals"}</Text>
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

function getWalkPointLoadScope(
  mode: PathDisplayMode,
  selectedSessionId: number | null
): WalkPointLoadScope {
  if (mode === "selected") {
    return { kind: "selected", sessionId: selectedSessionId ?? -1 };
  }

  if (mode === "last7") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return { kind: "since", startedAt: cutoff.toISOString() };
  }

  if (mode === "today") {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const tomorrowStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );

    return {
      endedAfter: todayStart.toISOString(),
      kind: "range",
      startedBefore: tomorrowStart.toISOString()
    };
  }

  return { kind: "all" };
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

  return walks.filter((walk) => doesWalkOverlapToday(walk));
}

async function calculateObjectiveStats(
  objective: CompletionObjective,
  signal?: AbortSignal
) {
  const explorationRevision = await getExplorationRevision(objective.mode);
  const snapshot = await calculateZoneCompletionSnapshot(
    objective.zone,
    objective.mode,
    explorationRevision,
    signal
  );

  return snapshot.stats;
}

function CountrysideStatus({ language }: { language: AppLanguage }) {
  const title = language === "fr" ? "HORS DE LA VILLE" : "OUT OF THE CITY";
  const detail = language === "fr"
    ? "Exploration de la campagne"
    : "Exploring the countryside";

  return (
    <View
      accessibilityLabel={`${title}. ${detail}`}
      style={styles.cityMedalHud}
    >
      <AtlasHudTexture opacity={0.07} />
      <View style={styles.cityMedalMain}>
        <View style={styles.cityMedalIcon}>
          <Ionicons color="#f4e08a" name="leaf-outline" size={18} />
        </View>
        <View style={styles.cityMedalContent}>
          <Text numberOfLines={1} style={styles.cityMedalName}>{title}</Text>
          <Text numberOfLines={1} style={styles.countrysideDetail}>{detail}</Text>
        </View>
      </View>
    </View>
  );
}


function getRecentDistanceMeters(sessions: WalkSession[], dayCount: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dayCount);

  return sessions
    .filter((session) => new Date(session.startedAt) >= cutoff)
    .reduce((total, session) => total + session.distanceMeters, 0);
}

function getForbiddenZonePersistenceFailureMessage(
  reason: ReturnType<typeof getForbiddenZonePersistenceFailureReason>,
  language: AppLanguage
) {
  if (reason === "database_busy") {
    return language === "fr"
      ? "Les données locales de Mapbound sont occupées. Réessayez dans un instant."
      : "Mapbound’s local data is busy. Please try again in a moment.";
  }

  if (reason === "schema_unavailable") {
    return language === "fr"
      ? "Le stockage des Zones interdites n’est pas encore prêt. Fermez complètement Mapbound, puis relancez-le."
      : "Forbidden Zone storage is not ready yet. Fully close Mapbound, then reopen it.";
  }

  if (reason === "overlapping_zone") {
    return language === "fr"
      ? "Cette zone chevauche une Zone interdite existante."
      : "This area overlaps an existing Forbidden Zone.";
  }

  return language === "fr"
    ? "Mapbound n’a pas pu enregistrer cette zone."
    : "Mapbound could not save this area.";
}

function formatObjectiveMode(mode: CompletionObjective["mode"], language: AppLanguage) {
  return ACTIVITY_MODE_TEXT[language].labels[mode];
}

function formatObjectiveCompletion(stats: ZoneCompletionStats | null) {
  const presentedPercent = getPresentedCompletionPercent(stats);

  if (presentedPercent === null) {
    return "pending";
  }

  return `${presentedPercent}%`;
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

function doesWalkOverlapToday(walk: Pick<WalkSession, "endedAt" | "startedAt">) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );

  return (
    new Date(walk.endedAt) > todayStart &&
    new Date(walk.startedAt) < tomorrowStart
  );
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

function isPointInsideZone(
  point: Pick<GpsPoint, "latitude" | "longitude">,
  zone: CachedZone
) {
  const coordinate = {
    latitude: point.latitude,
    longitude: point.longitude
  };
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(coordinate, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(coordinate, ring));

  return insideOuter && !insideHole;
}

function findContainingZone(
  point: Pick<GpsPoint, "latitude" | "longitude">,
  zones: CachedZone[]
) {
  return zones.find((zone) =>
    zone.source === "openstreetmap" && isPointInsideZone(point, zone)
  ) ?? null;
}

function findContainingZoneForMapHold(
  point: Pick<GpsPoint, "latitude" | "longitude">,
  zones: CachedZone[],
  viewport: Region | null
) {
  for (const probe of buildMapZoneSelectionProbeCoordinates({
    coordinate: point,
    viewport
  })) {
    const zone = findContainingZone(probe, zones);

    if (zone) {
      return zone;
    }
  }

  return null;
}

function doesDistrictBelongToCity(district: CachedZone, city: CachedZone) {
  return doesDistrictGeometryBelongToCity(district, city);
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

const styles = createAppearanceStyles({
  dialogDivider: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    width: "100%"
  },
  dialogDividerDiamond: {
    backgroundColor: APP_COLORS.gold,
    height: 5,
    opacity: 0.72,
    transform: [{ rotate: "45deg" }],
    width: 5
  },
  dialogDividerLine: {
    backgroundColor: APP_COLORS.gold,
    flex: 1,
    height: 1,
    opacity: 0.24
  },
  dialogEyebrow: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 10,
    letterSpacing: 1.4
  },
  dialogInkWash: {
    backgroundColor: "rgba(2, 6, 10, 0.5)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  dialogPaperTexture: {
    opacity: 0.26
  },
  summaryEyebrow: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 9,
    letterSpacing: 1.3,
    marginBottom: 2
  },
  bottomPanel: {
    marginTop: "auto"
  },
  computingDialog: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.94)",
    borderColor: "rgba(245, 196, 81, 0.35)",
    borderRadius: 14,
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
    color: "#f5c451",
    fontSize: 14,
    fontWeight: "900"
  },
  reprocessProgressFill: {
    backgroundColor: "#f5c451",
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
    backgroundColor: APP_COLORS.cardRaised,
    borderColor: APP_COLORS.borderStrong,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 11
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
    borderRadius: 14,
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
    backgroundColor: APP_COLORS.background,
    flex: 1
  },
  disabledPathDisplayButton: {
    opacity: 0.45
  },
  fullScreenHeader: {
    alignItems: "center",
    backgroundColor: "#071018",
    borderBottomColor: "rgba(245, 196, 81, 0.22)",
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
    backgroundColor: "#13212b",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 14,
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
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  gamePanelTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  goalFill: {
    backgroundColor: "#f5c451",
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
    color: "#f5c451",
    fontSize: 12,
    fontWeight: "900"
  },
  logoFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%"
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
    borderRadius: 14,
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
    backgroundColor: "#f5c451",
    borderColor: "#f5c451"
  },
  layerControlButton: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 14,
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
  maintenanceButton: {
    alignItems: "center",
    backgroundColor: "#0c151c",
    borderColor: "rgba(245, 196, 81, 0.24)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  maintenanceText: { flex: 1, gap: 3 },
  modeButton: {
    alignItems: "center",
    backgroundColor: "rgba(11, 21, 29, 0.96)",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 14,
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
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  optionPanel: {
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: APP_COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  appearanceOptions: { gap: 8 },
  appearanceOption: {
    alignItems: "center",
    backgroundColor: "rgba(12, 21, 28, 0.9)",
    borderColor: APP_COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  appearanceOptionCopy: { flex: 1, gap: 2 },
  appearanceOptionDescription: {
    color: APP_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15
  },
  selectedAppearanceOptionDescription: {
    color: APP_COLORS.inkOnGold,
    opacity: 0.82
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
  cityMedalHud: {
    alignItems: "center",
    backgroundColor: "rgba(7, 16, 24, 0.95)",
    borderColor: APP_COLORS.borderStrong,
    borderTopColor: "rgba(245, 196, 81, 0.24)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    marginHorizontal: -7,
    minHeight: 46,
    overflow: "hidden"
  },
  cityMedalMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 11,
    paddingVertical: 4
  },
  cityMedalActionDivider: {
    alignSelf: "stretch",
    backgroundColor: "rgba(245, 196, 81, 0.22)",
    width: 1
  },
  cityMedalIcon: {
    alignItems: "center",
    backgroundColor: "rgba(245, 196, 81, 0.08)",
    borderColor: "rgba(245, 196, 81, 0.4)",
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  cityMedalContent: { flex: 1, gap: 4 },
  cityMedalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  cityMedalName: {
    color: APP_COLORS.parchment,
    flex: 1,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 13,
    fontWeight: "900"
  },
  cityMedalCount: { color: "#f5c451", fontSize: 12, fontWeight: "900" },
  countrysideDetail: {
    color: "#f4e08a",
    fontSize: 11,
    fontWeight: "700"
  },
  cityMedalTrack: {
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    borderRadius: 999,
    height: 4,
    overflow: "hidden"
  },
  cityMedalFill: { backgroundColor: "#f5c451", borderRadius: 999, height: "100%" },

  objectiveToggle: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 0,
    height: 46,
    justifyContent: "center",
    overflow: "hidden",
    width: 50
  },
  objectiveToggleActive: {
    backgroundColor: "rgba(245, 196, 81, 0.13)"
  },
  objectiveHud: {
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderColor: APP_COLORS.border,
    borderTopColor: "rgba(245, 196, 81, 0.28)",
    borderRadius: 10,
    borderWidth: 1,
    gap: 7,
    marginHorizontal: -7,
    overflow: "hidden",
    padding: 12
  },
  objectiveHeader: { alignItems: "center", flexDirection: "row", gap: 12 },
  objectiveSeal: {
    alignItems: "center",
    backgroundColor: "rgba(245, 196, 81, 0.08)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    transform: [{ rotate: "-2deg" }],
    width: 34
  },
  objectiveTitleBlock: { flex: 1 },
  objectiveLabel: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2
  },
  objectiveName: {
    color: APP_COLORS.parchment,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1
  },
  objectivePercent: { color: "#f8fafc", fontSize: 20, fontWeight: "900" },
  objectiveProgressFill: { backgroundColor: "#f5c451", borderRadius: 999, height: "100%" },
  objectiveProgressTrack: {
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    borderRadius: 999,
    height: 6,
    overflow: "hidden"
  },
  objectiveFooter: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  objectiveMeta: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
  objectiveToday: { color: "#f5c451", fontSize: 11, fontWeight: "900" },
  mapZoneSelection: {
    backgroundColor: "rgba(7, 16, 24, 0.98)",
    borderColor: APP_COLORS.borderStrong,
    borderTopColor: "rgba(245, 196, 81, 0.28)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    marginTop: 8,
    overflow: "hidden",
    padding: 11
  },
  mapZoneSelectionClose: {
    alignItems: "center",
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32
  },
  mapZoneSelectionEyebrow: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1
  },
  mapZoneSelectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  mapZoneSelectionLoading: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(7, 16, 24, 0.94)",
    borderColor: APP_COLORS.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mapZoneSelectionLoadingText: {
    color: APP_COLORS.parchment,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 11,
    fontWeight: "800"
  },
  mapZoneSelectionOption: {
    backgroundColor: "rgba(15, 29, 40, 0.96)",
    borderColor: "rgba(148, 163, 184, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  mapZoneSelectionOptionActive: {
    backgroundColor: "rgba(245, 196, 81, 0.13)",
    borderColor: "rgba(245, 196, 81, 0.52)"
  },
  mapZoneSelectionOptionLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  mapZoneSelectionOptionLabelActive: { color: APP_COLORS.gold },
  mapZoneSelectionOptionName: {
    color: APP_COLORS.parchment,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 12,
    fontWeight: "900"
  },
  mapZoneSelectionOptionNameActive: { color: APP_COLORS.parchment },
  mapZoneSelectionOptions: { flexDirection: "row", gap: 8 },
  mapZoneSelectionTitle: {
    color: APP_COLORS.parchment,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 14,
    fontWeight: "900"
  },
  mapZoneSelectionTitleBlock: { flex: 1 },
  overlay: {
    flex: 1,
    padding: 14
  },
  logo: {
    height: 98,
    width: "86%"
  },
  pathDisplayButton: {
    backgroundColor: "rgba(2, 6, 10, 0.86)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 14,
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
    borderRadius: 14,
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
    borderRadius: 14,
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
  recordingResumeNotice: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(5, 46, 22, 0.94)",
    borderColor: "rgba(134, 239, 172, 0.5)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  recordingResumeNoticeText: {
    color: "#dcfce7",
    fontSize: 12,
    fontWeight: "700"
  },
  screen: {
    backgroundColor: "#071018",
    flex: 1
  },
  selectedPathDisplayButton: {
    backgroundColor: "#f5c451",
    borderColor: "#f5c451"
  },
  selectedPathDisplayButtonText: {
    color: "#151006"
  },
  subtitle: {
    color: "#94a3b8",
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
    backgroundColor: "#13212b",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 14,
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
    backgroundColor: "rgba(9, 19, 27, 0.98)",
    borderColor: "rgba(169, 93, 77, 0.68)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 13,
    marginHorizontal: 18,
    maxWidth: 440,
    overflow: "hidden",
    padding: 16,
    width: "100%"
  },
  stopConfirmIcon: {
    alignItems: "center",
    backgroundColor: "rgba(220, 38, 38, 0.18)",
    borderColor: "rgba(252, 165, 165, 0.34)",
    borderRadius: 14,
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
    backgroundColor: STOP_CONFIRM_BORDEAUX,
    borderColor: "#f4b4c4",
    borderRadius: 14,
    borderWidth: 2,
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
    backgroundColor: STOP_CONFIRM_HOLD_ORANGE,
    borderRightColor: "#ffedd5",
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0
  },
  stopConfirmQuitText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 2
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
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 19,
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
    backgroundColor: "#13212b",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  summaryDialog: {
    backgroundColor: "rgba(9, 19, 27, 0.98)",
    borderColor: APP_COLORS.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    gap: 13,
    overflow: "hidden",
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
    backgroundColor: "#13212b",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 14,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  summaryMetric: {
    backgroundColor: "#182630",
    borderColor: "rgba(148, 163, 184, 0.18)",
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: "47%",
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
  summaryQualityPanel: {
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 11
  },
  summaryQualityCopy: {
    flex: 1
  },
  summaryQualityGood: {
    backgroundColor: "rgba(34, 197, 94, 0.14)",
    borderColor: "rgba(74, 222, 128, 0.46)"
  },
  summaryQualityOk: {
    backgroundColor: "rgba(245, 196, 81, 0.12)",
    borderColor: "rgba(245, 196, 81, 0.4)"
  },
  summaryQualityPoor: {
    backgroundColor: "rgba(239, 68, 68, 0.14)",
    borderColor: "rgba(248, 113, 113, 0.46)"
  },
  summaryQualityReason: {
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2
  },
  summaryQualityTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  summaryNote: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  summaryProgressPanel: {
    backgroundColor: "#13212b",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 10
  },
  summaryPrimary: {
    alignItems: "center",
    backgroundColor: "#f5c451",
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 42
  },
  summaryPrimaryText: {
    color: "#151006",
    fontSize: 14,
    fontWeight: "800"
  },
  summarySecondary: {
    alignItems: "center",
    backgroundColor: "#13212b",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 14,
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
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 19
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
    backgroundColor: "#f5c451",
    borderColor: "#f5c451"
  },
  unlockedBadgeText: {
    color: "#151006"
  }
});
