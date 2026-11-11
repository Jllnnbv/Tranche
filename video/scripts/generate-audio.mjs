#!/usr/bin/env node
/**
 * Programmatic Audio Generator for Ambagan Marketing Ad (40s @ 44.1kHz Stereo WAV)
 * Synthesizes:
 * - Warm ambient fintech chord pad & subtle rhythmic pulse (120 BPM)
 * - Scene transition whooshes (frames 0, 360, 780, 1260, 1680, 2100)
 * - Tactile UI cursor clicks & glassmorphic card pop chimes synced to exact Remotion frames
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/audio");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE_RATE = 44100;
const DURATION_SEC = 40;
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SEC;

const left = new Float32Array(TOTAL_SAMPLES);
const right = new Float32Array(TOTAL_SAMPLES);

function addSample(idx, l, r) {
  if (idx >= 0 && idx < TOTAL_SAMPLES) {
    left[idx] += l;
    right[idx] += r;
  }
}

// Helper: frame (at 60fps) to sample index
function frameToSample(frame) {
  return Math.floor((frame / 60) * SAMPLE_RATE);
}

// 1. Warm Ambient Pad + Subtle Arpeggio Pulse (Fmaj9 -> Em7 -> Dm9 -> G13 progression)
const chords = [
  [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
  [164.81, 196.0, 246.94, 293.66, 392.0], // Em7
  [146.83, 174.61, 220.0, 261.63, 329.63], // Dm9
  [196.0, 246.94, 293.66, 329.63, 440.0], // G13sus
];

for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  // Fade in first 0.8s, fade out last 1.5s
  const masterEnv =
    Math.min(1, t / 0.8) * Math.min(1, (DURATION_SEC - t) / 1.5);

  const barIndex = Math.floor(t / 4) % chords.length;
  const chord = chords[barIndex];
  const barPos = (t % 4) / 4;
  const chordEnv = Math.sin(barPos * Math.PI);

  let padL = 0;
  let padR = 0;
  for (let n = 0; n < chord.length; n++) {
    const freq = chord[n];
    const detune = 1 + (n - 2) * 0.0012;
    const s1 = Math.sin(2 * Math.PI * freq * t);
    const s2 = Math.sin(2 * Math.PI * freq * detune * t);
    padL += s1 * 0.025;
    padR += s2 * 0.025;
  }

  // Soft sub-bass pulse at 120 BPM (every 0.5s)
  const beatPos = (t % 0.5) / 0.5;
  const kickEnv = Math.exp(-beatPos * 9);
  const subFreq = chord[0] * 0.5;
  const sub = Math.sin(2 * Math.PI * (subFreq + kickEnv * 28) * t) * kickEnv * 0.075;

  // Gentle marimba/pluck arpeggio every 0.25s (16th feel)
  const arpStep = Math.floor(t / 0.25);
  const arpPos = (t % 0.25) / 0.25;
  const arpEnv = Math.exp(-arpPos * 14);
  const arpFreq = chord[arpStep % chord.length] * 2;
  const arp =
    Math.sin(2 * Math.PI * arpFreq * t) *
    arpEnv *
    0.022 *
    (0.6 + 0.4 * Math.sin(t * 0.5));
  const pan = 0.5 + 0.35 * Math.sin(arpStep * 1.3);

  left[i] += (padL * (0.65 + 0.35 * chordEnv) + sub + arp * pan) * masterEnv;
  right[i] += (padR * (0.65 + 0.35 * chordEnv) + sub + arp * (1 - pan)) * masterEnv;
}

// 2. Filtered Whoosh Generator for Scene Transitions
function addWhoosh(frame, durationSec = 0.55, gain = 0.14) {
  const start = frameToSample(frame) - Math.floor(durationSec * 0.4 * SAMPLE_RATE);
  const len = Math.floor(durationSec * SAMPLE_RATE);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < len; i++) {
    const p = i / len;
    const env = Math.sin(p * Math.PI) ** 1.8;
    const cutoff = 0.03 + 0.18 * Math.sin(p * Math.PI);
    const nL = (Math.random() * 2 - 1) * env;
    const nR = (Math.random() * 2 - 1) * env;
    lpL += cutoff * (nL - lpL);
    lpR += cutoff * (nR - lpR);
    // Add subtle tonal sweep
    const sweep = Math.sin(2 * Math.PI * (140 + 260 * p) * (i / SAMPLE_RATE)) * env * 0.3;
    const pan = 0.25 + 0.5 * p;
    addSample(start + i, (lpL + sweep) * gain * pan, (lpR + sweep) * gain * (1 - pan));
  }
}

// 3. Glassmorphic Card Pop Chime
function addCardChime(frame, baseFreq = 587.33, gain = 0.11) {
  const start = frameToSample(frame);
  const len = Math.floor(0.38 * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 14);
    const env2 = Math.exp(-Math.max(0, t - 0.045) * 12);
    const tone1 = Math.sin(2 * Math.PI * baseFreq * t) * env;
    const tone2 =
      t >= 0.045
        ? Math.sin(2 * Math.PI * (baseFreq * 1.5) * (t - 0.045)) * env2
        : 0;
    const sig = (tone1 * 0.6 + tone2 * 0.5) * gain;
    addSample(start + i, sig * 0.9, sig * 1.0);
  }
}

// 4. Tactile UI Click
function addUiClick(frame, gain = 0.13) {
  const start = frameToSample(frame);
  const len = Math.floor(0.045 * SAMPLE_RATE);
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 95);
    const click =
      (Math.sin(2 * Math.PI * 1450 * t) + 0.5 * Math.sin(2 * Math.PI * 2900 * t)) *
      env *
      gain;
    addSample(start + i, click, click);
  }
}

// Cue sheet across 2400 frames (40s @ 60fps)
// Scene transitions: 0, 360, 780, 1260, 1680, 2100
[10, 355, 775, 1255, 1675, 2095].forEach((f) => addWhoosh(f, 0.6, 0.15));

// Card pop chimes across scenes
const chimeFrames = [
  [55, 523.25],
  [145, 659.25],
  [220, 783.99],
  // Scene 2: Hero + Floating Cards
  [410, 587.33],
  [510, 659.25],
  [610, 783.99],
  // Scene 3: 77 / 20 / 3 Split Engine
  [830, 523.25],
  [930, 587.33],
  [1010, 659.25],
  [1090, 783.99],
  // Scene 4: Group Setup & E-Contract
  [1320, 587.33],
  [1450, 659.25],
  [1560, 783.99],
  // Scene 5: Live Dashboard, Payment & Ledger
  [1740, 587.33],
  [1860, 659.25],
  [1970, 880.0],
  // Scene 6: Outro Lockup
  [2150, 523.25],
  [2220, 659.25],
  [2280, 783.99],
];
for (const [f, freq] of chimeFrames) {
  addCardChime(f, freq, 0.1);
}

// Tactile UI clicks for Playwright cursor spotlights
[470, 595, 680, 1380, 1510, 1610, 1790, 1910, 2020].forEach((f) =>
  addUiClick(f, 0.12)
);

// Encode 16-bit PCM Stereo WAV
function writeWav(filePath, lCh, rCh) {
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = lCh.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < lCh.length; i++) {
    const sl = Math.max(-0.98, Math.min(0.98, Math.tanh(lCh[i])));
    const sr = Math.max(-0.98, Math.min(0.98, Math.tanh(rCh[i])));
    buffer.writeInt16LE(Math.floor(sl * 32767), offset);
    buffer.writeInt16LE(Math.floor(sr * 32767), offset + 2);
    offset += 4;
  }

  fs.writeFileSync(filePath, buffer);
}

const outPath = path.join(OUT_DIR, "soundtrack.wav");
writeWav(outPath, left, right);
console.log(`Generated master stereo audio track: ${outPath}`);
