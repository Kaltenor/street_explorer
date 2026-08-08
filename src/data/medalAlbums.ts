import { FRANCE_MEDAL_ALBUM_MANIFEST } from "./generated/franceMedalAlbumManifest";

const manifestByAlbumId = new Map(
  FRANCE_MEDAL_ALBUM_MANIFEST.map((entry) => [entry.albumId, entry])
);
const albumIdByCityZoneId = new Map(
  FRANCE_MEDAL_ALBUM_MANIFEST.map((entry) => [entry.cityZoneId, entry.albumId])
);

export const BUNDLED_MEDAL_ALBUM_COUNT = FRANCE_MEDAL_ALBUM_MANIFEST.length;
export const BUNDLED_MEDAL_COUNT = FRANCE_MEDAL_ALBUM_MANIFEST.reduce(
  (total, entry) => total + entry.medalCount,
  0
);

export function getBundledMedalAlbum(albumId: string) {
  return manifestByAlbumId.get(albumId)?.load() ?? null;
}

export function getBundledMedalAlbumMetadata(albumId: string) {
  return manifestByAlbumId.get(albumId) ?? null;
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
