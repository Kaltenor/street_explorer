import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { APP_VERSION } from "../constants/config";
import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings } from "../i18n";
import { ActivityMode } from "../types/walk";

type ModeSelectionScreenProps = {
  language: AppLanguage;
  onSelectMode: (mode: ActivityMode) => void;
};

export function ModeSelectionScreen({ language, onSelectMode }: ModeSelectionScreenProps) {
  const strings = getStrings(language);
  const modeText = ACTIVITY_MODE_TEXT[language];

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Street Explorer</Text>
        <Text style={styles.version}>v{APP_VERSION}</Text>
        <Text style={styles.subtitle}>{strings.modeSelection.subtitle}</Text>
      </View>

      <View style={styles.options}>
        <ModeButton mode="walk" icon="walk" modeText={modeText} onPress={onSelectMode} />
        <ModeButton
          mode="wheel"
          icon="radio-button-on"
          modeText={modeText}
          onPress={onSelectMode}
        />
        <ModeButton mode="car" icon="car" modeText={modeText} onPress={onSelectMode} />
      </View>
    </SafeAreaView>
  );
}

function ModeButton({
  mode,
  icon,
  modeText,
  onPress
}: {
  mode: ActivityMode;
  icon: keyof typeof Ionicons.glyphMap;
  modeText: typeof ACTIVITY_MODE_TEXT[AppLanguage];
  onPress: (mode: ActivityMode) => void;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={() => onPress(mode)} style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={28} color="#0f172a" />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{modeText.labels[mode]}</Text>
        <Text style={styles.cardSubtitle}>{modeText.descriptions[mode]}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color="#64748b" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 96,
    padding: 18
  },
  cardSubtitle: {
    color: "#64748b",
    fontSize: 15,
    marginTop: 4
  },
  cardText: {
    flex: 1
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800"
  },
  header: {
    gap: 8
  },
  icon: {
    alignItems: "center",
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    height: 54,
    justifyContent: "center",
    width: 54
  },
  options: {
    gap: 14,
    marginTop: 32
  },
  screen: {
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  subtitle: {
    color: "#475569",
    fontSize: 17,
    lineHeight: 24
  },
  title: {
    color: "#0f172a",
    fontSize: 36,
    fontWeight: "900"
  },
  version: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700"
  }
});
