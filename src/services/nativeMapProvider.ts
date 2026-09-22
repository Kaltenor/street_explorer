import { Platform, UIManager } from "react-native";

export function isGoogleMapsAvailable(): boolean {
  if (Platform.OS === "android") return true;
  if (Platform.OS !== "ios") return false;
  try {
    return Boolean(UIManager.hasViewManagerConfig("AIRGoogleMap"));
  } catch {
    return false;
  }
}
