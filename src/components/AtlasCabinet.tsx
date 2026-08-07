import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createAppearanceStyles } from "../constants/appearance";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  ImageBackground,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
  View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { APP_COLORS, ATLAS_DISPLAY_FONT } from "../constants/theme";
import {
  shouldCaptureAtlasSwipeBackStart,
  shouldCompleteAtlasSwipeBack,
  shouldStartAtlasSwipeBack
} from "../services/atlasSwipeBack";

type AtlasSound = "ink" | "page";

export function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

export function playAtlasSound(sound: AtlasSound) {
  let player: { play: () => void; release: () => void } | null = null;

  void import("expo-audio")
    .then(({ createAudioPlayer }) => {
      player = createAudioPlayer(
        sound === "page"
          ? require("../../assets/sounds/atlas-page.wav")
          : require("../../assets/sounds/atlas-stamp.wav")
      );
      player.play();
      setTimeout(() => player?.release(), sound === "page" ? 900 : 600);
    })
    .catch(() => undefined);
}


export function AtlasScreen({
  children,
  onSwipeBack,
  swipeBackDisabled = false,
  visible
}: {
  children: ReactNode;
  onSwipeBack?: () => void;
  swipeBackDisabled?: boolean;
  visible: boolean;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const openedRef = useRef(false);
  const swipeBackCallbackRef = useRef(onSwipeBack);
  const swipeBackEnabledRef = useRef(false);
  const swipeScreenWidthRef = useRef(390);
  const reducedMotion = useReducedMotionPreference();
  const reducedMotionRef = useRef(reducedMotion);
  swipeBackCallbackRef.current = onSwipeBack;
  swipeBackEnabledRef.current =
    Platform.OS === "ios" && visible && Boolean(onSwipeBack) && !swipeBackDisabled;
  reducedMotionRef.current = reducedMotion;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (event) =>
          shouldCaptureAtlasSwipeBackStart({
            enabled: swipeBackEnabledRef.current,
            startX: event.nativeEvent.pageX
          }),
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          shouldStartAtlasSwipeBack({
            deltaX: gestureState.dx,
            deltaY: gestureState.dy,
            enabled: swipeBackEnabledRef.current,
            startX: gestureState.x0
          }),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          shouldStartAtlasSwipeBack({
            deltaX: gestureState.dx,
            deltaY: gestureState.dy,
            enabled: swipeBackEnabledRef.current,
            startX: gestureState.x0
          }),
        onPanResponderMove: (_event, gestureState) => {
          swipeTranslateX.setValue(
            Math.max(0, Math.min(swipeScreenWidthRef.current, gestureState.dx))
          );
        },
        onPanResponderRelease: (_event, gestureState) => {
          const shouldComplete = shouldCompleteAtlasSwipeBack({
            deltaX: gestureState.dx,
            screenWidth: swipeScreenWidthRef.current,
            velocityX: gestureState.vx
          });

          if (shouldComplete) {
            if (reducedMotionRef.current) {
              swipeTranslateX.setValue(swipeScreenWidthRef.current);
              swipeBackCallbackRef.current?.();
              return;
            }

            Animated.timing(swipeTranslateX, {
              duration: 170,
              easing: Easing.out(Easing.cubic),
              toValue: swipeScreenWidthRef.current,
              useNativeDriver: true
            }).start(({ finished }) => {
              if (finished) {
                swipeBackCallbackRef.current?.();
              }
            });
            return;
          }

          Animated.spring(swipeTranslateX, {
            damping: 20,
            mass: 0.7,
            stiffness: 240,
            toValue: 0,
            useNativeDriver: true
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeTranslateX, {
            damping: 20,
            mass: 0.7,
            stiffness: 240,
            toValue: 0,
            useNativeDriver: true
          }).start();
        },
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => false
      }),
    [swipeTranslateX]
  );

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      swipeTranslateX.setValue(0);
      return;
    }

    swipeTranslateX.setValue(0);

    if (!openedRef.current) {
      openedRef.current = true;
      playAtlasSound("page");
    }
    entrance.stopAnimation();

    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }

    entrance.setValue(0);
    Animated.timing(entrance, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true
    }).start();
  }, [entrance, reducedMotion, swipeTranslateX, visible]);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      onAccessibilityEscape={() => {
        if (swipeBackEnabledRef.current) {
          swipeBackCallbackRef.current?.();
        }
      }}
      onLayout={(event) => {
        swipeScreenWidthRef.current = event.nativeEvent.layout.width;
      }}
      style={[
        styles.swipeSurface,
        { transform: [{ translateX: swipeTranslateX }] }
      ]}
    >
      <ImageBackground
        imageStyle={styles.paperTexture}
        resizeMode="cover"
        source={require("../../assets/ui/atlas-paper-texture.png")}
        style={styles.screen}
      >
        <View pointerEvents="none" style={styles.inkWash} />
        <Animated.View
          style={[
            styles.screenContent,
            {
              opacity: entrance,
              transform: [{
                translateX: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: reducedMotion ? [0, 0] : [22, 0]
                })
              }]
            }
          ]}
        >
          {children}
        </Animated.View>
      </ImageBackground>
    </Animated.View>
  );
}

export function AtlasModalHeader({
  backDisabled = false,
  emblem,
  eyebrow,
  onBack,
  subtitle,
  title
}: {
  backDisabled?: boolean;
  emblem: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  onBack: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: backDisabled }}
        disabled={backDisabled}
        onPress={onBack}
        style={[styles.backButton, backDisabled ? styles.disabled : null]}
      >
        <Ionicons color={APP_COLORS.parchment} name="chevron-back" size={21} />
      </TouchableOpacity>
      <View style={styles.emblem}>
        <View style={styles.emblemInner}>
          <Ionicons color={APP_COLORS.gold} name={emblem} size={20} />
        </View>
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerDiamond} />
          <View style={styles.dividerLineShort} />
        </View>
      </View>
    </View>
  );
}

export function AtlasSectionLabel({
  icon,
  title
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.sectionLabel}>
      <Ionicons color={APP_COLORS.gold} name={icon} size={14} />
      <Text style={styles.sectionLabelText}>{title}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

export type AtlasStampMessage = {
  detail: string;
  id: number;
  presentation?: "map-selection" | "standard";
  title: string;
};

type AtlasStampMapInsets = {
  bottom: number;
  top: number;
};

export function AtlasStamp({
  mapContentInsets,
  message,
  onDismiss
}: {
  mapContentInsets?: AtlasStampMapInsets;
  message: AtlasStampMessage | null;
  onDismiss: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [loadedArtworkMessageId, setLoadedArtworkMessageId] = useState<number | null>(null);
  const reducedMotion = useReducedMotionPreference();
  const stampedMessageIdRef = useRef<number | null>(null);
  const isMapSelection = message?.presentation === "map-selection";
  const artworkReady = loadedArtworkMessageId === message?.id;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(reducedMotion ? 1 : 0);

    if (!message || !artworkReady) return;

    if (stampedMessageIdRef.current !== message.id) {
      stampedMessageIdRef.current = message.id;
      playAtlasSound("ink");
      void import("expo-haptics")
        .then((Haptics) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
        .catch(() => undefined);
    }
    const strikeAnimation = reducedMotion
      ? null
      : Animated.sequence([
          Animated.timing(progress, {
            duration: 125,
            easing: Easing.in(Easing.cubic),
            toValue: 0.76,
            useNativeDriver: true
          }),
          Animated.spring(progress, {
            damping: 6,
            mass: 0.5,
            stiffness: 300,
            toValue: 1,
            useNativeDriver: true
          })
        ]);
    strikeAnimation?.start();

    const dismissTimer = setTimeout(onDismiss, reducedMotion ? 1050 : 1550);
    return () => {
      clearTimeout(dismissTimer);
      strikeAnimation?.stop();
    };
  }, [artworkReady, message, onDismiss, progress, reducedMotion]);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.stampLayer,
        isMapSelection
          ? [
              styles.mapSelectionStampLayer,
              {
                bottom: mapContentInsets?.bottom ?? 160,
                top: mapContentInsets?.top ?? 180
              }
            ]
          : null
      ]}
    >
      <Animated.View
        style={[
          styles.stamp,
          {
            opacity: artworkReady
              ? progress.interpolate({
                  inputRange: [0, 0.08, 1],
                  outputRange: [0, 1, 1]
                })
              : 0,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 0.76, 1],
                  outputRange: [-24, 4, 0]
                })
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 0.76, 1],
                  outputRange: ["-14deg", "-3deg", "-5deg"]
                })
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.76, 1],
                  outputRange: isMapSelection
                    ? [4.8, 2.72, 3]
                    : [1.6, 0.9, 1]
                })
              }
            ]
          }
        ]}
      >
        <Image
          key={message.id}
          onLoad={() => setLoadedArtworkMessageId(message.id)}
          source={require("../../assets/ui/atlas-cartographer-stamp.png")}
          style={styles.stampArtwork}
        />
        <View style={styles.stampCopy}>
          <View style={styles.stampTextLine}>
            <Text numberOfLines={2} style={[styles.stampTitle, styles.stampTextDrop]}>
              {message.title}
            </Text>
            <Text numberOfLines={2} style={[styles.stampTitle, styles.stampTextFace]}>
              {message.title}
            </Text>
          </View>
          <View style={styles.stampTextLine}>
            <Text numberOfLines={2} style={[styles.stampDetail, styles.stampTextDrop]}>
              {message.detail}
            </Text>
            <Text numberOfLines={2} style={[styles.stampDetail, styles.stampTextFace]}>
              {message.detail}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export const ATLAS_CARD_STYLE: ViewStyle = {
  backgroundColor: "rgba(9, 19, 27, 0.92)",
  borderColor: APP_COLORS.border,
  borderRadius: 18,
  borderWidth: 1
};

const styles = createAppearanceStyles({
  backButton: {
    alignItems: "center",
    backgroundColor: "rgba(12, 21, 28, 0.9)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  disabled: { opacity: 0.42 },
  divider: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 9 },
  dividerDiamond: {
    backgroundColor: APP_COLORS.gold,
    height: 5,
    opacity: 0.78,
    transform: [{ rotate: "45deg" }],
    width: 5
  },
  dividerLine: { backgroundColor: APP_COLORS.gold, flex: 1, height: 1, opacity: 0.34 },
  dividerLineShort: { backgroundColor: APP_COLORS.gold, height: 1, opacity: 0.18, width: 28 },
  emblem: {
    alignItems: "center",
    backgroundColor: "rgba(245, 196, 81, 0.08)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 23,
    borderWidth: 1,
    height: 46,
    justifyContent: "center",
    width: 46
  },
  emblemInner: {
    alignItems: "center",
    borderColor: "rgba(245, 196, 81, 0.46)",
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  eyebrow: {
    color: APP_COLORS.parchmentMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7
  },
  header: {
    alignItems: "center",
    backgroundColor: "rgba(3, 10, 15, 0.88)",
    flexDirection: "row",
    gap: 11,
    paddingBottom: 13,
    paddingHorizontal: 16,
    paddingTop: 56
  },
  headerCopy: { flex: 1, minWidth: 0 },
  inkWash: {
    backgroundColor: "rgba(2, 6, 10, 0.48)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  paperTexture: { opacity: 0.3 },
  screen: { backgroundColor: APP_COLORS.background, flex: 1 },
  screenContent: { flex: 1 },
  swipeSurface: {
    flex: 1,
    shadowColor: "#02060a",
    shadowOffset: { height: 0, width: -8 },
    shadowOpacity: 0.42,
    shadowRadius: 16
  },
  sectionLabel: { alignItems: "center", flexDirection: "row", gap: 7 },
  sectionLabelText: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
    textTransform: "uppercase"
  },
  sectionRule: { backgroundColor: APP_COLORS.goldBorder, flex: 1, height: 1 },
  mapSelectionStampLayer: { justifyContent: "center" },
  stamp: {
    alignItems: "center",
    height: 106,
    justifyContent: "center",
    width: 106
  },
  stampArtwork: {
    height: "100%",
    left: 0,
    position: "absolute",
    resizeMode: "contain",
    top: 0,
    width: "100%"
  },
  stampCopy: {
    alignItems: "center",
    justifyContent: "center",
    width: "58%"
  },
  stampDetail: {
    color: APP_COLORS.parchment,
    fontSize: 7,
    fontWeight: "800",
    lineHeight: 8.5,
    marginTop: 1.5,
    textAlign: "center"
  },
  stampTextDrop: {
    color: "rgba(1, 7, 11, 0.9)",
    left: 1,
    position: "absolute",
    top: 1,
    width: "100%"
  },
  stampTextFace: {
    textShadowColor: "rgba(255, 255, 255, 0.92)",
    textShadowOffset: { height: 0, width: 0 },
    textShadowRadius: 1.25
  },
  stampTextLine: { width: "100%" },

  stampLayer: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 146,
    zIndex: 100
  },
  stampTitle: {
    color: APP_COLORS.gold,
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.55,
    lineHeight: 9,
    marginTop: 1,
    textAlign: "center"
  },
  subtitle: { color: APP_COLORS.textMuted, fontSize: 12, marginTop: 2 },
  title: { color: APP_COLORS.gold, fontFamily: ATLAS_DISPLAY_FONT, fontSize: 23, marginTop: 1 }
});

