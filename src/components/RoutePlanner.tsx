import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AtlasHudTexture } from "./AtlasHudDecor";
import { APP_COLORS, ATLAS_DISPLAY_FONT } from "../constants/theme";
import { createAppearanceStyles } from "../constants/appearance";
import type { AppLanguage } from "../i18n";
import type { ForbiddenZone } from "../database/forbiddenZoneRepository";
import { buildPlanningGraph, planThroughStops, suggestRoute, PlanningError, type PlanPoint, type PlanStop, type RoutePlan } from "../services/routePlanning";
import { createPlanningExploration } from "../services/planningExploration";
import { loadPlanningData } from "../services/planningData";
import { haversineDistanceMeters } from "../services/distance";

export type PlanningMapState = { plan: RoutePlan | null; stops: PlanStop[]; autoFrame: boolean; onPress: (point: PlanPoint) => void };
type Props = {
  language: AppLanguage; exploredCellIds: string[]; forbiddenZones: ForbiddenZone[];
  onMapStateChange: (state: PlanningMapState | null) => void;
  onClose: () => void; onFollow: (plan: RoutePlan) => Promise<void>;
};
const ERRORS = {
  unavailable: ["Walking-map data unavailable. Connect and retry.", "Données piétonnes indisponibles. Connectez-vous et réessayez."],
  large: ["Area too dense. Try a shorter walk or another start.", "Zone trop dense. Essayez une balade plus courte ou un autre départ."],
  snap: ["A point is over 40 m from an accessible path. Undo it or choose another start.", "Un point est à plus de 40 m d’un chemin accessible. Annulez-le ou changez le départ."],
  disconnected: ["No connected walking route. Undo a point or change the start.", "Aucun chemin piéton continu. Annulez un point ou changez le départ."],
  distance: ["Walks must be between 25 m and 6 km. Undo a point or shorten the route.", "Balades de 25 m à 6 km. Annulez un point ou raccourcissez le parcours."],
  suggestion: ["No walk fits. Change the distance, return option or starting point.", "Aucune balade adaptée. Changez la distance, le retour ou le départ."],
  invalid: ["Check the starting point and stops.", "Vérifiez le départ et les étapes."],
  cancelled: ["Calculation cancelled. Tap a point or retry.", "Calcul annulé. Touchez la carte ou réessayez."]
} as const;
function Action({ label, onPress, disabled = false, selected = false, icon, compact = false, primary = false, description }: {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean; compact?: boolean; primary?: boolean; description?: string; icon?: keyof typeof Ionicons.glyphMap;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityHint={description} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.action, description && styles.choice, selected && styles.selected, primary && styles.primary, disabled && styles.disabled]}>
    {icon ? <Ionicons name={icon} color={primary ? APP_COLORS.inkOnGold : APP_COLORS.gold} size={19} /> : null}
    {!compact ? <View style={styles.actionCopy}><Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>{description ? <Text style={styles.choiceDetail}>{description}</Text> : null}</View> : null}
  </TouchableOpacity>;
}
export function RoutePlanner({ language, exploredCellIds, forbiddenZones, onMapStateChange, onClose, onFollow }: Props) {
  const fr = language === "fr";
  const t = (en: string, french: string) => fr ? french : en;
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"create" | "suggest" | null>(null);
  const [stops, setStops] = useState<PlanStop[]>([]);
  const [loop, setLoop] = useState(true);
  const [target, setTarget] = useState(2000);
  const [revision, setRevision] = useState(0);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const seed = useRef(0);
  const stopsRef = useRef(stops);
  const context = useMemo(() => createPlanningExploration(exploredCellIds, forbiddenZones.flatMap(zone => zone.cellIds)), [exploredCellIds, forbiddenZones]);
  const invalidate = useCallback(() => {
    request.current?.abort(); request.current = null;
    setPlan(null); setBusy(false); setError("");
  }, []);
  const close = useCallback(() => { if (!mutation.current) { invalidate(); onClose(); } }, [invalidate, onClose]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); onMapStateChange(null); };
  }, [onMapStateChange]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => subscription.remove();
  }, [close]);
  const choosePoint = useCallback((point: PlanPoint) => {
    if (!mode || mutation.current) return;
    if (mode === "create" && stopsRef.current.length >= 10) {
      setError(fr ? "10 points maximum. Annulez un point pour le remplacer." : "Maximum 10 points. Undo a point to replace it."); return;
    }
    invalidate();
    const first = mode === "suggest" || !stopsRef.current.length;
    const next = { ...point, label: first ? (fr ? "Départ" : "Start") : `${fr ? "Étape" : "Stop"} ${stopsRef.current.length}` };
    stopsRef.current = mode === "suggest" ? [next] : [...stopsRef.current, next];
    setStops(stopsRef.current);
  }, [mode, fr, invalidate]);
  useEffect(() => { onMapStateChange({ plan, stops, autoFrame: mode === "suggest", onPress: choosePoint }); }, [plan, stops, mode, choosePoint, onMapStateChange]);
  useEffect(() => {
    if (!mode || !stops.length || (mode === "create" && stops.length < 2)) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setPlan(null);
    const timer = setTimeout(() => { void (async () => {
      try {
        if (controller.signal.aborted) return;
        const start = stops[0]!;
        const radius = mode === "suggest" ? Math.min(6500, target * (loop ? 0.55 : 1) + 300)
          : Math.min(6500, Math.max(1200, ...stops.map(stop => haversineDistanceMeters(start, stop) + 800)));
        const { data } = await loadPlanningData(start, radius, controller.signal);
        const graph = await buildPlanningGraph(data, context, controller.signal);
        const result = mode === "suggest" ? await suggestRoute(graph, start, target, loop, context, "discovery", seed.current++, controller.signal)
          : await planThroughStops(graph, stops, loop, context, "discovery", controller.signal);
        if (!controller.signal.aborted && mounted.current && request.current === controller) {
          setPlan({ ...result, name: `${fr ? "Balade" : "Walk"} · ${(result.distanceMeters / 1000).toFixed(2)} km` });
        }
      } catch (failure) {
        if (!controller.signal.aborted && mounted.current && request.current === controller) setError(ERRORS[failure instanceof PlanningError ? failure.code : "unavailable"][fr ? 1 : 0]);
      } finally {
        if (!controller.signal.aborted && mounted.current && request.current === controller) { request.current = null; setBusy(false); }
      }
    })(); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, stops, target, loop, revision, context, fr]);
  const begin = (next: typeof mode) => { invalidate(); stopsRef.current = []; setStops([]); setMode(next); };
  const undo = () => { invalidate(); stopsRef.current = stopsRef.current.slice(0, -1); setStops(stopsRef.current); };
  const retry = () => { invalidate(); setRevision(value => value + 1); };
  const validate = async () => {
    if (!plan || busy || mutation.current) return;
    mutation.current = true; setSaving(true); setError("");
    try { await onFollow(plan); }
    catch { if (mounted.current) setError(t("Could not prepare this walk. Retry validation.", "Impossible de préparer cette balade. Réessayez la validation.")); }
    finally { mutation.current = false; if (mounted.current) setSaving(false); }
  };
  const instruction = !stops.length ? t("Tap the map to choose your starting point.", "Touchez la carte pour choisir votre départ.")
    : mode === "create" ? t("Tap the next point. Validate when your walk looks right.", "Touchez le point suivant. Validez quand le parcours vous convient.")
    : t("Seeking unexplored ground. Tap elsewhere to change the start.", "Cap sur les zones inexplorées. Touchez ailleurs pour changer le départ.");
  return <View pointerEvents="box-none" style={styles.overlay}>
    <View style={[styles.card, styles.top, { top: insets.top + 6 }]}>
      <AtlasHudTexture />
      <View style={styles.row}>
        {mode ? <Action compact icon="chevron-back" label={t("Planning choices", "Choix du parcours")} disabled={saving} onPress={() => begin(null)} /> : null}
        <Text style={[styles.heading, styles.grow]}>{mode === "create" ? t("Create a walk", "Créer une balade") : mode === "suggest" ? t("Suggest a walk", "Suggérer une balade") : t("Plan a walk", "Planifier une balade")}</Text>
        <Action compact icon="close" label={t("Close planner", "Fermer la préparation")} disabled={saving} onPress={close} />
      </View>
      {mode ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{instruction}</Text> : <View style={styles.row}>
        <Action icon="add-outline" label={t("Create", "Créer")} description={t("Choose your own stops", "Choisissez vos étapes")} onPress={() => begin("create")} />
        <Action icon="sparkles-outline" label={t("Suggest", "Suggérer")} description={t("Discover new ground", "Explorez de nouveaux lieux")} onPress={() => begin("suggest")} />
      </View>}
    </View>
    {mode ? <View style={[styles.card, styles.bottom, { bottom: Math.max(insets.bottom, 8) }]}>
      <AtlasHudTexture />
      <View style={styles.row}>
        {mode === "suggest" ? [2000, 4000, 6000].map(distance => <Action key={distance} label={`${distance / 1000} km`} selected={distance === target} disabled={saving} onPress={() => { if (distance !== target) { invalidate(); setTarget(distance); } }} />)
          : <Action icon="arrow-undo-outline" label={t("Undo", "Annuler point")} disabled={saving || !stops.length} onPress={undo} />}
        <Action icon="return-down-back-outline" label={t("Return", "Retour")} selected={loop} disabled={saving} onPress={() => { invalidate(); setLoop(value => !value); }} />
        {mode === "suggest" && stops.length ? <Action compact icon="refresh-outline" label={t("Suggest another walk", "Autre suggestion")} disabled={saving} onPress={retry} /> : null}
      </View>
      {busy ? <View style={styles.row}><ActivityIndicator color={APP_COLORS.gold} /><Text style={[styles.hint, styles.grow]}>{t("Finding a walking route…", "Recherche d’un parcours piéton…")}</Text><Action compact icon="close" label={t("Cancel calculation", "Annuler le calcul")} onPress={() => { invalidate(); setError(ERRORS.cancelled[fr ? 1 : 0]); }} /></View> : null}
      {error ? <View style={styles.row}><Text accessibilityRole="alert" style={[styles.error, styles.grow]}>{error}</Text><Action compact icon="refresh-outline" label={t("Retry", "Réessayer")} disabled={saving || !stops.length || (mode === "create" && stops.length < 2)} onPress={retry} /></View> : null}
      {plan ? <View style={styles.result}>
        <View style={styles.row}><Text style={styles.routeDistance}>{(plan.distanceMeters / 1000).toFixed(2)} km</Text><Text style={styles.hint}>~{plan.durationMinutes} min · ~{plan.estimatedNewCellCount ?? 0} {t("new cells", "nouvelles cellules")}</Text></View>
        <Action primary icon="checkmark-outline" label={saving ? t("Preparing…", "Préparation…") : t("Validate walk", "Valider la balade")} disabled={busy || saving} onPress={() => { void validate(); }} />
      </View> : null}
      {!busy && !plan && !error ? <Text style={styles.hint}>{!stops.length ? t("Choose a start anywhere on the map.", "Choisissez un départ où vous voulez sur la carte.") : t("Now tap your next point.", "Touchez maintenant le point suivant.")}</Text> : null}
      <Text accessibilityRole="link" style={styles.credit} onPress={() => { void Linking.openURL("https://www.openstreetmap.org/copyright").catch(() => undefined); }}>{t("Estimate · recording starts separately", "Estimation · enregistrement séparé")} · © OpenStreetMap</Text>
    </View> : null}
  </View>;
}
const styles = createAppearanceStyles({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  top: { position: "absolute", left: 10, right: 10 }, bottom: { position: "absolute", left: 10, right: 10 },
  card: { backgroundColor: APP_COLORS.card, borderColor: APP_COLORS.goldBorder, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 8, overflow: "hidden" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }, grow: { flex: 1, minWidth: 0 },
  heading: { color: APP_COLORS.parchment, fontFamily: ATLAS_DISPLAY_FONT, fontSize: 16 },
  hint: { color: APP_COLORS.textSecondary, fontSize: 12, lineHeight: 18, flexShrink: 1 }, credit: { color: APP_COLORS.textMuted, fontSize: 10, lineHeight: 15, paddingVertical: 4 },
  action: { minHeight: 44, minWidth: 44, flexDirection: "row", flexShrink: 1, gap: 5, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: APP_COLORS.border, backgroundColor: APP_COLORS.cardRaised },
  actionCopy: { flexShrink: 1, gap: 3 },
  actionText: { color: APP_COLORS.parchment, fontSize: 12, fontWeight: "600", flexShrink: 1 }, selected: { borderColor: APP_COLORS.gold, backgroundColor: APP_COLORS.cardHighlight }, disabled: { opacity: 0.45 },
  choice: { flex: 1, flexBasis: 130, minHeight: 68, justifyContent: "flex-start", paddingHorizontal: 12, gap: 10 },
  choiceDetail: { color: APP_COLORS.textMuted, fontSize: 11, lineHeight: 16 },
  primary: { backgroundColor: APP_COLORS.gold, borderColor: APP_COLORS.gold, minHeight: 46 },
  primaryText: { color: APP_COLORS.inkOnGold, fontWeight: "800", fontSize: 13 },
  result: { borderTopWidth: 1, borderTopColor: APP_COLORS.border, paddingTop: 10, gap: 10 },
  routeDistance: { color: APP_COLORS.parchment, fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  error: { color: APP_COLORS.text, fontSize: 12, lineHeight: 17 }
});
