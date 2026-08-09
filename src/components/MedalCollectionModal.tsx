import { useEffect, useMemo, useState } from "react";
import { createAppearanceStyles } from "../constants/appearance";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AtlasModalHeader, AtlasScreen, AtlasSectionLabel } from "./AtlasCabinet";
import { APP_COLORS } from "../constants/theme";
import type { CachedZone } from "../database/completionRepository";
import { AppLanguage } from "../i18n";
import { isPointInsideZone } from "../services/zoneCompletion";
import {
  CollectedMedal,
  CollectedMedalCity,
  LocalizedMedalText,
  MedalAlbumProgress,
  MedalCategory
} from "../types/medal";
import {
  MedalWikipediaReader,
  WikipediaReaderOrigin
} from "./MedalWikipediaReader";

type DistrictFilter = "all" | string;
type MedalScope = "city" | "allCities";

type MedalDistrictOption = {
  fallbackNumber: number | null;
  id: string;
  label: string;
  zone: CachedZone | null;
};

type MedalCollectionModalProps = {
  collectedCities: CollectedMedalCity[];
  districtZones: CachedZone[];
  language: AppLanguage;
  progress: MedalAlbumProgress | null;
  retroScanComplete: boolean;
  scanning: boolean;
  visible: boolean;
  onClose: () => void;
  onFocusMedal: (medal: CollectedMedal) => void;
  onRunRetroScan: () => void;
};

const CATEGORY_ICONS: Record<MedalCategory, keyof typeof Ionicons.glyphMap> = {
  architecture: "business-outline",
  art: "color-palette-outline",
  culture: "film-outline",
  history: "time-outline",
  nature: "leaf-outline"
};

export function MedalCollectionModal({
  collectedCities,
  districtZones,
  language,
  progress,
  retroScanComplete,
  scanning,
  visible,
  onClose,
  onFocusMedal,
  onRunRetroScan
}: MedalCollectionModalProps) {
  const [district, setDistrict] = useState<DistrictFilter>("all");
  const [scope, setScope] = useState<MedalScope>("city");
  const [wikipediaSelection, setWikipediaSelection] = useState<{
    cityName: LocalizedMedalText;
    medal: CollectedMedal;
    origin: WikipediaReaderOrigin;
  } | null>(null);
  const text = getText(language);
  const districtOptions = useMemo(
    () => buildDistrictOptions({
      districtLabel: text.district,
      language,
      medals: progress?.medals ?? [],
      zones: districtZones
    }),
    [districtZones, language, progress?.medals, text.district]
  );
  const districtByMedalId = useMemo(
    () => new Map(
      (progress?.medals ?? []).map((medal) => [
        medal.id,
        districtOptions.find((option) => medalMatchesDistrict(medal, option)) ?? null
      ])
    ),
    [districtOptions, progress?.medals]
  );
  const filteredMedals = useMemo(
    () =>
      progress?.medals.filter(
        (medal) => district === "all" || districtByMedalId.get(medal.id)?.id === district
      ) ?? [],
    [district, districtByMedalId, progress]
  );
  const collectedMedals = filteredMedals.filter((medal) => medal.isCollected);
  const lockedMedals = filteredMedals.filter((medal) => !medal.isCollected);
  const sortedCollectedCities = useMemo(
    () => [...collectedCities].sort((left, right) =>
      left.cityName[language].localeCompare(right.cityName[language], language)
    ),
    [collectedCities, language]
  );
  const allCitiesCollectedCount = sortedCollectedCities.reduce(
    (total, city) => total + city.medals.length,
    0
  );

  useEffect(() => {
    if (!visible) {
      setWikipediaSelection(null);
    }
  }, [visible]);

  useEffect(() => {
    if (
      district !== "all" &&
      !districtOptions.some((option) => option.id === district)
    ) {
      setDistrict("all");
    }
  }, [district, districtOptions]);

  const openWikipedia = (
    cityName: LocalizedMedalText,
    medal: CollectedMedal,
    event: GestureResponderEvent
  ) => {
    setWikipediaSelection({
      cityName,
      medal,
      origin: {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY
      }
    });
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={wikipediaSelection ? () => setWikipediaSelection(null) : onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <View
          accessibilityElementsHidden={Boolean(wikipediaSelection)}
          importantForAccessibility={wikipediaSelection ? "no-hide-descendants" : "auto"}
          style={styles.modalRoot}
        >
          <AtlasScreen onSwipeBack={onClose} visible={visible}>
        <AtlasModalHeader
          emblem="ribbon-outline"
          eyebrow={text.collection}
          onBack={onClose}
          subtitle={scope === "allCities"
            ? `${allCitiesCollectedCount} ${text.collected} · ${sortedCollectedCities.length} ${text.cities}`
            : `${progress?.collectedCount ?? 0}/${progress?.medals.length ?? 0} ${text.collected}`}
          title={scope === "allCities"
            ? text.allCities
            : progress?.album.cityName[language] ?? text.medals}
        />

        <View style={styles.filterPanel}>
          <AtlasSectionLabel icon="earth-outline" title={text.scope} />
          <ScrollView
            horizontal
            contentContainerStyle={styles.filters}
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroller}
          >
            {(["city", "allCities"] as MedalScope[]).map((nextScope) => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: scope === nextScope }}
                key={nextScope}
                onPress={() => setScope(nextScope)}
                style={[styles.filter, scope === nextScope ? styles.filterActive : null]}
              >
                <Text style={[styles.filterText, scope === nextScope ? styles.filterTextActive : null]}>
                  {nextScope === "allCities"
                    ? text.allCities
                    : progress?.album.cityName[language] ?? text.currentCity}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {scope === "city" ? <>
            <AtlasSectionLabel icon="map-outline" title={text.browse} />
            <ScrollView
              horizontal
              contentContainerStyle={styles.filters}
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroller}
            >
              {(["all", ...districtOptions.map((option) => option.id)] as DistrictFilter[]).map((filter) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: district === filter }}
                  key={filter}
                  onPress={() => setDistrict(filter)}
                  style={[styles.filter, district === filter ? styles.filterActive : null]}
                >
                  <Text style={[styles.filterText, district === filter ? styles.filterTextActive : null]}>
                    {filter === "all"
                      ? text.all
                      : districtOptions.find((option) => option.id === filter)?.label ?? filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </> : null}
        </View>

        <ScrollView contentContainerStyle={styles.medalGrid}>
          {scope === "city" ? <>
            <MedalSection
            cityName={progress?.album.cityName}
            emptyLabel={text.noUnlocked}
            language={language}
            medals={collectedMedals}
            onFocusMedal={onFocusMedal}
            onOpenWikipedia={openWikipedia}
            districtByMedalId={districtByMedalId}
            title={text.unlockedSection}
          />
          <MedalSection
            cityName={progress?.album.cityName}
            emptyLabel={text.noLocked}
            language={language}
            medals={lockedMedals}
            onFocusMedal={onFocusMedal}
            onOpenWikipedia={openWikipedia}
            districtByMedalId={districtByMedalId}
            title={text.lockedSection}
          />

          <View style={styles.retroCard}>
            <Text style={styles.retroTitle}>{text.pastWalks}</Text>
            <Text style={styles.retroDescription}>
              {retroScanComplete ? text.scanComplete : text.scanDescription}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={scanning}
              onPress={onRunRetroScan}
              style={[styles.scanButton, scanning ? styles.scanButtonDisabled : null]}
            >
              {scanning ? <ActivityIndicator color="#02060a" /> : (
                <Text style={styles.scanButtonText}>
                  {retroScanComplete ? text.scanAgain : text.scan}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.attribution}>{progress?.album.sourceAttribution}</Text>
          </> : sortedCollectedCities.length === 0 ? (
            <Text style={styles.emptySection}>{text.noAllCities}</Text>
          ) : sortedCollectedCities.map((city) => (
            <MedalSection
              cityName={city.cityName}
              emptyLabel={text.noUnlocked}
              key={city.albumId}
              language={language}
              medals={city.medals}
              onFocusMedal={onFocusMedal}
              onOpenWikipedia={openWikipedia}
              sourceAttribution={city.sourceAttribution}
              title={city.cityName[language].toUpperCase()}
            />
          ))}
        </ScrollView>
          </AtlasScreen>
        </View>
        {wikipediaSelection ? (
          <MedalWikipediaReader
            cityName={wikipediaSelection.cityName}
            language={language}
            medal={wikipediaSelection.medal}
            onClosed={() => setWikipediaSelection(null)}
            origin={wikipediaSelection.origin}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function MedalSection({
  cityName,
  districtByMedalId,
  emptyLabel,
  language,
  medals,
  onFocusMedal,
  onOpenWikipedia,
  sourceAttribution,
  title
}: {
  cityName?: LocalizedMedalText;
  districtByMedalId?: Map<string, MedalDistrictOption | null>;
  emptyLabel: string;
  language: AppLanguage;
  medals: CollectedMedal[];
  onFocusMedal: (medal: CollectedMedal) => void;
  onOpenWikipedia: (
    cityName: LocalizedMedalText,
    medal: CollectedMedal,
    event: GestureResponderEvent
  ) => void;
  sourceAttribution?: string;
  title: string;
}) {
  const text = getText(language);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{medals.length}</Text>
      </View>
      {medals.length === 0 ? <Text style={styles.emptySection}>{emptyLabel}</Text> : null}
      {medals.map((medal) => (
        <View
          key={medal.id}
          style={[styles.card, medal.isCollected ? styles.cardCollected : styles.cardLocked]}
        >
          <TouchableOpacity
            accessibilityHint={text.mapHint}
            accessibilityLabel={medal.name[language] + ", " + (medal.isCollected ? text.unlocked : text.locked)}
            accessibilityRole="button"
            onPress={() => onFocusMedal(medal)}
            style={styles.cardMapAction}
          >
            <View style={[styles.medal, medal.isCollected ? styles.medalCollected : null]}>
              <Ionicons
                color={medal.isCollected ? APP_COLORS.parchment : APP_COLORS.textMuted}
                name={medal.isCollected ? CATEGORY_ICONS[medal.category] : "lock-closed"}
                size={28}
              />
            </View>
            <View style={styles.cardText}>
              <Text style={[styles.medalName, !medal.isCollected ? styles.lockedText : null]}>
                {medal.name[language]}
              </Text>
              <Text style={styles.category}>
                {districtByMedalId?.get(medal.id)?.label ?? (
                  medal.arrondissement
                    ? `${text.district} ${medal.arrondissement}`
                    : text.citywide
                )}
              </Text>
            </View>
            <Ionicons color={APP_COLORS.textMuted} name="locate-outline" size={20} />
          </TouchableOpacity>
          {medal.isCollected && cityName ? (
            <TouchableOpacity
              accessibilityHint={text.wikipediaHint}
              accessibilityLabel={`${text.wikipedia}: ${medal.name[language]}`}
              accessibilityRole="link"
              onPress={(event) => onOpenWikipedia(cityName, medal, event)}
              style={styles.wikipediaAction}
            >
              <Text numberOfLines={3} style={styles.description}>
                {medal.description[language]}
              </Text>
              <View style={styles.wikipediaLabelRow}>
                <Ionicons color={APP_COLORS.gold} name="book-outline" size={13} />
                <Text style={styles.wikipediaLabel}>{text.wikipedia}</Text>
                <Ionicons color={APP_COLORS.gold} name="expand-outline" size={12} />
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {sourceAttribution ? (
        <Text style={styles.attribution}>{sourceAttribution}</Text>
      ) : null}
    </View>
  );
}

function buildDistrictOptions({
  districtLabel,
  language,
  medals,
  zones
}: {
  districtLabel: string;
  language: AppLanguage;
  medals: CollectedMedal[];
  zones: CachedZone[];
}): MedalDistrictOption[] {
  if (zones.length > 0) {
    return zones
      .map((zone) => {
        const number = getDistrictNumber(zone.name);

        return {
          fallbackNumber: number,
          id: zone.id,
          label: number === null ? zone.name : `${districtLabel} ${number}`,
          zone
        };
      })
      .sort((left, right) => {
        if (left.fallbackNumber !== null && right.fallbackNumber !== null) {
          return left.fallbackNumber - right.fallbackNumber;
        }

        if (left.fallbackNumber !== null) {
          return -1;
        }

        if (right.fallbackNumber !== null) {
          return 1;
        }

        return left.label.localeCompare(right.label, language);
      });
  }

  const highestNumber = medals.reduce(
    (highest, medal) => Math.max(highest, medal.arrondissement ?? 0),
    0
  );

  return Array.from({ length: highestNumber }, (_, index) => {
    const number = index + 1;

    return {
      fallbackNumber: number,
      id: `district-number:${number}`,
      label: `${districtLabel} ${number}`,
      zone: null
    };
  });
}

function medalMatchesDistrict(
  medal: CollectedMedal,
  district: MedalDistrictOption
) {
  if (district.zone) {
    return isPointInsideZone(
      { latitude: medal.latitude, longitude: medal.longitude },
      district.zone
    );
  }

  return medal.arrondissement === district.fallbackNumber;
}

function getDistrictNumber(name: string) {
  const match = /(?:^|\D)(\d{1,2})(?:er|e|eme|ème|st|nd|rd|th)?\s*(?:arrondissement|district)(?:\D|$)/i.exec(
    name
  ) ?? /(?:arrondissement|district)\D*(\d{1,2})(?:\D|$)/i.exec(name);
  const number = match?.[1] ? Number(match[1]) : Number.NaN;

  return Number.isInteger(number) && number > 0 ? number : null;
}

function getText(language: AppLanguage) {
  if (language === "fr") {
    return {
      all: "Toutes",
      allCities: "Toutes les villes",
      cities: "villes",
      citywide: "Toute la ville",
      close: "Fermer", collected: "collect\u00e9es", collection: "M\u00c9DAILLES DE LIEUX",
      currentCity: "Ville actuelle",
      district: "Arrondissement",
      locked: "verrouill\u00e9e", lockedSection: "VERROUILL\u00c9ES", mapHint: "Afficher ce lieu sur la carte",
      medals: "M\u00e9dailles",
      noAllCities: "Aucune m\u00e9daille n'a encore \u00e9t\u00e9 collect\u00e9e dans les villes visit\u00e9es.",
      noLocked: "Toutes les m\u00e9dailles de cette zone sont collect\u00e9es.",
      noUnlocked: "Aucune m\u00e9daille collect\u00e9e dans cette zone.",
      browse: "ARRONDISSEMENTS",
      scope: "ALBUM",
      unlocked: "collect\u00e9e", unlockedSection: "COLLECT\u00c9ES",
      pastWalks: "Parcours pr\u00e9c\u00e9dents", scan: "Analyser mes parcours",
      scanAgain: "Analyser \u00e0 nouveau", scanComplete: "Vos parcours pr\u00e9c\u00e9dents ont \u00e9t\u00e9 analys\u00e9s avec les m\u00eames r\u00e8gles GPS strictes.",
      scanDescription: "Optionnel : recherchez les m\u00e9dailles d\u00e9j\u00e0 encercl\u00e9es par vos parcours enregistr\u00e9s.",
      wikipedia: "Lire sur Wikipédia",
      wikipediaHint: "Ouvre l'article dans le lecteur intégré"
    };
  }

  return {
    all: "All",
    allCities: "All Cities",
    cities: "cities",
    citywide: "Citywide",
    close: "Close", collected: "collected", collection: "LANDMARK MEDALS",
    currentCity: "Current city",
    district: "District",
    locked: "locked", lockedSection: "LOCKED", mapHint: "Show this landmark on the map",
    medals: "Medals",
    noAllCities: "No medals have been collected in visited cities yet.",
    noLocked: "Every medal in this area is collected.",
    noUnlocked: "No collected medals in this area yet.",
    browse: "DISTRICTS",
    scope: "ALBUM",
    unlocked: "collected", unlockedSection: "UNLOCKED",
    pastWalks: "Past walks", scan: "Scan my walks", scanAgain: "Scan again",
    scanComplete: "Your past walks have been scanned with the same strict GPS rules.",
    scanDescription: "Optional: find medals already enclosed by your saved walks.",
    wikipedia: "Read on Wikipedia",
    wikipediaHint: "Opens the article in the built-in reader"
  };
}

const styles = createAppearanceStyles({
  filterPanel: { gap: 4, paddingHorizontal: 16, paddingTop: 14 },
  filterScroller: { flexGrow: 0, height: 56 },
  filters: { alignItems: "center", gap: 8, paddingVertical: 8 },
  filter: {
    alignItems: "center",
    backgroundColor: "rgba(9, 19, 27, 0.92)",
    borderColor: APP_COLORS.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  filterActive: { backgroundColor: APP_COLORS.gold, borderColor: APP_COLORS.gold },
  filterText: { color: APP_COLORS.parchment, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  filterTextActive: { color: "#151006" },
  medalGrid: { gap: 24, padding: 16, paddingBottom: 48 },
  modalRoot: { flex: 1 },
  section: { gap: 10 },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: 8 },
  sectionTitle: { color: APP_COLORS.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  sectionCount: {
    backgroundColor: "rgba(231, 181, 65, 0.1)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: APP_COLORS.parchment,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 22,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: "center"
  },
  emptySection: { color: "#64748b", fontSize: 12, fontStyle: "italic", paddingVertical: 8 },
  card: {
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden"
  },
  cardMapAction: { alignItems: "center", flexDirection: "row", gap: 14, padding: 14 },
  cardCollected: { backgroundColor: "rgba(19, 35, 42, 0.96)" },
  cardLocked: { backgroundColor: "rgba(9, 19, 27, 0.9)", opacity: 0.78 },
  medal: { alignItems: "center", backgroundColor: "#202c35", borderColor: "#43515c", borderRadius: 29, borderWidth: 2, height: 58, justifyContent: "center", width: 58 },
  medalCollected: { backgroundColor: "#9a6d15", borderColor: APP_COLORS.gold },
  cardText: { flex: 1 },
  medalName: { color: APP_COLORS.parchment, fontSize: 16, fontWeight: "800" },
  lockedText: { color: "#94a3b8" },
  description: { color: "#b7c2ca", fontSize: 12, lineHeight: 17 },
  category: { color: APP_COLORS.gold, fontSize: 10, fontWeight: "800", letterSpacing: 0.7, marginTop: 7, textTransform: "uppercase" },
  retroCard: { backgroundColor: APP_COLORS.card, borderColor: APP_COLORS.border, borderRadius: 18, borderWidth: 1, marginTop: 6, padding: 18 },
  retroTitle: { color: APP_COLORS.parchment, fontSize: 17, fontWeight: "800" },
  retroDescription: { color: "#aab7c2", fontSize: 13, lineHeight: 19, marginTop: 6 },
  scanButton: { alignItems: "center", backgroundColor: APP_COLORS.gold, borderRadius: 12, marginTop: 14, minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  scanButtonDisabled: { opacity: 0.65 },
  scanButtonText: { color: "#151006", fontSize: 14, fontWeight: "900" },
  attribution: { color: "#64748b", fontSize: 10, lineHeight: 15, textAlign: "center" },
  wikipediaAction: {
    backgroundColor: "rgba(231, 181, 65, 0.055)",
    borderTopColor: APP_COLORS.goldBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 7,
    minHeight: 58,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 10
  },
  wikipediaLabel: { color: APP_COLORS.gold, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  wikipediaLabelRow: { alignItems: "center", flexDirection: "row", gap: 5 }
});
