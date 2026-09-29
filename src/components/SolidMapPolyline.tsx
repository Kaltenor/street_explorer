import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { Polyline } from "react-native-maps";
import type { MapProvider } from "../services/mapProvider";

/** Solid lines need an explicit style span in the installed iOS Google bridge. */
export function SolidMapPolyline({
  mapProvider,
  strokeColor = "#000",
  ...props
}: ComponentProps<typeof Polyline> & { mapProvider: MapProvider }) {
  return (
    <Polyline
      {...props}
      strokeColor={strokeColor}
      // AIRGoogleMapPolyline.setFillColor updates the span that overrides strokeColor.
      fillColor={Platform.OS === "ios" && mapProvider === "google" ? strokeColor : undefined}
    />
  );
}
