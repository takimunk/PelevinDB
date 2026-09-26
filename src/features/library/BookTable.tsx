import { MOODS } from "../../../shared/catalog.ts";
import { argmax } from "../../domain/analysis.ts";
import { href } from "../../app/router.ts";
import type { BookMeta } from "../../storage/library.ts";
import { bar } from "../../ui/ascii.ts";
import { fmt } from "../../ui/format.ts";

const age = (t: number) => {
  const m = (Date.now() - t) / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

/** `ls -l` of the library. */
export function BookTable({ books }: { books: BookMeta[] }) {
  return (
    <div className="book-table" role="table" aria-label="Books">
      <div className="bt-row bt-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">title</span>
        <span role="columnheader" className="bt-author">author</span>
        <span role="columnheader" className="bt-fmt">fmt</span>
        <span role="columnheader" className="bt-num">pages</span>
        <span role="columnheader" className="bt-jev">jev</span>
        <span role="columnheader" className="bt-mood">mood</span>
        <span role="columnheader" className="bt-age">seen</span>
      </div>
      {books.map((b, i) => {
        const done = b.pages ? b.analyzed / b.pages : 0;
        const mood = b.fingerprint ? MOODS.find((m) => m.id === argmax(b.fingerprint!.mood)) : undefined;
        return (
          <a key={b.id} className="bt-row" role="row" href={href(`/book/${b.id}`)}>
            <span className="dim">{String(i + 1).padStart(2, "0")}</span>
            <span className="bt-title">{b.title}</span>
            <span className="bt-author dim">{b.author}</span>
            <span className="bt-fmt dim">{b.format.toLowerCase()}</span>
            <span className="bt-num">{fmt(b.pages)}</span>
            <span className={`bt-jev ${done >= 1 ? "ok" : done > 0 ? "warn" : "dim"}`}>
              {bar(done, 8)} {String(Math.round(done * 100)).padStart(3)}%
            </span>
            <span className="bt-mood" style={{ color: mood?.color }}>
              {mood?.label.toLowerCase() ?? "—"}
            </span>
            <span className="bt-age dim">{age(b.openedAt)}</span>
          </a>
        );
      })}
    </div>
  );
}
