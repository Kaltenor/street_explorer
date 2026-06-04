import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { initDatabase } from "./src/database/db";
import {
  getAppLanguage,
  getLastActivityMode,
  saveAppLanguage,
  saveLastActivityMode
} from "./src/database/settingsRepository";
import { AppLanguage } from "./src/i18n";
import { ModeSelectionScreen } from "./src/screens/ModeSelectionScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { ActivityMode } from "./src/types/walk";
import "./src/services/backgroundLocationTask";

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [selectedMode, setSelectedMode] = useState<ActivityMode | null>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        const [savedLanguage, savedMode] = await Promise.all([
          getAppLanguage(),
          getLastActivityMode()
        ]);

        setLanguage(savedLanguage);
        setSelectedMode(savedMode);
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

  const handleChangeLanguage = async (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    await saveAppLanguage(nextLanguage);
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
          <MapScreen
            activityMode={selectedMode}
            language={language}
            onChangeLanguage={handleChangeLanguage}
            onChangeMode={handleSelectMode}
          />
        ) : (
          <ModeSelectionScreen language={language} onSelectMode={handleSelectMode} />
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
