// Fig. 5: sentences read one by one (the random sample only). Left: how often each voice produces an aphorism.
// Right: per work, over the years, the share of the narrator's own comments, of aphorisms, or mean abstraction.
import { useState } from "react";
import { labelOf, SENTENCE_ACTS } from "../../../../../shared/catalog.ts";
import { useLang } from "../../../../i18n/index.ts";
import { navigate } from "../../../../app/router.ts";
import { KIND_LABEL, workTitle, type Jev, type Work } from "../data.ts";
import {
  Figure,
  fmt,
  local,
  loess,
  pct,
  pval,
  Seg,
  signed,
  Tip,
  ticks,
  usePlot,
  useTween,
  type TipState,
} from "../kit.tsx";

type Metric = "comment" | "aphorism" | "abstraction";

const T = {
  en: {
    title: "The narrator steps forward",
    caption: (n: number, b: number) =>
      `${n.toLocaleString("en")} sentences drawn at random from every story page and read by Jev one at a time, with their neighbours for context. Left: the share of each kind of line that Jev judges a free-standing aphorism, with 95% intervals. Right: one dot per work with at least 25 sampled sentences (${b} works), with a LOESS line.`,
    aphorisms: "aphorisms, by voice",
    metric: "Over time",
    comment: "narrator’s comments",
    aphorism: "aphorisms",
    abstraction: "abstraction",
    share: "share of sentences",
    mean: "mean score",
    n: "sentences",
    open: "click to open",
  },
  ru: {
    title: "Рассказчик выходит вперёд",
    caption: (n: number, b: number) =>
      `${n.toLocaleString("ru")} фраз, выбранных случайно со всех страниц прозы и прочитанных Jev по одной, вместе с соседними. Слева — доля реплик каждого рода, которые Jev считает самостоятельным афоризмом, с 95%-ми интервалами. Справа — точка на каждое произведение, где в выборку попало не меньше 25 фраз (${b} произведений), и линия LOESS.`,
    aphorisms: "афоризмы по голосам",
    metric: "Со временем",
    comment: "комментарии рассказчика",
    aphorism: "афоризмы",
    abstraction: "абстрактность",
    share: "доля фраз",
    mean: "средняя оценка",
    n: "фраз",
    open: "нажмите, чтобы открыть",
  },
};

export function Voices({ jev, n }: { jev: Jev; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const s = jev.sentences;
  const [metric, setMetric] = useState<Metric>("comment");
  const [ref, width] = usePlot();
  const [tip, setTip] = useState<TipState>(null);
  const narrow = width < 700;
  const leftW = narrow ? width : Math.round(width * 0.4);
  const rightW = narrow ? width : width - leftW - 28;

  // Left: bars with CI.
  const voices = [...s.voices].sort((a, b) => b.aphorism[0] - a.aphorism[0]);
  const maxV = Math.max(...voices.map((v) => v.aphorism[2])) * 1.08;
  const barH = 34;
  const lblW = 104;
  const BX = (v: number) =>
    lblW + (v / maxV) * (leftW - lblW - (narrow ? 64 : 110));

  // Right: scatter over years.
  const works = jev.works.filter((w) => w[metric] != null) as (Work &
    Record<Metric, number>)[];
  const h = 260;
  const m = { l: 44, r: 12, t: 14, b: 28 };
  const vals = works.map((w) => w[metric]);
  const [y0, y1] = useTween([0, Math.max(...vals) * 1.12]);
  const X = (yr: number) =>
    m.l + ((yr - 1989) / (2026 - 1989)) * (rightW - m.l - m.r);
  const Y = (v: number) =>
    h - m.b - ((v - y0) / (y1 - y0 || 1)) * (h - m.t - m.b);
  const grid = Array.from({ length: 40 }, (_, i) => 1991 + (33 * i) / 39);
  const fit = loess(
    works.map((w) => w.year),
    vals,
    grid,
    0.8,
  );
  const pts = useTween([...works.map((w) => w[metric]), ...fit]);
  const trend = s[metric];
  const fmtV = (v: number) =>
    metric === "abstraction" ? fmt(lang, v, 2) : pct(lang, v, 0);

  return (
    <Figure
      n={n}
      title={t.title}
      caption={t.caption(s.sample, s.books)}
      controls={
        <Seg
          label={t.metric}
          value={metric}
          onChange={setMetric}
          options={(["comment", "aphorism", "abstraction"] as const).map(
            (v) => ({ value: v, label: t[v] }),
          )}
        />
      }
    >
      <div
        ref={ref}
        className={`jv-voices ${narrow ? "narrow" : ""}`}
        onMouseLeave={() => setTip(null)}
      >
        <div>
          <p className="jv-panel-head">{t.aphorisms}</p>
          <svg
            width={leftW}
            height={voices.length * barH + 8}
            className="jv-svg"
            role="img"
            aria-label={t.aphorisms}
          >
            {voices.map((v, i) => {
              const y = i * barH + barH / 2;
              const act = SENTENCE_ACTS.find((a) => a.id === v.act)!;
              return (
                <g key={v.act}>
                  <text
                    x={lblW - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="jv-row-label"
                  >
                    {labelOf(act, lang).toLowerCase()}
                  </text>
                  <rect
                    x={lblW}
                    y={y - 9}
                    width={Math.max(1, BX(v.aphorism[0]) - lblW)}
                    height={18}
                    fill={act.color}
                    opacity={0.85}
                    rx={1}
                  />
                  <line
                    x1={BX(v.aphorism[1])}
                    x2={BX(v.aphorism[2])}
                    y1={y}
                    y2={y}
                    stroke="var(--ink)"
                    strokeWidth={1.4}
                  />
                  <text x={BX(v.aphorism[2]) + 6} y={y + 4} className="jv-tick">
                    {pct(lang, v.aphorism[0])}
                    {!narrow && ` · n=${v.n.toLocaleString(lang)}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="jv-box">
          <p className="jv-panel-head">
            {t[metric]} · ρ = {signed(lang, trend.rho)} · {pval(lang, trend.p)}
          </p>
          <svg
            width={rightW}
            height={h}
            className="jv-svg"
            role="img"
            aria-label={t[metric]}
          >
            {ticks(y0, y1, 4).map((v) => (
              <g key={v}>
                <line
                  x1={m.l}
                  x2={rightW - m.r}
                  y1={Y(v)}
                  y2={Y(v)}
                  className="jv-grid"
                />
                <text
                  x={m.l - 6}
                  y={Y(v) + 4}
                  textAnchor="end"
                  className="jv-tick"
                >
                  {fmtV(v)}
                </text>
              </g>
            ))}
            {[1990, 2000, 2010, 2020].map((yr) => (
              <text
                key={yr}
                x={X(yr)}
                y={h - 8}
                textAnchor="middle"
                className="jv-tick"
              >
                {yr}
              </text>
            ))}
            <path
              d={grid
                .map(
                  (g, i) =>
                    `${i ? "L" : "M"}${X(g).toFixed(1)},${Y(pts[works.length + i]).toFixed(1)}`,
                )
                .join("")}
              fill="none"
              stroke="var(--d5)"
              strokeWidth={3}
              strokeLinecap="round"
            />
            {works.map((w, i) => (
              <circle
                key={w.id}
                cx={X(w.year)}
                cy={Y(pts[i])}
                r={w.kind === "novel" ? 5.5 : 4}
                fill={w.kind === "novel" ? "var(--d5)" : "var(--paper)"}
                stroke="var(--d5)"
                strokeWidth={1.5}
                className="jv-dot"
                onMouseMove={(e) => {
                  const p = local({
                    ...e,
                    currentTarget:
                      e.currentTarget.ownerSVGElement!.parentElement!,
                  });
                  setTip({
                    x: p.x,
                    y: p.y,
                    content: (
                      <>
                        <b>{workTitle(w, lang)}</b>
                        <span className="dim">
                          {w.year} · {KIND_LABEL[w.kind][lang]} · {w.sampled}{" "}
                          {t.n}
                        </span>
                        <span>
                          {t[metric]}: {fmtV(w[metric])}
                        </span>
                        <span className="dim">{t.open}</span>
                      </>
                    ),
                  });
                }}
                onClick={() => navigate(`/book/${w.id}`)}
              />
            ))}
          </svg>
          <Tip tip={tip} width={rightW} />
        </div>
      </div>
    </Figure>
  );
}
