import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { ATLAS_DISPLAY_FONT } from "../constants/theme";
import { isDaylightAppearance } from "../constants/appearance";
import { playLocationSelectionSound } from "../services/locationSelectionSound";
import { useReducedMotionPreference } from "./AtlasCabinet";

export type MapLocationMessage = {
  id: number;
  name: string;
  scope: string;
  expiresAt: number;
};

// Keyed by selection in MapScreen: a replacement cancels the previous animation
// and sound rather than building a queue of places the user has already left.
export function MapLocationLabel({ message, mapContentInsets, onDismiss }: {
  message: MapLocationMessage;
  mapContentInsets: { top: number; bottom: number };
  onDismiss: (id: number) => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotionPreference();
  const daylight = isDaylightAppearance();

  useEffect(() => {
    if (message.expiresAt <= Date.now()) return;
    return playLocationSelectionSound();
  }, [message.id]);

  useEffect(() => {
    const remaining = message.expiresAt - Date.now();
    if (remaining <= 0) {
      onDismiss(message.id);
      return;
    }
    progress.setValue(0);
    const enterMs = Math.min(reducedMotion ? 180 : 520, remaining / 3);
    const exitMs = Math.min(reducedMotion ? 220 : 600, remaining / 3);
    const animation = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1, duration: enterMs, easing: Easing.out(Easing.cubic), useNativeDriver: true
      }),
      Animated.delay(Math.max(0, remaining - enterMs - exitMs)),
      Animated.timing(progress, {
        toValue: 2, duration: exitMs, easing: Easing.inOut(Easing.cubic), useNativeDriver: true
      })
    ]);
    // A deadline also dismisses a stalled/interrupted native animation.
    const timer = setTimeout(() => onDismiss(message.id), remaining);
    animation.start(({ finished }) => { if (finished) onDismiss(message.id); });
    return () => { clearTimeout(timer); animation.stop(); };
  }, [message, onDismiss, progress, reducedMotion]);

  const ink = daylight ? styles.daylightInk : styles.nightInk;
  const accent = daylight ? "#81633c" : "#c6a574";
  return (
    <View pointerEvents="none" style={[styles.layer, mapContentInsets]}>
      <Animated.View
        accessible
        accessibilityLabel={`${message.scope}: ${message.name}`}
        accessibilityLiveRegion="polite"
        style={[styles.label, {
          opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: reducedMotion ? [] : [{
            translateY: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [9, 0, -5] })
          }]
        }]}
      >
        <View style={styles.eyebrow}>
          <Animated.View style={[styles.rule, { backgroundColor: accent, transform: [{
            scaleX: reducedMotion ? 1 : progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0.15, 1, 0.6] })
          }] }]} />
          <Text numberOfLines={1} style={[styles.scope, ink, { color: accent }]}>{message.scope}</Text>
          <Animated.View style={[styles.rule, { backgroundColor: accent, transform: [{
            scaleX: reducedMotion ? 1 : progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0.15, 1, 0.6] })
          }] }]} />
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={2} style={[styles.name, ink]}>
          {message.name}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 24, right: 24, justifyContent: "center", alignItems: "center" },
  label: { alignItems: "center", width: "100%", maxWidth: 350, gap: 9 },
  eyebrow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  rule: { width: 28, height: 1, opacity: 0.8 },
  scope: { fontSize: 10, letterSpacing: 3, fontWeight: "600", textTransform: "uppercase", flexShrink: 1 },
  name: { fontFamily: ATLAS_DISPLAY_FONT, fontSize: 28, textAlign: "center", letterSpacing: 0.6 },
  nightInk: { color: "#f4e9d6", textShadowColor: "#071018", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  daylightInk: { color: "#172b39", textShadowColor: "#fffaf0", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }
});
