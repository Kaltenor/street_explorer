import { memo, useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { createAppearanceStyles, isDaylightAppearance, type AppearanceMode } from "../constants/appearance";
import { APP_COLORS, ATLAS_DISPLAY_FONT } from "../constants/theme";
import type { MapProvider } from "../services/mapProvider";
import type { PlanPoint, RoutePlan } from "../services/routePlanning";
import { SolidMapPolyline } from "./SolidMapPolyline";

export const PlannedRouteOverlay = memo(function PlannedRouteOverlay({ plan, mapProvider, appearanceMode, label, showStart = true }: {
  plan: RoutePlan; mapProvider: MapProvider; appearanceMode: AppearanceMode; label: string; showStart?: boolean;
}) {
  const color = isDaylightAppearance(appearanceMode) ? "#245ba8" : "#80b5fa";
  return <>
    <SolidMapPolyline mapProvider={mapProvider} coordinates={plan.coordinates} strokeColor={color} strokeWidth={3} zIndex={7} />
    {showStart ? <PlanningMarker coordinate={plan.coordinates[0]!} title={label} text="◇" appearanceMode={appearanceMode} mapProvider={mapProvider} /> : null}
  </>;
});

export const PlanningMarker = memo(function PlanningMarker({ coordinate, title, text, appearanceMode, mapProvider }: {
  coordinate: PlanPoint; title: string; text: string; appearanceMode: AppearanceMode; mapProvider: MapProvider;
}) {
  const ref = useRef<ComponentRef<typeof Marker>>(null);
  const [laidOut, setLaidOut] = useState(false);
  const shouldTrackSnapshot = Platform.OS === "android" || mapProvider === "google";
  const [tracking, setTracking] = useState(shouldTrackSnapshot);
  useEffect(() => {
    setTracking(shouldTrackSnapshot);
    // MapKit uses live annotation views and exposes no native redraw command.
    if (!shouldTrackSnapshot || !laidOut) return;
    const timer = setTimeout(() => { ref.current?.redraw(); setTracking(false); }, 500);
    return () => clearTimeout(timer);
  }, [laidOut, text, appearanceMode, shouldTrackSnapshot]);
  return <Marker ref={ref} coordinate={coordinate} title={title} accessibilityLabel={title} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} zIndex={8}>
    <View collapsable={false} onLayout={() => setLaidOut(true)} style={styles.marker}>
      <Text style={styles.text}>{text}</Text>
    </View>
  </Marker>;
});
const styles = createAppearanceStyles({
  marker: { minWidth: 30, height: 30, paddingHorizontal: 4, backgroundColor: APP_COLORS.card, borderColor: "#80b5fa", borderWidth: 2, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  text: { fontFamily: ATLAS_DISPLAY_FONT, fontSize: 15, color: APP_COLORS.parchment }
});
