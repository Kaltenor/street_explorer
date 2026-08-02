import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from "react";
import MapView, { AnimatedRegion, Marker, Polygon, Polyline, Region } from "react-native-maps";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  LOCATION_CONFIG,
  MAP_CONFIG,
  MODE_LOCATION_CONFIG
} from "../constants/config";
import { WALKING_COLORS } from "../constants/theme";
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
  explorationEnabled: boolean;
  activeMode: ActivityMode;
  focusedMedal: CollectedMedal | null;
  medalFocusRequestId: number;
  medals: CollectedMedal[];
  onMedalPress?: (medal: CollectedMedal) => void;
  currentLocation: GpsPoint | null;
  highlightedSessionId: number | null;
  layers: MapLayerState;
  savedExplorationCellIds: string[];
  onMapReady?: () => void;
  onVisibleRegionChange?: (region: Region) => void;
  districtZones: CachedZone[];
  playerFocusRequestId: number;
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

const LANDMARK_POI_CATEGORIES: AppleMapsPointOfInterestCategory[] = [
  "airport",
  "amusementPark",
  "aquarium",
  "beach",
  "campground",
  "fireStation",
  "hospital",
  "library",
  "marina",
  "museum",
  "nationalPark",
  "park",
  "police",
  "postOffice",
  "publicTransport",
  "school",
  "stadium",
  "theater",
  "university",
  "zoo"
];

export const ExplorationMap = memo(function ExplorationMap({
  walks,
  activeExplorationCellIds,
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
  layers,
  savedExplorationCellIds,
  onMapReady,
  onVisibleRegionChange,
  districtZones,
  playerFocusRequestId,
  selectedZone,
  todayNewCellIds,
  zoneFocusRequestId
}: ExplorationMapProps) {
  usePerformanceRenderCounter("ExplorationMap");
  const mapRef = useRef<MapView | null>(null);
  const hasUserMovedMapRef = useRef(false);
  const initialCenterRef = useRef<InitialMapCenter | null>(null);
  const handledPlayerFocusRequestId = useRef(playerFocusRequestId);
  const handledZoneFocusRequestId = useRef(zoneFocusRequestId);
  const persistentPlayerLocationRef = useRef<GpsPoint | null>(null);
  const [isAutoFollowEnabled, setIsAutoFollowEnabled] = useState(true);
  const [isNativeMapReady, setIsNativeMapReady] = useState(false);
  const activeRouteStartPoint =
    activeRouteChunks[0]?.points[0] ?? activePoints[0] ?? null;
  const activeRouteEndPoint =
    activeRouteChunks.at(-1)?.points.at(-1) ?? activePoints.at(-1) ?? null;
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
  const unselectedDistrictZones = useMemo(
    () => districtZones.filter((zone) => zone.id !== selectedZone?.id),
    [districtZones, selectedZone?.id]
  );
  // Preserve every finalized street corner so rendered routes never cut through buildings.
  const pathSimplificationToleranceMeters = 0;
  const shouldShowCompletedArea = layers.showExploredCells;
  const shouldShowOutline = layers.showExploredCells && renderLevel !== "far";
  const shouldShowRoutes = layers.showPaths && renderLevel === "close";
  const shouldShowMarkers = layers.showMarkers && renderLevel === "close";
  const shouldShowMedalMarkers = layers.showMarkers && renderLevel !== "far";
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
    const followTarget = activeRouteEndPoint;

    if (!followTarget) {
      setIsAutoFollowEnabled(true);
      return;
    }

    if (
      !isNativeMapReady ||
      !isAutoFollowEnabled ||
      initialCenterRef.current?.timestamp ===
        getPointTimestamp(followTarget)
    ) {
      return;
    }

    mapRef.current?.animateCamera(
      { center: pointToCoordinate(followTarget) },
      { duration: 350 }
    );
  }, [
    activeRouteEndPoint,
    isAutoFollowEnabled,
    isNativeMapReady
  ]);

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
    setIsAutoFollowEnabled(true);
    mapRef.current?.animateToRegion(
      {
        latitude: playerLocation.latitude,
        longitude: playerLocation.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
      },
      450
    );
  }, [isNativeMapReady, playerFocusRequestId, playerLocation]);

  useEffect(() => {
    if (!highlightedSessionId) {
      return;
    }

    const highlightedWalk = walks.find((walk) => walk.id === highlightedSessionId);

    if (highlightedWalk && highlightedWalk.points.length > 1) {
      fitToPoints(highlightedWalk.points, {
        bottom: 230,
        left: 48,
        right: 48,
        top: 190
      });
    }
  }, [highlightedSessionId, walks]);

  useEffect(() => {
    if (!selectedZone || zoneFocusRequestId === handledZoneFocusRequestId.current) {
      return;
    }

    handledZoneFocusRequestId.current = zoneFocusRequestId;
    const coordinates = selectedZone.geometry.flat();

    if (coordinates.length > 1) {
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
    hasUserMovedMapRef.current = true;
    setIsAutoFollowEnabled(false);
  }, [focusedMedal, isNativeMapReady, medalFocusRequestId]);

  const handleRegionChangeComplete = (nextRegion: Region) => {
    setVisibleRegion(nextRegion);
    onVisibleRegionChange?.(nextRegion);
  };

  const disableAutoFollow = () => {
    hasUserMovedMapRef.current = true;
    setIsAutoFollowEnabled(false);
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
        style={styles.map}
        appleMapsPointsOfInterestFilter={{
          categories: LANDMARK_POI_CATEGORIES,
          mode: "include"
        }}
        initialRegion={region}
        onPanDrag={disableAutoFollow}
        onMapReady={() => {
          setIsNativeMapReady(true);
          onMapReady?.();
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
        onTouchStart={disableAutoFollow}
        pitchEnabled
        rotateEnabled
        scrollEnabled
        zoomTapEnabled
        showsUserLocation={false}
        showsMyLocationButton={false}
        zoomEnabled
        followsUserLocation={false}
      >
        <ExplorationSurfaceOverlay
          areaStyle={areaStyle}
          explorationPolygons={explorationPolygons}
          outlineSegments={explorationOutlineSegments}
          shouldShowCompletedArea={shouldShowCompletedArea}
          shouldShowOutline={shouldShowOutline}
          todayPolygons={todayNewPolygons}
        />

        {unselectedDistrictZones.flatMap((zone) =>
          zone.geometry.map((ring, index) => (
            <Polygon
              coordinates={ring}
              fillColor="rgba(148, 163, 184, 0.025)"
              key={`district-${zone.id}-${index}`}
              strokeColor="rgba(148, 163, 184, 0.5)"
              strokeWidth={1}
            />
          ))
        )}

        {selectedZone
          ? selectedZone.geometry.map((ring, index) => (
              <Polygon
                coordinates={ring}
                fillColor="rgba(245, 196, 81, 0.09)"
                key={`${selectedZone.id}-${index}`}
                strokeColor={WALKING_COLORS.selectedRoute}
                strokeWidth={3}
              />
            ))
          : null}

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
                isDimmed={isDimmed}
                isHighlighted={isHighlighted}
                points={walk.points}
                segments={walk.routeSegments}
                simplificationToleranceMeters={pathSimplificationToleranceMeters}
              />
              {shouldShowMarkers && firstPoint ? (
                <Marker
                  coordinate={pointToCoordinate(firstPoint)}
                  pinColor="#16a34a"
                  title="Start"
                  description={formatMarkerDate(walk.startedAt)}
                />
              ) : null}
              {shouldShowMarkers && lastPoint ? (
                <Marker
                  coordinate={pointToCoordinate(lastPoint)}
                  pinColor={color}
                  title="End"
                  description={formatMarkerDate(walk.endedAt)}
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
            {shouldShowMarkers ? <Marker
              coordinate={pointToCoordinate(activeRouteStartPoint)}
              pinColor="#16a34a"
              title="Recording start"
            /> : null}
          </>
        ) : null}

        {shouldShowMedalMarkers ? medals.map((medal) => (
          <Marker
            accessibilityLabel={`${medal.name.en}, ${medal.isCollected ? "collected" : "locked"}`}
            coordinate={{ latitude: medal.latitude, longitude: medal.longitude }}
            key={`medal-${medal.albumId}-${medal.id}`}
            onPress={() => onMedalPress?.(medal)}
            title={medal.name.en}
          >
            <View style={[
              styles.medalMarker,
              medal.isCollected ? styles.medalMarkerCollected : styles.medalMarkerLocked
            ]}>
              <Ionicons
                color={medal.isCollected ? "#fff5c4" : "#d6dee5"}
                name={medal.isCollected ? "medal" : "lock-closed"}
                size={17}
              />
            </View>
          </Marker>
        )) : null}

        {playerLocation ? (
          <PlayerLocationMarker
            activePoints={activePoints}
            location={playerLocation}
          />
        ) : null}
      </ApplePoiFilteredMapView>
    </View>
  );
});

type ExplorationSurfaceOverlayProps = {
  areaStyle: ReturnType<typeof getExploredAreaStyle>;
  explorationPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
  outlineSegments: ReturnType<typeof buildExplorationPolygonOutlineSegments>;
  shouldShowCompletedArea: boolean;
  shouldShowOutline: boolean;
  todayPolygons: ReturnType<typeof buildMergedExplorationPolygons>;
};

const ExplorationSurfaceOverlay = memo(function ExplorationSurfaceOverlay({
  areaStyle,
  explorationPolygons,
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
              fillColor={areaStyle.fillColor}
              strokeColor={areaStyle.fillColor}
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
const LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS = 5_000;
const PLAYER_WALK_FRAME_INTERVAL_MS = 170;
const PLAYER_COORDINATE_ANIMATION_DEFAULT_MS = 700;
const PLAYER_COORDINATE_ANIMATION_MAX_MS = 900;
const PLAYER_COORDINATE_ANIMATION_MIN_MS = 250;
const PLAYER_COORDINATE_SNAP_DISTANCE_METERS = 60;

type PlayerDirection = "east" | "north" | "south" | "west";

type PlayerSpriteSet = {
  idle: number;
  walk: readonly [number, number, number];
};

const PLAYER_SPRITES: Record<PlayerDirection, PlayerSpriteSet> = {
  east: {
    idle: require("../../assets/player/native-idle-east.png"),
    walk: [
      require("../../assets/player/native-walk-east-1.png"),
      require("../../assets/player/native-walk-east-2.png"),
      require("../../assets/player/native-walk-east-3.png")
    ]
  },
  north: {
    idle: require("../../assets/player/native-idle-north.png"),
    walk: [
      require("../../assets/player/native-walk-north-1.png"),
      require("../../assets/player/native-walk-north-2.png"),
      require("../../assets/player/native-walk-north-3.png")
    ]
  },
  south: {
    idle: require("../../assets/player/native-idle-south.png"),
    walk: [
      require("../../assets/player/native-walk-south-1.png"),
      require("../../assets/player/native-walk-south-2.png"),
      require("../../assets/player/native-walk-south-3.png")
    ]
  },
  west: {
    idle: require("../../assets/player/native-idle-west.png"),
    walk: [
      require("../../assets/player/native-walk-west-1.png"),
      require("../../assets/player/native-walk-west-2.png"),
      require("../../assets/player/native-walk-west-3.png")
    ]
  }
};

function PlayerLocationMarker({
  activePoints,
  location
}: {
  activePoints: GpsPoint[];
  location: GpsPoint;
}) {
  const previousLocationRef = useRef<GpsPoint | null>(null);
  const previousAnimatedLocationRef = useRef(location);
  const animatedCoordinate = useRef(
    new AnimatedRegion({
      latitude: location.latitude,
      latitudeDelta: 0,
      longitude: location.longitude,
      longitudeDelta: 0
    })
  ).current;
  const routeMovement = getRecentMovement(activePoints);
  const locationMovement = getMovementBetween(
    previousLocationRef.current,
    location
  );
  const movement = routeMovement ?? locationMovement;
  const [isGpsFresh, setIsGpsFresh] = useState(() =>
    isPlayerMotionPointFresh(location)
  );
  const [direction, setDirection] = useState<PlayerDirection>(() =>
    getPlayerDirection(getPlayerHeading(location, movement))
  );
  const [walkFrameIndex, setWalkFrameIndex] = useState(0);
  const liveSpeed =
    typeof location.speedMetersPerSecond === "number"
      ? location.speedMetersPerSecond
      : null;
  const isMoving =
    isGpsFresh &&
    Math.max(liveSpeed ?? 0, movement?.speedMetersPerSecond ?? 0) >=
      PLAYER_MOVING_SPEED_METERS_PER_SECOND;
  const heading = getPlayerHeading(location, movement);

  useEffect(() => {
    previousLocationRef.current = location;
  }, [location]);

  useEffect(() => {
    const previousLocation = previousAnimatedLocationRef.current;
    const distanceMeters = haversineDistanceMeters(previousLocation, location);
    const updateIntervalMs =
      getPointTimestamp(location) - getPointTimestamp(previousLocation);
    previousAnimatedLocationRef.current = location;
    animatedCoordinate.stopAnimation(() => undefined);

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters > PLAYER_COORDINATE_SNAP_DISTANCE_METERS
    ) {
      const snapAnimation = animatedCoordinate.timing({
        duration: 0,
        latitude: location.latitude,
        latitudeDelta: 0,
        longitude: location.longitude,
        longitudeDelta: 0,
        toValue: 0,
        useNativeDriver: false
      });
      snapAnimation.start();
      return () => snapAnimation.stop();
    }

    const duration = Number.isFinite(updateIntervalMs) && updateIntervalMs > 0
      ? Math.min(
          PLAYER_COORDINATE_ANIMATION_MAX_MS,
          Math.max(PLAYER_COORDINATE_ANIMATION_MIN_MS, updateIntervalMs)
        )
      : PLAYER_COORDINATE_ANIMATION_DEFAULT_MS;
    const animation = animatedCoordinate.timing({
      duration,
      latitude: location.latitude,
      latitudeDelta: 0,
      longitude: location.longitude,
      longitudeDelta: 0,
      toValue: 0,
      useNativeDriver: false
    });
    animation.start();

    return () => animation.stop();
  }, [animatedCoordinate, location]);

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
  }, [location.timestamp]);

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

  const spriteSet = PLAYER_SPRITES[direction];
  const requestedSpriteSource = isMoving
    ? spriteSet.walk[walkFrameIndex] ?? spriteSet.walk[0]
    : spriteSet.idle;
  const persistentSpriteSourceRef = useRef(requestedSpriteSource);

  // MapKit loads annotation images asynchronously. When the last GPS fix ages
  // out during Stop, retain the already visible bitmap instead of replacing it
  // with another asset that can briefly clear the native annotation image.
  if (isGpsFresh) {
    persistentSpriteSourceRef.current = requestedSpriteSource;
  }

  const spriteSource = persistentSpriteSourceRef.current;

  return (
    <Marker.Animated
      accessibilityLabel={
        isGpsFresh
          ? "Current player location"
          : "Last known player location, GPS signal stale"
      }
      anchor={{ x: 0.5, y: 0.5 }}
      // Marker.Animated supports AnimatedRegion at runtime, but its SDK 54 type omits it.
      coordinate={animatedCoordinate as never}
      identifier="street-explorer-player"
      image={spriteSource}
      title={isGpsFresh ? "Current player location" : "Last known location"}
      tracksViewChanges={false}
      zIndex={1000}
    />
  );
}

type RecentMovement = {
  bearingDegrees: number;
  speedMetersPerSecond: number;
};

function getRecentMovement(points: GpsPoint[]): RecentMovement | null {
  const endPoint = points.at(-1);

  if (!endPoint) {
    return null;
  }

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const startPoint = points[index];

    if (!startPoint) {
      continue;
    }

    const distanceMeters = haversineDistanceMeters(startPoint, endPoint);

    if (distanceMeters < PLAYER_BEARING_MIN_DISTANCE_METERS) {
      continue;
    }

    const seconds =
      (new Date(endPoint.timestamp).getTime() - new Date(startPoint.timestamp).getTime()) /
      1000;

    if (!Number.isFinite(seconds) || seconds <= 0) {
      continue;
    }

    return {
      bearingDegrees: calculateBearingDegrees(startPoint, endPoint),
      speedMetersPerSecond: distanceMeters / seconds
    };
  }

  return null;
}

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
      fillColor: "rgba(239, 68, 68, 0.50)",
      outlineColor: "rgba(0, 0, 0, 0.34)",
      outlineWidth: 1,
      todayFillColor: "rgba(251, 146, 60, 0.38)"
    };
  }

  if (latitudeDelta > 0.035) {
    return {
      fillColor: "rgba(239, 68, 68, 0.46)",
      outlineColor: "rgba(0, 0, 0, 0.54)",
      outlineWidth: 1.5,
      todayFillColor: "rgba(251, 146, 60, 0.42)"
    };
  }

  if (latitudeDelta > 0.014) {
    return {
      fillColor: "rgba(239, 68, 68, 0.40)",
      outlineColor: "rgba(0, 0, 0, 0.74)",
      outlineWidth: 2.4,
      todayFillColor: "rgba(251, 146, 60, 0.48)"
    };
  }

  return {
    fillColor: "rgba(239, 68, 68, 0.34)",
    outlineColor: "rgba(0, 0, 0, 0.92)",
    outlineWidth: 3.5,
    todayFillColor: "rgba(251, 146, 60, 0.54)"
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
  isDimmed,
  isHighlighted,
  points,
  segments,
  simplificationToleranceMeters
}: {
  activityMode: ActivityMode;
  color: string;
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

  return (
    <>
      {renderedSegments.map((segment, index) => {
        if (segment.points.length < 2) {
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
              segment.points,
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

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject
  },
  map: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  medalMarker: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 2,
    height: 38,
    justifyContent: "center",
    shadowColor: "#02060a",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 4,
    width: 38
  },
  medalMarkerCollected: {
    backgroundColor: "#a77316",
    borderColor: "#ffe198"
  },
  medalMarkerLocked: {
    backgroundColor: "#3f4f5b",
    borderColor: "#a9b6c0"
  },

});
