import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppLanguage } from "../i18n";
import { CollectedMedal } from "../types/medal";

export type MedalFlightTarget = {
  x: number;
  y: number;
};

type MedalCelebrationProps = {
  flightTarget: MedalFlightTarget | null;
  language: AppLanguage;
  medal: CollectedMedal | null;
  onComplete: () => void;
};

export function MedalCelebration({
  flightTarget,
  language,
  medal,
  onComplete
}: MedalCelebrationProps) {
  const revealProgress = useRef(new Animated.Value(0)).current;
  const flightX = useRef(new Animated.Value(0)).current;
  const flightY = useRef(new Animated.Value(0)).current;
  const flightScale = useRef(new Animated.Value(1)).current;
  const copyOpacity = useRef(new Animated.Value(1)).current;
  const medalOriginRef = useRef<View>(null);
  const [isFlying, setIsFlying] = useState(false);

  useEffect(() => {
    revealProgress.setValue(0);
    flightX.setValue(0);
    flightY.setValue(0);
    flightScale.setValue(1);
    copyOpacity.setValue(1);
    setIsFlying(false);

    if (!medal) {
      return;
    }

    let active = true;
    AccessibilityInfo.announceForAccessibility(
      language === "fr"
        ? `M\u00e9daille collect\u00e9e : ${medal.name.fr}`
        : `Medal collected: ${medal.name.en}`
    );

    let audioPlayer: { play: () => void; release: () => void } | null = null;
    void import("expo-audio")
      .then(({ createAudioPlayer }) => {
        if (!active) {
          return;
        }

        audioPlayer = createAudioPlayer(
          require("../../assets/sounds/medal-chime.wav")
        );
        audioPlayer.play();
      })
      .catch(() => undefined);
    void import("expo-haptics")
      .then((Haptics) =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      )
      .catch(() => undefined);
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) {
        return;
      }

      if (reduced) {
        revealProgress.setValue(1);
        return;
      }

      Animated.sequence([
        Animated.timing(revealProgress, {
          duration: 900,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(revealProgress, {
          delay: 620,
          duration: 420,
          easing: Easing.inOut(Easing.quad),
          toValue: 1.08,
          useNativeDriver: true
        })
      ]).start();
    });

    return () => {
      active = false;
      audioPlayer?.release();
      revealProgress.stopAnimation();
      flightX.stopAnimation();
      flightY.stopAnimation();
      flightScale.stopAnimation();
      copyOpacity.stopAnimation();
    };
  }, [
    copyOpacity,
    flightScale,
    flightX,
    flightY,
    language,
    medal,
    revealProgress
  ]);

  if (!medal) {
    return null;
  }

  const spinY = revealProgress.interpolate({
    inputRange: [0, 1, 1.08],
    outputRange: ["-720deg", "0deg", "18deg"]
  });
  const tiltZ = revealProgress.interpolate({
    inputRange: [0, 0.78, 1, 1.08],
    outputRange: ["-12deg", "5deg", "0deg", "2deg"]
  });
  const revealScale = revealProgress.interpolate({
    inputRange: [0, 0.72, 1, 1.08],
    outputRange: [0.12, 1.18, 1, 1.02]
  });

  const finishWithoutTarget = () => {
    Animated.timing(copyOpacity, {
      duration: 220,
      toValue: 0,
      useNativeDriver: true
    }).start(() => onComplete());
  };

  const handleContinue = () => {
    if (isFlying) {
      return;
    }

    setIsFlying(true);

    if (!flightTarget || !medalOriginRef.current) {
      finishWithoutTarget();
      return;
    }

    medalOriginRef.current.measureInWindow((x, y, width, height) => {
      const originX = x + width / 2;
      const originY = y + height / 2;

      Animated.parallel([
        Animated.timing(copyOpacity, {
          duration: 180,
          toValue: 0,
          useNativeDriver: true
        }),
        Animated.timing(flightX, {
          duration: 620,
          easing: Easing.inOut(Easing.cubic),
          toValue: flightTarget.x - originX,
          useNativeDriver: true
        }),
        Animated.timing(flightY, {
          duration: 620,
          easing: Easing.inOut(Easing.cubic),
          toValue: flightTarget.y - originY,
          useNativeDriver: true
        }),
        Animated.timing(flightScale, {
          duration: 620,
          easing: Easing.in(Easing.cubic),
          toValue: 0.16,
          useNativeDriver: true
        })
      ]).start(() => onComplete());
    });
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleContinue}
      transparent
      visible
    >
      <View style={styles.backdrop}>
        <Animated.Text style={[styles.kicker, { opacity: copyOpacity }]}>
          {language === "fr" ? "NOUVELLE M\u00c9DAILLE" : "NEW MEDAL"}
        </Animated.Text>
        <View collapsable={false} ref={medalOriginRef}>
          <Animated.View
            style={[
              styles.medal,
              {
                transform: [
                  { perspective: 800 },
                  { translateX: flightX },
                  { translateY: flightY },
                  { rotateY: spinY },
                  { rotateZ: tiltZ },
                  { scale: revealScale },
                  { scale: flightScale }
                ]
              }
            ]}
          >
            <View style={styles.medalInner}>
              <Ionicons color="#fff8db" name="location" size={58} />
            </View>
          </Animated.View>
        </View>
        <Animated.View style={[styles.copy, { opacity: copyOpacity }]}>
          <Text style={styles.title}>{medal.name[language]}</Text>
          <Text style={styles.description}>{medal.description[language]}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isFlying}
            onPress={handleContinue}
            style={styles.continueButton}
          >
            <Text style={styles.continueText}>
              {language === "fr" ? "Continuer" : "Continue"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(2, 6, 10, 0.95)", flex: 1, justifyContent: "center", padding: 30 },
  copy: { alignItems: "center" },
  kicker: { color: "#f5c451", fontSize: 13, fontWeight: "900", letterSpacing: 2.4, marginBottom: 24 },
  medal: { alignItems: "center", backfaceVisibility: "hidden", backgroundColor: "#b88119", borderColor: "#ffe49a", borderRadius: 82, borderWidth: 6, elevation: 18, height: 164, justifyContent: "center", shadowColor: "#f5c451", shadowOpacity: 0.65, shadowRadius: 30, width: 164 },
  medalInner: { alignItems: "center", borderColor: "rgba(255,255,255,0.46)", borderRadius: 62, borderWidth: 2, height: 124, justifyContent: "center", width: 124 },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "900", marginTop: 28, textAlign: "center" },
  description: { color: "#b7c3cc", fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 360, textAlign: "center" },
  continueButton: { backgroundColor: "#f5c451", borderRadius: 14, marginTop: 28, minWidth: 150, paddingHorizontal: 22, paddingVertical: 13 },
  continueText: { color: "#151006", fontSize: 15, fontWeight: "900", textAlign: "center" }
});