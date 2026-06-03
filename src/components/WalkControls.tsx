import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

import { ACTIVITY_MODE_RECORDING_NOUNS } from "../constants/activityModes";
import { formatDistance, formatDuration } from "../services/distance";
import { ActivityMode } from "../types/walk";

type WalkControlsProps = {
  activityMode: ActivityMode;
  isRecording: boolean;
  distanceMeters: number;
  durationSeconds: number;
  gpsAccuracyMeters?: number | null;
  gpsStatus?: string | null;
  pointCount: number;
  speedMetersPerSecond?: number;
  stepCount: number;
  todayStepCount: number;
  onStart: () => void;
  onStop: () => void;
};

export function WalkControls({
  activityMode,
  isRecording,
  distanceMeters,
  durationSeconds,
  gpsAccuracyMeters,
  gpsStatus,
  pointCount,
  speedMetersPerSecond = 0,
  stepCount,
  todayStepCount,
  onStart,
  onStop
}: WalkControlsProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.metrics}>
        <Metric label="Distance" value={formatDistance(distanceMeters)} />
        <Metric label="Duration" value={formatDuration(durationSeconds)} />
        <Metric label="Steps today" value={formatSteps(todayStepCount)} />
      </View>

      {isRecording ? (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setDetailsExpanded((expanded) => !expanded)}
          style={styles.detailsToggle}
        >
          <Ionicons
            name={detailsExpanded ? "chevron-down" : "chevron-up"}
            color="#0f172a"
            size={16}
          />
          <Text style={styles.detailsToggleText}>
            {detailsExpanded ? "Hide recording details" : "Recording details"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {isRecording && detailsExpanded ? (
        <View style={styles.details}>
          <Metric label="Steps" value={formatSteps(stepCount)} />
          <Metric label="GPS pts" value={pointCount.toString()} />
          <Metric label="Speed" value={formatSpeed(speedMetersPerSecond)} />
          <Metric label="GPS" value={formatGps(gpsAccuracyMeters)} />
          {gpsStatus ? <Text style={styles.gpsStatus}>{gpsStatus}</Text> : null}
        </View>
      ) : null}

      <TouchableOpacity
        accessibilityRole="button"
        onPress={isRecording ? onStop : onStart}
        style={[styles.button, isRecording ? styles.stopButton : styles.startButton]}
      >
        <Ionicons
          name={isRecording ? "stop-circle" : "play-circle"}
          color="#ffffff"
          size={22}
        />
        <Text style={styles.buttonText}>
          {isRecording
            ? `Stop ${ACTIVITY_MODE_RECORDING_NOUNS[activityMode]}`
            : `Start ${ACTIVITY_MODE_RECORDING_NOUNS[activityMode]}`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function formatSpeed(metersPerSecond: number) {
  return `${Math.round(metersPerSecond * 3.6)} km/h`;
}

function formatGps(accuracyMeters: number | null | undefined) {
  if (typeof accuracyMeters !== "number") {
    return "Unknown";
  }

  return `${Math.round(accuracyMeters)} m`;
}

function formatSteps(steps: number) {
  return Math.max(0, Math.round(steps)).toLocaleString();
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  container: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  details: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 10
  },
  detailsToggle: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 5,
    paddingVertical: 2
  },
  detailsToggleText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  gpsStatus: {
    color: "#64748b",
    flexBasis: "100%",
    fontSize: 12,
    fontWeight: "700"
  },
  metric: {
    flex: 1
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  metricValue: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  },
  metrics: {
    flexDirection: "row",
    gap: 12
  },
  startButton: {
    backgroundColor: "#2563eb"
  },
  stopButton: {
    backgroundColor: "#dc2626"
  }
});
