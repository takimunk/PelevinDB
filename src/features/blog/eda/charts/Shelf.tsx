// Fig: every work on a year axis, one lane per kind, mark area ∝ words.
import { useMemo, useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book, Kind } from "../data.ts";
import { KINDS } from "../data.ts";
import { BookCard, Chips, Figure, fmtN, KIND_META, KindKey, Mark, scale, Tip, title, usePlot, useTip } from "./kit.tsx";

const T = {
  en: {
    title: "The shelf, 1989 to now",
    caption: "Every work in the corpus by year of first publication. Area of the mark is proportional to length in words; shape and colour show the form.",
    kinds: "Show",
    shown: (n: number, w: string) => `${n} works · ${w} words shown`,
    words: "words",
    year: "Year",
    title_: "Title",
    kind: "Form",
  },
  ru: {
    title: "Полка: с 1989 года до наших дней",
    caption: "Все тексты корпуса по году первой публикации. Площадь значка пропорциональна длине в словах, форма и цвет обозначают жанр.",
    kinds: "Показать",
    shown: (n: number, w: string) => `на графике ${n} текстов · ${w} слов`,
    words: "слов",
    year: "Год",
    title_: "Название",
    kind: "Форма",
  },
};

export function Shelf({ books, n }: { books: Book[]; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const present = KINDS.filter((k) => books.some((b) => b.kind === k));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(present.filter((k) => k !== "interview")));
  const [ref, width] = usePlot();
  const [tip, setTip] = useTip();
  const [focus, setFocus] = useState<string | null>(null);

  const lanes = present.filter((k) => kinds.has(k));
  const visible = books.filter((b) => kinds.has(b.kind));
  const narrow = width < 560;
  const m = { l: narrow ? 8 : 88, r: 14, t: 12, b: 28 };
  const maxWords = Math.max(...books.map((b) => b.words));
  const rMax = narrow ? 11 : 15;
  const radius = (w: number) => Math.max(2.4, rMax * Math.sqrt(w / maxWords));
  const years = books.map((b) => b.year);
  const y0 = Math.min(...years) - 1,
    y1 = Math.max(...years) + 1;
  const x = scale(y0, y1, m.l, width - m.r);
  const yearW = Math.max(4, x(1) - x(0));
  const cols = Math.max(1, Math.floor((yearW * 0.9) / 7));
  const baseH = rMax * 2 + 18;
  const labelH = narrow ? 16 : 0;

  // Each lane is tall enough for its busiest year; works of one year pack into a small grid centred on the year.
  const layout = useMemo(() => {
    let top = m.t;
    const out: { k: Kind; top: number; h: number; points: { b: Book; x: number; y: number; r: number }[] }[] = [];
    for (const k of lanes) {
      const byYear = new Map<number, Book[]>();
      books.filter((b) => b.kind === k).forEach((b) => byYear.set(b.year, [...(byYear.get(b.year) ?? []), b]));
      const busiest = Math.max(1, ...[...byYear.values()].map((l) => l.length));
      const rowsNeeded = Math.ceil(busiest / cols);
      const h = Math.max(baseH, rowsNeeded * 7.5 + 16);
      const mid = top + labelH + h / 2;
      const points: { b: Book; x: number; y: number; r: number }[] = [];
      for (const [year, list] of byYear) {
        list.sort((a, b) => b.words - a.words);
        if (list.length <= 2 || k === "novel") {
          const step = Math.min(rMax, (h - 10) / list.length);
          list.forEach((b, i) => points.push({ b, x: x(year), y: mid + (i - (list.length - 1) / 2) * step, r: radius(b.words) }));
          continue;
        }
        const c = Math.min(cols, list.length);
        const rows = Math.ceil(list.length / c);
        const cw = (yearW * 0.9) / c,
          ch = Math.min(9, (h - 10) / rows);
        list.forEach((b, i) => {
          const col = i % c,
            row = Math.floor(i / c);
          points.push({ b, x: x(year) + (col - (c - 1) / 2) * cw, y: mid + (row - (rows - 1) / 2) * ch, r: Math.min(radius(b.words), Math.max(2.4, Math.min(cw, ch) / 2 + 0.5)) });
        });
      }
      out.push({ k, top: top + labelH, h, points });
      top += labelH + h;
    }
    return { lanes: out, bottom: top };
  }, [books, lanes.join(), width, narrow]);
  const points = layout.lanes.flatMap((l) => l.points).sort((a, b) => b.r - a.r);
  const height = layout.bottom + m.b;

  const yearTicks = [];
  for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) yearTicks.push(y);
  const total = visible.reduce((a, b) => a + b.words, 0);

  const show = (p: { b: Book; x: number; y: number }) => {
    setFocus(p.b.id);
    setTip({ x: p.x, y: p.y, content: <BookCard b={p.b} lang={lang} /> });
  };

  return (
    <Figure
      n={n}
      id="fig-shelf"
      title={t.title}
      caption={t.caption}
      controls={
        <>
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
          <span className="eda-readout">{t.shown(visible.length, fmtN(lang, total))}</span>
        </>
      }
      table={
        <table>
          <thead>
            <tr>
              <th>{t.year}</th>
              <th>{t.title_}</th>
              <th>{t.kind}</th>
              <th className="num">{t.words}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.id}>
                <td>{b.year}</td>
                <td>{title(b, lang)}</td>
                <td>{KIND_META[b.kind][lang]}</td>
                <td className="num">{fmtN(lang, b.words)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="eda-box" onPointerLeave={() => (setTip(null), setFocus(null))}>
        <svg width={width} height={height} role="img" aria-label={`${t.title}. ${t.shown(visible.length, fmtN(lang, total))}`}>
          {yearTicks.map((y) => (
            <g key={y}>
              <line x1={x(y)} x2={x(y)} y1={m.t} y2={height - m.b} className="eda-grid" />
              <text x={x(y)} y={height - m.b + 16} className="eda-tick" textAnchor="middle">
                {narrow && y % 10 !== 0 ? "" : y}
              </text>
            </g>
          ))}
          {layout.lanes.map(({ k, top, h }) => {
            return (
              <g key={k}>
                <line x1={m.l} x2={width - m.r} y1={top + h / 2} y2={top + h / 2} className="eda-lane" />
                <text x={narrow ? m.l : m.l - 10} y={narrow ? top - 3 : top + h / 2 + 4} textAnchor={narrow ? "start" : "end"} className="eda-lane-label">
                  {KIND_META[k][lang === "ru" ? "ruP" : "enP"]}
                </text>
              </g>
            );
          })}
          {points.map((p) => (
            <g
              key={p.b.id}
              className={`eda-hit${focus && focus !== p.b.id ? " dim" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={`${title(p.b, lang)}, ${p.b.year}, ${fmtN(lang, p.b.words)} ${t.words}`}
              onPointerEnter={() => show(p)}
              onPointerDown={() => show(p)}
              onFocus={() => show(p)}
              onBlur={() => (setTip(null), setFocus(null))}
            >
              <circle cx={p.x} cy={p.y} r={Math.max(p.r, 9)} fill="transparent" />
              <Mark kind={p.b.kind} x={p.x} y={p.y} r={p.r} opacity={0.88} />
            </g>
          ))}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
    </Figure>
  );
}
