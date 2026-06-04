import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

import { ACTIVITY_MODE_RECORDING_NOUNS } from "../constants/activityModes";
import { formatDistance, formatDuration } from "../services/distance";
import { RecordingQuality } from "../services/recordingQuality";
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
  recordingQuality: RecordingQuality;
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
  recordingQuality,
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
        <View style={styles.recordingStatusRow}>
          <View style={[styles.qualityBadge, getQualityStyle(recordingQuality.label)]}>
            <Text style={styles.qualityText}>{recordingQuality.label}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setDetailsExpanded((expanded) => !expanded)}
            style={styles.detailsToggle}
          >
            <Ionicons
              name={detailsExpanded ? "chevron-down" : "chevron-up"}
              color="#f8fafc"
              size={16}
            />
            <Text style={styles.detailsToggleText}>
              {detailsExpanded ? "Hide recording details" : "Recording details"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isRecording && detailsExpanded ? (
        <View style={styles.details}>
          <Metric label="Steps" value={formatSteps(stepCount)} />
          <Metric label="GPS pts" value={pointCount.toString()} />
          <Metric label="Speed" value={formatSpeed(speedMetersPerSecond)} />
          <Metric label="GPS" value={formatGps(gpsAccuracyMeters)} />
          <Text style={styles.gpsStatus}>{recordingQuality.reason}</Text>
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

function getQualityStyle(label: RecordingQuality["label"]) {
  if (label === "Good") {
    return styles.goodQuality;
  }

  if (label === "Poor") {
    return styles.poorQuality;
  }

  return styles.okQuality;
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
    backgroundColor: "rgba(2, 6, 10, 0.9)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  details: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderColor: "rgba(248, 250, 252, 0.14)",
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
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  gpsStatus: {
    color: "#cbd5e1",
    flexBasis: "100%",
    fontSize: 12,
    fontWeight: "700"
  },
  goodQuality: {
    backgroundColor: "rgba(22, 163, 74, 0.32)",
    borderColor: "#86efac"
  },
  metric: {
    flex: 1
  },
  metricLabel: {
    color: "#cbd5e1",
    fontSize: 12,
    marginTop: 2
  },
  metricValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700"
  },
  metrics: {
    flexDirection: "row",
    gap: 12
  },
  okQuality: {
    backgroundColor: "rgba(234, 179, 8, 0.32)",
    borderColor: "#fde047"
  },
  poorQuality: {
    backgroundColor: "rgba(220, 38, 38, 0.32)",
    borderColor: "#fca5a5"
  },
  qualityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  qualityText: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900"
  },
  recordingStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  startButton: {
    backgroundColor: "#2563eb"
  },
  stopButton: {
    backgroundColor: "#dc2626"
  }
});
