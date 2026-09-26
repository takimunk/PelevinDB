/** Density ramp from empty to solid. */
export const RAMP = " .·:-=+*#%@";
export const BLOCKS = " ▁▂▃▄▅▆▇█";

export const glyph = (v: number, ramp = RAMP) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(v * (ramp.length - 1))))];

/** `████████░░░░` style gauge. */
export function bar(value: number, width = 20, full = "█", empty = "░") {
  const n = Math.max(0, Math.min(width, Math.round(value * width)));
  return full.repeat(n) + empty.repeat(width - n);
}

/** `──────●──────` style bipolar slider. */
export function slider(value: number, width = 21) {
  const at = Math.max(0, Math.min(width - 1, Math.round(value * (width - 1))));
  return Array.from({ length: width }, (_, i) => (i === at ? "●" : i === (width - 1) / 2 ? "┼" : "─")).join("");
}
