// Fig: 2-D map of works from word usage (LSA, or t-SNE when present), coloured by form or decade.
import { useMemo, useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book, Eda } from "../data.ts";
import { KINDS } from "../data.ts";
import { BookCard, extent, Figure, fmtN, KIND_META, KindKey, Mark, pad, scale, Seg, Tip, title, usePlot, useTip } from "./kit.tsx";

type Proj = "lsa" | "tsne";
type ColorBy = "kind" | "decade";
const DECADE_COLORS = ["var(--d6)", "var(--d1)", "var(--d4)", "var(--d7)", "var(--d3)", "var(--d2)"];

const T = {
  en: {
    title: "The semantic map",
    caption: (p: Proj) =>
      p === "lsa"
        ? "Works placed by their vocabulary: latent semantic analysis of TF-IDF weights, first two components. Axis ends list the lemmas that pull a work that way. Close marks share words, not necessarily plots."
        : "The same works laid out by t-SNE, which keeps near neighbours near but makes distances between clusters and the axes themselves meaningless.",
    proj: "Projection",
    color: "Colour by",
    kind: "form",
    decade: "decade",
    distinctive: "Most distinctive words",
    labels: "Labels",
    show: "novels",
    hide: "none",
  },
  ru: {
    title: "Семантическая карта",
    caption: (p: Proj) =>
      p === "lsa"
        ? "Тексты расставлены по словарю: латентно-семантический анализ весов TF-IDF, первые две компоненты. На концах осей — леммы, которые тянут текст в эту сторону. Близость значков означает общие слова, а не обязательно общий сюжет."
        : "Те же тексты, разложенные методом t-SNE: он сохраняет ближайших соседей рядом, но расстояния между группами и сами оси смысла не имеют.",
    proj: "Проекция",
    color: "Цвет",
    kind: "форма",
    decade: "десятилетие",
    distinctive: "Самые характерные слова",
    labels: "Подписи",
    show: "романы",
    hide: "нет",
  },
};

export function SemanticMap({ eda, n }: { eda: Eda; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const { books, map } = eda;
  const distinctive = eda.distinctiveCommon ?? eda.distinctive;
  const [proj, setProj] = useState<Proj>("lsa");
  const [colorBy, setColorBy] = useState<ColorBy>("kind");
  const [labels, setLabels] = useState<"on" | "off">("on");
  const [focus, setFocus] = useState<string | null>(null);
  const [ref, width] = usePlot();
  const [tip, setTip] = useTip();
  const coords = proj === "tsne" && map.tsne ? map.tsne : map.lsa;

  const narrow = width < 560;
  const height = Math.round(Math.min(560, Math.max(320, width * 0.72)));
  const m = { l: 16, r: 16, t: 30, b: 50 };
  const X = scale(...pad(extent(coords.map((c) => c[0])), 0.08), m.l, width - m.r);
  const Y = scale(...pad(extent(coords.map((c) => c[1])), 0.08), height - m.b, m.t);
  // 1989 is the only 1980s work; it joins the 1990s bin.
  const decadeOf = (y: number) => Math.max(1990, Math.floor(y / 10) * 10);
  const decades = [...new Set(books.map((b) => decadeOf(b.year)))].sort();
  const colorOf = (b: Book) => (colorBy === "kind" ? KIND_META[b.kind].color : DECADE_COLORS[decades.indexOf(decadeOf(b.year)) % DECADE_COLORS.length]);
  const maxW = Math.max(...books.map((b) => b.words));
  const rad = (w: number) => Math.max(3.5, (narrow ? 9 : 12) * Math.sqrt(w / maxW));

  // Greedy label placement: biggest works first, skip anything that would overlap.
  const placed = useMemo(() => {
    if (labels === "off") return [];
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const out: { b: Book; x: number; y: number; anchor: "start" | "end" }[] = [];
    const order = books
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.kind === "novel" || (!narrow && b.words > maxW * 0.25))
      .sort((a, z) => z.b.words - a.b.words);
    for (const { b, i } of order) {
      const cx = X(coords[i][0]),
        cy = Y(coords[i][1]);
      const text = title(b, lang);
      const w = text.length * 6.4 + 4;
      for (const anchor of ["start", "end"] as const) {
        const x0 = anchor === "start" ? cx + rad(b.words) + 3 : cx - rad(b.words) - 3 - w;
        const box = { x0, y0: cy - 9, x1: x0 + w, y1: cy + 5 };
        if (box.x0 < 0 || box.x1 > width) continue;
        if (boxes.some((o) => !(box.x1 < o.x0 || box.x0 > o.x1 || box.y1 < o.y0 || box.y0 > o.y1))) continue;
        boxes.push(box);
        out.push({ b, x: anchor === "start" ? box.x0 : box.x1, y: cy + 3.5, anchor });
        break;
      }
    }
    return out;
  }, [books, coords, width, lang, labels]);

  const show = (b: Book, i: number) => {
    setFocus(b.id);
    const words = (distinctive[b.id] ?? []).slice(0, 8).map((d) => d[0]);
    setTip({
      x: X(coords[i][0]),
      y: Y(coords[i][1]),
      content: (
        <BookCard
          b={b}
          lang={lang}
          extra={
            words.length > 0 && (
              <span className="eda-tip-words" lang="ru">
                <span className="eda-tip-k">{t.distinctive}</span>
                {words.join(" · ")}
              </span>
            )
          }
        />
      ),
    });
  };

  const comp = map.components;
  const legend =
    colorBy === "kind"
      ? KINDS.filter((k) => books.some((b) => b.kind === k)).map((k) => (
          <span key={k}>
            <KindKey kind={k} /> {KIND_META[k][lang === "ru" ? "ruP" : "enP"]}
          </span>
        ))
      : decades.map((d, i) => (
          <span key={d}>
            <i className="eda-swatch round" style={{ background: DECADE_COLORS[i % DECADE_COLORS.length] }} />{" "}
            {d === 1990 && books.some((b) => b.year < 1990) ? (lang === "ru" ? "1989–1999" : "1989–99") : lang === "ru" ? `${d}-е` : `${d}s`}
          </span>
        ));

  return (
    <Figure
      n={n}
      id="fig-map"
      title={t.title}
      caption={t.caption(proj)}
      controls={
        <>
          {map.tsne && (
            <Seg
              label={t.proj}
              value={proj}
              onChange={setProj}
              options={[
                { value: "lsa", label: "LSA" },
                { value: "tsne", label: "t-SNE" },
              ]}
            />
          )}
          <Seg
            label={t.color}
            value={colorBy}
            onChange={setColorBy}
            options={[
              { value: "kind", label: t.kind },
              { value: "decade", label: t.decade },
            ]}
          />
          <Seg
            label={t.labels}
            value={labels}
            onChange={setLabels}
            options={[
              { value: "on", label: t.show },
              { value: "off", label: t.hide },
            ]}
          />
        </>
      }
      table={
        <table>
          <thead>
            <tr>
              <th>{lang === "ru" ? "Произведение" : "Work"}</th>
              <th className="num">x</th>
              <th className="num">y</th>
              <th>{t.distinctive}</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b, i) => (
              <tr key={b.id}>
                <td>
                  {title(b, lang)} ({b.year})
                </td>
                <td className="num">{fmtN(lang, coords[i][0], 2)}</td>
                <td className="num">{fmtN(lang, coords[i][1], 2)}</td>
                <td lang="ru">
                  {(distinctive[b.id] ?? [])
                    .slice(0, 5)
                    .map((d) => d[0])
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="eda-box" onPointerLeave={() => (setTip(null), setFocus(null))}>
        <svg width={width} height={height} role="img" aria-label={`${t.title} (${proj.toUpperCase()})`}>
          <rect x={m.l} y={m.t} width={width - m.l - m.r} height={height - m.t - m.b} className="eda-frame" />
          <line x1={X(0)} x2={X(0)} y1={m.t} y2={height - m.b} className="eda-grid" />
          <line x1={m.l} x2={width - m.r} y1={Y(0)} y2={Y(0)} className="eda-grid" />
          {proj === "lsa" && comp[0] && (
            <>
              <text x={m.l} y={height - 8} className="eda-axis-title" lang="ru">
                ← {comp[0].negative.slice(0, narrow ? 2 : 4).join(", ")}
              </text>
              <text x={width - m.r} y={height - 8} textAnchor="end" className="eda-axis-title" lang="ru">
                {comp[0].positive.slice(0, narrow ? 2 : 4).join(", ")} →
              </text>
            </>
          )}
          {proj === "lsa" && comp[1] && (
            <>
              <text x={m.l} y={m.t - 10} className="eda-axis-title" lang="ru">
                ↑ {comp[1].positive.slice(0, narrow ? 3 : 5).join(", ")}
              </text>
              <text x={m.l} y={height - m.b + 16} className="eda-axis-title" lang="ru">
                ↓ {comp[1].negative.slice(0, narrow ? 3 : 5).join(", ")}
              </text>
            </>
          )}
          {books.map((b, i) => {
            const cx = X(coords[i][0]),
              cy = Y(coords[i][1]);
            return (
              <g
                key={b.id}
                className={`eda-hit${focus && focus !== b.id ? " dim" : ""}`}
                tabIndex={0}
                role="button"
                aria-label={`${title(b, lang)}, ${b.year}`}
                onPointerEnter={() => show(b, i)}
                onPointerDown={() => show(b, i)}
                onFocus={() => show(b, i)}
                onBlur={() => (setTip(null), setFocus(null))}
              >
                <circle cx={cx} cy={cy} r={Math.max(10, rad(b.words))} fill="transparent" />
                <Mark kind={b.kind} x={cx} y={cy} r={rad(b.words)} fill={colorOf(b)} opacity={0.85} />
              </g>
            );
          })}
          {placed.map((p) => (
            <text key={p.b.id} x={p.x} y={p.y} textAnchor={p.anchor} className={`eda-label halo${focus && focus !== p.b.id ? " dim" : ""}`}>
              {title(p.b, lang)}
            </text>
          ))}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
      <div className="eda-legend">{legend}</div>
    </Figure>
  );
}
