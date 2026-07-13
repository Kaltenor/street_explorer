import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ForwardRefExoticComponent, RefAttributes } from "react";
import MapView, { Marker, Polygon, Polyline, Region } from "react-native-maps";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { MAP_CONFIG } from "../constants/config";
import { CachedZone } from "../database/completionRepository";
import {
  buildExplorationPolygonOutlineSegments,
  buildMergedExplorationPolygons,
  collectExplorationCellIds
} from "../services/explorationArea";
import { haversineDistanceMeters } from "../services/distance";
import { buildPathSegments } from "../services/pathInference";
import { LOOP_FILL_CONFIG } from "../services/loopFill";
import { simplifyGpsPointsForRender } from "../services/routeSimplification";
import { MapLayerState } from "../types/mapLayers";
import { ActivityMode, GpsPoint, RenderedRouteSegment, WalkWithPoints } from "../types/walk";

type ExplorationMapProps = {
  walks: WalkWithPoints[];
  pathWalks: WalkWithPoints[];
  activePoints: GpsPoint[];
  activeMode: ActivityMode;
  currentLocation: GpsPoint | null;
  highlightedSessionId: number | null;
  layers: MapLayerState;
  loopFillCellIds: string[];
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
  pathWalks,
  activePoints,
  activeMode,
  currentLocation,
  highlightedSessionId,
  layers,
  loopFillCellIds,
  onMapReady,
  onVisibleRegionChange,
  selectedZone,
  todayNewCellIds,
  zoneFocusRequestId
}: ExplorationMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredOnInitialLocation = useRef(false);
  const handledZoneFocusRequestId = useRef(zoneFocusRequestId);
  const [isAutoFollowEnabled, setIsAutoFollowEnabled] = useState(true);
  const region = getInitialRegion(currentLocation, walks, activePoints);
  const [visibleRegion, setVisibleRegion] = useState(region);
  const renderLevel = getMapRenderLevel(visibleRegion.latitudeDelta);
  const areaStyle = getExploredAreaStyle(visibleRegion.latitudeDelta);
  // Preserve every finalized street corner so rendered routes never cut through buildings.
  const pathSimplificationToleranceMeters = 0;
  const shouldShowCompletedArea = layers.showExploredCells;
  const shouldShowOutline = layers.showExploredCells && renderLevel !== "far";
  const shouldShowRoutes = layers.showPaths && renderLevel === "close";
  const shouldShowMarkers = layers.showMarkers && renderLevel === "close";
  const playerLocation = activePoints.at(-1) ?? currentLocation;
  const shouldBuildSavedArea = shouldShowCompletedArea || shouldShowOutline;
  const maxFilledHoleAreaSquareMeters =
    LOOP_FILL_CONFIG.maxPolygonAreaSquareMetersByMode[activeMode];
  const savedExplorationCellIds = useMemo(
    () =>
      shouldBuildSavedArea
        ? collectExplorationCellIds(walks, [], activeMode, loopFillCellIds)
        : [],
    [activeMode, loopFillCellIds, shouldBuildSavedArea, walks]
  );
  const activeExplorationCellIds = useMemo(
    () =>
      shouldShowCompletedArea && activePoints.length > 1
        ? collectExplorationCellIds([], activePoints, activeMode)
        : [],
    [activeMode, activePoints, shouldShowCompletedArea]
  );
  const explorationPolygons = useMemo(
    () =>
      shouldShowCompletedArea
        ? buildMergedExplorationPolygons(savedExplorationCellIds, {
            maxFilledHoleAreaSquareMeters
          })
        : [],
    [maxFilledHoleAreaSquareMeters, savedExplorationCellIds, shouldShowCompletedArea]
  );
  const activeExplorationPolygons = useMemo(
    () =>
      shouldShowCompletedArea
        ? buildMergedExplorationPolygons(activeExplorationCellIds)
        : [],
    [activeExplorationCellIds, shouldShowCompletedArea]
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
      shouldShowCompletedArea
        ? buildMergedExplorationPolygons(todayNewCellIds)
        : [],
    [shouldShowCompletedArea, todayNewCellIds]
  );

  useEffect(() => {
    if (!currentLocation || hasCenteredOnInitialLocation.current) {
      return;
    }

    hasCenteredOnInitialLocation.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
      },
      450
    );
  }, [currentLocation]);

  useEffect(() => {
    if (activePoints.length === 0) {
      setIsAutoFollowEnabled(true);
      return;
    }

    if (activePoints.length < 2 || !isAutoFollowEnabled) {
      return;
    }

    fitToPoints(activePoints, {
      bottom: 230,
      left: 48,
      right: 48,
      top: 190
    });
  }, [activePoints, isAutoFollowEnabled]);

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
        onPanDrag={() => setIsAutoFollowEnabled(false)}
        onMapReady={onMapReady}
        onRegionChangeComplete={handleRegionChangeComplete}
        onTouchStart={() => setIsAutoFollowEnabled(false)}
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
            strokeColor="rgba(239, 68, 68, 0)"
            strokeWidth={0}
          />
        )) : null}
        {shouldShowCompletedArea ? activeExplorationPolygons.map((polygon) => (
          <Polygon
            key={"active-" + polygon.id}
            coordinates={polygon.coordinates}
            holes={polygon.holes}
            fillColor={areaStyle.fillColor}
            strokeColor="rgba(239, 68, 68, 0)"
            strokeWidth={0}
          />
        )) : null}

        {shouldShowCompletedArea ? todayNewPolygons.map((polygon) => (
          <Polygon
            key={`today-${polygon.id}`}
            coordinates={polygon.coordinates}
            holes={polygon.holes}
            fillColor={areaStyle.todayFillColor}
            strokeColor="rgba(248, 113, 113, 0)"
            strokeWidth={0}
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

        {activePoints[0] && renderLevel === "close" ? (
          <>
            <PathSegmentLines
              activityMode={activeMode}
              color="#ef4444"
              isDimmed={false}
              isHighlighted
              points={activePoints}
              simplificationToleranceMeters={0}
            />
            {shouldShowMarkers ? <Marker
              coordinate={pointToCoordinate(activePoints[0])}
              pinColor="#16a34a"
              title="Recording start"
            /> : null}
          </>
        ) : null}

        {playerLocation && currentLocation ? (
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

function PlayerLocationMarker({
  activePoints,
  location
}: {
  activePoints: GpsPoint[];
  location: GpsPoint;
}) {
  const movement = getRecentMovement(activePoints);
  const liveSpeed =
    typeof location.speedMetersPerSecond === "number"
      ? location.speedMetersPerSecond
      : null;
  const isMoving =
    activePoints.length > 0 &&
    Math.max(liveSpeed ?? 0, movement?.speedMetersPerSecond ?? 0) >=
      PLAYER_MOVING_SPEED_METERS_PER_SECOND;
  const heading = getPlayerHeading(location, movement);
  const headingAnimation = useRef(new Animated.Value(heading ?? 0)).current;
  const motionAnimation = useRef(new Animated.Value(0)).current;

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
      tracksViewChanges={activePoints.length > 0}
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

function PathSegmentLines({
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
  segments?: RenderedRouteSegment[] | null;
  simplificationToleranceMeters: number;
}) {
  const renderedSegments = segments ?? buildPathSegments(points, activityMode);

  return (
    <>
      {renderedSegments.map((segment, index) => {
        if (segment.type === "rejected") {
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
            key={`${segment.type}-${index}-${segment.points[0]?.timestamp ?? "route"}`}
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

function getInitialRegion(
  currentLocation: GpsPoint | null,
  walks: WalkWithPoints[],
  activePoints: GpsPoint[]
): Region {
  const fallbackPoint = walks.find((walk) => walk.points.length > 0)?.points[0] ?? activePoints[0];
  const center = currentLocation ?? fallbackPoint;

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
