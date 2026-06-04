import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";

type LaunchLoadingOverlayProps = {
  isReady: boolean;
  onStart: () => void;
};

export function LaunchLoadingOverlay({ isReady, onStart }: LaunchLoadingOverlayProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!isReady}
      onPress={onStart}
      style={styles.container}
    >
      <ImageBackground
        resizeMode="cover"
        source={require("../../assets/loading-screen.png")}
        style={styles.background}
      >
        <View style={styles.footer}>
          {isReady ? (
            <Text style={styles.startText}>Press to start</Text>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#9cff00" size="small" />
              <Text style={styles.loadingText}>Loading current area map</Text>
            </View>
          )}
        </View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: "flex-end"
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#02060a",
    zIndex: 50
  },
  footer: {
    alignItems: "center",
    paddingBottom: 58,
    paddingHorizontal: 24
  },
  loadingRow: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.72)",
    borderColor: "rgba(156, 255, 0, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  loadingText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  startText: {
    backgroundColor: "rgba(2, 6, 10, 0.72)",
    borderColor: "rgba(156, 255, 0, 0.5)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#9cff00",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1.4,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 12,
    textTransform: "uppercase"
  }
});
