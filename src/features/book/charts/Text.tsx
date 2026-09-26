import { useState, type MouseEvent, type ReactNode } from "react";
import { EMOTIONS, MODES, MOODS, THEMES, type EmotionId, type ThemeId } from "../../../../shared/catalog.ts";
import type { Distribution, SegmentAnalysis } from "../../../../shared/types.ts";
import { ARC_SHAPES, argmax, dominantEmotion, emotionColor, intensity, isParatext, modeColor, moodColor, series, smooth, type Analyses, type ArcId, type Moment } from "../../../domain/analysis.ts";
import type { DnaInsights, Stretch } from "../../../domain/insights.ts";
import { BLOCKS, bar, slider } from "../../../ui/ascii.ts";
import { braillePlot, Grid, text, useCols, withAxis, type Row } from "../../../ui/term.tsx";

const FONT = 12;
const LABEL = 14;

const CALM = "#8fd3ff";
const INTENSE = "#ff4d3a";

const label = (s: string, color?: string) => text(s.toLowerCase().slice(0, LABEL - 1).padEnd(LABEL), color);
const Emo = ({ id }: { id: EmotionId | "neutral" }) => <span style={{ color: emotionColor(id) }}>{id}</span>;

/** Writes `s` into `row` from column `start`, clipped to the row. */
function stamp(row: Row, start: number, s: string, color?: string) {
  [...s].forEach((ch, i) => row[start + i] && (row[start + i] = { ch, color }));
}

const PART_NAMES = ["opening", "middle", "ending"];
const pageRange = (s: Stretch) => (s.from === s.to ? `p.${s.from + 1}` : `p.${s.from + 1}–${s.to + 1}`);

/** The book as an LED rack: one column per page bin, height = intensity, colour = leading emotion. */
export function Dna({ analyses, insights, onPick }: { analyses: Analyses; insights: DnaInsights; onPick: (index: number) => void }) {
  const [ref, cols] = useCols<HTMLDivElement>(FONT, 20, 240);
  const [hover, setHover] = useState<number | null>(null);
  const n = analyses.length;
  const room = Math.max(1, cols - LABEL);
  // Short books repeat each page across several columns so the annotations have room.
  const width = n >= room ? room : Math.max(1, n * Math.floor(room / n));
  const bins = Array.from({ length: width }, (_, c) => {
    const from = Math.floor((c / width) * n),
      to = Math.max(from + 1, Math.floor(((c + 1) / width) * n));
    const pages = analyses.slice(from, to);
    const known = pages.filter((a) => a && !isParatext(a));
    const best = known.reduce<(typeof known)[number] | null>((m, a) => (!m || intensity(a) > intensity(m) ? a : m), null);
    return { from, known: known.length, total: pages.length, best, paratext: pages.some((a) => a && isParatext(a)) && !known.length };
  });
  const lastCol = (index: number) => {
    let c = 0;
    while (c + 1 < bins.length && bins[c + 1].from <= index) c++;
    return c;
  };
  const firstCol = (index: number) => {
    let c = lastCol(index);
    while (c > 0 && bins[c - 1].from === bins[c].from) c--;
    return c;
  };
  const H = bins.some((b) => b.best) ? 10 : 1;
  const rows: Row[] = [];
  const { peak, calm, intense, parts } = insights;
  if (H > 1 && peak) {
    const row = [...label("peak").map((c) => ({ ...c, dim: true })), ...text(" ".repeat(width))];
    const x = Math.floor((firstCol(peak.index) + lastCol(peak.index)) / 2),
      tag = `▼ p.${peak.index + 1}`,
      fits = x + tag.length <= width;
    stamp(row, LABEL + (fits ? x : x - tag.length + 1), fits ? tag : `p.${peak.index + 1} ▼`, emotionColor(peak.emotion));
    rows.push(row);
  }
  for (let r = 0; r < H; r++) {
    const row = label(H === 1 ? "pages" : r === 0 ? "emotion" : r === H - 1 ? "intensity" : "");
    row.forEach((c) => (c.dim = true));
    for (const b of bins) {
      const level = b.best ? intensity(b.best) * H : 0;
      const fromBottom = H - 1 - r;
      const color = b.best ? emotionColor(dominantEmotion(b.best)) : undefined;
      if (!b.best) row.push({ ch: fromBottom === 0 ? (b.paratext ? "×" : "·") : " ", dim: true });
      else if (level >= fromBottom + 1) row.push({ ch: "█", color });
      else if (level > fromBottom) row.push({ ch: BLOCKS[Math.round((level - fromBottom) * 8)] || " ", color });
      else row.push({ ch: fromBottom === 0 ? "·" : " ", dim: true });
    }
    rows.push(row);
  }
  const strip = (name: string, pick: (a: NonNullable<Analyses[number]>) => string) => [
    ...label(name).map((c) => ({ ...c, dim: true })),
    ...bins.map((b) => (b.best ? { ch: "▀", color: pick(b.best) } : { ch: " " })),
  ];
  rows.push(strip("mood", (a) => moodColor(argmax(a.mood))));
  rows.push(strip("narration", (a) => modeColor(argmax(a.mode))));
  if (H > 1 && parts.length) {
    const row = [...label("leads").map((c) => ({ ...c, dim: true })), ...text(" ".repeat(width))];
    for (const p of parts) {
      const from = firstCol(p.from),
        to = lastCol(p.to),
        color = emotionColor(p.emotion);
      stamp(row, LABEL + from, "├" + "─".repeat(Math.max(0, to - from)), color);
      if (to - from >= 4) stamp(row, LABEL + from + 2, ` ${p.emotion} `.slice(0, to - from - 1), color);
    }
    rows.push(row);
  }
  if (H > 1 && (calm || intense)) {
    const row = [...label("stretch").map((c) => ({ ...c, dim: true })), ...text(" ".repeat(width))];
    for (const [s, name, color] of [
      [calm, "calm", CALM],
      [intense, "intense", INTENSE],
    ] as const) {
      if (!s) continue;
      const from = firstCol(s.from),
        to = lastCol(s.to);
      stamp(row, LABEL + from, to > from ? "└" + "─".repeat(Math.max(0, to - from - 1)) + "┘" : "↑", color);
      if (to - from >= name.length + 2) stamp(row, LABEL + from + Math.floor((to - from + 1 - name.length) / 2), name, color);
    }
    rows.push(row);
  }
  const h = hover != null ? bins[hover] : null;
  const pageLink = (s: Stretch, children: ReactNode) => (
    <button className="link" onClick={() => onPick(s.from)}>
      {children}
    </button>
  );
  const lead = parts.map((p) => p.emotion);
  return (
    <div ref={ref}>
      <Grid
        rows={rows}
        label="Emotion DNA of the book"
        onPick={(x) => x >= LABEL && bins[x - LABEL] && onPick(bins[x - LABEL].from)}
        onHover={(x) => setHover(x != null && x >= LABEL && x - LABEL < bins.length ? x - LABEL : null)}
      />
      {H > 1 && peak && (
        <p className="chart-caption">
          {lead.length === 3 && new Set(lead).size === 1 ? (
            <>
              <Emo id={lead[0]} /> leads throughout
            </>
          ) : (
            parts.map((p, i) => (
              <span key={p.from}>
                {i > 0 && ", "}
                {parts.length === 3 ? PART_NAMES[i] : `part ${i + 1}`}: <Emo id={p.emotion} />
              </span>
            ))
          )}
          {" · "}peaks on {pageLink({ from: peak.index, to: peak.index, value: peak.value }, `p.${peak.index + 1}`)} (<Emo id={peak.emotion} /> {peak.value.toFixed(2)})
          {intense && (
            <>
              {" · "}most intense {pageLink(intense, pageRange(intense))} <span className="dim">avg {intense.value.toFixed(2)}</span>
            </>
          )}
          {calm && (
            <>
              {" · "}calmest {pageLink(calm, pageRange(calm))} <span className="dim">avg {calm.value.toFixed(2)}</span>
            </>
          )}
          <span className="dim"> · book avg {insights.mean.toFixed(2)}</span>
        </p>
      )}
      <div className="readout">
        {h ? (
          h.best ? (
            <>
              p.{h.from + 1} · <span style={{ color: emotionColor(dominantEmotion(h.best)) }}>{dominantEmotion(h.best)}</span> {intensity(h.best).toFixed(2)} ·{" "}
              <span style={{ color: moodColor(argmax(h.best.mood)) }}>{argmax(h.best.mood)}</span> · {argmax(h.best.mode)} <span className="dim">· click to read</span>
            </>
          ) : (
            <span className="dim">p.{h.from + 1} · {h.paratext ? "paratext, excluded" : "not analysed yet"}</span>
          )
        ) : (
          <span className="dim">
            {n} pages → {width} columns · █ intensity · ▀ mood / narration · × paratext
          </span>
        )}
      </div>
    </div>
  );
}

type Ridge = { id: string; label: string; color: string; share: number; pick: (a: SegmentAnalysis) => number };

/**
 * Ridgeline: one area chart per row across the book, a dashed line at 0.5 and a shared hover cursor.
 * The right column is the book mean; `value` words the hovered score.
 */
function Ridgeline({
  ridges,
  analyses,
  onPick,
  name,
  share,
  value,
  idle,
}: {
  ridges: Ridge[];
  analyses: Analyses;
  onPick: (p: number) => void;
  name: string;
  share: (v: number) => string;
  value: (v: number) => string;
  idle: string;
}) {
  const [hover, setHover] = useState<{ k: number; p: number } | null>(null);
  const n = Math.max(2, Math.min(analyses.length, 160));
  const W = 1000;
  const data = ridges.map((r) => smooth(series(analyses, r.pick, n), Math.max(0.8, n / 70)).map((v) => v ?? 0));
  const path = (values: number[], close: boolean) => {
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(1 - Math.min(1, v)).toFixed(3)}`);
    return close ? `M0,1 L${pts.join(" L")} L${W},1 Z` : `M${pts.join(" L")}`;
  };
  const at = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const cur = hover ? { r: ridges[hover.k], v: data[hover.k][Math.round(hover.p * (n - 1))] } : null;
  return (
    <div>
      <div className="ridges" role="group" aria-label={name} onMouseLeave={() => setHover(null)}>
        {ridges.map((r, k) => (
          <div key={r.id} className={`ridge-row ${hover && hover.k !== k ? "dim" : ""}`}>
            <span className="ridge-label" style={{ color: r.color }}>
              {r.label.toLowerCase()}
            </span>
            <svg
              viewBox={`0 0 ${W} 1`}
              preserveAspectRatio="none"
              onMouseMove={(e) => setHover({ k, p: at(e) })}
              onClick={(e) => onPick(at(e))}
              role="img"
              aria-label={`${r.label}: book mean ${share(r.share).trim()}`}
            >
              <line x1={0} x2={W} y1={0.5} y2={0.5} className="threshold" vectorEffect="non-scaling-stroke" />
              <path d={path(data[k], true)} style={{ fill: r.color }} className="area" />
              <path d={path(data[k], false)} style={{ stroke: r.color }} className="edge" vectorEffect="non-scaling-stroke" />
              {hover && <line x1={hover.p * W} x2={hover.p * W} y1={0} y2={1} className="cursor-line" vectorEffect="non-scaling-stroke" />}
            </svg>
            <span className="ridge-share">
              {share(r.share)} <span style={{ color: r.color }}>{bar(r.share, 8, "█", "·")}</span>
            </span>
          </div>
        ))}
        <div className="ridge-row ridge-axis">
          <span />
          <span className="dim">beginning</span>
          <span className="dim">end</span>
        </div>
      </div>
      <div className="readout">
        {cur && hover ? (
          <>
            <span style={{ color: cur.r.color }}>{cur.r.label.toLowerCase()}</span> @ {Math.round(hover.p * 100)}% of the book · <b>{value(cur.v)}</b>{" "}
            <span className="dim">· book mean {share(cur.r.share).trim()} · click to read</span>
          </>
        ) : (
          <span className="dim">{idle}</span>
        )}
      </div>
    </div>
  );
}

const percent = (v: number) => `${String(Math.round(v * 100)).padStart(3)}%`;

/** Plutchik's eight emotions over time, in wheel order. */
export function Spectrogram({ analyses, emotions, onPick }: { analyses: Analyses; emotions: Distribution<EmotionId>; onPick: (p: number) => void }) {
  return (
    <div className="ridge-emotions">
      <Ridgeline
        name="Emotion spectrogram"
        analyses={analyses}
        onPick={onPick}
        ridges={EMOTIONS.map((e) => ({ id: e.id, label: e.label, color: e.color, share: emotions[e.id], pick: (a) => a.emotions[e.id] }))}
        share={(v) => v.toFixed(2).padStart(5)}
        value={(v) => `${v.toFixed(2)} intensity`}
        idle="height = how strongly jev reads the emotion on the page, 0 → 1 · dashed = 0.5 · right = book mean"
      />
    </div>
  );
}

const THEME_PALETTE = ["#7dff9a", "#ffd23f", "#6fd6ff", "#ff8fc8", "#ffa640", "#b77dff", "#ff5e57", "#2fe0c0", "#c8d4ff", "#e8ff6a"];

/** The ten strongest themes; height = Noul probability that the page is about the theme. */
export function ThemeLines({ analyses, themes, onPick }: { analyses: Analyses; themes: Distribution<ThemeId>; onPick: (p: number) => void }) {
  const top = THEMES.slice()
    .sort((a, b) => themes[b.id] - themes[a.id])
    .slice(0, 10);
  return (
    <div className="ridge-themes">
      <Ridgeline
        name="Themes across the book"
        analyses={analyses}
        onPick={onPick}
        ridges={top.map((t, k) => ({ id: t.id, label: t.label, color: THEME_PALETTE[k], share: themes[t.id], pick: (a) => a.themes[t.id] }))}
        share={percent}
        value={(v) => `${Math.round(v * 100)}% likely the subject`}
        idle="height = how likely a page is about the theme · dashed = 50% · right = share of the book"
      />
    </div>
  );
}

const MOMENT_TAGS: Record<string, string> = { climax: "climax", still: "stillest", light: "brightest", dark: "darkest", wonder: "surprise", inner: "interiority" };
const GUTTER = 5;
const PLOT_ROWS = 12;

export function PulsePlot({ analyses, moments, onPick }: { analyses: Analyses; moments: Moment[]; onPick: (index: number) => void }) {
  const [ref, cols] = useCols<HTMLDivElement>(FONT, 30, 220);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const width = cols - 6;
  const last = Math.max(1, analyses.length - 1);
  const lines = [
    { id: "tension", label: "tension", color: "#ff4d3a", pick: (a: SegmentAnalysis) => a.texture.tension },
    { id: "pace", label: "pace", color: "#ff9a3c", pick: (a: SegmentAnalysis) => a.texture.pace },
    { id: "valence", label: "light", color: "#ffe9a8", pick: (a: SegmentAnalysis) => a.texture.valence },
    { id: "interiority", label: "interiority", color: "#6f8dff", pick: (a: SegmentAnalysis) => a.texture.interiority },
  ];
  const bins = Math.max(8, Math.min(analyses.length, width * 2));
  const data = lines.map((l) => smooth(series(analyses, l.pick, bins), bins / 40));
  const rows = braillePlot(
    lines.flatMap((l, k) => (off.has(l.id) ? [] : [{ color: l.color, values: data[k] }])),
    width,
    PLOT_ROWS,
  );
  const marks = moments.map((m) => ({ m, x: Math.round((m.index / last) * (width - 1)) })).sort((a, b) => a.x - b.x);
  for (const { m, x } of marks) for (const row of rows) if (row[x].ch === " ") row[x] = { ch: "╎", color: `${m.color}66` };
  // Two label rows; a tag goes to the first row where it does not touch another tag.
  const tags: Row[] = [text(" ".repeat(width)), text(" ".repeat(width))];
  const owner: (Moment | null)[][] = tags.map(() => new Array(width).fill(null));
  for (const { m, x } of marks) {
    const name = MOMENT_TAGS[m.id] ?? m.label.toLowerCase();
    const right = x + name.length + 1 <= width;
    const tag = right ? `▲${name}` : `${name}▲`,
      start = right ? x : x - name.length;
    const free = (r: number, from: number, to: number) => owner[r].slice(Math.max(0, from), Math.min(width, to)).every((o) => !o);
    const r = [0, 1].find((r) => free(r, start - 1, start + tag.length + 1));
    if (r != null) {
      stamp(tags[r], start, tag, m.color);
      for (let i = start; i < start + tag.length; i++) owner[r][i] = m;
    } else if (!owner[0][x]) {
      stamp(tags[0], x, "▲", m.color);
      owner[0][x] = m;
    }
  }
  const near = (x: number) => marks.find((k) => Math.abs(k.x - x) <= 1)?.m ?? null;
  const pickAt = (x: number, y: number) => {
    const c = x - GUTTER;
    if (c < 0 || c >= width) return null;
    return (y >= PLOT_ROWS ? owner[y - PLOT_ROWS]?.[c] : null) ?? near(c) ?? Math.round((c / (width - 1)) * last);
  };
  const cur = hover != null ? { c: hover, m: near(hover), bin: Math.round((hover / (width - 1)) * (bins - 1)) } : null;
  return (
    <div ref={ref}>
      <div className="toggles-row">
        {lines.map((l) => (
          <button key={l.id} className={off.has(l.id) ? "off" : ""} onClick={() => setOff((s) => new Set(s.has(l.id) ? [...s].filter((x) => x !== l.id) : [...s, l.id]))} aria-pressed={!off.has(l.id)}>
            <span style={{ color: l.color }}>{off.has(l.id) ? "○" : "●"}</span> {l.label}
          </button>
        ))}
      </div>
      <Grid
        rows={[...withAxis(rows), ...tags.map((t) => [...text(" ".repeat(GUTTER)), ...t])]}
        label="Pulse of the book"
        onPick={(x, y) => {
          const hit = pickAt(x, y);
          if (hit != null) onPick(typeof hit === "number" ? hit : hit.index);
        }}
        onHover={(x) => setHover(x != null && x >= GUTTER && x - GUTTER < width ? x - GUTTER : null)}
      />
      <div className="readout">
        {cur?.m ? (
          <>
            <span style={{ color: cur.m.color }}>▲ {cur.m.label.toLowerCase()}</span> · p.{cur.m.index + 1} · {cur.m.hint} <span className="dim">· click to read</span>
          </>
        ) : cur ? (
          <>
            p.{Math.round((cur.c / (width - 1)) * last) + 1} ·{" "}
            {lines.map((l, k) => (
              <span key={l.id}>
                <span style={{ color: l.color }}>{l.label}</span> <b>{data[k][cur.bin]?.toFixed(2) ?? "n/a"}</b>{" "}
              </span>
            ))}
            <span className="dim">· click to read</span>
          </>
        ) : (
          <span className="dim">smoothed scores, 0 → 1 · ╎ ▲ extreme pages, found in code from jev answers</span>
        )}
      </div>
      <ol className="pulse-marks">
        {moments.map((m) => (
          <li key={m.id}>
            <button onClick={() => onPick(m.index)}>
              <span style={{ color: m.color }}>▲ {m.label.toLowerCase()}</span>
              <span className="dim">p.{m.index + 1}</span>
              <span>{m.hint}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ArcPlot({ curve, shape, fits }: { curve: number[]; shape: ArcId; fits: { id: ArcId; r: number }[] }) {
  const [ref, cols] = useCols<HTMLDivElement>(FONT, 24, 120);
  const width = cols - 6;
  const lo = Math.min(...curve),
    hi = Math.max(...curve);
  const norm = curve.map((v) => (hi - lo > 1e-6 ? (v - lo) / (hi - lo) : 0.5));
  const best = ARC_SHAPES.find((a) => a.id === shape);
  return (
    <div ref={ref} className="arc">
      <div className="arc-name">
        <span className="ok">match:</span> {best ? best.label.toLowerCase() : "flat line"} <span className="dim">{best ? `— ${best.hint.toLowerCase()}` : "— no clear shape"}</span>
      </div>
      <Grid rows={withAxis(braillePlot([{ values: norm, color: "#ffe9a8" }], width, 8), "hi", "lo")} label="Story shape" />
      <div className="fits">
        {ARC_SHAPES.map((a) => {
          const r = fits.find((f) => f.id === a.id)?.r ?? 0;
          return (
            <div key={a.id} className={a.id === shape ? "on" : ""}>
              <span>{a.label.toLowerCase().padEnd(15)}</span>
              <span className="bar">{bar(Math.max(0, r), 12)}</span>
              <span>{r.toFixed(2).padStart(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Label · gauge · value rows. */
export function Bars({ items, width = 18, sort = true }: { items: { id: string; label: string; value: number; color?: string; note?: string }[]; width?: number; sort?: boolean }) {
  const list = sort ? [...items].sort((a, b) => b.value - a.value) : items;
  const max = Math.max(0.0001, ...list.map((i) => i.value));
  return (
    <div className="bars">
      {list.map((i) => (
        <div key={i.id} className="bars-row">
          <span className="bars-label">{i.label.toLowerCase()}</span>
          <span className="bars-bar" style={{ color: i.color }}>
            {bar(i.value / max, width, "█", "·")}
          </span>
          <span className="bars-value">{String(Math.round(i.value * 100)).padStart(3)}</span>
        </div>
      ))}
    </div>
  );
}

export const MoodBars = ({ mood }: { mood: Record<string, number> }) => <Bars items={MOODS.map((m) => ({ id: m.id, label: m.label, value: mood[m.id] ?? 0, color: m.color }))} />;
export const ModeBars = ({ mode }: { mode: Record<string, number> }) => (
  <Bars items={MODES.filter((m) => m.id !== "paratext").map((m) => ({ id: m.id, label: m.label, value: mode[m.id] ?? 0, color: m.color }))} />
);

export function Sliders({ items }: { items: { id: string; low: string; high: string; value: number; label?: string }[] }) {
  return (
    <div className="sliders">
      {items.map((s) => (
        <div key={s.id} className="slider-row" title={s.label}>
          <span className="slider-low">{s.low.toLowerCase()}</span>
          <span className="slider-track">{slider(s.value, 17)}</span>
          <span className="slider-high">{s.high.toLowerCase()}</span>
          <span className="slider-value">{String(Math.round(s.value * 100)).padStart(3)}</span>
        </div>
      ))}
    </div>
  );
}
