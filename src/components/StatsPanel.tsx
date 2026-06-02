import { StyleSheet, Text, View } from "react-native";

import { formatDistance, formatDuration } from "../services/distance";
import { ActivityMode, LifetimeStats } from "../types/walk";

type StatsPanelProps = {
  activityMode: ActivityMode;
  stats: LifetimeStats;
};

export function StatsPanel({ activityMode, stats }: StatsPanelProps) {
  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        <Stat label={getCountLabel(activityMode)} value={stats.walkCount.toString()} />
        <Stat label="Distance" value={formatDistance(stats.totalDistanceMeters)} />
        <Stat label="Duration" value={formatDuration(stats.totalDurationSeconds)} />
      </View>
      <View style={styles.secondaryRow}>
        <Stat label="Today" value={formatDistance(stats.todayDistanceMeters)} />
        <Stat label="Latest" value={formatDistance(stats.latestRecordingDistanceMeters)} />
        <Stat label="Longest" value={formatDistance(stats.longestRecordingDistanceMeters)} />
        <Stat label="Cells" value={stats.exploredCellCount.toString()} />
        <Stat label="New" value={stats.newCellsThisRecording.toString()} />
        <Stat label="Area" value={formatArea(stats.approximateExploredAreaSquareMeters)} />
      </View>
      <Text style={styles.caption}>
        {stats.todayRecordingCount} {stats.todayRecordingCount === 1 ? "recording" : "recordings"}{" "}
        today
      </Text>
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
    gap: 10,
    padding: 12
  },
  caption: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  stat: {
    flex: 1,
    minWidth: "28%"
  },
  primaryRow: {
    flexDirection: "row",
    gap: 12
  },
  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  value: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  }
});
