import { StyleSheet, Text, View } from "react-native";

import { MODE_LOCATION_CONFIG } from "../constants/config";
import { ACTIVITY_MODE_TEXT, AppLanguage, getStrings, interpolate } from "../i18n";
import { ActivityMode } from "../types/walk";

type ModeProfilePanelProps = {
  activityMode: ActivityMode;
  language: AppLanguage;
};

export function ModeProfilePanel({ activityMode, language }: ModeProfilePanelProps) {
  const profile = MODE_LOCATION_CONFIG[activityMode];
  const strings = getStrings(language);
  const modeLabel = ACTIVITY_MODE_TEXT[language].labels[activityMode];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {interpolate(strings.modeProfile.profile, { mode: modeLabel })}
      </Text>
      <Text style={styles.text}>
        {strings.modeProfile.gps} {"<="} {profile.maxAcceptedAccuracyMeters} m |{" "}
        {strings.modeProfile.jumpCap}{" "}
        {Math.round(profile.maxSpeedMetersPerSecond * 3.6)} km/h
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 10
  },
  text: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  title: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800"
  }
});
