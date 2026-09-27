import type { CSSProperties } from "react";
import { href } from "../../app/router.ts";
import { useLang, useT, type Lang } from "../../i18n/index.ts";
import type { CanonRow } from "../../storage/corpus.ts";
import { dec, fmt, pct } from "../../ui/format.ts";
import { kindLabel, primaryTitle, secondaryTitle } from "./labels.ts";
import { COLUMNS, column, VIEWS, type Column, type ShelfState } from "./shelf.ts";

const T = {
  en: {
    table: "Pelevin’s works",
    sortBy: "Sort by",
    sortLabel: "Sort works",
    reverse: "Reverse sort order",
    asc: "Ascending ↑",
    desc: "Descending ↓",
    pages: (n: string) => `${n} pages`,
    full: "read in full",
    read: (p: string) => `${p} read`,
    open: "Open the book",
    details: (view: string) => `${view} · details`,
    mean: (n: number) => `mean of ${n}`,
    fullShort: "full",
  },
  ru: {
    table: "Произведения Пелевина",
    sortBy: "Сортировка",
    sortLabel: "Сортировать произведения",
    reverse: "Обратный порядок",
    asc: "По возрастанию ↑",
    desc: "По убыванию ↓",
    pages: (n: string) => `${n} стр.`,
    full: "прочитано целиком",
    read: (p: string) => `прочитано ${p}`,
    open: "Открыть книгу",
    details: (view: string) => `${view} · подробнее`,
    mean: (n: number) => `среднее по ${n}`,
    fullShort: "всё",
  },
};
type Dict = (typeof T)["en"];

/** Heat cells: colour belongs to the data, so the tint is a data colour mixed into transparency. */
const TINT = { r: "var(--r)", g: "var(--g)", b: "var(--b)" };

function Cell({ col, row, range, t, lang }: { col: Column; row: CanonRow; range?: [number, number]; t: Dict; lang: Lang }) {
  const v = col.value(row);
  if (col.id === "title") {
    const other = secondaryTitle(row, lang);
    return (
      <span className="bt-title" role="cell">
        {primaryTitle(row, lang)}
        {other && <small>{other}</small>}
      </span>
    );
  }
  if (col.id === "year") return <span className="bt-year" role="cell">{row.year ?? "—"}</span>;
  if (col.id === "kind") return <span className="bt-tag" role="cell">{kindLabel(row.kind, lang) ?? "—"}</span>;
  if (col.id === "rank") return <span className="bt-num dim" role="cell">{row.rank ?? "—"}</span>;
  if (col.id === "pages") return <span className="bt-num" role="cell">{fmt(row.pages)}</span>;
  if (col.id === "jev") {
    const done = v as number;
    return (
      <span className={`bt-num bt-read ${done > 0 ? "" : "dim"}`} role="cell">
        <span className="progress" aria-hidden="true">
          <i style={{ width: `${done * 100}%` }} />
        </span>
        {row.complete ? t.fullShort : pct(done)}
      </span>
    );
  }
  if (v == null)
    return (
      <span className="dim" role="cell">
        —
      </span>
    );
  if (typeof v === "string")
    return (
      <span className="bt-tag" role="cell">
        {col.display ? col.display(v, lang) : v}
      </span>
    );
  const [lo, hi] = range ?? [0, 1];
  const k = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  const style: CSSProperties | undefined = col.tint ? { background: `color-mix(in srgb, ${TINT[col.tint]} ${(4 + k * 32).toFixed(1)}%, transparent)` } : undefined;
  return (
    <span className="bt-score" role="cell" style={style} title={`${col.hint[lang]}: ${dec(v, 3)}`}>
      {col.id === "turn" && v > 0 ? "+" : ""}
      {dec(v)}
    </span>
  );
}

/** The works table: any column sorts; score cells are shaded from the lowest to the highest value on the whole shelf. */
export function CanonTable({ rows, state, ranges, onSort }: { rows: CanonRow[]; state: ShelfState; ranges: Map<string, [number, number]>; onSort: (id: string) => void }) {
  const t = useT(T);
  const lang = useLang();
  // Columns without a single value on the shelf (nothing analysed yet, or metadata the store lacks) are left out.
  const cols = VIEWS[state.view].columns.map((id) => column(id)!).filter((c) => c.id === "title" || c.id === "jev" || c.id === "pages" || rows.some((r) => c.value(r) != null));
  // Widths are written in ch but resolved in rem, so the smaller header text keeps the same column grid as the rows.
  // The title column stretches only when the view is narrow enough to fit; wide views keep it fixed and scroll.
  const width = (c: Column) => (c.id === "title" && cols.length > 6 ? "36ch" : c.width);
  const grid = { gridTemplateColumns: cols.map((c) => width(c).replace(/([\d.]+)ch/, (_, n) => `${(Number(n) * 0.52).toFixed(2)}rem`)).join(" ") };
  const means = cols.map((c) => {
    if (!c.score) return null;
    const vs = rows.map((r) => c.value(r)).filter((v): v is number => typeof v === "number");
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  });
  const numeric = (c: Column) => c.score || c.id === "pages" || c.id === "jev" || c.id === "rank";
  return (
    <>
      <div className="canon-mobile">
        <div className="canon-sort">
          <label>
            <span className="eyebrow">{t.sortBy}</span>
            <select aria-label={t.sortLabel} value={state.sort} onChange={(e) => onSort(e.target.value)}>
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label[lang]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" aria-label={t.reverse} onClick={() => onSort(state.sort)}>
            {state.dir === 1 ? t.asc : t.desc}
          </button>
        </div>
        <ul className="canon-cards">
          {rows.map((r) => {
            const other = secondaryTitle(r, lang);
            const done = r.pages ? r.analysed / r.pages : 0;
            return (
              <li key={r.id}>
                <a className="canon-card-link" href={href(`/book/${r.id}`)}>
                  <span className="canon-card-meta">
                    {[r.year, kindLabel(r.kind, lang), t.pages(fmt(r.pages))].filter(Boolean).join(" · ")}
                  </span>
                  <b>{primaryTitle(r, lang)}</b>
                  {other && <span className="canon-card-alt">{other}</span>}
                  <span className="canon-card-read">
                    <span className="progress" aria-hidden="true">
                      <i style={{ width: `${done * 100}%` }} />
                    </span>
                    {r.complete ? t.full : t.read(pct(done))}
                  </span>
                </a>
                <details className="canon-card-metrics">
                  <summary>{t.details(VIEWS[state.view].label[lang])}</summary>
                  <dl>
                    {cols
                      .filter((c) => !["rank", "title", "year", "kind", "pages", "jev"].includes(c.id))
                      .map((c) => (
                        <div key={c.id}>
                          <dt>
                            {c.label[lang]}
                            {c.hint[lang] && <small>{c.hint[lang]}</small>}
                          </dt>
                          <dd>
                            <Cell col={c} row={r} range={ranges.get(c.id)} t={t} lang={lang} />
                          </dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="shelf-scroll">
        <div className="book-table canon-table" role="table" aria-label={t.table}>
          <div className="bt-row bt-head" role="row" style={grid}>
            {cols.map((c) => (
              <span
                key={c.id}
                role="columnheader"
                className={`${numeric(c) ? "bt-num" : ""} ${c.tint ? `tint-${c.tint}` : ""}`}
                aria-sort={state.sort === c.id ? (state.dir === 1 ? "ascending" : "descending") : undefined}
                title={c.hint[lang] || undefined}
              >
                <button onClick={() => onSort(c.id)}>
                  {c.label[lang]}
                  <i aria-hidden="true">{state.sort === c.id ? (state.dir === 1 ? "↑" : "↓") : ""}</i>
                </button>
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <a key={r.id} className="bt-row" role="row" href={href(`/book/${r.id}`)} style={grid}>
              {cols.map((c) => (
                <Cell key={c.id} col={c} row={r} range={ranges.get(c.id)} t={t} lang={lang} />
              ))}
            </a>
          ))}
          {rows.length > 1 && (
            <div className="bt-row bt-foot" role="row" style={grid}>
              {cols.map((c, i) => (
                <span key={c.id} role="cell" className={means[i] != null || c.id === "pages" ? "bt-score" : ""}>
                  {c.id === "title" ? t.mean(rows.length) : c.id === "pages" ? fmt(rows.reduce((s, r) => s + r.pages, 0) / rows.length) : means[i] != null ? dec(means[i]!) : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
