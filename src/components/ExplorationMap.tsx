import { Fragment, useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polygon, Polyline, Region } from "react-native-maps";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { MAP_CONFIG } from "../constants/config";
import { buildExplorationCells } from "../services/explorationArea";
import { GpsPoint, WalkWithPoints } from "../types/walk";
import { MapLayerState } from "./LayerControls";

type ExplorationMapProps = {
  walks: WalkWithPoints[];
  activePoints: GpsPoint[];
  currentLocation: GpsPoint | null;
  highlightedSessionId: number | null;
  layers: MapLayerState;
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
  activePoints,
  currentLocation,
  highlightedSessionId,
  layers
}: ExplorationMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredOnInitialLocation = useRef(false);
  const region = getInitialRegion(currentLocation, walks, activePoints);
  const explorationCells = buildExplorationCells(walks, activePoints);

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
    if (activePoints.length < 2) {
      return;
    }

    fitToPoints(activePoints, {
      bottom: 230,
      left: 48,
      right: 48,
      top: 190
    });
  }, [activePoints]);

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

  const centerOnCurrentLocation = () => {
    if (!currentLocation) {
      return;
    }

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
    const coordinates = getAllPathPoints(walks, activePoints).map(pointToCoordinate);

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
        pitchEnabled
        rotateEnabled
        scrollEnabled
        zoomTapEnabled
        showsUserLocation={Boolean(currentLocation)}
        showsMyLocationButton={false}
        zoomEnabled
        followsUserLocation={false}
      >
        {layers.showExploredCells ? explorationCells.map((cell) => (
          <Polygon
            key={cell.id}
            coordinates={cell.coordinates}
            fillColor="rgba(34, 197, 94, 0.24)"
            strokeColor="rgba(22, 163, 74, 0.28)"
            strokeWidth={1}
          />
        )) : null}

        {/* TODO: Replace grid cells with OpenStreetMap street segments and GPS map matching. */}
        {layers.showPaths ? walks.map((walk) => {
          const coordinates = walk.points.map(pointToCoordinate);
          const color = getPathColor(walk.id);
          const isHighlighted = highlightedSessionId === walk.id;
          const isDimmed = highlightedSessionId !== null && !isHighlighted;
          const firstPoint = walk.points[0];
          const lastPoint = walk.points.at(-1);

          return (
            <Fragment key={walk.id}>
              <Polyline
                coordinates={coordinates}
                strokeColor={isDimmed ? "rgba(100, 116, 139, 0.35)" : color}
                strokeWidth={isHighlighted ? 8 : 5}
                lineCap="round"
                lineJoin="round"
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

        {layers.showPaths && activePoints[0] ? (
          <>
            <Polyline
              coordinates={activePoints.map(pointToCoordinate)}
              strokeColor="#ef4444"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
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
          style={[styles.controlButton, !currentLocation ? styles.disabledButton : null]}
        >
          <Ionicons name="locate" size={22} color="#0f172a" />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Fit all paths"
          accessibilityRole="button"
          onPress={fitToVisiblePaths}
          style={styles.controlButton}
        >
          <Ionicons name="scan" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>
    </View>
  );
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
  return PATH_COLORS[sessionId % PATH_COLORS.length];
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
  map: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  }
});
