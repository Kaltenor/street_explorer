import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AppearanceMode,
  createAppearanceStyles,
  isDaylightAppearance
} from "../constants/appearance";
import type {
  ComponentRef,
  ComponentProps,
  ForwardRefExoticComponent,
  RefAttributes
} from "react";
import MapView, {
  type LongPressEvent,
  type MapPressEvent,
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
  Region
} from "react-native-maps";
import { Image, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  playAtlasSound,
  useReducedMotionPreference
} from "./AtlasCabinet";
import {
  LOCATION_CONFIG,
  MAP_CONFIG,
  MODE_LOCATION_CONFIG
} from "../constants/config";
import { APP_COLORS, WALKING_COLORS } from "../constants/theme";
import { GOOGLE_DAYLIGHT_STYLE, GOOGLE_EXPLORATOR_STYLE, type MapProvider } from "../services/mapProvider";
import { CachedZone } from "../database/completionRepository";
import type { ForbiddenZone } from "../database/forbiddenZoneRepository";
import {
  buildExplorationPolygonOutlineSegments,
  buildMergedExplorationPolygons,
  explorationCellKeyToCenterCoordinate
} from "../services/explorationArea";
import { partitionExplorationCellIdsByCity } from "../services/countrysideExploration";
import { haversineDistanceMeters } from "../services/distance";
import { buildPathSegments, type PathSegment } from "../services/pathInference";
import { LOOP_FILL_CONFIG } from "../services/loopFill";
import { formatForbiddenZoneArea } from "../services/forbiddenZones";
import {
  createPlayerSpeechMessage,
  getPlayerSpeechCharacterCount,
  PLAYER_SPEECH_CONFIG,
  type PlayerSpeechBehavior
} from "../services/playerSpeech";
import {
  measurePerformance,
  usePerformanceRenderCounter
} from "../services/performance";
import { simplifyGpsPointsForRender } from "../services/routeSimplification";
import { MapLayerState } from "../types/mapLayers";
import type { AppLanguage } from "../i18n";
import { CollectedMedal } from "../types/medal";
import {
  ActivityMode,
  GpsPoint,
  LiveRouteChunk,
  RenderedRouteSegment,
  WalkWithPoints
} from "../types/walk";

type ExplorationMapProps = {
  mapProvider: MapProvider;
  walks: WalkWithPoints[];
  pathWalks: WalkWithPoints[];
  activePoints: GpsPoint[];
  activeRouteChunks: LiveRouteChunk[];
  activeExplorationCellIds: string[];
  appearanceMode: AppearanceMode;
  explorationEnabled: boolean;
  activeMode: ActivityMode;
  focusedMedal: CollectedMedal | null;
  forbiddenZones: ForbiddenZone[];
  forbiddenZoneLabel: {
    coordinate: { latitude: number; longitude: number };
    zone: ForbiddenZone;
  } | null;
  medalFocusRequestId: number;
  lockedMedalLabel: string;
  medals: CollectedMedal[];
  onMedalPress?: (medal: CollectedMedal) => void;
  currentLocation: GpsPoint | null;
  language: AppLanguage;
  isRecording: boolean;
  recordingDistanceMeters: number;
  recordingExploredCellCount: number;
  recordingSpeedMetersPerSecond: number;
  gpsAccuracyMeters: number | null;
  gpsStatus: string | null;
  highlightedSessionId: number | null;
  routeFocusRequestId: number;
  layers: MapLayerState;
  savedExplorationCellIds: string[];
  onMapReady?: () => void;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onMapLongPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onForbiddenZoneLabelPress?: (zone: ForbiddenZone) => void;
  onMapInteraction?: () => void;
  onVisibleRegionChange?: (region: Region) => void;
  districtZones: CachedZone[];
  cityZone: CachedZone | null;
  knownCityZones: CachedZone[];
  playerFocusRequestId: number;
  playerVisible: boolean;
  selectedZone: CachedZone | null;
  todayNewCellIds: string[];
  zoneFocusRequestId: number;
};

type AppleMapsPointOfInterestCategory =
  | "airport"
  | "amusementPark"
  | "aquarium"
  | "beach"
  | "campground"
  | "fireStation"
  | "hospital"
  | "library"
  | "marina"
  | "museum"
  | "nationalPark"
  | "park"
  | "police"
  | "postOffice"
  | "publicTransport"
  | "school"
  | "stadium"
  | "theater"
  | "university"
  | "zoo";

type ApplePoiFilteredMapViewProps = ComponentProps<typeof MapView> & {
  appleMapsPointsOfInterestFilter?: {
    categories: AppleMapsPointOfInterestCategory[];
    mode: "exclude" | "include";
  };
};

const ApplePoiFilteredMapView = MapView as unknown as ForwardRefExoticComponent<
  ApplePoiFilteredMapViewProps & RefAttributes<MapView>
>;

// Game-owned landmarks and medals replace MapKit's generic POI symbols.
const GAMEPLAY_POI_CATEGORIES: AppleMapsPointOfInterestCategory[] = [];
const GAMEPLAY_POI_FILTER = {
  categories: GAMEPLAY_POI_CATEGORIES,
  mode: "include" as const
};
const MEDAL_MARKER_MAX_LATITUDE_DELTA = 0.14;

export const ExplorationMap = memo(function ExplorationMap({
  mapProvider,
  walks,
  activeExplorationCellIds,
  appearanceMode,
  explorationEnabled,
  pathWalks,
  activePoints,
  activeRouteChunks,
  activeMode,
  currentLocation,
  language,
  isRecording,
  recordingDistanceMeters,
  recordingExploredCellCount,
  recordingSpeedMetersPerSecond,
  gpsAccuracyMeters,
  gpsStatus,
  focusedMedal,
  forbiddenZones,
  forbiddenZoneLabel,
  medalFocusRequestId,
  lockedMedalLabel,
  medals,
  onMedalPress,
  highlightedSessionId,
  routeFocusRequestId,
  layers,
  savedExplorationCellIds,
  onMapReady,
  onMapPress,
  onMapLongPress,
  onForbiddenZoneLabelPress,
  onMapInteraction,
  onVisibleRegionChange,
  districtZones,
  cityZone,
  knownCityZones,
  playerFocusRequestId,
  playerVisible,
  selectedZone,
  todayNewCellIds,
  zoneFocusRequestId
}: ExplorationMapProps) {
  usePerformanceRenderCounter("ExplorationMap");
  const reducedMotion = useReducedMotionPreference();
  const usesAppleMaps = Platform.OS === "ios" && mapProvider === "apple";
  const nativeMapKey = `native-map-${mapProvider}-${appearanceMode}-city-${cityZone?.id ?? "none"}`;
  const [highlightedRouteDrawProgress, setHighlightedRouteDrawProgress] = useState(1);
  const [isInkRevealing, setIsInkRevealing] = useState(false);
  const previousExplorationCellCountRef = useRef<number | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const hasUserMovedMapRef = useRef(false);
  const initialCenterRef = useRef<InitialMapCenter | null>(null);
  const pendingStartupRegionRef = useRef<Region | null>(null);
  const handledPlayerFocusRequestId = useRef(playerFocusRequestId);
  const pendingPlayerFocusTimestampRef = useRef<number | null>(null);
  const handledZoneFocusRequestId = useRef(zoneFocusRequestId);
  const handledMedalFocusRequestId = useRef(0);
  const persistentPlayerLocationRef = useRef<GpsPoint | null>(null);
  const [readyMapKey, setReadyMapKey] = useState<string | null>(null);
  const [laidOutMapKey, setLaidOutMapKey] = useState<string | null>(null);
  const isNativeMapReady = readyMapKey === nativeMapKey && laidOutMapKey === nativeMapKey;
  const activeRouteStartPoint =
    activeRouteChunks[0]?.points[0] ?? activePoints[0] ?? null;
  const activeRouteEndPoint =
    activeRouteChunks.at(-1)?.points.at(-1) ?? activePoints.at(-1) ?? null;
  const highlightedRoutePointCount = highlightedSessionId === null
    ? 0
    : walks.find((walk) => walk.id === highlightedSessionId)?.points.length ?? 0;
  // Once recording has an accepted point, weak/rejected raw fixes must not move
  // either the player marker or the camera away from the canonical route. Keep
  // the last trustworthy point across recording teardown/startup transitions.
  const playerLocationCandidate = activeRouteEndPoint ?? currentLocation;

  if (
    playerLocationCandidate &&
    shouldAdoptPlayerLocation(
      persistentPlayerLocationRef.current,
      playerLocationCandidate,
      activeRouteEndPoint === playerLocationCandidate,
      activeMode
    )
  ) {
    persistentPlayerLocationRef.current = playerLocationCandidate;
  }

  const playerLocation = persistentPlayerLocationRef.current;
  const startupCenter = useMemo(
    () =>
      getStartupCenterCandidate(
        activeMode,
        activeRouteEndPoint,
        playerLocation
      ),
    [activeMode, activeRouteEndPoint, playerLocation]
  );
  const [visibleRegion, setVisibleRegion] = useState(() =>
    getInitialRegion(playerLocation, walks)
  );
  const renderLevel = getMapRenderLevel(visibleRegion.latitudeDelta);
  const areaStyle = getExploredAreaStyle(visibleRegion.latitudeDelta);
  const countrysideAreaStyle = getCountrysideExploredAreaStyle(visibleRegion.latitudeDelta);

  // Preserve every finalized street corner so rendered routes never cut through buildings.
  const pathSimplificationToleranceMeters = 0;
  const shouldShowCompletedArea = layers.showExploredCells;
  const shouldShowOutline = layers.showExploredCells && renderLevel !== "far";
  const shouldShowRoutes = layers.showPaths && renderLevel === "close";
  const shouldShowMarkers = layers.showMarkers && renderLevel === "close";
  const shouldShowMedalMarkers =
    layers.showMarkers &&
    visibleRegion.latitudeDelta <= MEDAL_MARKER_MAX_LATITUDE_DELTA;
  const shouldBuildExploredArea =
    explorationEnabled && (shouldShowCompletedArea || shouldShowOutline);
  const maxFilledHoleAreaSquareMeters =
    LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode[activeMode];
  const settledActiveExplorationCellIds = useCoalescedValue(
    activeExplorationCellIds,
    650
  );
  const savedCellSet = useMemo(() => new Set(savedExplorationCellIds), [savedExplorationCellIds]);
  const savedCellPartition = useMemo(() => partitionExplorationCellIdsByCity({
    cellIds: shouldBuildExploredArea ? [...savedCellSet] : [],
    cityBoundaries: knownCityZones,
    getCellCenter: explorationCellKeyToCenterCoordinate
  }), [savedCellSet, knownCityZones, shouldBuildExploredArea]);
  const explorationCellPartition = useMemo(() => {
    const activePartition = partitionExplorationCellIdsByCity({
      cellIds: shouldBuildExploredArea
        ? [...new Set(settledActiveExplorationCellIds)].filter((id) => !savedCellSet.has(id))
        : [],
      cityBoundaries: knownCityZones,
      getCellCenter: explorationCellKeyToCenterCoordinate
    });
    return {
      cityCellIds: activePartition.cityCellIds.length
        ? [...savedCellPartition.cityCellIds, ...activePartition.cityCellIds]
        : savedCellPartition.cityCellIds,
      countrysideCellIds: activePartition.countrysideCellIds.length
        ? [...savedCellPartition.countrysideCellIds, ...activePartition.countrysideCellIds]
        : savedCellPartition.countrysideCellIds
    };
  }, [savedCellPartition, savedCellSet, knownCityZones, settledActiveExplorationCellIds, shouldBuildExploredArea]);
  const renderedExplorationCellCount = explorationCellPartition.cityCellIds.length +
    explorationCellPartition.countrysideCellIds.length;
  const explorationPolygons = useMemo(
    () =>
      shouldShowCompletedArea
        ? measurePerformance(
            "map.exploration-surface",
            () =>
              buildMergedExplorationPolygons(explorationCellPartition.cityCellIds, {
                maxFilledHoleAreaSquareMeters
              }),
            12
          )
        : [],
    [
      explorationCellPartition.cityCellIds,
      maxFilledHoleAreaSquareMeters,
      shouldShowCompletedArea
    ]
  );
  const countrysideExplorationPolygons = useMemo(
    () =>
      shouldShowCompletedArea
        ? measurePerformance(
            "map.countryside-exploration-surface",
            () =>
              buildMergedExplorationPolygons(explorationCellPartition.countrysideCellIds, {
                maxFilledHoleAreaSquareMeters
              }),
            12
          )
        : [],
    [
      explorationCellPartition.countrysideCellIds,
      maxFilledHoleAreaSquareMeters,
      shouldShowCompletedArea
    ]
  );
  const explorationOutlineSegments = useMemo(
    () =>
      shouldShowOutline
        ? buildExplorationPolygonOutlineSegments(explorationPolygons)
        : [],
    [explorationPolygons, shouldShowOutline]
  );
  const countrysideExplorationOutlineSegments = useMemo(
    () =>
      shouldShowOutline
        ? buildExplorationPolygonOutlineSegments(countrysideExplorationPolygons)
        : [],
    [countrysideExplorationPolygons, shouldShowOutline]
  );
  const settledTodayNewCellIds = useCoalescedValue(todayNewCellIds, 650);
  const todayCellPartition = useMemo(
    () => partitionExplorationCellIdsByCity({
      cellIds: settledTodayNewCellIds,
      cityBoundaries: knownCityZones,
      getCellCenter: explorationCellKeyToCenterCoordinate
    }),
    [knownCityZones, settledTodayNewCellIds]
  );
  const todayNewPolygons = useMemo(
    () =>
      explorationEnabled && shouldShowCompletedArea
        ? measurePerformance(
            "map.today-surface",
            () =>
              buildMergedExplorationPolygons(todayCellPartition.cityCellIds, {
                maxFilledHoleAreaSquareMeters
              }),
            8
          )
        : [],
    [
      explorationEnabled,
      maxFilledHoleAreaSquareMeters,
      shouldShowCompletedArea,
      todayCellPartition.cityCellIds
    ]
  );
  const countrysideTodayNewPolygons = useMemo(
    () =>
      explorationEnabled && shouldShowCompletedArea
        ? measurePerformance(
            "map.countryside-today-surface",
            () =>
              buildMergedExplorationPolygons(todayCellPartition.countrysideCellIds, {
                maxFilledHoleAreaSquareMeters
              }),
            8
          )
        : [],
    [
      explorationEnabled,
      maxFilledHoleAreaSquareMeters,
      shouldShowCompletedArea,
      todayCellPartition.countrysideCellIds
    ]
  );


  useEffect(() => {
    const previousCount = previousExplorationCellCountRef.current;
    previousExplorationCellCountRef.current = renderedExplorationCellCount;

    if (
      reducedMotion ||
      previousCount === null ||
      renderedExplorationCellCount <= previousCount
    ) {
      return;
    }

    setIsInkRevealing(true);
    const revealTimer = setTimeout(() => setIsInkRevealing(false), 520);
    return () => clearTimeout(revealTimer);
  }, [reducedMotion, renderedExplorationCellCount]);
  useEffect(() => {
    if (!isNativeMapReady || !startupCenter) {
      return;
    }

    const previousCenter = initialCenterRef.current;

    if (hasUserMovedMapRef.current) {
      return;
    }

    if (previousCenter) {
      const shouldUpgradeWeakCenter =
        !previousCenter.isReliable &&
        startupCenter.isReliable &&
        startupCenter.timestamp >= previousCenter.timestamp &&
        isSubstantiallyMoreAccurate(previousCenter, startupCenter);

      if (!shouldUpgradeWeakCenter) {
        return;
      }
    }

    const region = {
        latitude: startupCenter.point.latitude,
        longitude: startupCenter.point.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
    };
    // Retain the intended camera immediately: loading the local city may remount
    // the map before its first native region-change callback reaches JavaScript.
    pendingStartupRegionRef.current = region;
    setVisibleRegion(region);
    mapRef.current?.animateToRegion(region, 0);
    initialCenterRef.current = startupCenter;
  }, [isNativeMapReady, startupCenter]);

  useEffect(() => {
    if (isNativeMapReady) onMapReady?.();
  }, [isNativeMapReady, onMapReady]);

  useEffect(() => {
    if (
      !isNativeMapReady ||
      !playerLocation ||
      playerFocusRequestId === handledPlayerFocusRequestId.current
    ) {
      return;
    }

    handledPlayerFocusRequestId.current = playerFocusRequestId;
    pendingStartupRegionRef.current = null;
    hasUserMovedMapRef.current = false;
    pendingPlayerFocusTimestampRef.current = getPointTimestamp(playerLocation);
    mapRef.current?.animateToRegion(
      {
        latitude: playerLocation.latitude,
        longitude: playerLocation.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
      },
      0
    );
  }, [
    isNativeMapReady,
    playerFocusRequestId,
    playerLocation
  ]);

  useEffect(() => {
    const pendingTimestamp = pendingPlayerFocusTimestampRef.current;

    if (
      pendingTimestamp === null ||
      !isNativeMapReady ||
      !playerLocation ||
      getPointTimestamp(playerLocation) <= pendingTimestamp
    ) {
      return;
    }

    pendingPlayerFocusTimestampRef.current = null;

    if (hasUserMovedMapRef.current) {
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: playerLocation.latitude,
        longitude: playerLocation.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
      },
      0
    );
  }, [isNativeMapReady, playerLocation]);

  useEffect(() => {
    if (!highlightedSessionId) {
      return;
    }

    const highlightedWalk = walks.find((walk) => walk.id === highlightedSessionId);

    if (highlightedWalk && highlightedWalk.points.length > 1) {
      pendingStartupRegionRef.current = null;
      pendingPlayerFocusTimestampRef.current = null;
      fitToPoints(highlightedWalk.points, {
        bottom: 230,
        left: 48,
        right: 48,
        top: 190
      });
    }
  }, [highlightedSessionId, walks]);

  useEffect(() => {
    if (!highlightedSessionId) {
      setHighlightedRouteDrawProgress(1);
      return;
    }

    if (highlightedRoutePointCount < 2) {
      setHighlightedRouteDrawProgress(0);
      return;
    }

    if (reducedMotion) {
      setHighlightedRouteDrawProgress(1);
      return;
    }

    const startedAt = Date.now();
    setHighlightedRouteDrawProgress(0);
    const drawTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / 900);
      setHighlightedRouteDrawProgress(progress);

      if (progress >= 1) {
        clearInterval(drawTimer);
        playAtlasSound("ink");
      }
    }, 30);

    return () => clearInterval(drawTimer);
  }, [
    highlightedRoutePointCount,
    highlightedSessionId,
    reducedMotion,
    routeFocusRequestId
  ]);

  useEffect(() => {
    if (!selectedZone || zoneFocusRequestId === handledZoneFocusRequestId.current) {
      return;
    }

    handledZoneFocusRequestId.current = zoneFocusRequestId;
    const coordinates = selectedZone.geometry.flat();

    if (coordinates.length > 1) {
      pendingStartupRegionRef.current = null;
      pendingPlayerFocusTimestampRef.current = null;
      mapRef.current?.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: {
          bottom: 230,
          left: 36,
          right: 36,
          top: 170
        }
      });
    }
  }, [selectedZone, zoneFocusRequestId]);

  useEffect(() => {
    if (!focusedMedal || medalFocusRequestId === 0 || !isNativeMapReady ||
        handledMedalFocusRequestId.current === medalFocusRequestId) {
      return;
    }
    handledMedalFocusRequestId.current = medalFocusRequestId;
    pendingStartupRegionRef.current = null;

    mapRef.current?.animateToRegion(
      {
        latitude: focusedMedal.latitude,
        longitude: focusedMedal.longitude,
        latitudeDelta: 0.007,
        longitudeDelta: 0.007
      },
      450
    );
    pendingPlayerFocusTimestampRef.current = null;
    hasUserMovedMapRef.current = true;
  }, [focusedMedal, isNativeMapReady, medalFocusRequestId]);

  const handleRegionChangeComplete = useCallback((nextRegion: Region) => {
    const pending = pendingStartupRegionRef.current;
    if (pending && (
      Math.abs(nextRegion.latitude - pending.latitude) > pending.latitudeDelta * 0.01 ||
      Math.abs(nextRegion.longitude - pending.longitude) > pending.longitudeDelta * 0.01
    )) return; // Ignore the late callback from the launch fallback camera.
    pendingStartupRegionRef.current = null;
    setVisibleRegion(nextRegion);
    onVisibleRegionChange?.(nextRegion);
  }, [onVisibleRegionChange]);

  const handleMapPan = useCallback(() => {
    pendingStartupRegionRef.current = null;
    pendingPlayerFocusTimestampRef.current = null;
    hasUserMovedMapRef.current = true;
  }, []);

  const handleMapLongPress = useCallback((event: LongPressEvent) => {
    pendingStartupRegionRef.current = null;
    pendingPlayerFocusTimestampRef.current = null;
    hasUserMovedMapRef.current = true;
    onMapLongPress?.(event.nativeEvent.coordinate);
  }, [onMapLongPress]);

  const handleMapPress = useCallback((event: MapPressEvent) => {
    onMapPress?.(event.nativeEvent.coordinate);
  }, [onMapPress]);

  const handleNativeMapReady = useCallback(() => {
    setReadyMapKey(nativeMapKey);
  }, [nativeMapKey]);

  const handleNativeMapLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setLaidOutMapKey(nativeMapKey);
  }, [nativeMapKey]);

  const fitToPoints = (
    points: GpsPoint[],
    edgePadding: { bottom: number; left: number; right: number; top: number }
  ) => {
    mapRef.current?.fitToCoordinates(points.map(pointToCoordinate), {
      animated: true,
      edgePadding
    });
  };

  return (
    <View style={styles.container}>
      <ApplePoiFilteredMapView
        ref={mapRef}
        key={nativeMapKey}
        provider={mapProvider === "google" ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        appleMapsPointsOfInterestFilter={usesAppleMaps ? GAMEPLAY_POI_FILTER : undefined}
        customMapStyle={mapProvider === "google"
          ? isDaylightAppearance(appearanceMode) ? GOOGLE_DAYLIGHT_STYLE : GOOGLE_EXPLORATOR_STYLE
          : undefined}
        mapType={
          usesAppleMaps && !isDaylightAppearance(appearanceMode)
            ? "mutedStandard"
            : "standard"
        }
        userInterfaceStyle={
          usesAppleMaps
            ? isDaylightAppearance(appearanceMode) ? "light" : "dark"
            : undefined
        }
        initialRegion={visibleRegion}
        onPanDrag={handleMapPan}
        onMapReady={handleNativeMapReady}
        onLayout={handleNativeMapLayout}
        onPress={handleMapPress}
        onLongPress={handleMapLongPress}
        onRegionChangeComplete={handleRegionChangeComplete}
        onTouchStart={onMapInteraction}
        pitchEnabled
        rotateEnabled
        scrollEnabled
        zoomTapEnabled
        showsPointsOfInterest={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        zoomEnabled
        followsUserLocation={false}
      >
        <ExplorationSurfaceOverlay
          areaStyle={areaStyle}
          countrysideAreaStyle={countrysideAreaStyle}
          countrysideExplorationPolygons={countrysideExplorationPolygons}
          countrysideOutlineSegments={countrysideExplorationOutlineSegments}
          countrysideTodayPolygons={countrysideTodayNewPolygons}
          explorationPolygons={explorationPolygons}
          isInkRevealing={isInkRevealing}
          outlineSegments={explorationOutlineSegments}
          shouldShowCompletedArea={shouldShowCompletedArea}
          shouldShowOutline={shouldShowOutline}
          todayPolygons={todayNewPolygons}
        />

        <ForbiddenZoneOverlay zones={forbiddenZones} />

        <AdministrativeBoundaryOverlay
          cityZone={cityZone}
          districtZones={districtZones}
          selectedZone={selectedZone}
        />

        {forbiddenZoneLabel ? (
          <ForbiddenZoneMapLabel
            coordinate={forbiddenZoneLabel.coordinate}
            language={language}
            onPress={onForbiddenZoneLabelPress}
            zone={forbiddenZoneLabel.zone}
          />
        ) : null}

        {shouldShowRoutes ? pathWalks.map((walk) => {
          const isHighlighted = highlightedSessionId === walk.id;
          const isDimmed = highlightedSessionId !== null && !isHighlighted;
          const color = isHighlighted
            ? WALKING_COLORS.selectedRoute
            : getPathColor(walk.id);
          const firstPoint = walk.points[0];
          const lastPoint = walk.points.at(-1);

          return (
            <Fragment key={walk.id}>
              <PathSegmentLines
                activityMode={walk.activityMode}
                color={color}
                drawProgress={isHighlighted ? highlightedRouteDrawProgress : 1}
                isDimmed={isDimmed}
                isHighlighted={isHighlighted}
                points={walk.points}
                segments={walk.routeSegments}
                simplificationToleranceMeters={pathSimplificationToleranceMeters}
              />
              {shouldShowMarkers && firstPoint ? (
                <AtlasRouteMarker
                  description={formatMarkerDate(walk.startedAt)}
                  kind="start"
                  point={firstPoint}
                  title="Start"
                />
              ) : null}
              {shouldShowMarkers &&
              lastPoint &&
              (!isHighlighted || highlightedRouteDrawProgress >= 1) ? (
                <AtlasRouteMarker
                  description={formatMarkerDate(walk.endedAt)}
                  kind="end"
                  point={lastPoint}
                  title="End"
                />
              ) : null}
            </Fragment>
          );
        }) : null}

        {activeRouteStartPoint && activeRouteChunks.length > 0 ? (
          <>
            <PathSegmentLines
              activityMode={activeMode}
              color={WALKING_COLORS.activeRoute}
              isDimmed={false}
              isHighlighted
              points={activePoints}
              segments={activeRouteChunks}
              simplificationToleranceMeters={0}
            />
            {shouldShowMarkers ? (
              <AtlasRouteMarker
                kind="start"
                point={activeRouteStartPoint}
                title="Recording start"
              />
            ) : null}
          </>
        ) : null}

        {shouldShowMedalMarkers ? medals.map((medal) => (
          <AtlasMedalMarker
            key={`medal-${medal.albumId}-${medal.id}-${
              medal.isCollected ? "collected" : "locked"
            }`}
            lockedLabel={lockedMedalLabel}
            medal={medal}
            usesGoogleMaps={mapProvider === "google"}
            onMedalPress={onMedalPress}
          />
        )) : null}

        {playerVisible && playerLocation ? (
          <PlayerLocationMarker
            language={language}
            location={playerLocation}
          />
        ) : null}

        {playerVisible && playerLocation ? (
          <PlayerSpeechMarker
            usesAppleMaps={usesAppleMaps}
            gpsAccuracyMeters={gpsAccuracyMeters}
            gpsStatus={gpsStatus}
            isRecording={isRecording}
            language={language}
            location={playerLocation}
            recordingDistanceMeters={recordingDistanceMeters}
            recordingExploredCellCount={recordingExploredCellCount}
            recordingSpeedMetersPerSecond={recordingSpeedMetersPerSecond}
            reducedMotion={reducedMotion}
          />
        ) : null}

      </ApplePoiFilteredMapView>
    </View>
  );
});

const ForbiddenZoneOverlay = memo(function ForbiddenZoneOverlay({
  zones
}: {
  zones: ForbiddenZone[];
}) {
  return (
    <>
      {zones.flatMap((zone) =>
        zone.polygons.map((polygon) => (
          <Polygon
            coordinates={polygon.coordinates}
            fillColor="rgba(126, 58, 176, 0.42)"
            holes={polygon.holes}
            key={`forbidden-zone-${zone.id}-${polygon.id}`}
            pointerEvents="none"
            strokeColor="rgba(77, 31, 116, 0.88)"
            strokeWidth={2}
            tappable={false}
            zIndex={1}
          />
        ))
      )}
    </>
  );
});

const ForbiddenZoneMapLabel = memo(function ForbiddenZoneMapLabel({
  coordinate,
  language,
  onPress,
  zone
}: {
  coordinate: { latitude: number; longitude: number };
  language: AppLanguage;
  onPress?: (zone: ForbiddenZone) => void;
  zone: ForbiddenZone;
}) {
  const visibleComment = zone.comment ?? (
    language === "fr" ? "Ajouter un commentaire" : "Add a comment"
  );

  return (
    <Marker
      accessibilityLabel={visibleComment}
      anchor={{ x: 0.5, y: 1.08 }}
      coordinate={coordinate}
      onPress={(event) => {
        event.stopPropagation();
        onPress?.(zone);
      }}
      tracksViewChanges
      zIndex={900}
    >
      <View collapsable={false} style={styles.forbiddenZoneLabel}>
        <View style={styles.forbiddenZoneLabelRow}>
          <Ionicons color="#ead7f5" name="ban-outline" size={14} />
          <Text numberOfLines={3} style={styles.forbiddenZoneLabelText}>
            {visibleComment}
          </Text>
          <Ionicons color="#d5a5ee" name="pencil" size={13} />
        </View>
        <Text style={styles.forbiddenZoneLabelArea}>
          {formatForbiddenZoneArea(zone.areaM2)}
        </Text>
        <View style={styles.forbiddenZoneLabelPointer} />
      </View>
    </Marker>
  );
});

const AdministrativeBoundaryOverlay = memo(function AdministrativeBoundaryOverlay({
  cityZone,
  districtZones,
  selectedZone
}: {
  cityZone: CachedZone | null;
  districtZones: CachedZone[];
  selectedZone: CachedZone | null;
}) {
  return (
    <>
      {districtZones.flatMap((zone) =>
        zone.geometry.map((ring, index) => {
          const isSelectedDistrict =
            selectedZone?.type === "district" && selectedZone.id === zone.id;

          return (
            <Polygon
              coordinates={ring}
              fillColor={
                isSelectedDistrict
                  ? WALKING_COLORS.selectedZoneFill
                  : "rgba(194, 138, 69, 0)"
              }
              key={`district-${zone.id}-${index}`}
              strokeColor={
                isSelectedDistrict
                  ? WALKING_COLORS.districtBoundary
                  : WALKING_COLORS.districtBoundaryMuted
              }
              strokeWidth={isSelectedDistrict ? 3 : 1.5}
              zIndex={2}
            />
          );
        })
      )}

      {cityZone
        ? cityZone.geometry.map((ring, index) => {
            const isSelectedCity =
              selectedZone?.type === "city" && selectedZone.id === cityZone.id;

            return (
              <Polygon
                coordinates={ring}
                fillColor={
                  isSelectedCity
                    ? WALKING_COLORS.selectedZoneFill
                    : "rgba(141, 82, 104, 0)"
                }
                key={`city-boundary-${cityZone.id}-${index}`}
                strokeColor={
                  isSelectedCity
                    ? WALKING_COLORS.cityBoundary
                    : WALKING_COLORS.cityBoundaryMuted
                }
                strokeWidth={isSelectedCity ? 4 : 3}
                zIndex={2}
              />
            );
          })
        : null}
    </>
  );
});

type AtlasRouteMarkerProps = {
  description?: string;
  kind: "end" | "start";
  point: GpsPoint;
  title: string;
};

const AtlasRouteMarker = memo(function AtlasRouteMarker({
  description,
  kind,
  point,
  title
}: AtlasRouteMarkerProps) {
  const isStart = kind === "start";

  return (
    <Marker
      accessibilityLabel={title}
      anchor={{ x: 0.5, y: 1 }}
      coordinate={pointToCoordinate(point)}
      description={description}
      tracksViewChanges={false}
      title={title}
    >
      <View collapsable={false} pointerEvents="none" style={styles.atlasRouteMarker}>
        <View
          style={[
            styles.atlasRouteMarkerPaper,
            isStart ? styles.atlasRouteMarkerStart : styles.atlasRouteMarkerEnd
          ]}
        >
          <View style={styles.atlasRouteMarkerInset}>
            <Ionicons
              color={APP_COLORS.inkOnGold}
              name={isStart ? "flag-outline" : "checkmark"}
              size={18}
            />
          </View>
        </View>
        <View style={styles.atlasRouteMarkerPoint} />
      </View>
    </Marker>
  );
});

const AtlasMedalMarker = memo(function AtlasMedalMarker({
  lockedLabel,
  medal,
  usesGoogleMaps,
  onMedalPress
}: {
  lockedLabel: string;
  medal: CollectedMedal;
  usesGoogleMaps: boolean;
  onMedalPress?: (medal: CollectedMedal) => void;
}) {
  const markerRef = useRef<ComponentRef<typeof Marker>>(null);
  const [hasLayout, setHasLayout] = useState(false);
  const shouldTrackSnapshot = Platform.OS === "android" || usesGoogleMaps;
  const [tracksSnapshot, setTracksSnapshot] = useState(shouldTrackSnapshot);

  useEffect(() => {
    setTracksSnapshot(shouldTrackSnapshot);
    if (!shouldTrackSnapshot || !hasLayout) return;
    // Google snapshots custom marker children. Freezing before their first
    // layout can preserve an empty bitmap for the marker's entire lifetime.
    const timer = setTimeout(() => {
      markerRef.current?.redraw();
      setTracksSnapshot(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [hasLayout, shouldTrackSnapshot]);

  return (
    <Marker
      ref={markerRef}
      accessibilityLabel={
        medal.name.en + ", " + (medal.isCollected ? "collected" : lockedLabel)
      }
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={{ latitude: medal.latitude, longitude: medal.longitude }}
      description={medal.isCollected ? undefined : lockedLabel}
      onPress={
        medal.isCollected && onMedalPress
          ? () => onMedalPress(medal)
          : undefined
      }
      title={medal.name.en}
      tracksViewChanges={tracksSnapshot}
    >
      <View
        collapsable={false}
        onLayout={() => setHasLayout(true)}
        style={[
          styles.atlasMedalMarker,
          medal.isCollected
            ? styles.atlasMedalMarkerCollected
            : styles.atlasMedalMarkerLocked
        ]}
      >
        <View style={styles.atlasMedalMarkerInner}>
          <Ionicons
            color={medal.isCollected ? APP_COLORS.inkOnGold : APP_COLORS.parchmentMuted}
            name={medal.isCollected ? "ribbon-outline" : "lock-closed-outline"}
            size={18}
          />
        </View>
      </View>
    </Marker>
  );
});

type ExplorationSurfaceOverlayProps = {
  areaStyle: ReturnType<typeof getExploredAreaStyle>;
  countrysideAreaStyle: ReturnType<typeof getCountrysideExploredAreaStyle>;
  countrysideExplorationPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
  countrysideOutlineSegments: ReturnType<typeof buildExplorationPolygonOutlineSegments>;
  countrysideTodayPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
  explorationPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
  isInkRevealing: boolean;
  outlineSegments: ReturnType<typeof buildExplorationPolygonOutlineSegments>;
  shouldShowCompletedArea: boolean;
  shouldShowOutline: boolean;
  todayPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
};

const ExplorationSurfaceOverlay = memo(function ExplorationSurfaceOverlay({
  areaStyle,
  countrysideAreaStyle,
  countrysideExplorationPolygons,
  countrysideOutlineSegments,
  countrysideTodayPolygons,
  explorationPolygons,
  isInkRevealing,
  outlineSegments,
  shouldShowCompletedArea,
  shouldShowOutline,
  todayPolygons
}: ExplorationSurfaceOverlayProps) {
  return (
    <>
      {shouldShowCompletedArea
        ? explorationPolygons.map((polygon) => (
            <Polygon
              key={polygon.id}
              coordinates={polygon.coordinates}
              holes={polygon.holes}
              fillColor={isInkRevealing ? areaStyle.revealFillColor : areaStyle.fillColor}
              strokeColor={isInkRevealing ? areaStyle.revealFillColor : areaStyle.fillColor}
              strokeWidth={1}
            />
          ))
        : null}
      {shouldShowCompletedArea
        ? countrysideExplorationPolygons.map((polygon) => (
            <Polygon
              key={`countryside-${polygon.id}`}
              coordinates={polygon.coordinates}
              holes={polygon.holes}
              fillColor={
                isInkRevealing
                  ? countrysideAreaStyle.revealFillColor
                  : countrysideAreaStyle.fillColor
              }
              strokeColor={
                isInkRevealing
                  ? countrysideAreaStyle.revealFillColor
                  : countrysideAreaStyle.fillColor
              }
              strokeWidth={1}
            />
          ))
        : null}
      {shouldShowCompletedArea
        ? todayPolygons.map((polygon) => (
            <Polygon
              key={`today-${polygon.id}`}
              coordinates={polygon.coordinates}
              holes={polygon.holes}
              fillColor={areaStyle.todayFillColor}
              strokeColor={areaStyle.todayFillColor}
              strokeWidth={1}
            />
          ))
        : null}
      {shouldShowCompletedArea
        ? countrysideTodayPolygons.map((polygon) => (
            <Polygon
              key={`countryside-today-${polygon.id}`}
              coordinates={polygon.coordinates}
              holes={polygon.holes}
              fillColor={countrysideAreaStyle.todayFillColor}
              strokeColor={countrysideAreaStyle.todayFillColor}
              strokeWidth={1}
            />
          ))
        : null}
      {shouldShowOutline
        ? outlineSegments.map((segment) => (
            <Polyline
              coordinates={segment.coordinates}
              key={`outline-${segment.id}`}
              lineCap="round"
              lineJoin="round"
              strokeColor={areaStyle.outlineColor}
              strokeWidth={areaStyle.outlineWidth}
            />
          ))
        : null}
      {shouldShowOutline
        ? countrysideOutlineSegments.map((segment) => (
            <Polyline
              coordinates={segment.coordinates}
              key={`countryside-outline-${segment.id}`}
              lineCap="round"
              lineJoin="round"
              strokeColor={countrysideAreaStyle.outlineColor}
              strokeWidth={countrysideAreaStyle.outlineWidth}
            />
          ))
        : null}
    </>
  );
});

function useCoalescedValue<T>(value: T, intervalMs: number) {
  const [settledValue, setSettledValue] = useState(value);
  const latestValueRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  latestValueRef.current = value;

  useEffect(() => {
    if (Object.is(value, settledValue) || timerRef.current) {
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSettledValue(latestValueRef.current);
    }, intervalMs);
  }, [intervalMs, settledValue, value]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  return settledValue;
}

const PLAYER_MOVING_SPEED_METERS_PER_SECOND = 0.45;
const PLAYER_HEADING_SPEED_METERS_PER_SECOND = 0.35;
const PLAYER_BEARING_MIN_DISTANCE_METERS = 3;
const PLAYER_MOTION_FRESHNESS_MS = 10_000;
const PLAYER_MOVEMENT_SETTLE_MS = 4_000;
const LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS = 5_000;
const PLAYER_WALK_FRAME_INTERVAL_MS = 170;
const PLAYER_SPRITE_HANDOFF_MS = 60;
const PLAYER_SPEECH_IOS_CENTER_OFFSET_Y = -58;

type PlayerDirection = "east" | "north" | "south" | "west";

type PlayerSpriteSet = {
  idle: number;
  stale: number;
  walk: readonly [number, number, number];
};

const PLAYER_DIRECTIONS: readonly PlayerDirection[] = [
  "east",
  "north",
  "south",
  "west"
];

const PLAYER_SPRITES: Record<PlayerDirection, PlayerSpriteSet> = {
  east: {
    idle: require("../../assets/player/native-idle-east.png"),
    stale: require("../../assets/player/native-stale-east.png"),
    walk: [
      require("../../assets/player/native-walk-east-1.png"),
      require("../../assets/player/native-walk-east-2.png"),
      require("../../assets/player/native-walk-east-3.png")
    ]
  },
  north: {
    idle: require("../../assets/player/native-idle-north.png"),
    stale: require("../../assets/player/native-stale-north.png"),
    walk: [
      require("../../assets/player/native-walk-north-1.png"),
      require("../../assets/player/native-walk-north-2.png"),
      require("../../assets/player/native-walk-north-3.png")
    ]
  },
  south: {
    idle: require("../../assets/player/native-idle-south.png"),
    stale: require("../../assets/player/native-stale-south.png"),
    walk: [
      require("../../assets/player/native-walk-south-1.png"),
      require("../../assets/player/native-walk-south-2.png"),
      require("../../assets/player/native-walk-south-3.png")
    ]
  },
  west: {
    idle: require("../../assets/player/native-idle-west.png"),
    stale: require("../../assets/player/native-stale-west.png"),
    walk: [
      require("../../assets/player/native-walk-west-1.png"),
      require("../../assets/player/native-walk-west-2.png"),
      require("../../assets/player/native-walk-west-3.png")
    ]
  }
};

const PLAYER_SPRITE_LAYERS = PLAYER_DIRECTIONS.flatMap((direction) => {
  const spriteSet = PLAYER_SPRITES[direction];

  return [
    { key: `${direction}-idle`, source: spriteSet.idle },
    { key: `${direction}-stale`, source: spriteSet.stale },
    ...spriteSet.walk.map((source, frameIndex) => ({
      key: `${direction}-walk-${frameIndex}`,
      source
    }))
  ];
});

type PlayerSpeechRequest = {
  behavior: PlayerSpeechBehavior;
  id: number;
  priority: number;
  text: string;
};

const PLAYER_SPEECH_PRIORITIES: Record<PlayerSpeechBehavior, number> = {
  cheer: 10,
  distanceMilestone: 80,
  explorationStreak: 85,
  newArea: 70,
  poorGps: 90,
  revisit: 55,
  standingStill: 60,
  walkStarted: 100,
  walkStopped: 100
};

const PlayerLocationMarker = memo(function PlayerLocationMarker({
  language,
  location
}: {
  language: AppLanguage;
  location: GpsPoint;
}) {
  const movementAnchorRef = useRef(location);
  const [movement, setMovement] = useState<RecentMovement | null>(null);
  const [isGpsFresh, setIsGpsFresh] = useState(() =>
    isPlayerMotionPointFresh(location)
  );
  const [direction, setDirection] = useState<PlayerDirection>(() =>
    getPlayerDirection(getPlayerHeading(location, movement))
  );
  const [walkFrameIndex, setWalkFrameIndex] = useState(0);
  const liveSpeed =
    typeof location.speedMetersPerSecond === "number" &&
    Number.isFinite(location.speedMetersPerSecond)
      ? Math.max(0, location.speedMetersPerSecond)
      : 0;
  const hasReliableMotionFix =
    isGpsFresh &&
    (location.accuracy === null ||
      (Number.isFinite(location.accuracy) &&
        location.accuracy <=
          MODE_LOCATION_CONFIG.walk.maxAcceptedAccuracyMeters));
  const isMoving =
    hasReliableMotionFix &&
    Math.max(liveSpeed, movement?.speedMetersPerSecond ?? 0) >=
      PLAYER_MOVING_SPEED_METERS_PER_SECOND;
  const heading = getPlayerHeading(location, movement);
  const targetSpriteSource = !isGpsFresh
    ? PLAYER_SPRITES[direction].stale
    : isMoving
    ? PLAYER_SPRITES[direction].walk[walkFrameIndex] ?? PLAYER_SPRITES[direction].idle
    : PLAYER_SPRITES[direction].idle;
  const [visibleSpriteSources, setVisibleSpriteSources] = useState<readonly number[]>(
    () => [targetSpriteSource]
  );

  useEffect(() => {
    const anchor = movementAnchorRef.current;
    const nextMovement = getMovementBetween(anchor, location);

    if (nextMovement) {
      movementAnchorRef.current = location;
      setMovement(nextMovement);
      return;
    }

    if (getPointTimestamp(location) - getPointTimestamp(anchor) >= PLAYER_MOVEMENT_SETTLE_MS) {
      movementAnchorRef.current = location;
      setMovement(null);
    }
  }, [location]);

  useEffect(() => {
    const timestamp = getPointTimestamp(location);
    const now = Date.now();
    const expiresIn = timestamp + PLAYER_MOTION_FRESHNESS_MS - now;
    const isFresh =
      Number.isFinite(timestamp) &&
      timestamp <= now + LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS &&
      expiresIn > 0;

    if (!isFresh) {
      setIsGpsFresh(false);
      return;
    }

    setIsGpsFresh(true);
    const freshnessTimer = setTimeout(
      () => setIsGpsFresh(false),
      expiresIn + 25
    );

    return () => clearTimeout(freshnessTimer);
  }, [location]);

  useEffect(() => {
    if (heading !== null) {
      setDirection(getPlayerDirection(heading));
    }
  }, [heading]);

  useEffect(() => {
    if (!isMoving) {
      setWalkFrameIndex(0);
      return;
    }

    const frameTimer = setInterval(() => {
      setWalkFrameIndex((frameIndex) => (frameIndex + 1) % 3);
    }, PLAYER_WALK_FRAME_INTERVAL_MS);

    return () => clearInterval(frameTimer);
  }, [isMoving]);

  useEffect(() => {
    setVisibleSpriteSources((sources) =>
      sources.includes(targetSpriteSource)
        ? sources
        : [...sources, targetSpriteSource]
    );

    const handoffTimer = setTimeout(() => {
      setVisibleSpriteSources([targetSpriteSource]);
    }, PLAYER_SPRITE_HANDOFF_MS);

    return () => clearTimeout(handoffTimer);
  }, [targetSpriteSource]);

  const accessibilityLabel = isGpsFresh
    ? language === "fr" ? "Position actuelle du joueur" : "Current player location"
    : language === "fr"
    ? "Dernière position connue du joueur, signal GPS obsolète"
    : "Last known player location, GPS signal stale";

  return (
    <Marker
      accessibilityLabel={accessibilityLabel}
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={pointToCoordinate(location)}
      identifier="street-explorer-player"
      tracksViewChanges
      zIndex={1000}
    >
      <View collapsable={false} pointerEvents="none" style={styles.playerMarker}>
        <View
          style={[
            styles.playerCompassHalo,
            !isGpsFresh ? styles.playerCompassHaloStale : null
          ]}
        />
        {PLAYER_SPRITE_LAYERS.map((frame) => (
          <Image
            accessibilityIgnoresInvertColors
            fadeDuration={0}
            key={frame.key}
            resizeMode="contain"
            source={frame.source}
            style={[
              styles.playerSpriteImage,
              { opacity: visibleSpriteSources.includes(frame.source) ? 1 : 0 }
            ]}
          />
        ))}
      </View>
    </Marker>
  );
});

const PlayerSpeechMarker = memo(function PlayerSpeechMarker({
  usesAppleMaps,
  gpsAccuracyMeters,
  gpsStatus,
  isRecording,
  language,
  location,
  recordingDistanceMeters,
  recordingExploredCellCount,
  recordingSpeedMetersPerSecond,
  reducedMotion
}: {
  usesAppleMaps: boolean;
  gpsAccuracyMeters: number | null;
  gpsStatus: string | null;
  isRecording: boolean;
  language: AppLanguage;
  location: GpsPoint;
  recordingDistanceMeters: number;
  recordingExploredCellCount: number;
  recordingSpeedMetersPerSecond: number;
  reducedMotion: boolean;
}) {
  const [activeSpeech, setActiveSpeech] = useState<PlayerSpeechRequest | null>(null);
  const [isSpeechVisible, setIsSpeechVisible] = useState(false);
  const [typedSpeech, setTypedSpeech] = useState("");
  const activeSpeechRef = useRef<PlayerSpeechRequest | null>(null);
  const pendingSpeechRef = useRef<PlayerSpeechRequest | null>(null);
  const nextSpeechIdRef = useRef(1);
  const previousRecordingRef = useRef(false);
  const previousExploredCellCountRef = useRef(recordingExploredCellCount);
  const lastDistanceMilestoneRef = useRef(0);
  const lastNewAreaCellMilestoneRef = useRef(0);
  const lastNewAreaDistanceRef = useRef(recordingDistanceMeters);
  const revisitMilestoneRef = useRef(0);
  const recentExplorationRef = useRef<Array<{ at: number; count: number }>>([]);
  const lastStreakSpeechAtRef = useRef(0);
  const lastMovementAtRef = useRef(Date.now());
  const hasStandingSpeechRef = useRef(false);
  const hasPoorGpsSpeechRef = useRef(false);

  const enqueueSpeech = useCallback((
    behavior: PlayerSpeechBehavior,
    options: { distanceMeters?: number } = {}
  ) => {
    const request: PlayerSpeechRequest = {
      behavior,
      id: nextSpeechIdRef.current,
      priority: PLAYER_SPEECH_PRIORITIES[behavior],
      text: createPlayerSpeechMessage(behavior, language, options)
    };
    nextSpeechIdRef.current += 1;

    if (!activeSpeechRef.current) {
      activeSpeechRef.current = request;
      setActiveSpeech(request);
      return;
    }

    if (
      activeSpeechRef.current.behavior === behavior ||
      pendingSpeechRef.current?.behavior === behavior
    ) {
      return;
    }

    if (
      !pendingSpeechRef.current ||
      request.priority > pendingSpeechRef.current.priority
    ) {
      pendingSpeechRef.current = request;
    }
  }, [language]);

  useEffect(() => {
    if (!activeSpeech) {
      return;
    }

    let characterTimer: ReturnType<typeof setInterval> | null = null;
    let completionTimer: ReturnType<typeof setTimeout> | null = null;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    setIsSpeechVisible(true);

    const finishSpeech = () => {
      setIsSpeechVisible(false);
      setTypedSpeech("");
      advanceTimer = setTimeout(() => {
        const nextSpeech = pendingSpeechRef.current;
        pendingSpeechRef.current = null;
        activeSpeechRef.current = nextSpeech;
        setActiveSpeech(nextSpeech);
      }, 360);
    };

    if (reducedMotion) {
      setTypedSpeech(activeSpeech.text);
      completionTimer = setTimeout(
        finishSpeech,
        PLAYER_SPEECH_CONFIG.visiblePauseMs
      );
    } else {
      const typingStartedAt = Date.now();
      setTypedSpeech("");
      characterTimer = setInterval(() => {
        const characterCount = getPlayerSpeechCharacterCount(
          Date.now() - typingStartedAt,
          activeSpeech.text.length
        );
        setTypedSpeech(activeSpeech.text.slice(0, characterCount));

        if (characterCount >= activeSpeech.text.length && characterTimer) {
          clearInterval(characterTimer);
          characterTimer = null;
          completionTimer = setTimeout(
            finishSpeech,
            PLAYER_SPEECH_CONFIG.visiblePauseMs
          );
        }
      }, PLAYER_SPEECH_CONFIG.typewriterIntervalMs);
    }

    return () => {
      if (characterTimer) clearInterval(characterTimer);
      if (completionTimer) clearTimeout(completionTimer);
      if (advanceTimer) clearTimeout(advanceTimer);
    };
  }, [activeSpeech?.id, reducedMotion]);

  useEffect(() => {
    const wasRecording = previousRecordingRef.current;
    previousRecordingRef.current = isRecording;

    if (isRecording && !wasRecording) {
      const now = Date.now();
      lastDistanceMilestoneRef.current = Math.floor(
        recordingDistanceMeters / PLAYER_SPEECH_CONFIG.distanceMilestoneMeters
      );
      lastNewAreaCellMilestoneRef.current = Math.floor(
        recordingExploredCellCount / PLAYER_SPEECH_CONFIG.newAreaCellInterval
      );
      previousExploredCellCountRef.current = recordingExploredCellCount;
      lastNewAreaDistanceRef.current = recordingDistanceMeters;
      revisitMilestoneRef.current = 0;
      recentExplorationRef.current = [];
      lastMovementAtRef.current = now;
      hasStandingSpeechRef.current = false;
      hasPoorGpsSpeechRef.current = false;
      enqueueSpeech("walkStarted");
    } else if (!isRecording && wasRecording) {
      enqueueSpeech("walkStopped");
    }
  }, [
    enqueueSpeech,
    isRecording,
    recordingDistanceMeters,
    recordingExploredCellCount
  ]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const milestone = Math.floor(
      recordingDistanceMeters / PLAYER_SPEECH_CONFIG.distanceMilestoneMeters
    );

    if (milestone > lastDistanceMilestoneRef.current) {
      lastDistanceMilestoneRef.current = milestone;
      enqueueSpeech("distanceMilestone", {
        distanceMeters: milestone * PLAYER_SPEECH_CONFIG.distanceMilestoneMeters
      });
    }
  }, [enqueueSpeech, isRecording, recordingDistanceMeters]);

  useEffect(() => {
    if (!isRecording) {
      previousExploredCellCountRef.current = recordingExploredCellCount;
      return;
    }

    const previousCount = previousExploredCellCountRef.current;
    previousExploredCellCountRef.current = recordingExploredCellCount;
    const addedCellCount = Math.max(0, recordingExploredCellCount - previousCount);

    if (addedCellCount <= 0) {
      return;
    }

    const now = Date.now();
    lastNewAreaDistanceRef.current = recordingDistanceMeters;
    revisitMilestoneRef.current = 0;
    recentExplorationRef.current = [
      ...recentExplorationRef.current,
      { at: now, count: addedCellCount }
    ].filter(({ at }) => now - at <= PLAYER_SPEECH_CONFIG.streakWindowMs);

    const recentCellCount = recentExplorationRef.current.reduce(
      (sum, item) => sum + item.count,
      0
    );
    const cellMilestone = Math.floor(
      recordingExploredCellCount / PLAYER_SPEECH_CONFIG.newAreaCellInterval
    );

    if (
      recentCellCount >= PLAYER_SPEECH_CONFIG.streakCellCount &&
      now - lastStreakSpeechAtRef.current >= PLAYER_SPEECH_CONFIG.streakWindowMs
    ) {
      lastStreakSpeechAtRef.current = now;
      recentExplorationRef.current = [];
      lastNewAreaCellMilestoneRef.current = cellMilestone;
      enqueueSpeech("explorationStreak");
    } else if (cellMilestone > lastNewAreaCellMilestoneRef.current) {
      lastNewAreaCellMilestoneRef.current = cellMilestone;
      enqueueSpeech("newArea");
    }
  }, [
    enqueueSpeech,
    isRecording,
    recordingDistanceMeters,
    recordingExploredCellCount
  ]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const revisitMilestone = Math.floor(
      (recordingDistanceMeters - lastNewAreaDistanceRef.current) /
        PLAYER_SPEECH_CONFIG.revisitDistanceMeters
    );

    if (revisitMilestone > revisitMilestoneRef.current) {
      revisitMilestoneRef.current = revisitMilestone;
      enqueueSpeech("revisit");
    }
  }, [enqueueSpeech, isRecording, recordingDistanceMeters]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    if (recordingSpeedMetersPerSecond >= PLAYER_MOVING_SPEED_METERS_PER_SECOND) {
      lastMovementAtRef.current = Date.now();
      hasStandingSpeechRef.current = false;
    }
  }, [isRecording, recordingSpeedMetersPerSecond]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const standingTimer = setInterval(() => {
      if (
        !hasStandingSpeechRef.current &&
        Date.now() - lastMovementAtRef.current >=
          PLAYER_SPEECH_CONFIG.standingStillDelayMs
      ) {
        hasStandingSpeechRef.current = true;
        enqueueSpeech("standingStill");
      }
    }, 1_000);

    return () => clearInterval(standingTimer);
  }, [enqueueSpeech, isRecording]);

  useEffect(() => {
    const hasPoorGps = isRecording && (
      Boolean(gpsStatus) ||
      (gpsAccuracyMeters !== null &&
        gpsAccuracyMeters > PLAYER_SPEECH_CONFIG.poorGpsAccuracyMeters)
    );

    if (hasPoorGps && !hasPoorGpsSpeechRef.current) {
      hasPoorGpsSpeechRef.current = true;
      enqueueSpeech("poorGps");
    } else if (!hasPoorGps) {
      hasPoorGpsSpeechRef.current = false;
    }
  }, [enqueueSpeech, gpsAccuracyMeters, gpsStatus, isRecording]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    let cheerTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleCheer = () => {
      const delayRange =
        PLAYER_SPEECH_CONFIG.cheerMaximumDelayMs -
        PLAYER_SPEECH_CONFIG.cheerMinimumDelayMs;
      cheerTimer = setTimeout(() => {
        enqueueSpeech("cheer");
        scheduleCheer();
      }, PLAYER_SPEECH_CONFIG.cheerMinimumDelayMs + Math.random() * delayRange);
    };
    scheduleCheer();

    return () => {
      if (cheerTimer) clearTimeout(cheerTimer);
    };
  }, [enqueueSpeech, isRecording]);

  return (
    <Marker
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={
        usesAppleMaps
          ? { x: 0, y: PLAYER_SPEECH_IOS_CENTER_OFFSET_Y }
          : undefined
      }
      coordinate={pointToCoordinate(location)}
      identifier="street-explorer-player-speech"
      tappable={false}
      tracksViewChanges
      zIndex={1001}
    >
      <View
        accessibilityElementsHidden={!isSpeechVisible}
        accessibilityLabel={activeSpeech?.text}
        accessible={isSpeechVisible}
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.playerSpeechMarker,
          !isSpeechVisible ? styles.playerSpeechMarkerHidden : null
        ]}
      >
        <View style={styles.playerSpeechBubble}>
          <Text style={styles.playerSpeechText}>{typedSpeech || " "}</Text>
        </View>
        <View style={styles.playerSpeechArrow} />
      </View>
    </Marker>
  );
});

type RecentMovement = {
  bearingDegrees: number;
  speedMetersPerSecond: number;
};

function getMovementBetween(
  from: GpsPoint | null,
  to: GpsPoint
): RecentMovement | null {
  if (!from || getPointTimestamp(from) === getPointTimestamp(to)) {
    return null;
  }

  const distanceMeters = haversineDistanceMeters(from, to);
  const seconds = (getPointTimestamp(to) - getPointTimestamp(from)) / 1000;

  if (
    distanceMeters < PLAYER_BEARING_MIN_DISTANCE_METERS ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }

  return {
    bearingDegrees: calculateBearingDegrees(from, to),
    speedMetersPerSecond: distanceMeters / seconds
  };
}

function getPlayerDirection(heading: number | null): PlayerDirection {
  if (heading === null) {
    return "south";
  }

  const normalizedHeading = normalizeHeading(heading);

  if (normalizedHeading >= 45 && normalizedHeading < 135) {
    return "east";
  }

  if (normalizedHeading >= 135 && normalizedHeading < 225) {
    return "south";
  }

  if (normalizedHeading >= 225 && normalizedHeading < 315) {
    return "west";
  }

  return "north";
}

function getPlayerHeading(
  liveLocation: GpsPoint,
  movement: RecentMovement | null
) {
  const liveHeading = liveLocation.heading;
  const effectiveSpeed = Math.max(
    liveLocation.speedMetersPerSecond ?? 0,
    movement?.speedMetersPerSecond ?? 0
  );
  const hasReliableLiveHeading =
    typeof liveHeading === "number" &&
    Number.isFinite(liveHeading) &&
    liveHeading >= 0 &&
    effectiveSpeed >= PLAYER_HEADING_SPEED_METERS_PER_SECOND &&
    (liveLocation.accuracy === null || liveLocation.accuracy <= 80);

  if (hasReliableLiveHeading) {
    return normalizeHeading(liveHeading);
  }

  return movement?.bearingDegrees ?? null;
}

function calculateBearingDegrees(from: GpsPoint, to: GpsPoint) {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);

  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

function normalizeHeading(heading: number) {
  return ((heading % 360) + 360) % 360;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

const FAR_EXPLORED_AREA_STYLE = {
  fillColor: "rgba(229, 122, 50, 0.54)",
  outlineColor: "rgba(3, 35, 38, 0.48)",
  outlineWidth: 1,
  revealFillColor: "rgba(253, 186, 116, 0.70)",
  todayFillColor: "rgba(245, 196, 81, 0.42)"
};
const MEDIUM_FAR_EXPLORED_AREA_STYLE = {
  fillColor: "rgba(229, 122, 50, 0.48)",
  outlineColor: "rgba(3, 30, 34, 0.64)",
  outlineWidth: 1.5,
  revealFillColor: "rgba(253, 186, 116, 0.66)",
  todayFillColor: "rgba(245, 196, 81, 0.46)"
};
const MEDIUM_CLOSE_EXPLORED_AREA_STYLE = {
  fillColor: "rgba(229, 122, 50, 0.42)",
  outlineColor: "rgba(2, 25, 29, 0.80)",
  outlineWidth: 2.4,
  revealFillColor: "rgba(253, 186, 116, 0.62)",
  todayFillColor: "rgba(245, 196, 81, 0.52)"
};
const CLOSE_EXPLORED_AREA_STYLE = {
  fillColor: "rgba(229, 122, 50, 0.36)",
  outlineColor: "rgba(1, 19, 23, 0.94)",
  outlineWidth: 3.5,
  revealFillColor: "rgba(253, 186, 116, 0.58)",
  todayFillColor: "rgba(245, 196, 81, 0.58)"
};

const FAR_COUNTRYSIDE_AREA_STYLE = {
  fillColor: "rgba(244, 224, 138, 0.60)",
  outlineColor: "rgba(127, 99, 37, 0.52)",
  outlineWidth: 1,
  revealFillColor: "rgba(255, 242, 181, 0.78)",
  todayFillColor: "rgba(255, 231, 122, 0.68)"
};
const MEDIUM_FAR_COUNTRYSIDE_AREA_STYLE = {
  fillColor: "rgba(244, 224, 138, 0.54)",
  outlineColor: "rgba(127, 99, 37, 0.64)",
  outlineWidth: 1.5,
  revealFillColor: "rgba(255, 242, 181, 0.74)",
  todayFillColor: "rgba(255, 231, 122, 0.64)"
};
const MEDIUM_CLOSE_COUNTRYSIDE_AREA_STYLE = {
  fillColor: "rgba(244, 224, 138, 0.48)",
  outlineColor: "rgba(106, 81, 27, 0.76)",
  outlineWidth: 2.4,
  revealFillColor: "rgba(255, 242, 181, 0.70)",
  todayFillColor: "rgba(255, 231, 122, 0.60)"
};
const CLOSE_COUNTRYSIDE_AREA_STYLE = {
  fillColor: "rgba(244, 224, 138, 0.42)",
  outlineColor: "rgba(85, 64, 20, 0.88)",
  outlineWidth: 3.5,
  revealFillColor: "rgba(255, 242, 181, 0.66)",
  todayFillColor: "rgba(255, 231, 122, 0.56)"
};

function getExploredAreaStyle(latitudeDelta: number) {
  if (latitudeDelta > 0.07) {
    return FAR_EXPLORED_AREA_STYLE;
  }

  if (latitudeDelta > 0.035) {
    return MEDIUM_FAR_EXPLORED_AREA_STYLE;
  }

  if (latitudeDelta > 0.014) {
    return MEDIUM_CLOSE_EXPLORED_AREA_STYLE;
  }

  return CLOSE_EXPLORED_AREA_STYLE;
}

function getCountrysideExploredAreaStyle(latitudeDelta: number) {
  if (latitudeDelta > 0.07) {
    return FAR_COUNTRYSIDE_AREA_STYLE;
  }

  if (latitudeDelta > 0.035) {
    return MEDIUM_FAR_COUNTRYSIDE_AREA_STYLE;
  }

  if (latitudeDelta > 0.015) {
    return MEDIUM_CLOSE_COUNTRYSIDE_AREA_STYLE;
  }

  return CLOSE_COUNTRYSIDE_AREA_STYLE;
}

function getMapRenderLevel(latitudeDelta: number): "close" | "far" | "medium" {
  if (latitudeDelta > 0.07) {
    return "far";
  }

  if (latitudeDelta > 0.018) {
    return "medium";
  }

  return "close";
}

const PathSegmentLines = memo(function PathSegmentLines({
  activityMode,
  color,
  drawProgress = 1,
  isDimmed,
  isHighlighted,
  points,
  segments,
  simplificationToleranceMeters
}: {
  activityMode: ActivityMode;
  color: string;
  drawProgress?: number;
  isDimmed: boolean;
  isHighlighted: boolean;
  points: GpsPoint[];
  segments?: readonly (LiveRouteChunk | RenderedRouteSegment)[] | null;
  simplificationToleranceMeters: number;
}) {
  const renderedSegments = useMemo(
    () =>
      coalesceRouteSegmentsForRender(
        segments ?? buildPathSegments(points, activityMode)
      ),
    [activityMode, points, segments]
  );

  const visibleSegments = useMemo(() => {
    const clampedProgress = Math.max(0, Math.min(1, drawProgress));

    if (clampedProgress >= 1) {
      return renderedSegments.map((segment) => ({
        points: segment.points,
        segment
      }));
    }

    const totalEdges = renderedSegments.reduce(
      (sum, segment) => sum + Math.max(0, segment.points.length - 1),
      0
    );
    let remainingEdges = Math.floor(totalEdges * clampedProgress);

    return renderedSegments.flatMap((segment) => {
      const edgeCount = Math.max(0, segment.points.length - 1);

      if (remainingEdges <= 0 || edgeCount === 0) {
        return [];
      }

      const visibleEdgeCount = Math.min(edgeCount, remainingEdges);
      remainingEdges -= visibleEdgeCount;

      return [{
        points: segment.points.slice(0, visibleEdgeCount + 1),
        segment
      }];
    });
  }, [drawProgress, renderedSegments]);

  return (
    <>
      {visibleSegments.map(({ points: visiblePoints, segment }, index) => {
        return (
          <RoutePolyline
            color={color}
            isDimmed={isDimmed}
            isHighlighted={isHighlighted}
            isInferred={segment.type === "inferred"}
            key={
              "id" in segment
                ? segment.id
                : `${segment.type}-${index}-${segment.points[0]?.timestamp ?? "route"}`
            }
            points={visiblePoints}
            simplificationToleranceMeters={simplificationToleranceMeters}
          />
        );
      })}
    </>
  );
});

const RoutePolyline = memo(function RoutePolyline({
  color,
  isDimmed,
  isHighlighted,
  isInferred,
  points,
  simplificationToleranceMeters
}: {
  color: string;
  isDimmed: boolean;
  isHighlighted: boolean;
  isInferred: boolean;
  points: GpsPoint[];
  simplificationToleranceMeters: number;
}) {
  const coordinates = useMemo(
    () => simplifyGpsPointsForRender(
      points,
      simplificationToleranceMeters
    ).map(pointToCoordinate),
    [points, simplificationToleranceMeters]
  );

  if (coordinates.length < 2) {
    return null;
  }

  return (
    <Polyline
      coordinates={coordinates}
      lineCap="round"
      lineDashPattern={undefined}
      lineJoin="round"
      strokeColor={getSegmentStrokeColor({ color, isDimmed, isInferred })}
      strokeWidth={isHighlighted ? 8 : 5}
      zIndex={3}
    />
  );
});

type RouteLineSegment = LiveRouteChunk | PathSegment | RenderedRouteSegment;
type DrawableRouteLineSegment =
  | Exclude<PathSegment, { type: "rejected" }>
  | LiveRouteChunk
  | RenderedRouteSegment;

const ROUTE_RENDER_MAX_VERTICES = 256;

function coalesceRouteSegmentsForRender(
  segments: readonly RouteLineSegment[]
): readonly DrawableRouteLineSegment[] {
  if (
    segments.every((segment) => "id" in segment)
  ) {
    return segments as readonly LiveRouteChunk[];
  }

  const result: DrawableRouteLineSegment[] = [];
  let mergeableIndex: number | null = null;

  for (const segment of segments) {
    if (segment.type === "rejected") {
      mergeableIndex = null;
      continue;
    }

    for (const piece of splitRouteSegmentForRender(segment)) {
      const tail =
        mergeableIndex === null ? null : result[mergeableIndex] ?? null;
      const tailEnd = tail?.points.at(-1);
      const pieceStart = piece.points[0];
      const canMerge =
        tail &&
        tail.type === "confirmed" &&
        piece.type === "confirmed" &&
        tailEnd &&
        pieceStart &&
        areSameRenderedPoint(tailEnd, pieceStart) &&
        tail.points.length + piece.points.length - 1 <=
          ROUTE_RENDER_MAX_VERTICES;

      if (canMerge && mergeableIndex !== null && tail) {
        result[mergeableIndex] = {
          ...tail,
          points: [...tail.points, ...piece.points.slice(1)]
        };
        continue;
      }

      result.push(piece);
      mergeableIndex = result.length - 1;
    }
  }

  return result;
}

function splitRouteSegmentForRender(
  segment: Exclude<PathSegment, { type: "rejected" }> | RenderedRouteSegment
): DrawableRouteLineSegment[] {
  if (segment.points.length <= ROUTE_RENDER_MAX_VERTICES) {
    return [segment];
  }

  const pieces: DrawableRouteLineSegment[] = [];

  for (
    let startIndex = 0;
    startIndex < segment.points.length - 1;
    startIndex += ROUTE_RENDER_MAX_VERTICES - 1
  ) {
    pieces.push({
      ...segment,
      points: segment.points.slice(
        startIndex,
        startIndex + ROUTE_RENDER_MAX_VERTICES
      )
    });
  }

  return pieces;
}

function areSameRenderedPoint(left: GpsPoint, right: GpsPoint) {
  return (
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.timestamp === right.timestamp
  );
}

function getSegmentStrokeColor({
  color,
  isDimmed,
  isInferred
}: {
  color: string;
  isDimmed: boolean;
  isInferred: boolean;
}) {
  if (isInferred) {
    return WALKING_COLORS.inferredRoute;
  }

  return isDimmed ? WALKING_COLORS.dimmedRoute : color;
}

const STARTUP_CENTER_MAX_AGE_MS = 30_000;
const STARTUP_CENTER_LOCK_ACCURACY_METERS = 20;
const STARTUP_CENTER_MIN_ACCURACY_IMPROVEMENT_METERS = 10;
const STARTUP_CENTER_MIN_ACCURACY_IMPROVEMENT_RATIO = 0.25;

type InitialMapCenter = {
  accuracyMeters: number | null;
  isReliable: boolean;
  point: GpsPoint;
  timestamp: number;
};

function getStartupCenterCandidate(
  activeMode: ActivityMode,
  activeRouteEndPoint: GpsPoint | null,
  playerLocation: GpsPoint | null
): InitialMapCenter | null {
  if (!playerLocation || !hasPlausibleMapCoordinates(playerLocation)) {
    return null;
  }

  const timestamp = getPointTimestamp(playerLocation);
  const isAcceptedRoutePoint = activeRouteEndPoint === playerLocation;
  const ageMs = Math.abs(Date.now() - timestamp);
  const accuracyMeters = getPlausibleAccuracyMeters(playerLocation);

  if (
    !Number.isFinite(timestamp) ||
    (!isAcceptedRoutePoint && ageMs > STARTUP_CENTER_MAX_AGE_MS) ||
    (!isAcceptedRoutePoint &&
      playerLocation.accuracy !== null &&
      accuracyMeters === null)
  ) {
    return null;
  }

  return {
    accuracyMeters,
    isReliable:
      isAcceptedRoutePoint ||
      (accuracyMeters !== null &&
        accuracyMeters <=
          Math.min(
            STARTUP_CENTER_LOCK_ACCURACY_METERS,
            MODE_LOCATION_CONFIG[activeMode].maxAcceptedAccuracyMeters
          )),
    point: playerLocation,
    timestamp
  };
}

function hasPlausibleMapCoordinates(point: GpsPoint) {
  return (
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function getPlausibleAccuracyMeters(point: GpsPoint) {
  if (point.accuracy === null) {
    return null;
  }

  return Number.isFinite(point.accuracy) &&
    point.accuracy >= 0 &&
    point.accuracy <= LOCATION_CONFIG.maxAcceptedAccuracyMeters
    ? point.accuracy
    : null;
}

function isSubstantiallyMoreAccurate(
  previousCenter: InitialMapCenter,
  nextCenter: InitialMapCenter
) {
  if (nextCenter.accuracyMeters === null) {
    return false;
  }

  if (previousCenter.accuracyMeters === null) {
    return (
      nextCenter.accuracyMeters <= STARTUP_CENTER_LOCK_ACCURACY_METERS
    );
  }

  const requiredImprovement = Math.max(
    STARTUP_CENTER_MIN_ACCURACY_IMPROVEMENT_METERS,
    previousCenter.accuracyMeters *
      STARTUP_CENTER_MIN_ACCURACY_IMPROVEMENT_RATIO
  );

  return (
    previousCenter.accuracyMeters - nextCenter.accuracyMeters >=
    requiredImprovement
  );
}

function getPointTimestamp(point: GpsPoint) {
  const timestamp = new Date(point.timestamp).getTime();

  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function isPlayerMotionPointFresh(point: GpsPoint) {
  const timestamp = getPointTimestamp(point);
  const now = Date.now();

  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS &&
    now - timestamp <= PLAYER_MOTION_FRESHNESS_MS
  );
}

function shouldAdoptPlayerLocation(
  current: GpsPoint | null,
  candidate: GpsPoint,
  isAcceptedRoutePoint: boolean,
  activeMode: ActivityMode
) {
  if (!hasPlausibleMapCoordinates(candidate)) {
    return false;
  }

  if (!current) {
    return true;
  }

  const candidateTimestamp = getPointTimestamp(candidate);

  if (candidateTimestamp < getPointTimestamp(current)) {
    return false;
  }

  if (isAcceptedRoutePoint) {
    return true;
  }

  const accuracyMeters = getPlausibleAccuracyMeters(candidate);

  return (
    accuracyMeters !== null &&
    accuracyMeters <= MODE_LOCATION_CONFIG[activeMode].maxAcceptedAccuracyMeters
  );
}

function getInitialRegion(
  playerLocation: GpsPoint | null,
  walks: WalkWithPoints[]
): Region {
  const savedRoutePoint =
    walks.find((walk) => walk.points.length > 0)?.points.at(-1) ?? null;
  const center = playerLocation ?? savedRoutePoint;

  return {
    latitude: center?.latitude ?? MAP_CONFIG.defaultLatitude,
    longitude: center?.longitude ?? MAP_CONFIG.defaultLongitude,
    latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
    longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
  };
}

function pointToCoordinate(point: GpsPoint) {
  return {
    latitude: point.latitude,
    longitude: point.longitude
  };
}

function getPathColor(sessionId: number) {
  return WALKING_COLORS.savedRoutes[sessionId % WALKING_COLORS.savedRoutes.length]
    ?? WALKING_COLORS.savedRoutes[0];
}

function formatMarkerDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

const styles = createAppearanceStyles({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  map: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  atlasMedalMarker: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 2,
    height: 40,
    justifyContent: "center",
    shadowColor: "#02060a",
    shadowOffset: { height: 3, width: 1 },
    shadowOpacity: 0.48,
    shadowRadius: 3,
    width: 40
  },
  atlasMedalMarkerCollected: {
    backgroundColor: "#d6ad55",
    borderColor: "#3f301c",
    transform: [{ rotate: "-2deg" }]
  },
  atlasMedalMarkerInner: {
    alignItems: "center",
    borderColor: "rgba(42, 32, 21, 0.45)",
    borderRadius: 3,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  atlasMedalMarkerLocked: {
    backgroundColor: "#46565a",
    borderColor: "#d9d0bc",
    transform: [{ rotate: "2deg" }]
  },
  atlasRouteMarker: {
    alignItems: "center",
    height: 46,
    justifyContent: "flex-start",
    width: 42
  },
  atlasRouteMarkerEnd: {
    backgroundColor: "#c9b98e",
    borderColor: "#35291b",
    transform: [{ rotate: "2deg" }]
  },
  atlasRouteMarkerInset: {
    alignItems: "center",
    borderColor: "rgba(42, 32, 21, 0.38)",
    borderRadius: 2,
    borderWidth: 1,
    height: 25,
    justifyContent: "center",
    width: 29
  },
  atlasRouteMarkerPaper: {
    alignItems: "center",
    borderRadius: 4,
    borderWidth: 2,
    height: 34,
    justifyContent: "center",
    shadowColor: "#02060a",
    shadowOffset: { height: 2, width: 1 },
    shadowOpacity: 0.48,
    shadowRadius: 3,
    width: 38
  },
  atlasRouteMarkerPoint: {
    backgroundColor: "#dfca99",
    borderBottomColor: "#2a2015",
    borderBottomWidth: 2,
    borderRightColor: "#2a2015",
    borderRightWidth: 2,
    height: 11,
    marginTop: -6,
    transform: [{ rotate: "45deg" }],
    width: 11
  },
  atlasRouteMarkerStart: {
    backgroundColor: "#dfca99",
    borderColor: "#2a2015",
    transform: [{ rotate: "-2deg" }]
  },
  playerCompassHalo: {
    backgroundColor: "rgba(4, 16, 22, 0.82)",
    borderColor: "rgba(245, 196, 81, 0.68)",
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    position: "absolute",
    shadowColor: "#02060a",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 3,
    transform: [{ rotate: "-3deg" }],
    width: 40
  },
  playerCompassHaloStale: {
    backgroundColor: "rgba(20, 27, 29, 0.88)",
    borderColor: "rgba(223, 202, 153, 0.82)"
  },
  forbiddenZoneLabel: {
    alignItems: "center",
    backgroundColor: "rgba(54, 20, 78, 0.96)",
    borderColor: "rgba(213, 165, 238, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: 250,
    minWidth: 130,
    paddingHorizontal: 11,
    paddingTop: 8,
    shadowColor: "#16081f",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5
  },
  forbiddenZoneLabelArea: {
    color: "#d5a5ee",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 3
  },
  forbiddenZoneLabelPointer: {
    backgroundColor: "rgba(54, 20, 78, 0.96)",
    borderBottomColor: "rgba(213, 165, 238, 0.92)",
    borderBottomWidth: 1,
    borderRightColor: "rgba(213, 165, 238, 0.92)",
    borderRightWidth: 1,
    height: 10,
    marginBottom: -6,
    transform: [{ rotate: "45deg" }],
    width: 10
  },
  forbiddenZoneLabelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  forbiddenZoneLabelText: {
    color: "#f4eaf9",
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    textAlign: "center"
  },
  playerSpeechArrow: {
    alignSelf: "center",
    backgroundColor: "#f4ecd8",
    borderBottomColor: "#302719",
    borderBottomWidth: 1,
    borderRightColor: "#302719",
    borderRightWidth: 1,
    height: 15,
    marginTop: -8,
    transform: [{ rotate: "45deg" }],
    width: 15
  },
  playerSpeechBubble: {
    alignItems: "center",
    backgroundColor: "#f4ecd8",
    borderColor: "#302719",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    height: 84,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: "#02060a",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 5,
    width: 238
  },
  playerSpeechMarker: {
    alignItems: "center",
    height: 128,
    justifyContent: "flex-start",
    width: 244
  },
  playerSpeechMarkerHidden: {
    opacity: 0
  },
  playerSpeechText: {
    color: "#17140f",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    minHeight: 20,
    textAlign: "center"
  },
  playerMarker: {
    alignItems: "center",
    height: 64,
    justifyContent: "center",
    overflow: "visible",
    width: 64
  },
  playerSpriteImage: {
    height: 64,
    left: 0,
    position: "absolute",
    top: 0,
    width: 64
  }

});
