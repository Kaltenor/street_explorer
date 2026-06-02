import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  getBackupData,
  restoreBackupData,
  StreetExplorerBackup
} from "../database/walkRepository";
import { GpsPoint, WalkSession } from "../types/walk";

export async function exportWalkGpx(walk: WalkSession, points: GpsPoint[]) {
  const file = new File(Paths.document, `street-explorer-${walk.id}.gpx`);

  file.write(buildGpx(walk, points));
  await shareFile(file.uri);

  return file.uri;
}

export async function exportBackupJson() {
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

  await restoreBackupData(backup);

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
  const parsed = JSON.parse(rawJson) as Partial<StreetExplorerBackup>;

  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.sessions) ||
    !Array.isArray(parsed.points)
  ) {
    throw new Error("This file is not a valid Street Explorer backup.");
  }

  return {
    exportedAt: parsed.exportedAt ?? new Date().toISOString(),
    points: parsed.points,
    sessions: parsed.sessions,
    version: 1
  };
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
