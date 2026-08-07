import { File } from "expo-file-system";

import type { BackupV5SnapshotSource } from "../database/walkRepository";
import {
  assertBackupV5Footer,
  assertBackupV5Manifest,
  BACKUP_V5_MAGIC,
  BACKUP_V5_RECORD_HEADER_BYTES,
  BACKUP_V5_RECORD_KIND,
  BackupV5BlockPlan,
  BackupV5Footer,
  BackupV5Manifest,
  BackupV5Metadata,
  BackupV5SessionData,
  createBackupV5BlockPayload,
  createBackupV5Manifest,
  decodeBackupV5BlockPayload,
  decodeBackupV5RecordHeader,
  decodeBackupV5RecordPayload,
  encodeBackupV5Record
} from "./backupV5";

type BackupV5Source = {
  loadSessions: (sessionIds: readonly number[]) => Promise<BackupV5SessionData[]>;
  metadata: BackupV5Metadata;
};

export type BackupV5Inspection = {
  fileSize: number;
  manifest: BackupV5Manifest;
};

export async function writeBackupV5Snapshot(
  file: File,
  source: BackupV5SnapshotSource
) {
  return writeBackupV5Archive(file, source);
}

export async function inspectBackupV5File(
  file: File,
  expectedBackupId?: string
): Promise<BackupV5Inspection> {
  const handle = file.open();

  try {
    assertMagic(readExact(handle, BACKUP_V5_MAGIC.length));
    const manifestRecord = readRecord(handle, BACKUP_V5_RECORD_KIND.manifest);
    const manifestValue = decodeBackupV5RecordPayload(
      manifestRecord.header,
      manifestRecord.compressed
    );
    assertBackupV5Manifest(manifestValue);
    const manifest = manifestValue;

    if (expectedBackupId && manifest.backupId !== expectedBackupId) {
      throw new Error("The selected file is not the backup that was just exported.");
    }

    const blockChecksums: number[] = [];

    for (const plan of manifest.blocks) {
      const expectedKind =
        plan.kind === "hot"
          ? BACKUP_V5_RECORD_KIND.hotBlock
          : BACKUP_V5_RECORD_KIND.archiveBlock;
      const record = readRecord(handle, expectedKind);
      const payload = decodeBackupV5RecordPayload(
        record.header,
        record.compressed
      );
      decodeBackupV5BlockPayload(payload, plan);
      blockChecksums.push(record.header.checksum);
    }

    const footerRecord = readRecord(handle, BACKUP_V5_RECORD_KIND.footer);
    const footerValue = decodeBackupV5RecordPayload(
      footerRecord.header,
      footerRecord.compressed
    );
    assertBackupV5Footer(
      footerValue,
      manifest,
      manifestRecord.header.checksum,
      blockChecksums
    );

    if (
      handle.offset === null ||
      handle.size === null ||
      handle.offset !== handle.size
    ) {
      throw new Error("V5 backup has trailing or unread data.");
    }

    return {
      fileSize: file.size,
      manifest
    };
  } finally {
    handle.close();
  }
}

export async function* readBackupV5Blocks(
  file: File,
  expectedManifest: BackupV5Manifest
): AsyncGenerator<BackupV5SessionData[]> {
  const handle = file.open();
  const blockChecksums: number[] = [];

  try {
    assertMagic(readExact(handle, BACKUP_V5_MAGIC.length));
    const manifestRecord = readRecord(handle, BACKUP_V5_RECORD_KIND.manifest);
    const manifestValue = decodeBackupV5RecordPayload(
      manifestRecord.header,
      manifestRecord.compressed
    );
    assertBackupV5Manifest(manifestValue);

    if (manifestValue.backupId !== expectedManifest.backupId) {
      throw new Error("V5 backup changed after verification.");
    }

    for (const plan of expectedManifest.blocks) {
      const expectedKind =
        plan.kind === "hot"
          ? BACKUP_V5_RECORD_KIND.hotBlock
          : BACKUP_V5_RECORD_KIND.archiveBlock;
      const record = readRecord(handle, expectedKind);
      const payload = decodeBackupV5RecordPayload(
        record.header,
        record.compressed
      );
      blockChecksums.push(record.header.checksum);
      yield decodeBackupV5BlockPayload(payload, plan);
    }

    const footerRecord = readRecord(handle, BACKUP_V5_RECORD_KIND.footer);
    const footerValue = decodeBackupV5RecordPayload(
      footerRecord.header,
      footerRecord.compressed
    );
    assertBackupV5Footer(
      footerValue,
      expectedManifest,
      manifestRecord.header.checksum,
      blockChecksums
    );

    if (
      handle.offset === null ||
      handle.size === null ||
      handle.offset !== handle.size
    ) {
      throw new Error("V5 backup has trailing or unread data.");
    }
  } finally {
    handle.close();
  }
}

async function writeBackupV5Archive(
  file: File,
  source: BackupV5Source
): Promise<BackupV5Manifest> {
  const manifest = createBackupV5Manifest(source.metadata);
  file.create({ overwrite: true });
  const handle = file.open();
  const blockChecksums: number[] = [];

  try {
    handle.writeBytes(BACKUP_V5_MAGIC);
    const manifestRecord = encodeBackupV5Record(
      BACKUP_V5_RECORD_KIND.manifest,
      manifest
    );
    handle.writeBytes(manifestRecord.bytes);

    for (const plan of manifest.blocks) {
      const sessions = await source.loadSessions(plan.sessionIds);
      const payload = createBackupV5BlockPayload(plan, sessions);
      const kind =
        plan.kind === "hot"
          ? BACKUP_V5_RECORD_KIND.hotBlock
          : BACKUP_V5_RECORD_KIND.archiveBlock;
      const record = encodeBackupV5Record(kind, payload);
      handle.writeBytes(record.bytes);
      blockChecksums.push(record.checksum);
    }

    const footer: BackupV5Footer = {
      backupId: manifest.backupId,
      blockChecksums,
      manifestChecksum: manifestRecord.checksum,
      recordCount: manifest.blocks.length + 2,
      totalPointCount: manifest.totals.pointCount
    };
    handle.writeBytes(
      encodeBackupV5Record(BACKUP_V5_RECORD_KIND.footer, footer).bytes
    );
  } finally {
    handle.close();
  }

  if (!file.exists || file.size <= BACKUP_V5_MAGIC.length) {
    throw new Error("The V5 backup file was empty or could not be verified.");
  }

  await inspectBackupV5File(file, manifest.backupId);
  return manifest;
}

function readRecord(
  handle: ReturnType<File["open"]>,
  expectedKind: number
) {
  const header = decodeBackupV5RecordHeader(
    readExact(handle, BACKUP_V5_RECORD_HEADER_BYTES)
  );

  if (header.kind !== expectedKind) {
    throw new Error("V5 backup records are out of order.");
  }

  if (
    header.compressedSize <= 0 ||
    header.rawSize <= 0 ||
    header.compressedSize > BACKUP_V5_MAX_RECORD_BYTES ||
    header.rawSize > BACKUP_V5_MAX_RECORD_BYTES
  ) {
    throw new Error("V5 backup record size is invalid.");
  }

  return {
    compressed: readExact(handle, header.compressedSize),
    header
  };
}

function readExact(
  handle: ReturnType<File["open"]>,
  length: number
): Uint8Array {
  const bytes = handle.readBytes(length);

  if (bytes.length !== length) {
    throw new Error("V5 backup is truncated.");
  }

  return bytes;
}

function assertMagic(bytes: Uint8Array) {
  if (
    bytes.length !== BACKUP_V5_MAGIC.length ||
    bytes.some((byte, index) => byte !== BACKUP_V5_MAGIC[index])
  ) {
    throw new Error("This file is not a Street Explorer V5 backup.");
  }
}

const BACKUP_V5_MAX_RECORD_BYTES = 256 * 1024 * 1024;
