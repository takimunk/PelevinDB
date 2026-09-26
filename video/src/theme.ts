import { loadFont } from "@remotion/google-fonts/JetBrainsMono";
import { Easing, interpolate } from "remotion";

export const { fontFamily: mono } = loadFont("normal", { weights: ["300", "400", "500", "700", "800"], subsets: ["latin"] });

// Mirrors src/styles/base.css in the app.
export const C = {
  bg: "#03050a",
  bg2: "#070a12",
  line: "rgba(130, 160, 230, 0.14)",
  line2: "rgba(150, 180, 245, 0.3)",
  ink: "#d6e2f7",
  ink2: "#9fb0cf",
  muted: "#6b7a98",
  faint: "#3e4860",
  green: "#7dff9a",
  green2: "#b9ffc9",
  amber: "#ffa640",
  blue: "#6f8dff",
  red: "#ff4d3a",
  yellow: "#ffd23f",
};

export const EMOTION_COLORS: Record<string, string> = {
  joy: "#ffd23f",
  trust: "#7dff9a",
  fear: "#2fe0c0",
  surprise: "#6fd6ff",
  sadness: "#5a7dff",
  disgust: "#b77dff",
  anger: "#ff4d3a",
  anticipation: "#ff9a3c",
  neutral: "#6f7380",
};

export const easeOut = Easing.bezier(0.2, 0.9, 0.2, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.25, 1);

/** 0 → 1 between two frames, clamped and eased. */
export const progress = (frame: number, from: number, to: number, easing = easeOut) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

export const fmt = (n: number) => n.toLocaleString("en-US");
