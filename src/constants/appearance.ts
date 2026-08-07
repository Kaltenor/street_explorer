import { StyleSheet } from "react-native";

export type AppearanceMode = "explorator" | "daylight" | "custom";

export const APPEARANCE_MODES: AppearanceMode[] = [
  "explorator",
  "daylight",
  "custom"
];

let activeAppearanceMode: AppearanceMode = "explorator";

export function setActiveAppearanceMode(mode: AppearanceMode) {
  activeAppearanceMode = mode;
}

export function getActiveAppearanceMode() {
  return activeAppearanceMode;
}

export function isDaylightAppearance(mode = activeAppearanceMode) {
  return mode === "daylight";
}

export function createLivePalette<T extends object>(explorator: T, daylight: T): T {
  return new Proxy(explorator, {
    get(target, property, receiver) {
      const palette = isDaylightAppearance() ? daylight : target;
      return Reflect.get(palette, property, receiver);
    }
  });
}

const COMMON_DAYLIGHT_COLORS: Record<string, string> = {
  "#02060a": "#eee6d7",
  "#030a0f": "#f4efe3",
  "#071018": "#f4efe3",
  "#09131b": "#fffaf0",
  "#0c151c": "#fffaf0",
  "#13212b": "#eee3cf",
  "#151006": "#fffaf0",
  "#182630": "#e3d5ba",
  "#2a2015": "#fffaf0",
  "#2a3c49": "#e1d6c2",
  "#35291b": "#eadfc9",
  "#3f301c": "#e5d7bb",
  "#46565a": "#526171",
  "#202c35": "#e5dccb",
  "#052e25": "#d1fae5",
  "#67c8c2": "#006c70",
  "#4fa3a0": "#197074",
  "#789a9c": "#3e626c",
  "#8c8297": "#67536d",
  "#9b8d75": "#735b33",
  "#6e8e84": "#3f685a",
  "#8d5268": "#7b2448",
  "#c28a45": "#895000",
  "#38bdf8": "#0369a1",
  "#22c55e": "#16783a",
  "#fb923c": "#a84605",
  "#ef4444": "#b42318",
  "#64748b": "#526171",
  "#94a3b8": "#526171",
  "#b7c3cc": "#455566",
  "#cbd5e1": "#354454",
  "#cdbf9e": "#594a37",
  "#d9d0bc": "#594a37",
  "#f3e5bd": "#241a0d",
  "#f5c451": "#8a5300",
  "#f8fafc": "#1f2933",
  "#ffffff": "#fffaf0",
  "#fff7d6": "#241a0d"
};

export function toDaylightColor(value: string) {
  const normalized = value.toLowerCase();
  const common = COMMON_DAYLIGHT_COLORS[normalized];
  if (common) return common;

  const hex = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (hex) {
    const red = Number.parseInt(hex[1]!, 16);
    const green = Number.parseInt(hex[2]!, 16);
    const blue = Number.parseInt(hex[3]!, 16);
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);

    if (maximum <= 70) return "#eee3cf";
    if (minimum >= 130 && maximum - minimum <= 30) return "#354454";
    return value;
  }

  const rgba = normalized.match(
    /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/
  );
  if (!rgba) return value;

  const red = Number(rgba[1]);
  const green = Number(rgba[2]);
  const blue = Number(rgba[3]);
  const alpha = Number(rgba[4]);
  const maximum = Math.max(red, green, blue);

  if (red > 200 && green > 150 && blue < 130) {
    return "rgba(138, 83, 0, " + Math.min(0.62, alpha + 0.08) + ")";
  }
  if (maximum <= 55) {
    return "rgba(255, 250, 240, " + Math.max(0.9, alpha) + ")";
  }
  if (Math.min(red, green, blue) >= 130) {
    return "rgba(53, 68, 84, " + Math.min(0.56, alpha + 0.08) + ")";
  }

  return value;
}

function transformDaylightValue(value: unknown): unknown {
  if (typeof value === "string") return toDaylightColor(value);
  if (Array.isArray(value)) return value.map(transformDaylightValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        transformDaylightValue(nestedValue)
      ])
    );
  }
  return value;
}

export function createAppearanceStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>
>(styles: T & StyleSheet.NamedStyles<any>): T {
  const exploratorStyles = StyleSheet.create(styles);
  const daylightStyles = StyleSheet.create(
    transformDaylightValue(styles) as T & StyleSheet.NamedStyles<any>
  );

  return new Proxy({} as T, {
    get(_target, property, receiver) {
      const source = isDaylightAppearance() ? daylightStyles : exploratorStyles;
      return Reflect.get(source, property, receiver);
    }
  }) as T;
}

