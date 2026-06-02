import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { formatDuration } from "../services/distance";
import { ActiveWalk } from "../types/walk";

export type BackgroundTrackingStatus =
  | "idle"
  | "starting"
  | "enabled"
  | "foreground-only"
  | "unavailable";

type RecordingHealthPanelProps = {
  activeWalk: ActiveWalk | null;
  backgroundMessage: string | null;
  backgroundStatus: BackgroundTrackingStatus;
};

export function RecordingHealthPanel({
  activeWalk,
  backgroundMessage,
  backgroundStatus
}: RecordingHealthPanelProps) {
  if (!activeWalk) {
    return null;
  }

  const latestPoint = activeWalk.points.at(-1);
  const latestPointAgeSeconds = latestPoint
    ? Math.max(0, Math.round((Date.now() - new Date(latestPoint.timestamp).getTime()) / 1000))
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name={getStatusIcon(backgroundStatus)}
          size={17}
          color={getStatusColor(backgroundStatus)}
        />
        <Text style={styles.title}>{getStatusLabel(backgroundStatus)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.detail}>{formatLatestPoint(latestPointAgeSeconds)}</Text>
        <Text style={styles.detail}>{activeWalk.points.length} saved points</Text>
      </View>

      <Text style={styles.quality}>
        {activeWalk.lastRejectedPointReason ?? "GPS points are being accepted."}
      </Text>

      {backgroundMessage ? <Text style={styles.message}>{backgroundMessage}</Text> : null}
    </View>
  );
}

function getStatusIcon(status: BackgroundTrackingStatus) {
  if (status === "enabled") {
    return "cloud-done-outline";
  }

  if (status === "starting") {
    return "sync-outline";
  }

  return "phone-portrait-outline";
}

function getStatusColor(status: BackgroundTrackingStatus) {
  if (status === "enabled") {
    return "#16a34a";
  }

  if (status === "starting") {
    return "#2563eb";
  }

  return "#f97316";
}

function getStatusLabel(status: BackgroundTrackingStatus) {
  if (status === "enabled") {
    return "Background recording on";
  }

  if (status === "starting") {
    return "Starting background recording";
  }

  if (status === "unavailable") {
    return "Background unavailable";
  }

  return "Foreground recording only";
}

function formatLatestPoint(ageSeconds: number | null) {
  if (ageSeconds === null) {
    return "Waiting for saved GPS point";
  }

  if (ageSeconds < 3) {
    return "Last point just now";
  }

  return `Last point ${formatDuration(ageSeconds)} ago`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(239, 246, 255, 0.96)",
    borderColor: "#bfdbfe",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginTop: 12,
    padding: 12
  },
  detail: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  message: {
    color: "#1e3a8a",
    fontSize: 12,
    lineHeight: 17
  },
  quality: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  title: {
    color: "#1e3a8a",
    fontSize: 14,
    fontWeight: "800"
  }
});
