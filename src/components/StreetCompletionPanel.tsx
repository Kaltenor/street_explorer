import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatDistance } from "../services/distance";
import { StreetCompletionSummary } from "../types/street";

type StreetCompletionPanelProps = {
  canLoad: boolean;
  isLoading: boolean;
  onLoadNearbyStreets: () => void;
  summary: StreetCompletionSummary;
};

export function StreetCompletionPanel({
  canLoad,
  isLoading,
  onLoadNearbyStreets,
  summary
}: StreetCompletionPanelProps) {
  const completionPercent =
    summary.totalDistanceMeters > 0
      ? Math.round((summary.exploredDistanceMeters / summary.totalDistanceMeters) * 100)
      : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>OSM debug matching</Text>
          <Text style={styles.text}>{getStatusText(summary, completionPercent)}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!canLoad || isLoading}
          onPress={onLoadNearbyStreets}
          style={[styles.loadButton, !canLoad || isLoading ? styles.disabledButton : null]}
        >
          <Ionicons name="cloud-download-outline" size={17} color="#ffffff" />
          <Text style={styles.loadButtonText}>{isLoading ? "Loading" : "Load"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metrics}>
        <Metric label="Matched" value={summary.exploredStreetCount.toString()} />
        <Metric label="Nearby" value={summary.loadedStreetCount.toString()} />
        <Metric label="Street dist." value={formatDistance(summary.exploredDistanceMeters)} />
      </View>
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

function getStatusText(summary: StreetCompletionSummary, completionPercent: number) {
  if (summary.status === "loading") {
    return "Fetching OpenStreetMap streets nearby";
  }

  if (summary.status === "error") {
    return "OSM load failed. Try again nearby or later.";
  }

  if (summary.loadedStreetCount === 0) {
    return "Load nearby OSM streets to start matching.";
  }

  return `${completionPercent}% of loaded nearby street distance matched`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
    padding: 10
  },
  disabledButton: {
    opacity: 0.55
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  loadButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10
  },
  loadButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  metric: {
    flex: 1
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2
  },
  metricValue: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  metrics: {
    flexDirection: "row",
    gap: 10
  },
  text: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  title: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800"
  }
});
