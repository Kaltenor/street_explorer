export const APP_COLORS = {
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
  goldBorder: "rgba(245, 196, 81, 0.28)"
} as const;

export const WALKING_COLORS = {
  activeRoute: "#f5c451",
  selectedRoute: "#f3e5bd",
  cityBoundary: "#dc2626",
  districtBoundary: "#b45309",
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
  exploredArea: "rgba(251, 146, 60, 0.46)",
  todayArea: "rgba(245, 196, 81, 0.46)"
} as const;

export const GPS_STATUS_COLORS = {
  acquiring: "#38bdf8",
  good: "#22c55e",
  "weak-stale": "#fb923c",
  denied: "#ef4444",
  unavailable: "#94a3b8"
} as const;
