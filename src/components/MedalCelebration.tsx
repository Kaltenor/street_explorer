import { useEffect, useRef } from "react";
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

type MedalCelebrationProps = {
  language: AppLanguage;
  medal: CollectedMedal | null;
  onComplete: () => void;
};

export function MedalCelebration({ language, medal, onComplete }: MedalCelebrationProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!medal) {
      progress.setValue(0);
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
        progress.setValue(1);
        return;
      }

      Animated.sequence([
        Animated.timing(progress, {
          duration: 640,
          easing: Easing.out(Easing.back(1.45)),
          toValue: 1,
          useNativeDriver: true
        }),
        Animated.timing(progress, {
          delay: 760,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          toValue: 1.12,
          useNativeDriver: true
        })
      ]).start();
    });

    return () => {
      active = false;
      audioPlayer?.release();
      progress.stopAnimation();
    };
  }, [language, medal, progress]);

  if (!medal) {
    return null;
  }

  const spin = progress.interpolate({
    inputRange: [0, 1, 1.12],
    outputRange: ["-140deg", "0deg", "14deg"]
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.72, 1, 1.12],
    outputRange: [0.15, 1.16, 1, 1.03]
  });

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.backdrop}>
        <Text style={styles.kicker}>
          {language === "fr" ? "NOUVELLE M\u00c9DAILLE" : "NEW MEDAL"}
        </Text>
        <Animated.View style={[styles.medal, { transform: [{ rotate: spin }, { scale }] }]}>
          <View style={styles.medalInner}>
            <Ionicons color="#fff8db" name="location" size={58} />
          </View>
        </Animated.View>
        <Text style={styles.title}>{medal.name[language]}</Text>
        <Text style={styles.description}>{medal.description[language]}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onComplete}
          style={styles.continueButton}
        >
          <Text style={styles.continueText}>
            {language === "fr" ? "Continuer" : "Continue"}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(2, 6, 10, 0.95)", flex: 1, justifyContent: "center", padding: 30 },
  kicker: { color: "#f5c451", fontSize: 13, fontWeight: "900", letterSpacing: 2.4, marginBottom: 24 },
  medal: { alignItems: "center", backgroundColor: "#b88119", borderColor: "#ffe49a", borderRadius: 82, borderWidth: 6, elevation: 18, height: 164, justifyContent: "center", shadowColor: "#f5c451", shadowOpacity: 0.65, shadowRadius: 30, width: 164 },
  medalInner: { alignItems: "center", borderColor: "rgba(255,255,255,0.46)", borderRadius: 62, borderWidth: 2, height: 124, justifyContent: "center", width: 124 },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "900", marginTop: 28, textAlign: "center" },
  description: { color: "#b7c3cc", fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 360, textAlign: "center" },
  continueButton: { backgroundColor: "#f5c451", borderRadius: 14, marginTop: 28, minWidth: 150, paddingHorizontal: 22, paddingVertical: 13 },
  continueText: { color: "#151006", fontSize: 15, fontWeight: "900", textAlign: "center" }
});
