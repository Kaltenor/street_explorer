import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { getActiveRecordingSettings } from "../database/settingsRepository";
import {
  getBackupData,
  restoreBackupData,
  StreetExplorerBackup
} from "../database/walkRepository";
import { GpsPoint, WalkSession } from "../types/walk";
import {
  closeBackgroundLocationOutboxAdmission,
  discardPendingBackgroundLocationBatches,
  drainPendingBackgroundLocationBatches
} from "./backgroundLocationOutbox";
import {
  clearBackgroundLocationSessionHint,
  stopBackgroundLocationTracking
} from "./backgroundLocationTask";
import {
  closeGpsPersistenceAdmission,
  discardAllGpsPersistenceForDataReplacement
} from "./walkRecorder";

export async function exportWalkGpx(walk: WalkSession, points: GpsPoint[]) {
  const file = new File(Paths.document, `street-explorer-${walk.id}.gpx`);

  file.write(buildGpx(walk, points));
  await shareFile(file.uri);

  return file.uri;
}

export async function exportBackupJson() {
  if (await getActiveRecordingSettings()) {
    throw new Error(
      "Finish or discard the active recording before exporting a backup."
    );
  }

  await drainPendingBackgroundLocationBatches();

  if (await getActiveRecordingSettings()) {
    throw new Error(
      "A recording started while the backup was being prepared."
    );
  }

  const backup = await getBackupData();
  const file = new File(Paths.document, `street-explorer-backup-${formatFileTimestamp()}.json`);

  file.write(JSON.stringify(backup, null, 2));
  await shareFile(file.uri);

  return file.uri;
}

export async function importBackupJson() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: "application/json"
  });

  if (result.canceled || !result.assets[0]) {
    return false;
  }

  const rawJson = await new File(result.assets[0].uri).text();
  const backup = parseBackup(rawJson);

  const activeRecording = await getActiveRecordingSettings();

  if (activeRecording) {
    throw new Error(
      "Finish or discard the recoverable recording before restoring a backup."
    );
  }

  const reopenOutboxAdmission = closeBackgroundLocationOutboxAdmission();
  let reopenGpsAdmission: (() => void) | null = null;

  try {
    await stopBackgroundLocationTracking();
    reopenGpsAdmission = closeGpsPersistenceAdmission();
    await discardAllGpsPersistenceForDataReplacement();
    await restoreBackupData(backup);
    clearBackgroundLocationSessionHint();
    await discardPendingBackgroundLocationBatches();
  } finally {
    reopenGpsAdmission?.();
    reopenOutboxAdmission();
  }

  return true;
}

async function shareFile(fileUri: string) {
  const canShare = await Sharing.isAvailableAsync();

  if (canShare) {
    await Sharing.shareAsync(fileUri);
  }
}

function buildGpx(walk: WalkSession, points: GpsPoint[]) {
  const trackName = escapeXml(walk.displayName || `Street Explorer ${walk.id}`);
  const trackPoints = points
    .map(
      (point) => `      <trkpt lat="${point.latitude}" lon="${point.longitude}">
        <time>${escapeXml(point.timestamp)}</time>
      </trkpt>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Street Explorer" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trackName}</name>
    <time>${escapeXml(walk.startedAt)}</time>
  </metadata>
  <trk>
    <name>${trackName}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function parseBackup(rawJson: string): StreetExplorerBackup {
  const parsed = JSON.parse(rawJson) as Omit<Partial<StreetExplorerBackup>, "version"> & { version?: number };

  if (
    (parsed.version !== 1 && parsed.version !== 2) ||
    !Array.isArray(parsed.sessions) ||
    !Array.isArray(parsed.points)
  ) {
    throw new Error("This file is not a valid Street Explorer backup.");
  }

  return {
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    points: deduplicateBackupPoints(parsed.points),
    routeSnapshots:
      parsed.version === 2 && Array.isArray(parsed.routeSnapshots)
        ? parsed.routeSnapshots
        : [],
    sessions: parsed.sessions,
    version: 2
  };
}

function deduplicateBackupPoints(points: GpsPoint[]) {
  const seen = new Set<string>();

  return points.filter((point) => {
    const key = `${point.sessionId ?? "missing"}:${point.timestamp}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
