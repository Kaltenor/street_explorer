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
import { formatDistance, formatDuration } from "../services/distance";
import { ActivityMode, WalkSession } from "../types/walk";

type WalkHistoryModalProps = {
  activityMode: ActivityMode;
  visible: boolean;
  walks: WalkSession[];
  selectedSessionId: number | null;
  onClose: () => void;
  onDeleteWalk: (sessionId: number) => void;
  onRenameWalk: (sessionId: number, displayName: string) => void;
  onSelectWalk: (sessionId: number) => void;
};

export function WalkHistoryModal({
  activityMode,
  visible,
  walks,
  selectedSessionId,
  onClose,
  onDeleteWalk,
  onRenameWalk,
  onSelectWalk
}: WalkHistoryModalProps) {
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});

  useEffect(() => {
    setDraftNames(Object.fromEntries(walks.map((walk) => [walk.id, walk.displayName ?? ""])));
  }, [walks]);

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

        <ScrollView contentContainerStyle={styles.list}>
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
                draftName={draftNames[walk.id] ?? ""}
                isSelected={walk.id === selectedSessionId}
                key={walk.id}
                onDeleteWalk={onDeleteWalk}
                onRenameWalk={onRenameWalk}
                onSelectWalk={onSelectWalk}
                onUpdateDraftName={(value) =>
                  setDraftNames((current) => ({ ...current, [walk.id]: value }))
                }
                walk={walk}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function HistoryRow({
  draftName,
  isSelected,
  walk,
  onDeleteWalk,
  onRenameWalk,
  onSelectWalk,
  onUpdateDraftName
}: {
  draftName: string;
  isSelected: boolean;
  walk: WalkSession;
  onDeleteWalk: (sessionId: number) => void;
  onRenameWalk: (sessionId: number, displayName: string) => void;
  onSelectWalk: (sessionId: number) => void;
  onUpdateDraftName: (value: string) => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={() => onSelectWalk(walk.id)}
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
        <Ionicons name={isSelected ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
      </View>

      {isSelected ? (
        <View style={styles.details}>
          <Detail label="Started" value={formatFullDate(walk.startedAt)} />
          <Detail label="Ended" value={formatFullDate(walk.endedAt)} />
          <Detail label="Distance" value={formatDistance(walk.distanceMeters)} />
          <Detail label="Duration" value={formatDuration(walk.durationSeconds)} />

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
              onPress={() => onDeleteWalk(walk.id)}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
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
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  details: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    width: "100%"
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
  screen: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  selectedRow: {
    borderColor: "#2563eb",
    borderWidth: 2
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
  }
});
