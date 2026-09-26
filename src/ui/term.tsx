import { useRef, type MouseEvent, type ReactNode } from "react";
import { useSize } from "./useSize.ts";

/** Advance width of JetBrains Mono, in em. */
export const CHAR_EM = 0.6;

export type Cell = { ch: string; color?: string; dim?: boolean };
export type Row = Cell[];

/** How many monospace columns fit into the element. */
export function useCols<T extends HTMLElement>(fontPx: number, min = 20, max = 400) {
  const [ref, { width }] = useSize<T>();
  const cols = Math.max(min, Math.min(max, Math.floor(width / (fontPx * CHAR_EM)) || min));
  return [ref, cols] as const;
}

/** Renders rows of coloured cells, merging runs of the same colour into one span. */
export function Grid({
  rows,
  className = "",
  onPick,
  onHover,
  label,
}: {
  rows: Row[];
  className?: string;
  onPick?: (x: number, y: number) => void;
  onHover?: (x: number | null, y: number | null) => void;
  label?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const at = (e: MouseEvent) => {
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    const cell = parseFloat(getComputedStyle(el).fontSize) * CHAR_EM;
    return [Math.floor((e.clientX - rect.left) / cell), Math.floor(((e.clientY - rect.top) / rect.height) * rows.length)] as const;
  };
  return (
    <pre
      ref={ref}
      className={`grid-text ${onPick ? "pickable" : ""} ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      onClick={onPick ? (e) => onPick(...at(e)) : undefined}
      onMouseMove={onHover ? (e) => onHover(...at(e)) : undefined}
      onMouseLeave={onHover ? () => onHover(null, null) : undefined}
    >
      {rows.map((row, y) => {
        const spans: ReactNode[] = [];
        let start = 0;
        for (let x = 1; x <= row.length; x++) {
          const a = row[start],
            b = row[x];
          if (x < row.length && b.color === a.color && b.dim === a.dim) continue;
          const text = row
            .slice(start, x)
            .map((c) => c.ch)
            .join("");
          spans.push(
            a.color || a.dim ? (
              <span key={start} style={a.color ? { color: a.color } : undefined} className={a.dim ? "dim" : undefined}>
                {text}
              </span>
            ) : (
              text
            ),
          );
          start = x;
        }
        return (
          <span key={y} className="grid-row">
            {spans}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

export const text = (s: string, color?: string, dim?: boolean): Row => [...s].map((ch) => ({ ch, color, dim }));

// Braille: each character is a 2×4 dot matrix.
const DOT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

export type Series = { values: (number | null)[]; color: string };

/** btop-style braille line plot of series in [0, 1]. */
export function braillePlot(series: Series[], cols: number, rows: number, fill = false): Row[] {
  const w = cols * 2,
    h = rows * 4;
  const bits = new Uint8Array(cols * rows);
  const owner: (string | undefined)[] = new Array(cols * rows);
  const set = (x: number, y: number, color: string) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = Math.floor(y / 4) * cols + Math.floor(x / 2);
    bits[i] |= DOT[y % 4][x % 2];
    owner[i] = color;
  };
  for (const s of series) {
    const n = s.values.length;
    let prev: number | null = null;
    for (let px = 0; px < w; px++) {
      const t = n > 1 ? (px / (w - 1)) * (n - 1) : 0;
      const i = Math.floor(t),
        f = t - i;
      const a = s.values[i],
        b = s.values[Math.min(n - 1, i + 1)];
      if (a == null || b == null) {
        prev = null;
        continue;
      }
      const v = a + (b - a) * f;
      const py = Math.round((1 - Math.max(0, Math.min(1, v))) * (h - 1));
      if (fill) for (let y = py; y < h; y += 2) set(px, y, s.color);
      if (prev != null) {
        const step = py > prev ? 1 : -1;
        for (let y: number = prev; y !== py; y += step) set(px, y, s.color);
      }
      set(px, py, s.color);
      prev = py;
    }
  }
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const i = r * cols + c;
      return bits[i] ? { ch: String.fromCharCode(0x2800 + bits[i]), color: owner[i] } : { ch: " " };
    }),
  );
}

/** Frame a block of rows with a y-axis gutter: `1.0 ┤`. */
export function withAxis(rows: Row[], top = "1.0", bottom = "0.0"): Row[] {
  const g = Math.max(top.length, bottom.length);
  return rows.map((row, i) => {
    const tag = i === 0 ? top : i === rows.length - 1 ? bottom : "";
    return [...text(tag.padStart(g) + (i === 0 || i === rows.length - 1 ? " ┤" : " │"), undefined, true), ...row];
  });
}
