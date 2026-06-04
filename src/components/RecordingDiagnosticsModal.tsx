import { Ionicons } from "@expo/vector-icons";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { BackgroundTrackingStatus } from "./RecordingHealthPanel";
import { RecordingDiagnosticsPanel } from "./RecordingDiagnosticsPanel";
import { RecordingQuality } from "../services/recordingQuality";
import { ActiveWalk, GpsPoint } from "../types/walk";

type RecordingDiagnosticsModalProps = {
  activeWalk: ActiveWalk | null;
  backgroundMessage: string | null;
  backgroundStatus: BackgroundTrackingStatus;
  currentLocation: GpsPoint | null;
  onClose: () => void;
  recordingQuality: RecordingQuality;
  visible: boolean;
};

export function RecordingDiagnosticsModal({
  activeWalk,
  backgroundMessage,
  backgroundStatus,
  currentLocation,
  onClose,
  recordingQuality,
  visible
}: RecordingDiagnosticsModalProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Recording diagnostics</Text>
            <Text style={styles.subtitle}>GPS, steps, and background recording status</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <RecordingDiagnosticsPanel
            activeWalk={activeWalk}
            backgroundMessage={backgroundMessage}
            backgroundStatus={backgroundStatus}
            currentLocation={currentLocation}
            recordingQuality={recordingQuality}
          />
          <View style={styles.note}>
            <Text style={styles.noteTitle}>How to read this</Text>
            <Text style={styles.noteText}>
              Distance comes from accepted GPS points because those points draw the path and explored
              cells. Steps come from the device pedometer. A mismatch is normal when GPS pauses,
              when the phone is indoors, or when rejected GPS jumps are filtered out.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  content: {
    gap: 12,
    padding: 16
  },
  header: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderBottomColor: "#dbe3ea",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 58
  },
  note: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  noteText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19
  },
  noteTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900"
  },
  screen: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  subtitle: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 3
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  }
});
