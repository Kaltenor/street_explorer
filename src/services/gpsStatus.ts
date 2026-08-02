import type { LocationPermissionState } from "./locationService";

export type GpsUiState =
  | "acquiring"
  | "good"
  | "weak-stale"
  | "denied"
  | "unavailable";

export type GpsUiReason =
  | "permission-pending"
  | "fix-pending"
  | "good-fix"
  | "weak-accuracy"
  | "stale-fix"
  | "permission-denied"
  | "no-fix"
  | "invalid-fix";

export type GpsUiStatus = {
  ageSeconds: number | null;
  state: GpsUiState;
  reason: GpsUiReason;
};

export const GPS_UI_THRESHOLDS = {
  goodAccuracyMeters: 25,
  idleStaleAfterMs: 20_000,
  recordingStaleAfterMs: 12_000,
  futureTimestampToleranceMs: 5_000
} as const;

export function classifyGpsUiStatus({
  accuracyMeters,
  fixTimestamp,
  isRecording,
  locationResolved,
  nowMs = Date.now(),
  permissionState
}: {
  accuracyMeters: number | null | undefined;
  fixTimestamp: string | null | undefined;
  isRecording: boolean;
  locationResolved: boolean;
  nowMs?: number;
  permissionState: LocationPermissionState;
}): GpsUiStatus {
  if (permissionState === "denied") {
    return { ageSeconds: null, reason: "permission-denied", state: "denied" };
  }

  if (permissionState === "unknown") {
    return { ageSeconds: null, reason: "permission-pending", state: "acquiring" };
  }

  if (!fixTimestamp) {
    return locationResolved
      ? { ageSeconds: null, reason: "no-fix", state: "unavailable" }
      : { ageSeconds: null, reason: "fix-pending", state: "acquiring" };
  }

  const timestampMs = new Date(fixTimestamp).getTime();

  if (
    !Number.isFinite(timestampMs) ||
    timestampMs > nowMs + GPS_UI_THRESHOLDS.futureTimestampToleranceMs
  ) {
    return { ageSeconds: null, reason: "invalid-fix", state: "unavailable" };
  }

  const ageMs = Math.max(0, nowMs - timestampMs);
  const ageSeconds = Math.round(ageMs / 1000);
  const staleAfterMs = isRecording
    ? GPS_UI_THRESHOLDS.recordingStaleAfterMs
    : GPS_UI_THRESHOLDS.idleStaleAfterMs;

  if (ageMs > staleAfterMs) {
    return { ageSeconds, reason: "stale-fix", state: "weak-stale" };
  }

  if (
    typeof accuracyMeters !== "number" ||
    !Number.isFinite(accuracyMeters) ||
    accuracyMeters < 0 ||
    accuracyMeters > GPS_UI_THRESHOLDS.goodAccuracyMeters
  ) {
    return { ageSeconds, reason: "weak-accuracy", state: "weak-stale" };
  }

  return { ageSeconds, reason: "good-fix", state: "good" };
}
