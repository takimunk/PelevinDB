// Fig. 3: how the 15 scores move together from page to page inside a work (each work's own mean removed, so the
// correlations say nothing about which books are funnier, only about which pages are). Hover a cell; pick a row.
import { useState } from "react";
import { EMOTIONS, labelOf, TEXTURES } from "../../../../../shared/catalog.ts";
import { useLang } from "../../../../i18n/index.ts";
import type { Jev } from "../data.ts";
import { Figure, signed, usePlot, useTween } from "../kit.tsx";

const T = {
  en: {
    title: "What goes with what, page by page",
    caption: (pages: number) =>
      `Pearson correlations between Jev’s scores over ${pages.toLocaleString("en")} story pages, after removing each work’s own average, so a correlation means that pages which score higher on one score higher on the other within the same book. Red: together; blue: apart. Pick a score to list its partners.`,
    partners: (s: string) => `Pages with more ${s} also have…`,
    more: "more",
    less: "less",
  },
  ru: {
    title: "Что с чем ходит на одной странице",
    caption: (pages: number) =>
      `Корреляции Пирсона между оценками Jev по ${pages.toLocaleString("ru")} страницам прозы, из которых вычтено среднее каждого произведения: корреляция значит, что внутри одной книги страницы, где больше одного, это страницы, где больше и другого. Красное — вместе, синее — врозь. Выберите оценку, чтобы увидеть её пары.`,
    partners: (s: string) => `Где больше: ${s}, там…`,
    more: "больше",
    less: "меньше",
  },
};

const color = (r: number) =>
  r >= 0
    ? `color-mix(in oklab, var(--d2) ${Math.min(100, Math.abs(r) * 125).toFixed(0)}%, var(--paper))`
    : `color-mix(in oklab, var(--d1) ${Math.min(100, Math.abs(r) * 125).toFixed(0)}%, var(--paper))`;

export function Coupling({ jev, n }: { jev: Jev; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const ids = jev.scores;
  const label = (id: string) =>
    labelOf(
      (EMOTIONS as readonly { id: string; label: string; ru: string }[]).find(
        (e) => e.id === id,
      ) ?? TEXTURES.find((x) => x.id === id)!,
      lang,
    ).toLowerCase();
  const [sel, setSel] = useState(ids.indexOf("humor"));
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [ref, width] = usePlot();
  const narrow = width < 640;
  // The column labels lean right past the last column: leave them room.
  const side = narrow ? width - 28 : Math.min(520, width * 0.6);
  const labelW = narrow ? 102 : 104;
  const cell = (side - labelW) / ids.length;
  const partners = ids
    .map((id, j) => ({ id, j, r: jev.coupling[sel][j] }))
    .filter((p) => p.j !== sel)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const bars = useTween(partners.map((p) => p.r));
  const cur = hover ?? null;

  return (
    <Figure n={n} title={t.title} caption={t.caption(jev.corpus.pages)}>
      <div ref={ref} className={`jv-coupling ${narrow ? "narrow" : ""}`}>
        <svg
          width={side}
          height={labelW + cell * ids.length}
          className="jv-svg"
          role="img"
          aria-label={t.title}
          onMouseLeave={() => setHover(null)}
        >
          {ids.map((id, i) => (
            <g key={id}>
              <text
                x={labelW - 6}
                y={labelW + i * cell + cell / 2 + 4}
                textAnchor="end"
                className={`jv-row-label ${i === sel ? "on" : ""} ${cur && (cur[0] === i || cur[1] === i) ? "hot" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setSel(i)}
              >
                {label(id)}
              </text>
              <text
                transform={`translate(${labelW + i * cell + cell / 2 + 4},${labelW - 6}) rotate(-60)`}
                className={`jv-row-label ${i === sel ? "on" : ""} ${cur && (cur[0] === i || cur[1] === i) ? "hot" : ""}`}
                style={{ cursor: "pointer" }}
                onClick={() => setSel(i)}
              >
                {label(id)}
              </text>
              {ids.map((_, j) => {
                const r = jev.coupling[i][j];
                const on = i === sel || j === sel;
                return (
                  <rect
                    key={j}
                    x={labelW + j * cell + 0.5}
                    y={labelW + i * cell + 0.5}
                    width={cell - 1}
                    height={cell - 1}
                    fill={i === j ? "var(--surface-2)" : color(r)}
                    opacity={
                      cur
                        ? cur[0] === i || cur[1] === j
                          ? 1
                          : 0.35
                        : on
                          ? 1
                          : 0.55
                    }
                    onMouseEnter={() => setHover([i, j])}
                    onClick={() => setSel(i)}
                    style={{ cursor: "pointer", transition: "opacity .2s" }}
                  />
                );
              })}
            </g>
          ))}
          {cur && cur[0] !== cur[1] && (
            <text x={labelW} y={14} className="jv-cell-read">
              {label(ids[cur[0]])} × {label(ids[cur[1]])}: r ={" "}
              {signed(lang, jev.coupling[cur[0]][cur[1]])}
            </text>
          )}
        </svg>
        <div className="jv-partners">
          <p className="jv-partners-head">{t.partners(label(ids[sel]))}</p>
          <ol>
            {partners.map((p, k) => (
              <li key={p.id}>
                <span className="jv-partner-name">{label(p.id)}</span>
                <span className="jv-partner-bar">
                  <i
                    style={{
                      left: bars[k] < 0 ? `${50 + bars[k] * 50}%` : "50%",
                      width: `${Math.abs(bars[k]) * 50}%`,
                      background: bars[k] < 0 ? "var(--d1)" : "var(--d2)",
                    }}
                  />
                </span>
                <span className="jv-partner-r num">{signed(lang, p.r)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Figure>
  );
}
