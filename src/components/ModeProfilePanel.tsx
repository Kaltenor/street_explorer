import { StyleSheet, Text, View } from "react-native";
import { createAppearanceStyles } from "../constants/appearance";

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

const styles = createAppearanceStyles({
  container: {
    backgroundColor: "rgba(7, 16, 24, 0.96)",
    borderColor: "#2a3c49",
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 10
  },
  text: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 3
  },
  title: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800"
  }
});
