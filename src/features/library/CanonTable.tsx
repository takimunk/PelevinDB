import type { CSSProperties } from "react";
import { href } from "../../app/router.ts";
import type { CanonRow } from "../../storage/corpus.ts";
import { fmt } from "../../ui/format.ts";
import { column, VIEWS, type Column, type ShelfState } from "./shelf.ts";

const TINT = { r: "255, 69, 56", g: "61, 220, 132", b: "77, 124, 255" };

function Cell({ col, row, range }: { col: Column; row: CanonRow; range?: [number, number] }) {
  const v = col.value(row);
  if (col.id === "rank") return <span className="dim">{String(row.rank ?? "—").padStart(3, "0")}</span>;
  if (col.id === "title") return <span className="bt-title">{row.title}</span>;
  if (col.id === "author") return <span className="bt-author dim">{row.author}</span>;
  if (col.id === "pages") return <span className="bt-num">{fmt(row.pages)}</span>;
  if (col.id === "jev") {
    const done = v as number;
    return <span className={`bt-num ${row.complete ? "ok" : done > 0 ? "warn" : "dim"}`}>{row.complete ? "full" : `${Math.round(done * 100)}%`}</span>;
  }
  if (v == null) return <span className="dim">—</span>;
  if (typeof v === "string") return <span className="bt-tag">{v}</span>;
  const [lo, hi] = range ?? [0, 1];
  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  const style: CSSProperties | undefined = col.tint ? { background: `rgba(${TINT[col.tint]}, ${(0.03 + t * 0.3).toFixed(3)})` } : undefined;
  return (
    <span className="bt-score" style={style} title={`${col.hint}: ${v.toFixed(3)}`}>
      {col.id === "turn" && v > 0 ? "+" : ""}
      {v.toFixed(2)}
    </span>
  );
}

/** Canon shelf: any column sorts, score cells are shaded from the lowest to the highest value on the whole shelf. */
export function CanonTable({
  rows,
  state,
  ranges,
  onSort,
}: {
  rows: CanonRow[];
  state: ShelfState;
  ranges: Map<string, [number, number]>;
  onSort: (id: string) => void;
}) {
  const cols = VIEWS[state.view].columns.map((id) => column(id)!);
  const grid = { gridTemplateColumns: cols.map((c) => c.width).join(" ") };
  const means = cols.map((c) => {
    if (!c.score) return null;
    const vs = rows.map((r) => c.value(r)).filter((v): v is number => typeof v === "number");
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  });
  return (
    <div className="shelf-scroll">
      <div className="book-table canon-table" role="table" aria-label="Canon">
        <div className="bt-row bt-head" role="row" style={grid}>
          {cols.map((c) => (
            <span
              key={c.id}
              role="columnheader"
              className={`${c.score || c.id === "pages" || c.id === "jev" ? "bt-num" : ""} ${c.tint ? `tint-${c.tint}` : ""}`}
              aria-sort={state.sort === c.id ? (state.dir === 1 ? "ascending" : "descending") : undefined}
              title={c.hint || undefined}
            >
              <button onClick={() => onSort(c.id)}>
                {c.label}
                {state.sort === c.id ? (state.dir === 1 ? "↑" : "↓") : ""}
              </button>
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <a key={r.id} className="bt-row" role="row" href={href(`/book/${r.id}`)} style={grid}>
            {cols.map((c) => (
              <Cell key={c.id} col={c} row={r} range={ranges.get(c.id)} />
            ))}
          </a>
        ))}
        {rows.length > 1 && (
          <div className="bt-row bt-foot" role="row" style={grid}>
            {cols.map((c, i) => (
              <span key={c.id} className={means[i] != null ? "bt-score" : ""}>
                {c.id === "title" ? `mean of ${rows.length}` : c.id === "pages" ? fmt(rows.reduce((s, r) => s + r.pages, 0) / rows.length) : means[i] != null ? means[i]!.toFixed(2) : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}