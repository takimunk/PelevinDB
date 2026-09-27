// Fig. 1: every Jev dimension's trend with the year (Spearman's rho, per work), with its bootstrap 95% CI.
// Filled marks survive the Benjamini-Hochberg correction (q < 0.05). Click a row to plot it in Fig. 2.
import { useMemo, useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import {
  dimColor,
  dimLabel,
  GROUP_LABEL,
  groupOf,
  GROUPS,
  type Group,
  type Jev,
  type Trend,
} from "../data.ts";
import {
  Figure,
  fmt,
  local,
  pval,
  Seg,
  signed,
  Tip,
  usePlot,
  useTween,
  type TipState,
} from "../kit.tsx";

type Corpus = "novels" | "fiction";

const T = {
  en: {
    title: "What changed, 1989–2026",
    caption: (n: number) =>
      `Each row is one of the ${n} measurements Jev takes on every page (its 36 answers, with mood and narration spread over their options), averaged over each work. The dot is Spearman’s ρ between that average and the year; the whisker is a 95% bootstrap interval over works. Filled dots survive a false-discovery correction across all rows (q < 0.05). Click a row to plot it over time below.`,
    corpus: "Works",
    novels: "novels",
    fiction: "all fiction",
    group: "Show",
    all: "all",
    top: "Strongest",
    more: (n: number) => `show all ${n}`,
    less: "show the strongest",
    falls: "falls over the years",
    rises: "rises over the years",
    fallsShort: "falls",
    risesShort: "rises",
    loo: "without any one work",
    pick: "click to plot",
  },
  ru: {
    title: "Что изменилось за 1989–2026",
    caption: (n: number) =>
      `Каждая строка — одно из ${n} измерений, которые Jev снимает с каждой страницы (его 36 ответов, где настроение и способ повествования разложены по вариантам), усреднённое по произведению. Точка — ρ Спирмена между этим средним и годом; усы — 95%-й бутстреп-интервал по произведениям. Закрашены строки, которые выдерживают поправку на множественные сравнения (q < 0,05). Нажмите на строку, чтобы увидеть её во времени ниже.`,
    corpus: "Произведения",
    novels: "романы",
    fiction: "вся проза",
    group: "Показать",
    all: "всё",
    top: "Сильнейшие",
    more: (n: number) => `показать все ${n}`,
    less: "только сильнейшие",
    falls: "снижается с годами",
    rises: "растёт с годами",
    fallsShort: "падает",
    risesShort: "растёт",
    loo: "без любого одного произведения",
    pick: "нажмите, чтобы построить",
  },
};

const ROW = 22;
const TOP = 16;

export function Shift({
  jev,
  n,
  picked,
  onPick,
}: {
  jev: Jev;
  n: number;
  picked: string[];
  onPick: (key: string) => void;
}) {
  const lang = useLang();
  const t = T[lang];
  const [corpus, setCorpus] = useState<Corpus>("novels");
  const [group, setGroup] = useState<Group | "all">("all");
  const [all, setAll] = useState(false);
  const [ref, width] = usePlot();
  const [tip, setTip] = useState<TipState>(null);
  const trends = jev.trends[corpus];

  // Rows keep a stable identity; their order (and so their y) follows |rho| in the chosen corpus.
  const order = useMemo(() => {
    const list = trends
      .filter((r) => group === "all" || groupOf(r.key) === group)
      .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
    return all || group !== "all" ? list : list.slice(0, TOP);
  }, [trends, group, all]);
  const keys = jev.keys;
  const byKey = new Map(trends.map((r) => [r.key, r]));
  const slot = new Map(order.map((r, i) => [r.key, i]));

  const narrow = width < 560;
  const labelW = narrow ? 104 : 150;
  const m = { l: labelW, r: 16, t: 26, b: 30 };
  const height = m.t + m.b + order.length * ROW;
  const X = (v: number) => m.l + ((v + 1) / 2) * (width - m.l - m.r);
  // Tweened geometry for every key: rho, CI and row position.
  const target = keys.flatMap((k) => {
    const r = byKey.get(k)!;
    const s = slot.get(k);
    return [r.rho, r.ci[0], r.ci[1], s == null ? -1 : s];
  });
  const g = useTween(target);

  return (
    <Figure
      n={n}
      title={t.title}
      caption={t.caption(keys.length)}
      controls={
        <>
          <Seg
            label={t.corpus}
            value={corpus}
            onChange={setCorpus}
            options={[
              { value: "novels", label: `${t.novels} · ${jev.corpus.novels}` },
              { value: "fiction", label: `${t.fiction} · ${jev.corpus.works}` },
            ]}
          />
          <Seg
            label={t.group}
            value={group}
            onChange={setGroup}
            options={[
              { value: "all" as const, label: t.all },
              ...GROUPS.map((x) => ({ value: x, label: GROUP_LABEL[x][lang] })),
            ]}
          />
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
        >
          {[-1, -0.5, 0, 0.5, 1].map((v) => (
            <g key={v}>
              <line
                x1={X(v)}
                x2={X(v)}
                y1={m.t - 6}
                y2={height - m.b + 4}
                className={v === 0 ? "jv-axis" : "jv-grid"}
              />
              <text
                x={X(v)}
                y={height - m.b + 18}
                className="jv-tick"
                textAnchor="middle"
              >
                {v === 0 ? "0" : signed(lang, v, 1)}
              </text>
            </g>
          ))}
          <text x={X(-1)} y={m.t - 10} className="jv-tick" textAnchor="start">
            ← {narrow ? t.fallsShort : t.falls}
          </text>
          <text x={X(1)} y={m.t - 10} className="jv-tick" textAnchor="end">
            {narrow ? t.risesShort : t.rises} →
          </text>
          {keys.map((k, i) => {
            const [rho, lo, hi, s] = g.slice(i * 4, i * 4 + 4);
            if (s < -0.5 || !slot.has(k)) return null;
            const r = byKey.get(k)!;
            const y = m.t + s * ROW + ROW / 2;
            const c = dimColor(k);
            const sig = r.q < 0.05;
            const on = picked.includes(k);
            return (
              <g
                key={k}
                className={`jv-row ${on ? "on" : ""}`}
                onClick={() => onPick(k)}
                onMouseMove={(e) => {
                  const p = local({
                    ...e,
                    currentTarget: e.currentTarget.ownerSVGElement!,
                  });
                  setTip({
                    x: p.x,
                    y: p.y,
                    content: trendTip(r),
                  });
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={0}
                  y={y - ROW / 2}
                  width={width}
                  height={ROW}
                  className="jv-row-hit"
                />
                <text
                  x={labelW - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="jv-row-label"
                >
                  {dimLabel(k, lang)}
                </text>
                <line
                  x1={X(lo)}
                  x2={X(hi)}
                  y1={y}
                  y2={y}
                  stroke={c}
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={sig ? 0.55 : 0.3}
                />
                <circle
                  cx={X(rho)}
                  cy={y}
                  r={on ? 6 : 5}
                  fill={sig ? c : "var(--paper)"}
                  stroke={c}
                  strokeWidth={1.8}
                />
              </g>
            );
          })}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
      {group === "all" && (
        <button type="button" className="jv-more" onClick={() => setAll(!all)}>
          {all ? t.less : t.more(keys.length)}
        </button>
      )}
    </Figure>
  );

  function trendTip(r: Trend) {
    return (
      <>
        <b>{dimLabel(r.key, lang)}</b>
        <span>
          ρ = {signed(lang, r.rho)} [{signed(lang, r.ci[0])},{" "}
          {signed(lang, r.ci[1])}]
        </span>
        <span>
          {pval(lang, r.p)} · q = {fmt(lang, r.q, 3)}
        </span>
        <span className="dim">
          {t.loo}: {signed(lang, r.loo[0])}…{signed(lang, r.loo[1])}
        </span>
        <span className="dim">{t.pick}</span>
      </>
    );
  }
}
