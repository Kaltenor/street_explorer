import { StyleSheet, Text, View } from "react-native";

type MapLegendProps = {
  showExploredCells: boolean;
  showPaths: boolean;
};

export function MapLegend({ showExploredCells, showPaths }: MapLegendProps) {
  if (!showExploredCells && !showPaths) {
    return null;
  }

  return (
    <View style={styles.container}>
      {showPaths ? <LegendItem color="#2563eb" label="Saved route" /> : null}
      {showPaths ? <LegendItem color="#ef4444" label="Recording" /> : null}
      {showPaths ? <LegendItem color="#b45309" label="GPS gap" /> : null}
      {showExploredCells ? <LegendItem color="#86efac" label="Explored cells" /> : null}
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
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
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
    color: "#475569",
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
