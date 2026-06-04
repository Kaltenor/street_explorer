import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings, interpolate } from "../i18n";
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
  currentObjective: CompletionObjective | null;
  currentObjectiveStats: ZoneCompletionStats | null;
  currentObjectiveTodayCells: number;
  currentLocation: GpsPoint | null;
  language: AppLanguage;
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
  currentObjective,
  currentObjectiveStats,
  currentObjectiveTodayCells,
  currentLocation,
  language,
  onClose,
  onFocusZone,
  onSetObjective,
  visible
}: CompletionModalProps) {
  const [mode, setMode] = useState<CompletionMode>("walk");
  const [scope, setScope] = useState<CompletionScope>("district");
  const [stats, setStats] = useState<CompletionStats>(EMPTY_STATS);
  const [zones, setZones] = useState<CachedZone[]>([]);
  const [isRefreshingZones, setIsRefreshingZones] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [zoneStatsById, setZoneStatsById] = useState<Record<string, ZoneCompletionStats>>({});
  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedZoneId) ?? zones[0] ?? null,
    [selectedZoneId, zones]
  );
  const [completedZoneCount, setCompletedZoneCount] = useState(0);
  const [zoneStats, setZoneStats] = useState<ZoneCompletionStats | null>(null);
  const strings = getStrings(language);
  const completionStrings = strings.completionMenu;
  const modeText = ACTIVITY_MODE_TEXT[language];
  const nearestIncompleteZone = useMemo(
    () => getNearestIncompleteZone(zones, zoneStatsById, selectedZoneId),
    [selectedZoneId, zoneStatsById, zones]
  );

  const loadZones = useCallback(
    async () => {
      const cachedZones = sortZonesForLocation(await getCachedZones(scope), currentLocation);
      const bestZone = getBestZoneForLocation(cachedZones, currentLocation);

      setZones(cachedZones);
      setSelectedZoneId((currentZoneId) =>
        currentZoneId && cachedZones.some((zone) => zone.id === currentZoneId)
          ? currentZoneId
          : bestZone?.id ?? cachedZones[0]?.id ?? null
      );
      setZonePickerOpen(false);
    },
    [currentLocation, scope]
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
      setZoneStatsById({});
      setCompletedZoneCount(0);
      return;
    }

    getExploredCellRecords(mode)
      .then(async (cells) => {
        const selectedStats = await calculateZoneCompletionStats(selectedZone, cells);
        const zoneStatsList = await Promise.all(
          zones.map((zone) => calculateZoneCompletionStats(zone, cells))
        );
        const nextZoneStatsById: Record<string, ZoneCompletionStats> = {};

        zones.forEach((zone, index) => {
          const statsForZone = zoneStatsList[index];

          if (statsForZone) {
            nextZoneStatsById[zone.id] = statsForZone;
          }
        });

        setZoneStats(selectedStats);
        setZoneStatsById(nextZoneStatsById);
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
      Alert.alert(
        completionStrings.locationUnavailable,
        completionStrings.locationUnavailableMessage
      );
      return;
    }

    setIsRefreshingZones(true);

    try {
      const result = await fetchNearbyOsmZonesWithDebug(currentLocation);
      await upsertZones(result.zones);
      await loadZones();
      Alert.alert(
        completionStrings.boundariesRefreshed,
        result.zones.length > 0
          ? interpolate(completionStrings.nearbyBoundaryZonesCached, { count: result.zones.length })
          : interpolate(completionStrings.noUsableBoundaries, {
              raw: result.rawElementCount,
              relations: result.relationCount,
              usable: result.usableZoneCount
            })
      );
    } catch (error) {
      console.warn("Failed to refresh OSM boundaries", error);
      Alert.alert(
        completionStrings.boundaryLoadFailed,
        completionStrings.boundaryLoadFailedMessage
      );
    } finally {
      setIsRefreshingZones(false);
    }
  };

  const handleClearBoundaries = () => {
    Alert.alert(completionStrings.clearCachedZones, completionStrings.clearCachedZonesMessage, [
      {
        text: strings.common.cancel,
        style: "cancel"
      },
      {
        text: strings.common.clear,
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
            <Text style={styles.title}>{strings.common.completion}</Text>
            <Text style={styles.subtitle}>{completionStrings.progressSubtitle}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {currentObjective ? (
            <View style={styles.currentObjectivePanel}>
              <View style={styles.currentObjectiveHeader}>
                <Ionicons name="flag-outline" size={17} color="#9cff00" />
                <Text style={styles.currentObjectiveTitle}>{completionStrings.currentObjective}</Text>
              </View>
              <Text numberOfLines={1} style={styles.currentObjectiveName}>
                {currentObjective.zone.name}
              </Text>
              <Text style={styles.currentObjectiveMeta}>
                {formatObjectiveMode(currentObjective.mode, language)} |{" "}
                {formatCompletion(currentObjectiveStats, language)} |{" "}
                {formatObjectiveCells(currentObjectiveStats, language)}
              </Text>
              <Text style={styles.currentObjectiveToday}>
                {interpolate(completionStrings.objectiveCellsToday, {
                  count: currentObjectiveTodayCells
                })}
              </Text>
            </View>
          ) : null}

          <Selector
            label={completionStrings.scope}
            options={SCOPES}
            selected={scope}
            titleForOption={(option) => formatScope(option, language)}
            onSelect={(nextScope) => {
              setScope(nextScope);
              setSelectedZoneId(null);
              setZonePickerOpen(false);
            }}
          />
          <Selector
            label={strings.common.mode}
            options={MODES}
            selected={mode}
            titleForOption={(option) => option === "all" ? strings.common.all : modeText.labels[option]}
            onSelect={setMode}
          />

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>{completionStrings.area}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={isRefreshingZones}
                onPress={handleRefreshBoundaries}
                style={[styles.smallButton, isRefreshingZones ? styles.disabledButton : null]}
              >
                <Ionicons name="refresh" size={15} color="#f8fafc" />
                <Text style={styles.smallButtonText}>
                  {isRefreshingZones ? completionStrings.loading : strings.common.refresh}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleClearBoundaries}
                style={styles.smallButton}
              >
                <Ionicons name="trash-outline" size={15} color="#f8fafc" />
                <Text style={styles.smallButtonText}>{strings.common.clear}</Text>
              </TouchableOpacity>
            </View>
            {zones.length > 0 ? (
              <View style={styles.zonePicker}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setZonePickerOpen((open) => !open)}
                  style={styles.zonePickerButton}
                >
                  <View style={styles.zonePickerText}>
                    <Text style={styles.zonePickerLabel}>
                      {scope === "district"
                        ? completionStrings.nearestDistrict
                        : completionStrings.nearestArea}
                    </Text>
                    <Text numberOfLines={1} style={styles.zonePickerName}>
                      {selectedZone?.name ?? completionStrings.selectArea}
                    </Text>
                    {selectedZone ? (
                      <Text style={styles.zoneMetaText}>
                        {formatZoneLocationHint(selectedZone, currentLocation, language)} |{" "}
                        {formatZoneSource(selectedZone, language)} | {formatFetchedAt(selectedZone.fetchedAt)} |{" "}
                        {formatCompletion(zoneStatsById[selectedZone.id] ?? zoneStats, language)}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={zonePickerOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#f8fafc"
                  />
                </TouchableOpacity>
                {zonePickerOpen ? zones.map((zone) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    key={zone.id}
                    onPress={() => {
                      setSelectedZoneId(zone.id);
                      setZonePickerOpen(false);
                    }}
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
                      {formatZoneLocationHint(zone, currentLocation, language)} | {formatZoneSource(zone, language)} |{" "}
                      {formatFetchedAt(zone.fetchedAt)} |{" "}
                      {formatCompletion(zoneStatsById[zone.id] ?? null, language)}
                    </Text>
                  </TouchableOpacity>
                )) : null}
              </View>
            ) : (
              <Text style={styles.helpText}>
                {interpolate(completionStrings.noCachedBoundary, {
                  scope: formatScope(scope, language).toLowerCase()
                })}
              </Text>
            )}
            {selectedZone ? (
              <>
                <Text style={styles.zoneNotice}>
                  {getZoneNotice(selectedZone, language)}
                </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onFocusZone(selectedZone)}
                style={styles.focusButton}
              >
                <Ionicons name="scan" size={16} color="#f8fafc" />
                <Text style={styles.focusButtonText}>{completionStrings.focusOnMap}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => onSetObjective({ mode, zone: selectedZone })}
                style={[styles.focusButton, isCurrentObjective(currentObjective, selectedZone, mode) ? styles.activeObjectiveButton : null]}
              >
                <Ionicons name="flag-outline" size={16} color="#f8fafc" />
                <Text style={styles.focusButtonText}>
                  {isCurrentObjective(currentObjective, selectedZone, mode)
                    ? completionStrings.currentObjectiveButton
                    : completionStrings.setObjective}
                </Text>
              </TouchableOpacity>
              </>
            ) : null}
          </View>

          <View style={styles.statsGrid}>
            <Stat label={strings.common.completion} value={formatCompletion(zoneStats, language)} />
            <Stat label={completionStrings.zoneCells} value={formatZoneCells(zoneStats, language)} />
            <Stat label={completionStrings.exploredCells} value={String(zoneStats?.exploredCells ?? stats.exploredCells)} />
            <Stat label={completionStrings.directGps} value={String(zoneStats?.directlyWalkedCells ?? stats.directlyWalkedCells)} />
            <Stat label={completionStrings.inferred} value={String(zoneStats?.inferredCells ?? stats.inferredCells)} />
            <Stat label={completionStrings.loopFilled} value={String(zoneStats?.loopFilledCells ?? stats.loopFilledCells)} />
            <Stat label={strings.common.distance} value={formatDistance(stats.walkedDistanceMeters)} />
            <Stat label={language === "fr" ? "Enregistrements" : "Recordings"} value={String(stats.recordingCount)} />
            <Stat label={completionStrings.completedZones} value={String(completedZoneCount)} />
          </View>

          {nearestIncompleteZone ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>{completionStrings.nearbyIncompleteArea}</Text>
              <Text style={styles.helpText}>
                {formatNearbyIncompleteZoneText(
                  nearestIncompleteZone.name,
                  formatCompletion(zoneStatsById[nearestIncompleteZone.id] ?? null, language),
                  formatObjectiveCells(zoneStatsById[nearestIncompleteZone.id] ?? null, language),
                  language
                )}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  setSelectedZoneId(nearestIncompleteZone.id);
                  onSetObjective({ mode, zone: nearestIncompleteZone });
                }}
                style={styles.focusButton}
              >
                <Ionicons name="flag-outline" size={16} color="#f8fafc" />
                <Text style={styles.focusButtonText}>{completionStrings.useAsObjective}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{completionStrings.v1Rules}</Text>
            <Text style={styles.helpText}>
              {completionStrings.v1RulesText}
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

function formatCompletion(stats: ZoneCompletionStats | null, language: AppLanguage) {
  if (!stats || stats.completionPercent === null) {
    return getStrings(language).common.pending;
  }

  return `${stats.completionPercent}%`;
}

function formatZoneCells(stats: ZoneCompletionStats | null, language: AppLanguage) {
  if (!stats || stats.totalZoneCells === null) {
    return getStrings(language).completionMenu.large;
  }

  return String(stats.totalZoneCells);
}

function formatObjectiveMode(mode: CompletionObjective["mode"], language: AppLanguage) {
  return mode === "all"
    ? getStrings(language).completionMenu.objectiveModeAll
    : ACTIVITY_MODE_TEXT[language].labels[mode];
}

function formatObjectiveCells(stats: ZoneCompletionStats | null, language: AppLanguage) {
  const strings = getStrings(language).completionMenu;

  if (!stats) {
    return strings.cellsPending;
  }

  if (stats.totalZoneCells === null) {
    return `${stats.exploredCells} ${strings.explored}`;
  }

  return `${stats.exploredCells} ${strings.explored}, ${Math.max(
    0,
    stats.totalZoneCells - stats.exploredCells
  )} ${strings.left}`;
}

function formatNearbyIncompleteZoneText(
  zoneName: string,
  completion: string,
  cells: string,
  language: AppLanguage
) {
  if (language === "fr") {
    return `${zoneName} est à ${completion}. ${cells}`;
  }

  return `${zoneName} is at ${completion}. ${cells}`;
}

function isCurrentObjective(
  currentObjective: CompletionObjective | null,
  selectedZone: CachedZone,
  mode: CompletionMode
) {
  return currentObjective?.zone.id === selectedZone.id && currentObjective.mode === mode;
}

function getNearestIncompleteZone(
  zones: CachedZone[],
  zoneStatsById: Record<string, ZoneCompletionStats>,
  selectedZoneId: string | null
) {
  return (
    zones.find((zone) => {
      if (zone.id === selectedZoneId) {
        return false;
      }

      const stats = zoneStatsById[zone.id];
      return !stats || stats.completionPercent === null || stats.completionPercent < 100;
    }) ?? null
  );
}

function formatZoneSource(zone: CachedZone, language: AppLanguage) {
  const strings = getStrings(language).completionMenu;

  return zone.source.includes("fallback") ? strings.approxBounds : strings.exactPolygon;
}

function getZoneNotice(zone: CachedZone, language: AppLanguage) {
  const strings = getStrings(language).completionMenu;

  if (zone.source.includes("fallback")) {
    return strings.sourceNoticeApprox;
  }

  return zone.holes.length > 0
    ? strings.exactPolygonWithHoles
    : strings.exactPolygonNotice;
}

function sortZonesForLocation(zones: CachedZone[], currentLocation: GpsPoint | null) {
  if (!currentLocation) {
    return zones;
  }

  return [...zones].sort((first, second) => {
    const firstScore = getZoneLocationScore(first, currentLocation);
    const secondScore = getZoneLocationScore(second, currentLocation);

    if (firstScore.rank !== secondScore.rank) {
      return firstScore.rank - secondScore.rank;
    }

    return firstScore.distanceMeters - secondScore.distanceMeters;
  });
}

function getBestZoneForLocation(zones: CachedZone[], currentLocation: GpsPoint | null) {
  if (!currentLocation || zones.length === 0) {
    return zones[0] ?? null;
  }

  return sortZonesForLocation(zones, currentLocation)[0] ?? null;
}

function getZoneLocationScore(zone: CachedZone, currentLocation: GpsPoint) {
  const coordinate = {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude
  };

  if (isPointInsideZone(coordinate, zone)) {
    return {
      distanceMeters: 0,
      rank: 0
    };
  }

  return {
    distanceMeters: distanceMeters(coordinate, getZoneCenter(zone)),
    rank: 1
  };
}

function formatZoneLocationHint(
  zone: CachedZone,
  currentLocation: GpsPoint | null,
  language: AppLanguage
) {
  const strings = getStrings(language).completionMenu;

  if (!currentLocation) {
    return strings.cached;
  }

  const score = getZoneLocationScore(zone, currentLocation);

  if (score.rank === 0) {
    return strings.youAreHere;
  }

  if (score.distanceMeters >= 1000) {
    return language === "fr"
      ? `à ${(score.distanceMeters / 1000).toFixed(1)} km`
      : `${(score.distanceMeters / 1000).toFixed(1)} km away`;
  }

  return language === "fr"
    ? `à ${Math.round(score.distanceMeters)} m`
    : `${Math.round(score.distanceMeters)} m away`;
}

function isPointInsideZone(point: { latitude: number; longitude: number }, zone: CachedZone) {
  const insideOuter = zone.geometry.some((ring) => pointInPolygon(point, ring));
  const insideHole = zone.holes.some((ring) => pointInPolygon(point, ring));

  return insideOuter && !insideHole;
}

function getZoneCenter(zone: CachedZone) {
  const coordinates = zone.geometry.flat();

  if (coordinates.length === 0) {
    return {
      latitude: 0,
      longitude: 0
    };
  }

  return {
    latitude:
      coordinates.reduce((total, coordinate) => total + coordinate.latitude, 0) /
      coordinates.length,
    longitude:
      coordinates.reduce((total, coordinate) => total + coordinate.longitude, 0) /
      coordinates.length
  };
}

function pointInPolygon(
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>
) {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex++) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];

    if (!current || !previous) {
      continue;
    }

    const intersects =
      current.longitude > point.longitude !== previous.longitude > point.longitude &&
      point.latitude <
        ((previous.latitude - current.latitude) * (point.longitude - current.longitude)) /
          (previous.longitude - current.longitude) +
          current.latitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
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

function formatScope(scope: CompletionScope, language: AppLanguage) {
  if (language === "fr") {
    switch (scope) {
      case "country":
        return "Pays";
      case "city":
        return "Ville";
      case "district":
        return "Quartier";
      default:
        return scope;
    }
  }

  return capitalize(scope);
}

const styles = StyleSheet.create({
  activeObjectiveButton: {
    backgroundColor: "rgba(156, 255, 0, 0.16)",
    borderColor: "rgba(156, 255, 0, 0.42)"
  },
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
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 28
  },
  currentObjectiveHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6
  },
  currentObjectiveMeta: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3
  },
  currentObjectiveToday: {
    color: "#9cff00",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4
  },
  currentObjectiveName: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6
  },
  currentObjectivePanel: {
    backgroundColor: "#0b151d",
    borderColor: "rgba(156, 255, 0, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  currentObjectiveTitle: {
    color: "#9cff00",
    fontSize: 12,
    fontWeight: "900"
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
  helpText: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 19
  },
  disabledButton: {
    opacity: 0.5
  },
  focusButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  focusButtonText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  panel: {
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  panelTitle: {
    color: "#f8fafc",
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
    backgroundColor: "#071016",
    flex: 1
  },
  selectedSelectorButton: {
    backgroundColor: "#9cff00",
    borderColor: "#9cff00"
  },
  selectedSelectorButtonText: {
    color: "#02060a"
  },
  selectedZoneButton: {
    backgroundColor: "rgba(156, 255, 0, 0.16)",
    borderColor: "rgba(156, 255, 0, 0.42)"
  },
  selectedZoneButtonText: {
    color: "#ffffff"
  },
  selectedZoneMetaText: {
    color: "#cbd5e1"
  },
  selectorButton: {
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  selectorButtonText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  selectorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  selectorPanel: {
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  smallButton: {
    alignItems: "center",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  smallButtonText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  stat: {
    backgroundColor: "#0b151d",
    borderColor: "rgba(148, 163, 184, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    padding: 12
  },
  statLabel: {
    color: "#94a3b8",
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
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 13,
    marginTop: 3
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "900"
  },
  zoneButton: {
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  zoneMetaText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3
  },
  zoneNotice: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10
  },
  zoneButtonText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800"
  },
  zonePicker: {
    gap: 8
  },
  zonePickerButton: {
    alignItems: "center",
    backgroundColor: "#111c25",
    borderColor: "rgba(148, 163, 184, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  zonePickerLabel: {
    color: "#9cff00",
    fontSize: 10,
    fontWeight: "900"
  },
  zonePickerName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2
  },
  zonePickerText: {
    flex: 1
  }
});
