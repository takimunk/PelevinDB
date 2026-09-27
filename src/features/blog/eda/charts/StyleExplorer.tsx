// Fig: scatter of any two style metrics, point size = words, optional linear or LOESS trend, click to pin.
import { useMemo, useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book, Kind } from "../data.ts";
import { KINDS } from "../data.ts";
import {
  BookCard,
  Chips,
  extent,
  Figure,
  fmtMetric,
  fmtN,
  fmtTick,
  KIND_META,
  KindKey,
  linearFit,
  loess,
  Mark,
  METRICS,
  pad,
  pearson,
  scale,
  Seg,
  Select,
  Tip,
  ticks,
  title,
  usePlot,
  useTip,
  type Metric,
} from "./kit.tsx";

type Trend = "none" | "linear" | "loess";

const T = {
  en: {
    title: "Style metrics",
    caption: "Each mark is one work; its area is proportional to length. Choose any two measures; tap or click a mark to pin its label. A work far off the scale is pinned to the edge, with its value.",
    x: "X axis",
    y: "Y axis",
    trend: "Trend",
    none: "none",
    linear: "linear",
    loess: "LOESS",
    kinds: "Forms",
    presets: "Try",
    clear: "Clear pins",
    r: "Pearson r",
    swap: "Swap axes",
    offscale: "off-scale left out",
  },
  ru: {
    title: "Метрики стиля",
    caption:
      "Каждый значок — одно произведение, площадь пропорциональна длине. Выберите любые две метрики; нажмите на значок, чтобы закрепить подпись. Текст, далеко вылетающий за шкалу, прижат к краю, рядом — его значение.",
    x: "Ось X",
    y: "Ось Y",
    trend: "Тренд",
    none: "нет",
    linear: "прямая",
    loess: "LOESS",
    kinds: "Формы",
    presets: "Попробуйте",
    clear: "Снять метки",
    r: "r Пирсона",
    swap: "Поменять оси",
    offscale: "за шкалой не учтены",
  },
};

/** Extent that ignores a far outlier (beyond 3× the 95th-percentile spread), which is then drawn at the axis edge. */
function robust(xs: number[]): [number, number] {
  const [lo, hi] = extent(xs);
  const a = xs.filter(Number.isFinite).sort((p, q) => p - q);
  if (a.length < 10) return [lo, hi];
  const p05 = a[Math.floor(0.05 * (a.length - 1))],
    p95 = a[Math.ceil(0.95 * (a.length - 1))];
  const spread = p95 - p05 || 1;
  return [lo < p05 - 3 * spread ? p05 - spread * 0.3 : lo, hi > p95 + 3 * spread ? p95 + spread * 0.3 : hi];
}

/** 1-2-5 ticks between 10^lo and 10^hi, thinned to at most ~6. */
function logTicks(lo: number, hi: number) {
  const out: number[] = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) for (const m of [1, 2, 5]) out.push(m * 10 ** e);
  const inside = out.filter((v) => Math.log10(v) >= lo && Math.log10(v) <= hi);
  return inside.length > 7 ? inside.filter((v) => Number.isInteger(Math.log10(v))) : inside;
}

const PRESETS: { x: Metric; y: Metric; en: string; ru: string }[] = [
  { x: "year", y: "sentenceLen", en: "sentence length over time", ru: "длина фразы по годам" },
  { x: "year", y: "mattr", en: "richness over time", ru: "разнообразие по годам" },
  { x: "year", y: "dialogueShare", en: "dialogue over time", ru: "диалог по годам" },
  { x: "sentenceLen", y: "dialogueShare", en: "sentence × dialogue", ru: "фраза × диалог" },
  { x: "pronounI", y: "pronounWe", en: "“I” × “we”", ru: "«я» × «мы»" },
];

export function StyleExplorer({ books, n, x: x0 = "year", y: y0 = "sentenceLen", trend: trend0 = "loess", kinds: kinds0 }: { books: Book[]; n: number; x?: Metric; y?: Metric; trend?: Trend; kinds?: Kind[] }) {
  const lang = useLang();
  const t = T[lang];
  const [mx, setMx] = useState<Metric>(x0);
  const [my, setMy] = useState<Metric>(y0);
  const [trend, setTrend] = useState<Trend>(trend0);
  const present = KINDS.filter((k) => books.some((b) => b.kind === k));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(present.filter((k) => (kinds0 ? kinds0.includes(k) : k !== "interview"))));
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [ref, width] = usePlot();
  const [tip, setTip] = useTip();

  const narrow = width < 560;
  const height = Math.round(Math.min(460, Math.max(300, width * 0.62)));
  const m = { l: narrow ? 40 : 56, r: 14, t: 28, b: 40 };
  const vis = books.filter((b) => kinds.has(b.kind));
  const logX = !!METRICS[mx].log,
    logY = !!METRICS[my].log;
  const tx = (v: number) => (logX ? Math.log10(Math.max(0.5, v)) : v);
  const ty = (v: number) => (logY ? Math.log10(Math.max(0.5, v)) : v);
  const [ax0, ax1] = pad(robust(vis.map((b) => tx(b[mx]))));
  const [ay0, ay1] = pad(robust(vis.map((b) => ty(b[my]))));
  const X0 = scale(ax0, ax1, m.l, width - m.r);
  const Y0 = scale(ay0, ay1, height - m.b, m.t);
  // Values beyond a clipped axis are pinned to its edge and flagged.
  const X = (v: number) => Math.min(width - m.r, Math.max(m.l, X0(v)));
  const Y = (v: number) => Math.min(height - m.b, Math.max(m.t, Y0(v)));
  const off = (b: Book) => tx(b[mx]) > ax1 || tx(b[mx]) < ax0 || ty(b[my]) > ay1 || ty(b[my]) < ay0;
  const maxW = Math.max(...books.map((b) => b.words));
  const rad = (w: number) => Math.max(3, (narrow ? 10 : 14) * Math.sqrt(w / maxW));

  const inRange = vis.filter((b) => !off(b));
  const xs = inRange.map((b) => tx(b[mx])),
    ys = inRange.map((b) => ty(b[my]));
  const r = inRange.length > 2 ? pearson(xs, ys) : 0;
  const trendPath = useMemo(() => {
    if (trend === "none" || inRange.length < 4) return "";
    const grid = Array.from({ length: 60 }, (_, i) => ax0 + ((ax1 - ax0) * i) / 59).filter((v) => v >= Math.min(...xs) && v <= Math.max(...xs));
    const fy = trend === "linear" ? grid.map(linearFit(xs, ys)) : loess(xs, ys, grid, 0.6);
    return grid
      .map((g, i) => (Number.isFinite(fy[i]) ? `${X(g).toFixed(1)},${Y(Math.min(ay1, Math.max(ay0, fy[i]))).toFixed(1)}` : ""))
      .filter(Boolean)
      .map((p, i) => (i ? "L" : "M") + p)
      .join("");
  }, [trend, mx, my, width, kinds, books]);

  const tickVals = (lo: number, hi: number, log: boolean, count: number) => (log ? logTicks(lo, hi) : ticks(lo, hi, count));

  const metricOptions = (Object.keys(METRICS) as Metric[]).map((k) => (
    <option key={k} value={k}>
      {METRICS[k][lang]}
    </option>
  ));

  const show = (b: Book) => {
    setHover(b.id);
    setTip({
      x: X(tx(b[mx])),
      y: Y(ty(b[my])),
      content: (
        <BookCard
          b={b}
          lang={lang}
          extra={
            <span className="eda-tip-rows">
              <span>
                {METRICS[mx][lang]}: <b>{fmtMetric(mx, b[mx], lang)}</b>
              </span>
              <span>
                {METRICS[my][lang]}: <b>{fmtMetric(my, b[my], lang)}</b>
              </span>
            </span>
          }
        />
      ),
    });
  };
  const togglePin = (id: string) =>
    setPins((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sorted = [...vis].sort((a, b) => b.words - a.words);

  return (
    <Figure
      n={n}
      id={`fig-style-${n}`}
      title={t.title}
      caption={t.caption}
      controls={
        <>
          <Select label={t.x} value={mx} onChange={setMx}>
            {metricOptions}
          </Select>
          <Select label={t.y} value={my} onChange={setMy}>
            {metricOptions}
          </Select>
          <Seg label={t.trend} value={trend} onChange={setTrend} options={(["none", "linear", "loess"] as Trend[]).map((v) => ({ value: v, label: t[v] }))} />
          <Chips
            label={t.kinds}
            options={present}
            value={kinds}
            onChange={setKinds}
            render={(k) => (
              <>
                <KindKey kind={k} /> {KIND_META[k][lang === "ru" ? "ruP" : "enP"]}
              </>
            )}
          />
          <div className="eda-control" role="group" aria-label={t.presets}>
            <span className="eda-control-label">{t.presets}</span>
            <div className="eda-chips">
              {PRESETS.map((p) => (
                <button key={p.en} type="button" className="eda-chip ghost" aria-pressed={mx === p.x && my === p.y} onClick={() => (setMx(p.x), setMy(p.y))}>
                  {p[lang]}
                </button>
              ))}
              <button type="button" className="eda-chip ghost" onClick={() => (setMx(my), setMy(mx))}>
                ⇄ {t.swap}
              </button>
              {pins.size > 0 && (
                <button type="button" className="eda-chip ghost" onClick={() => setPins(new Set())}>
                  × {t.clear}
                </button>
              )}
            </div>
          </div>
        </>
      }
      table={
        <table>
          <thead>
            <tr>
              <th>{lang === "ru" ? "Название" : "Title"}</th>
              <th className="num">{METRICS[mx][lang]}</th>
              <th className="num">{METRICS[my][lang]}</th>
            </tr>
          </thead>
          <tbody>
            {vis.map((b) => (
              <tr key={b.id}>
                <td>{title(b, lang)}</td>
                <td className="num">{fmtMetric(mx, b[mx], lang)}</td>
                <td className="num">{fmtMetric(my, b[my], lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="eda-box" onPointerLeave={() => (setTip(null), setHover(null))}>
        <svg width={width} height={height} role="img" aria-label={`${METRICS[my][lang]} × ${METRICS[mx][lang]}; ${t.r} ${fmtN(lang, r, 2)}`}>
          {tickVals(ay0, ay1, logY, 5).map((v) => {
            const yy = Y(logY ? Math.log10(v) : v);
            return (
              <g key={`y${v}`}>
                <line x1={m.l} x2={width - m.r} y1={yy} y2={yy} className="eda-grid" />
                <text x={m.l - 6} y={yy + 3.5} textAnchor="end" className="eda-tick">
                  {fmtTick(my, v, lang)}
                </text>
              </g>
            );
          })}
          {tickVals(ax0, ax1, logX, narrow ? 4 : 7).map((v) => {
            const xx = X(logX ? Math.log10(v) : v);
            return (
              <g key={`x${v}`}>
                <line x1={xx} x2={xx} y1={m.t} y2={height - m.b} className="eda-grid" />
                <text x={xx} y={height - m.b + 15} textAnchor="middle" className="eda-tick">
                  {fmtTick(mx, v, lang)}
                </text>
              </g>
            );
          })}
          <text x={width - m.r} y={height - 6} textAnchor="end" className="eda-axis-title">
            {METRICS[mx][lang]} →
          </text>
          <text x={m.l - (narrow ? 34 : 50)} y={12} className="eda-axis-title">
            ↑ {METRICS[my][lang]}
          </text>
          {trendPath && <path d={trendPath} className="eda-trend" />}
          {sorted.map((b) => {
            const cx = X(tx(b[mx])),
              cy = Y(ty(b[my]));
            const pinned = pins.has(b.id);
            return (
              <g
                key={b.id}
                className={`eda-hit${hover && hover !== b.id && !pinned ? " dim" : ""}`}
                tabIndex={0}
                role="button"
                aria-pressed={pinned}
                aria-label={`${title(b, lang)}: ${fmtMetric(mx, b[mx], lang)}, ${fmtMetric(my, b[my], lang)}`}
                onPointerEnter={(e) => e.pointerType === "mouse" && show(b)}
                onFocus={() => show(b)}
                onBlur={() => (setTip(null), setHover(null))}
                onClick={() => (togglePin(b.id), show(b))}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), togglePin(b.id))}
              >
                <circle cx={cx} cy={cy} r={Math.max(10, rad(b.words))} fill="transparent" />
                <Mark kind={b.kind} x={cx} y={cy} r={rad(b.words)} opacity={0.85} stroke={pinned ? "var(--ink)" : undefined} strokeWidth={pinned ? 2 : 1.2} />
                {off(b) && (
                  <text x={cx + rad(b.words) + 4} y={cy + (cy <= m.t + 1 ? 12 : 4)} className="eda-tick">
                    {cy <= m.t + 1 ? "↑" : cy >= height - m.b - 1 ? "↓" : cx >= width - m.r - 1 ? "→" : "←"}{" "}
                    {fmtMetric(ty(b[my]) > ay1 || ty(b[my]) < ay0 ? my : mx, ty(b[my]) > ay1 || ty(b[my]) < ay0 ? b[my] : b[mx], lang)}
                  </text>
                )}
              </g>
            );
          })}
          {sorted
            .filter((b) => pins.has(b.id))
            .map((b) => {
              const cx = X(tx(b[mx])),
                cy = Y(ty(b[my]));
              const right = cx < width - 120;
              return (
                <text key={`l${b.id}`} x={cx + (right ? 1 : -1) * (rad(b.words) + 5)} y={cy + 4} textAnchor={right ? "start" : "end"} className="eda-label halo">
                  {title(b, lang)}
                </text>
              );
            })}
        </svg>
        <span className="eda-stat">
          {t.r} = {fmtN(lang, r, 2)} · n = {inRange.length}
          {inRange.length < vis.length ? ` (${vis.length - inRange.length} ${t.offscale})` : ""}
        </span>
        <Tip tip={tip} width={width} />
      </div>
    </Figure>
  );
}
