export const APP_COLORS = {
  background: "#071018",
  card: "#0c151c",
  cardRaised: "#13212b",
  cardHighlight: "#182630",
  gold: "#f5c451",
  inkOnGold: "#151006",
  text: "#f8fafc",
  textMuted: "#94a3b8",
  textSecondary: "#cbd5e1",
  border: "rgba(148, 163, 184, 0.24)",
  borderStrong: "rgba(148, 163, 184, 0.34)",
  goldBorder: "rgba(245, 196, 81, 0.28)"
} as const;

export const WALKING_COLORS = {
  activeRoute: "#22c55e",
  selectedRoute: "#f5c451",
  savedRoutes: [
    "#38bdf8",
    "#2dd4bf",
    "#a78bfa",
    "#fb923c",
    "#f472b6",
    "#84cc16"
  ],
  inferredRoute: "rgba(34, 211, 238, 0.78)",
  dimmedRoute: "rgba(100, 116, 139, 0.35)",
  exploredArea: "rgba(239, 68, 68, 0.46)",
  todayArea: "rgba(251, 146, 60, 0.42)"
} as const;

export const GPS_STATUS_COLORS = {
  acquiring: "#38bdf8",
  good: "#22c55e",
  "weak-stale": "#fb923c",
  denied: "#ef4444",
  unavailable: "#94a3b8"
} as const;
