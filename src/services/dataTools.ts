import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { strToU8, Zip, ZipDeflate } from "fflate";

import { getActiveRecordingSettings } from "../database/settingsRepository";
import {
  getGpsPointsForSession,
  getWalkHistory,
  restoreBackupV5Data,
  withBackupV5Snapshot
} from "../database/walkRepository";
import { BACKUP_V5_EXTENSION, BackupV5Manifest } from "./backupV5";
import {
  BackupV5Inspection,
  inspectBackupV5File,
  readBackupV5Blocks,
  writeBackupV5Snapshot
} from "./backupV5File";
import { buildBulkGpxFilename, buildGpx } from "./gpxExport";
import type { GpsPoint, WalkSession } from "../types/walk";
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

export type BackupV5RestorePreview = {
  appVersion: string;
  expeditionSealCount: number;
  exportedAt: string;
  fileSize: number;
  medalCount: number;
  pointCount: number;
  sessionCount: number;
  zoneAchievementCount: number;
};

export type BackupV5RestoreCandidate = {
  file: File;
  inspection: BackupV5Inspection;
  preview: BackupV5RestorePreview;
};

export type BulkGpxExportResult = {
  fileSize: number;
  pointCount: number;
  walkCount: number;
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

export async function exportAllWalksGpx(): Promise<BulkGpxExportResult> {
  await prepareBackupExport();
  const walks = await getWalkHistory("walk");

  if (walks.length === 0) {
    throw new Error("There are no finalized walks to export.");
  }

  const file = new File(
    Paths.cache,
    `street-explorer-gpx-${formatFileTimestamp()}.zip`
  );
  file.create({ overwrite: true });
  const handle = file.open();
  let archiveError: Error | null = null;
  let finalized = false;
  let pointCount = 0;

  try {
    const archive = new Zip((error, chunk, final) => {
      if (error) {
        archiveError = error;
        return;
      }

      try {
        handle.writeBytes(chunk);
        finalized = final;
      } catch (writeError) {
        archiveError = toError(writeError);
      }
    });

    for (const walk of walks) {
      const points = await getGpsPointsForSession(walk.id);
      pointCount += points.length;
      const entry = new ZipDeflate(buildBulkGpxFilename(walk), { level: 6 });
      archive.add(entry);
      entry.push(strToU8(buildGpx(walk, points)), true);

      if (archiveError) {
        throw archiveError;
      }
    }

    archive.end();

    if (archiveError) {
      throw archiveError;
    }

    if (!finalized) {
      throw new Error("The GPX ZIP archive did not finish writing.");
    }
  } finally {
    handle.close();
  }

  if (!file.exists || file.size <= 0) {
    throw new Error("The GPX ZIP archive was empty.");
  }

  await shareFile(file.uri, {
    dialogTitle: "Export all Street Explorer GPX files",
    mimeType: "application/zip",
    UTI: "public.zip-archive"
  });

  return {
    fileSize: file.size,
    pointCount,
    walkCount: walks.length
  };
}

export async function selectBackupV5ForRestore(): Promise<
  BackupV5RestoreCandidate | null
> {
  const file = await pickBackupFile("*/*");

  if (!file) {
    return null;
  }

  const inspection = await inspectBackupV5File(file);
  const { manifest } = inspection;

  return {
    file,
    inspection,
    preview: {
      appVersion: manifest.appVersion,
      expeditionSealCount: manifest.expeditionSystem?.seals.length ?? 0,
      exportedAt: manifest.exportedAt,
      fileSize: inspection.fileSize,
      medalCount: manifest.medalSystem.collectedMedals.length,
      pointCount: manifest.totals.pointCount,
      sessionCount: manifest.totals.sessionCount,
      zoneAchievementCount: manifest.zoneAchievements.length
    }
  };
}

export async function restoreBackupV5(candidate: BackupV5RestoreCandidate) {
  const inspection = await inspectBackupV5File(
    candidate.file,
    candidate.inspection.manifest.backupId
  );
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
      readBackupV5Blocks(candidate.file, inspection.manifest)
    );
    clearBackgroundLocationSessionHint();
    await discardPendingBackgroundLocationBatches();
  } finally {
    reopenGpsAdmission?.();
    reopenOutboxAdmission();
  }
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

function formatFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
