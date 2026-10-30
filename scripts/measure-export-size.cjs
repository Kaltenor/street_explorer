const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function measure(directory) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, "metadata.json"), "utf8"));
  return Object.fromEntries(Object.entries(metadata.fileMetadata).map(([platform, info]) => {
    const bundle = fs.readFileSync(path.join(directory, info.bundle));
    const assets = [...new Set(info.assets.map((asset) => asset.path))].map((asset) => {
      const data = fs.readFileSync(path.join(directory, asset));
      return { bytes: data.length, gzipBytes: zlib.gzipSync(data, { level: 9 }).length };
    });
    return [platform, {
      bundleBytes: bundle.length,
      assetBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
      totalBytes: bundle.length + assets.reduce((sum, asset) => sum + asset.bytes, 0),
      // A comparison metric only, not an APK/IPA/CDN size prediction.
      gzipBytes: zlib.gzipSync(bundle, { level: 9 }).length + assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      assetCount: assets.length
    }];
  }));
}

if (require.main === module) {
  if (!process.argv[2]) throw new Error("Usage: node scripts/measure-export-size.cjs <export-directory>");
  console.log(JSON.stringify(measure(process.argv[2]), null, 2));
}
module.exports = measure;
