import { Image, StyleSheet, View } from "react-native";

import { APP_COLORS } from "../constants/theme";

export function AtlasHudTexture({ opacity = 0.1 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={styles.textureLayer}>
      <Image
        resizeMode="cover"
        source={require("../../assets/ui/atlas-paper-texture.png")}
        style={[styles.texture, { opacity }]}
      />
    </View>
  );
}

export function AtlasHudDivider() {
  return (
    <View pointerEvents="none" style={styles.divider}>
      <View style={styles.line} />
      <View style={styles.diamond} />
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  diamond: {
    backgroundColor: APP_COLORS.gold,
    height: 4,
    opacity: 0.68,
    transform: [{ rotate: "45deg" }],
    width: 4
  },
  divider: { alignItems: "center", flexDirection: "row", gap: 6 },
  line: { backgroundColor: APP_COLORS.gold, flex: 1, height: 1, opacity: 0.2 },
  texture: {
    height: "100%",
    width: "100%"
  },
  textureLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  }
});
