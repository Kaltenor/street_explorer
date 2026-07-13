import { ActivityIndicator, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { APP_VERSION } from "../constants/config";
import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings } from "../i18n";
import { ActivityMode } from "../types/walk";

type LaunchLoadingOverlayProps = {
  activityMode: ActivityMode;
  isReady: boolean;
  language: AppLanguage;
  onChangeMode: (mode: ActivityMode) => void;
};

export function LaunchLoadingOverlay({
  activityMode,
  isReady,
  language,
  onChangeMode
}: LaunchLoadingOverlayProps) {
  const strings = getStrings(language);
  const modeText = ACTIVITY_MODE_TEXT[language];

  return (
    <View style={styles.container}>
      <ImageBackground
        resizeMode="stretch"
        source={require("../../assets/splash.png")}
        style={styles.background}
      >
        <View style={styles.footer}>
          <View style={styles.modePicker}>
            {(["walk", "wheel", "car"] as ActivityMode[]).map((mode) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={mode}
                onPress={() => onChangeMode(mode)}
                style={[styles.modeButton, activityMode === mode ? styles.selectedModeButton : null]}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    activityMode === mode ? styles.selectedModeButtonText : null
                  ]}
                >
                  {modeText.labels[mode]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#9cff00" size="small" />
            <Text style={styles.loadingText}>
              {isReady
                ? language === "fr" ? "Ouverture de la carte" : "Opening map"
                : strings.launch.loadingMap}
            </Text>
          </View>
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: "#02060a",
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
  modeButton: {
    alignItems: "center",
    borderColor: "rgba(248, 250, 252, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  modeButtonText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  modePicker: {
    backgroundColor: "rgba(2, 6, 10, 0.76)",
    borderColor: "rgba(156, 255, 0, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 8
  },
  selectedModeButton: {
    backgroundColor: "#9cff00",
    borderColor: "#9cff00"
  },
  selectedModeButtonText: {
    color: "#02060a"
  },
  version: {
    color: "rgba(248, 250, 252, 0.72)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8
  }
});
