import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_RECORDING_NOUNS } from "../constants/activityModes";
import { formatDistance, formatDuration } from "../services/distance";
import { ActivityMode } from "../types/walk";

type WalkControlsProps = {
  activityMode: ActivityMode;
  isRecording: boolean;
  distanceMeters: number;
  durationSeconds: number;
  pointCount: number;
  onStart: () => void;
  onStop: () => void;
};

export function WalkControls({
  activityMode,
  isRecording,
  distanceMeters,
  durationSeconds,
  pointCount,
  onStart,
  onStop
}: WalkControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.metrics}>
        <Metric label="Distance" value={formatDistance(distanceMeters)} />
        <Metric label="Duration" value={formatDuration(durationSeconds)} />
        <Metric label="Points" value={pointCount.toString()} />
      </View>

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
