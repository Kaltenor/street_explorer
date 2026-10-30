import { memo, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { createAppearanceStyles } from "../constants/appearance";
import { APP_COLORS } from "../constants/theme";
import type { RoutePlan, PlanPoint } from "../services/routePlanning";
import { haversineDistanceMeters } from "../services/distance";
import { prepareGuidanceRoute } from "../services/routeGuidance";
import type { AppLanguage } from "../i18n";

export const PlanGuidance = memo(function PlanGuidance({ plan, point, recording, language, onHide, onFocus }: {
  plan: RoutePlan; point: PlanPoint | null; recording: boolean; language: AppLanguage; onHide: () => void; onFocus: () => void;
}) {
  const fr = language === "fr";
  const route = useMemo(() => prepareGuidanceRoute(plan.coordinates), [plan.coordinates]);
  const distance = useMemo(() => {
    if (!point || !route) return null;
    if (!recording) return haversineDistanceMeters(point, plan.coordinates[0]!);
    return route.distanceTo(point);
  }, [point, plan.coordinates, recording, route]);
  return <View style={styles.banner}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={fr ? "Voir le parcours prévu" : "Show planned route"} onPress={onFocus} style={styles.body}>
      <View style={styles.heading}>
        <Ionicons name="navigate-outline" color={APP_COLORS.guidance} size={16} />
        <Text style={styles.eyebrow}>{fr ? "PARCOURS PRÉVU" : "PLANNED WALK"}</Text>
        <Text style={styles.distance}>{(plan.distanceMeters / 1000).toFixed(1)} km</Text>
      </View>
      <Text numberOfLines={1} style={styles.title}>{plan.name}</Text>
      <Text style={styles.detail}>{!recording
        ? distance === null ? (fr ? "Rejoignez le départ, puis démarrez la marche." : "Travel to the start, then start your walk.")
          : `${fr ? "Départ à" : "Start"} ${(distance / 1000).toFixed(2)} km ${fr ? "à vol d’oiseau · démarrage manuel" : "away in a straight line · start manually"}`
        : distance === null ? (fr ? "En attente de votre position pour le guidage." : "Waiting for your location for guidance.")
          : distance > 50 ? (fr ? "Hors du parcours · continuez librement ou rejoignez le tracé bleu." : "Off route · explore freely or rejoin the blue line.")
          : (fr ? "Tracé bleu : parcours prévu · seule la marche compte." : "Blue line: your plan · only your actual walk counts.")}</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={fr ? "Arrêter le guidage, conserver l’enregistrement" : "Stop guidance, keep recording"} onPress={onHide} style={styles.hide}>
      <Ionicons name="close-outline" color={APP_COLORS.textSecondary} size={20} />
    </TouchableOpacity>
  </View>;
});
const styles = createAppearanceStyles({
  banner: { flexDirection: "row", alignItems: "center", backgroundColor: APP_COLORS.card, borderColor: APP_COLORS.border, borderLeftColor: APP_COLORS.guidance, borderLeftWidth: 3, borderWidth: 1, borderRadius: 14, paddingLeft: 12, paddingRight: 4, marginBottom: 6 },
  body: { flex: 1, minWidth: 0, minHeight: 56, gap: 3, justifyContent: "center", paddingVertical: 10 },
  heading: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  eyebrow: { color: APP_COLORS.guidance, fontSize: 10, fontWeight: "800", letterSpacing: 1, flexShrink: 1 },
  distance: { color: APP_COLORS.textSecondary, fontSize: 11, fontVariant: ["tabular-nums"] },
  title: { color: APP_COLORS.parchment, fontSize: 14, fontWeight: "600" },
  detail: { color: APP_COLORS.textMuted, fontSize: 12, lineHeight: 17 },
  hide: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginLeft: 4 }
});
