import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import { createAppearanceStyles } from "../constants/appearance";
import { APP_COLORS, ATLAS_DISPLAY_FONT } from "../constants/theme";
import type { AppLanguage } from "../i18n";
import {
  type ExplorerScore,
  formatAreaMultiple,
  formatExploredSurface,
  formatExplorerPoints,
  getAreaComparisonProgress
} from "../services/explorerScore";

export function ExplorerScorePanel({
  language,
  score
}: {
  language: AppLanguage;
  score: ExplorerScore;
}) {
  const isFrench = language === "fr";
  const comparison = getAreaComparisonProgress(score.surfaceAreaSquareMeters);
  const reachedLabel = comparison.current
    ? isFrench
      ? `Vous avez cartographié ${formatAreaMultiple(comparison.currentMultiple, language)} × ${comparison.current.labels.fr}.`
      : `You've mapped ${formatAreaMultiple(comparison.currentMultiple, language)} × ${comparison.current.labels.en}.`
    : isFrench
      ? `Première étape : ${comparison.next?.labels.fr ?? "un court de tennis double"}.`
      : `First landmark: ${comparison.next?.labels.en ?? "a doubles tennis court"}.`;
  const nextLabel = comparison.next
    ? isFrench
      ? `Prochaine comparaison : ${comparison.next.labels.fr}`
      : `Next comparison: ${comparison.next.labels.en}`
    : isFrench ? "Vous avez dépassé toute l'échelle !" : "You've outgrown the whole ladder!";

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.iconFrame}>
          <Ionicons color={APP_COLORS.gold} name="sparkles" size={20} />
        </View>
        <View style={styles.scoreCopy}>
          <Text accessibilityLiveRegion="polite" style={styles.scoreValue}>
            {formatExplorerPoints(score.points, language)}
          </Text>
          <Text style={styles.scoreLabel}>
            {isFrench ? "POINTS D'EXPLORATEUR" : "EXPLORER POINTS"}
          </Text>
        </View>
        <Text style={styles.surface}>{formatExploredSurface(score.surfaceAreaSquareMeters, language)}</Text>
      </View>

      <View style={styles.breakdown}>
        <Text style={styles.breakdownText}>
          {isFrench
            ? `${score.walkedCellCount.toLocaleString("fr-FR")} cases parcourues · ${score.enclosedCellCount.toLocaleString("fr-FR")} bonus d'enclos`
            : `${score.walkedCellCount.toLocaleString("en-US")} walked tiles · ${score.enclosedCellCount.toLocaleString("en-US")} enclosure bonuses`}
        </Text>
        <Text style={styles.ruleText}>
          {isFrench ? "1 pt par case + 1 pt bonus par case enclose" : "1 pt per tile + 1 bonus pt per enclosed tile"}
        </Text>
      </View>

      <View style={styles.comparison}>
        <Text style={styles.comparisonText}>{reachedLabel}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(comparison.nextProgress * 100)}%` }]} />
        </View>
        <Text numberOfLines={2} style={styles.nextText}>{nextLabel}</Text>
      </View>
    </View>
  );
}

const styles = createAppearanceStyles({
  breakdown: { gap: 3 },
  breakdownText: { color: APP_COLORS.text, fontSize: 12, fontWeight: "800" },
  comparison: {
    backgroundColor: "rgba(245, 196, 81, 0.07)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 13,
    borderWidth: 1,
    gap: 7,
    padding: 11
  },
  comparisonText: { color: APP_COLORS.text, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  header: { alignItems: "center", flexDirection: "row", gap: 11 },
  iconFrame: {
    alignItems: "center",
    backgroundColor: "rgba(245, 196, 81, 0.1)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  nextText: { color: APP_COLORS.textMuted, fontSize: 10, fontWeight: "700" },
  panel: {
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  progressFill: { backgroundColor: APP_COLORS.gold, borderRadius: 999, height: "100%" },
  progressTrack: {
    backgroundColor: "rgba(148, 163, 184, 0.22)",
    borderRadius: 999,
    height: 7,
    overflow: "hidden"
  },
  ruleText: { color: APP_COLORS.textMuted, fontSize: 10, fontWeight: "700" },
  scoreCopy: { flex: 1 },
  scoreLabel: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8
  },
  scoreValue: { color: APP_COLORS.text, fontSize: 30, fontWeight: "900", lineHeight: 34 },
  surface: { color: APP_COLORS.gold, fontSize: 12, fontWeight: "900" }
});
