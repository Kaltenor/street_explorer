import { StyleSheet, Text, View } from "react-native";

import { formatDistance } from "../services/distance";
import { ActivityMode, LifetimeStats } from "../types/walk";

type StatsPanelProps = {
  activityMode: ActivityMode;
  stats: LifetimeStats;
};

export function StatsPanel({ activityMode, stats }: StatsPanelProps) {
  return (
    <View style={styles.container}>
      <Stat label={getCountLabel(activityMode)} value={stats.walkCount.toString()} />
      <Stat label="Distance" value={formatDistance(stats.totalDistanceMeters)} />
      <Stat label="Area" value={formatArea(stats.approximateExploredAreaSquareMeters)} />
      <Stat label="Cells" value={stats.exploredCellCount.toString()} />
      <Stat label="New" value={stats.newCellsThisRecording.toString()} />
      <Stat label="Longest" value={formatDistance(stats.longestRecordingDistanceMeters)} />
    </View>
  );
}

function getCountLabel(activityMode: ActivityMode) {
  if (activityMode === "walk") {
    return "Walks";
  }

  if (activityMode === "wheel") {
    return "Rides";
  }

  return "Drives";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function formatArea(squareMeters: number) {
  if (squareMeters < 10000) {
    return `${Math.round(squareMeters)} m2`;
  }

  return `${(squareMeters / 10000).toFixed(2)} ha`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 12
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  stat: {
    minWidth: "28%"
  },
  value: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  }
});
