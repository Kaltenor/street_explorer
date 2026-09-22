export type MapProvider = "apple" | "google";

export function resolveMapProvider(
  saved: unknown,
  platform: string,
  googleAvailable: boolean
): MapProvider {
  if (platform === "android") return "google";
  return saved === "google" && googleAvailable ? "google" : "apple";
}

export function canChangeMapProvider(state: {
  platform: string;
  recording: boolean;
  starting: boolean;
  stopping: boolean;
  recovering: boolean;
}): boolean {
  return state.platform === "ios" && !state.recording && !state.starting &&
    !state.stopping && !state.recovering;
}

// Google supports custom map styles on both mobile platforms. Keep stable arrays
// so unrelated renders do not resend the style to the native map.
export const GOOGLE_DAYLIGHT_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] }
];
export const GOOGLE_EXPLORATOR_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#182532" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b9bdba" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#182532" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#344451" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#101d29" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#081923" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#1c302d" }] },
  ...GOOGLE_DAYLIGHT_STYLE
];
