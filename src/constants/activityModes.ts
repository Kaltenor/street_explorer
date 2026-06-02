import { ActivityMode } from "../types/walk";

export const ACTIVITY_MODE_LABELS: Record<ActivityMode, string> = {
  walk: "Walk",
  wheel: "Wheel",
  car: "Car"
};

export const ACTIVITY_MODE_DESCRIPTIONS: Record<ActivityMode, string> = {
  walk: "Explore on foot",
  wheel: "Explore by EUC",
  car: "Explore by car"
};

export const ACTIVITY_MODE_RECORDING_NOUNS: Record<ActivityMode, string> = {
  walk: "Walk",
  wheel: "Ride",
  car: "Drive"
};
