import { StyleSheet, Text, View } from "react-native";

import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings, interpolate } from "../i18n";
import { formatDistance, formatDuration } from "../services/distance";
import { ActivityMode, LifetimeStats } from "../types/walk";

type StatsPanelProps = {
  activityMode: ActivityMode;
  language: AppLanguage;
  stats: LifetimeStats;
};

export function StatsPanel({ activityMode, language, stats }: StatsPanelProps) {
  const strings = getStrings(language);

  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        <Stat
          label={ACTIVITY_MODE_TEXT[language].countLabels[activityMode]}
          value={stats.walkCount.toString()}
        />
        <Stat label={strings.common.distance} value={formatDistance(stats.totalDistanceMeters)} />
        <Stat label={strings.common.duration} value={formatDuration(stats.totalDurationSeconds)} />
      </View>
      <View style={styles.secondaryRow}>
        <Stat label={strings.stats.today} value={formatDistance(stats.todayDistanceMeters)} />
        <Stat label={strings.walkControls.stepsToday} value={formatNumber(stats.todayStepCount)} />
        <Stat label={strings.stats.latest} value={formatDistance(stats.latestRecordingDistanceMeters)} />
        <Stat label={strings.stats.longest} value={formatDistance(stats.longestRecordingDistanceMeters)} />
        <Stat label={strings.stats.cells} value={stats.exploredCellCount.toString()} />
        <Stat label={strings.stats.new} value={stats.newCellsThisRecording.toString()} />
        <Stat label={strings.stats.area} value={formatArea(stats.approximateExploredAreaSquareMeters)} />
      </View>
      <Text style={styles.caption}>
        {interpolate(strings.stats.recordingsToday, {
          count: stats.todayRecordingCount,
          recording:
            language === "fr"
              ? stats.todayRecordingCount === 1
                ? "enregistrement"
                : "enregistrements"
              : stats.todayRecordingCount === 1
                ? "recording"
                : "recordings"
        })}
      </Text>
    </View>
  );
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

function formatNumber(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString();
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(11, 21, 29, 0.96)",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  caption: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700"
  },
  label: {
    color: "#94a3b8",
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
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700"
  }
});
