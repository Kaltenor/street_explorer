const fs = require("fs");
const path = require("path");

// Original Street Explorer synthesis, dedicated to the public domain under
// Creative Commons Zero 1.0. No third-party samples or melodies are used.
const sampleRate = 44_100;
const durationSeconds = 2;
const channelCount = 2;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const left = new Float64Array(sampleCount);
const right = new Float64Array(sampleCount);

let noiseState = 0x5eedc0de;

function nextNoise() {
  noiseState = (Math.imul(noiseState, 1_664_525) + 1_013_904_223) >>> 0;
  return noiseState / 0xffffffff * 2 - 1;
}

function mixSample(index, value, pan = 0) {
  const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  left[index] += value * Math.cos(angle);
  right[index] += value * Math.sin(angle);
}

function smoothStep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function addBrassNote(frequency, start, length, gain, pan = 0) {
  const startIndex = Math.floor(start * sampleRate);
  const endIndex = Math.min(sampleCount, Math.ceil((start + length) * sampleRate));
  const harmonicWeights = [1, 0.48, 0.25, 0.13, 0.07, 0.035];
  const harmonicWeightTotal = harmonicWeights.reduce((sum, weight) => sum + weight, 0);

  for (let index = startIndex; index < endIndex; index += 1) {
    const time = index / sampleRate - start;
    const attack = smoothStep(time / 0.018);
    const release = smoothStep((length - time) / Math.min(0.24, length * 0.42));
    const body = Math.exp(-0.42 * time);
    const vibrato = 1 + Math.sin(2 * Math.PI * 5.1 * time) * 0.0018;
    let tone = 0;

    for (let harmonic = 1; harmonic <= harmonicWeights.length; harmonic += 1) {
      tone += Math.sin(
        2 * Math.PI * frequency * harmonic * vibrato * time + harmonic * 0.07
      ) * harmonicWeights[harmonic - 1];
    }

    const breath = nextNoise() * 0.018 * Math.exp(-2.5 * time);
    mixSample(
      index,
      (tone / harmonicWeightTotal + breath) * gain * attack * release * body,
      pan
    );
  }
}

function addStringNote(frequency, start, length, gain, pan = 0) {
  const startIndex = Math.floor(start * sampleRate);
  const endIndex = Math.min(sampleCount, Math.ceil((start + length) * sampleRate));

  for (let index = startIndex; index < endIndex; index += 1) {
    const time = index / sampleRate - start;
    const attack = smoothStep(time / 0.12);
    const release = smoothStep((length - time) / 0.28);
    const bowed =
      Math.sin(2 * Math.PI * frequency * time) * 0.72 +
      Math.sin(2 * Math.PI * frequency * 2.002 * time) * 0.2 +
      Math.sin(2 * Math.PI * frequency * 3.004 * time) * 0.08;
    mixSample(index, bowed * gain * attack * release, pan);
  }
}

function addTimpani(start, gain) {
  const length = 0.72;
  const startIndex = Math.floor(start * sampleRate);
  const endIndex = Math.min(sampleCount, Math.ceil((start + length) * sampleRate));

  for (let index = startIndex; index < endIndex; index += 1) {
    const time = index / sampleRate - start;
    const pitchSweep = 92 * time - 24 * time * time;
    const body = Math.sin(2 * Math.PI * pitchSweep) * Math.exp(-5.2 * time);
    const impact = nextNoise() * Math.exp(-34 * time) * 0.42;
    mixSample(index, (body + impact) * gain, 0);
  }
}

function addBell(frequency, start, gain, pan = 0) {
  const length = Math.min(1.05, durationSeconds - start);
  const startIndex = Math.floor(start * sampleRate);
  const endIndex = Math.min(sampleCount, Math.ceil((start + length) * sampleRate));
  const partials = [
    [1, 1],
    [2.01, 0.42],
    [3.94, 0.2],
    [5.41, 0.1]
  ];

  for (let index = startIndex; index < endIndex; index += 1) {
    const time = index / sampleRate - start;
    const attack = smoothStep(time / 0.004);
    let tone = 0;

    for (const [ratio, weight] of partials) {
      tone += Math.sin(2 * Math.PI * frequency * ratio * time) *
        weight * Math.exp(-(3.6 + ratio * 0.65) * time);
    }

    mixSample(index, tone * gain * attack, pan);
  }
}

// Rising heraldic call: C major, first inversion, dominant, then a broad tonic.
for (const [frequency, pan] of [[261.63, -0.3], [329.63, 0.25], [392, 0]]) {
  addBrassNote(frequency, 0.02, 0.3, 0.13, pan);
}
for (const [frequency, pan] of [[329.63, -0.25], [392, 0.22], [523.25, 0]]) {
  addBrassNote(frequency, 0.31, 0.34, 0.14, pan);
}
for (const [frequency, pan] of [[392, -0.22], [493.88, 0.22], [587.33, 0]]) {
  addBrassNote(frequency, 0.62, 0.38, 0.15, pan);
}
for (const [frequency, pan] of [
  [261.63, -0.48],
  [392, 0.42],
  [523.25, -0.2],
  [659.25, 0.2],
  [783.99, 0]
]) {
  addBrassNote(frequency, 0.94, 1.04, 0.115, pan);
}

for (const [frequency, pan] of [
  [130.81, -0.4],
  [196, 0.35],
  [261.63, -0.15],
  [329.63, 0.18]
]) {
  addStringNote(frequency, 0.78, 1.2, 0.052, pan);
}

addTimpani(0, 0.26);
addTimpani(0.62, 0.22);
addTimpani(0.94, 0.34);
addBell(1046.5, 0.95, 0.13, -0.25);
addBell(1318.51, 1.02, 0.1, 0.28);
addBell(1567.98, 1.1, 0.07, 0.05);

// A restrained early-reflection pair adds hall width without obscuring the hit.
const delayLeft = Math.floor(sampleRate * 0.041);
const delayRight = Math.floor(sampleRate * 0.067);
for (let index = Math.max(delayLeft, delayRight); index < sampleCount; index += 1) {
  left[index] += right[index - delayLeft] * 0.095;
  right[index] += left[index - delayRight] * 0.08;
}

const finalFadeSamples = Math.floor(sampleRate * 0.12);
for (let index = sampleCount - finalFadeSamples; index < sampleCount; index += 1) {
  const fade = smoothStep((sampleCount - index - 1) / finalFadeSamples);
  left[index] *= fade;
  right[index] *= fade;
}

let peak = 0;
for (let index = 0; index < sampleCount; index += 1) {
  peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
}
const normalization = peak > 0 ? 0.89 / peak : 1;
const pcm = Buffer.alloc(sampleCount * channelCount * 2);

for (let index = 0; index < sampleCount; index += 1) {
  pcm.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, left[index] * normalization)) * 32767),
    index * 4
  );
  pcm.writeInt16LE(
    Math.round(Math.max(-1, Math.min(1, right[index] * normalization)) * 32767),
    index * 4 + 2
  );
}

const header = Buffer.alloc(44);
const dataLength = pcm.length;
header.write("RIFF", 0);
header.writeUInt32LE(36 + dataLength, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channelCount, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channelCount * 2, 28);
header.writeUInt16LE(channelCount * 2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(dataLength, 40);

const outputDirectory = path.resolve(__dirname, "..", "assets", "sounds");
const outputPath = path.join(outputDirectory, "medal-chime.wav");

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat([header, pcm]));
console.log(`Generated ${outputPath}`);
