import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type MapLayerState = {
  showExploredCells: boolean;
  showFogOfWar: boolean;
  showMarkers: boolean;
  showPaths: boolean;
  showStreetLayer: boolean;
};

type LayerControlsProps = {
  layers: MapLayerState;
  onToggleLayer: (layer: keyof MapLayerState) => void;
};

export function LayerControls({ layers, onToggleLayer }: LayerControlsProps) {
  return (
    <View style={styles.container}>
      <LayerButton
        active={layers.showPaths}
        icon="git-branch-outline"
        label="Paths"
        onPress={() => onToggleLayer("showPaths")}
      />
      <LayerButton
        active={layers.showExploredCells}
        icon="grid-outline"
        label="Cells"
        onPress={() => onToggleLayer("showExploredCells")}
      />
      <LayerButton
        active={layers.showFogOfWar}
        icon="cloudy-outline"
        label="Fog"
        onPress={() => onToggleLayer("showFogOfWar")}
      />
      <LayerButton
        active={layers.showMarkers}
        icon="flag-outline"
        label="Pins"
        onPress={() => onToggleLayer("showMarkers")}
      />
      <LayerButton
        active={layers.showStreetLayer}
        icon="map-outline"
        label="OSM"
        onPress={() => onToggleLayer("showStreetLayer")}
      />
    </View>
  );
}

function LayerButton({
  active,
  icon,
  label,
  onPress
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, active ? styles.activeButton : null]}
    >
      <Ionicons name={icon} size={15} color={active ? "#ffffff" : "#0f172a"} />
      <Text style={[styles.buttonText, active ? styles.activeButtonText : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  activeButton: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb"
  },
  activeButtonText: {
    color: "#ffffff"
  },
  button: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  buttonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
  },
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10
  }
});
