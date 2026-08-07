import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";

import { BackgroundTrackingStatus } from "./RecordingHealthPanel";
import { AtlasHudTexture } from "./AtlasHudDecor";
import { APP_COLORS, ATLAS_DISPLAY_FONT, GPS_STATUS_COLORS } from "../constants/theme";
import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings } from "../i18n";
import { formatDistance, formatDuration } from "../services/distance";
import { classifyGpsUiStatus, GpsUiStatus } from "../services/gpsStatus";
import type { LocationPermissionState } from "../services/locationService";
import { RecordingQuality } from "../services/recordingQuality";
import { ActivityMode } from "../types/walk";

type WalkControlsProps = {
  activityMode: ActivityMode;
  isFinalizing: boolean;
  isRecording: boolean;
  isStarting: boolean;
  distanceMeters: number;
  startedAt?: string | null;
  gpsAccuracyMeters?: number | null;
  gpsStatus?: string | null;
  locationPermission: LocationPermissionState;
  locationResolved: boolean;
  latestFixTimestamp?: string | null;
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
  isFinalizing,
  isRecording,
  isStarting,
  distanceMeters,
  startedAt,
  gpsAccuracyMeters,
  gpsStatus,
  locationPermission,
  locationResolved,
  latestFixTimestamp,
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
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [gpsClockMs, setGpsClockMs] = useState(Date.now());
  const lastTapRef = useRef(0);
  const strings = getStrings(language);
  const recordingNoun = ACTIVITY_MODE_TEXT[language].recordingNouns[activityMode];
  const gpsUiStatus = classifyGpsUiStatus({
    accuracyMeters: gpsAccuracyMeters,
    fixTimestamp: latestFixTimestamp,
    isRecording,
    locationResolved,
    nowMs: gpsClockMs,
    permissionState: locationPermission
  });

  useEffect(() => {
    setGpsClockMs(Date.now());
    const timerId = setInterval(() => setGpsClockMs(Date.now()), 5000);

    return () => clearInterval(timerId);
  }, [latestFixTimestamp]);

  useEffect(() => {
    if (!isRecording || !startedAt) {
      setDurationSeconds(0);
      return;
    }

    const updateDuration = () => {
      setDurationSeconds(
        Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000))
      );
    };
    updateDuration();
    const timerId = setInterval(updateDuration, 1000);

    return () => clearInterval(timerId);
  }, [isRecording, startedAt]);

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
      <AtlasHudTexture opacity={0.1} />
      <View style={styles.metrics}>
        <View style={styles.ledgerIdentity}>
          <Text numberOfLines={1} style={styles.ledgerEyebrow}>
            {language === "fr" ? "CARNET" : "FIELD LOG"}
          </Text>
        </View>
        {isRecording ? (
          <>
            <Metric label={strings.common.distance} value={formatDistance(distanceMeters)} />
            <Metric label={strings.common.duration} value={formatDuration(durationSeconds)} />
            <Metric label={strings.common.steps} value={formatSteps(stepCount)} />
          </>
        ) : (
          <View style={styles.idleSummary}>
            <Ionicons color="#f5c451" name="footsteps-outline" size={17} />
            <Text style={styles.idleSummaryValue}>{formatSteps(todayStepCount)}</Text>
            <Text style={styles.idleSummaryLabel}>{strings.walkControls.stepsToday}</Text>
          </View>
        )}
      </View>

      <GpsStateBadge
        accuracyMeters={gpsAccuracyMeters}
        language={language}
        status={gpsUiStatus}
      />

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
        disabled={isStarting || isFinalizing}
        onPress={isRecording ? onStop : onStart}
        style={[
          styles.button,
          isRecording ? styles.stopButton : styles.startButton,
          isStarting || isFinalizing ? styles.disabledButton : null
        ]}
      >
        {isStarting || isFinalizing ? (
          <ActivityIndicator color={isRecording ? "#ffffff" : "#151006"} size="small" />
        ) : (
          <Ionicons
            name={isRecording ? "stop-circle" : "play-circle"}
            color={isRecording ? "#ffffff" : "#151006"}
            size={19}
          />
        )}
        <Text style={[styles.buttonText, !isRecording ? styles.startButtonText : null]}>
          {isFinalizing
            ? language === "fr" ? "Finalisation..." : "Finishing..."
            : isStarting
            ? language === "fr" ? "D\u00e9marrage..." : "Starting..."
            : isRecording
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

function GpsStateBadge({
  accuracyMeters,
  language,
  status
}: {
  accuracyMeters: number | null | undefined;
  language: AppLanguage;
  status: GpsUiStatus;
}) {
  const color = GPS_STATUS_COLORS[status.state];

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`GPS ${formatGpsState(status, language)}`}
      style={styles.gpsState}
    >
      <View style={[styles.gpsStateDot, { backgroundColor: color }]} />
      <Text style={[styles.gpsStateLabel, { color }]}>
        {formatGpsState(status, language)}
      </Text>
      <Text numberOfLines={1} style={styles.gpsStateDetail}>
        {formatGpsStateDetail(status, accuracyMeters, language)}
      </Text>
    </View>
  );
}

function formatGpsState(status: GpsUiStatus, language: AppLanguage) {
  switch (status.state) {
    case "acquiring":
      return language === "fr" ? "Acquisition" : "Acquiring";
    case "good":
      return language === "fr" ? "Bon" : "Good";
    case "weak-stale":
      return status.reason === "stale-fix"
        ? language === "fr" ? "Périmé" : "Stale"
        : language === "fr" ? "Faible" : "Weak";
    case "denied":
      return language === "fr" ? "Refusé" : "Denied";
    case "unavailable":
      return language === "fr" ? "Indisponible" : "Unavailable";
  }
}

function formatGpsStateDetail(
  status: GpsUiStatus,
  accuracyMeters: number | null | undefined,
  language: AppLanguage
) {
  if (status.reason === "permission-denied") {
    return language === "fr" ? "Autorisation requise" : "Permission required";
  }

  if (status.reason === "permission-pending" || status.reason === "fix-pending") {
    return language === "fr" ? "Recherche d'un signal" : "Finding a signal";
  }

  if (status.reason === "no-fix" || status.reason === "invalid-fix") {
    return language === "fr" ? "Aucune position utilisable" : "No usable fix";
  }

  if (status.reason === "stale-fix") {
    return language === "fr"
      ? `Dernière position il y a ${status.ageSeconds ?? 0} s`
      : `Last fix ${status.ageSeconds ?? 0}s ago`;
  }

  return typeof accuracyMeters === "number"
    ? language === "fr"
      ? `Précision ${Math.round(accuracyMeters)} m`
      : `${Math.round(accuracyMeters)} m accuracy`
    : language === "fr" ? "Précision inconnue" : "Accuracy unknown";
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
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44
  },
  buttonText: {
    color: "#ffffff",
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.25
  },
  container: {
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderColor: APP_COLORS.borderStrong,
    borderTopColor: "rgba(245, 196, 81, 0.28)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 7,
    overflow: "hidden",
    padding: 9
  },
  details: {
    backgroundColor: "rgba(19, 33, 43, 0.92)",
    borderColor: "rgba(248, 250, 252, 0.14)",
    borderRadius: 14,
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
  disabledButton: {
    opacity: 0.72
  },
  gpsStatus: {
    color: "#cbd5e1",
    flexBasis: "100%",
    fontSize: 12,
    fontWeight: "700"
  },
  gpsState: {
    alignItems: "center",
    backgroundColor: "rgba(19, 33, 43, 0.64)",
    borderColor: APP_COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 32,
    paddingHorizontal: 9
  },
  gpsStateDetail: {
    color: "#94a3b8",
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right"
  },
  gpsStateDot: {
    borderRadius: 999,
    height: 8,
    width: 8
  },
  gpsStateLabel: {
    fontSize: 12,
    fontWeight: "900"
  },
  healthMetrics: {
    flexDirection: "row",
    gap: 8
  },
  healthStrip: {
    backgroundColor: "rgba(19, 33, 43, 0.92)",
    borderColor: "rgba(248, 250, 252, 0.14)",
    borderRadius: 14,
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
  ledgerEyebrow: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.75
  },
  ledgerIdentity: {
    borderRightColor: APP_COLORS.goldBorder,
    borderRightWidth: 1,
    justifyContent: "center",
    minWidth: 58,
    paddingRight: 8
  },
  metrics: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  idleSummary: { alignItems: "center", flex: 1, flexDirection: "row", gap: 7, minHeight: 24 },
  idleSummaryValue: { color: "#f8fafc", fontSize: 15, fontWeight: "900" },
  idleSummaryLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
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
    backgroundColor: "rgba(19, 33, 43, 0.72)",
    borderColor: "rgba(248, 250, 252, 0.12)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10
  },
  startButtonText: { color: "#151006" },
  startButton: {
    backgroundColor: "#f5c451"
  },
  stopButton: {
    backgroundColor: "#dc2626"
  }
});
