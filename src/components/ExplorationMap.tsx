import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AppearanceMode,
  createAppearanceStyles,
  isDaylightAppearance
} from "../constants/appearance";
import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from "react";
import MapView, {
  type LongPressEvent,
  Marker,
  Polygon,
  Polyline,
  Region
} from "react-native-maps";
import { Image, Platform, StyleSheet, View } from "react-native";
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
import { CachedZone } from "../database/completionRepository";
import {
  buildExplorationPolygonOutlineSegments,
  buildMergedExplorationPolygons
} from "../services/explorationArea";
import { haversineDistanceMeters } from "../services/distance";
import { buildPathSegments, type PathSegment } from "../services/pathInference";
import { LOOP_FILL_CONFIG } from "../services/loopFill";
import {
  measurePerformance,
  usePerformanceRenderCounter
} from "../services/performance";
import { simplifyGpsPointsForRender } from "../services/routeSimplification";
import { MapLayerState } from "../types/mapLayers";
import { CollectedMedal } from "../types/medal";
import {
  ActivityMode,
  GpsPoint,
  LiveRouteChunk,
  RenderedRouteSegment,
  WalkWithPoints
} from "../types/walk";

type ExplorationMapProps = {
  walks: WalkWithPoints[];
  pathWalks: WalkWithPoints[];
  activePoints: GpsPoint[];
  activeRouteChunks: LiveRouteChunk[];
  activeExplorationCellIds: string[];
  appearanceMode: AppearanceMode;
  explorationEnabled: boolean;
  activeMode: ActivityMode;
  focusedMedal: CollectedMedal | null;
  medalFocusRequestId: number;
  medals: CollectedMedal[];
  onMedalPress?: (medal: CollectedMedal) => void;
  currentLocation: GpsPoint | null;
  highlightedSessionId: number | null;
  routeFocusRequestId: number;
  layers: MapLayerState;
  savedExplorationCellIds: string[];
  onMapReady?: () => void;
  onMapLongPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onMapInteraction?: () => void;
  onVisibleRegionChange?: (region: Region) => void;
  districtZones: CachedZone[];
  cityZone: CachedZone | null;
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
const MEDAL_MARKER_MAX_LATITUDE_DELTA = 0.14;

export const ExplorationMap = memo(function ExplorationMap({
  walks,
  activeExplorationCellIds,
  appearanceMode,
  explorationEnabled,
  pathWalks,
  activePoints,
  activeRouteChunks,
  activeMode,
  currentLocation,
  focusedMedal,
  medalFocusRequestId,
  medals,
  onMedalPress,
  highlightedSessionId,
  routeFocusRequestId,
  layers,
  savedExplorationCellIds,
  onMapReady,
  onMapLongPress,
  onMapInteraction,
  onVisibleRegionChange,
  districtZones,
  cityZone,
  playerFocusRequestId,
  playerVisible,
  selectedZone,
  todayNewCellIds,
  zoneFocusRequestId
}: ExplorationMapProps) {
  usePerformanceRenderCounter("ExplorationMap");
  const reducedMotion = useReducedMotionPreference();
  const [highlightedRouteDrawProgress, setHighlightedRouteDrawProgress] = useState(1);
  const [isInkRevealing, setIsInkRevealing] = useState(false);
  const previousExplorationCellCountRef = useRef<number | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const hasUserMovedMapRef = useRef(false);
  const initialCenterRef = useRef<InitialMapCenter | null>(null);
  const handledPlayerFocusRequestId = useRef(playerFocusRequestId);
  const pendingPlayerFocusTimestampRef = useRef<number | null>(null);
  const handledZoneFocusRequestId = useRef(zoneFocusRequestId);
  const persistentPlayerLocationRef = useRef<GpsPoint | null>(null);
  const [isNativeMapReady, setIsNativeMapReady] = useState(false);
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
  const region = getInitialRegion(startupCenter?.point ?? null, walks);
  const [visibleRegion, setVisibleRegion] = useState(region);
  const renderLevel = getMapRenderLevel(visibleRegion.latitudeDelta);
  const areaStyle = getExploredAreaStyle(visibleRegion.latitudeDelta);

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
  const renderedExplorationCellIds = useMemo(
    () =>
      shouldBuildExploredArea
        ? [
            ...new Set([
              ...savedExplorationCellIds,
              ...settledActiveExplorationCellIds
            ])
          ]
        : [],
    [
      savedExplorationCellIds,
      settledActiveExplorationCellIds,
      shouldBuildExploredArea
    ]
  );
  const explorationPolygons = useMemo(
    () =>
      shouldShowCompletedArea
        ? measurePerformance(
            "map.exploration-surface",
            () =>
              buildMergedExplorationPolygons(renderedExplorationCellIds, {
                maxFilledHoleAreaSquareMeters
              }),
            12
          )
        : [],
    [
      maxFilledHoleAreaSquareMeters,
      renderedExplorationCellIds,
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
  const settledTodayNewCellIds = useCoalescedValue(todayNewCellIds, 650);
  const todayNewPolygons = useMemo(
    () =>
      explorationEnabled && shouldShowCompletedArea
        ? measurePerformance(
            "map.today-surface",
            () =>
              buildMergedExplorationPolygons(settledTodayNewCellIds, {
                maxFilledHoleAreaSquareMeters
              }),
            8
          )
        : [],
    [
      explorationEnabled,
      maxFilledHoleAreaSquareMeters,
      shouldShowCompletedArea,
      settledTodayNewCellIds
    ]
  );


  useEffect(() => {
    const previousCount = previousExplorationCellCountRef.current;
    previousExplorationCellCountRef.current = renderedExplorationCellIds.length;

    if (
      reducedMotion ||
      previousCount === null ||
      renderedExplorationCellIds.length <= previousCount
    ) {
      return;
    }

    setIsInkRevealing(true);
    const revealTimer = setTimeout(() => setIsInkRevealing(false), 520);
    return () => clearTimeout(revealTimer);
  }, [reducedMotion, renderedExplorationCellIds.length]);
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

    mapRef.current?.animateToRegion(
      {
        latitude: startupCenter.point.latitude,
        longitude: startupCenter.point.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
      },
      450
    );
    initialCenterRef.current = startupCenter;
  }, [isNativeMapReady, startupCenter]);

  useEffect(() => {
    if (
      !isNativeMapReady ||
      !playerLocation ||
      playerFocusRequestId === handledPlayerFocusRequestId.current
    ) {
      return;
    }

    handledPlayerFocusRequestId.current = playerFocusRequestId;
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
    if (!focusedMedal || medalFocusRequestId === 0 || !isNativeMapReady) {
      return;
    }

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

  const handleRegionChangeComplete = (nextRegion: Region) => {
    setVisibleRegion(nextRegion);
    onVisibleRegionChange?.(nextRegion);
  };

  const handleMapPan = () => {
    pendingPlayerFocusTimestampRef.current = null;
    hasUserMovedMapRef.current = true;
  };

  const handleMapLongPress = (event: LongPressEvent) => {
    pendingPlayerFocusTimestampRef.current = null;
    hasUserMovedMapRef.current = true;
    onMapLongPress?.(event.nativeEvent.coordinate);
  };

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
        key={`native-map-${appearanceMode}-city-${cityZone?.id ?? "none"}`}
        style={styles.map}
        appleMapsPointsOfInterestFilter={{
          categories: GAMEPLAY_POI_CATEGORIES,
          mode: "include"
        }}
        mapType={
          Platform.OS === "ios" && !isDaylightAppearance(appearanceMode)
            ? "mutedStandard"
            : "standard"
        }
        userInterfaceStyle={
          Platform.OS === "ios"
            ? isDaylightAppearance(appearanceMode) ? "light" : "dark"
            : undefined
        }
        initialRegion={visibleRegion}
        onPanDrag={handleMapPan}
        onMapReady={() => {
          setIsNativeMapReady(true);
          onMapReady?.();
        }}
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
          explorationPolygons={explorationPolygons}
          isInkRevealing={isInkRevealing}
          outlineSegments={explorationOutlineSegments}
          shouldShowCompletedArea={shouldShowCompletedArea}
          shouldShowOutline={shouldShowOutline}
          todayPolygons={todayNewPolygons}
        />

        <Fragment
          key={`administrative-boundaries-${cityZone?.id ?? "none"}-${selectedZone?.id ?? "none"}`}
        >
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
                />
              );
            })
          )}

          {cityZone
            ? cityZone.geometry.map((ring, index) => (
                <Polygon
                  coordinates={ring}
                  fillColor={
                    selectedZone?.type === "city" && selectedZone.id === cityZone.id
                      ? WALKING_COLORS.selectedZoneFill
                      : "rgba(141, 82, 104, 0)"
                  }
                  key={`city-boundary-${cityZone.id}-${index}`}
                  strokeColor={
                    selectedZone?.type === "city" && selectedZone.id === cityZone.id
                      ? WALKING_COLORS.cityBoundary
                      : WALKING_COLORS.cityBoundaryMuted
                  }
                  strokeWidth={
                    selectedZone?.type === "city" && selectedZone.id === cityZone.id ? 4 : 3
                  }
                />
              ))
            : null}
        </Fragment>

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
                  coordinate={pointToCoordinate(firstPoint)}
                  description={formatMarkerDate(walk.startedAt)}
                  kind="start"
                  title="Start"
                />
              ) : null}
              {shouldShowMarkers &&
              lastPoint &&
              (!isHighlighted || highlightedRouteDrawProgress >= 1) ? (
                <AtlasRouteMarker
                  coordinate={pointToCoordinate(lastPoint)}
                  description={formatMarkerDate(walk.endedAt)}
                  kind="end"
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
                coordinate={pointToCoordinate(activeRouteStartPoint)}
                kind="start"
                title="Recording start"
              />
            ) : null}
          </>
        ) : null}

        {shouldShowMedalMarkers ? medals.map((medal) => (
          <AtlasMedalMarker
            key={`medal-${medal.albumId}-${medal.id}`}
            medal={medal}
            onPress={() => onMedalPress?.(medal)}
          />
        )) : null}

        {playerVisible && playerLocation ? (
          <PlayerLocationMarker location={playerLocation} />
        ) : null}

      </ApplePoiFilteredMapView>
    </View>
  );
});

type AtlasRouteMarkerProps = {
  coordinate: { latitude: number; longitude: number };
  description?: string;
  kind: "end" | "start";
  title: string;
};

function AtlasRouteMarker({
  coordinate,
  description,
  kind,
  title
}: AtlasRouteMarkerProps) {
  const isStart = kind === "start";

  return (
    <Marker
      accessibilityLabel={title}
      anchor={{ x: 0.5, y: 1 }}
      coordinate={coordinate}
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
}

function AtlasMedalMarker({
  medal,
  onPress
}: {
  medal: CollectedMedal;
  onPress: () => void;
}) {
  return (
    <Marker
      accessibilityLabel={
        medal.name.en + ", " + (medal.isCollected ? "collected" : "locked")
      }
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={{ latitude: medal.latitude, longitude: medal.longitude }}
      onPress={onPress}
      title={medal.name.en}
    >
      <View
        collapsable={false}
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
}

type ExplorationSurfaceOverlayProps = {
  areaStyle: ReturnType<typeof getExploredAreaStyle>;
  explorationPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
  isInkRevealing: boolean;
  outlineSegments: ReturnType<typeof buildExplorationPolygonOutlineSegments>;
  shouldShowCompletedArea: boolean;
  shouldShowOutline: boolean;
  todayPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
};

const ExplorationSurfaceOverlay = memo(function ExplorationSurfaceOverlay({
  areaStyle,
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

function PlayerLocationMarker({ location }: { location: GpsPoint }) {
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

  const accessibilityLabel = isGpsFresh
    ? "Current player location"
    : "Last known player location, GPS signal stale";
  const visibleSpriteSource = !isGpsFresh
    ? PLAYER_SPRITES[direction].stale
    : isMoving
    ? PLAYER_SPRITES[direction].walk[walkFrameIndex]
    : PLAYER_SPRITES[direction].idle;

  return (
    <Marker
      accessibilityLabel={accessibilityLabel}
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={pointToCoordinate(location)}
      identifier="street-explorer-player"
      title={isGpsFresh ? "Current player location" : "Last known location"}
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
              { opacity: frame.source === visibleSpriteSource ? 1 : 0 }
            ]}
          />
        ))}
      </View>
    </Marker>
  );
}

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

function getExploredAreaStyle(latitudeDelta: number) {
  if (latitudeDelta > 0.07) {
    return {
      fillColor: "rgba(229, 122, 50, 0.54)",
      outlineColor: "rgba(3, 35, 38, 0.48)",
      outlineWidth: 1,
      revealFillColor: "rgba(253, 186, 116, 0.70)",
      todayFillColor: "rgba(245, 196, 81, 0.42)"
    };
  }

  if (latitudeDelta > 0.035) {
    return {
      fillColor: "rgba(229, 122, 50, 0.48)",
      outlineColor: "rgba(3, 30, 34, 0.64)",
      outlineWidth: 1.5,
      revealFillColor: "rgba(253, 186, 116, 0.66)",
      todayFillColor: "rgba(245, 196, 81, 0.46)"
    };
  }

  if (latitudeDelta > 0.014) {
    return {
      fillColor: "rgba(229, 122, 50, 0.42)",
      outlineColor: "rgba(2, 25, 29, 0.80)",
      outlineWidth: 2.4,
      revealFillColor: "rgba(253, 186, 116, 0.62)",
      todayFillColor: "rgba(245, 196, 81, 0.52)"
    };
  }

  return {
    fillColor: "rgba(229, 122, 50, 0.36)",
    outlineColor: "rgba(1, 19, 23, 0.94)",
    outlineWidth: 3.5,
    revealFillColor: "rgba(253, 186, 116, 0.58)",
    todayFillColor: "rgba(245, 196, 81, 0.58)"
  };
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
        if (visiblePoints.length < 2) {
          return null;
        }

        const strokeColor = getSegmentStrokeColor({
          color,
          isDimmed,
          isInferred: segment.type === "inferred"
        });

        return (
          <Polyline
            coordinates={simplifyGpsPointsForRender(
              visiblePoints,
              simplificationToleranceMeters
            ).map(pointToCoordinate)}
            key={
              "id" in segment
                ? segment.id
                : `${segment.type}-${index}-${segment.points[0]?.timestamp ?? "route"}`
            }
            lineCap="round"
            lineDashPattern={undefined}
            lineJoin="round"
            strokeColor={strokeColor}
            strokeWidth={isHighlighted ? 8 : 5}
          />
        );
      })}
    </>
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
): DrawableRouteLineSegment[] {
  if (segments.some((segment) => "id" in segment)) {
    return segments.filter(
      (segment): segment is DrawableRouteLineSegment =>
        segment.type !== "rejected"
    );
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
