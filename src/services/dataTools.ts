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

export type BackupExportStage = "prepare" | "write" | "share";

export class BackupExportError extends Error {
  readonly detail: string;
  readonly stage: BackupExportStage;

  constructor(stage: BackupExportStage, error: unknown) {
    const detail = getErrorMessage(error);
    super(`Backup export failed during ${stage}: ${detail}`);
    this.name = "BackupExportError";
    this.detail = detail;
    this.stage = stage;
  }
}

export async function exportBackupJson() {
  let backup: StreetExplorerBackup;

  try {
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

    backup = await getBackupData();
  } catch (error) {
    throw new BackupExportError("prepare", error);
  }

  const file = new File(
    Paths.cache,
    `street-explorer-backup-${formatFileTimestamp()}.json`
  );

  try {
    await writeBackupJson(file, backup);

    if (!file.exists || file.size <= 0) {
      throw new Error("The backup file was empty or could not be verified.");
    }
  } catch (error) {
    throw new BackupExportError("write", error);
  }

  try {
    await shareFile(file.uri, {
      dialogTitle: "Export Street Explorer backup",
      mimeType: "application/json",
      UTI: "public.json"
    });
  } catch (error) {
    throw new BackupExportError("share", error);
  }

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

async function writeBackupJson(file: File, backup: StreetExplorerBackup) {
  file.create({ overwrite: true });
  const writer = file.writableStream().getWriter();
  const encoder = new TextEncoder();
  const writeText = (text: string) => writer.write(encoder.encode(text));
  const writeArray = async (values: readonly unknown[]) => {
    await writeText("[");

    for (let index = 0; index < values.length; index += 1) {
      if (index > 0) {
        await writeText(",");
      }

      await writeText(JSON.stringify(values[index]));
    }

    await writeText("]");
  };

  try {
    await writeText(`{"exportedAt":${JSON.stringify(backup.exportedAt)},"medalSystem":{"acquisitionEvents":`);
    await writeArray(backup.medalSystem.acquisitionEvents);
    await writeText(',"collectedMedals":');
    await writeArray(backup.medalSystem.collectedMedals);
    await writeText(',"retroScanSettings":');
    await writeArray(backup.medalSystem.retroScanSettings);
    await writeText('},"points":');
    await writeArray(backup.points);
    await writeText(',"routeSnapshots":');
    await writeArray(backup.routeSnapshots);
    await writeText(',"sessions":');
    await writeArray(backup.sessions);
    await writeText(',"zoneAchievements":');
    await writeArray(backup.zoneAchievements);
    await writeText(`,"version":${backup.version}}`);
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    throw error;
  }
}

async function shareFile(
  fileUri: string,
  options?: {
    dialogTitle?: string;
    mimeType?: string;
    UTI?: string;
  }
) {
  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    throw new Error("File sharing is unavailable on this device.");
  }

  await Sharing.shareAsync(fileUri, options);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4) ||
    !Array.isArray(parsed.sessions) ||
    !Array.isArray(parsed.points)
  ) {
    throw new Error("This file is not a valid Street Explorer backup.");
  }

  return {
    medalSystem:
      parsed.version >= 3 &&
      parsed.medalSystem &&
      Array.isArray(parsed.medalSystem.acquisitionEvents) &&
      Array.isArray(parsed.medalSystem.collectedMedals) &&
      Array.isArray(parsed.medalSystem.retroScanSettings)
        ? parsed.medalSystem
        : {
            acquisitionEvents: [],
            collectedMedals: [],
            retroScanSettings: []
          },
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    points: deduplicateBackupPoints(parsed.points),
    routeSnapshots:
      parsed.version >= 2 && Array.isArray(parsed.routeSnapshots)
        ? parsed.routeSnapshots
        : [],
    sessions: parsed.sessions,
    zoneAchievements:
      parsed.version >= 4 && Array.isArray(parsed.zoneAchievements)
        ? parsed.zoneAchievements
        : [],
    version: 4
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
