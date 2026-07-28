import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from "react";
import MapView, { Marker, Polygon, Polyline, Region } from "react-native-maps";
import { Animated, Easing, StyleSheet, View } from "react-native";

import {
  LOCATION_CONFIG,
  MAP_CONFIG,
  MODE_LOCATION_CONFIG
} from "../constants/config";
import { CachedZone } from "../database/completionRepository";
import {
  buildExplorationPolygonOutlineSegments,
  buildMergedExplorationPolygons
} from "../services/explorationArea";
import { haversineDistanceMeters } from "../services/distance";
import { buildPathSegments, type PathSegment } from "../services/pathInference";
import { LOOP_FILL_CONFIG } from "../services/loopFill";
import { simplifyGpsPointsForRender } from "../services/routeSimplification";
import { MapLayerState } from "../types/mapLayers";
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
  currentLocation: GpsPoint | null;
  highlightedSessionId: number | null;
  layers: MapLayerState;
  savedExplorationCellIds: string[];
  onMapReady?: () => void;
  onVisibleRegionChange?: (region: Region) => void;
  selectedZone: CachedZone | null;
  todayNewCellIds: string[];
  zoneFocusRequestId: number;
};

const PATH_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#9333ea",
  "#ea580c",
  "#0d9488"
];

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

export function ExplorationMap({
  walks,
  activeExplorationCellIds,
  explorationEnabled,
  pathWalks,
  activePoints,
  activeRouteChunks,
  activeMode,
  currentLocation,
  highlightedSessionId,
  layers,
  savedExplorationCellIds,
  onMapReady,
  onVisibleRegionChange,
  selectedZone,
  todayNewCellIds,
  zoneFocusRequestId
}: ExplorationMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const hasUserMovedMapRef = useRef(false);
  const initialCenterRef = useRef<InitialMapCenter | null>(null);
  const handledZoneFocusRequestId = useRef(zoneFocusRequestId);
  const [isAutoFollowEnabled, setIsAutoFollowEnabled] = useState(true);
  const [isNativeMapReady, setIsNativeMapReady] = useState(false);
  const activeRouteStartPoint =
    activeRouteChunks[0]?.points[0] ?? activePoints[0] ?? null;
  const activeRouteEndPoint =
    activeRouteChunks.at(-1)?.points.at(-1) ?? activePoints.at(-1) ?? null;
  // Once recording has an accepted point, weak/rejected raw fixes must not move
  // either the player marker or the camera away from the canonical route.
  const playerLocation = activeRouteEndPoint ?? currentLocation;
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
  const shouldBuildExploredArea =
    explorationEnabled && (shouldShowCompletedArea || shouldShowOutline);
  const maxFilledHoleAreaSquareMeters =
    LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode[activeMode];
  const renderedExplorationCellIds = useMemo(
    () =>
      shouldBuildExploredArea
        ? [...new Set([...savedExplorationCellIds, ...activeExplorationCellIds])]
        : [],
    [
      activeExplorationCellIds,
      savedExplorationCellIds,
      shouldBuildExploredArea
    ]
  );
  const explorationPolygons = useMemo(
    () =>
      shouldShowCompletedArea
        ? buildMergedExplorationPolygons(renderedExplorationCellIds, {
            maxFilledHoleAreaSquareMeters
          })
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
  const todayNewPolygons = useMemo(
    () =>
      explorationEnabled && shouldShowCompletedArea
        ? buildMergedExplorationPolygons(todayNewCellIds, {
            maxFilledHoleAreaSquareMeters
          })
        : [],
    [
      explorationEnabled,
      maxFilledHoleAreaSquareMeters,
      shouldShowCompletedArea,
      todayNewCellIds
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
        {shouldShowCompletedArea ? explorationPolygons.map((polygon) => (
          <Polygon
            key={polygon.id}
            coordinates={polygon.coordinates}
            holes={polygon.holes}
            fillColor={areaStyle.fillColor}
            strokeColor={areaStyle.fillColor}
            strokeWidth={1}
          />
        )) : null}
        {shouldShowCompletedArea ? todayNewPolygons.map((polygon) => (
          <Polygon
            key={`today-${polygon.id}`}
            coordinates={polygon.coordinates}
            holes={polygon.holes}
            fillColor={areaStyle.todayFillColor}
            strokeColor={areaStyle.todayFillColor}
            strokeWidth={1}
          />
        )) : null}

        {shouldShowOutline ? explorationOutlineSegments.map((segment) => (
          <Polyline
            coordinates={segment.coordinates}
            key={`outline-${segment.id}`}
            lineCap="round"
            lineJoin="round"
            strokeColor={areaStyle.outlineColor}
            strokeWidth={areaStyle.outlineWidth}
          />
        )) : null}

        {selectedZone && renderLevel !== "far"
          ? selectedZone.geometry.map((ring, index) => (
              <Polygon
                coordinates={ring}
                fillColor="rgba(37, 99, 235, 0.06)"
                key={`${selectedZone.id}-${index}`}
                strokeColor="rgba(37, 99, 235, 0.62)"
                strokeWidth={2}
              />
            ))
          : null}

        {shouldShowRoutes ? pathWalks.map((walk) => {
          const color = getPathColor(walk.id);
          const isHighlighted = highlightedSessionId === walk.id;
          const isDimmed = highlightedSessionId !== null && !isHighlighted;
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
              color="#ef4444"
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

        {playerLocation ? (
          <PlayerLocationMarker
            activePoints={activePoints}
            location={playerLocation}
          />
        ) : null}
      </ApplePoiFilteredMapView>
    </View>
  );
}

const PLAYER_MOVING_SPEED_METERS_PER_SECOND = 0.45;
const PLAYER_HEADING_SPEED_METERS_PER_SECOND = 0.35;
const PLAYER_BEARING_MIN_DISTANCE_METERS = 3;
const PLAYER_MOTION_FRESHNESS_MS = 10_000;
const LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS = 5_000;

function PlayerLocationMarker({
  activePoints,
  location
}: {
  activePoints: GpsPoint[];
  location: GpsPoint;
}) {
  const movement = getRecentMovement(activePoints);
  const [isAcceptedFixFresh, setIsAcceptedFixFresh] = useState(() =>
    isPlayerMotionPointFresh(location)
  );
  const liveSpeed =
    typeof location.speedMetersPerSecond === "number"
      ? location.speedMetersPerSecond
      : null;
  const isMoving =
    isAcceptedFixFresh &&
    activePoints.length > 0 &&
    Math.max(liveSpeed ?? 0, movement?.speedMetersPerSecond ?? 0) >=
      PLAYER_MOVING_SPEED_METERS_PER_SECOND;
  const heading = getPlayerHeading(location, movement);
  const headingAnimation = useRef(new Animated.Value(heading ?? 0)).current;
  const motionAnimation = useRef(new Animated.Value(0)).current;
  const [isMarkerImageLoaded, setIsMarkerImageLoaded] = useState(false);

  useEffect(() => {
    const timestamp = getPointTimestamp(location);
    const now = Date.now();
    const expiresIn = timestamp + PLAYER_MOTION_FRESHNESS_MS - now;
    const isFresh =
      Number.isFinite(timestamp) &&
      timestamp <= now + LOCATION_TIMESTAMP_FUTURE_TOLERANCE_MS &&
      expiresIn > 0;
    const settleMotion = () => {
      motionAnimation.stopAnimation();
      motionAnimation.setValue(0);
      setIsAcceptedFixFresh(false);
    };

    if (!isFresh) {
      settleMotion();
      return;
    }

    setIsAcceptedFixFresh(true);
    const freshnessTimer = setTimeout(settleMotion, expiresIn + 25);

    return () => clearTimeout(freshnessTimer);
  }, [location.timestamp, motionAnimation]);

  useEffect(() => {
    if (heading === null) {
      return;
    }

    let cancelled = false;

    headingAnimation.stopAnimation((currentHeading) => {
      if (cancelled) {
        return;
      }

      const normalizedCurrent = normalizeHeading(currentHeading);
      const delta = shortestHeadingDelta(normalizedCurrent, heading);
      const targetHeading = normalizedCurrent + delta;

      headingAnimation.setValue(normalizedCurrent);
      Animated.timing(headingAnimation, {
        duration: Math.min(480, 180 + Math.abs(delta) * 2),
        easing: Easing.out(Easing.cubic),
        toValue: targetHeading,
        useNativeDriver: true
      }).start(({ finished }) => {
        if (finished) {
          headingAnimation.setValue(normalizeHeading(targetHeading));
        }
      });
    });

    return () => {
      cancelled = true;
      headingAnimation.stopAnimation();
    };
  }, [heading, headingAnimation]);

  useEffect(() => {
    motionAnimation.stopAnimation();

    if (!isMoving) {
      Animated.timing(motionAnimation, {
        duration: 140,
        toValue: 0,
        useNativeDriver: true
      }).start();
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motionAnimation, {
          duration: 260,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(motionAnimation, {
          duration: 260,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true
        })
      ])
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [isMoving, motionAnimation]);

  const rotation = headingAnimation.interpolate({
    inputRange: [-360, 720],
    outputRange: ["-360deg", "720deg"]
  });
  const npcScale = motionAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.055]
  });
  const npcLift = motionAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1.5]
  });
  const haloScale = motionAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.14]
  });
  const haloOpacity = motionAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 0.42]
  });

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={pointToCoordinate(location)}
      flat
      title="Current player location"
      tracksViewChanges={isMoving || !isMarkerImageLoaded}
      zIndex={1000}
    >
      <View collapsable={false} style={styles.playerMarker}>
        <Animated.View
          style={[
            styles.playerHalo,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }]
            }
          ]}
        />
        <Animated.View
          renderToHardwareTextureAndroid
          style={[
            styles.playerRotationLayer,
            {
              transform: [{ rotate: rotation }]
            }
          ]}
        >
          <View style={styles.playerDirectionPip} />
          <Animated.Image
            onLoad={() => setIsMarkerImageLoaded(true)}
            resizeMode="contain"
            source={require("../../assets/player-npc-topdown.png")}
            style={[
              styles.playerNpc,
              {
                transform: [{ translateY: npcLift }, { scale: npcScale }]
              }
            ]}
          />
        </Animated.View>
      </View>
    </Marker>
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

function shortestHeadingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
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
    return "rgba(14, 116, 144, 0.75)";
  }

  return isDimmed ? "rgba(100, 116, 139, 0.35)" : color;
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
  return PATH_COLORS[sessionId % PATH_COLORS.length] ?? "#2563eb";
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
  playerDirectionPip: {
    backgroundColor: "#9cff00",
    borderColor: "#0f172a",
    borderRadius: 4,
    borderWidth: 1.5,
    height: 7,
    left: 29,
    position: "absolute",
    top: -2,
    width: 7,
    zIndex: 3
  },
  playerHalo: {
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    borderColor: "#9cff00",
    borderRadius: 29,
    borderWidth: 2.5,
    height: 58,
    left: 3,
    position: "absolute",
    shadowColor: "#0f172a",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    top: 3,
    width: 58
  },
  playerMarker: {
    alignItems: "center",
    height: 64,
    justifyContent: "center",
    overflow: "visible",
    width: 64
  },
  playerNpc: {
    height: 62,
    width: 62
  },
  playerRotationLayer: {
    alignItems: "center",
    height: 64,
    justifyContent: "center",
    width: 64
  }
});
