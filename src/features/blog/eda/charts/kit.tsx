// Shared pieces for the EDA charts: figure frame, ink-style controls, tooltip, scales, kinds and metrics.
// Colour appears only in marks (CSS data tokens --d1..--d8), so both themes follow the stylesheet without re-computation.
import { useId, useRef, useState, type ReactNode } from "react";
import { locale, useLang, type Lang } from "../../../../i18n/index.ts";
import { useSize } from "../../../../ui/useSize.ts";
import type { Book, Kind } from "../data.ts";

/* ---------- numbers ---------- */

export const scale = (d0: number, d1: number, r0: number, r1: number) => {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
};

export function ticks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export const extent = (xs: number[]): [number, number] => {
  let lo = Infinity,
    hi = -Infinity;
  for (const x of xs) if (Number.isFinite(x)) ((lo = Math.min(lo, x)), (hi = Math.max(hi, x)));
  return lo === Infinity ? [0, 1] : [lo, hi];
};

export const pad = ([a, b]: [number, number], f = 0.06): [number, number] => {
  const d = (b - a || Math.abs(a) || 1) * f;
  return [a - d, b + d];
};

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
export const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
};

export function pearson(xs: number[], ys: number[]) {
  const mx = mean(xs),
    my = mean(ys);
  let n = 0,
    dx = 0,
    dy = 0;
  xs.forEach((x, i) => {
    n += (x - mx) * (ys[i] - my);
    dx += (x - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  });
  return dx && dy ? n / Math.sqrt(dx * dy) : 0;
}

export function linearFit(xs: number[], ys: number[]) {
  const mx = mean(xs),
    my = mean(ys);
  let n = 0,
    d = 0;
  xs.forEach((x, i) => ((n += (x - mx) * (ys[i] - my)), (d += (x - mx) ** 2)));
  const slope = d ? n / d : 0;
  return (x: number) => my + slope * (x - mx);
}

/** Locally weighted linear regression (tricube kernel over the nearest `span` share of points). */
export function loess(xs: number[], ys: number[], at: number[], span = 0.6) {
  const n = xs.length;
  const k = Math.max(3, Math.ceil(span * n));
  return at.map((x0) => {
    const d = xs.map((x) => Math.abs(x - x0));
    const h = [...d].sort((a, b) => a - b)[Math.min(k, n) - 1] || 1;
    let sw = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    xs.forEach((x, i) => {
      const u = d[i] / (h * 1.0001);
      if (u >= 1) return;
      const w = (1 - u ** 3) ** 3;
      sw += w;
      sx += w * x;
      sy += w * ys[i];
      sxx += w * x * x;
      sxy += w * x * ys[i];
    });
    if (!sw) return NaN;
    const mx = sx / sw,
      my = sy / sw;
    const vx = sxx / sw - mx * mx;
    const b = vx > 1e-12 ? (sxy / sw - mx * my) / vx : 0;
    return my + b * (x0 - mx);
  });
}

/** Gaussian kernel smoother over years (weights by book, so a year with many stories does not dominate less than it should). */
export function smoothByYear(xs: number[], ys: number[], at: number[], bandwidth = 2.5) {
  return at.map((x0) => {
    let sw = 0,
      s = 0;
    xs.forEach((x, i) => {
      const w = Math.exp(-0.5 * ((x - x0) / bandwidth) ** 2);
      sw += w;
      s += w * ys[i];
    });
    return sw ? s / sw : NaN;
  });
}

export const nf = (lang: Lang, digits = 0) => new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtN = (lang: Lang, v: number, digits = 0) => nf(lang, digits).format(v);

/* ---------- books & kinds ---------- */

export const KIND_META: Record<Kind, { color: string; en: string; ru: string; enP: string; ruP: string }> = {
  novel: { color: "var(--d1)", en: "novel", ru: "роман", enP: "novels", ruP: "романы" },
  novella: { color: "var(--d2)", en: "novella", ru: "повесть", enP: "novellas", ruP: "повести" },
  story: { color: "var(--d3)", en: "story", ru: "рассказ", enP: "stories", ruP: "рассказы" },
  essay: { color: "var(--d4)", en: "essay", ru: "эссе", enP: "essays", ruP: "эссе" },
  interview: { color: "var(--d5)", en: "interview", ru: "интервью", enP: "interviews", ruP: "интервью" },
};

export const title = (b: Book, lang: Lang) => (lang === "ru" ? b.title : b.titleEn || b.title);

/** A glyph per kind so identity never rests on colour alone. */
export function Mark({ kind, x, y, r, fill, stroke, strokeWidth = 1.5, opacity = 1 }: { kind: Kind; x: number; y: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }) {
  const style = { fill: fill ?? KIND_META[kind].color, stroke: stroke ?? "var(--paper)", strokeWidth, opacity };
  switch (kind) {
    case "novella": {
      const s = r * 0.9;
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} style={style} />;
    }
    case "story": {
      const s = r * 1.2;
      return <path d={`M${x},${y - s} L${x + s * 0.95},${y + s * 0.7} L${x - s * 0.95},${y + s * 0.7}Z`} style={style} />;
    }
    case "essay": {
      const s = r * 1.15;
      return <path d={`M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y}Z`} style={style} />;
    }
    case "interview": {
      const s = r * 0.95;
      return <path d={`M${x - s},${y - s * 0.35}h${s * 0.65}v${-s * 0.65}h${s * 0.7}v${s * 0.65}h${s * 0.65}v${s * 0.7}h${-s * 0.65}v${s * 0.65}h${-s * 0.7}v${-s * 0.65}h${-s * 0.65}Z`} style={style} />;
    }
    default:
      return <circle cx={x} cy={y} r={r} style={style} />;
  }
}

export function KindKey({ kind }: { kind: Kind }) {
  return (
    <svg className="eda-key" viewBox="-7 -7 14 14" width="12" height="12" aria-hidden="true">
      <Mark kind={kind} x={0} y={0} r={5} strokeWidth={0} />
    </svg>
  );
}

/* ---------- controls (ink, not colour) ---------- */

export function Chips<T extends string>({ label, options, value, onChange, render }: { label: string; options: T[]; value: Set<T>; onChange: (next: Set<T>) => void; render: (o: T) => ReactNode }) {
  return (
    <div className="eda-control" role="group" aria-label={label}>
      <span className="eda-control-label">{label}</span>
      <div className="eda-chips">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className="eda-chip"
            aria-pressed={value.has(o)}
            onClick={() => {
              const next = new Set(value);
              if (next.has(o)) next.delete(o);
              else next.add(o);
              if (next.size) onChange(next);
            }}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="eda-control" role="group" aria-label={label}>
      <span className="eda-control-label">{label}</span>
      <div className="eda-seg">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Select<T extends string>({ label, value, onChange, children }: { label: string; value: T; onChange: (v: T) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="eda-control">
      <label className="eda-control-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="eda-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {children}
      </select>
    </div>
  );
}

/** Books grouped by kind, for selects. */
export function BookOptions({ books, lang }: { books: Book[]; lang: Lang }) {
  return (
    <>
      {(Object.keys(KIND_META) as Kind[]).map((k) => {
        const list = books.filter((b) => b.kind === k);
        if (!list.length) return null;
        return (
          <optgroup key={k} label={KIND_META[k][lang === "ru" ? "ruP" : "enP"]}>
            {list.map((b) => (
              <option key={b.id} value={b.id}>
                {title(b, lang)} · {b.year}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/* ---------- figure frame ---------- */

const FIG = { en: { fig: "Fig.", table: "Data table" }, ru: { fig: "Рис.", table: "Таблица данных" } };

export function Figure({
  n,
  title: heading,
  caption,
  controls,
  children,
  table,
  wide = true,
  id,
}: {
  n: number;
  title: ReactNode;
  caption: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  table?: ReactNode;
  wide?: boolean;
  id?: string;
}) {
  const lang = useLang();
  const t = FIG[lang];
  return (
    <figure className={`eda-fig${wide ? " wide" : ""}`} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <header className="eda-fig-head">
        <span className="eda-fig-n">
          {t.fig} {n}
        </span>
        <h3 className="eda-fig-title" id={id ? `${id}-title` : undefined}>
          {heading}
        </h3>
      </header>
      {controls && <div className="eda-controls">{controls}</div>}
      <div className="eda-plot">{children}</div>
      <figcaption className="eda-caption">{caption}</figcaption>
      {table && (
        <details className="eda-table">
          <summary>{t.table}</summary>
          <div className="eda-table-scroll">{table}</div>
        </details>
      )}
    </figure>
  );
}

/* ---------- tooltip ---------- */

export type TipState = { x: number; y: number; content: ReactNode } | null;

export function useTip() {
  const [tip, setTip] = useState<TipState>(null);
  return [tip, setTip] as const;
}

/** Positioned inside a `position: relative` box; flips to stay within `width`. */
export function Tip({ tip, width }: { tip: TipState; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!tip) return null;
  const w = Math.min(260, width - 8);
  const left = tip.x + 14 + w > width ? Math.max(4, tip.x - 14 - w) : tip.x + 14;
  const top = Math.max(0, tip.y - 12);
  return (
    <div ref={ref} className="eda-tip" style={{ left, top, maxWidth: w }} role="status" aria-live="polite">
      {tip.content}
    </div>
  );
}

/** Chart box that measures its width. */
export function usePlot(height = 360) {
  const [ref, size] = useSize<HTMLDivElement>({ width: 680, height });
  return [ref, Math.max(280, Math.floor(size.width))] as const;
}

/* ---------- metrics ---------- */

export type Metric = keyof Pick<
  Book,
  "year" | "words" | "sentences" | "lemmas" | "mattr" | "sentenceLen" | "sentenceLenP90" | "wordLen" | "dialogueShare" | "questionShare" | "exclaimShare" | "hapaxShare" | "pronounI" | "pronounWe"
>;

export const METRICS: Record<Metric, { en: string; ru: string; unit?: "pct" | "int" | "dec1" | "dec2" | "dec3" | "year"; log?: boolean }> = {
  year: { en: "Year", ru: "Год", unit: "year" },
  words: { en: "Length, words", ru: "Длина, слов", unit: "int", log: true },
  sentences: { en: "Sentences", ru: "Предложений", unit: "int", log: true },
  lemmas: { en: "Distinct lemmas", ru: "Разных лемм", unit: "int", log: true },
  mattr: { en: "Lexical richness (MATTR, window 500)", ru: "Разнообразие словаря (MATTR, окно 500)", unit: "dec3" },
  sentenceLen: { en: "Mean sentence, words", ru: "Средняя фраза, слов", unit: "dec1" },
  sentenceLenP90: { en: "Long sentences (90th pct), words", ru: "Длинные фразы (90-й перц.), слов", unit: "dec1" },
  wordLen: { en: "Mean word, letters", ru: "Среднее слово, букв", unit: "dec2" },
  dialogueShare: { en: "Dialogue (share of paragraphs)", ru: "Диалог (доля абзацев)", unit: "pct" },
  questionShare: { en: "Questions (share of sentences)", ru: "Вопросы (доля предложений)", unit: "pct" },
  exclaimShare: { en: "Exclamations (share of sentences)", ru: "Восклицания (доля предложений)", unit: "pct" },
  hapaxShare: { en: "Lemmas used once (share)", ru: "Леммы-одиночки (доля)", unit: "pct" },
  pronounI: { en: "“I” per 1k words", ru: "«Я» на 1000 слов", unit: "dec1" },
  pronounWe: { en: "“We” per 1k words", ru: "«Мы» на 1000 слов", unit: "dec1" },
};

export function fmtMetric(m: Metric, v: number, lang: Lang) {
  const u = METRICS[m].unit;
  if (u === "year") return String(v);
  if (u === "pct") return `${fmtN(lang, v * 100, 1)}%`;
  if (u === "int") return fmtN(lang, v);
  if (u === "dec1") return fmtN(lang, v, 1);
  if (u === "dec2") return fmtN(lang, v, 2);
  if (u === "dec3") return fmtN(lang, v, 3);
  return fmtN(lang, v, 2);
}

/** Compact tick label. */
export function fmtTick(m: Metric | "raw", v: number, lang: Lang) {
  if (m === "year") return String(Math.round(v));
  if (m !== "raw" && METRICS[m].unit === "pct") return `${fmtN(lang, v * 100)}%`;
  if (Math.abs(v) >= 10000) return `${fmtN(lang, v / 1000)}k`;
  if (Math.abs(v) >= 100 || Number.isInteger(v)) return fmtN(lang, v);
  return fmtN(lang, v, Math.abs(v) < 1 ? 2 : 1);
}

/** Tooltip body for a book. */
export function BookCard({ b, lang, extra }: { b: Book; lang: Lang; extra?: ReactNode }) {
  const k = KIND_META[b.kind];
  return (
    <>
      <b className="eda-tip-title">{title(b, lang)}</b>
      {lang === "en" && b.titleEn && b.titleEn !== b.title && <span className="eda-tip-sub">{b.title}</span>}
      <span className="eda-tip-meta">
        <KindKey kind={b.kind} /> {lang === "ru" ? k.ru : k.en} · {b.year} · {fmtN(lang, b.words)} {lang === "ru" ? "сл." : "words"}
      </span>
      {extra}
    </>
  );
}

/** Pointer position relative to an element. */
export const local = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

/** Year ticks at decade (or `every`-year) boundaries, dropping any closer than `gap` px to the previous one. */
export function yearMarks(books: Book[], pos: (i: number) => number, gap = 34, every = 10) {
  const out: { b: Book; i: number }[] = [];
  books.forEach((b, i) => {
    if (i && Math.floor(b.year / every) === Math.floor(books[i - 1].year / every)) return;
    if (out.length && pos(i) - pos(out[out.length - 1].i) < gap) return;
    out.push({ b, i });
  });
  return out;
}
