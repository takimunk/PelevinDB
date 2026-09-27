import "./wordmark.css";

// ASCII art in the style of FIGlet's "ANSI Shadow", generated once (by hand-drawn glyphs) and kept as constants.
// "DB" is sheared one column per row, so it leans like italic. Two layouts: one line, and stacked for narrow screens.
const WIDE = `
██████╗ ███████╗██╗     ███████╗██╗   ██╗██╗███╗   ██╗        ██████╗ ██████╗
██╔══██╗██╔════╝██║     ██╔════╝██║   ██║██║████╗  ██║       ██╔══██╗██╔══██╗
██████╔╝█████╗  ██║     █████╗  ██║   ██║██║██╔██╗ ██║      ██║  ██║██████╔╝
██╔═══╝ ██╔══╝  ██║     ██╔══╝  ╚██╗ ██╔╝██║██║╚██╗██║     ██║  ██║██╔══██╗
██║     ███████╗███████╗███████╗ ╚████╔╝ ██║██║ ╚████║    ██████╔╝██████╔╝
╚═╝     ╚══════╝╚══════╝╚══════╝  ╚═══╝  ╚═╝╚═╝  ╚═══╝   ╚═════╝ ╚═════╝
`.slice(1, -1);
const STACKED = `
██████╗ ███████╗██╗     ███████╗██╗   ██╗██╗███╗   ██╗
██╔══██╗██╔════╝██║     ██╔════╝██║   ██║██║████╗  ██║
██████╔╝█████╗  ██║     █████╗  ██║   ██║██║██╔██╗ ██║
██╔═══╝ ██╔══╝  ██║     ██╔══╝  ╚██╗ ██╔╝██║██║╚██╗██║
██║     ███████╗███████╗███████╗ ╚████╔╝ ██║██║ ╚████║
╚═╝     ╚══════╝╚══════╝╚══════╝  ╚═══╝  ╚═╝╚═╝  ╚═══╝

                                      ██████╗ ██████╗
                                     ██╔══██╗██╔══██╗
                                    ██║  ██║██████╔╝
                                   ██║  ██║██╔══██╗
                                  ██████╔╝██████╔╝
                                 ╚═════╝ ╚═════╝
`.slice(1, -1);

/**
 * The same art as an SVG path, for small sizes: text rendering leaves hairline seams between block cells
 * (notably in iOS Safari), a path does not. Cells are 6×10 units (a monospace cell is 0.6em × 1em); █ is a
 * solid cell, the box-drawing "shadow" (═ ║ ╔ ╗ ╚ ╝) is drawn as double hairlines from the cell centre.
 */
function artPath(art: string) {
  const W = 6;
  const H = 10;
  const t = 0.55; // hairline thickness
  const g = 1.3; // gap between the two lines of a double stroke
  const arms: Record<string, string> = { "═": "lr", "║": "ud", "╔": "rd", "╗": "ld", "╚": "ru", "╝": "lu" };
  const rect = (x: number, y: number, w: number, h: number) => `M${+x.toFixed(2)} ${+y.toFixed(2)}h${+w.toFixed(2)}v${+h.toFixed(2)}h${+(-w).toFixed(2)}z`;
  let d = "";
  const rows = art.split("\n");
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const x = c * W;
      const y = r * H;
      if (ch === "█") d += rect(x, y, W + 0.02, H + 0.02);
      const a = arms[ch];
      if (!a) return;
      const cx = x + W / 2;
      const cy = y + H / 2;
      for (const o of [-g, g]) {
        // horizontal arms sit on the lines y = cy ± g; vertical ones on x = cx ± g
        if (a.includes("l")) d += rect(x, cy + o - t / 2, W / 2 + (a.includes("u") || a.includes("d") ? -o * (a.includes("u") ? -1 : 1) : 0) + t / 2, t);
        if (a.includes("r")) d += rect(cx + (a.includes("u") || a.includes("d") ? o * (a.includes("u") ? -1 : 1) : 0) - t / 2, cy + o - t / 2, W / 2 + t / 2 - (a.includes("u") || a.includes("d") ? o * (a.includes("u") ? -1 : 1) : 0), t);
        if (a.includes("u")) d += rect(cx + o - t / 2, y, t, H / 2 + t / 2);
        if (a.includes("d")) d += rect(cx + o - t / 2, cy - t / 2, t, H / 2 + t / 2);
      }
    });
  });
  const cols = Math.max(...rows.map((r) => [...r].length));
  return { d, w: cols * W, h: rows.length * H };
}
const WIDE_PATH = artPath(WIDE);

/**
 * The PelevinDB logo as block-letter art. Both sizes render the one-line and the stacked layout and let CSS
 * pick: `header` is small (about 6px per cell, stacked on phones), `hero` scales to its container.
 * Ink only, both themes. The art is decorative; the wrapper carries the name.
 */
export function Wordmark({ size }: { size: "header" | "hero" }) {
  return (
    <span className={`wordmark wordmark-${size}`} role="img" aria-label="PelevinDB">
      <pre className="wordmark-art wordmark-art-wide" aria-hidden="true">
        {WIDE}
      </pre>
      <pre className="wordmark-art wordmark-art-stacked" aria-hidden="true">
        {STACKED}
      </pre>
      {size === "hero" && (
        <svg className="wordmark-svg" viewBox={`0 0 ${WIDE_PATH.w} ${WIDE_PATH.h}`} aria-hidden="true" focusable="false">
          <path d={WIDE_PATH.d} fill="currentColor" />
        </svg>
      )}
    </span>
  );
}
