import { gunzipSync, inflateSync, strFromU8 } from "fflate";
import payloads from "./generated/franceMedalAlbumPayloads.json";
import type { MedalAlbumDefinition } from "../types/medal";

const albums = new Map<string, MedalAlbumDefinition>();
let dictionary: Uint8Array | undefined;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Decode without Node Buffer or browser globals, including in native Hermes.
function decodeBase64(encoded: string) {
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array(encoded.length / 4 * 3 - padding);
  let offset = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const bits = (alphabet.indexOf(encoded[index]!) << 18) |
      (alphabet.indexOf(encoded[index + 1]!) << 12) |
      (Math.max(0, alphabet.indexOf(encoded[index + 2]!)) << 6) |
      Math.max(0, alphabet.indexOf(encoded[index + 3]!));
    bytes[offset++] = bits >>> 16;
    if (offset < bytes.length) bytes[offset++] = bits >>> 8;
    if (offset < bytes.length) bytes[offset++] = bits;
  }
  return bytes;
}

export function loadBundledMedalAlbum(albumId: string): MedalAlbumDefinition {
  const cached = albums.get(albumId);
  if (cached) return cached;
  const encoded = (payloads.albums as Record<string, string>)[albumId];
  if (!encoded) throw new Error(`Missing bundled medal album: ${albumId}`);
  dictionary ??= gunzipSync(decodeBase64(payloads.dictionary));
  const album = JSON.parse(strFromU8(inflateSync(decodeBase64(encoded), { dictionary }))) as MedalAlbumDefinition;
  albums.set(albumId, album);
  return album;
}
