import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import { LoopFillSessionSummary } from "../database/completionRepository";
import { formatDistance, formatDuration } from "../services/distance";
import { ActivityMode, WalkSession } from "../types/walk";

type WalkHistoryModalProps = {
  activityMode: ActivityMode;
  loopFillSummaries: Record<number, LoopFillSessionSummary>;
  visible: boolean;
  walks: WalkSession[];
  selectedSessionId: number | null;
  onClose: () => void;
  onDeleteWalk: (sessionId: number) => void;
  onExportBackup: () => void;
  onExportWalkGpx: (sessionId: number) => void;
  onImportBackup: () => void;
  onRenameWalk: (sessionId: number, displayName: string) => void;
  onSelectWalk: (sessionId: number) => void;
};

export function WalkHistoryModal({
  activityMode,
  loopFillSummaries,
  visible,
  walks,
  selectedSessionId,
  onClose,
  onDeleteWalk,
  onExportBackup,
  onExportWalkGpx,
  onImportBackup,
  onRenameWalk,
  onSelectWalk
}: WalkHistoryModalProps) {
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const [detailSessionId, setDetailSessionId] = useState<number | null>(null);
  const detailWalk = walks.find((walk) => walk.id === detailSessionId) ?? null;

  useEffect(() => {
    setDraftNames(Object.fromEntries(walks.map((walk) => [walk.id, walk.displayName ?? ""])));
  }, [walks]);

  useEffect(() => {
    if (!visible) {
      setDetailSessionId(null);
    }
  }, [visible]);

  return (
    <Modal animationType="slide" visible={visible} presentationStyle="pageSheet">
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{ACTIVITY_MODE_LABELS[activityMode]} history</Text>
            <Text style={styles.subtitle}>{walks.length} saved recordings</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {detailWalk ? (
          <RecordingDetail
            draftName={draftNames[detailWalk.id] ?? ""}
            onBack={() => setDetailSessionId(null)}
            onDeleteWalk={onDeleteWalk}
            onExportWalkGpx={onExportWalkGpx}
            onFocusWalk={(sessionId) => {
              onSelectWalk(sessionId);
              onClose();
            }}
            onRenameWalk={onRenameWalk}
            onUpdateDraftName={(value) =>
              setDraftNames((current) => ({ ...current, [detailWalk.id]: value }))
            }
            loopFillSummary={loopFillSummaries[detailWalk.id] ?? null}
            walk={detailWalk}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <View style={styles.tools}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onExportBackup}
                style={styles.toolButton}
              >
                <Ionicons name="download-outline" size={18} color="#0f172a" />
                <Text style={styles.toolButtonText}>Backup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onImportBackup}
                style={styles.toolButton}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#0f172a" />
                <Text style={styles.toolButtonText}>Restore</Text>
              </TouchableOpacity>
            </View>

          {walks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No recordings yet</Text>
              <Text style={styles.emptyText}>
                Saved {ACTIVITY_MODE_LABELS[activityMode].toLowerCase()} explorations will appear
                here.
              </Text>
            </View>
          ) : (
            walks.map((walk) => (
              <HistoryRow
                isSelected={walk.id === selectedSessionId}
                key={walk.id}
                onOpenWalk={(sessionId) => {
                  onSelectWalk(sessionId);
                  setDetailSessionId(sessionId);
                }}
                walk={walk}
              />
            ))
          )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function HistoryRow({
  isSelected,
  walk,
  onOpenWalk
}: {
  isSelected: boolean;
  walk: WalkSession;
  onOpenWalk: (sessionId: number) => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={() => onOpenWalk(walk.id)}
      style={[styles.row, isSelected ? styles.selectedRow : null]}
    >
      <View style={styles.rowHeader}>
        <View style={styles.rowText}>
          <Text style={styles.date}>{walk.displayName || formatDate(walk.startedAt)}</Text>
          <Text style={styles.meta}>
            {formatDistance(walk.distanceMeters)} - {formatDuration(walk.durationSeconds)} -{" "}
            {walk.pointCount ?? 0} points
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#64748b" />
      </View>
    </TouchableOpacity>
  );
}

function RecordingDetail({
  draftName,
  walk,
  onBack,
  onDeleteWalk,
  onExportWalkGpx,
  onFocusWalk,
  onRenameWalk,
  onUpdateDraftName,
  loopFillSummary
}: {
  draftName: string;
  loopFillSummary: LoopFillSessionSummary | null;
  walk: WalkSession;
  onBack: () => void;
  onDeleteWalk: (sessionId: number) => void;
  onExportWalkGpx: (sessionId: number) => void;
  onFocusWalk: (sessionId: number) => void;
  onRenameWalk: (sessionId: number, displayName: string) => void;
  onUpdateDraftName: (value: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.detailScreen}>
      <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={19} color="#0f172a" />
        <Text style={styles.backButtonText}>History</Text>
      </TouchableOpacity>

      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{walk.displayName || formatDate(walk.startedAt)}</Text>
        <Text style={styles.detailSubtitle}>{ACTIVITY_MODE_LABELS[walk.activityMode]} recording</Text>

        <View style={styles.summaryGrid}>
          <Summary label="Distance" value={formatDistance(walk.distanceMeters)} />
          <Summary label="Duration" value={formatDuration(walk.durationSeconds)} />
          <Summary label="Points" value={(walk.pointCount ?? 0).toString()} />
          <Summary label="Loops" value={formatLoopCount(loopFillSummary)} />
          <Summary label="Loop cells" value={String(loopFillSummary?.loopFilledCellCount ?? 0)} />
          <Summary label="Mode" value={ACTIVITY_MODE_LABELS[walk.activityMode]} />
        </View>

        <View style={styles.details}>
          <Detail label="Started" value={formatFullDate(walk.startedAt)} />
          <Detail label="Ended" value={formatFullDate(walk.endedAt)} />
          <Detail label="Loop result" value={formatLoopSummary(loopFillSummary)} />
        </View>

        <TextInput
          placeholder="Recording name"
          onChangeText={onUpdateDraftName}
          style={styles.input}
          value={draftName}
        />

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onRenameWalk(walk.id, draftName)}
            style={styles.saveButton}
          >
            <Ionicons name="checkmark" size={18} color="#ffffff" />
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onFocusWalk(walk.id)}
            style={styles.secondaryButton}
          >
            <Ionicons name="locate-outline" size={18} color="#0f172a" />
            <Text style={styles.secondaryButtonText}>Focus on map</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onExportWalkGpx(walk.id)}
            style={styles.secondaryButton}
          >
            <Ionicons name="download-outline" size={18} color="#0f172a" />
            <Text style={styles.secondaryButtonText}>Export GPX</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onDeleteWalk(walk.id)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatLoopSummary(summary: LoopFillSessionSummary | null) {
  if (!summary) {
    return "No loop detected";
  }

  if (summary.accepted) {
    const rejectedText =
      summary.rejectedLoopCount > 0 ? `, ${summary.rejectedLoopCount} rejected` : "";

    return `${summary.filledLoopCount} filled${rejectedText}, ${summary.loopFilledCellCount} cells`;
  }

  return formatLoopRejectionReason(summary.rejectionReason);
}

function formatLoopCount(summary: LoopFillSessionSummary | null) {
  if (!summary) {
    return "0";
  }

  return `${summary.filledLoopCount}/${summary.filledLoopCount + summary.rejectedLoopCount}`;
}

function formatLoopRejectionReason(reason: string | null) {
  if (reason?.includes(",")) {
    return `Rejected: ${reason.split(",").map(formatLoopRejectionLabel).join(", ")}`;
  }

  return `Rejected: ${formatLoopRejectionLabel(reason)}`;
}

function formatLoopRejectionLabel(reason: string | null) {
  switch (reason) {
    case "loop_area_too_large":
      return "area too large";
    case "loop_area_too_small":
      return "area too small";
    case "loop_distance_too_short":
      return "distance too short";
    case "loop_duration_too_short":
      return "duration too short";
    case "not_closed_enough":
      return "not closed enough";
    default:
      return "unknown";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
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
    flexDirection: "row",
    gap: 10,
    marginTop: 2
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    paddingVertical: 4
  },
  backButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800"
  },
  closeButton: {
    alignItems: "center",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  date: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700"
  },
  deleteButton: {
    alignItems: "center",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  deleteButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700"
  },
  detailLabel: {
    color: "#64748b",
    fontSize: 12
  },
  detailCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  detailScreen: {
    gap: 12,
    padding: 18
  },
  detailSubtitle: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    marginTop: -8
  },
  detailTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  },
  details: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    width: "100%"
  },
  detailsTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  detailValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
  },
  empty: {
    alignItems: "center",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 24
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center"
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800"
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  list: {
    gap: 10,
    padding: 18
  },
  meta: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 4
  },
  row: {
    alignItems: "stretch",
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  rowText: {
    flex: 1
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700"
  },
  screen: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  selectedRow: {
    borderColor: "#2563eb",
    borderWidth: 2
  },
  summary: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    flex: 1,
    minWidth: "42%",
    padding: 10
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
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
  subtitle: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 3
  },
  title: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12
  },
  toolButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800"
  },
  tools: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
