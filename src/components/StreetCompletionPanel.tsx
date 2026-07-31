import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { AppLanguage } from "../i18n";
import { formatDistance } from "../services/distance";
import { StreetCompletionSummary } from "../types/street";

type StreetCompletionPanelProps = {
  language: AppLanguage;
  summary: StreetCompletionSummary;
};

export function StreetCompletionPanel({
  language,
  summary
}: StreetCompletionPanelProps) {
  const isFrench = language === "fr";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="trail-sign-outline" size={18} color="#f5c451" />
          <Text style={styles.title}>
            {isFrench ? "Rues OpenStreetMap" : "OpenStreetMap streets"}
          </Text>
        </View>
        <Text style={styles.percent}>{formatPercent(summary.completionPercent, language)}</Text>
      </View>

      <Text style={styles.text}>{getStatusText(summary, language)}</Text>

      <View style={styles.metrics}>
        <Metric
          label={isFrench ? "Parcouru" : "Walked"}
          value={formatDistance(summary.exploredDistanceMeters)}
        />
        <Metric
          label={isFrench ? "Chargé" : "Loaded"}
          value={formatDistance(summary.totalDistanceMeters)}
        />
        <Metric
          label={isFrench ? "Rues finies" : "Completed"}
          value={summary.completedStreetCount.toString()}
        />
        <Metric
          label={isFrench ? "Rues touchées" : "Reached"}
          value={summary.exploredStreetCount.toString()}
        />
      </View>

      {summary.legacyMatchedStreetCount > 0 ? (
        <Text style={styles.evidenceText}>
          {isFrench
            ? `Preuve V1 conservée : ${summary.legacyMatchedStreetCount} rues associées.`
            : `V1 evidence retained: ${summary.legacyMatchedStreetCount} matched streets.`}
        </Text>
      ) : null}
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

function formatPercent(value: number, language: AppLanguage) {
  return `${new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
    maximumFractionDigits: 1
  }).format(value)}%`;
}

function getStatusText(summary: StreetCompletionSummary, language: AppLanguage) {
  const isFrench = language === "fr";

  if (summary.status === "loading" || summary.status === "pending") {
    return isFrench
      ? "Calcul asynchrone depuis les traces figées…"
      : "Calculating asynchronously from frozen routes…";
  }

  if (summary.status === "error") {
    return isFrench
      ? "Le dernier calcul a échoué. Utilisez Retraiter les enregistrements pour réessayer."
      : "The latest calculation failed. Use Reprocess recordings to retry.";
  }

  if (summary.loadedStreetCount === 0) {
    return isFrench
      ? "Aucune rue en cache pour le moment. La couverture OSM se charge pendant vos marches."
      : "No cached streets yet. OSM coverage loads as you walk.";
  }

  return isFrench
    ? `${summary.processedRecordingCount} enregistrements calculés. Une rue est finie à 90 %.`
    : `${summary.processedRecordingCount} recordings processed. A street completes at 90%.`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(11, 21, 29, 0.96)",
    borderColor: "rgba(245, 196, 81, 0.32)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 11,
    padding: 14
  },
  evidenceText: {
    color: "#94a3b8",
    fontSize: 11,
    lineHeight: 16
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  metric: {
    flex: 1,
    minWidth: "42%"
  },
  metricLabel: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2
  },
  metricValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900"
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  percent: {
    color: "#f5c451",
    fontSize: 24,
    fontWeight: "900"
  },
  text: {
    color: "#cbd5e1",
    fontSize: 12,
    lineHeight: 17
  },
  title: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800"
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  }
});
