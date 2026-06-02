import { Ionicons } from "@expo/vector-icons";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import { calculatePathDistanceMeters, formatDistance, formatDuration } from "../services/distance";
import { ActivityMode, GpsPoint, WalkSession } from "../types/walk";

export type RecoverableRecording = {
  session: WalkSession;
  points: GpsPoint[];
};

type RecordingRecoveryModalProps = {
  onDiscard: () => void;
  onFinish: () => void;
  onResume: () => void;
  recording: RecoverableRecording | null;
};

export function RecordingRecoveryModal({
  onDiscard,
  onFinish,
  onResume,
  recording
}: RecordingRecoveryModalProps) {
  if (!recording) {
    return null;
  }

  const { session, points } = recording;
  const lastPoint = points.at(-1);
  const distanceMeters = calculatePathDistanceMeters(points);
  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)
  );

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle-outline" size={28} color="#1d4ed8" />
          </View>

          <Text style={styles.title}>Unfinished recording</Text>
          <Text style={styles.message}>
            Street Explorer found an active {formatMode(session.activityMode)} recording. Choose
            what to do before continuing.
          </Text>

          <View style={styles.summaryGrid}>
            <SummaryItem label="Mode" value={ACTIVITY_MODE_LABELS[session.activityMode]} />
            <SummaryItem label="Distance" value={formatDistance(distanceMeters)} />
            <SummaryItem label="Duration" value={formatDuration(durationSeconds)} />
            <SummaryItem label="Points" value={points.length.toString()} />
          </View>

          <View style={styles.lastPoint}>
            <Text style={styles.lastPointLabel}>Last GPS point</Text>
            <Text style={styles.lastPointValue}>
              {lastPoint ? formatFullDate(lastPoint.timestamp) : "No saved point yet"}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={onResume} style={styles.primary}>
              <Ionicons name="play-circle" size={19} color="#ffffff" />
              <Text style={styles.primaryText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={onFinish} style={styles.secondary}>
              <Ionicons name="checkmark-circle-outline" size={19} color="#0f172a" />
              <Text style={styles.secondaryText}>Finish & Save</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={onDiscard} style={styles.danger}>
              <Ionicons name="trash-outline" size={19} color="#dc2626" />
              <Text style={styles.dangerText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function formatMode(activityMode: ActivityMode) {
  return ACTIVITY_MODE_LABELS[activityMode].toLowerCase();
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actions: {
    gap: 9,
    marginTop: 4
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    gap: 13,
    maxWidth: 440,
    padding: 18,
    width: "100%"
  },
  danger: {
    alignItems: "center",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44
  },
  dangerText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "800"
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 8,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  lastPoint: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 10
  },
  lastPointLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  lastPointValue: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3
  },
  message: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20
  },
  primary: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 46
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  secondary: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44
  },
  secondaryText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800"
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  summaryItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 10
  },
  summaryLabel: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  summaryValue: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900"
  },
  title: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  }
});
