// Shared by the film and the score, so every cut lands on a beat.
export const FPS = 30;
export const BPM = 120;
export const BEATS = 40;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM;
export const DURATION = BEATS * FRAMES_PER_BEAT;

export const SCENES = [
  { id: "boot", from: 0, to: 4 },
  { id: "read", from: 4, to: 10 },
  { id: "dna", from: 10, to: 16 },
  { id: "map", from: 16, to: 24 },
  { id: "pulse", from: 24, to: 31 },
  { id: "facts", from: 31, to: 35 },
  { id: "outro", from: 35, to: 40 },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export const beat = (b: number) => Math.round(b * FRAMES_PER_BEAT);
