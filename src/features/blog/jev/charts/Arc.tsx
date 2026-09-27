// Fig. 4: the average shape of a Pelevin novel. Each novel is cut into 20 equal stretches; the line is the mean
// over the novels with a 95% bootstrap band. Overlay any single novel; the strip below counts where climaxes fall.
import { useMemo, useState } from "react";
import { EMOTIONS, labelOf, TEXTURES } from "../../../../../shared/catalog.ts";
import { useLang } from "../../../../i18n/index.ts";
import { navigate } from "../../../../app/router.ts";
import { workTitle, type Jev } from "../data.ts";
import {
  Figure,
  fmt,
  local,
  signed,
  Tip,
  ticks,
  usePlot,
  useTween,
  type TipState,
} from "../kit.tsx";

const T = {
  en: {
    title: "The shape of a novel",
    caption: (n: number) =>
      `The ${n} novels, each cut into 20 equal stretches from first page to last. The line is the average over novels, the band its 95% bootstrap interval. Choose a score; choose a novel to lay its own curve over the average (click the curve to open the book). Below: in which tenth of each novel tension and pace peak.`,
    score: "Score",
    novel: "Overlay",
    none: "none",
    start: "first page",
    end: "last page",
    climax: "where the climax falls",
    tenth: (i: number) => `${i * 10}–${i * 10 + 10}%`,
    novels: "novels",
    ending: (d: string, up: number, n: number) =>
      `last tenth vs the rest: ${d} · higher in ${up} of ${n}`,
  },
  ru: {
    title: "Форма романа",
    caption: (n: number) =>
      `${n} романов, каждый разрезан на 20 равных отрезков от первой страницы до последней. Линия — среднее по романам, полоса — 95%-й бутстреп-интервал. Выберите оценку; выберите роман, чтобы наложить его собственную кривую на среднюю (нажмите на неё, чтобы открыть книгу). Внизу — в какой десятой части каждого романа пик напряжения и темпа.`,
    score: "Оценка",
    novel: "Наложить",
    none: "нет",
    start: "первая страница",
    end: "последняя",
    climax: "где кульминация",
    tenth: (i: number) => `${i * 10}–${i * 10 + 10}%`,
    novels: "романов",
    ending: (d: string, up: number, n: number) =>
      `последняя десятая против остального: ${d} · выше в ${up} из ${n}`,
  },
};

const DIMS = [
  "tension",
  "valence",
  "ideas",
  "humor",
  "fear",
  "sadness",
  "joy",
  "pace",
  "interiority",
  "imagery",
];
const colorOf = (d: string) =>
  EMOTIONS.find((e) => e.id === d)?.color ??
  (
    {
      tension: "#c0392b",
      valence: "#c99400",
      ideas: "var(--d5)",
      humor: "#d98a00",
      pace: "#e57a1f",
      interiority: "#5c6bc0",
      imagery: "var(--d3)",
    } as Record<string, string>
  )[d];

export function Arc({ jev, n }: { jev: Jev; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const [dim, setDim] = useState("tension");
  const [novel, setNovel] = useState<string>("");
  const [ref, width] = usePlot();
  const [tip, setTip] = useState<TipState>(null);
  const arc = jev.arcs.dims[dim];
  const bins = jev.arcs.bins;
  const novels = useMemo(
    () => jev.novels.map((id) => jev.works.find((w) => w.id === id)!),
    [jev],
  );
  const ni = novel ? jev.novels.indexOf(novel) : -1;
  const own = ni >= 0 ? arc.perBook[ni] : null;
  const label = (d: string) =>
    labelOf(
      (EMOTIONS as readonly { id: string; label: string; ru: string }[]).find(
        (e) => e.id === d,
      ) ?? TEXTURES.find((x) => x.id === d)!,
      lang,
    ).toLowerCase();

  const narrow = width < 560;
  const height = Math.round(Math.min(380, Math.max(260, width * 0.45)));
  const m = { l: narrow ? 38 : 48, r: 16, t: 16, b: 30 };
  const all = [...arc.lo, ...arc.hi, ...(own ?? [])];
  const g = useTween([
    ...arc.mean,
    ...arc.lo,
    ...arc.hi,
    ...(own ?? arc.mean),
    Math.max(0, Math.min(...all) - 0.03),
    Math.min(1, Math.max(...all) + 0.03),
  ]);
  const mean = g.slice(0, bins),
    lo = g.slice(bins, 2 * bins),
    hi = g.slice(2 * bins, 3 * bins),
    mine = g.slice(3 * bins, 4 * bins);
  const [y0, y1] = g.slice(4 * bins);
  const X = (i: number) => m.l + ((i + 0.5) / bins) * (width - m.l - m.r);
  const Y = (v: number) =>
    height - m.b - ((v - y0) / (y1 - y0 || 1)) * (height - m.t - m.b);
  const line = (vs: number[]) =>
    vs
      .map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
      .join("");
  const band = `${line(hi)}${lo
    .map((v, i) => [i, v] as const)
    .reverse()
    .map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
    .join("")}Z`;
  const c = colorOf(dim);
  const maxClimax = Math.max(...jev.arcs.climax);
  const [em, elo, ehi] = arc.ending;

  return (
    <Figure
      n={n}
      title={t.title}
      caption={t.caption(novels.length)}
      controls={
        <>
          <div className="jv-control" role="radiogroup" aria-label={t.score}>
            <span className="jv-control-label">{t.score}</span>
            <div className="jv-chips">
              {DIMS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={d === dim}
                  onClick={() => setDim(d)}
                  style={{ ["--c" as string]: colorOf(d) }}
                >
                  <i aria-hidden="true" />
                  {label(d)}
                </button>
              ))}
            </div>
          </div>
          <label className="jv-control">
            <span className="jv-control-label">{t.novel}</span>
            <select
              className="jv-select"
              value={novel}
              onChange={(e) => setNovel(e.target.value)}
            >
              <option value="">{t.none}</option>
              {novels.map((w) => (
                <option key={w.id} value={w.id}>
                  {workTitle(w, lang)} · {w.year}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <div ref={ref} className="jv-box" onMouseLeave={() => setTip(null)}>
        <svg
          width={width}
          height={height}
          className="jv-svg"
          role="img"
          aria-label={t.title}
          onMouseMove={(e) => {
            const p = local(e);
            const i = Math.max(
              0,
              Math.min(
                bins - 1,
                Math.floor(((p.x - m.l) / (width - m.l - m.r)) * bins),
              ),
            );
            setTip({
              x: p.x,
              y: p.y,
              content: (
                <>
                  <b>{`${i * 5}–${i * 5 + 5}%`}</b>
                  <span>
                    {label(dim)} {fmt(lang, arc.mean[i])} [
                    {fmt(lang, arc.lo[i])}, {fmt(lang, arc.hi[i])}]
                  </span>
                  {own && (
                    <span>
                      {workTitle(novels[ni], lang)}: {fmt(lang, own[i])}
                    </span>
                  )}
                </>
              ),
            });
          }}
        >
          {ticks(y0, y1, 4).map((v) => (
            <g key={v}>
              <line
                x1={m.l}
                x2={width - m.r}
                y1={Y(v)}
                y2={Y(v)}
                className="jv-grid"
              />
              <text
                x={m.l - 8}
                y={Y(v) + 4}
                textAnchor="end"
                className="jv-tick"
              >
                {fmt(lang, v, 2)}
              </text>
            </g>
          ))}
          <text x={m.l} y={height - 8} className="jv-tick">
            {t.start}
          </text>
          <text
            x={width - m.r}
            y={height - 8}
            className="jv-tick"
            textAnchor="end"
          >
            {t.end}
          </text>
          <path d={band} fill={c} opacity={0.16} />
          <path
            d={line(mean)}
            fill="none"
            stroke={c}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {own && (
            <path
              d={line(mine)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.6}
              strokeDasharray="4 3"
              style={{ cursor: "pointer" }}
              onClick={() => navigate(`/book/${novel}`)}
            />
          )}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
      <p className="jv-note num">
        {t.ending(
          `${signed(lang, em)} [${signed(lang, elo)}, ${signed(lang, ehi)}]`,
          arc.endingUp,
          novels.length,
        )}
      </p>
      <div className="jv-climax" aria-label={t.climax}>
        <span className="jv-control-label">{t.climax}</span>
        <div className="jv-climax-bars">
          {jev.arcs.climax.map((k, i) => (
            <span key={i} title={`${t.tenth(i)}: ${k} ${t.novels}`}>
              <i style={{ height: `${(k / maxClimax) * 100}%` }} />
              <b className="num">{k}</b>
            </span>
          ))}
        </div>
      </div>
    </Figure>
  );
}
