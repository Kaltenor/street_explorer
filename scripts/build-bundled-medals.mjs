import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildBundledMedals({ check = false } = {}) {
  const manifest = fs.readFileSync(path.join(root, "src/data/generated/franceMedalAlbumManifest.ts"), "utf8");
  const ids = [...manifest.matchAll(/albumId: "([^"]+)"/g)].map((match) => match[1]);
  const sourceDirectory = path.join(root, "assets/medals");
  const sources = new Map();
  for (const directory of [sourceDirectory, path.join(sourceDirectory, "france")]) {
    for (const name of fs.readdirSync(directory).filter((name) => name.endsWith(".json"))) {
      const album = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
      if (album.id && Array.isArray(album.medals)) {
        assert(!sources.has(album.id), `Duplicate album source: ${album.id}`);
        sources.set(album.id, album);
      }
    }
  }
  const albums = ids.map((id) => {
    assert(sources.has(id), `Missing source album: ${id}`);
    return Buffer.from(JSON.stringify(sources.get(id)));
  });
  // Shared catalogue vocabulary without forcing all cities to decompress together.
  // DEFLATE's dictionary window is 32 KiB; the sample is deterministic.
  const dictionary = Buffer.concat(albums.slice(3, 8)).subarray(-32768);
  const payloads = {
    dictionary: gzipSync(dictionary, { level: 9, mtime: 0 }).toString("base64"),
    albums: Object.fromEntries(ids.map((id, index) => [id,
      deflateRawSync(albums[index], { level: 9, dictionary }).toString("base64")]))
  };
  const output = `${JSON.stringify(payloads)}\n`;
  const target = path.join(root, "src/data/generated/franceMedalAlbumPayloads.json");
  if (check) assert.equal(fs.readFileSync(target, "utf8"), output, "Run npm run build:bundled-medals");
  else fs.writeFileSync(target, output);
  console.log(`${check ? "Verified" : "Packed"} ${ids.length} offline albums: ${Buffer.byteLength(output)} bytes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildBundledMedals({ check: process.argv.includes("--check") });
}
