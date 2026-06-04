import { BackgroundTrackingStatus } from "../components/RecordingHealthPanel";
import { ActiveWalk, GpsPoint } from "../types/walk";

export type RecordingQuality = {
  label: "Good" | "OK" | "Poor";
  reason: string;
  score: number;
};

export function calculateRecordingQuality({
  activeWalk,
  backgroundStatus,
  currentLocation,
  elapsedSeconds
}: {
  activeWalk: ActiveWalk | null;
  backgroundStatus: BackgroundTrackingStatus;
  currentLocation: GpsPoint | null;
  elapsedSeconds: number;
}): RecordingQuality {
  if (!activeWalk) {
    return {
      label: "OK",
      reason: "No active recording.",
      score: 70
    };
  }

  let score = 100;
  const reasons: string[] = [];
  const totalGps = activeWalk.acceptedGpsPointCount + activeWalk.rejectedGpsPointCount;
  const rejectedRatio = totalGps > 0 ? activeWalk.rejectedGpsPointCount / totalGps : 0;
  const acceptedPerMinute =
    elapsedSeconds > 0 ? activeWalk.acceptedGpsPointCount / (elapsedSeconds / 60) : 0;

  if (typeof currentLocation?.accuracy === "number") {
    if (currentLocation.accuracy > 60) {
      score -= 35;
      reasons.push("weak GPS accuracy");
    } else if (currentLocation.accuracy > 30) {
      score -= 15;
      reasons.push("GPS accuracy is only fair");
    }
  } else {
    score -= 10;
    reasons.push("GPS accuracy unknown");
  }

  if (rejectedRatio > 0.4) {
    score -= 35;
    reasons.push("many GPS points rejected");
  } else if (rejectedRatio > 0.15) {
    score -= 15;
    reasons.push("some GPS points rejected");
  }

  if (elapsedSeconds > 60 && acceptedPerMinute < 2) {
    score -= 25;
    reasons.push("GPS updates are sparse");
  } else if (elapsedSeconds > 60 && acceptedPerMinute < 4) {
    score -= 10;
    reasons.push("GPS updates are slow");
  }

  if (backgroundStatus === "unavailable") {
    score -= 15;
    reasons.push("background tracking unavailable");
  } else if (backgroundStatus === "foreground-only") {
    score -= 8;
    reasons.push("foreground-only recording");
  }

  const boundedScore = Math.max(0, Math.min(100, score));

  return {
    label: boundedScore >= 80 ? "Good" : boundedScore >= 55 ? "OK" : "Poor",
    reason: reasons[0] ?? "GPS, steps, and background recording look healthy.",
    score: boundedScore
  };
}
