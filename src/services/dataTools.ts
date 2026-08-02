import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { APP_VERSION } from "../constants/config";
import { getActiveRecordingSettings } from "../database/settingsRepository";
import {
  restoreBackupV5Data,
  StreetExplorerBackup,
  validateLegacyBackupV4,
  withBackupV5Snapshot
} from "../database/walkRepository";
import { BACKUP_V5_EXTENSION, BackupV5Manifest } from "./backupV5";
import {
  inspectBackupV5File,
  readBackupV5Blocks,
  writeBackupV5Snapshot,
  writeLegacyV4AsBackupV5
} from "./backupV5File";
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

export type BackupExportStage = "prepare" | "share" | "verify" | "write";

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

export type BackupV5OperationResult = {
  archiveBlockCount: number;
  fileSize: number;
  hotSessionCount: number;
  pointCount: number;
  sessionCount: number;
};

export async function exportBackupV5(): Promise<BackupV5OperationResult> {
  try {
    await prepareBackupExport();
  } catch (error) {
    throw new BackupExportError("prepare", error);
  }

  const file = createBackupV5CacheFile();
  let manifest: BackupV5Manifest;

  try {
    manifest = await withBackupV5Snapshot((source) =>
      writeBackupV5Snapshot(file, source)
    );
  } catch (error) {
    throw new BackupExportError("write", error);
  }

  await shareBackupV5File(file);
  const verified = await verifyExternallySavedBackup(manifest.backupId);
  return toBackupV5OperationResult(verified.manifest, verified.fileSize);
}

export async function convertLegacyV4BackupToV5(): Promise<
  BackupV5OperationResult | null
> {
  const selected = await pickBackupFile("application/json");

  if (!selected) {
    return null;
  }

  let legacy: StreetExplorerBackup;

  try {
    legacy = parseLegacyV4Backup(await selected.text());
  } catch (error) {
    throw new BackupExportError("prepare", error);
  }

  const file = createBackupV5CacheFile();
  let manifest: BackupV5Manifest;

  try {
    manifest = await writeLegacyV4AsBackupV5(file, legacy, APP_VERSION);
  } catch (error) {
    throw new BackupExportError("write", error);
  }

  await shareBackupV5File(file);
  const verified = await verifyExternallySavedBackup(manifest.backupId);
  return toBackupV5OperationResult(verified.manifest, verified.fileSize);
}

export async function importBackupV5() {
  const file = await pickBackupFile("*/*");

  if (!file) {
    return false;
  }

  const inspection = await inspectBackupV5File(file);
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
    await restoreBackupV5Data(
      inspection.manifest,
      readBackupV5Blocks(file, inspection.manifest)
    );
    clearBackgroundLocationSessionHint();
    await discardPendingBackgroundLocationBatches();
  } finally {
    reopenGpsAdmission?.();
    reopenOutboxAdmission();
  }

  return true;
}

async function prepareBackupExport() {
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
}

function createBackupV5CacheFile() {
  return new File(
    Paths.cache,
    `street-explorer-backup-${formatFileTimestamp()}.${BACKUP_V5_EXTENSION}`
  );
}

async function shareBackupV5File(file: File) {
  try {
    await shareFile(file.uri, {
      dialogTitle: "Export Street Explorer V5 backup",
      mimeType: "application/octet-stream",
      UTI: "public.data"
    });
  } catch (error) {
    throw new BackupExportError("share", error);
  }
}

async function verifyExternallySavedBackup(expectedBackupId: string) {
  try {
    const selected = await pickBackupFile("*/*");

    if (!selected) {
      throw new Error(
        "Verification is required. Save the backup in Files, then select that saved file."
      );
    }

    return await inspectBackupV5File(selected, expectedBackupId);
  } catch (error) {
    throw new BackupExportError("verify", error);
  }
}

async function pickBackupFile(type: string) {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type
  });

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  return new File(result.assets[0].uri);
}

function parseLegacyV4Backup(rawJson: string): StreetExplorerBackup {
  const parsed = JSON.parse(rawJson) as Partial<StreetExplorerBackup> & {
    version?: number;
  };

  if (
    parsed.version !== 4 ||
    !Array.isArray(parsed.sessions) ||
    !Array.isArray(parsed.points) ||
    !Array.isArray(parsed.routeSnapshots) ||
    !Array.isArray(parsed.zoneAchievements) ||
    !parsed.medalSystem ||
    !Array.isArray(parsed.medalSystem.acquisitionEvents) ||
    !Array.isArray(parsed.medalSystem.collectedMedals) ||
    !Array.isArray(parsed.medalSystem.retroScanSettings)
  ) {
    throw new Error(
      "The temporary converter accepts complete Street Explorer V4 JSON backups only."
    );
  }

  const backup: StreetExplorerBackup = {
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    medalSystem: parsed.medalSystem,
    points: parsed.points,
    routeSnapshots: parsed.routeSnapshots,
    sessions: parsed.sessions,
    version: 4,
    zoneAchievements: parsed.zoneAchievements
  };
  validateLegacyBackupV4(backup);
  return backup;
}

function toBackupV5OperationResult(
  manifest: BackupV5Manifest,
  fileSize: number
): BackupV5OperationResult {
  return {
    archiveBlockCount: manifest.totals.archiveBlockCount,
    fileSize,
    hotSessionCount: manifest.totals.hotSessionCount,
    pointCount: manifest.totals.pointCount,
    sessionCount: manifest.totals.sessionCount
  };
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
