// Fig: works × works cosine similarity of TF-IDF vectors, ordered by year; pick a work to list its nearest.
import { useMemo, useState, type PointerEvent } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book } from "../data.ts";
import { BookOptions, Figure, fmtN, KIND_META, KindKey, Select, Tip, title, usePlot, useTip, yearMarks } from "./kit.tsx";

const T = {
  en: {
    title: "Who resembles whom",
    caption:
      "Cosine similarity between the TF-IDF word vectors of every pair of works, both axes in order of publication. The stronger the colour, the more shared (and more specifically shared) vocabulary; cells are shaded by rank among all pairs, so the strongest are the closest few percent.",
    pick: "Most similar to",
    none: "— pick a work —",
    low: "less alike",
    high: "more alike",
  },
  ru: {
    title: "Кто на кого похож",
    caption:
      "Косинусное сходство векторов TF-IDF для каждой пары текстов; обе оси — в порядке публикации. Чем насыщеннее цвет, тем больше у текстов общих и притом характерных слов; клетки окрашены по рангу среди всех пар, так что самые яркие — несколько процентов самых близких.",
    pick: "Больше всего похожи на",
    none: "— выберите текст —",
    low: "меньше сходства",
    high: "больше сходства",
  },
};

export function Similarity({ books, similarity, n, initial }: { books: Book[]; similarity: number[][]; n: number; initial?: string }) {
  const lang = useLang();
  const t = T[lang];
  const [sel, setSel] = useState<string>(initial ?? "");
  const [cell, setCell] = useState<[number, number] | null>(null);
  const [ref, width] = usePlot();
  const [tip, setTip] = useTip();

  const N = books.length;
  const narrow = width < 560;
  const side = Math.min(width, 620);
  const gutter = narrow ? 0 : 34;
  const cs = (side - gutter) / N;
  let lo = Infinity,
    hi = -Infinity;
  similarity.forEach((row, i) => row.forEach((v, j) => i !== j && ((lo = Math.min(lo, v)), (hi = Math.max(hi, v)))));
  // Shade by rank among all pairs: most values sit in a narrow band, and a linear ramp would wash them out.
  const op = useMemo(() => {
    const all: number[] = [];
    similarity.forEach((row, i) => row.forEach((v, j) => j > i && all.push(v)));
    all.sort((a, b) => a - b);
    return (v: number) => {
      let a = 0,
        b = all.length;
      while (a < b) {
        const mid = (a + b) >> 1;
        if (all[mid] < v) a = mid + 1;
        else b = mid;
      }
      return 0.04 + 0.96 * (a / Math.max(1, all.length - 1)) ** 1.6;
    };
  }, [similarity]);
  const si = books.findIndex((b) => b.id === sel);
  const nearest =
    si >= 0
      ? books
          .map((b, j) => ({ b, j, v: similarity[si][j] }))
          .filter((x) => x.j !== si)
          .sort((a, b) => b.v - a.v)
          .slice(0, 6)
      : [];

  // The grid is thousands of rects; build it once per selection/size so hovering only moves the focus box.
  const cells = useMemo(
    () =>
      similarity.map((row, i) =>
        row.map((v, j) => {
          const hot = si >= 0 && (i === si || j === si);
          return <rect key={`${i}-${j}`} x={j * cs} y={i * cs} width={cs + 0.3} height={cs + 0.3} style={{ fill: i === j ? "var(--ink)" : "var(--d1)", opacity: i === j ? 0.2 : si >= 0 && !hot ? op(v) * 0.3 : op(v) }} />;
        }),
      ),
    [similarity, si, cs],
  );

  const point = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - gutter,
      y = e.clientY - r.top - gutter;
    const i = Math.floor(y / cs),
      j = Math.floor(x / cs);
    if (i < 0 || j < 0 || i >= N || j >= N) return (setTip(null), setCell(null));
    setCell([i, j]);
    const a = books[i],
      b = books[j];
    setTip({
      x: x + gutter,
      y: y + gutter,
      content: (
        <>
          <span className="eda-tip-meta">
            <KindKey kind={a.kind} /> <b>{title(a, lang)}</b> · {a.year}
          </span>
          <span className="eda-tip-meta">
            <KindKey kind={b.kind} /> <b>{title(b, lang)}</b> · {b.year}
          </span>
          <span className="eda-tip-rows">
            <span>
              cos = <b>{fmtN(lang, similarity[i][j], 3)}</b>
            </span>
          </span>
        </>
      ),
    });
  };

  const decadeTicks = yearMarks(books, (i) => i * cs, 34);

  return (
    <Figure
      n={n}
      id="fig-similarity"
      title={t.title}
      caption={t.caption}
      controls={
        <Select label={t.pick} value={sel} onChange={setSel}>
          <option value="">{t.none}</option>
          <BookOptions books={books} lang={lang} />
        </Select>
      }
      table={
        si >= 0 ? (
          <table>
            <tbody>
              {nearest.map((x) => (
                <tr key={x.b.id}>
                  <td>{title(x.b, lang)}</td>
                  <td className="num">{fmtN(lang, x.v, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>{lang === "ru" ? "Выберите текст выше, чтобы увидеть список ближайших." : "Pick a work above to list its nearest neighbours."}</p>
        )
      }
    >
      <div className="eda-sim">
        <div ref={ref} className="eda-box">
          <div style={{ position: "relative", width: side }} onPointerLeave={() => (setTip(null), setCell(null))}>
            <svg width={side} height={side} role="img" aria-label={`${t.title}: ${N} × ${N}`} onPointerMove={point} onPointerDown={point}>
              <g transform={`translate(${gutter},${gutter})`}>
                {cells}
                {si >= 0 && (
                  <>
                    <rect x={0} y={si * cs} width={N * cs} height={cs} className="eda-cell-focus" />
                    <rect x={si * cs} y={0} width={cs} height={N * cs} className="eda-cell-focus" />
                  </>
                )}
                {cell && <rect x={cell[1] * cs} y={cell[0] * cs} width={cs} height={cs} className="eda-cell-focus strong" />}
              </g>
              {!narrow &&
                decadeTicks.map(({ b, i }) => (
                  <g key={b.id}>
                    <text x={gutter + i * cs} y={gutter - 6} className="eda-tick">
                      {b.year}
                    </text>
                    <text x={gutter - 4} y={gutter + i * cs + 8} textAnchor="end" className="eda-tick" transform={`rotate(-90 ${gutter - 4} ${gutter + i * cs + 8})`}>
                      {b.year}
                    </text>
                  </g>
                ))}
            </svg>
            <Tip tip={tip} width={side} />
          </div>
          <div className="eda-legend" aria-hidden="true">
            <span>{t.low}</span>
            <i className="eda-ramp seq" />
            <span>{t.high}</span>
            <span className="eda-dim">
              {fmtN(lang, lo, 2)}–{fmtN(lang, hi, 2)}
            </span>
          </div>
        </div>
        {si >= 0 && (
          <div className="eda-panel" aria-live="polite">
            <p className="eda-panel-k">
              {t.pick} «{title(books[si], lang)}»
            </p>
            <ol className="eda-bars">
              {nearest.map((x) => (
                <li key={x.b.id}>
                  <button type="button" className="eda-bar-row" onClick={() => setSel(x.b.id)}>
                    <span className="eda-bar-label">
                      <KindKey kind={x.b.kind} /> {title(x.b, lang)} <span className="eda-dim">{x.b.year}</span>
                    </span>
                    <span className="eda-bar-track">
                      <span className="eda-bar" style={{ width: `${(Math.max(0, x.v) / (nearest[0].v || 1)) * 100}%`, background: KIND_META[x.b.kind].color }} />
                    </span>
                    <span className="eda-num">{fmtN(lang, x.v, 2)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Figure>
  );
}
