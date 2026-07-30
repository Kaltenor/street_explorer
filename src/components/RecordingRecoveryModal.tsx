import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatDistance, formatDuration } from "../services/distance";
import { GpsPoint, WalkSession } from "../types/walk";

export type RecoverableRecording = {
  lastPoint: GpsPoint | null;
  session: WalkSession;
  totalPointCount: number;
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

  const { lastPoint, session } = recording;
  const distanceMeters = session.distanceMeters;
  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)
  );

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle-outline" size={28} color="#f5c451" />
          </View>

          <Text style={styles.title}>Unfinished recording</Text>
          <Text style={styles.message}>
            Street Explorer found an unfinished walk. Choose what to do before continuing.
          </Text>

          <View style={styles.summaryGrid}>
            <SummaryItem label="Distance" value={formatDistance(distanceMeters)} />
            <SummaryItem label="Duration" value={formatDuration(durationSeconds)} />
            <SummaryItem label="Points" value={recording.totalPointCount.toString()} />
          </View>

          <View style={styles.lastPoint}>
            <Text style={styles.lastPointLabel}>Last GPS point</Text>
            <Text style={styles.lastPointValue}>
              {lastPoint ? formatFullDate(lastPoint.timestamp) : "No saved point yet"}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={onResume} style={styles.primary}>
              <Ionicons name="play-circle" size={19} color="#151006" />
              <Text style={styles.primaryText}>Resume</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={onFinish} style={styles.secondary}>
              <Ionicons name="checkmark-circle-outline" size={19} color="#f8fafc" />
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
    backgroundColor: "rgba(2, 6, 10, 0.78)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  card: {
    backgroundColor: "#0c151c",
    borderRadius: 14,
    gap: 13,
    maxWidth: 440,
    padding: 18,
    width: "100%"
  },
  danger: {
    alignItems: "center",
    borderColor: "#fecaca",
    borderRadius: 14,
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
    backgroundColor: "rgba(245, 196, 81, 0.16)",
    borderRadius: 14,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  lastPoint: {
    backgroundColor: "#13212b",
    borderColor: "#2a3c49",
    borderRadius: 14,
    borderWidth: 1,
    padding: 10
  },
  lastPointLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700"
  },
  lastPointValue: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3
  },
  message: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20
  },
  primary: {
    alignItems: "center",
    backgroundColor: "#f5c451",
    borderRadius: 14,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 46
  },
  primaryText: {
    color: "#151006",
    fontSize: 15,
    fontWeight: "800"
  },
  secondary: {
    alignItems: "center",
    backgroundColor: "#13212b",
    borderColor: "#2a3c49",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44
  },
  secondaryText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800"
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  summaryItem: {
    backgroundColor: "#13212b",
    borderRadius: 14,
    flexBasis: "47%",
    flexGrow: 1,
    padding: 10
  },
  summaryLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2
  },
  summaryValue: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "900"
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  }
});
