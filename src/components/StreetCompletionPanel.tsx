import { StyleSheet, Text, View } from "react-native";

import { StreetCompletionSummary } from "../services/streetCompletion";

type StreetCompletionPanelProps = {
  summary: StreetCompletionSummary;
};

export function StreetCompletionPanel({ summary }: StreetCompletionPanelProps) {
  const text =
    summary.status === "not_configured"
      ? "Street matching not loaded yet"
      : `${summary.matchedStreetCount}/${summary.totalStreetCount} streets`;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Street completion V1</Text>
      <Text style={styles.text}>{text}</Text>
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
