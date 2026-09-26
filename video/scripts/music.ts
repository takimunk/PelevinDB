// Original 20-second score for the film, synthesised from scratch and written to public/score.wav.
// A minor, 120 BPM; impacts land on the scene cuts from src/timeline.ts.
// Usage: node scripts/music.ts
import { writeFileSync } from "node:fs";
import { BEATS, BPM, SCENES } from "../src/timeline.ts";

const SR = 48_000;
const BEAT = 60 / BPM;
const LENGTH = BEATS * BEAT;
const N = Math.ceil(LENGTH * SR);
const TAU = Math.PI * 2;

const L = new Float32Array(N);
const R = new Float32Array(N);
const duckedL = new Float32Array(N);
const duckedR = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);
const delayL = new Float32Array(N);
const delayR = new Float32Array(N);
const duck = new Float32Array(N).fill(1);

let seed = 7;
const noise = () => {
  seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
  return seed / 2 ** 31 - 1;
};
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const at = (beat: number) => Math.round(beat * BEAT * SR);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Bus = { dry?: number; reverb?: number; delay?: number; pan?: number; ducked?: boolean };
function write(i: number, v: number, bus: Bus) {
  if (i < 0 || i >= N) return;
  const pan = bus.pan ?? 0;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const d = bus.dry ?? 1;
  (bus.ducked ? duckedL : L)[i] += v * gl * d;
  (bus.ducked ? duckedR : R)[i] += v * gr * d;
  if (bus.reverb) {
    sendL[i] += v * gl * bus.reverb;
    sendR[i] += v * gr * bus.reverb;
  }
  if (bus.delay) {
    delayL[i] += v * gl * bus.delay;
    delayR[i] += v * gr * bus.delay;
  }
}

/** Band-limited sawtooth via PolyBLEP. */
function blep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Topology-preserving state-variable low-pass (Zavalishin). */
function lowpass() {
  let ic1 = 0,
    ic2 = 0;
  return (x: number, cutoff: number, q = 0.7) => {
    const g = Math.tan((Math.PI * clamp(cutoff, 20, SR * 0.45)) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const v3 = x - ic2;
    const v1 = a1 * ic1 + g * a1 * v3;
    const v2 = ic2 + g * v1;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  };
}

const env = (t: number, a: number, d: number, s: number, r: number, len: number) => {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < len) return s;
  return Math.max(0, s * (1 - (t - len) / r));
};

// ---------- instruments ----------

function kick(beat: number, gain = 1) {
  const start = at(beat);
  const len = Math.round(0.45 * SR);
  let phase = 0;
  for (let j = 0; j < len; j++) {
    const t = j / SR;
    const f = 44 + 120 * Math.exp(-t * 32);
    phase += (TAU * f) / SR;
    const body = Math.sin(phase) * Math.exp(-t * 7.5);
    const click = noise() * Math.exp(-t * 900) * 0.35;
    write(start + j, Math.tanh((body + click) * 1.6) * 0.62 * gain, { reverb: 0.02 });
  }
  for (let j = 0; j < Math.round(0.32 * SR); j++) {
    const t = j / SR;
    const i = start + j;
    if (i < N) duck[i] = Math.min(duck[i], 1 - 0.72 * Math.exp(-t * 11) * gain);
  }
}

function hat(beat: number, gain = 1, open = false, pan = 0.25) {
  const start = at(beat);
  const len = Math.round((open ? 0.22 : 0.05) * SR);
  const f = lowpass();
  for (let j = 0; j < len; j++) {
    const t = j / SR;
    const hp = f(noise(), 7_500, 0.9).hp;
    write(start + j, hp * Math.exp(-t * (open ? 16 : 70)) * 0.16 * gain, { pan, reverb: 0.05 });
  }
}

function clap(beat: number, gain = 1) {
  const start = at(beat);
  const f = lowpass();
  for (let j = 0; j < Math.round(0.35 * SR); j++) {
    const t = j / SR;
    const bursts = t < 0.03 ? 0.6 + 0.4 * Math.sin(t * TAU * 110) : 1;
    const bp = f(noise(), 1_600, 1.4).bp;
    write(start + j, bp * bursts * Math.exp(-t * 14) * 0.5 * gain, { reverb: 0.25 });
  }
}

function tick(beat: number, gain = 1) {
  const start = at(beat);
  const f = lowpass();
  const tone = 2_400 + 900 * Math.abs(noise());
  for (let j = 0; j < Math.round(0.03 * SR); j++) {
    const t = j / SR;
    const v = f(noise(), tone, 3).bp * Math.exp(-t * 180);
    write(start + j, v * 0.28 * gain, { pan: noise() * 0.5, reverb: 0.08 });
  }
}

function bass(beat: number, note: number, lenBeats: number, gain = 1) {
  const start = at(beat);
  const len = Math.round(lenBeats * BEAT * SR);
  const f = lowpass();
  const hz = midi(note);
  let p1 = 0,
    p2 = 0;
  for (let j = 0; j < len + 0.05 * SR; j++) {
    const t = j / SR;
    const dt = hz / SR;
    p1 = (p1 + dt) % 1;
    p2 = (p2 + dt * 0.5) % 1;
    const saw = 2 * p1 - 1 - blep(p1, dt);
    const sub = Math.sin(TAU * p2 * 2);
    const cutoff = 180 + 1_300 * Math.exp(-t * 14);
    const v = f(saw * 0.6 + sub * 0.7, cutoff, 1.1).lp;
    const a = env(t, 0.004, 0.12, 0.7, 0.05, len / SR);
    write(start + j, Math.tanh(v * 1.4) * a * 0.36 * gain, { ducked: true });
  }
}

function pad(beat: number, notes: number[], lenBeats: number, gain = 1, bright = 1) {
  const start = at(beat);
  const len = Math.round(lenBeats * BEAT * SR);
  const tail = Math.round(0.8 * SR);
  notes.forEach((note, n) => {
    for (const detune of [-0.11, 0, 0.12]) {
      const hz = midi(note) * 2 ** (detune / 12);
      const f = lowpass();
      let p = (n * 0.37 + detune) % 1;
      if (p < 0) p += 1;
      const pan = clamp(detune * 6 + (n - notes.length / 2) * 0.12, -0.9, 0.9);
      for (let j = 0; j < len + tail; j++) {
        const t = j / SR;
        const dt = hz / SR;
        p = (p + dt) % 1;
        const saw = 2 * p - 1 - blep(p, dt);
        const cutoff = (700 + 900 * Math.sin(t * 0.9 + n) ** 2) * bright;
        const v = f(saw, cutoff, 0.8).lp;
        const a = env(t, 0.35, 0.4, 0.8, 0.8, len / SR);
        write(start + j, v * a * 0.035 * gain, { pan, reverb: 0.45, ducked: true });
      }
    }
  });
}

function pluck(beat: number, note: number, gain = 1, pan = 0) {
  const start = at(beat);
  const hz = midi(note);
  const f = lowpass();
  let p = 0;
  for (let j = 0; j < Math.round(0.35 * SR); j++) {
    const t = j / SR;
    const dt = hz / SR;
    p = (p + dt) % 1;
    const sq = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
    const v = f(sq, 600 + 5_000 * Math.exp(-t * 30), 1.3).lp * Math.exp(-t * 11);
    write(start + j, v * 0.1 * gain, { pan, delay: 0.35, reverb: 0.2 });
  }
}

function riser(fromBeat: number, toBeat: number, gain = 1) {
  const start = at(fromBeat);
  const len = at(toBeat) - start;
  const f = lowpass();
  let phase = 0;
  for (let j = 0; j < len; j++) {
    const x = j / len;
    const cutoff = 300 + 9_000 * x ** 2.2;
    const n = f(noise(), cutoff, 2.2).bp;
    phase += (TAU * (180 + 1_400 * x ** 2)) / SR;
    const tone = Math.sin(phase) * 0.18 * x;
    write(start + j, (n * 0.5 + tone) * x ** 1.6 * 0.35 * gain, { pan: Math.sin(x * 9) * 0.6, reverb: 0.3 });
  }
}

function impact(beat: number, gain = 1) {
  const start = at(beat);
  const f = lowpass();
  let phase = 0;
  for (let j = 0; j < Math.round(2.4 * SR); j++) {
    const t = j / SR;
    phase += (TAU * (30 + 50 * Math.exp(-t * 6))) / SR;
    const sub = Math.sin(phase) * Math.exp(-t * 2.4);
    const crash = f(noise(), 3_000 + 6_000 * Math.exp(-t * 3), 0.6).hp * Math.exp(-t * 3.2);
    write(start + j, (Math.tanh(sub * 1.8) * 0.55 + crash * 0.22) * gain, { reverb: 0.5 });
  }
}

function reverse(fromBeat: number, toBeat: number, notes: number[], gain = 1) {
  const start = at(fromBeat);
  const len = at(toBeat) - start;
  notes.forEach((note, n) => {
    const hz = midi(note);
    let p = n * 0.21;
    for (let j = 0; j < len; j++) {
      const x = j / len;
      p = (p + hz / SR) % 1;
      const v = Math.sin(TAU * p) + 0.3 * Math.sin(TAU * p * 2);
      write(start + j, v * x ** 3 * 0.06 * gain, { pan: (n - 1) * 0.4, reverb: 0.6 });
    }
  });
}

// ---------- arrangement ----------

const CUTS = SCENES.map((s) => s.from).filter((b) => b > 0);
const outro = SCENES.find((s) => s.id === "outro")!.from;
const groove = { from: 4, to: outro - 1 };

// Am – F – C – G, then Am – F – Dm – E into the payoff.
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 45, tones: [57, 60, 64, 71] },
  { root: 41, tones: [57, 60, 65, 69] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
  { root: 45, tones: [57, 60, 64, 71] },
  { root: 41, tones: [57, 60, 65, 69] },
  { root: 38, tones: [57, 62, 65, 69] },
  { root: 40, tones: [56, 59, 64, 68] },
];
const chordAt = (b: number) => CHORDS[Math.floor(b / 4) % CHORDS.length];

// Intro: pad swell, typewriter ticks over the boot screen, riser into the first cut.
pad(0, [57, 64, 71, 76], 4, 1.2, 0.6);
for (let b = 0.5; b < 3.5; b += 0.25) if (noise() > -0.35) tick(b + noise() * 0.03, 0.8);
riser(1.5, 4, 0.9);

// Groove.
for (let b = groove.from; b < groove.to; b++) {
  kick(b);
  hat(b + 0.5, 1, b % 4 === 3);
  if (b >= 10) hat(b + 0.25, 0.45, false, -0.3), hat(b + 0.75, 0.45, false, -0.3);
  if (b % 2 === 1 && b >= 10) clap(b, 0.8);
}
for (let bar = groove.from; bar < groove.to; bar += 4) pad(bar, chordAt(bar).tones, Math.min(4, groove.to - bar), 1, bar >= 16 ? 1.5 : 1);
for (let b = groove.from; b < groove.to; b += 0.5) {
  const c = chordAt(b);
  const step = Math.round(b * 2) % 8;
  bass(b, c.root + (step === 3 || step === 7 ? 12 : 0), 0.42, step % 2 ? 0.8 : 1);
}

// Arpeggio from the map onwards.
const ARP = [0, 2, 1, 3, 2, 1, 3, 0];
for (let b = 16; b < groove.to; b += 0.25) {
  const c = chordAt(b);
  const k = Math.round(b * 4) % 8;
  pluck(b, c.tones[ARP[k] % c.tones.length] + 12, b >= 24 ? 1.1 : 0.8, k % 2 ? 0.45 : -0.45);
}

// Heartbeat under the canon's pulse, stabs on each fact card.
for (let b = 24; b < 31; b += 1) kick(b + 0.25, 0.45);
for (let b = 31; b < outro - 1; b++) pad(b, chordAt(b).tones.map((n) => n + 12), 0.4, 1.4, 2.2);

// Build and payoff.
riser(outro - 4, outro, 1.2);
reverse(outro - 1, outro, [64, 69, 72]);
for (const c of CUTS) impact(c, c === outro ? 1.25 : 0.55);
kick(outro, 1.2);
pad(outro, [45, 57, 64, 71, 76, 79], BEATS - outro - 1.5, 1.6, 1.6);
bass(outro, 33, 3, 1.1);
[0, 0.75, 1.5, 2.25, 3].forEach((o, i) => pluck(outro + o, [76, 79, 83, 84, 88][i], 0.9 - i * 0.1, i % 2 ? 0.5 : -0.5));

// ---------- effects & master ----------

function sidechain() {
  for (let i = 0; i < N; i++) {
    const g = 0.3 + 0.7 * duck[i];
    L[i] += duckedL[i] * g;
    R[i] += duckedR[i] * g;
  }
}

function pingPong(inL: Float32Array, inR: Float32Array) {
  const d = Math.round(BEAT * 0.75 * SR);
  const outL = new Float32Array(N),
    outR = new Float32Array(N);
  const fl = lowpass(),
    fr = lowpass();
  for (let i = 0; i < N; i++) {
    const bl = i >= d ? outR[i - d] : 0;
    const br = i >= d ? outL[i - d] : 0;
    outL[i] = inL[i] + fl(bl, 3_500).lp * 0.45;
    outR[i] = inR[i] * 0.2 + fr(br, 3_500).lp * 0.45;
  }
  for (let i = 0; i < N; i++) {
    sendL[i] += outL[i] * 0.3;
    sendR[i] += outR[i] * 0.3;
    L[i] += outL[i] - inL[i];
    R[i] += outR[i] - inR[i];
  }
}

/** Freeverb: eight damped combs and four allpasses per channel. */
function freeverb(input: Float32Array, spread: number) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(((n + spread) * SR) / 44_100));
  const allpasses = [556, 441, 341, 225].map((n) => Math.round(((n + spread) * SR) / 44_100));
  const out = new Float32Array(N);
  const room = 0.86,
    damp = 0.3;
  for (const size of combs) {
    const buf = new Float32Array(size);
    let idx = 0,
      store = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      store = y * (1 - damp) + store * damp;
      buf[idx] = input[i] * 0.015 + store * room;
      out[i] += y;
      idx = (idx + 1) % size;
    }
  }
  for (const size of allpasses) {
    const buf = new Float32Array(size);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[idx];
      const x = out[i];
      buf[idx] = x + b * 0.5;
      out[i] = b - x;
      idx = (idx + 1) % size;
    }
  }
  return out;
}

pingPong(delayL, delayR);
sidechain();
const wetL = freeverb(sendL, 0);
const wetR = freeverb(sendR, 23);
for (let i = 0; i < N; i++) {
  L[i] += wetL[i] * 0.9;
  R[i] += wetR[i] * 0.9;
}

// Gentle glue, soft clip, fade the last half second, normalise to -1 dBFS.
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / (0.5 * SR));
  L[i] = Math.tanh(L[i] * 1.25) * fade;
  R[i] = Math.tanh(R[i] * 1.25) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 10 ** (-1 / 20) / (peak || 1);

const pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(Math.round(clamp(L[i] * norm, -1, 1) * 32_767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(clamp(R[i] * norm, -1, 1) * 32_767), 46 + i * 4);
}
writeFileSync("public/score.wav", pcm);
console.log(`public/score.wav · ${LENGTH.toFixed(1)} s · ${BPM} BPM · cuts on beats ${CUTS.join(", ")}`);
