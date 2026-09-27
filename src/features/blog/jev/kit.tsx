// Small chart kit for "From image to idea": figure frame, controls, tooltip, scales and an animation hook.
// Colour lives in marks only (CSS tokens), so both themes follow the stylesheet.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { locale, useLang, type Lang } from "../../../i18n/index.ts";
import { useSize } from "../../../ui/useSize.ts";

export const scale = (d0: number, d1: number, r0: number, r1: number) => {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
};

export function ticks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step)
    out.push(+v.toFixed(10));
  return out;
}

export const fmt = (lang: Lang, v: number, digits = 2) =>
  new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
export const signed = (lang: Lang, v: number, digits = 2) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(lang, Math.abs(v), digits)}`;
export const pct = (lang: Lang, v: number, digits = 1) =>
  `${fmt(lang, v * 100, digits)}%`;
export const pval = (lang: Lang, p: number) =>
  p < 0.001
    ? lang === "ru"
      ? "p < 0,001"
      : "p < 0.001"
    : `p = ${fmt(lang, p, 3)}`;

/** Locally weighted linear regression with a tricube kernel over the nearest `span` share of points. */
export function loess(xs: number[], ys: number[], at: number[], span = 0.7) {
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

/** Animates a list of numbers towards new targets (ease-out, ~600 ms); instant under reduced motion. */
export function useTween(target: number[], duration = 650) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);
  current.current = value;
  const key = target
    .map((v) => (Number.isFinite(v) ? v.toFixed(5) : "x"))
    .join(",");
  useEffect(() => {
    if (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return setValue(target);
    from.current =
      current.current.length === target.length ? current.current : target;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setValue(
        target.map((v, i) =>
          Number.isFinite(v) && Number.isFinite(from.current[i])
            ? from.current[i] + (v - from.current[i]) * e
            : v,
        ),
      );
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return value;
}

/** Chart box that measures its own width. */
export function usePlot(fallback = 720) {
  const [ref, size] = useSize<HTMLDivElement>({ width: fallback, height: 400 });
  return [ref, Math.max(280, Math.floor(size.width))] as const;
}

export type TipState = { x: number; y: number; content: ReactNode } | null;

/** A tooltip inside a `position: relative` box that flips to stay within `width`. */
export function Tip({ tip, width }: { tip: TipState; width: number }) {
  if (!tip) return null;
  const w = Math.min(280, width - 8);
  const left =
    tip.x + 16 + w > width ? Math.max(4, tip.x - 16 - w) : tip.x + 16;
  return (
    <div
      className="jv-tip"
      style={{ left, top: Math.max(0, tip.y - 14), maxWidth: w }}
      role="status"
      aria-live="polite"
    >
      {tip.content}
    </div>
  );
}

export const local = (e: {
  clientX: number;
  clientY: number;
  currentTarget: Element;
}) => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

export function Seg<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="jv-control" role="radiogroup" aria-label={label}>
      <span className="jv-control-label">{label}</span>
      <div className="jv-seg">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const FIG = { en: "Fig.", ru: "Рис." };

/** True once the figure has scrolled into view: charts grow from zero then, not before. */
const SeenContext = createContext(true);
export const useSeen = () => useContext(SeenContext);
/** `values` while the figure is in view, zeros before, so a chart grows in as the reader reaches it. */
export const useGrow = (values: number[]) => {
  const seen = useSeen();
  return seen ? values : values.map(() => 0);
};

export function Figure({
  n,
  title,
  caption,
  controls,
  children,
  id,
}: {
  n: number;
  title: ReactNode;
  caption: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const lang = useLang();
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setSeen(true),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <SeenContext.Provider value={seen}>
      <figure ref={ref} className={`jv-fig ${seen ? "seen" : ""}`} id={id}>
        <header className="jv-fig-head">
          <span className="jv-fig-n">
            {FIG[lang]} {n}
          </span>
          <h3 className="jv-fig-title">{title}</h3>
        </header>
        {controls && <div className="jv-controls">{controls}</div>}
        <div className="jv-plot">{children}</div>
        <figcaption className="jv-caption">{caption}</figcaption>
      </figure>
    </SeenContext.Provider>
  );
}

/** A sentence of the corpus, set as a pull quote that opens the reader on it. */
export function Line({
  r,
  source,
  big = false,
}: {
  r: { id: string; page: number; s: number; text: string };
  source: ReactNode;
  big?: boolean;
}) {
  return (
    <a
      className={`jv-line ${big ? "big" : ""}`}
      href={`#/book/${r.id}?page=${r.page}&s=${r.s}`}
      lang="ru"
    >
      <q>{r.text}</q>
      <span className="jv-line-src">{source}</span>
    </a>
  );
}
