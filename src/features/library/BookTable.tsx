import { MOODS } from "../../../shared/catalog.ts";
import { argmax } from "../../domain/analysis.ts";
import { href } from "../../app/router.ts";
import { locale, useLang, useT } from "../../i18n/index.ts";
import type { BookMeta } from "../../storage/library.ts";
import { fmt, pct } from "../../ui/format.ts";
import { dimLabel } from "./labels.ts";

const T = {
  en: { table: "Your books", n: "#", title: "title", author: "author", format: "format", pages: "pages", read: "analysed", mood: "mood", seen: "opened", unknown: "unknown author" },
  ru: { table: "Ваши книги", n: "№", title: "название", author: "автор", format: "формат", pages: "стр.", read: "проанализировано", mood: "настроение", seen: "открыта", unknown: "автор неизвестен" },
};

/** "3 min ago" / "3 мин. назад", in the current language. */
const age = (t: number) => {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto", style: "short" });
  const m = (Date.now() - t) / 60000;
  if (m < 60) return rtf.format(-Math.max(1, Math.round(m)), "minute");
  if (m < 1440) return rtf.format(-Math.round(m / 60), "hour");
  return rtf.format(-Math.round(m / 1440), "day");
};

/** The reader's own uploads. */
export function BookTable({ books }: { books: BookMeta[] }) {
  const t = useT(T);
  const lang = useLang();
  return (
    <div className="book-table" role="table" aria-label={t.table}>
      <div className="bt-row bt-head" role="row">
        <span role="columnheader">{t.n}</span>
        <span role="columnheader">{t.title}</span>
        <span role="columnheader" className="bt-author">
          {t.author}
        </span>
        <span role="columnheader" className="bt-fmt">
          {t.format}
        </span>
        <span role="columnheader" className="bt-num">
          {t.pages}
        </span>
        <span role="columnheader" className="bt-jev">
          {t.read}
        </span>
        <span role="columnheader" className="bt-mood">
          {t.mood}
        </span>
        <span role="columnheader" className="bt-age">
          {t.seen}
        </span>
      </div>
      {books.map((b, i) => {
        const done = b.pages ? b.analyzed / b.pages : 0;
        const mood = b.fingerprint ? MOODS.find((m) => m.id === argmax(b.fingerprint!.mood)) : undefined;
        return (
          <a key={b.id} className="bt-row" role="row" href={href(`/book/${b.id}`)}>
            <span className="bt-index dim" role="cell">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="bt-title" role="cell">
              {b.title}
            </span>
            <span className="bt-author dim" role="cell">
              {b.author || t.unknown}
            </span>
            <span className="bt-fmt dim" role="cell">
              {b.format.toLowerCase()}
            </span>
            <span className="bt-num" role="cell">
              {fmt(b.pages)}
            </span>
            <span className={`bt-jev ${done > 0 ? "" : "dim"}`} role="cell">
              <span className="progress" aria-hidden="true">
                <i style={{ width: `${done * 100}%` }} />
              </span>
              {pct(done)}
            </span>
            <span className="bt-mood" role="cell">
              {mood ? (
                <>
                  <i className="swatch" style={{ background: mood.color }} aria-hidden="true" />
                  {dimLabel("mood", mood, lang).toLowerCase()}
                </>
              ) : (
                "—"
              )}
            </span>
            <span className="bt-age dim" role="cell">
              {age(b.openedAt)}
            </span>
          </a>
        );
      })}
    </div>
  );
}
