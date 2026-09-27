// Fig: semantic fields × works heatmap, absolute (per 10k) or z-score per field; click a field for its lemmas.
import { useState, type PointerEvent } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book, Field, Kind } from "../data.ts";
import { KINDS } from "../data.ts";
import { Chips, Figure, fmtN, KIND_META, KindKey, mean, sd, Seg, Tip, title, usePlot, useTip, yearMarks } from "./kit.tsx";

type Norm = "abs" | "z";

const T = {
  en: {
    title: "Semantic fields",
    caption:
      "How much of each work belongs to a hand-picked field of lemmas, per 10,000 words. Works run left to right by year (top to bottom on a phone); by default only novels and novellas, since a two-page story can swing wildly on a handful of words. Pick a field name to see what it counts.",
    norm: "Scale",
    abs: "per 10k words",
    z: "z-score per field",
    kinds: "Forms",
    lemmas: "Lemmas counted",
    top: "Densest works",
    close: "Close",
    low: "less",
    high: "more",
    below: "below average",
    above: "above average",
  },
  ru: {
    title: "Семантические поля",
    caption:
      "Какая доля каждого текста приходится на вручную составленное поле лемм, на 10 000 слов. Тексты идут слева направо по годам (на телефоне — сверху вниз); по умолчанию только романы и повести: в рассказе на пару страниц несколько слов могут качнуть долю как угодно. Нажмите на название поля, чтобы увидеть, что в него входит.",
    norm: "Шкала",
    abs: "на 10 тыс. слов",
    z: "z-оценка по полю",
    kinds: "Формы",
    lemmas: "Какие леммы считаются",
    top: "Самые насыщенные тексты",
    close: "Закрыть",
    low: "меньше",
    high: "больше",
    below: "ниже среднего",
    above: "выше среднего",
  },
};

export function Fields({ books, fields, n }: { books: Book[]; fields: Field[]; n: number }) {
  const lang = useLang();
  const t = T[lang];
  const [normMode, setNorm] = useState<Norm>("z");
  const present = KINDS.filter((k) => books.some((b) => b.kind === k));
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(present.filter((k) => k === "novel" || k === "novella")));
  const [open, setOpen] = useState<string | null>(null);
  const [cell, setCell] = useState<[number, number] | null>(null);
  const [ref, width] = usePlot();
  const [tip, setTip] = useTip();

  const cols = books.map((b, i) => ({ b, i })).filter(({ b }) => kinds.has(b.kind));
  const stats = fields.map((f) => {
    const vals = cols.map((c) => f.perBook[c.i]);
    return { m: mean(vals), s: sd(vals), max: Math.max(1e-9, ...vals) };
  });
  const gmax = Math.max(...stats.map((s) => s.max));
  const vertical = width < 640; // phone: works down, fields across
  const label = (f: Field) => (lang === "ru" ? f.ru : f.en);

  const labelW = vertical ? 0 : Math.min(190, width * 0.26);
  const headH = vertical ? 96 : 0;
  const bookW = vertical ? Math.min(118, width * 0.36) : 0;
  const nF = fields.length,
    nB = cols.length;
  const cw = vertical ? (width - bookW - 40) / nF : (width - labelW) / Math.max(1, nB);
  const ch = vertical ? 15 : 22;
  const height = vertical ? headH + nB * ch + 4 : nF * ch + 26;

  const color = (fi: number, v: number): { fill: string; opacity: number } => {
    if (normMode === "abs") return { fill: "var(--d1)", opacity: Math.sqrt(v / gmax) * 0.95 + 0.02 };
    const z = (v - stats[fi].m) / stats[fi].s;
    return { fill: z >= 0 ? "var(--d2)" : "var(--d1)", opacity: Math.min(1, Math.abs(z) / 2.5) * 0.92 + 0.03 };
  };

  const show = (fi: number, ci: number, x: number, y: number) => {
    const f = fields[fi],
      c = cols[ci];
    if (!f || !c) return;
    const v = f.perBook[c.i];
    const z = (v - stats[fi].m) / stats[fi].s;
    setCell([fi, ci]);
    setTip({
      x,
      y,
      content: (
        <>
          <b className="eda-tip-title">{title(c.b, lang)}</b>
          <span className="eda-tip-meta">
            <KindKey kind={c.b.kind} /> {KIND_META[c.b.kind][lang]} · {c.b.year}
          </span>
          <span className="eda-tip-rows">
            <span>
              {label(f)}: <b>{fmtN(lang, v, 1)}</b> {t.abs}
            </span>
            <span>
              z = <b>{fmtN(lang, z, 2)}</b>
            </span>
          </span>
        </>
      ),
    });
  };

  const hit = (x: number, y: number) => {
    if (vertical) {
      if (y < headH || x < bookW) return null;
      return [Math.floor((x - bookW) / cw), Math.floor((y - headH) / ch)] as [number, number];
    }
    if (x < labelW || y > nF * ch) return null;
    return [Math.floor(y / ch), Math.floor((x - labelW) / cw)] as [number, number];
  };

  const point = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    const h = hit(x, y);
    if (h && h[0] >= 0 && h[1] >= 0) show(h[0], h[1], x, y);
    else (setTip(null), setCell(null));
  };

  const openField = fields.find((f) => f.key === open);
  const openIdx = openField ? fields.indexOf(openField) : -1;
  const topBooks = openField ? [...cols].sort((a, b) => openField.perBook[b.i] - openField.perBook[a.i]).slice(0, 5) : [];

  const yearTicks = yearMarks(
    cols.map((c) => c.b),
    (i) => i * cw,
    34,
    5,
  ).map(({ b, i }) => ({ c: cols[i], ci: i, b }));

  return (
    <Figure
      n={n}
      id="fig-fields"
      title={t.title}
      caption={t.caption}
      controls={
        <>
          <Seg
            label={t.norm}
            value={normMode}
            onChange={setNorm}
            options={[
              { value: "z", label: t.z },
              { value: "abs", label: t.abs },
            ]}
          />
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
          <div className="eda-control" role="group" aria-label={lang === "ru" ? "Поля" : "Fields"}>
            <span className="eda-control-label">{lang === "ru" ? "Поля" : "Fields"}</span>
            <div className="eda-chips">
              {fields.map((f) => (
                <button key={f.key} type="button" className="eda-chip ghost" aria-pressed={open === f.key} onClick={() => setOpen(open === f.key ? null : f.key)}>
                  {label(f)}
                </button>
              ))}
            </div>
          </div>
        </>
      }
      table={
        <table>
          <thead>
            <tr>
              <th>{lang === "ru" ? "Произведение" : "Work"}</th>
              {fields.map((f) => (
                <th key={f.key} className="num">
                  {label(f)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.map((c) => (
              <tr key={c.b.id}>
                <td>
                  {title(c.b, lang)} ({c.b.year})
                </td>
                {fields.map((f) => (
                  <td key={f.key} className="num">
                    {fmtN(lang, f.perBook[c.i], 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className="eda-box" onPointerLeave={() => (setTip(null), setCell(null))}>
        <svg width={width} height={height} role="img" aria-label={`${t.title}: ${fields.length} × ${cols.length}`} onPointerMove={point} onPointerDown={point}>
          {fields.map((f, fi) =>
            cols.map((c, ci) => {
              const { fill, opacity } = color(fi, f.perBook[c.i]);
              const x = vertical ? bookW + fi * cw : labelW + ci * cw;
              const y = vertical ? headH + ci * ch : fi * ch;
              const dim = openIdx >= 0 && openIdx !== fi;
              return <rect key={`${f.key}-${c.b.id}`} x={x + 0.5} y={y + 0.5} width={Math.max(0.5, cw - 1)} height={ch - 1} style={{ fill, opacity: dim ? opacity * 0.25 : opacity }} />;
            }),
          )}
          {cell && <rect className="eda-cell-focus" x={vertical ? bookW + cell[0] * cw : labelW + cell[1] * cw} y={vertical ? headH + cell[1] * ch : cell[0] * ch} width={cw} height={ch} />}
          {fields.map((f, fi) =>
            vertical ? (
              <text key={f.key} transform={`translate(${bookW + fi * cw + cw / 2 + 4},${headH - 6}) rotate(-60)`} className={`eda-row-label${openIdx === fi ? " on" : ""}`}>
                {label(f).length > 16 ? label(f).slice(0, 15) + "…" : label(f)}
              </text>
            ) : (
              <text
                key={f.key}
                x={labelW - 8}
                y={fi * ch + ch / 2 + 4}
                textAnchor="end"
                className={`eda-row-label${openIdx === fi ? " on" : ""}`}
                onClick={() => setOpen(open === f.key ? null : f.key)}
                style={{ cursor: "pointer" }}
              >
                {label(f)}
              </text>
            ),
          )}
          {vertical
            ? cols.map((c, ci) => (
                <text key={c.b.id} x={bookW - 6} y={headH + ci * ch + ch / 2 + 3.5} textAnchor="end" className="eda-tick small">
                  {(title(c.b, lang).length > 14 ? title(c.b, lang).slice(0, 13) + "…" : title(c.b, lang)) + " " + String(c.b.year).slice(2)}
                </text>
              ))
            : yearTicks.map(({ c, ci }) => (
                <text key={c.b.id} x={labelW + ci * cw + 1} y={nF * ch + 16} className="eda-tick">
                  {c.b.year}
                </text>
              ))}
        </svg>
        <Tip tip={tip} width={width} />
      </div>
      <div className="eda-legend" aria-hidden="true">
        {normMode === "abs" ? (
          <>
            <span>{t.low}</span>
            <i className="eda-ramp seq" />
            <span>{t.high}</span>
          </>
        ) : (
          <>
            <span>{t.below}</span>
            <i className="eda-ramp div" />
            <span>{t.above}</span>
          </>
        )}
      </div>
      {openField && (
        <div className="eda-panel" role="region" aria-label={label(openField)}>
          <div className="eda-panel-head">
            <b>{label(openField)}</b>
            <button type="button" className="eda-chip ghost" onClick={() => setOpen(null)}>
              × {t.close}
            </button>
          </div>
          <p className="eda-panel-k">{t.lemmas}</p>
          <p className="eda-lemmas" lang="ru">
            {openField.lemmas.join(" · ")}
          </p>
          <p className="eda-panel-k">{t.top}</p>
          <ol className="eda-toplist">
            {topBooks.map((c) => (
              <li key={c.b.id}>
                <span>
                  {title(c.b, lang)} <span className="eda-dim">{c.b.year}</span>
                </span>
                <span className="eda-num">{fmtN(lang, openField.perBook[c.i], 1)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Figure>
  );
}
