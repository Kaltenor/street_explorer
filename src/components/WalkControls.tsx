import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";

import { BackgroundTrackingStatus } from "./RecordingHealthPanel";
import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings } from "../i18n";
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
  acceptedGpsPointCount: number;
  backgroundStatus: BackgroundTrackingStatus;
  latestPointTimestamp?: string | null;
  pointCount: number;
  rejectedGpsPointCount: number;
  speedMetersPerSecond?: number;
  stepCount: number;
  todayStepCount: number;
  language: AppLanguage;
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
  acceptedGpsPointCount,
  backgroundStatus,
  latestPointTimestamp,
  pointCount,
  rejectedGpsPointCount,
  speedMetersPerSecond = 0,
  stepCount,
  todayStepCount,
  language,
  recordingQuality,
  onStart,
  onStop
}: WalkControlsProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const lastTapRef = useRef(0);
  const strings = getStrings(language);
  const recordingNoun = ACTIVITY_MODE_TEXT[language].recordingNouns[activityMode];
  const handlePanelTouchEnd = () => {
    const now = Date.now();

    if (now - lastTapRef.current < 320) {
      setHealthExpanded((expanded) => {
        if (expanded) {
          setDetailsExpanded(false);
        }

        return !expanded;
      });
      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
  };

  return (
    <View onTouchEnd={handlePanelTouchEnd} style={styles.container}>
      <View style={styles.metrics}>
        <Metric label={strings.common.distance} value={formatDistance(distanceMeters)} />
        <Metric label={strings.common.duration} value={formatDuration(durationSeconds)} />
        <Metric label={strings.walkControls.stepsToday} value={formatSteps(todayStepCount)} />
      </View>

      {isRecording && healthExpanded ? (
        <View style={styles.healthStrip}>
          <View style={styles.healthTopRow}>
            <View style={[styles.qualityBadge, getQualityStyle(recordingQuality.label)]}>
              <Text style={styles.qualityText}>{recordingQuality.label}</Text>
            </View>
            <Text style={styles.healthText}>{formatBackgroundStatus(backgroundStatus, language)}</Text>
          </View>
          <View style={styles.healthMetrics}>
            <MiniHealth label="GPS" value={`${acceptedGpsPointCount}/${rejectedGpsPointCount}`} />
            <MiniHealth label="Last" value={formatPointAge(latestPointTimestamp, language)} />
            <MiniHealth label="Accuracy" value={formatGps(gpsAccuracyMeters, language)} />
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
              {detailsExpanded
                ? strings.walkControls.hideRecordingDetails
                : strings.walkControls.recordingDetails}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!isRecording && healthExpanded ? (
        <View style={styles.readinessPanel}>
          <MiniHealth
            label={language === "fr" ? "GPS prêt" : "GPS ready"}
            value={formatGpsReadiness(gpsAccuracyMeters, language)}
          />
          <MiniHealth
            label={language === "fr" ? "Arrière-plan" : "Background"}
            value={formatBackgroundStatus(backgroundStatus, language)}
          />
        </View>
      ) : null}

      {isRecording && healthExpanded && detailsExpanded ? (
        <View style={styles.details}>
          <Metric label={strings.common.steps} value={formatSteps(stepCount)} />
          <Metric label={strings.walkControls.gpsPoints} value={pointCount.toString()} />
          <Metric label={strings.walkControls.speed} value={formatSpeed(speedMetersPerSecond)} />
          <Metric label={strings.walkControls.gps} value={formatGps(gpsAccuracyMeters, language)} />
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
          size={19}
        />
        <Text style={styles.buttonText}>
          {isRecording
            ? `${strings.walkControls.stop} ${recordingNoun}`
            : `${strings.walkControls.start} ${recordingNoun}`}
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

function MiniHealth({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniHealth}>
      <Text style={styles.miniHealthValue}>{value}</Text>
      <Text style={styles.miniHealthLabel}>{label}</Text>
    </View>
  );
}

function formatSpeed(metersPerSecond: number) {
  return `${Math.round(metersPerSecond * 3.6)} km/h`;
}

function formatGps(accuracyMeters: number | null | undefined, language: AppLanguage) {
  if (typeof accuracyMeters !== "number") {
    return getStrings(language).common.unknown;
  }

  return `${Math.round(accuracyMeters)} m`;
}

function formatSteps(steps: number) {
  return Math.max(0, Math.round(steps)).toLocaleString();
}

function formatPointAge(timestamp: string | null | undefined, language: AppLanguage) {
  if (!timestamp) {
    return language === "fr" ? "aucun" : "none";
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));

  if (ageSeconds < 3) {
    return language === "fr" ? "maintenant" : "now";
  }

  if (ageSeconds < 60) {
    return language === "fr" ? `${ageSeconds}s` : `${ageSeconds}s`;
  }

  return formatDuration(ageSeconds);
}

function formatGpsReadiness(accuracyMeters: number | null | undefined, language: AppLanguage) {
  if (typeof accuracyMeters !== "number") {
    return language === "fr" ? "en attente" : "waiting";
  }

  if (accuracyMeters <= 30) {
    return language === "fr" ? "bon" : "good";
  }

  if (accuracyMeters <= 60) {
    return language === "fr" ? "moyen" : "fair";
  }

  return language === "fr" ? "faible" : "weak";
}

function formatBackgroundStatus(status: BackgroundTrackingStatus, language: AppLanguage) {
  switch (status) {
    case "enabled":
      return language === "fr" ? "actif" : "on";
    case "foreground-only":
      return language === "fr" ? "premier plan" : "foreground";
    case "starting":
      return language === "fr" ? "démarrage" : "starting";
    case "unavailable":
      return language === "fr" ? "indispo." : "unavailable";
    default:
      return language === "fr" ? "vérifié au départ" : "checked at start";
  }
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
    gap: 6,
    justifyContent: "center",
    minHeight: 40
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  container: {
    backgroundColor: "rgba(2, 6, 10, 0.9)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 8
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
  healthMetrics: {
    flexDirection: "row",
    gap: 8
  },
  healthStrip: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    borderColor: "rgba(248, 250, 252, 0.14)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  healthText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "800"
  },
  healthTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
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
    fontSize: 10,
    marginTop: 1
  },
  metricValue: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700"
  },
  metrics: {
    flexDirection: "row",
    gap: 8
  },
  miniHealth: {
    flex: 1
  },
  miniHealthLabel: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2
  },
  miniHealthValue: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "900"
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
  readinessPanel: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderColor: "rgba(248, 250, 252, 0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  startButton: {
    backgroundColor: "#2563eb"
  },
  stopButton: {
    backgroundColor: "#dc2626"
  }
});
