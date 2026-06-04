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

import { LoopFillSessionSummary } from "../database/completionRepository";
import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings, interpolate } from "../i18n";
import { formatDistance, formatDuration } from "../services/distance";
import { collectExploredCellIdsForPath } from "../services/explorationArea";
import { buildPathSegments } from "../services/pathInference";
import { ActivityMode, WalkSession, WalkWithPoints } from "../types/walk";

type WalkHistoryModalProps = {
  activityMode: ActivityMode;
  detailedWalks: WalkWithPoints[];
  language: AppLanguage;
  loopFillSummaries: Record<number, LoopFillSessionSummary>;
  visible: boolean;
  walks: WalkSession[];
  selectedSessionId: number | null;
  onClose: () => void;
  onDeleteWalk: (sessionId: number) => void;
  onExportBackup: () => void;
  onExportWalkGpx: (sessionId: number) => void;
  onImportBackup: () => void;
  onOpenDiagnostics: () => void;
  onRenameWalk: (sessionId: number, displayName: string) => void;
  onSelectWalk: (sessionId: number) => void;
};

export function WalkHistoryModal({
  activityMode,
  detailedWalks,
  language,
  loopFillSummaries,
  visible,
  walks,
  selectedSessionId,
  onClose,
  onDeleteWalk,
  onExportBackup,
  onExportWalkGpx,
  onImportBackup,
  onOpenDiagnostics,
  onRenameWalk,
  onSelectWalk
}: WalkHistoryModalProps) {
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const [detailSessionId, setDetailSessionId] = useState<number | null>(null);
  const detailWalk = walks.find((walk) => walk.id === detailSessionId) ?? null;
  const detailedWalk = detailedWalks.find((walk) => walk.id === detailSessionId) ?? null;
  const strings = getStrings(language);
  const modeText = ACTIVITY_MODE_TEXT[language];

  useEffect(() => {
    setDraftNames(Object.fromEntries(walks.map((walk) => [walk.id, walk.displayName ?? ""])));
  }, [walks]);

  useEffect(() => {
    if (!visible) {
      setDetailSessionId(null);
    }
  }, [visible]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.backToMapButton}>
            <Ionicons name="chevron-back" size={22} color="#f8fafc" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>
              {modeText.labels[activityMode]} {strings.history.history}
            </Text>
            <Text style={styles.subtitle}>
              {interpolate(strings.history.savedRecordings, { count: walks.length })}
            </Text>
          </View>
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
            language={language}
            loopFillSummary={loopFillSummaries[detailWalk.id] ?? null}
            walk={detailWalk}
            walkWithPoints={detailedWalk}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            <View style={styles.tools}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onExportBackup}
                style={styles.toolButton}
              >
                <Ionicons name="download-outline" size={18} color="#f8fafc" />
                <Text style={styles.toolButtonText}>{strings.history.backup}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onImportBackup}
                style={styles.toolButton}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#f8fafc" />
                <Text style={styles.toolButtonText}>{strings.common.restore}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onOpenDiagnostics}
                style={styles.toolButton}
              >
                <Ionicons name="pulse-outline" size={18} color="#f8fafc" />
                <Text style={styles.toolButtonText}>{strings.history.diagnostics}</Text>
              </TouchableOpacity>
            </View>

          {walks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{strings.history.noRecordings}</Text>
              <Text style={styles.emptyText}>
                {interpolate(strings.history.noRecordingsText, {
                  mode: modeText.labels[activityMode].toLowerCase()
                })}
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
                language={language}
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
  language,
  walk,
  onOpenWalk
}: {
  isSelected: boolean;
  language: AppLanguage;
  walk: WalkSession;
  onOpenWalk: (sessionId: number) => void;
}) {
  const strings = getStrings(language);

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
            {formatSteps(walk.stepCount)} {strings.history.stepsSuffix}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#64748b" />
      </View>
    </TouchableOpacity>
  );
}

function RecordingDetail({
  draftName,
  language,
  walk,
  onBack,
  onDeleteWalk,
  onExportWalkGpx,
  onFocusWalk,
  onRenameWalk,
  onUpdateDraftName,
  loopFillSummary,
  walkWithPoints
}: {
  draftName: string;
  language: AppLanguage;
  loopFillSummary: LoopFillSessionSummary | null;
  walk: WalkSession;
  walkWithPoints: WalkWithPoints | null;
  onBack: () => void;
  onDeleteWalk: (sessionId: number) => void;
  onExportWalkGpx: (sessionId: number) => void;
  onFocusWalk: (sessionId: number) => void;
  onRenameWalk: (sessionId: number, displayName: string) => void;
  onUpdateDraftName: (value: string) => void;
}) {
  const report = buildRecordingReport(walk, walkWithPoints, loopFillSummary);
  const strings = getStrings(language);
  const modeText = ACTIVITY_MODE_TEXT[language];

  return (
    <ScrollView contentContainerStyle={styles.detailScreen}>
      <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={19} color="#f8fafc" />
        <Text style={styles.backButtonText}>{strings.history.history}</Text>
      </TouchableOpacity>

      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{walk.displayName || formatDate(walk.startedAt)}</Text>
        <Text style={styles.detailSubtitle}>
          {modeText.labels[walk.activityMode]} {strings.history.recording}
        </Text>

        <View style={styles.summaryGrid}>
          <Summary label={strings.common.distance} value={formatDistance(walk.distanceMeters)} />
          <Summary label={strings.common.duration} value={formatDuration(walk.durationSeconds)} />
          <Summary label={strings.common.steps} value={formatSteps(walk.stepCount)} />
          <Summary label={strings.history.gpsPoints} value={(walk.pointCount ?? 0).toString()} />
          <Summary label={strings.history.loops} value={formatLoopCount(loopFillSummary)} />
          <Summary label={strings.history.loopCells} value={String(loopFillSummary?.loopFilledCellCount ?? 0)} />
          <Summary label={strings.common.mode} value={modeText.labels[walk.activityMode]} />
        </View>

        <View style={styles.details}>
          <Detail label={strings.history.started} value={formatFullDate(walk.startedAt)} />
          <Detail label={strings.history.ended} value={formatFullDate(walk.endedAt)} />
          <Detail label={strings.history.loopResult} value={formatLoopSummary(loopFillSummary)} />
          <Detail label={strings.history.loopExplanation} value={formatLoopExplanation(loopFillSummary)} />
        </View>

        <View style={styles.reportCard}>
          <View style={styles.reportHeader}>
            <Ionicons name="clipboard-outline" size={16} color="#9cff00" />
            <Text style={styles.reportTitle}>{strings.history.recordingReport}</Text>
          </View>
          <View style={styles.summaryGrid}>
            <Summary label={strings.history.gpsAccepted} value={report.gpsAccepted} />
            <Summary label={strings.history.gpsRejected} value={report.gpsRejected} />
            <Summary label={strings.history.hiddenGaps} value={report.hiddenGaps} />
            <Summary label={strings.common.steps} value={formatSteps(walk.stepCount)} />
            <Summary label={strings.history.loopFill} value={report.loopFillResult} />
            <Summary label={strings.history.quality} value={report.qualityScore} />
          </View>
          <Text style={styles.reportNote}>{report.qualityReason}</Text>
        </View>

        <View style={styles.reportCard}>
          <View style={styles.reportHeader}>
            <Ionicons name="git-network-outline" size={16} color="#9cff00" />
            <Text style={styles.reportTitle}>{strings.history.loopFillDebug}</Text>
          </View>
          <View style={styles.details}>
            <Detail label={strings.stats.cells} value={report.cellsWalked} />
            <Detail label={strings.history.loops} value={report.loopsFilled} />
            <Detail label={strings.history.loopResult} value={report.loopsRejected} />
            <Detail label={strings.history.reason} value={report.loopReason} />
            <Detail label={strings.stats.area} value={report.areaSize} />
          </View>
        </View>

        <TextInput
          placeholder={strings.history.recordingName}
          placeholderTextColor="#64748b"
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
            <Text style={styles.saveButtonText}>{strings.common.save}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onFocusWalk(walk.id)}
            style={styles.secondaryButton}
          >
            <Ionicons name="locate-outline" size={18} color="#f8fafc" />
            <Text style={styles.secondaryButtonText}>{strings.history.focusOnMap}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onExportWalkGpx(walk.id)}
            style={styles.secondaryButton}
          >
            <Ionicons name="download-outline" size={18} color="#f8fafc" />
            <Text style={styles.secondaryButtonText}>{strings.history.exportGpx}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => onDeleteWalk(walk.id)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={styles.deleteButtonText}>{strings.history.delete}</Text>
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

function buildRecordingReport(
  walk: WalkSession,
  walkWithPoints: WalkWithPoints | null,
  loopFillSummary: LoopFillSessionSummary | null
) {
  const points = walkWithPoints?.points ?? [];
  const segments = buildPathSegments(points, walk.activityMode);
  const hiddenGapCount = segments.filter((segment) => segment.type === "rejected").length;
  const acceptedPointCount = walk.pointCount ?? points.length;
  const cellsWalked = points.length > 1
    ? collectExploredCellIdsForPath(points, walk.activityMode).length
    : 0;
  const quality = calculateSavedRecordingQuality({
    hiddenGapCount,
    pointCount: acceptedPointCount,
    durationSeconds: walk.durationSeconds
  });

  return {
    areaSize: loopFillSummary ? formatArea(loopFillSummary.areaM2) : "0 m2",
    cellsWalked: String(cellsWalked),
    gpsAccepted: String(acceptedPointCount),
    gpsRejected: "Not stored",
    hiddenGaps: String(hiddenGapCount),
    loopFillResult: formatLoopSummary(loopFillSummary),
    loopReason: loopFillSummary?.accepted
      ? "closed cell boundary accepted"
      : formatLoopRejectionLabel(loopFillSummary?.rejectionReason ?? null),
    loopsFilled: String(loopFillSummary?.filledLoopCount ?? 0),
    loopsRejected: String(loopFillSummary?.rejectedLoopCount ?? 0),
    qualityReason: quality.reason,
    qualityScore: `${quality.score}/100 ${quality.label}`
  };
}

function calculateSavedRecordingQuality({
  durationSeconds,
  hiddenGapCount,
  pointCount
}: {
  durationSeconds: number;
  hiddenGapCount: number;
  pointCount: number;
}) {
  let score = 100;
  const pointsPerMinute = durationSeconds > 0 ? pointCount / (durationSeconds / 60) : pointCount;
  const reasons: string[] = [];

  if (pointCount < 2) {
    score -= 60;
    reasons.push("too few accepted GPS points");
  } else if (durationSeconds > 60 && pointsPerMinute < 2) {
    score -= 30;
    reasons.push("GPS updates were sparse");
  } else if (durationSeconds > 60 && pointsPerMinute < 4) {
    score -= 12;
    reasons.push("GPS updates were slow");
  }

  if (hiddenGapCount > 3) {
    score -= 25;
    reasons.push("multiple hidden gaps");
  } else if (hiddenGapCount > 0) {
    score -= 10;
    reasons.push("hidden GPS gaps");
  }

  const boundedScore = Math.max(0, Math.min(100, score));

  return {
    label: boundedScore >= 80 ? "Good" : boundedScore >= 55 ? "OK" : "Poor",
    reason:
      reasons[0] ??
      "Saved report uses accepted GPS points and derived hidden gaps; rejected raw GPS counts were not persisted for older recordings.",
    score: boundedScore
  };
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

function formatLoopExplanation(summary: LoopFillSessionSummary | null) {
  if (!summary) {
    return "No enclosed cell boundary was found for this recording.";
  }

  if (summary.accepted) {
    return `${summary.loopFilledCellCount} interior cells were added because walked cells formed a closed boundary under the current max-area limit.`;
  }

  return `${formatLoopRejectionReason(summary.rejectionReason)}. The walked cells did not produce a fillable enclosed area.`;
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

function formatSteps(steps: number) {
  return Math.max(0, Math.round(steps)).toLocaleString();
}

function formatArea(areaM2: number) {
  if (areaM2 >= 1000000) {
    return `${(areaM2 / 1000000).toFixed(2)} km2`;
  }

  return `${Math.round(areaM2).toLocaleString()} m2`;
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
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800"
  },
  backToMapButton: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.96)",
    borderColor: "rgba(248, 250, 252, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
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
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700"
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(127, 29, 29, 0.16)",
    borderColor: "rgba(248, 113, 113, 0.42)",
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
    color: "#94a3b8",
    fontSize: 12
  },
  detailCard: {
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14
  },
  detailRow: {
    gap: 12,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  detailScreen: {
    gap: 12,
    padding: 18
  },
  detailSubtitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "700",
    marginTop: -8
  },
  detailTitle: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  },
  details: {
    borderTopColor: "rgba(148, 163, 184, 0.18)",
    borderTopWidth: 1,
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    width: "100%"
  },
  detailsTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "900"
  },
  detailValue: {
    color: "#f8fafc",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right"
  },
  empty: {
    alignItems: "center",
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 24
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center"
  },
  emptyTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800"
  },
  header: {
    alignItems: "center",
    backgroundColor: "#02060a",
    borderBottomColor: "rgba(156, 255, 0, 0.22)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingTop: 58
  },
  input: {
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  list: {
    gap: 10,
    padding: 18
  },
  meta: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 4
  },
  reportCard: {
    backgroundColor: "#111c25",
    borderColor: "rgba(156, 255, 0, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12
  },
  reportHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  reportNote: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 17
  },
  reportTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  row: {
    alignItems: "stretch",
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
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
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
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
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700"
  },
  screen: {
    backgroundColor: "#071016",
    flex: 1
  },
  selectedRow: {
    borderColor: "#9cff00",
    borderWidth: 2
  },
  summary: {
    backgroundColor: "#16232e",
    borderColor: "rgba(148, 163, 184, 0.18)",
    borderWidth: 1,
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
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2
  },
  summaryValue: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "900"
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 3
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  },
  toolButton: {
    alignItems: "center",
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 12
  },
  toolButtonText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800"
  },
  tools: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
