import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  type ViewStyle,
  View
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { APP_COLORS } from "../constants/theme";

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
  visible
}: {
  children: ReactNode;
  visible: boolean;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const openedRef = useRef(false);
  const reducedMotion = useReducedMotionPreference();

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      return;
    }

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
  }, [entrance, reducedMotion, visible]);

  return (
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
  title: string;
};

export function AtlasStamp({
  message,
  onDismiss
}: {
  message: AtlasStampMessage | null;
  onDismiss: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotionPreference();
  const stampedMessageIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!message) return;

    if (stampedMessageIdRef.current !== message.id) {
      stampedMessageIdRef.current = message.id;
      playAtlasSound("ink");
      void import("expo-haptics")
        .then((Haptics) => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
        .catch(() => undefined);
    }
    progress.stopAnimation();
    progress.setValue(reducedMotion ? 1 : 0);

    if (!reducedMotion) {
      Animated.spring(progress, {
        damping: 10,
        mass: 0.65,
        stiffness: 220,
        toValue: 1,
        useNativeDriver: true
      }).start();
    }

    const dismissTimer = setTimeout(onDismiss, reducedMotion ? 1050 : 1550);
    return () => clearTimeout(dismissTimer);
  }, [message, onDismiss, progress, reducedMotion]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={styles.stampLayer}>
      <Animated.View
        style={[
          styles.stamp,
          {
            opacity: progress,
            transform: [
              { rotate: "-5deg" },
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1.38, 1] }) }
            ]
          }
        ]}
      >
        <View style={styles.stampInner}>
          <Ionicons color={APP_COLORS.gold} name="compass-outline" size={20} />
          <Text style={styles.stampTitle}>{message.title}</Text>
          <Text numberOfLines={2} style={styles.stampDetail}>{message.detail}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

export const ATLAS_CARD_STYLE: ViewStyle = {
  backgroundColor: "rgba(9, 19, 27, 0.92)",
  borderColor: APP_COLORS.goldBorder,
  borderRadius: 18,
  borderWidth: 1
};

const styles = StyleSheet.create({
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
  sectionLabel: { alignItems: "center", flexDirection: "row", gap: 7 },
  sectionLabelText: {
    color: APP_COLORS.gold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
    textTransform: "uppercase"
  },
  sectionRule: { backgroundColor: APP_COLORS.goldBorder, flex: 1, height: 1 },
  stamp: {
    alignItems: "center",
    backgroundColor: "rgba(5, 15, 21, 0.96)",
    borderColor: APP_COLORS.gold,
    borderRadius: 62,
    borderWidth: 2,
    height: 124,
    justifyContent: "center",
    padding: 6,
    width: 124
  },
  stampDetail: {
    color: APP_COLORS.parchment,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 3,
    textAlign: "center"
  },
  stampInner: {
    alignItems: "center",
    borderColor: "rgba(245, 196, 81, 0.52)",
    borderRadius: 52,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    width: "100%"
  },
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
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
    marginTop: 2,
    textAlign: "center"
  },
  subtitle: { color: APP_COLORS.textMuted, fontSize: 12, marginTop: 2 },
  title: { color: APP_COLORS.gold, fontSize: 25, fontWeight: "900", marginTop: 1 }
});

