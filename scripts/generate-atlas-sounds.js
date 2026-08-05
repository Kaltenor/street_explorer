const fs = require("fs");
const path = require("path");

const sampleRate = 44100;
let randomState = 0x41544c41;

function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0xffffffff * 2 - 1;
}

function writeWave(name, seconds, createSample) {
  const sampleCount = Math.round(sampleRate * seconds);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const value = Math.max(-1, Math.min(1, createSample(time, index, sampleCount)));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }

  fs.writeFileSync(path.join(__dirname, "..", "assets", "sounds", name), buffer);
}

let paperLow = 0;
writeWave("atlas-page.wav", 0.58, (time, index, count) => {
  const progress = index / count;
  const envelope = Math.sin(Math.PI * progress) ** 1.7;
  const sweep = 0.55 + 0.45 * Math.sin(progress * Math.PI);
  paperLow += (random() - paperLow) * (0.05 + progress * 0.11);
  const fibers = random() * 0.12 + paperLow * 0.58;
  const fold = Math.sin(time * Math.PI * (130 + 90 * progress)) * 0.035;
  return (fibers * sweep + fold) * envelope;
});

let stampLow = 0;
writeWave("atlas-stamp.wav", 0.3, (time, index, count) => {
  const progress = index / count;
  const thump = Math.sin(2 * Math.PI * (78 - 24 * progress) * time) *
    Math.exp(-time * 22) * 0.66;
  stampLow += (random() - stampLow) * 0.22;
  const inkScratch = stampLow * Math.exp(-time * 13) * 0.28;
  const paperTap = progress < 0.035 ? random() * (1 - progress / 0.035) * 0.25 : 0;
  return thump + inkScratch + paperTap;
});

console.log("Generated atlas-page.wav and atlas-stamp.wav");
