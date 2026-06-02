import { StyleSheet, Text, View } from "react-native";

import { MODE_LOCATION_CONFIG } from "../constants/config";
import { ActivityMode, GpsPoint } from "../types/walk";

type GpsStatusPanelProps = {
  activityMode: ActivityMode;
  currentLocation: GpsPoint | null;
  isRecording: boolean;
  lastRejectedPointReason: string | null;
  speedMetersPerSecond: number;
};

export function GpsStatusPanel({
  activityMode,
  currentLocation,
  isRecording,
  lastRejectedPointReason,
  speedMetersPerSecond
}: GpsStatusPanelProps) {
  const accuracy = currentLocation?.accuracy;
  const modeConfig = MODE_LOCATION_CONFIG[activityMode];
  const isWeakSignal =
    typeof accuracy === "number" && accuracy > modeConfig.maxAcceptedAccuracyMeters;
  const status = getStatusLabel(
    Boolean(currentLocation),
    isRecording,
    isWeakSignal,
    lastRejectedPointReason
  );

  return (
    <View style={styles.container}>
      <View style={[styles.dot, isWeakSignal ? styles.warningDot : styles.goodDot]} />
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.detail}>{formatAccuracy(accuracy)}</Text>
      {isRecording ? <Text style={styles.detail}>{formatSpeed(speedMetersPerSecond)}</Text> : null}
    </View>
  );
}

function getStatusLabel(
  hasLocation: boolean,
  isRecording: boolean,
  isWeakSignal: boolean,
  lastRejectedPointReason: string | null
) {
  if (!hasLocation) {
    return "Waiting for GPS";
  }

  if (lastRejectedPointReason) {
    return lastRejectedPointReason;
  }

  if (isWeakSignal) {
    return "Weak GPS";
  }

  return isRecording ? "Recording" : "GPS ready";
}

function formatAccuracy(accuracy: number | null | undefined) {
  if (typeof accuracy !== "number") {
    return "Accuracy unknown";
  }

  return `Accuracy ${Math.round(accuracy)} m`;
}

function formatSpeed(metersPerSecond: number) {
  return `${Math.round(metersPerSecond * 3.6)} km/h`;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  detail: {
    color: "#64748b",
    fontSize: 12
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  goodDot: {
    backgroundColor: "#16a34a"
  },
  status: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700"
  },
  warningDot: {
    backgroundColor: "#f97316"
  }
});
