import { Fragment, useEffect, useRef, useState } from "react";
import MapView, { Marker, Polygon, Polyline, Region } from "react-native-maps";
import { StyleSheet, View } from "react-native";

import { MAP_CONFIG } from "../constants/config";
import { CachedZone } from "../database/completionRepository";
import {
  buildExplorationCells,
  buildExplorationOutlineSegments,
  buildMergedExplorationPolygons
} from "../services/explorationArea";
import { buildPathSegments } from "../services/pathInference";
import { simplifyGpsPointsForRender } from "../services/routeSimplification";
import { MapLayerState } from "../types/mapLayers";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint, WalkWithPoints } from "../types/walk";

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
  selectedZone: CachedZone | null;
  streetSegments: OsmStreetSegment[];
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
  selectedZone
}: ExplorationMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredOnInitialLocation = useRef(false);
  const [isAutoFollowEnabled, setIsAutoFollowEnabled] = useState(true);
  const region = getInitialRegion(currentLocation, walks, activePoints);
  const [visibleRegion, setVisibleRegion] = useState(region);
  const renderLevel = getMapRenderLevel(visibleRegion.latitudeDelta);
  const areaStyle = getExploredAreaStyle(visibleRegion.latitudeDelta);
  const pathSimplificationToleranceMeters = getPathSimplificationTolerance(
    visibleRegion.latitudeDelta
  );
  const explorationCells = buildExplorationCells(walks, activePoints, activeMode, loopFillCellIds);
  const explorationOutlineSegments = buildExplorationOutlineSegments(explorationCells);
  const explorationPolygons = buildMergedExplorationPolygons(explorationCells);
  const shouldShowCompletedArea = layers.showExploredCells;
  const shouldShowOutline = layers.showExploredCells && renderLevel !== "far";
  const shouldShowRoutes = layers.showPaths && renderLevel === "close";
  const shouldShowMarkers = layers.showMarkers && renderLevel === "close";

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
    if (!selectedZone) {
      return;
    }

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
  }, [selectedZone]);

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
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onPanDrag={() => setIsAutoFollowEnabled(false)}
        onMapReady={onMapReady}
        onRegionChangeComplete={setVisibleRegion}
        onTouchStart={() => setIsAutoFollowEnabled(false)}
        pitchEnabled
        rotateEnabled
        scrollEnabled
        zoomTapEnabled
        showsUserLocation={Boolean(currentLocation)}
        showsMyLocationButton={false}
        zoomEnabled
        followsUserLocation={false}
      >
        {shouldShowCompletedArea ? explorationPolygons.map((polygon) => (
          <Polygon
            key={polygon.id}
            coordinates={polygon.coordinates}
            fillColor={areaStyle.fillColor}
            strokeColor="rgba(239, 68, 68, 0)"
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

        {shouldShowMarkers && currentLocation ? (
          <Marker coordinate={pointToCoordinate(currentLocation)} title="Current location" />
        ) : null}
      </MapView>
    </View>
  );
}

function getExploredAreaStyle(latitudeDelta: number) {
  if (latitudeDelta > 0.07) {
    return {
      fillColor: "rgba(239, 68, 68, 0.50)",
      outlineColor: "rgba(0, 0, 0, 0.34)",
      outlineWidth: 1
    };
  }

  if (latitudeDelta > 0.035) {
    return {
      fillColor: "rgba(239, 68, 68, 0.46)",
      outlineColor: "rgba(0, 0, 0, 0.54)",
      outlineWidth: 1.5
    };
  }

  if (latitudeDelta > 0.014) {
    return {
      fillColor: "rgba(239, 68, 68, 0.40)",
      outlineColor: "rgba(0, 0, 0, 0.74)",
      outlineWidth: 2.4
    };
  }

  return {
    fillColor: "rgba(239, 68, 68, 0.34)",
    outlineColor: "rgba(0, 0, 0, 0.92)",
    outlineWidth: 3.5
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

function getPathSimplificationTolerance(latitudeDelta: number) {
  if (latitudeDelta > 0.08) {
    return 35;
  }

  if (latitudeDelta > 0.035) {
    return 20;
  }

  if (latitudeDelta > 0.015) {
    return 8;
  }

  return 0;
}

function PathSegmentLines({
  activityMode,
  color,
  isDimmed,
  isHighlighted,
  points,
  simplificationToleranceMeters
}: {
  activityMode: ActivityMode;
  color: string;
  isDimmed: boolean;
  isHighlighted: boolean;
  points: GpsPoint[];
  simplificationToleranceMeters: number;
}) {
  return (
    <>
      {buildPathSegments(points, activityMode).map((segment, index) => {
        if (segment.type === "rejected") {
          return null;
        }

        const strokeColor = getSegmentStrokeColor({
          color,
          isDimmed,
          isInferred: false
        });

        return (
          <Polyline
            coordinates={simplifyGpsPointsForRender(
              segment.points,
              simplificationToleranceMeters
            ).map(pointToCoordinate)}
            key={`${segment.type}-${index}-${segment.startPoint.timestamp}`}
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
  }
});
