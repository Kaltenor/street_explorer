import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
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
  const [databaseFailed, setDatabaseFailed] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  const initializeApp = () => {
    setDatabaseFailed(false);
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
        setDatabaseFailed(true);
      });
  };

  useEffect(() => {
    initializeApp();
  }, []);

  const handleChangeLanguage = async (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    await saveAppLanguage(nextLanguage);
  };

  if (!databaseReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.loadingScreen}>
          {databaseFailed ? (
            <>
              <Text style={styles.startupErrorTitle}>
                Street Explorer couldn&apos;t start
              </Text>
              <Text style={styles.startupErrorBody}>
                Please try again. If this keeps happening, restart the app.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={initializeApp}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color="#9cff00" />
          )}
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
    backgroundColor: "#02060a",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  retryButton: {
    backgroundColor: "#9cff00",
    borderRadius: 10,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  retryText: {
    color: "#02060a",
    fontSize: 15,
    fontWeight: "900"
  },
  startupErrorBody: {
    color: "#b7c3cc",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 360,
    textAlign: "center"
  },
  startupErrorTitle: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center"
  }
});
