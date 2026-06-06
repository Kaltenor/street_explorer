import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { initDatabase } from "./src/database/db";
import {
  getAppLanguage,
  getDefaultActivityMode,
  getLastActivityMode,
  saveAppLanguage,
  saveDefaultActivityMode,
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
  const [defaultMode, setDefaultMode] = useState<ActivityMode | null>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        const [savedLanguage, savedDefaultMode, savedMode] = await Promise.all([
          getAppLanguage(),
          getDefaultActivityMode(),
          getLastActivityMode()
        ]);

        setLanguage(savedLanguage);
        setDefaultMode(savedDefaultMode);
        setSelectedMode(savedDefaultMode ?? savedMode);
        setDatabaseReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize database", error);
      });
  }, []);

  const handleSelectInitialMode = async (activityMode: ActivityMode) => {
    setSelectedMode(activityMode);
    setDefaultMode(activityMode);
    await Promise.all([
      saveLastActivityMode(activityMode),
      saveDefaultActivityMode(activityMode)
    ]);
  };

  const handleChangeMode = async (activityMode: ActivityMode) => {
    setSelectedMode(activityMode);
    await saveLastActivityMode(activityMode);
  };

  const handleChangeDefaultMode = async (activityMode: ActivityMode) => {
    setDefaultMode(activityMode);
    await saveDefaultActivityMode(activityMode);
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
            defaultMode={defaultMode ?? selectedMode}
            language={language}
            onChangeLanguage={handleChangeLanguage}
            onChangeDefaultMode={handleChangeDefaultMode}
            onChangeMode={handleChangeMode}
          />
        ) : (
          <ModeSelectionScreen language={language} onSelectMode={handleSelectInitialMode} />
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
