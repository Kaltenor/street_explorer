import { MedalAlbumDefinition } from "../types/medal";

const lyonV1 = require("../../assets/medals/lyon-v1.json") as MedalAlbumDefinition;

export const BUNDLED_MEDAL_ALBUMS: readonly MedalAlbumDefinition[] = [lyonV1];
export const DEFAULT_MEDAL_ALBUM_ID = lyonV1.id;

export function getBundledMedalAlbum(albumId: string) {
  return BUNDLED_MEDAL_ALBUMS.find((album) => album.id === albumId) ?? null;
}
