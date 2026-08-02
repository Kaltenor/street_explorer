import { StyleSheet, Text, View } from "react-native";

import { AppLanguage, getStrings } from "../i18n";
import { WALKING_COLORS } from "../constants/theme";

type MapLegendProps = {
  language: AppLanguage;
  showExploredCells: boolean;
  showPaths: boolean;
};

export function MapLegend({ language, showExploredCells, showPaths }: MapLegendProps) {
  if (!showExploredCells && !showPaths) {
    return null;
  }

  const strings = getStrings(language);

  return (
    <View style={styles.container}>
      {showPaths ? (
        <LegendItem color={WALKING_COLORS.savedRoutes[0]} label={strings.mapLegend.savedRoute} />
      ) : null}
      {showPaths ? (
        <LegendItem color={WALKING_COLORS.activeRoute} label={strings.mapLegend.recording} />
      ) : null}
      {showExploredCells ? (
        <LegendItem color={WALKING_COLORS.exploredArea} label={strings.mapLegend.exploredCells} />
      ) : null}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.item}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderColor: "#2a3c49",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  item: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5
  },
  label: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700"
  },
  swatch: {
    borderColor: "rgba(15, 23, 42, 0.18)",
    borderRadius: 3,
    borderWidth: 1,
    height: 10,
    width: 10
  }
});
