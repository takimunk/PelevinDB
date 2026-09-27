import { useEffect, useId, useMemo, useRef, useState } from "react";
import { openFilePicker, useImportState } from "../../app/importer.ts";
import { navigate } from "../../app/router.ts";
import { plural, useLang, useT } from "../../i18n/index.ts";
import { useCorpusList } from "../../storage/corpus.ts";
import { useLibrary } from "../../storage/library.ts";
import { useLocalMode } from "../../services/mode.ts";
import { fmt, pct } from "../../ui/format.ts";
import { kindLabel, primaryTitle, secondaryTitle } from "../library/labels.ts";
import "./search.css";

type Item =
  | { kind: "corpus" | "library"; id: string; title: string; sub: string; note: string }
  | { kind: "upload"; title: string; sub: string; note: string };

const T = {
  en: {
    label: "Search books",
    placeholder: "A title, in Russian or English",
    results: "Results",
    groups: { corpus: "Pelevin’s works", library: "Your books", upload: "Your own book" },
    pages: (n: number) => `${fmt(n)} ${plural(n, ["page", "pages"])}`,
    unknown: "unknown author",
    upload: "Upload a book of your own",
    uploadSub: "EPUB, FB2, TXT or Markdown, up to 20 MB",
    hint: "↵ open · ↑↓ move · esc close",
    none: (q: string) => `Nothing found for “${q}”.`,
    found: (n: number) => `${n} ${plural(n, ["result", "results"])}`,
  },
  ru: {
    label: "Искать книги",
    placeholder: "Название по-русски или по-английски",
    results: "Результаты",
    groups: { corpus: "Произведения Пелевина", library: "Ваши книги", upload: "Своя книга" },
    pages: (n: number) => `${fmt(n)} стр.`,
    unknown: "автор неизвестен",
    upload: "Загрузить свою книгу",
    uploadSub: "EPUB, FB2, TXT или Markdown, до 20 МБ",
    hint: "↵ открыть · ↑↓ выбрать · esc закрыть",
    none: (q: string) => `По запросу «${q}» ничего не нашлось.`,
    found: (n: number) => `${plural(n, ["Найден", "Найдено", "Найдено"])} ${n} ${plural(n, ["результат", "результата", "результатов"])}`,
  },
};

const norm = (s: string) => s.toLocaleLowerCase().replace(/ё/g, "е");

/** Finds Pelevin's works (by Russian or English title) and the reader's own books. */
export function Search({
  autoFocus = false,
  initialQuery = "",
  placeholder,
  onDone,
}: {
  autoFocus?: boolean;
  initialQuery?: string;
  placeholder?: string;
  onDone?: () => void;
}) {
  const t = useT(T);
  const lang = useLang();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(!!initialQuery || !!onDone);
  const [active, setActive] = useState(0);
  const { books } = useLibrary();
  // Your own books and uploading exist only in local mode.
  const local = useLocalMode();
  const corpus = useCorpusList();
  const importing = useImportState();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const q = query.trim();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const items = useMemo<Item[]>(() => {
    const n = norm(q);
    const works = (corpus?.books ?? [])
      .filter((b) => !n || norm(`${b.title} ${b.titleEn ?? ""} ${b.year ?? ""}`).includes(n))
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
      .slice(0, n ? 8 : 5)
      .map((b) => ({
        kind: "corpus" as const,
        id: b.id,
        title: primaryTitle(b, lang),
        sub: [secondaryTitle(b, lang), kindLabel(b.kind, lang)].filter(Boolean).join(" · ") || b.author,
        note: [b.year, t.pages(b.pages)].filter(Boolean).join(" · "),
      }));
    const own = (local ? books : [])
      .filter((b) => !n || norm(`${b.title} ${b.author}`).includes(n))
      .slice(0, n ? 6 : 3)
      .map((b) => ({
        kind: "library" as const,
        id: b.id,
        title: b.title,
        sub: b.author || t.unknown,
        note: pct(b.analyzed / Math.max(1, b.pages)),
      }));
    return [...works, ...own, ...(local ? [{ kind: "upload" as const, title: t.upload, sub: t.uploadSub, note: "u" }] : [])];
  }, [q, books, corpus, lang, t, local]);

  const choose = (item: Item) => {
    setOpen(false);
    onDone?.();
    if (item.kind === "upload") openFilePicker();
    else navigate(`/book/${item.id}`);
  };

  const found = items.filter((i) => i.kind !== "upload").length;
  const status = importing.busy ?? (q && !found ? t.none(q) : q ? t.found(found) : t.hint);
  const groups = (["corpus", "library", "upload"] as const).map((g) => ({ g, list: items.map((item, index) => ({ item, index })).filter((x) => x.item.kind === g) })).filter((x) => x.list.length);

  return (
    <div className="search" onBlur={(e) => !onDone && !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <label className="search-field">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m15 15 5.5 5.5" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder ?? t.placeholder}
          aria-label={t.label}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === "Escape" && !onDone) setOpen(false);
          }}
        />
      </label>
      {open && (
        <div className="search-results">
          <div id={listId} role="listbox" aria-label={t.results}>
            {groups.map(({ g, list }) => (
              <div key={g} role="group" aria-label={t.groups[g]} className="search-group">
                <div className="search-group-label eyebrow" aria-hidden="true">
                  {t.groups[g]}
                </div>
                {list.map(({ item, index }) => (
                  <button
                    key={item.kind === "upload" ? "upload" : item.id}
                    id={`${listId}-${index}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === active}
                    className={`search-item ${item.kind} ${index === active ? "active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                  >
                    <span className="search-text">
                      <b>{item.title}</b>
                      <small>{item.sub}</small>
                    </span>
                    {item.kind === "upload" ? <kbd>{item.note}</kbd> : <span className="search-note">{item.note}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className={`search-status ${importing.busy ? "cursor" : ""}`} role="status">
            {status}
          </div>
        </div>
      )}
    </div>
  );
}
