import { StyleSheet, Text, View } from "react-native";

import { ACTIVITY_MODE_LABELS } from "../constants/activityModes";
import { MODE_LOCATION_CONFIG } from "../constants/config";
import { ActivityMode } from "../types/walk";

type ModeProfilePanelProps = {
  activityMode: ActivityMode;
};

export function ModeProfilePanel({ activityMode }: ModeProfilePanelProps) {
  const profile = MODE_LOCATION_CONFIG[activityMode];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{ACTIVITY_MODE_LABELS[activityMode]} profile</Text>
      <Text style={styles.text}>
        GPS {"<="} {profile.maxAcceptedAccuracyMeters} m | Jump cap{" "}
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
