import { createLivePalette } from "./appearance";

type AppColorPalette = {
  background: string;
  border: string;
  borderStrong: string;
  card: string;
  cardHighlight: string;
  cardRaised: string;
  gold: string;
  goldBorder: string;
  inkOnGold: string;
  parchment: string;
  parchmentMuted: string;
  text: string;
  textMuted: string;
  textSecondary: string;
};

type WalkingColorPalette = {
  activeRoute: string;
  cityBoundary: string;
  cityBoundaryMuted: string;
  dimmedRoute: string;
  districtBoundary: string;
  districtBoundaryMuted: string;
  exploredArea: string;
  inferredRoute: string;
  savedRoutes: [string, string, string, string, string, string];
  selectedRoute: string;
  selectedZoneFill: string;
  todayArea: string;
};

type GpsStatusPalette = Record<
  "acquiring" | "denied" | "good" | "unavailable" | "weak-stale",
  string
>;

const EXPLORATOR_APP_COLORS: AppColorPalette = {
  background: "#071018",
  card: "#0c151c",
  cardRaised: "#13212b",
  cardHighlight: "#182630",
  gold: "#f5c451",
  inkOnGold: "#151006",
  parchment: "#f3e5bd",
  parchmentMuted: "#cdbf9e",
  text: "#f8fafc",
  textMuted: "#94a3b8",
  textSecondary: "#cbd5e1",
  border: "rgba(148, 163, 184, 0.24)",
  borderStrong: "rgba(148, 163, 184, 0.34)",
  goldBorder: "rgba(245, 196, 81, 0.22)"
};

const DAYLIGHT_APP_COLORS: AppColorPalette = {
  background: "#f4efe3",
  card: "#fffaf0",
  cardRaised: "#eee3cf",
  cardHighlight: "#e3d5ba",
  gold: "#8a5300",
  inkOnGold: "#fffaf0",
  parchment: "#241a0d",
  parchmentMuted: "#594a37",
  text: "#1f2933",
  textMuted: "#526171",
  textSecondary: "#354454",
  border: "rgba(69, 55, 38, 0.28)",
  borderStrong: "rgba(69, 55, 38, 0.42)",
  goldBorder: "rgba(138, 83, 0, 0.38)"
};

export const APP_COLORS = createLivePalette(
  EXPLORATOR_APP_COLORS,
  DAYLIGHT_APP_COLORS
);

export const ATLAS_DISPLAY_FONT = "Cinzel";

const EXPLORATOR_WALKING_COLORS: WalkingColorPalette = {
  activeRoute: "#f5c451",
  selectedRoute: "#f3e5bd",
  cityBoundary: "#8d5268",
  cityBoundaryMuted: "rgba(141, 82, 104, 0.7)",
  districtBoundary: "#c28a45",
  districtBoundaryMuted: "rgba(194, 138, 69, 0.64)",
  selectedZoneFill: "rgba(242, 217, 166, 0.12)",
  savedRoutes: [
    "#67c8c2",
    "#4fa3a0",
    "#789a9c",
    "#8c8297",
    "#9b8d75",
    "#6e8e84"
  ],
  inferredRoute: "rgba(103, 232, 223, 0.78)",
  dimmedRoute: "rgba(86, 111, 115, 0.34)",
  exploredArea: "rgba(229, 122, 50, 0.46)",
  todayArea: "rgba(245, 196, 81, 0.46)"
};

const DAYLIGHT_WALKING_COLORS: WalkingColorPalette = {
  activeRoute: "#805000",
  selectedRoute: "#4b2d00",
  cityBoundary: "#7b2448",
  cityBoundaryMuted: "rgba(123, 36, 72, 0.76)",
  districtBoundary: "#895000",
  districtBoundaryMuted: "rgba(137, 80, 0, 0.72)",
  selectedZoneFill: "rgba(187, 116, 16, 0.16)",
  savedRoutes: [
    "#006c70",
    "#197074",
    "#3e626c",
    "#67536d",
    "#735b33",
    "#3f685a"
  ],
  inferredRoute: "rgba(0, 105, 110, 0.86)",
  dimmedRoute: "rgba(55, 70, 75, 0.42)",
  exploredArea: "rgba(207, 79, 18, 0.48)",
  todayArea: "rgba(168, 101, 0, 0.48)"
};

export const WALKING_COLORS = createLivePalette(
  EXPLORATOR_WALKING_COLORS,
  DAYLIGHT_WALKING_COLORS
);

const EXPLORATOR_GPS_STATUS_COLORS: GpsStatusPalette = {
  acquiring: "#38bdf8",
  good: "#22c55e",
  "weak-stale": "#fb923c",
  denied: "#ef4444",
  unavailable: "#94a3b8"
};

const DAYLIGHT_GPS_STATUS_COLORS: GpsStatusPalette = {
  acquiring: "#0369a1",
  good: "#16783a",
  "weak-stale": "#a84605",
  denied: "#b42318",
  unavailable: "#526171"
};

export const GPS_STATUS_COLORS = createLivePalette(
  EXPLORATOR_GPS_STATUS_COLORS,
  DAYLIGHT_GPS_STATUS_COLORS
);
