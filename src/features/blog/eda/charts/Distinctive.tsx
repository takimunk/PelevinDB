// Fig: the words that most set one work apart from the rest (weighted log-odds z-scores).
import { useState } from "react";
import { useLang } from "../../../../i18n/index.ts";
import type { Book } from "../data.ts";
import { BookOptions, Figure, fmtN, KIND_META, Seg, Select, title } from "./kit.tsx";

const T = {
  en: {
    title: "Each book’s own words",
    caption:
      "Lemmas most over-represented in the chosen work compared with the rest of the corpus: weighted log-odds with an informative prior, shown as z-scores. Longer bar, stronger signature. Character names swamp these lists, so they are left out by default.",
    pick: "Work",
    prev: "Previous work",
    next: "Next work",
    more: (n: number) => `Show all ${n}`,
    less: "Show fewer",
    names: "Personal names",
    hide: "leave out",
    keep: "keep",
  },
  ru: {
    title: "Собственные слова каждой книги",
    caption:
      "Леммы, которые в выбранном тексте встречаются заметно чаще, чем в остальном корпусе: взвешенный логарифм отношения шансов с информативным априорным распределением, в z-оценках. Чем длиннее полоса, тем сильнее подпись. Имена героев забивают такие списки, поэтому по умолчанию они убраны.",
    pick: "Текст",
    prev: "Предыдущий текст",
    next: "Следующий текст",
    more: (n: number) => `Показать все ${n}`,
    less: "Свернуть",
    names: "Имена персонажей",
    hide: "убрать",
    keep: "оставить",
  },
};

export function Distinctive({
  books,
  distinctive: all_,
  common,
  n,
  initial,
}: {
  books: Book[];
  distinctive: Record<string, [string, number][]>;
  common?: Record<string, [string, number][]>;
  n: number;
  initial?: string;
}) {
  const lang = useLang();
  const t = T[lang];
  const [names, setNames] = useState<"hide" | "keep">(common ? "hide" : "keep");
  const distinctive = names === "hide" && common ? common : all_;
  const withWords = books.filter((b) => distinctive[b.id]?.length);
  const [id, setId] = useState(initial && distinctive[initial] ? initial : ((withWords.find((b) => b.kind === "novel") ?? withWords[0])?.id ?? ""));
  const [all, setAll] = useState(false);
  const idx = withWords.findIndex((b) => b.id === id);
  const book = withWords[idx];
  const words = distinctive[id] ?? [];
  const shown = all ? words : words.slice(0, 15);
  const max = Math.max(1, ...words.map((w) => w[1]));
  const step = (d: number) => setId(withWords[(idx + d + withWords.length) % withWords.length].id);

  return (
    <Figure
      n={n}
      id="fig-distinctive"
      title={t.title}
      caption={t.caption}
      controls={
        <>
          <Select label={t.pick} value={id} onChange={setId}>
            <BookOptions books={withWords} lang={lang} />
          </Select>
          {common && (
            <Seg
              label={t.names}
              value={names}
              onChange={setNames}
              options={[
                { value: "hide", label: t.hide },
                { value: "keep", label: t.keep },
              ]}
            />
          )}
          <div className="eda-control">
            <span className="eda-control-label" aria-hidden="true">
              &nbsp;
            </span>
            <div className="eda-seg">
              <button type="button" aria-label={t.prev} onClick={() => step(-1)}>
                ←
              </button>
              <button type="button" aria-label={t.next} onClick={() => step(1)}>
                →
              </button>
            </div>
          </div>
        </>
      }
    >
      {book && (
        <div className="eda-distinct" aria-live="polite">
          <p className="eda-distinct-head">
            <b>{title(book, lang)}</b>{" "}
            <span className="eda-dim">
              {KIND_META[book.kind][lang]} · {book.year}
            </span>
          </p>
          <ol className="eda-bars words" lang="ru">
            {shown.map(([w, z], i) => (
              <li key={w}>
                <span className="eda-rank">{i + 1}</span>
                <span className="eda-bar-label">{w}</span>
                <span className="eda-bar-track">
                  <span className="eda-bar" style={{ width: `${(Math.max(0, z) / max) * 100}%`, background: KIND_META[book.kind].color }} />
                </span>
                <span className="eda-num">{fmtN(lang, z, 1)}</span>
              </li>
            ))}
          </ol>
          {words.length > 15 && (
            <button type="button" className="eda-chip ghost" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? t.less : t.more(words.length)}
            </button>
          )}
        </div>
      )}
    </Figure>
  );
}
