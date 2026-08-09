import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createAppearanceStyles } from "../constants/appearance";
import { APP_COLORS } from "../constants/theme";

import { APP_VERSION } from "../constants/config";
import { AppLanguage, getStrings } from "../i18n";
import { useReducedMotionPreference } from "./AtlasCabinet";

const TAGLINE_SEPARATOR = "  ";
const BACKGROUND_HOLD_DURATION_MS = 1000;
const TAGLINE_REVEAL_DURATION_MS = 1050;
const START_PROMPT_DELAY_MS = 500;
const FOOTER_FADE_DURATION_MS = 360;
const START_PULSE_DURATION_MS = 900;
const SPLASH_FADE_DURATION_MS = 800;
const LAUNCH_SEQUENCE_STARTED_AT_MS =
  typeof globalThis.performance?.timeOrigin === "number"
    ? globalThis.performance.timeOrigin
    : Date.now();

type LaunchLoadingOverlayProps = {
  isReady: boolean;
  language: AppLanguage;
  onStart: () => void;
};

export function LaunchLoadingOverlay({
  isReady,
  language,
  onStart
}: LaunchLoadingOverlayProps) {
  const strings = getStrings(language);
  const reducedMotion = useReducedMotionPreference();
  const safeAreaInsets = useSafeAreaInsets();
  const windowWidth = useWindowDimensions().width;
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [backgroundHoldComplete, setBackgroundHoldComplete] = useState(false);
  const [taglineComplete, setTaglineComplete] = useState(false);
  const [startPromptVisible, setStartPromptVisible] = useState(false);
  const [startRequested, setStartRequested] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const taglineProgress = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;
  const startPulse = useRef(new Animated.Value(0)).current;
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const dismissStartedRef = useRef(false);
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const fullTagline = [
    strings.launch.taglineWalk,
    strings.launch.taglineExplore,
    strings.launch.taglineReveal
  ].join(TAGLINE_SEPARATOR);
  const taglineFontSize = Math.min(16, windowWidth * 0.028);
  const taglineGap = taglineFontSize * 0.55;

  useEffect(() => {
    setBackgroundHoldComplete(false);

    if (!backgroundLoaded) {
      return;
    }

    const elapsedLaunchTimeMs = Date.now() - LAUNCH_SEQUENCE_STARTED_AT_MS;
    const remainingHoldTimeMs = Math.max(
      0,
      BACKGROUND_HOLD_DURATION_MS - elapsedLaunchTimeMs
    );

    if (remainingHoldTimeMs === 0) {
      setBackgroundHoldComplete(true);
      return;
    }

    const timerId = setTimeout(
      () => setBackgroundHoldComplete(true),
      remainingHoldTimeMs
    );
    return () => clearTimeout(timerId);
  }, [backgroundLoaded]);

  useEffect(() => {
    taglineProgress.stopAnimation();
    taglineProgress.setValue(0);
    setTaglineComplete(false);

    if (!backgroundHoldComplete) {
      return;
    }

    if (reducedMotion) {
      taglineProgress.setValue(1);
      setTaglineComplete(true);
      return;
    }

    const animation = Animated.timing(taglineProgress, {
      duration: TAGLINE_REVEAL_DURATION_MS,
      toValue: 1,
      useNativeDriver: true
    });
    animation.start(({ finished }) => {
      if (finished) {
        setTaglineComplete(true);
      }
    });

    return () => animation.stop();
  }, [backgroundHoldComplete, reducedMotion, taglineProgress]);

  useEffect(() => {
    setStartPromptVisible(false);

    if (!taglineComplete) {
      return;
    }

    const timerId = setTimeout(
      () => setStartPromptVisible(true),
      START_PROMPT_DELAY_MS
    );
    return () => clearTimeout(timerId);
  }, [taglineComplete]);

  useEffect(() => {
    footerOpacity.stopAnimation();

    if (!startPromptVisible) {
      footerOpacity.setValue(0);
      return;
    }

    if (reducedMotion) {
      footerOpacity.setValue(1);
      return;
    }

    footerOpacity.setValue(0);
    const animation = Animated.timing(footerOpacity, {
      duration: FOOTER_FADE_DURATION_MS,
      toValue: 1,
      useNativeDriver: true
    });
    animation.start();

    return () => animation.stop();
  }, [footerOpacity, reducedMotion, startPromptVisible]);

  useEffect(() => {
    startPulse.stopAnimation();
    startPulse.setValue(0);

    if (
      !startPromptVisible ||
      startRequested ||
      isDismissing ||
      reducedMotion
    ) {
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(startPulse, {
          duration: START_PULSE_DURATION_MS,
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(startPulse, {
          duration: START_PULSE_DURATION_MS,
          toValue: 0,
          useNativeDriver: true
        })
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [isDismissing, reducedMotion, startPromptVisible, startPulse, startRequested]);

  const beginDismissal = useCallback(() => {
    if (dismissStartedRef.current) {
      return;
    }

    dismissStartedRef.current = true;
    setIsDismissing(true);
    splashOpacity.stopAnimation();
    Animated.timing(splashOpacity, {
      duration: SPLASH_FADE_DURATION_MS,
      toValue: 0,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        onStartRef.current();
      }
    });
  }, [splashOpacity]);

  useEffect(() => {
    if (startRequested && isReady) {
      beginDismissal();
    }
  }, [beginDismissal, isReady, startRequested]);

  const handleStart = () => {
    if (!startPromptVisible || startRequested || isDismissing) {
      return;
    }

    if (isReady) {
      beginDismissal();
      return;
    }

    setStartRequested(true);
  };

  return (
    <Animated.View style={[styles.container, { opacity: splashOpacity }]}>
      <ImageBackground
        onError={() => setBackgroundLoaded(true)}
        onLoad={() => setBackgroundLoaded(true)}
        resizeMode="contain"
        source={require("../../assets/loading-screen3.jpg")}
        style={styles.background}
      >
        <View
          pointerEvents="none"
          accessibilityLabel={taglineComplete ? fullTagline.replaceAll(TAGLINE_SEPARATOR, " ") : undefined}
          accessible={taglineComplete}
          style={[styles.tagline, { gap: taglineGap }]}
        >
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.taglinePhrase,
              styles.taglineWalk,
              { fontSize: taglineFontSize },
              getTaglineRevealStyle(taglineProgress, 0, 0.28)
            ]}
          >
            {strings.launch.taglineWalk}
          </Animated.Text>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.taglinePhrase,
              styles.taglineExplore,
              { fontSize: taglineFontSize },
              getTaglineRevealStyle(taglineProgress, 0.25, 0.58)
            ]}
          >
            {strings.launch.taglineExplore}
          </Animated.Text>
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.taglinePhrase,
              styles.taglineReveal,
              { fontSize: taglineFontSize },
              getTaglineRevealStyle(taglineProgress, 0.55, 0.92)
            ]}
          >
            {strings.launch.taglineReveal}
          </Animated.Text>
        </View>
        <Animated.View
          accessibilityElementsHidden={!startPromptVisible}
          pointerEvents={
            startPromptVisible && !startRequested && !isDismissing
              ? "auto"
              : "none"
          }
          style={[styles.footer, { opacity: footerOpacity }]}
        >
          {startRequested ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={APP_COLORS.gold} size="small" />
              <Text style={styles.loadingText}>{strings.launch.loadingMap}</Text>
            </View>
          ) : (
            <Animated.View
              style={{
                opacity: startPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.72]
                }),
                transform: [{
                  scale: startPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.035]
                  })
                }]
              }}
            >
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.45}
                onPress={handleStart}
                style={styles.startButton}
              >
                <Text style={styles.startText}>{strings.launch.pressToStart}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
        {backgroundHoldComplete ? (
          <Text
            style={[
              styles.version,
              { bottom: Math.max(safeAreaInsets.bottom, 8) }
            ]}
          >
            v{APP_VERSION}
          </Text>
        ) : null}
      </ImageBackground>
    </Animated.View>
  );
}

function getTaglineRevealStyle(
  progress: Animated.Value,
  start: number,
  end: number
) {
  return {
    opacity: progress.interpolate({
      extrapolate: "clamp",
      inputRange: [start, end],
      outputRange: [0, 1]
    }),
    transform: [{
      translateY: progress.interpolate({
        extrapolate: "clamp",
        inputRange: [start, end],
        outputRange: [3, 0]
      })
    }]
  };
}

const styles = createAppearanceStyles({
  background: {
    backgroundColor: "#071018",
    flex: 1,
    justifyContent: "flex-end"
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#071018",
    zIndex: 50
  },
  footer: {
    alignItems: "center",
    gap: 14,
    paddingBottom: 58,
    paddingHorizontal: 24
  },
  loadingRow: {
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 10, 0.72)",
    borderColor: "rgba(156, 255, 0, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  loadingText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase"
  },
  startButton: {
    paddingHorizontal: 22,
    paddingVertical: 12
  },
  startText: {
    color: "rgba(248, 250, 252, 0.78)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 2.2,
    textShadowColor: "rgba(156, 255, 0, 0.35)",
    textShadowOffset: {
      height: 0,
      width: 0
    },
    textShadowRadius: 6,
    textTransform: "uppercase"
  },
  tagline: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    left: "31%",
    position: "absolute",
    right: "5%",
    top: "17%"
  },
  taglineExplore: {
    color: "#f5c451"
  },
  taglineReveal: {
    color: "#f3e5bd"
  },
  taglinePhrase: {
    fontWeight: "600",
    letterSpacing: 1.1,
    textShadowColor: "rgba(0, 0, 0, 0.92)",
    textShadowOffset: {
      height: 1,
      width: 0
    },
    textShadowRadius: 4
  },
  taglineWalk: {
    color: "#67c8c2"
  },
  version: {
    color: "rgba(248, 250, 252, 0.72)",
    fontSize: 6,
    fontWeight: "700",
    letterSpacing: 0.4,
    position: "absolute",
    right: 10
  }
});
