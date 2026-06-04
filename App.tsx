import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { initDatabase } from "./src/database/db";
import { getLastActivityMode, saveLastActivityMode } from "./src/database/settingsRepository";
import { ModeSelectionScreen } from "./src/screens/ModeSelectionScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { ActivityMode } from "./src/types/walk";
import "./src/services/backgroundLocationTask";

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ActivityMode | null>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        setSelectedMode(await getLastActivityMode());
        setDatabaseReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize database", error);
      });
  }, []);

  const handleSelectMode = async (activityMode: ActivityMode) => {
    setSelectedMode(activityMode);
    await saveLastActivityMode(activityMode);
  };

  if (!databaseReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#2563eb" />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.app}>
        <StatusBar style="dark" />
        {selectedMode ? (
          <MapScreen activityMode={selectedMode} onChangeMode={handleSelectMode} />
        ) : (
          <ModeSelectionScreen onSelectMode={handleSelectMode} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1
  },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    justifyContent: "center"
  }
});
