// Fig. 2: one or two dimensions over time, one mark per work (area = pages, shape = form), with LOESS curves.
// Where the two curves cross is marked. Hover a work for its values; click to open it.
import { useMemo, useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import { navigate } from "../../../../app/router.ts";
import {
  dimColor,
  dimLabel,
  GROUP_LABEL,
  GROUPS,
  groupOf,
  KIND_LABEL,
  workTitle,
  type Jev,
  type Kind,
  type Work,
} from "../data.ts";
import {
  Figure,
  fmt,
  local,
  loess,
  Seg,
  Tip,
  ticks,
  usePlot,
  useTween,
  type TipState,
} from "../kit.tsx";

type Scope = "novels" | "fiction";

const T = {
  en: {
    title: "Two lines, one crossing",
    caption:
      "Each mark is one work: its area follows its length in pages, its shape its form (circle: novel, square: novella, triangle: story). Lines are LOESS fits over works. Choose any two of Jev’s answers; hover a work for its values, click it to open the book.",
    first: "Line A",
    second: "Line B",
    none: "—",
    scope: "Works",
    novels: "novels",
    fiction: "all fiction",
    cross: (y: number) => `lines cross ≈ ${y}`,
    pages: "pages",
    open: "click to open",
  },
  ru: {
    title: "Две линии и одно пересечение",
    caption:
      "Каждый значок — одно произведение: площадь — его длина в страницах, форма — жанр (круг — роман, квадрат — повесть, треугольник — рассказ). Линии — сглаживание LOESS по произведениям. Выберите любые два ответа Jev; наведите на значок, чтобы увидеть значения, нажмите, чтобы открыть книгу.",
    first: "Линия A",
    second: "Линия B",
    none: "—",
    scope: "Произведения",
    novels: "романы",
    fiction: "вся проза",
    cross: (y: number) => `линии пересекаются ≈ ${y}`,
    pages: "стр.",
    open: "нажмите, чтобы открыть",
  },
};

function Glyph({
  kind,
  x,
  y,
  r,
  color,
  hollow,
}: {
  kind: Kind;
  x: number;
  y: number;
  r: number;
  color: string;
  hollow?: boolean;
}) {
  const style = {
    fill: hollow ? "var(--paper)" : color,
    stroke: hollow ? color : "var(--paper)",
    strokeWidth: hollow ? 1.6 : 1,
    fillOpacity: hollow ? 1 : 0.85,
  };
  if (kind === "novella")
    return (
      <rect
        x={x - r * 0.88}
        y={y - r * 0.88}
        width={r * 1.76}
        height={r * 1.76}
        style={style}
      />
    );
  if (kind === "story")
    return (
      <path
        d={`M${x},${y - r * 1.15} L${x + r * 1.05},${y + r * 0.7} L${x - r * 1.05},${y + r * 0.7}Z`}
        style={style}
      />
    );
  return <circle cx={x} cy={y} r={r} style={style} />;
}

export function Timeline({
  jev,
  n,
  a,
  b,
  onA,
  onB,
}: {
  jev: Jev;
  n: number;
  a: string;
  b: string | null;
  onA: (k: string) => void;
  onB: (k: string | null) => void;
}) {
  const lang = useLang();
  const t = T[lang];
  const [scope, setScope] = useState<Scope>("novels");
  const [ref, width] = usePlot();
  const [tip, setTip] = useState<TipState>(null);
  const [hover, setHover] = useState<string | null>(null);
  const works = useMemo(
    () => jev.works.filter((w) => scope === "fiction" || w.kind === "novel"),
    [jev, scope],
  );
  const ia = jev.keys.indexOf(a);
  const ib = b ? jev.keys.indexOf(b) : -1;
  const dims = ib >= 0 ? [ia, ib] : [ia];

  const narrow = width < 560;
  const height = Math.round(Math.min(480, Math.max(320, width * 0.58)));
  const m = { l: narrow ? 38 : 48, r: 16, t: 20, b: 36 };
  const years = [1989, 2026];
  const X = (v: number) =>
    m.l + ((v - years[0]) / (years[1] - years[0])) * (width - m.l - m.r);
  const vals = works.flatMap((w) => dims.map((d) => w.v[d]));
  const lo = Math.max(0, Math.min(...vals) - 0.04);
  const hi = Math.min(1, Math.max(...vals) + 0.04);
  const tl = useTween([lo, hi]);
  const Y = (v: number) =>
    height - m.b - ((v - tl[0]) / (tl[1] - tl[0] || 1)) * (height - m.t - m.b);
  const maxPages = Math.max(...jev.works.map((w) => w.pages));
  const rad = (p: number) =>
    Math.max(2.6, (narrow ? 8 : 11) * Math.sqrt(p / maxPages));

  const grid = useMemo(
    () =>
      Array.from(
        { length: 60 },
        (_, i) => years[0] + 2 + ((years[1] - years[0] - 4) * i) / 59,
      ),
    [],
  );
  const curves = dims.map((d) =>
    loess(
      works.map((w) => w.year),
      works.map((w) => w.v[d]),
      grid,
      scope === "novels" ? 0.75 : 0.5,
    ),
  );
  const tweened = useTween(
    curves.flat().concat(works.flatMap((w) => dims.map((d) => w.v[d]))),
  );
  const curveVals = dims.map((_, k) =>
    tweened.slice(k * grid.length, (k + 1) * grid.length),
  );
  const pointVals = tweened.slice(dims.length * grid.length);

  // Where curve A crosses curve B (the first sign change of their difference).
  let cross: number | null = null;
  if (dims.length === 2)
    for (let i = 1; i < grid.length; i++) {
      const d0 = curves[0][i - 1] - curves[1][i - 1],
        d1 = curves[0][i] - curves[1][i];
      if (
        Number.isFinite(d0) &&
        Number.isFinite(d1) &&
        Math.sign(d0) !== Math.sign(d1)
      ) {
        cross =
          grid[i - 1] +
          ((grid[i] - grid[i - 1]) * Math.abs(d0)) /
            (Math.abs(d0) + Math.abs(d1));
        break;
      }
    }

  const keyOptions = (withNone: boolean) => (
    <>
      {withNone && <option value="">{t.none}</option>}
      {GROUPS.map((g) => (
        <optgroup key={g} label={GROUP_LABEL[g][lang]}>
          {jev.keys
            .filter((k) => groupOf(k) === g)
            .map((k) => (
              <option key={k} value={k}>
                {dimLabel(k, lang)}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );

  const card = (w: Work) => (
    <>
      <b>{workTitle(w, lang)}</b>
      <span className="dim">
        {w.year} · {KIND_LABEL[w.kind][lang]} · {w.pages} {t.pages}
      </span>
      {dims.map((d) => (
        <span key={d}>
          <i
            className="jv-swatch"
            style={{ background: dimColor(jev.keys[d]) }}
          />{" "}
          {dimLabel(jev.keys[d], lang)} {fmt(lang, w.v[d])}
        </span>
      ))}
      <span className="dim">{t.open}</span>
    </>
  );

  return (
    <Figure
      n={n}
      id="jv-fig-2"
      title={t.title}
      caption={t.caption}
      controls={
        <>
          <label className="jv-control">
            <span className="jv-control-label">
              <i className="jv-swatch" style={{ background: dimColor(a) }} />{" "}
              {t.first}
            </span>
            <select
              className="jv-select"
              value={a}
              onChange={(e) => onA(e.target.value)}
            >
              {keyOptions(false)}
            </select>
          </label>
          <label className="jv-control">
            <span className="jv-control-label">
              {b && (
                <i className="jv-swatch" style={{ background: dimColor(b) }} />
              )}{" "}
              {t.second}
            </span>
            <select
              className="jv-select"
              value={b ?? ""}
              onChange={(e) => onB(e.target.value || null)}
            >
              {keyOptions(true)}
            </select>
          </label>
          <Seg
            label={t.scope}
            value={scope}
            onChange={setScope}
            options={[
              { value: "novels", label: t.novels },
              { value: "fiction", label: t.fiction },
            ]}
          />
        </>
      }
    >
      <div
        ref={ref}
        className="jv-box"
        onMouseLeave={() => (setTip(null), setHover(null))}
      >
        <svg
          width={width}
          height={height}
          className="jv-svg"
          role="img"
          aria-label={t.title}
        >
          {ticks(tl[0], tl[1], 5).map((v) => (
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
          {[1990, 2000, 2010, 2020].map((yr) => (
            <g key={yr}>
              <line
                x1={X(yr)}
                x2={X(yr)}
                y1={m.t}
                y2={height - m.b}
                className="jv-grid"
              />
              <text
                x={X(yr)}
                y={height - m.b + 20}
                textAnchor="middle"
                className="jv-tick"
              >
                {yr}
              </text>
            </g>
          ))}
          {cross != null && (
            <g className="jv-cross">
              <line x1={X(cross)} x2={X(cross)} y1={m.t} y2={height - m.b} />
              <text
                x={X(cross) > width - 150 ? X(cross) - 6 : X(cross) + 6}
                y={m.t + 12}
                textAnchor={X(cross) > width - 150 ? "end" : "start"}
              >
                {t.cross(Math.round(cross))}
              </text>
            </g>
          )}
          {dims.map((d, k) => (
            <path
              key={`c${k}`}
              d={grid
                .map((g, i) =>
                  Number.isFinite(curveVals[k][i])
                    ? `${i ? "L" : "M"}${X(g).toFixed(1)},${Y(curveVals[k][i]).toFixed(1)}`
                    : "",
                )
                .join("")}
              fill="none"
              stroke={dimColor(jev.keys[d])}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
          {works.map((w, i) =>
            dims.map((d, k) => {
              const v = pointVals[i * dims.length + k];
              return (
                <g
                  key={`${w.id}${k}`}
                  className={`jv-work ${hover && hover !== w.id ? "faded" : ""}`}
                  onMouseMove={(e) => {
                    const p = local({
                      ...e,
                      currentTarget: e.currentTarget.ownerSVGElement!,
                    });
                    setHover(w.id);
                    setTip({ x: p.x, y: p.y, content: card(w) });
                  }}
                  onClick={() => navigate(`/book/${w.id}`)}
                >
                  <Glyph
                    kind={w.kind}
                    x={X(w.year + (i % 3) * 0.12 - 0.12)}
                    y={Y(v)}
                    r={rad(w.pages)}
                    color={dimColor(jev.keys[d])}
                    hollow={k === 1}
                  />
                </g>
              );
            }),
          )}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
    </Figure>
  );
}
