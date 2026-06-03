import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import {
  CachedZone,
  CompletionScope,
  CompletionStats,
  getExploredCellRecords,
  getCachedZones,
  getCompletionStats,
  deleteCachedZones,
  upsertZones
} from "../database/completionRepository";
import {
  ZoneCompletionStats,
  calculateZoneCompletionStats,
  fetchNearbyOsmZonesWithDebug
} from "../services/zoneCompletion";
import { ActivityMode, GpsPoint } from "../types/walk";

type CompletionMode = ActivityMode | "all";

export type CompletionObjective = {
  mode: CompletionMode;
  zone: CachedZone;
};

type CompletionModalProps = {
  currentLocation: GpsPoint | null;
  onFocusZone: (zone: CachedZone) => void;
  onSetObjective: (objective: CompletionObjective) => void;
  visible: boolean;
  onClose: () => void;
};

const EMPTY_STATS: CompletionStats = {
  directlyWalkedCells: 0,
  exploredCells: 0,
  inferredCells: 0,
  loopFilledCells: 0,
  recordingCount: 0,
  walkedDistanceMeters: 0
};

const SCOPES: CompletionScope[] = ["country", "city", "district"];
const MODES: CompletionMode[] = ["walk", "wheel", "car", "all"];

export function CompletionModal({
  currentLocation,
  onClose,
  onFocusZone,
  onSetObjective,
  visible
}: CompletionModalProps) {
  const [mode, setMode] = useState<CompletionMode>("all");
  const [scope, setScope] = useState<CompletionScope>("city");
  const [stats, setStats] = useState<CompletionStats>(EMPTY_STATS);
  const [zones, setZones] = useState<CachedZone[]>([]);
  const [isRefreshingZones, setIsRefreshingZones] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? zones[0] ?? null,
    [selectedZoneId, zones]
  );
  const [completedZoneCount, setCompletedZoneCount] = useState(0);
  const [zoneStats, setZoneStats] = useState<ZoneCompletionStats | null>(null);

  const loadZones = useCallback(
    async () => {
      const cachedZones = await getCachedZones(scope);
      setZones(cachedZones);
      setSelectedZoneId((currentZoneId) =>
        currentZoneId && cachedZones.some((zone) => zone.id === currentZoneId)
          ? currentZoneId
          : cachedZones[0]?.id ?? null
      );
    },
    [scope]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    getCompletionStats(mode)
      .then(setStats)
      .catch((error) => console.warn("Failed to load completion stats", error));
  }, [mode, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    loadZones()
      .catch((error) => console.warn("Failed to load completion zones", error));
  }, [loadZones, visible]);

  useEffect(() => {
    if (!visible || !selectedZone) {
      setZoneStats(null);
      setCompletedZoneCount(0);
      return;
    }

    getExploredCellRecords(mode)
      .then(async (cells) => {
        const selectedStats = await calculateZoneCompletionStats(selectedZone, cells);
        const zoneStatsList = await Promise.all(
          zones.map((zone) => calculateZoneCompletionStats(zone, cells))
        );

        setZoneStats(selectedStats);
        setCompletedZoneCount(
          zoneStatsList.filter(
            (completion) =>
              completion.completionPercent !== null && completion.completionPercent >= 100
          ).length
        );
      })
      .catch((error) => console.warn("Failed to calculate zone completion", error));
  }, [mode, selectedZone, visible, zones]);

  const handleRefreshBoundaries = async () => {
    if (!currentLocation) {
      Alert.alert("Location unavailable", "Wait for GPS before refreshing boundaries.");
      return;
    }

    setIsRefreshingZones(true);

    try {
      const result = await fetchNearbyOsmZonesWithDebug(currentLocation);
      await upsertZones(result.zones);
      await loadZones();
      Alert.alert(
        "Boundaries refreshed",
        result.zones.length > 0
          ? `${result.zones.length} nearby boundary zones were cached.`
          : `No usable boundaries were found. Raw: ${result.rawElementCount}, relations: ${result.relationCount}, usable: ${result.usableZoneCount}.`
      );
    } catch (error) {
      console.warn("Failed to refresh OSM boundaries", error);
      Alert.alert("Boundary load failed", "Street Explorer could not fetch nearby OSM boundaries.");
    } finally {
      setIsRefreshingZones(false);
    }
  };

  const handleClearBoundaries = () => {
    Alert.alert("Clear cached zones?", "This removes cached boundary zones, not recordings.", [
      {
        text: "Cancel",
        style: "cancel"
      },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await deleteCachedZones();
          setZones([]);
          setSelectedZoneId(null);
          setZoneStats(null);
          setCompletedZoneCount(0);
        }
      }
    ]);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Completion</Text>
            <Text style={styles.subtitle}>Exploration progress by area and mode</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Selector
            label="Scope"
            options={SCOPES}
            selected={scope}
            titleForOption={(option) => capitalize(option)}
            onSelect={setScope}
          />
          <Selector
            label="Mode"
            options={MODES}
            selected={mode}
            titleForOption={(option) => option === "all" ? "All" : ACTIVITY_MODE_LABELS[option]}
            onSelect={setMode}
          />

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Area</Text>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={isRefreshingZones}
                onPress={handleRefreshBoundaries}
                style={[styles.smallButton, isRefreshingZones ? styles.disabledButton : null]}
              >
                <Ionicons name="refresh" size={15} color="#0f172a" />
                <Text style={styles.smallButtonText}>
                  {isRefreshingZones ? "Loading" : "Refresh"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleClearBoundaries}
                style={styles.smallButton}
              >
                <Ionicons name="trash-outline" size={15} color="#0f172a" />
                <Text style={styles.smallButtonText}>Clear</Text>
              </TouchableOpacity>
            </View>
            {zones.length > 0 ? (
              <View style={styles.zoneList}>
                {zones.map((zone) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={zone.id}
                    onPress={() => setSelectedZoneId(zone.id)}
                    style={[
                      styles.zoneButton,
                      selectedZone?.id === zone.id ? styles.selectedZoneButton : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.zoneButtonText,
                        selectedZone?.id === zone.id ? styles.selectedZoneButtonText : null
                      ]}
                    >
                      {zone.name}
                    </Text>
                    <Text
                      style={[
                        styles.zoneMetaText,
                        selectedZone?.id === zone.id ? styles.selectedZoneMetaText : null
                      ]}
                    >
                      {formatZoneSource(zone)} | {formatFetchedAt(zone.fetchedAt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.helpText}>
                No cached {scope} boundary yet. Tap Refresh to load nearby OSM boundaries.
              </Text>
            )}
            {selectedZone ? (
              <>
                <Text style={styles.zoneNotice}>
                  {getZoneNotice(selectedZone)}
                </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onFocusZone(selectedZone)}
                style={styles.focusButton}
              >
                <Ionicons name="scan" size={16} color="#0f172a" />
                <Text style={styles.focusButtonText}>Focus on map</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onSetObjective({ mode, zone: selectedZone })}
                style={styles.focusButton}
              >
                <Ionicons name="flag-outline" size={16} color="#0f172a" />
                <Text style={styles.focusButtonText}>Set objective</Text>
              </TouchableOpacity>
              </>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <Stat label="Completion" value={formatCompletion(zoneStats)} />
            <Stat label="Zone cells" value={formatZoneCells(zoneStats)} />
            <Stat label="Explored cells" value={String(zoneStats?.exploredCells ?? stats.exploredCells)} />
            <Stat label="Direct GPS" value={String(zoneStats?.directlyWalkedCells ?? stats.directlyWalkedCells)} />
            <Stat label="Inferred" value={String(zoneStats?.inferredCells ?? stats.inferredCells)} />
            <Stat label="Loop-filled" value={String(zoneStats?.loopFilledCells ?? stats.loopFilledCells)} />
            <Stat label="Distance" value={formatDistance(stats.walkedDistanceMeters)} />
            <Stat label="Recordings" value={String(stats.recordingCount)} />
            <Stat label="Completed zones" value={String(completedZoneCount)} />
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>V1 rules</Text>
            <Text style={styles.helpText}>
              The main map stays readable: cells and recorded paths are the primary game layer.
              OSM is kept as hidden analysis data for street matching, loop-fill checks, and future
              city or district boundaries.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Selector<T extends string>({
  label,
  onSelect,
  options,
  selected,
  titleForOption
}: {
  label: string;
  onSelect: (option: T) => void;
  options: T[];
  selected: T;
  titleForOption: (option: T) => string;
}) {
  return (
    <View style={styles.selectorPanel}>
      <Text style={styles.panelTitle}>{label}</Text>
      <View style={styles.selectorOptions}>
        {options.map((option) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={option}
            onPress={() => onSelect(option)}
            style={[styles.selectorButton, selected === option ? styles.selectedSelectorButton : null]}
          >
            <Text
              style={[
                styles.selectorButtonText,
                selected === option ? styles.selectedSelectorButtonText : null
              ]}
            >
              {titleForOption(option)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatCompletion(stats: ZoneCompletionStats | null) {
  if (!stats || stats.completionPercent === null) {
    return "Pending";
  }

  return `${stats.completionPercent}%`;
}

function formatZoneCells(stats: ZoneCompletionStats | null) {
  if (!stats || stats.totalZoneCells === null) {
    return "Large";
  }

  return String(stats.totalZoneCells);
}

function formatZoneSource(zone: CachedZone) {
  return zone.source.includes("fallback") ? "Approx bounds" : "Exact polygon";
}

function getZoneNotice(zone: CachedZone) {
  if (zone.source.includes("fallback")) {
    return "Completion is approximate: this zone is using OSM bounds because the exact polygon could not be assembled yet.";
  }

  return zone.holes.length > 0
    ? "Exact polygon with inner holes excluded from completion."
    : "Exact polygon from OSM boundary geometry.";
}

function formatFetchedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    padding: 16,
    paddingBottom: 28
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
  helpText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19
  },
  disabledButton: {
    opacity: 0.5
  },
  focusButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#f8fafc",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  focusButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  panelTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  screen: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  selectedSelectorButton: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  selectedSelectorButtonText: {
    color: "#ffffff"
  },
  selectedZoneButton: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a"
  },
  selectedZoneButtonText: {
    color: "#ffffff"
  },
  selectedZoneMetaText: {
    color: "#cbd5e1"
  },
  selectorButton: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  selectorButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  selectorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  selectorPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  smallButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  smallButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  stat: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12
  },
  statLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statValue: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
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
  },
  zoneButton: {
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  zoneMetaText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3
  },
  zoneNotice: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10
  },
  zoneButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  zoneList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
