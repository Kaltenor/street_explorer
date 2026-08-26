import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import { createAppearanceStyles } from "./src/constants/appearance";
import { useFonts } from "expo-font";
import { useEffect, useRef, useState } from "react";
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
  getAppearanceMode,
  getFeedbackPreferences,
  saveAppLanguage,
  saveAppearanceMode,
  saveHapticsEnabled,
  saveSoundEnabled
} from "./src/database/settingsRepository";
import {
  AppearanceMode,
  setActiveAppearanceMode
} from "./src/constants/appearance";
import { AppLanguage } from "./src/i18n";
import { LaunchLoadingOverlay } from "./src/components/LaunchLoadingOverlay";
import { MapScreen } from "./src/screens/MapScreen";
import {
  drainPendingBackgroundLocationBatches
} from "./src/services/backgroundLocationTask";
import {
  setFeedbackPreferences,
  setHapticFeedbackEnabled,
  setSoundFeedbackEnabled
} from "./src/services/feedbackPreferences";
import { prefetchLaunchCompletion } from "./src/services/launchCompletionPrefetch";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Cinzel: require("./assets/fonts/Cinzel-Variable.ttf")
  });
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseFailed, setDatabaseFailed] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [appearanceMode, setAppearanceMode] =
    useState<AppearanceMode>("explorator");
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isLaunchDismissed, setIsLaunchDismissed] = useState(false);
  const [isMapLaunchReady, setIsMapLaunchReady] = useState(false);
  const [isLaunchCompletionPrefetchReady, setIsLaunchCompletionPrefetchReady] =
    useState(false);
  const launchCompletionPrefetchStartedRef = useRef(false);

  const initializeApp = () => {
    setDatabaseFailed(false);
    setIsLaunchCompletionPrefetchReady(false);
    launchCompletionPrefetchStartedRef.current = false;
    initDatabase()
      .then(async () => {
        const [savedLanguage, savedAppearanceMode, savedFeedbackPreferences] = await Promise.all([
          getAppLanguage(),
          getAppearanceMode(),
          getFeedbackPreferences()
        ]);

        setLanguage(savedLanguage);
        setActiveAppearanceMode(savedAppearanceMode);
        setAppearanceMode(savedAppearanceMode);
        setFeedbackPreferences(savedFeedbackPreferences);
        setHapticsEnabled(savedFeedbackPreferences.hapticsEnabled);
        setSoundEnabled(savedFeedbackPreferences.soundEnabled);
        setDatabaseReady(true);

        // Mount the map as soon as its schema and language are ready. Recovery
        // still awaits this drain inside MapScreen, while map/assets initialize
        // concurrently behind the branded launch overlay.
        void drainPendingBackgroundLocationBatches().catch((error) =>
          console.warn("Background GPS outbox will retry during recovery", error)
        );
      })
      .catch((error) => {
        console.error("Failed to initialize database", error);
        setIsLaunchDismissed(true);
        setDatabaseFailed(true);
      });
  };

  useEffect(() => {
    void setAudioModeAsync({
      interruptionMode: "mixWithOthers",
      playsInSilentMode: true
    }).catch((error) =>
      console.warn("Unable to configure mixed app audio", error)
    );
    initializeApp();
  }, []);

  useEffect(() => {
    if (
      !databaseReady ||
      !isMapLaunchReady ||
      launchCompletionPrefetchStartedRef.current
    ) {
      return;
    }

    launchCompletionPrefetchStartedRef.current = true;
    void prefetchLaunchCompletion()
      .then((result) => {
        console.info("[launch] completion prefetch ready", result);
      })
      .catch((error) => {
        console.warn("Launch completion prefetch failed", error);
      })
      .finally(() => {
        setIsLaunchCompletionPrefetchReady(true);
      });
  }, [databaseReady, isMapLaunchReady]);

  const handleChangeLanguage = async (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    await saveAppLanguage(nextLanguage);
  };

  const handleChangeAppearanceMode = async (nextMode: AppearanceMode) => {
    setActiveAppearanceMode(nextMode);
    setAppearanceMode(nextMode);
    await saveAppearanceMode(nextMode);
  };

  const handleChangeHapticsEnabled = async (enabled: boolean) => {
    setHapticFeedbackEnabled(enabled);
    setHapticsEnabled(enabled);
    await saveHapticsEnabled(enabled);
  };

  const handleChangeSoundEnabled = async (enabled: boolean) => {
    setSoundFeedbackEnabled(enabled);
    setSoundEnabled(enabled);
    await saveSoundEnabled(enabled);
  };

  const isAppContentReady = databaseReady && (fontsLoaded || Boolean(fontError));

  return (
    <SafeAreaProvider>
      <View style={styles.app}>
        <StatusBar style={appearanceMode === "daylight" ? "dark" : "light"} />
        {isAppContentReady ? (
          <MapScreen
            appearanceMode={appearanceMode}
            hapticsEnabled={hapticsEnabled}
            isLaunchDismissed={isLaunchDismissed}
            language={language}
            onChangeAppearanceMode={handleChangeAppearanceMode}
            onChangeHapticsEnabled={handleChangeHapticsEnabled}
            onChangeLanguage={handleChangeLanguage}
            onChangeSoundEnabled={handleChangeSoundEnabled}
            onLaunchReadyChange={setIsMapLaunchReady}
            soundEnabled={soundEnabled}
          />
        ) : (
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
              <ActivityIndicator size="large" color="#f5c451" />
            )}
          </SafeAreaView>
        )}
        {!isLaunchDismissed && !databaseFailed ? (
          <LaunchLoadingOverlay
            isReady={
              isAppContentReady &&
              isMapLaunchReady &&
              isLaunchCompletionPrefetchReady
            }
            language={language}
            onStart={() => setIsLaunchDismissed(true)}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = createAppearanceStyles({
  app: {
    flex: 1
  },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#071018",
    flex: 1,
    justifyContent: "center",
    padding: 28
  },
  retryButton: {
    backgroundColor: "#f5c451",
    borderRadius: 14,
    marginTop: 22,
    paddingHorizontal: 20,
    paddingVertical: 12
  },
  retryText: {
    color: "#151006",
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
