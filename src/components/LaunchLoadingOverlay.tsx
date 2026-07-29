import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { APP_VERSION } from "../constants/config";
import { AppLanguage, getStrings } from "../i18n";

type LaunchLoadingOverlayProps = {
  isReady: boolean;
  language: AppLanguage;
  onStart: () => void;
};

export function LaunchLoadingOverlay({
  isReady,
  language,
  onStart
}: LaunchLoadingOverlayProps) {
  const strings = getStrings(language);

  const handleStart = () => {
    requestAnimationFrame(onStart);
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        resizeMode="stretch"
        source={require("../../assets/loading-screen2.png")}
        style={styles.background}
      >
        <View style={styles.footer}>
          {isReady ? (
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.45}
              onPress={handleStart}
              style={styles.startButton}
            >
              <Text style={styles.startText}>{strings.launch.pressToStart}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#f5c451" size="small" />
              <Text style={styles.loadingText}>{strings.launch.loadingMap}</Text>
            </View>
          )}
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: "#071018",
    flex: 1,
    justifyContent: "flex-end"
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#071018",
    zIndex: 50
  },
  footer: {
    alignItems: "center",
    gap: 14,
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
  startButton: {
    paddingHorizontal: 22,
    paddingVertical: 12
  },
  startText: {
    color: "rgba(248, 250, 252, 0.78)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 2.2,
    textShadowColor: "rgba(156, 255, 0, 0.35)",
    textShadowOffset: {
      height: 0,
      width: 0
    },
    textShadowRadius: 6,
    textTransform: "uppercase"
  },
  version: {
    color: "rgba(248, 250, 252, 0.72)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8
  }
});
