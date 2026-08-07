import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { AppLanguage } from "../i18n";
import { CollectedMedal, MedalAlbumProgress, MedalCategory } from "../types/medal";

type CategoryFilter = "all" | MedalCategory;

type MedalCollectionModalProps = {
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
  language,
  progress,
  retroScanComplete,
  scanning,
  visible,
  onClose,
  onFocusMedal,
  onRunRetroScan
}: MedalCollectionModalProps) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const text = getText(language);
  const filteredMedals = useMemo(
    () =>
      progress?.medals.filter(
        (medal) => category === "all" || medal.category === category
      ) ?? [],
    [category, progress]
  );
  const collectedMedals = filteredMedals.filter((medal) => medal.isCollected);
  const lockedMedals = filteredMedals.filter((medal) => !medal.isCollected);

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <AtlasScreen onSwipeBack={onClose} visible={visible}>
        <AtlasModalHeader
          emblem="ribbon-outline"
          eyebrow={text.collection}
          onBack={onClose}
          subtitle={`${progress?.collectedCount ?? 0}/${progress?.medals.length ?? 0} ${text.collected}`}
          title={progress?.album.cityName[language] ?? "Lyon"}
        />

        <View style={styles.filterPanel}>
          <AtlasSectionLabel icon="albums-outline" title={text.browse} />
          <ScrollView
            horizontal
            contentContainerStyle={styles.filters}
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroller}
          >
            {(["all", "architecture", "history", "art", "culture", "nature"] as CategoryFilter[]).map(
              (filter) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === filter }}
                  key={filter}
                  onPress={() => setCategory(filter)}
                  style={[styles.filter, category === filter ? styles.filterActive : null]}
                >
                  <Text style={[styles.filterText, category === filter ? styles.filterTextActive : null]}>
                    {text.categories[filter]}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.medalGrid}>
          <MedalSection
            emptyLabel={text.noUnlocked}
            language={language}
            medals={collectedMedals}
            onFocusMedal={onFocusMedal}
            title={text.unlockedSection}
          />
          <MedalSection
            emptyLabel={text.noLocked}
            language={language}
            medals={lockedMedals}
            onFocusMedal={onFocusMedal}
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
        </ScrollView>
      </AtlasScreen>
    </Modal>
  );
}

function MedalSection({
  emptyLabel,
  language,
  medals,
  onFocusMedal,
  title
}: {
  emptyLabel: string;
  language: AppLanguage;
  medals: CollectedMedal[];
  onFocusMedal: (medal: CollectedMedal) => void;
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
        <TouchableOpacity
          accessibilityHint={text.mapHint}
          accessibilityLabel={medal.name[language] + ", " + (medal.isCollected ? text.unlocked : text.locked)}
          accessibilityRole="button"
          key={medal.id}
          onPress={() => onFocusMedal(medal)}
          style={[styles.card, medal.isCollected ? styles.cardCollected : styles.cardLocked]}
        >
          <View style={[styles.medal, medal.isCollected ? styles.medalCollected : null]}>
            <Ionicons
              color={medal.isCollected ? "#fff7d6" : "#64748b"}
              name={medal.isCollected ? CATEGORY_ICONS[medal.category] : "lock-closed"}
              size={28}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.medalName, !medal.isCollected ? styles.lockedText : null]}>
              {medal.name[language]}
            </Text>
            {medal.isCollected ? (
              <Text numberOfLines={3} style={styles.description}>
                {medal.description[language]}
              </Text>
            ) : null}
            <Text style={styles.category}>{text.categories[medal.category]}</Text>
          </View>
          <Ionicons color="#94a3b8" name="locate-outline" size={20} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function getText(language: AppLanguage) {
  if (language === "fr") {
    return {
      categories: {
        all: "Toutes", architecture: "Architecture", art: "Art",
        culture: "Culture", history: "Histoire", nature: "Nature"
      } as Record<CategoryFilter, string>,
      close: "Fermer", collected: "collect\u00e9es", collection: "M\u00c9DAILLES DE LIEUX",
      locked: "verrouill\u00e9e", lockedSection: "VERROUILL\u00c9ES", mapHint: "Afficher ce lieu sur la carte",
      noLocked: "Toutes les m\u00e9dailles de cette cat\u00e9gorie sont collect\u00e9es.",
      noUnlocked: "Aucune m\u00e9daille collect\u00e9e dans cette cat\u00e9gorie.",
      browse: "CAT\u00c9GORIES DE L'ATLAS",
      unlocked: "collect\u00e9e", unlockedSection: "COLLECT\u00c9ES",
      pastWalks: "Parcours pr\u00e9c\u00e9dents", scan: "Analyser mes parcours",
      scanAgain: "Analyser \u00e0 nouveau", scanComplete: "Vos parcours pr\u00e9c\u00e9dents ont \u00e9t\u00e9 analys\u00e9s avec les m\u00eames r\u00e8gles GPS strictes.",
      scanDescription: "Optionnel : recherchez les m\u00e9dailles d\u00e9j\u00e0 encercl\u00e9es par vos parcours enregistr\u00e9s.",
    };
  }

  return {
    categories: {
      all: "All", architecture: "Architecture", art: "Art",
      culture: "Culture", history: "History", nature: "Nature"
    } as Record<CategoryFilter, string>,
    close: "Close", collected: "collected", collection: "LANDMARK MEDALS",
    locked: "locked", lockedSection: "LOCKED", mapHint: "Show this landmark on the map",
    noLocked: "Every medal in this category is collected.",
    noUnlocked: "No collected medals in this category yet.",
    browse: "ATLAS CATEGORIES",
    unlocked: "collected", unlockedSection: "UNLOCKED",
    pastWalks: "Past walks", scan: "Scan my walks", scanAgain: "Scan again",
    scanComplete: "Your past walks have been scanned with the same strict GPS rules.",
    scanDescription: "Optional: find medals already enclosed by your saved walks."
  };
}

const styles = StyleSheet.create({
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
    alignItems: "center",
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 14
  },
  cardCollected: { backgroundColor: "rgba(19, 35, 42, 0.96)" },
  cardLocked: { backgroundColor: "rgba(9, 19, 27, 0.9)", opacity: 0.78 },
  medal: { alignItems: "center", backgroundColor: "#202c35", borderColor: "#43515c", borderRadius: 29, borderWidth: 2, height: 58, justifyContent: "center", width: 58 },
  medalCollected: { backgroundColor: "#9a6d15", borderColor: APP_COLORS.gold },
  cardText: { flex: 1 },
  medalName: { color: APP_COLORS.parchment, fontSize: 16, fontWeight: "800" },
  lockedText: { color: "#94a3b8" },
  description: { color: "#94a3b8", fontSize: 12, lineHeight: 17, marginTop: 3 },
  category: { color: APP_COLORS.gold, fontSize: 10, fontWeight: "800", letterSpacing: 0.7, marginTop: 7, textTransform: "uppercase" },
  retroCard: { backgroundColor: APP_COLORS.card, borderColor: APP_COLORS.border, borderRadius: 18, borderWidth: 1, marginTop: 6, padding: 18 },
  retroTitle: { color: APP_COLORS.parchment, fontSize: 17, fontWeight: "800" },
  retroDescription: { color: "#aab7c2", fontSize: 13, lineHeight: 19, marginTop: 6 },
  scanButton: { alignItems: "center", backgroundColor: APP_COLORS.gold, borderRadius: 12, marginTop: 14, minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  scanButtonDisabled: { opacity: 0.65 },
  scanButtonText: { color: "#151006", fontSize: 14, fontWeight: "900" },
  attribution: { color: "#64748b", fontSize: 10, lineHeight: 15, textAlign: "center" }
});
