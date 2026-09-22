import { fetch as expoFetch } from "expo/fetch";
import { withRequestDeadline } from "./networkRequest";
import { Directory, File, Paths } from "expo-file-system";
import { gunzipSync, strFromU8 } from "fflate";

import {
  getAllBundledMedalAlbums,
  getBundledMedalAlbum,
  getDownloadableMedalCountryPack,
  getDownloadableMedalCountryPacks
} from "../data/medalAlbums";
import type {
  DownloadableMedalCountryPackDescriptor
} from "../data/generated/downloadableMedalCountryPackManifest";
import type {
  LandmarkMedalDefinition,
  LocalizedMedalText,
  MedalAlbumDefinition,
  MedalCountryPack
} from "../types/medal";
import { sha256Hex } from "./sha256";

const COUNTRY_PACK_DIRECTORY_NAME = "street-explorer-medal-country-packs";
const countryPackDirectory = new Directory(
  Paths.document,
  COUNTRY_PACK_DIRECTORY_NAME
);
const loadedAlbums = new Map<string, MedalAlbumDefinition>();
const packLoadOperations = new Map<string, Promise<MedalCountryPack>>();
const failedPackLoads = new Map<string, unknown>();

export async function getMedalAlbumDefinition(albumId: string) {
  const bundled = getBundledMedalAlbum(albumId);

  if (bundled) {
    return bundled;
  }

  const loaded = loadedAlbums.get(albumId);

  if (loaded) {
    return loaded;
  }

  const descriptor = getDownloadableMedalCountryPack(albumId);

  if (!descriptor) {
    return null;
  }

  const pack = await loadCountryPack(descriptor);
  return pack.albums.find((album) => album.id === albumId) ?? null;
}

export function getCachedMedalAlbumDefinition(albumId: string) {
  return getBundledMedalAlbum(albumId) ?? loadedAlbums.get(albumId) ?? null;
}

export function isMedalCountryPackInstalled(
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  ensureCountryPackDirectory();
  return getCountryPackFile(descriptor).exists;
}

export async function getLocallyAvailableMedalAlbumDefinitions() {
  const albums = getAllBundledMedalAlbums();

  for (const descriptor of getDownloadableMedalCountryPacks()) {
    try {
      ensureCountryPackDirectory();
      const installedFile = getCountryPackFile(descriptor);

      if (!installedFile.exists) {
        continue;
      }

      const pack = await readAndValidateCountryPack(installedFile, descriptor);
      albums.push(...pack.albums);
    } catch (error) {
      console.warn(
        `Skipping invalid installed ${descriptor.countryCode} medal pack during discovery scan`,
        error
      );
    }
  }

  return albums;
}

export async function loadCountryPack(
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  const operationKey = `${descriptor.countryCode}:${descriptor.version}`;
  const failedLoad = failedPackLoads.get(operationKey);

  if (failedLoad) {
    throw failedLoad;
  }

  const existing = packLoadOperations.get(operationKey);

  if (existing) {
    return existing;
  }

  const operation = loadCountryPackOnce(descriptor)
    .catch((error) => {
      failedPackLoads.set(operationKey, error);
      console.warn("Medal country pack is not available", error);
      throw error;
    })
    .finally(() => {
      packLoadOperations.delete(operationKey);
    });
  packLoadOperations.set(operationKey, operation);
  return operation;
}

export function resetMedalCountryPackFailure(albumId: string) {
  const descriptor = getDownloadableMedalCountryPack(albumId);

  if (!descriptor) {
    return;
  }

  failedPackLoads.delete(`${descriptor.countryCode}:${descriptor.version}`);
}

async function loadCountryPackOnce(
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  ensureCountryPackDirectory();
  const installedFile = getCountryPackFile(descriptor);

  if (installedFile.exists) {
    try {
      return await readAndValidateCountryPack(installedFile, descriptor);
    } catch (error) {
      console.warn("Discarding an invalid cached medal country pack", error);
      installedFile.delete();
    }
  }

  if (!descriptor.url.startsWith("https://")) {
    throw new Error("Medal country packs must use HTTPS.");
  }

  const temporaryFile = new File(
    countryPackDirectory,
    `${descriptor.countryCode}-v${descriptor.version}-${Date.now()}.tmp`
  );

  try {
    const bytes = await withRequestDeadline(async (signal) => {
      const response = await expoFetch(descriptor.url, { signal });
      if (!response.ok) throw new Error(`Medal pack request failed: ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Medal pack response has no body.");
      const output = new Uint8Array(descriptor.compressedBytes);
      let offset = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.length > output.length) throw new Error("Medal pack exceeds its manifest size.");
          output.set(value, offset);
          offset += value.length;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      if (offset !== output.length) throw new Error("Medal pack is truncated.");
      return output;
    }, 60_000);
    temporaryFile.write(bytes);
    const pack = await readAndValidateCountryPack(temporaryFile, descriptor);

    if (installedFile.exists) {
      installedFile.delete();
    }
    temporaryFile.rename(getCountryPackFileName(descriptor));
    removeObsoleteCountryPackFiles(descriptor);
    return pack;
  } catch (error) {
    if (temporaryFile.exists) {
      temporaryFile.delete();
    }
    throw error;
  }
}

async function readAndValidateCountryPack(
  file: File,
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  const compressed = await file.bytes();

  if (compressed.byteLength !== descriptor.compressedBytes) {
    throw new Error("Medal country pack size does not match its manifest.");
  }
  if (sha256Hex(compressed) !== descriptor.sha256) {
    throw new Error("Medal country pack checksum does not match its manifest.");
  }

  const uncompressed = gunzipSync(compressed);

  if (uncompressed.byteLength !== descriptor.uncompressedBytes) {
    throw new Error("Medal country pack expanded size does not match its manifest.");
  }

  const parsed = JSON.parse(strFromU8(uncompressed)) as unknown;
  const pack = assertCountryPack(parsed, descriptor);

  for (const album of pack.albums) {
    loadedAlbums.set(album.id, album);
  }

  return pack;
}

function assertCountryPack(
  value: unknown,
  descriptor: DownloadableMedalCountryPackDescriptor
): MedalCountryPack {
  if (!isRecord(value)) {
    throw new Error("Medal country pack root must be an object.");
  }
  if (
    value.formatVersion !== 1 ||
    value.countryCode !== descriptor.countryCode ||
    value.version !== descriptor.version ||
    !Array.isArray(value.languages) ||
    value.languages.join(":") !== descriptor.languages.join(":") ||
    !Array.isArray(value.albums) ||
    value.albums.length !== descriptor.albums.length
  ) {
    throw new Error("Medal country pack metadata does not match its manifest.");
  }

  const expectedAlbums = new Map(
    descriptor.albums.map((album) => [album.albumId, album])
  );
  const albumIds = new Set<string>();
  const medalIds = new Set<string>();

  for (const album of value.albums) {
    assertAlbum(album, descriptor, expectedAlbums, albumIds, medalIds);
  }

  if (medalIds.size !== descriptor.medalCount) {
    throw new Error("Medal country pack medal total does not match its manifest.");
  }

  return value as MedalCountryPack;
}

function assertAlbum(
  value: unknown,
  descriptor: DownloadableMedalCountryPackDescriptor,
  expectedAlbums: Map<string, DownloadableMedalCountryPackDescriptor["albums"][number]>,
  albumIds: Set<string>,
  medalIds: Set<string>
) {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Medal country pack contains an invalid album.");
  }

  const expected = expectedAlbums.get(value.id);

  if (
    !expected ||
    albumIds.has(value.id) ||
    value.cityId !== expected.cityId ||
    value.cityZoneId !== expected.cityZoneId ||
    value.countryCode !== descriptor.countryCode ||
    value.localLanguage !== expected.localLanguage ||
    value.version !== expected.version ||
    !isLocalizedText(value.cityName, expected.localLanguage) ||
    typeof value.publishedAt !== "string" ||
    typeof value.sourceAttribution !== "string" ||
    !value.sourceAttribution.trim() ||
    !Array.isArray(value.medals) ||
    value.medals.length !== expected.medalCount
  ) {
    throw new Error(`Medal country pack album ${value.id} failed validation.`);
  }

  albumIds.add(value.id);

  for (const medal of value.medals) {
    assertMedal(medal, expected.localLanguage, medalIds);
  }
}

function assertMedal(
  value: unknown,
  localLanguage: string,
  medalIds: Set<string>
): asserts value is LandmarkMedalDefinition {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    medalIds.has(value.id) ||
    !["architecture", "art", "culture", "history", "nature"].includes(
      String(value.category)
    ) ||
    !isLocalizedText(value.name, localLanguage) ||
    !isLocalizedText(value.description, localLanguage) ||
    typeof value.latitude !== "number" ||
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    typeof value.longitude !== "number" ||
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180 ||
    !isRecord(value.externalIdentity) ||
    typeof value.externalIdentity.source !== "string" ||
    !value.externalIdentity.source ||
    typeof value.externalIdentity.type !== "string" ||
    !["item", "node", "record", "relation", "way"].includes(
      value.externalIdentity.type
    ) ||
    !["number", "string"].includes(typeof value.externalIdentity.id)
  ) {
    throw new Error("Medal country pack contains an invalid medal definition.");
  }

  medalIds.add(value.id);
}

function isLocalizedText(
  value: unknown,
  localLanguage?: string
): value is LocalizedMedalText {
  if (
    !isRecord(value) ||
    typeof value.en !== "string" ||
    !value.en.trim() ||
    typeof value.fr !== "string" ||
    !value.fr.trim()
  ) {
    return false;
  }

  return !localLanguage || (
    typeof value[localLanguage] === "string" &&
    Boolean((value[localLanguage] as string).trim())
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureCountryPackDirectory() {
  countryPackDirectory.create({ idempotent: true, intermediates: true });
}

function getCountryPackFile(
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  return new File(countryPackDirectory, getCountryPackFileName(descriptor));
}

function getCountryPackFileName(
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  return `${descriptor.countryCode}-v${descriptor.version}-${descriptor.sha256.slice(0, 12)}.json.gz`;
}

function removeObsoleteCountryPackFiles(
  descriptor: DownloadableMedalCountryPackDescriptor
) {
  const currentFileName = getCountryPackFileName(descriptor);
  const prefix = `${descriptor.countryCode}-v`;

  for (const entry of countryPackDirectory.list()) {
    if (
      entry instanceof File &&
      entry.name.startsWith(prefix) &&
      entry.name !== currentFileName
    ) {
      entry.delete();
    }
  }
}
