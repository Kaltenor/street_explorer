const fs = require("fs");
const path = require("path");

const sampleRate = 44_100;
const durationSeconds = 0.62;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const pcm = Buffer.alloc(sampleCount * 2);

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const attack = Math.min(1, time / 0.008);
  const decay = Math.exp(-6.2 * time);
  const shimmerDecay = Math.exp(-9.5 * time);
  const signal =
    Math.sin(2 * Math.PI * 880 * time) * 0.42 * decay +
    Math.sin(2 * Math.PI * 1320 * time) * 0.3 * shimmerDecay +
    Math.sin(2 * Math.PI * 2200 * time) * 0.14 * shimmerDecay;
  const sample = Math.max(-1, Math.min(1, signal * attack));
  pcm.writeInt16LE(Math.round(sample * 32767), index * 2);
}

const header = Buffer.alloc(44);
const dataLength = pcm.length;
header.write("RIFF", 0);
header.writeUInt32LE(36 + dataLength, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(dataLength, 40);

const outputDirectory = path.resolve(__dirname, "..", "assets", "sounds");
const outputPath = path.join(outputDirectory, "medal-chime.wav");

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat([header, pcm]));
console.log(`Generated ${outputPath}`);
