import { FRANCE_MEDAL_ALBUM_MANIFEST } from "./generated/franceMedalAlbumManifest";
import {
  DOWNLOADABLE_MEDAL_COUNTRY_PACKS,
  DownloadableMedalCountryPackDescriptor
} from "./generated/downloadableMedalCountryPackManifest";

const downloadableAlbums = DOWNLOADABLE_MEDAL_COUNTRY_PACKS.flatMap(
  (pack) => pack.albums
);

const manifestByAlbumId = new Map(
  FRANCE_MEDAL_ALBUM_MANIFEST.map((entry) => [entry.albumId, entry])
);
const albumIdByCityZoneId = new Map(
  [
    ...FRANCE_MEDAL_ALBUM_MANIFEST.map((entry) => [entry.cityZoneId, entry.albumId] as const),
    ...downloadableAlbums.map((entry) => [entry.cityZoneId, entry.albumId] as const)
  ]
);
const downloadablePackByAlbumId = new Map(
  DOWNLOADABLE_MEDAL_COUNTRY_PACKS.flatMap((pack) =>
    pack.albums.map((entry) => [entry.albumId, pack] as const)
  )
);

export const BUNDLED_MEDAL_ALBUM_COUNT = FRANCE_MEDAL_ALBUM_MANIFEST.length;
export const BUNDLED_MEDAL_COUNT = FRANCE_MEDAL_ALBUM_MANIFEST.reduce(
  (total, entry) => total + entry.medalCount,
  0
);
export const DOWNLOADABLE_MEDAL_ALBUM_COUNT = downloadableAlbums.length;
export const DOWNLOADABLE_MEDAL_COUNT = DOWNLOADABLE_MEDAL_COUNTRY_PACKS.reduce(
  (total, pack) => total + pack.medalCount,
  0
);

export function getBundledMedalAlbum(albumId: string) {
  return manifestByAlbumId.get(albumId)?.load() ?? null;
}

export function getBundledMedalAlbumMetadata(albumId: string) {
  return manifestByAlbumId.get(albumId) ?? null;
}

export function getAllBundledMedalAlbums() {
  return FRANCE_MEDAL_ALBUM_MANIFEST.map((entry) => entry.load());
}

export function getDownloadableMedalCountryPacks() {
  return DOWNLOADABLE_MEDAL_COUNTRY_PACKS;
}

export function getDownloadableMedalCountryPack(
  albumId: string
): DownloadableMedalCountryPackDescriptor | null {
  return downloadablePackByAlbumId.get(albumId) ?? null;
}

export function getMedalAlbumIdForZone(zone: {
  id: string;
  parentZoneId?: string | null;
} | null | undefined) {
  if (!zone) {
    return null;
  }

  const cityZoneId = zone.parentZoneId ?? zone.id;

  return albumIdByCityZoneId.get(cityZoneId) ?? null;
}
