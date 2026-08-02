import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppLanguage } from "../i18n";
import { formatDistance, formatDuration } from "../services/distance";
import { simplifyGpsPointsForRender } from "../services/routeSimplification";
import { GpsPoint, WalkSession } from "../types/walk";

export type RecordingRecoveryStatus = "active" | "interrupted" | "uncertain";

export type RecoverableRecording = {
  points: GpsPoint[];
  recoveryStatus: RecordingRecoveryStatus;
  session: WalkSession;
  totalPointCount: number;
};

type RecordingRecoveryModalProps = {
  language: AppLanguage;
  onDiscard: () => void;
  onFinish: (displayName: string) => void;
  onResume: () => void;
  recording: RecoverableRecording | null;
};

const MAX_PREVIEW_POINTS = 2500;

export function RecordingRecoveryModal({
  language,
  onDiscard,
  onFinish,
  onResume,
  recording
}: RecordingRecoveryModalProps) {
  const mapRef = useRef<MapView | null>(null);
  const [finishPromptVisible, setFinishPromptVisible] = useState(false);
  const [finishName, setFinishName] = useState("");
  const strings = getRecoveryStrings(language);
  const previewPoints = useMemo(
    () => buildPreviewPoints(recording?.points ?? []),
    [recording?.points]
  );
  const routeCoordinates = useMemo(
    () =>
      previewPoints.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude
      })),
    [previewPoints]
  );

  useEffect(() => {
    setFinishPromptVisible(false);
    setFinishName(
      recording ? formatDefaultRecordingName(recording.session.startedAt, language) : ""
    );
  }, [language, recording?.session.id, recording?.session.startedAt]);

  const fitPreview = useCallback(() => {
    if (routeCoordinates.length < 2) {
      return;
    }

    mapRef.current?.fitToCoordinates(routeCoordinates, {
      animated: false,
      edgePadding: {
        bottom: 54,
        left: 42,
        right: 42,
        top: 54
      }
    });
  }, [routeCoordinates]);

  if (!recording) {
    return null;
  }

  const { recoveryStatus, session } = recording;
  const lastPoint = recording.points.at(-1) ?? null;
  const distanceMeters = session.distanceMeters;
  const durationSeconds = getRecoveryDurationSeconds(recording, lastPoint);
  const statusPresentation = getStatusPresentation(recoveryStatus, language);
  const finishRecommended = recoveryStatus !== "active";
  const previewRegion = getPreviewRegion(previewPoints);

  return (
    <Modal
      animationType="slide"
      onRequestClose={() => undefined}
      presentationStyle="fullScreen"
      visible
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-checkmark-outline" size={25} color="#f5c451" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>{strings.recoveryEyebrow}</Text>
            <Text style={styles.title}>{strings.title}</Text>
          </View>
        </View>

        <View style={styles.mapWrap}>
          {previewPoints.length > 0 ? (
            <MapView
              initialRegion={previewRegion}
              mapType="standard"
              onMapReady={fitPreview}
              pitchEnabled={false}
              ref={mapRef}
              rotateEnabled={false}
              showsCompass
              style={StyleSheet.absoluteFill}
            >
              {routeCoordinates.length > 1 ? (
                <Polyline
                  coordinates={routeCoordinates}
                  lineCap="round"
                  lineJoin="round"
                  strokeColor="#7c3aed"
                  strokeWidth={6}
                />
              ) : null}
              {routeCoordinates[0] ? (
                <Marker coordinate={routeCoordinates[0]} title={strings.start}>
                  <View style={[styles.routeMarker, styles.startMarker]} />
                </Marker>
              ) : null}
              {routeCoordinates.at(-1) ? (
                <Marker coordinate={routeCoordinates.at(-1)!} title={strings.lastPoint}>
                  <View style={[styles.routeMarker, styles.endMarker]} />
                </Marker>
              ) : null}
            </MapView>
          ) : (
            <View style={styles.emptyPreview}>
              <Ionicons name="location-outline" size={34} color="#64748b" />
              <Text style={styles.emptyPreviewText}>{strings.noRoute}</Text>
            </View>
          )}
          <View pointerEvents="none" style={styles.previewBadge}>
            <Ionicons name="map-outline" size={15} color="#f5c451" />
            <Text style={styles.previewBadgeText}>{strings.savedRoutePreview}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={[styles.statusPanel, { borderColor: statusPresentation.color }]}>
            <View style={styles.statusHeader}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusPresentation.color }
                ]}
              />
              <Text style={styles.statusLabel}>{statusPresentation.label}</Text>
            </View>
            <Text style={styles.statusText}>{statusPresentation.message}</Text>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryItem label={strings.distance} value={formatDistance(distanceMeters)} />
            <SummaryItem label={strings.duration} value={formatDuration(durationSeconds)} />
            <SummaryItem
              label={strings.points}
              value={recording.totalPointCount.toString()}
            />
            <SummaryItem
              label={strings.lastPoint}
              value={lastPoint ? formatShortDate(lastPoint.timestamp) : strings.none}
            />
          </View>

          {finishPromptVisible ? (
            <View style={styles.finishPrompt}>
              <View>
                <Text style={styles.finishTitle}>{strings.nameTitle}</Text>
                <Text style={styles.finishHelp}>{strings.nameHelp}</Text>
              </View>
              <TextInput
                autoFocus
                maxLength={80}
                onChangeText={setFinishName}
                placeholder={strings.namePlaceholder}
                placeholderTextColor="#64748b"
                selectTextOnFocus
                style={styles.nameInput}
                value={finishName}
              />
              <View style={styles.inlineActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setFinishPromptVisible(false)}
                  style={styles.secondaryCompact}
                >
                  <Text style={styles.secondaryText}>{strings.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={!finishName.trim()}
                  onPress={() => onFinish(finishName.trim())}
                  style={[
                    styles.primaryCompact,
                    !finishName.trim() && styles.disabled
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color="#151006" />
                  <Text style={styles.primaryText}>{strings.saveRecoveredWalk}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              {finishRecommended ? (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setFinishPromptVisible(true)}
                    style={styles.primary}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color="#151006" />
                    <Text style={styles.primaryText}>{strings.finishAndSave}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={onResume}
                    style={styles.secondary}
                  >
                    <Ionicons name="play-circle-outline" size={20} color="#f8fafc" />
                    <Text style={styles.secondaryText}>{strings.resumeInstead}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={onResume}
                    style={styles.primary}
                  >
                    <Ionicons name="play-circle" size={20} color="#151006" />
                    <Text style={styles.primaryText}>{strings.resume}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setFinishPromptVisible(true)}
                    style={styles.secondary}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color="#f8fafc" />
                    <Text style={styles.secondaryText}>{strings.finishInstead}</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert(strings.discardTitle, strings.discardMessage, [
                    {
                      style: "cancel",
                      text: strings.cancel
                    },
                    {
                      onPress: onDiscard,
                      style: "destructive",
                      text: strings.discard
                    }
                  ])
                }
                style={styles.danger}
              >
                <Ionicons name="trash-outline" size={19} color="#f87171" />
                <Text style={styles.dangerText}>{strings.discard}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text numberOfLines={1} style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function buildPreviewPoints(points: GpsPoint[]) {
  if (points.length <= 2) {
    return points;
  }

  const toleranceMeters =
    points.length > 10000 ? 6 : points.length > 3000 ? 3 : 1.5;
  const simplified = simplifyGpsPointsForRender(points, toleranceMeters);

  if (simplified.length <= MAX_PREVIEW_POINTS) {
    return simplified;
  }

  const sampled: GpsPoint[] = [];
  const lastIndex = simplified.length - 1;

  for (let index = 0; index < MAX_PREVIEW_POINTS; index += 1) {
    const sourceIndex = Math.round((index / (MAX_PREVIEW_POINTS - 1)) * lastIndex);
    const point = simplified[sourceIndex];

    if (point && sampled.at(-1) !== point) {
      sampled.push(point);
    }
  }

  return sampled;
}

function getPreviewRegion(points: GpsPoint[]): Region {
  if (points.length === 0) {
    return {
      latitude: 45.764,
      latitudeDelta: 0.025,
      longitude: 4.8357,
      longitudeDelta: 0.025
    };
  }

  let minLatitude = points[0]!.latitude;
  let maxLatitude = points[0]!.latitude;
  let minLongitude = points[0]!.longitude;
  let maxLongitude = points[0]!.longitude;

  for (const point of points) {
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
  }

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    latitudeDelta: Math.max(0.004, (maxLatitude - minLatitude) * 1.35),
    longitude: (minLongitude + maxLongitude) / 2,
    longitudeDelta: Math.max(0.004, (maxLongitude - minLongitude) * 1.35)
  };
}

function getRecoveryDurationSeconds(
  recording: RecoverableRecording,
  lastPoint: GpsPoint | null
) {
  const startTime = new Date(recording.session.startedAt).getTime();
  const endTime =
    recording.recoveryStatus === "active"
      ? Date.now()
      : lastPoint
        ? new Date(lastPoint.timestamp).getTime()
        : startTime;

  return Math.max(
    recording.session.durationSeconds,
    Math.round(Math.max(0, endTime - startTime) / 1000)
  );
}

function formatDefaultRecordingName(value: string, language: AppLanguage) {
  const date = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));

  return (language === "fr" ? "Marche récupérée · " : "Recovered walk · ") + date;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function getStatusPresentation(
  status: RecordingRecoveryStatus,
  language: AppLanguage
) {
  const isFrench = language === "fr";

  switch (status) {
    case "active":
      return {
        color: "#34d399",
        label: isFrench ? "Enregistrement actif" : "Recording active",
        message: isFrench
          ? "Le service GPS en arrière-plan fonctionne encore. Reprendre est recommandé."
          : "The background GPS service is still running. Resume is recommended."
      };
    case "interrupted":
      return {
        color: "#f5c451",
        label: isFrench ? "Enregistrement interrompu" : "Recording interrupted",
        message: isFrench
          ? "Le service GPS en arrière-plan est arrêté. Terminer et enregistrer est recommandé."
          : "The background GPS service has stopped. Finish and save is recommended."
      };
    default:
      return {
        color: "#94a3b8",
        label: isFrench ? "État incertain" : "Status uncertain",
        message: isFrench
          ? "Le service GPS n'a pas pu être vérifié. Terminer en sécurité est recommandé."
          : "The background GPS service could not be verified. Finishing safely is recommended."
      };
  }
}

function getRecoveryStrings(language: AppLanguage) {
  const isFrench = language === "fr";

  return isFrench
    ? {
        cancel: "Retour",
        discard: "Supprimer définitivement",
        discardMessage: "Cette marche et ses points GPS seront supprimés. Cette action est irréversible.",
        discardTitle: "Supprimer la marche récupérée ?",
        distance: "Distance",
        duration: "Durée",
        finishAndSave: "Terminer et enregistrer",
        finishInstead: "Terminer à la place",
        lastPoint: "Dernier point",
        nameHelp: "Un nom date/heure est proposé. Modifiez-le avant l'enregistrement.",
        namePlaceholder: "Nom de la marche",
        nameTitle: "Nommer la marche récupérée",
        noRoute: "Aucun point GPS enregistré à afficher.",
        none: "Aucun",
        points: "Points",
        recoveryEyebrow: "RÉCUPÉRATION",
        resume: "Reprendre l'enregistrement",
        resumeInstead: "Reprendre à la place",
        savedRoutePreview: "Aperçu du tracé enregistré",
        saveRecoveredWalk: "Enregistrer la marche",
        start: "Départ",
        title: "Marche inachevée"
      }
    : {
        cancel: "Back",
        discard: "Discard permanently",
        discardMessage: "This walk and its saved GPS points will be deleted. This cannot be undone.",
        discardTitle: "Discard recovered walk?",
        distance: "Distance",
        duration: "Duration",
        finishAndSave: "Finish and save",
        finishInstead: "Finish instead",
        lastPoint: "Last point",
        nameHelp: "A date/time name is ready. Edit it before saving.",
        namePlaceholder: "Walk name",
        nameTitle: "Name recovered walk",
        noRoute: "No saved GPS points to preview.",
        none: "None",
        points: "Points",
        recoveryEyebrow: "RECOVERY",
        resume: "Resume recording",
        resumeInstead: "Resume instead",
        savedRoutePreview: "Saved route preview",
        saveRecoveredWalk: "Save recovered walk",
        start: "Start",
        title: "Unfinished walk"
      };
}

const styles = StyleSheet.create({
  actions: {
    gap: 9
  },
  danger: {
    alignItems: "center",
    borderColor: "rgba(248, 113, 113, 0.65)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 44
  },
  dangerText: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: "800"
  },
  disabled: {
    opacity: 0.45
  },
  emptyPreview: {
    alignItems: "center",
    backgroundColor: "#0c151c",
    flex: 1,
    gap: 10,
    justifyContent: "center"
  },
  emptyPreviewText: {
    color: "#94a3b8",
    fontSize: 13
  },
  endMarker: {
    backgroundColor: "#f5c451",
    borderColor: "#151006"
  },
  eyebrow: {
    color: "#f5c451",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4
  },
  finishHelp: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  finishPrompt: {
    gap: 11
  },
  finishTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900"
  },
  header: {
    alignItems: "center",
    backgroundColor: "#071018",
    borderBottomColor: "rgba(245, 196, 81, 0.22)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  headerIcon: {
    alignItems: "center",
    backgroundColor: "rgba(245, 196, 81, 0.14)",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  headerText: {
    flex: 1
  },
  inlineActions: {
    flexDirection: "row",
    gap: 9
  },
  mapWrap: {
    backgroundColor: "#0c151c",
    flex: 1,
    minHeight: 230
  },
  nameInput: {
    backgroundColor: "#13212b",
    borderColor: "#2a3c49",
    borderRadius: 14,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12
  },
  panel: {
    backgroundColor: "#071018",
    borderTopColor: "rgba(245, 196, 81, 0.22)",
    borderTopWidth: 1,
    gap: 12,
    padding: 16
  },
  previewBadge: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(7, 16, 24, 0.92)",
    borderColor: "rgba(245, 196, 81, 0.35)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: "absolute",
    top: 12
  },
  previewBadgeText: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "800"
  },
  primary: {
    alignItems: "center",
    backgroundColor: "#f5c451",
    borderRadius: 14,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 48
  },
  primaryCompact: {
    alignItems: "center",
    backgroundColor: "#f5c451",
    borderRadius: 14,
    flex: 1.45,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8
  },
  primaryText: {
    color: "#151006",
    fontSize: 14,
    fontWeight: "900"
  },
  routeMarker: {
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    width: 16
  },
  screen: {
    backgroundColor: "#071018",
    flex: 1
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
  secondaryCompact: {
    alignItems: "center",
    backgroundColor: "#13212b",
    borderColor: "#2a3c49",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44
  },
  secondaryText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "800"
  },
  startMarker: {
    backgroundColor: "#34d399",
    borderColor: "#052e25"
  },
  statusDot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  statusHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7
  },
  statusLabel: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  statusPanel: {
    backgroundColor: "#0c151c",
    borderRadius: 14,
    borderWidth: 1,
    padding: 11
  },
  statusText: {
    color: "#cbd5e1",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8
  },
  summaryItem: {
    backgroundColor: "#0c151c",
    borderRadius: 12,
    flex: 1,
    minWidth: 0,
    padding: 9
  },
  summaryLabel: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 2
  },
  summaryValue: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900"
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 1
  }
});