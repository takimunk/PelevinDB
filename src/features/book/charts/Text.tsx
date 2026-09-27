// The book's charts, drawn as SVG: emotion DNA, ridgelines, pulse, story shape, bars and bipolar scales.
// Chrome (axes, grid, labels) uses ink tokens; colour encodes data only.
import { useState, type MouseEvent, type ReactNode } from "react";
import { EMOTIONS, labelOf, MODES, MOODS, THEMES, type EmotionId, type ThemeId } from "../../../../shared/catalog.ts";
import type { Distribution, SegmentAnalysis } from "../../../../shared/types.ts";
import { ARC_SHAPES, argmax, dominantEmotion, emotionColor, intensity, isParatext, modeColor, moodColor, series, smooth, type Analyses, type ArcId, type Moment } from "../../../domain/analysis.ts";
import type { DnaInsights, Stretch } from "../../../domain/insights.ts";
import { useLang, useT, type Lang } from "../../../i18n/index.ts";
import { Meter, Swatch, Track } from "../../../ui/term.tsx";
import { useSize } from "../../../ui/useSize.ts";
import { num, pageRef, pct } from "../i18n.ts";

const CALM = "#5aa6d6";
const INTENSE = "#d93b30";

const T = {
  en: {
    neutral: "neutral",
    throughout: "leads throughout",
    parts: ["opening", "middle", "ending"],
    part: (i: number) => `part ${i + 1}`,
    peaks: "peaks on",
    intense: "most intense",
    calm: "calmest",
    avg: "avg",
    bookAvg: "book avg",
    click: "click to read",
    paratext: "paratext, excluded",
    pending: "not analysed yet",
    dnaIdle: (n: number, bins: number) => `${n} pages in ${bins} columns · height = emotional intensity · colour = leading emotion · strips = mood, narration`,
    rows: { emotion: "emotion", mood: "mood", narration: "narration", leads: "leads", stretch: "stretch" },
    dnaLabel: "Plot development",
    calmWord: "calm",
    intenseWord: "intense",
    beginning: "beginning",
    end: "end",
    ofBook: "of the book",
    bookMean: "book mean",
    spectrogram: "Emotion spectrogram",
    intensity: "intensity",
    specIdle: "height = how strongly Jev reads the emotion on the page, 0 → 1 · dashed = 0.5 · right = book mean",
    themes: "Themes across the book",
    likely: "likely the subject",
    themesIdle: "height = how likely a page is about the theme · dashed = 50% · right = share of the book",
    pulse: "Pulse of the book",
    pulseLines: { tension: "tension", pace: "pace", valence: "light", interiority: "interiority" },
    pulseIdle: "smoothed scores, 0 → 1 · vertical marks = extreme pages, found in code from Jev answers",
    tags: { climax: "climax", still: "stillest", light: "brightest", dark: "darkest", wonder: "surprise", inner: "interiority" } as Record<string, string>,
    match: "match",
    flat: "flat line",
    noShape: "no clear shape",
    shape: "Story shape",
    hi: "high",
    lo: "low",
    template: "template",
    light: "light",
  },
  ru: {
    neutral: "нейтрально",
    throughout: "ведёт всю книгу",
    parts: ["начало", "середина", "финал"],
    part: (i: number) => `часть ${i + 1}`,
    peaks: "пик на",
    intense: "напряжённее всего",
    calm: "спокойнее всего",
    avg: "в среднем",
    bookAvg: "среднее по книге",
    click: "нажмите, чтобы читать",
    paratext: "паратекст, не учитывается",
    pending: "ещё не прочитано",
    dnaIdle: (n: number, bins: number) => `${n} стр. в ${bins} столбцах · высота = сила эмоции · цвет = ведущая эмоция · полосы = настроение, повествование`,
    rows: { emotion: "эмоция", mood: "настроение", narration: "повествование", leads: "ведёт", stretch: "отрезки" },
    dnaLabel: "Развитие сюжета",
    calmWord: "спокойно",
    intenseWord: "напряжённо",
    beginning: "начало",
    end: "конец",
    ofBook: "книги",
    bookMean: "среднее по книге",
    spectrogram: "Спектрограмма эмоций",
    intensity: "сила",
    specIdle: "высота = насколько сильно Jev видит эмоцию на странице, 0 → 1 · пунктир = 0,5 · справа = среднее по книге",
    themes: "Темы по ходу книги",
    likely: "вероятность темы",
    themesIdle: "высота = вероятность, что страница об этой теме · пунктир = 50 % · справа = доля книги",
    pulse: "Пульс книги",
    pulseLines: { tension: "напряжение", pace: "темп", valence: "свет", interiority: "внутренний мир" },
    pulseIdle: "сглаженные оценки, 0 → 1 · вертикальные метки = крайние страницы, найденные в коде по ответам Jev",
    tags: { climax: "кульминация", still: "тишина", light: "свет", dark: "тьма", wonder: "удивление", inner: "внутрь" } as Record<string, string>,
    match: "похоже на",
    flat: "ровная линия",
    noShape: "без ясной формы",
    shape: "Форма сюжета",
    hi: "выше",
    lo: "ниже",
    template: "шаблон",
    light: "свет",
  },
};

const emotionName = (id: EmotionId | "neutral", lang: Lang, t: (typeof T)["en"]) =>
  id === "neutral"
    ? t.neutral
    : labelOf(
        EMOTIONS.find((e) => e.id === id)!,
        lang,
      ).toLowerCase();
const Emo = ({ id }: { id: EmotionId | "neutral" }) => {
  const lang = useLang();
  const t = useT(T);
  return (
    <span className="emo">
      <Swatch color={emotionColor(id)} round />
      {emotionName(id, lang, t)}
    </span>
  );
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Runs of highlighted pages as [x, width] bands across a chart `width` wide. */
function markBands(marks: boolean[] | undefined, width: number): [number, number][] {
  if (!marks?.length || !marks.some(Boolean)) return [];
  const out: [number, number][] = [];
  const step = width / marks.length;
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i]) continue;
    let j = i;
    while (j + 1 < marks.length && marks[j + 1]) j++;
    out.push([i * step, (j - i + 1) * step]);
    i = j;
  }
  return out;
}

/** The book as a strip of columns: one per page range, height = intensity, colour = leading emotion; mood and narration run underneath. */
export function Dna({ analyses, insights, onPick }: { analyses: Analyses; insights: DnaInsights; onPick: (index: number) => void }) {
  const t = useT(T);
  const lang = useLang();
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = analyses.length;
  const gutter = width < 520 ? 0 : 92;
  const plotW = Math.max(40, width - gutter);
  const bins = Math.max(1, Math.min(n, Math.floor(plotW / 3)));
  const cols = Array.from({ length: bins }, (_, c) => {
    const from = Math.floor((c / bins) * n),
      to = Math.max(from + 1, Math.floor(((c + 1) / bins) * n));
    const pages = analyses.slice(from, to);
    const known = pages.filter((a): a is SegmentAnalysis => !!a && !isParatext(a));
    const best = known.reduce<SegmentAnalysis | null>((m, a) => (!m || intensity(a) > intensity(m) ? a : m), null);
    return { from, to: to - 1, best, paratext: pages.some((a) => a && isParatext(a)) && !known.length };
  });
  const cw = plotW / bins;
  const xOf = (page: number) => gutter + ((page + 0.5) / Math.max(1, n)) * plotW;
  const xFrom = (page: number) => gutter + (page / Math.max(1, n)) * plotW;
  const xTo = (page: number) => gutter + ((page + 1) / Math.max(1, n)) * plotW;
  const { peak, calm, intense, parts } = insights;
  const hasData = cols.some((c) => c.best);
  const TOP = hasData && peak ? 22 : 4;
  const H = hasData ? 116 : 8;
  const base = TOP + H;
  const moodY = base + 8,
    modeY = moodY + 10,
    leadsY = modeY + 26,
    stretchY = leadsY + (parts.length ? 24 : 0);
  const height = hasData ? stretchY + (calm || intense ? 20 : 0) : modeY + 12;
  const at = (e: MouseEvent<SVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = Math.floor(((e.clientX - r.left - gutter) / plotW) * bins);
    return c >= 0 && c < bins ? c : null;
  };
  const h = hover != null ? cols[hover] : null;
  const pageLink = (s: Stretch, children: ReactNode) => (
    <button className="link-u" onClick={() => onPick(s.from)}>
      {children}
    </button>
  );
  const lead = parts.map((p) => p.emotion);
  const rowLabel = (y: number, text: string) =>
    gutter > 0 && (
      <text x={0} y={y} className="chart-row-label" dominantBaseline="middle">
        {text}
      </text>
    );
  return (
    <div ref={ref} className="dna">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t.dnaLabel}
        className="chart-svg"
        onMouseMove={(e) => setHover(at(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const c = at(e);
          if (c != null) onPick(cols[c].from);
        }}
      >
        {rowLabel(TOP + H / 2, hasData ? t.rows.emotion : "")}
        {hasData && <line x1={gutter} x2={gutter + plotW} y1={base - insights.mean * H} y2={base - insights.mean * H} className="chart-ref" />}
        {h && <rect x={gutter + hover! * cw} y={TOP} width={Math.max(1, cw)} height={modeY + 8 - TOP} className="chart-hover-band" />}
        {cols.map((c, i) => {
          const x = gutter + i * cw;
          if (!c.best) return <rect key={i} x={x + cw * 0.15} y={base - 2} width={Math.max(0.6, cw * 0.7)} height={2} className={c.paratext ? "chart-empty paratext" : "chart-empty"} />;
          const v = intensity(c.best);
          return <rect key={i} x={x + (cw > 3 ? 0.5 : 0)} y={base - v * H} width={Math.max(0.6, cw - (cw > 3 ? 1 : 0))} height={Math.max(1, v * H)} fill={emotionColor(dominantEmotion(c.best))} />;
        })}
        <line x1={gutter} x2={gutter + plotW} y1={base + 0.5} y2={base + 0.5} className="chart-axis" />
        {rowLabel(moodY + 3, t.rows.mood)}
        {rowLabel(modeY + 3, t.rows.narration)}
        {cols.map((c, i) =>
          c.best ? (
            <g key={i}>
              <rect x={gutter + i * cw} y={moodY} width={cw + 0.3} height={6} fill={moodColor(argmax(c.best.mood))} />
              <rect x={gutter + i * cw} y={modeY} width={cw + 0.3} height={6} fill={modeColor(argmax(c.best.mode))} />
            </g>
          ) : null,
        )}
        {hasData && peak && (
          <g className="chart-peak">
            <path d={`M${xOf(peak.index) - 4},${base - peak.value * H - 12} h8 l-4,6 z`} fill={emotionColor(peak.emotion)} />
            <text
              x={xOf(peak.index) > gutter + plotW - 48 ? xOf(peak.index) - 7 : xOf(peak.index) + 7}
              textAnchor={xOf(peak.index) > gutter + plotW - 48 ? "end" : "start"}
              y={base - peak.value * H - 8}
              className="chart-note"
            >
              {pageRef(lang, peak.index + 1)}
            </text>
          </g>
        )}
        {hasData && parts.length > 0 && (
          <g>
            {rowLabel(leadsY, t.rows.leads)}
            {parts.map((p, i) => {
              const x1 = xFrom(p.from),
                x2 = xTo(p.to);
              return (
                <g key={i}>
                  <line x1={x1 + 1} x2={x2 - 1} y1={leadsY - 7} y2={leadsY - 7} stroke={emotionColor(p.emotion)} strokeWidth={2} />
                  {x2 - x1 > 50 && (
                    <text x={x1 + 2} y={leadsY + 5} className="chart-note">
                      {emotionName(p.emotion, lang, t)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
        {hasData && (calm || intense) && (
          <g>
            {rowLabel(stretchY, t.rows.stretch)}
            {(
              [
                [calm, t.calmWord, CALM],
                [intense, t.intenseWord, INTENSE],
              ] as const
            ).map(([s, name, color]) =>
              s ? (
                <g key={name}>
                  <path d={`M${xFrom(s.from)},${stretchY - 10} v4 H${xTo(s.to)} v-4`} fill="none" stroke={color} strokeWidth={1.5} />
                  <text x={(xFrom(s.from) + xTo(s.to)) / 2} y={stretchY + 6} textAnchor="middle" className="chart-note">
                    {name}
                  </text>
                </g>
              ) : null,
            )}
          </g>
        )}
      </svg>
      {hasData && peak && (
        <p className="chart-caption">
          {lead.length === 3 && new Set(lead).size === 1 ? (
            <>
              <Emo id={lead[0]} /> {t.throughout}
            </>
          ) : (
            parts.map((p, i) => (
              <span key={p.from}>
                {i > 0 && ", "}
                {parts.length === 3 ? t.parts[i] : t.part(i)}: <Emo id={p.emotion} />
              </span>
            ))
          )}
          {" · "}
          {t.peaks} {pageLink({ from: peak.index, to: peak.index, value: peak.value }, pageRef(lang, peak.index + 1))} (<Emo id={peak.emotion} /> {num(lang, peak.value, 2)})
          {intense && (
            <>
              {" · "}
              {t.intense} {pageLink(intense, pageRef(lang, intense.from + 1, intense.to + 1))}{" "}
              <span className="dim">
                {t.avg} {num(lang, intense.value, 2)}
              </span>
            </>
          )}
          {calm && (
            <>
              {" · "}
              {t.calm} {pageLink(calm, pageRef(lang, calm.from + 1, calm.to + 1))}{" "}
              <span className="dim">
                {t.avg} {num(lang, calm.value, 2)}
              </span>
            </>
          )}
          <span className="dim">
            {" · "}
            {t.bookAvg} {num(lang, insights.mean, 2)}
          </span>
        </p>
      )}
      <div className="readout">
        {h ? (
          h.best ? (
            <>
              {pageRef(lang, h.from + 1)} · <Emo id={dominantEmotion(h.best)} /> <b>{num(lang, intensity(h.best), 2)}</b> · <Swatch color={moodColor(argmax(h.best.mood))} round />
              {labelOf(
                MOODS.find((m) => m.id === argmax(h.best!.mood))!,
                lang,
              ).toLowerCase()}{" "}
              ·{" "}
              {labelOf(
                MODES.find((m) => m.id === argmax(h.best!.mode))!,
                lang,
              ).toLowerCase()}{" "}
              <span className="dim">· {t.click}</span>
            </>
          ) : (
            <span className="dim">
              {pageRef(lang, h.from + 1)} · {h.paratext ? t.paratext : t.pending}
            </span>
          )
        ) : (
          <span className="dim">{t.dnaIdle(n, bins)}</span>
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
  compact = false,
  smoothing = true,
  marks,
}: {
  compact?: boolean;
  /** Gaussian smoothing on (default) or the raw per-page answers. */
  smoothing?: boolean;
  /** Pages to highlight (one flag per page), drawn as bands behind every ridge. */
  marks?: boolean[];
  ridges: Ridge[];
  analyses: Analyses;
  onPick: (p: number) => void;
  name: string;
  share: (v: number) => string;
  value: (v: number) => string;
  idle: string;
}) {
  const t = useT(T);
  const lang = useLang();
  const [hover, setHover] = useState<{ k: number; p: number } | null>(null);
  const n = Math.max(2, Math.min(analyses.length, 160));
  const W = 1000;
  const data = ridges.map((r) => (smoothing ? smooth(series(analyses, r.pick, n), Math.max(0.8, n / 70)) : series(analyses, r.pick, n)).map((v) => v ?? 0));
  const bands = markBands(marks, W);
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
      <div className={`ridges ${compact ? "compact" : ""}`} role="group" aria-label={name} onMouseLeave={() => setHover(null)}>
        {ridges.map((r, k) => (
          <div key={r.id} className={`ridge-row ${hover && hover.k !== k ? "faded" : ""}`}>
            <span className="ridge-label">
              <Swatch color={r.color} />
              {r.label.toLowerCase()}
            </span>
            <svg
              viewBox={`0 0 ${W} 1`}
              preserveAspectRatio="none"
              onMouseMove={(e) => setHover({ k, p: at(e) })}
              onClick={(e) => onPick(at(e))}
              role="img"
              aria-label={`${r.label}: ${t.bookMean} ${share(r.share).trim()}`}
            >
              {bands.map(([x, w]) => (
                <rect key={x} x={x} y={0} width={w} height={1} className="hl-band" />
              ))}
              <line x1={0} x2={W} y1={0.5} y2={0.5} className="threshold" vectorEffect="non-scaling-stroke" />
              <path d={path(data[k], true)} style={{ fill: r.color }} className="area" />
              <path d={path(data[k], false)} style={{ stroke: r.color }} className="edge" vectorEffect="non-scaling-stroke" />
              {hover && <line x1={hover.p * W} x2={hover.p * W} y1={0} y2={1} className="cursor-line" vectorEffect="non-scaling-stroke" />}
            </svg>
            <span className="ridge-share">
              <span className="num">{share(r.share)}</span>
              <Meter value={r.share} color={r.color} className="thin" />
            </span>
          </div>
        ))}
        <div className="ridge-row ridge-axis">
          <span />
          <span>{t.beginning}</span>
          <span>{t.end}</span>
        </div>
      </div>
      <div className="readout">
        {cur && hover ? (
          <>
            <Swatch color={cur.r.color} />
            {cur.r.label.toLowerCase()} · {pct(lang, hover.p)} {t.ofBook} · <b>{value(cur.v)}</b>{" "}
            <span className="dim">
              · {t.bookMean} {share(cur.r.share).trim()} · {t.click}
            </span>
          </>
        ) : (
          <span className="dim">{idle}</span>
        )}
      </div>
    </div>
  );
}

/** Plutchik's eight emotions over time, in wheel order. */
export function Spectrogram({
  analyses,
  emotions,
  onPick,
  compact,
  only,
  smoothing,
  marks,
}: {
  analyses: Analyses;
  emotions: Distribution<EmotionId>;
  onPick: (p: number) => void;
  compact?: boolean;
  /** Show only these emotions (all when empty). */
  only?: EmotionId[];
  smoothing?: boolean;
  marks?: boolean[];
}) {
  const t = useT(T);
  const lang = useLang();
  return (
    <div className="ridge-emotions">
      <Ridgeline
        name={t.spectrogram}
        analyses={analyses}
        onPick={onPick}
        ridges={EMOTIONS.filter((e) => !only?.length || only.includes(e.id)).map((e) => ({ id: e.id, label: labelOf(e, lang), color: e.color, share: emotions[e.id], pick: (a) => a.emotions[e.id] }))}
        share={(v) => num(lang, v, 2)}
        value={(v) => `${num(lang, v, 2)} ${t.intensity}`}
        idle={t.specIdle}
        compact={compact}
        smoothing={smoothing}
        marks={marks}
      />
    </div>
  );
}

const THEME_PALETTE = ["var(--d1)", "var(--d2)", "var(--d3)", "var(--d4)", "var(--d5)", "var(--d6)", "var(--d7)", "var(--d8)", "#a8935c", "#5aa6d6"];

/** The ten strongest themes; height = Noul probability that the page is about the theme. */
export function ThemeLines({
  analyses,
  themes,
  onPick,
  compact,
  order = "strength",
  smoothing,
  marks,
}: {
  analyses: Analyses;
  themes: Distribution<ThemeId>;
  onPick: (p: number) => void;
  compact?: boolean;
  /** The ten strongest themes, listed by strength or by the page where each first leads (≥ 0.5). */
  order?: "strength" | "appearance";
  smoothing?: boolean;
  marks?: boolean[];
}) {
  const t = useT(T);
  const lang = useLang();
  const first = (id: ThemeId) => {
    const i = analyses.findIndex((a) => a && a.themes[id] >= 0.5);
    return i < 0 ? Infinity : i;
  };
  const top = THEMES.slice()
    .sort((a, b) => themes[b.id] - themes[a.id])
    .slice(0, 10)
    .sort((a, b) => (order === "appearance" ? first(a.id) - first(b.id) : 0));
  return (
    <div className="ridge-themes">
      <Ridgeline
        name={t.themes}
        analyses={analyses}
        onPick={onPick}
        ridges={top.map((th, k) => ({ id: th.id, label: labelOf(th, lang), color: THEME_PALETTE[k], share: themes[th.id], pick: (a) => a.themes[th.id] }))}
        share={(v) => pct(lang, v)}
        value={(v) => `${pct(lang, v)} ${t.likely}`}
        idle={t.themesIdle}
        compact={compact}
        smoothing={smoothing}
        marks={marks}
      />
    </div>
  );
}

const PULSE_LINES = [
  { id: "tension", color: "#d93b30", pick: (a: SegmentAnalysis) => a.texture.tension },
  { id: "pace", color: "#e57a1f", pick: (a: SegmentAnalysis) => a.texture.pace },
  { id: "valence", color: "#c99400", pick: (a: SegmentAnalysis) => a.texture.valence },
  { id: "interiority", color: "#4a5fd0", pick: (a: SegmentAnalysis) => a.texture.interiority },
] as const;

/** Tension, pace, light and interiority across the book, with the extreme pages marked. */
export function PulsePlot({
  analyses,
  moments,
  onPick,
  compact = false,
  smoothing = true,
  highlight,
}: {
  analyses: Analyses;
  moments: Moment[];
  onPick: (index: number) => void;
  compact?: boolean;
  smoothing?: boolean;
  /** Pages to highlight, drawn as bands behind the lines. */
  highlight?: boolean[];
}) {
  const t = useT(T);
  const lang = useLang();
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [off, setOff] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const last = Math.max(1, analyses.length - 1);
  const L = 30,
    R = 8,
    LANES = 2,
    LANE = 16,
    TOP = LANES * LANE + 8,
    PH = compact ? 118 : 170,
    height = TOP + PH + 22;
  const plotW = Math.max(40, width - L - R);
  const bins = Math.max(8, Math.min(analyses.length, Math.floor(plotW / 2)));
  const data = PULSE_LINES.map((l) => (smoothing ? smooth(series(analyses, l.pick, bins), bins / 40) : series(analyses, l.pick, bins)));
  const xBin = (i: number) => L + (i / Math.max(1, bins - 1)) * plotW;
  const xPage = (i: number) => L + (i / last) * plotW;
  const y = (v: number) => TOP + (1 - clamp01(v)) * PH;
  const line = (values: (number | null)[]) => {
    let d = "",
      pen = false;
    values.forEach((v, i) => {
      if (v == null) return void (pen = false);
      d += `${pen ? "L" : "M"}${xBin(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  // Tags go to the first lane where they do not touch another tag.
  const marks = moments.map((m) => ({ m, x: xPage(m.index) })).sort((a, b) => a.x - b.x);
  const lanes: [number, number][][] = Array.from({ length: LANES }, () => []);
  const tags = marks.map(({ m, x }) => {
    const text = t.tags[m.id] ?? (lang === "ru" ? m.ru : m.label).toLowerCase();
    const w = text.length * 6.4 + 10;
    const right = x + w <= L + plotW;
    const from = right ? x - 4 : x - w + 4,
      to = from + w;
    const lane = lanes.findIndex((l) => l.every(([a, b]) => to + 4 < a || from - 4 > b));
    if (lane >= 0) lanes[lane].push([from, to]);
    return { m, x, text, right, lane };
  });
  const near = (px: number) => marks.find((k) => Math.abs(k.x - px) <= 5)?.m ?? null;
  const pos = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX - r.left;
  };
  const cur = hover != null ? { m: near(hover), bin: Math.round(((hover - L) / plotW) * (bins - 1)), page: Math.round(((hover - L) / plotW) * last) } : null;
  return (
    <div ref={ref}>
      <div className="toggles-row" role="group" aria-label={t.pulse}>
        {PULSE_LINES.map((l) => (
          <button key={l.id} className={off.has(l.id) ? "off" : ""} onClick={() => setOff((s) => new Set(s.has(l.id) ? [...s].filter((x) => x !== l.id) : [...s, l.id]))} aria-pressed={!off.has(l.id)}>
            <Swatch color={l.color} round />
            {t.pulseLines[l.id]}
          </button>
        ))}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t.pulse}
        className="chart-svg pulse"
        onMouseMove={(e) => {
          const x = pos(e);
          setHover(x >= L && x <= L + plotW ? x : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const x = pos(e);
          if (x < L - 4 || x > L + plotW + 4) return;
          const hit = near(x);
          onPick(hit ? hit.index : Math.round(clamp01((x - L) / plotW) * last));
        }}
      >
        {markBands(highlight, plotW).map(([x, w]) => (
          <rect key={x} x={L + x} y={TOP} width={w} height={PH} className="hl-band" />
        ))}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={L + plotW} y1={y(v)} y2={y(v)} className={v === 0 ? "chart-axis" : "chart-grid"} />
            <text x={L - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="chart-tick">
              {num(lang, v, v === 0.5 ? 1 : 0)}
            </text>
          </g>
        ))}
        {tags.map(({ m, x, text, right, lane }) => (
          <g key={m.id} className="pulse-mark">
            <line x1={x} x2={x} y1={lane >= 0 ? lane * LANE + 12 : TOP} y2={TOP + PH} stroke={m.color} strokeDasharray="2 3" strokeOpacity={0.7} />
            {lane >= 0 && (
              <>
                <path d={`M${x - 3.5},${lane * LANE + 3} h7 l-3.5,6 z`} fill={m.color} />
                <text x={right ? x + 6 : x - 6} y={lane * LANE + 9} textAnchor={right ? "start" : "end"} className="chart-note">
                  {text}
                </text>
              </>
            )}
          </g>
        ))}
        {PULSE_LINES.map((l, k) => (off.has(l.id) ? null : <path key={l.id} d={line(data[k])} fill="none" stroke={l.color} strokeWidth={1.6} strokeLinejoin="round" />))}
        {cur && hover != null && (
          <g>
            <line x1={hover} x2={hover} y1={TOP} y2={TOP + PH} className="cursor-line" />
            {PULSE_LINES.map((l, k) => {
              const v = data[k][cur.bin];
              return off.has(l.id) || v == null ? null : <circle key={l.id} cx={xBin(cur.bin)} cy={y(v)} r={3} fill={l.color} className="chart-dot" />;
            })}
          </g>
        )}
        <text x={L} y={height - 6} className="chart-tick">
          {t.beginning}
        </text>
        <text x={L + plotW} y={height - 6} textAnchor="end" className="chart-tick">
          {t.end}
        </text>
      </svg>
      <div className="readout">
        {cur?.m ? (
          <>
            <Swatch color={cur.m.color} round />
            {(lang === "ru" ? cur.m.ru : cur.m.label).toLowerCase()} · {pageRef(lang, cur.m.index + 1)} · {lang === "ru" ? cur.m.hintRu : cur.m.hint} <span className="dim">· {t.click}</span>
          </>
        ) : cur ? (
          <>
            {pageRef(lang, cur.page + 1)} ·{" "}
            {PULSE_LINES.map((l, k) => (
              <span key={l.id}>
                {t.pulseLines[l.id]} <b>{data[k][cur.bin] != null ? num(lang, data[k][cur.bin]!, 2) : "—"}</b>{" "}
              </span>
            ))}
            <span className="dim">· {t.click}</span>
          </>
        ) : (
          <span className="dim">{t.pulseIdle}</span>
        )}
      </div>
      {!compact && (
      <ol className="pulse-marks">
        {moments.map((m) => (
          <li key={m.id}>
            <button onClick={() => onPick(m.index)}>
              <span className="pm-label">
                <Swatch color={m.color} round />
                {lang === "ru" ? m.ru : m.label}
              </span>
              <span className="pm-page num">{pageRef(lang, m.index + 1)}</span>
              <span className="pm-hint">{lang === "ru" ? m.hintRu : m.hint}</span>
            </button>
          </li>
        ))}
      </ol>
      )}
    </div>
  );
}

/** The light curve against Vonnegut's six story shapes; the best match is drawn dashed behind it. */
export function ArcPlot({ curve, shape, fits, compact = false }: { curve: number[]; shape: ArcId; fits: { id: ArcId; r: number }[]; compact?: boolean }) {
  const t = useT(T);
  const lang = useLang();
  const [ref, { width }] = useSize<HTMLDivElement>();
  const lo = Math.min(...curve),
    hi = Math.max(...curve);
  const norm = curve.map((v) => (hi - lo > 1e-6 ? (v - lo) / (hi - lo) : 0.5));
  const best = ARC_SHAPES.find((a) => a.id === shape);
  const L = 34,
    H = compact ? 58 : 96,
    TOP = 6,
    height = TOP + H + 8;
  const plotW = Math.max(40, width - L - 4);
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${(L + (i / Math.max(1, values.length - 1)) * plotW).toFixed(1)},${(TOP + (1 - v) * H).toFixed(1)}`).join("");
  const template = best
    ? (() => {
        const raw = Array.from({ length: 48 }, (_, i) => best.f(i / 47));
        const a = Math.min(...raw),
          b = Math.max(...raw);
        return raw.map((v) => (v - a) / (b - a || 1));
      })()
    : null;
  return (
    <div ref={ref} className="arc">
      <p className="arc-name">
        <span className="dim">{t.match}</span> <b>{best ? labelOfArc(best, lang) : t.flat}</b>{" "}
        <span className="dim">— {best ? (lang === "ru" ? best.hintRu : best.hint).toLowerCase() : t.noShape}</span>
      </p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.shape} className="chart-svg">
        <line x1={L} x2={L + plotW} y1={TOP} y2={TOP} className="chart-grid" />
        <line x1={L} x2={L + plotW} y1={TOP + H} y2={TOP + H} className="chart-axis" />
        <text x={L - 6} y={TOP + 4} textAnchor="end" className="chart-tick">
          {t.hi}
        </text>
        <text x={L - 6} y={TOP + H} textAnchor="end" className="chart-tick">
          {t.lo}
        </text>
        {template && <path d={path(template)} fill="none" className="chart-template" />}
        <path d={path(norm)} fill="none" stroke="var(--d1)" strokeWidth={1.8} strokeLinejoin="round" />
      </svg>
      <div className="fits">
        {ARC_SHAPES.map((a) => {
          const r = fits.find((f) => f.id === a.id)?.r ?? 0;
          return (
            <div key={a.id} className={a.id === shape ? "on" : ""}>
              <span className="fit-name">{labelOfArc(a, lang)}</span>
              <Meter value={Math.max(0, r)} color={a.id === shape ? "var(--d1)" : undefined} className="thin" />
              <span className="num">{num(lang, r, 2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const labelOfArc = (a: (typeof ARC_SHAPES)[number], lang: Lang) => (lang === "ru" ? a.ru : a.label).toLowerCase();

/** Label · meter · value rows. */
export function Bars({ items, sort = true }: { items: { id: string; label: string; value: number; color?: string }[]; sort?: boolean }) {
  const list = sort ? [...items].sort((a, b) => b.value - a.value) : items;
  const max = Math.max(0.0001, ...list.map((i) => i.value));
  return (
    <div className="book-bars">
      {list.map((i) => (
        <div key={i.id} className="book-bars-row">
          <span className="book-bars-label">
            {i.color && <Swatch color={i.color} />}
            {i.label.toLowerCase()}
          </span>
          <Meter value={i.value / max} color={i.color} />
          <span className="book-bars-value num">{Math.round(i.value * 100)}</span>
        </div>
      ))}
    </div>
  );
}

export const MoodBars = ({ mood }: { mood: Record<string, number> }) => {
  const lang = useLang();
  return <Bars items={MOODS.map((m) => ({ id: m.id, label: labelOf(m, lang), value: mood[m.id] ?? 0, color: m.color }))} />;
};
export const ModeBars = ({ mode }: { mode: Record<string, number> }) => {
  const lang = useLang();
  return <Bars items={MODES.filter((m) => m.id !== "paratext").map((m) => ({ id: m.id, label: labelOf(m, lang), value: mode[m.id] ?? 0, color: m.color }))} />;
};

/** Bipolar scales: left pole · track · right pole · value. */
export function Sliders({ items }: { items: { id: string; low: string; high: string; value: number; label?: string; reference?: number }[] }) {
  return (
    <div className="sliders">
      {items.map((s) => (
        <div key={s.id} className="slider-row" title={s.label}>
          <span className="slider-low">{s.low.toLowerCase()}</span>
          <Track value={s.value} reference={s.reference} />
          <span className="slider-high">{s.high.toLowerCase()}</span>
          <span className="slider-value num">{Math.round(s.value * 100)}</span>
        </div>
      ))}
    </div>
  );
}
