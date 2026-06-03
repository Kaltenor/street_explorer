import { Fragment, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polygon, Polyline, Region } from "react-native-maps";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { MAP_CONFIG } from "../constants/config";
import { CachedZone } from "../database/completionRepository";
import {
  buildExplorationCells,
  buildExplorationOutlineSegments,
  buildMergedExplorationPolygons
} from "../services/explorationArea";
import { buildPathSegmentsWithInference } from "../services/pathInference";
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
  onToggleLayer: (layer: keyof MapLayerState) => void;
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
  onToggleLayer,
  selectedZone,
  streetSegments
}: ExplorationMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredOnInitialLocation = useRef(false);
  const [isAutoFollowEnabled, setIsAutoFollowEnabled] = useState(true);
  const region = getInitialRegion(currentLocation, walks, activePoints);
  const [visibleRegion, setVisibleRegion] = useState(region);
  const areaStyle = getExploredAreaStyle(visibleRegion.latitudeDelta);
  const explorationCells = buildExplorationCells(walks, activePoints, activeMode, loopFillCellIds);
  const explorationOutlineSegments = buildExplorationOutlineSegments(explorationCells);
  const explorationPolygons = buildMergedExplorationPolygons(explorationCells);

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

  const centerOnCurrentLocation = () => {
    if (!currentLocation) {
      return;
    }

    setIsAutoFollowEnabled(true);

    mapRef.current?.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: MAP_CONFIG.defaultLatitudeDelta,
        longitudeDelta: MAP_CONFIG.defaultLongitudeDelta
      },
      450
    );
  };

  const fitToVisiblePaths = () => {
    setIsAutoFollowEnabled(false);

    const coordinates = getAllPathPoints(pathWalks, activePoints).map(pointToCoordinate);

    if (coordinates.length === 0) {
      centerOnCurrentLocation();
      return;
    }

    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: {
        bottom: 220,
        left: 42,
        right: 42,
        top: 190
      }
    });
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
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onPanDrag={() => setIsAutoFollowEnabled(false)}
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
        {layers.showExploredCells ? explorationPolygons.map((polygon) => (
          <Polygon
            key={polygon.id}
            coordinates={polygon.coordinates}
            fillColor={areaStyle.fillColor}
            strokeColor="rgba(239, 68, 68, 0)"
            strokeWidth={0}
          />
        )) : null}

        {layers.showExploredCells ? explorationOutlineSegments.map((segment) => (
          <Polyline
            coordinates={segment.coordinates}
            key={`outline-${segment.id}`}
            lineCap="round"
            lineJoin="round"
            strokeColor={areaStyle.outlineColor}
            strokeWidth={areaStyle.outlineWidth}
          />
        )) : null}

        {selectedZone
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

        {layers.showPaths ? pathWalks.map((walk) => {
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
                streetSegments={streetSegments}
              />
              {layers.showMarkers && firstPoint ? (
                <Marker
                  coordinate={pointToCoordinate(firstPoint)}
                  pinColor="#16a34a"
                  title="Start"
                  description={formatMarkerDate(walk.startedAt)}
                />
              ) : null}
              {layers.showMarkers && lastPoint ? (
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

        {activePoints[0] ? (
          <>
            <PathSegmentLines
              activityMode={activeMode}
              color="#ef4444"
              isDimmed={false}
              isHighlighted
              points={activePoints}
              streetSegments={streetSegments}
            />
            {layers.showMarkers ? <Marker
              coordinate={pointToCoordinate(activePoints[0])}
              pinColor="#16a34a"
              title="Recording start"
            /> : null}
          </>
        ) : null}

        {layers.showMarkers && currentLocation ? (
          <Marker coordinate={pointToCoordinate(currentLocation)} title="Current location" />
        ) : null}
      </MapView>

      <View style={styles.controls}>
        <TouchableOpacity
          accessibilityLabel="Center on me"
          accessibilityRole="button"
          disabled={!currentLocation}
          onPress={centerOnCurrentLocation}
          style={[
            styles.controlButton,
            isAutoFollowEnabled ? styles.activeControlButton : null,
            !currentLocation ? styles.disabledButton : null
          ]}
        >
          <Ionicons name="locate" size={22} color={isAutoFollowEnabled ? "#ffffff" : "#0f172a"} />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Fit all paths"
          accessibilityRole="button"
          onPress={fitToVisiblePaths}
          style={styles.controlButton}
        >
          <Ionicons name="scan" size={22} color="#0f172a" />
        </TouchableOpacity>
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
    </View>
  );
}

function getExploredAreaStyle(latitudeDelta: number) {
  if (latitudeDelta > 0.045) {
    return {
      fillColor: "rgba(239, 68, 68, 0.42)",
      outlineColor: "rgba(0, 0, 0, 0.48)",
      outlineWidth: 1.5
    };
  }

  if (latitudeDelta > 0.018) {
    return {
      fillColor: "rgba(239, 68, 68, 0.38)",
      outlineColor: "rgba(0, 0, 0, 0.72)",
      outlineWidth: 2
    };
  }

  return {
    fillColor: "rgba(239, 68, 68, 0.34)",
    outlineColor: "rgba(0, 0, 0, 0.9)",
    outlineWidth: 3
  };
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
      style={[styles.layerControlButton, active ? styles.activeControlButton : null]}
    >
      <Ionicons name={icon} size={18} color={active ? "#ffffff" : "#0f172a"} />
    </TouchableOpacity>
  );
}

function PathSegmentLines({
  activityMode,
  color,
  isDimmed,
  isHighlighted,
  points,
  streetSegments
}: {
  activityMode: ActivityMode;
  color: string;
  isDimmed: boolean;
  isHighlighted: boolean;
  points: GpsPoint[];
  streetSegments: OsmStreetSegment[];
}) {
  return (
    <>
      {buildPathSegmentsWithInference(points, activityMode, streetSegments).map((segment, index) => {
        if (segment.type === "rejected") {
          return (
            <Polyline
              coordinates={[
                pointToCoordinate(segment.startPoint),
                pointToCoordinate(segment.endPoint)
              ]}
              key={`${segment.type}-${index}-${segment.startPoint.timestamp}`}
              lineCap="round"
              lineDashPattern={[3, 8]}
              lineJoin="round"
              strokeColor={isDimmed ? "rgba(180, 83, 9, 0.25)" : "rgba(180, 83, 9, 0.62)"}
              strokeWidth={isHighlighted ? 5 : 3}
            />
          );
        }

        const isInferred = segment.type === "inferred";
        const strokeColor = getSegmentStrokeColor({
          color,
          isDimmed,
          isInferred
        });

        return (
          <Polyline
            coordinates={segment.points.map(pointToCoordinate)}
            key={`${segment.type}-${index}-${segment.startPoint.timestamp}`}
            lineCap="round"
            lineDashPattern={isInferred ? [8, 7] : undefined}
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

function getAllPathPoints(walks: WalkWithPoints[], activePoints: GpsPoint[]) {
  return [...walks.flatMap((walk) => walk.points), ...activePoints];
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
  activeControlButton: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  container: {
    ...StyleSheet.absoluteFillObject
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  controls: {
    gap: 8,
    position: "absolute",
    right: 16,
    top: 210
  },
  disabledButton: {
    opacity: 0.45
  },
  layerControlButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  map: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  }
});
