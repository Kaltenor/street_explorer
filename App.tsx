import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { initDatabase } from "./src/database/db";
import {
  getAppLanguage,
  saveAppLanguage
} from "./src/database/settingsRepository";
import { AppLanguage } from "./src/i18n";
import { MapScreen } from "./src/screens/MapScreen";
import {
  drainPendingBackgroundLocationBatches
} from "./src/services/backgroundLocationTask";

export default function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    initDatabase()
      .then(async () => {
        await drainPendingBackgroundLocationBatches().catch((error) =>
          console.warn("Background GPS outbox will retry after launch", error)
        );

        const savedLanguage = await getAppLanguage();

        setLanguage(savedLanguage);
        setDatabaseReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize database", error);
      });
  }, []);

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
        <MapScreen
          language={language}
          onChangeLanguage={handleChangeLanguage}
        />
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
