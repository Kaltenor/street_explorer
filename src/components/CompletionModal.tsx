import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import {
  CachedZone,
  CompletionScope,
  CompletionStats,
  getCachedZones,
  getCompletionStats
} from "../database/completionRepository";
import { ActivityMode } from "../types/walk";

type CompletionMode = ActivityMode | "all";

type CompletionModalProps = {
  visible: boolean;
  onClose: () => void;
};

const EMPTY_STATS: CompletionStats = {
  directlyWalkedCells: 0,
  exploredCells: 0,
  loopFilledCells: 0,
  recordingCount: 0,
  walkedDistanceMeters: 0
};

const SCOPES: CompletionScope[] = ["country", "city", "district"];
const MODES: CompletionMode[] = ["walk", "wheel", "car", "all"];

export function CompletionModal({ onClose, visible }: CompletionModalProps) {
  const [mode, setMode] = useState<CompletionMode>("all");
  const [scope, setScope] = useState<CompletionScope>("city");
  const [stats, setStats] = useState<CompletionStats>(EMPTY_STATS);
  const [zones, setZones] = useState<CachedZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? zones[0] ?? null,
    [selectedZoneId, zones]
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

    getCachedZones(scope)
      .then((cachedZones) => {
        setZones(cachedZones);
        setSelectedZoneId((currentZoneId) =>
          currentZoneId && cachedZones.some((zone) => zone.id === currentZoneId)
            ? currentZoneId
            : cachedZones[0]?.id ?? null
        );
      })
      .catch((error) => console.warn("Failed to load completion zones", error));
  }, [scope, visible]);

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
            <Text style={styles.panelTitle}>Area</Text>
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
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.helpText}>
                No cached {scope} boundary yet. The app will use OSM boundaries later when nearby
                zones are available.
              </Text>
            )}
          </View>

          <View style={styles.statsGrid}>
            <Stat label="Completion" value={selectedZone ? "V1" : "Pending"} />
            <Stat label="Explored cells" value={String(stats.exploredCells)} />
            <Stat label="Direct GPS" value={String(stats.directlyWalkedCells)} />
            <Stat label="Loop-filled" value={String(stats.loopFilledCells)} />
            <Stat label="Distance" value={formatDistance(stats.walkedDistanceMeters)} />
            <Stat label="Recordings" value={String(stats.recordingCount)} />
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
