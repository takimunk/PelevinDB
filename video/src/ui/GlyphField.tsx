import { random, useCurrentFrame } from "remotion";
import { mono } from "../theme";

const RAMP = " .·:-=+*%#@";
const VERTICES = [
  [0, 1, 0],
  [0.943, -0.333, 0],
  [-0.471, -0.333, 0.816],
  [-0.471, -0.333, -0.816],
];

// The desk screen's chaos-game Sierpinski tetrahedron, rebuilt deterministically.
const POINTS: number[][] = (() => {
  const out: number[][] = [];
  let p = [0, 0, 0];
  for (let i = 0; i < 9000; i++) {
    const v = VERTICES[Math.floor(random(`sierpinski-${i}`) * 4)];
    p = [(p[0] + v[0]) / 2, (p[1] + v[1]) / 2, (p[2] + v[2]) / 2];
    if (i > 20) out.push(p);
  }
  return out;
})();

type Props = { cols?: number; rows?: number; cell?: number; spin?: number; zoom?: number; opacity?: number; offsetY?: number };

/** ASCII rendering of the rotating tetrahedron: density becomes glyph brightness, tinted in LED colours. */
export const GlyphField: React.FC<Props> = ({ cols = 150, rows = 46, cell = 12.8, spin = 0.02, zoom = 1, opacity = 1, offsetY = 0 }) => {
  const frame = useCurrentFrame();
  const a = 0.6 + frame * spin;
  const b = 0.35 + Math.sin(frame * 0.013) * 0.15;
  const grid = new Float32Array(cols * rows);
  const aspect = 0.5;
  const scale = rows * 0.52 * zoom;
  for (const [x0, y0, z0] of POINTS) {
    const x1 = x0 * Math.cos(a) + z0 * Math.sin(a);
    const z1 = -x0 * Math.sin(a) + z0 * Math.cos(a);
    const y1 = y0 * Math.cos(b) - z1 * Math.sin(b);
    const z2 = y0 * Math.sin(b) + z1 * Math.cos(b);
    const persp = 2.6 / (2.6 + z2);
    const cx = Math.round(cols / 2 + (x1 * persp * scale) / aspect);
    const cy = Math.round(rows / 2 - y1 * persp * scale + offsetY);
    if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx] += 0.2 * persp;
  }
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      const v = Math.min(1, grid[y * cols + x]);
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(v * (RAMP.length - 1) + (v > 0 ? 0.6 : 0)))];
    }
    lines.push(line);
  }
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: cell * 1.66,
        lineHeight: `${cell * 1.66}px`,
        letterSpacing: 0,
        whiteSpace: "pre",
        opacity,
        backgroundImage: "linear-gradient(115deg, #7dff9a 0%, #2fe0c0 28%, #6f8dff 55%, #b77dff 75%, #ff8fc8 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        filter: "drop-shadow(0 0 12px rgba(125,255,154,0.25))",
      }}
    >
      {lines.join("\n")}
    </div>
  );
};
