import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { BackgroundTrackingStatus } from "./RecordingHealthPanel";
import { formatDistance } from "../services/distance";
import { RecordingQuality } from "../services/recordingQuality";
import { ActiveWalk, GpsPoint } from "../types/walk";

type RecordingDiagnosticsPanelProps = {
  activeWalk: ActiveWalk | null;
  backgroundMessage: string | null;
  backgroundStatus: BackgroundTrackingStatus;
  currentLocation: GpsPoint | null;
  recordingQuality: RecordingQuality;
};

export function RecordingDiagnosticsPanel({
  activeWalk,
  backgroundMessage,
  backgroundStatus,
  currentLocation,
  recordingQuality
}: RecordingDiagnosticsPanelProps) {
  if (!activeWalk) {
    return (
      <View style={styles.container}>
        <PanelHeader title="Recording diagnostics" status="Idle" />
        <Text style={styles.helpText}>
          Start a recording to see GPS acceptance, rejected points, steps, and background sync.
        </Text>
      </View>
    );
  }

  const gpsTotal = activeWalk.acceptedGpsPointCount + activeWalk.rejectedGpsPointCount;
  const acceptedRatio =
    gpsTotal > 0 ? Math.round((activeWalk.acceptedGpsPointCount / gpsTotal) * 100) : 0;

  return (
    <View style={styles.container}>
      <PanelHeader
        title="Recording diagnostics"
        status={`${recordingQuality.label} | ${getBackgroundLabel(backgroundStatus)}`}
      />
      <View style={styles.grid}>
        <Diagnostic label="GPS accepted" value={activeWalk.acceptedGpsPointCount.toString()} />
        <Diagnostic label="GPS rejected" value={activeWalk.rejectedGpsPointCount.toString()} />
        <Diagnostic label="Accept rate" value={`${acceptedRatio}%`} />
        <Diagnostic label="Steps" value={formatNumber(activeWalk.stepCount)} />
        <Diagnostic label="GPS accuracy" value={formatAccuracy(currentLocation?.accuracy)} />
        <Diagnostic label="GPS distance" value={formatDistance(activeWalk.distanceMeters)} />
      </View>
      <Text style={styles.statusText}>
        {recordingQuality.reason}
      </Text>
      {activeWalk.lastRejectedPointReason ? (
        <Text style={styles.statusText}>{activeWalk.lastRejectedPointReason}</Text>
      ) : null}
      {backgroundMessage ? <Text style={styles.backgroundText}>{backgroundMessage}</Text> : null}
      <Text style={styles.helpText}>
        GPS draws the map. Steps come from the device pedometer. They can disagree when GPS jumps,
        pauses, or when steps continue while location updates are sparse.
      </Text>
    </View>
  );
}

function PanelHeader({ status, title }: { status: string; title: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <Ionicons name="pulse-outline" size={17} color="#0f172a" />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.statusBadge}>{status}</Text>
    </View>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnostic}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function formatAccuracy(accuracy: number | null | undefined) {
  if (typeof accuracy !== "number") {
    return "Unknown";
  }

  return `${Math.round(accuracy)} m`;
}

function formatNumber(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function getBackgroundLabel(status: BackgroundTrackingStatus) {
  switch (status) {
    case "enabled":
      return "Background on";
    case "foreground-only":
      return "Foreground only";
    case "starting":
      return "Starting";
    case "unavailable":
      return "Unavailable";
    default:
      return "Idle";
  }
}

const styles = StyleSheet.create({
  backgroundText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  diagnostic: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    flexBasis: "31%",
    flexGrow: 1,
    padding: 9
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  headerTitle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  helpText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16
  },
  label: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
  },
  statusBadge: {
    color: "#2563eb",
    fontSize: 11,
    fontWeight: "900"
  },
  statusText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  title: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  value: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  }
});
