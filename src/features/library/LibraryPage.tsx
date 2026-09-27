import { useMemo, useState } from "react";
import { openFilePicker } from "../../app/importer.ts";
import { useLocalMode } from "../../services/mode.ts";
import { navigate } from "../../app/router.ts";
import { plural, useLang, useT } from "../../i18n/index.ts";
import { useCanonShelf } from "../../storage/corpus.ts";
import { useLibrary } from "../../storage/library.ts";
import { fmt, pct } from "../../ui/format.ts";
import { BookTable } from "./BookTable.tsx";
import { PagesShelf } from "./PagesShelf.tsx";
import type { LibraryTab } from "../../app/router.ts";
import { CanonTable } from "./CanonTable.tsx";
import { applyShelf, column, FACETS, facetCounts, LENSES, ranges, readState, VIEWS, writeState, type ShelfState, type ViewId } from "./shelf.ts";
import "./library.css";

const T = {
  en: {
    eyebrow: "Library",
    worksTitle: "Pelevin’s works",
    mineTitle: "Your books",
    worksSub: (n: number, pages: number, read: string) => `${n} ${plural(n, ["work", "works"])} · ${fmt(pages)} pages`,
    mineSub: (n: number, chars: number) => `${n} ${plural(n, ["book", "books"])} · ${fmt(chars)} characters, stored in this browser`,
    upload: "Upload a book",
    shelf: "Shelf",
    tabWorks: "Pelevin’s works",
    tabMine: "Your books",
    tabPages: "Pages",
    pagesTitle: "Pages",
    pagesSub: "Every story page of the corpus, one sentence from each. Filter, sort, open any page in the reader.",
    find: "Find",
    findPlaceholder: "title, in Russian or English",
    findMinePlaceholder: "title or author",
    filterLabel: "Filter the list",
    columns: "Columns",
    filters: "Filters",
    hideFilters: "Hide filters",
    count: (n: number) => `${n} ${plural(n, ["work", "works"])}`,
    countOf: (n: number, all: number) => `${n} of ${all} ${plural(all, ["work", "works"])}`,
    active: "active",
    any: "any",
    filterBy: (name: string) => `Filter by ${name}`,
    quick: "Quick filters",
    clear: "Clear filters",
    sort: "Sort",
    sorts: { recent: "recent", title: "title", length: "size" },
    note: "Scores are 0–1 means of the model’s answers over every page of a book. Shading runs from the lowest to the highest value on the shelf: red columns are feeling, blue are craft, green the whole-book profile. Hover a header to see what it measures.",
    unavailable: "The corpus is not on this server yet.",
    unavailableNote: "Pelevin’s works appear here once the corpus is loaded.",
    unavailableLocal: "Meanwhile you can read your own books the same way.",
    emptyTitle: "No books of your own yet",
    emptyNote: "Drop an EPUB, FB2, TXT or Markdown file anywhere on the page, or choose one. The text stays in this browser until you start the analysis.",
    choose: "Choose a file",
    noMatch: "Nothing matches these filters.",
  },
  ru: {
    eyebrow: "Библиотека",
    worksTitle: "Произведения Пелевина",
    mineTitle: "Ваши книги",
    worksSub: (n: number, pages: number, read: string) => `${n} ${plural(n, ["произведение", "произведения", "произведений"])} · ${fmt(pages)} стр.`,
    mineSub: (n: number, chars: number) => `${n} ${plural(n, ["книга", "книги", "книг"])} · ${fmt(chars)} знаков, хранятся в этом браузере`,
    upload: "Загрузить книгу",
    shelf: "Полка",
    tabWorks: "Произведения Пелевина",
    tabMine: "Ваши книги",
    tabPages: "Страницы",
    pagesTitle: "Страницы",
    pagesSub: "Каждая страница корпуса, по одной фразе с каждой. Фильтруйте, сортируйте, открывайте любую страницу в читалке.",
    find: "Найти",
    findPlaceholder: "название по-русски или по-английски",
    findMinePlaceholder: "название или автор",
    filterLabel: "Фильтр по списку",
    columns: "Столбцы",
    filters: "Фильтры",
    hideFilters: "Скрыть фильтры",
    count: (n: number) => `${n} ${plural(n, ["произведение", "произведения", "произведений"])}`,
    countOf: (n: number, all: number) => `${n} из ${all}`,
    active: "включены",
    any: "любой",
    filterBy: (name: string) => `Фильтр: ${name}`,
    quick: "Быстрые фильтры",
    clear: "Сбросить фильтры",
    sort: "Сортировка",
    sorts: { recent: "недавние", title: "название", length: "объём" },
    note: "Оценки — средние от 0 до 1 по ответам модели на каждой странице книги. Заливка идёт от самого низкого значения на полке к самому высокому: красные столбцы — чувства, синие — письмо, зелёные — профиль книги целиком. Наведите на заголовок, чтобы увидеть, что он измеряет.",
    unavailable: "Корпуса на этом сервере пока нет.",
    unavailableNote: "Произведения Пелевина появятся здесь, когда корпус загрузят.",
    unavailableLocal: "А пока можно так же прочитать свои книги.",
    emptyTitle: "Своих книг пока нет",
    emptyNote: "Перетащите файл EPUB, FB2, TXT или Markdown в любое место страницы или выберите его. Текст остаётся в браузере, пока вы не запустите анализ.",
    choose: "Выбрать файл",
    noMatch: "Под эти фильтры ничего не подходит.",
  },
};
type Dict = (typeof T)["en"];

const SORTS = {
  recent: () => 0,
  title: (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title),
  length: (a: { chars: number }, b: { chars: number }) => b.chars - a.chars,
} as const;

function WorksShelf({ params, t }: { params: Record<string, string>; t: Dict }) {
  const lang = useLang();
  const [showFilters, setShowFilters] = useState(false);
  const local = useLocalMode();
  const { available, rows } = useCanonShelf();
  const state = readState(params);
  const key = writeState(state);
  const set = (next: Partial<ShelfState>) => {
    const qs = writeState({ ...state, ...next });
    navigate(qs ? `/library?${qs}` : "/library", { replace: true });
  };
  const all = useMemo(() => rows ?? [], [rows]);
  const shown = useMemo(() => applyShelf(all, readState(params)), [all, key]);
  const scale = useMemo(() => ranges(all), [all]);
  const filtered = !!(state.q || state.lens || Object.keys(state.facets).length);
  const facets = FACETS.map((f) => ({ f, counts: facetCounts(all, f) })).filter((x) => x.counts.length > 0 || state.facets[x.f]);
  const lenses = LENSES.map((l) => ({ l, n: all.filter(l.test).length })).filter((x) => x.n > 0 || state.lens === x.l.id);

  if (available === false)
    return (
      <div className="library-empty">
        <p className="library-empty-title">{t.unavailable}</p>
        <p>
          {t.unavailableNote}
          {local && ` ${t.unavailableLocal}`}
        </p>
      </div>
    );

  const sort = (id: string) => {
    const col = column(id)!;
    set(state.sort === id ? { dir: -state.dir as 1 | -1 } : { sort: id, dir: col.score ? -1 : 1 });
  };
  return (
    <>
      <div className="shelf-tools">
        <label className="library-grep">
          <span>{t.find}</span>
          <input value={state.q} onChange={(e) => set({ q: e.target.value })} placeholder={t.findPlaceholder} aria-label={t.filterLabel} />
        </label>
        <div className="presets shelf-views" role="group" aria-label={t.columns}>
          {(Object.keys(VIEWS) as ViewId[]).map((v) => (
            <button key={v} className={state.view === v ? "on" : ""} aria-pressed={state.view === v} onClick={() => set({ view: v })}>
              {VIEWS[v].label[lang]}
            </button>
          ))}
        </div>
      </div>
      {(facets.length > 0 || lenses.length > 0) && (
        <>
          <button className="btn shelf-filter-toggle" aria-expanded={showFilters} aria-controls="shelf-refinements" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? t.hideFilters : t.filters} · {t.count(shown.length)}
            {filtered ? ` · ${t.active}` : ""}
          </button>
          <div id="shelf-refinements" className={`shelf-refinements ${showFilters ? "expanded" : ""}`}>
            {facets.length > 0 && (
              <div className="shelf-filters">
                {facets.map(({ f, counts }) => {
                  const col = column(f)!;
                  return (
                    <label key={f} className={state.facets[f] ? "on" : ""}>
                      <span>{col.label[lang]}</span>
                      <select value={state.facets[f] ?? ""} onChange={(e) => set({ facets: { ...state.facets, [f]: e.target.value || undefined } })} aria-label={t.filterBy(col.label[lang])}>
                        <option value="">{t.any}</option>
                        {counts.map(([v, n]) => (
                          <option key={v} value={v}>
                            {col.display ? col.display(v, lang) : v} ({n})
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
            {lenses.length > 0 && (
              <div className="shelf-lenses" role="group" aria-label={t.quick}>
                {lenses.map(({ l, n }) => (
                  <button
                    key={l.id}
                    className={state.lens === l.id ? "on" : ""}
                    aria-pressed={state.lens === l.id}
                    title={l.hint[lang]}
                    onClick={() => set({ lens: state.lens === l.id ? null : l.id })}
                  >
                    {l.label[lang]} <small>{n}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <p className="shelf-count">
        {shown.length === all.length ? t.count(all.length) : t.countOf(shown.length, all.length)}
        {filtered && (
          <button className="link" onClick={() => set({ q: "", lens: null, facets: {} })}>
            {t.clear}
          </button>
        )}
      </p>
      {shown.length ? <CanonTable rows={shown} state={state} ranges={scale} onSort={sort} /> : rows && <p className="library-empty-title">{t.noMatch}</p>}
      <p className="shelf-note">{t.note}</p>
    </>
  );
}

export function LibraryPage({ tab: requested = "canon", params = {} }: { tab?: LibraryTab; params?: Record<string, string> }) {
  const t = useT(T);
  // Your own books exist only in local mode; the public site shows Pelevin's works and pages only.
  const local = useLocalMode();
  const tab: LibraryTab = requested === "mine" && !local ? "canon" : requested;
  const { books, ready } = useLibrary();
  const { rows } = useCanonShelf();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");
  const shown = useMemo(() => {
    const q = filter.toLowerCase();
    return books.filter((b) => !q || (b.title + " " + b.author).toLowerCase().includes(q)).sort(SORTS[sort]);
  }, [books, filter, sort]);
  const chars = books.reduce((s, b) => s + b.chars, 0);
  const pages = rows?.reduce((s, r) => s + r.pages, 0) ?? 0;
  const read = rows?.reduce((s, r) => s + r.analysed, 0) ?? 0;
  const works = tab === "canon";
  const title = works ? t.worksTitle : tab === "pages" ? t.pagesTitle : t.mineTitle;
  const sub = works ? (rows?.length ? t.worksSub(rows.length, pages, pct(pages ? read / pages : 0)) : "\u00a0") : tab === "pages" ? t.pagesSub : t.mineSub(books.length, chars);
  const go = (next: LibraryTab) => navigate(next === "canon" ? "/library" : `/library?tab=${next}`, { replace: true });
  return (
    <div className="library-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="display display-l">{title}</h1>
          <p className="page-sub">{sub}</p>
        </div>
        {local && tab === "mine" && (
          <button className="btn" onClick={openFilePicker}>
            {t.upload}
          </button>
        )}
      </header>
      <div className="shelf-tabs" role="group" aria-label={t.shelf}>
        <button className={works ? "on" : ""} aria-pressed={works} onClick={() => go("canon")}>
          {t.tabWorks}
          {rows?.length ? <small>{rows.length}</small> : null}
        </button>
        <button className={tab === "pages" ? "on" : ""} aria-pressed={tab === "pages"} onClick={() => go("pages")}>
          {t.tabPages}
          {read ? <small>{fmt(read)}</small> : null}
        </button>
        {/* Uploaded books live only in local mode; a quiet link, not a peer tab. */}
        {local && (
          <button className={`shelf-tab-aside ${tab === "mine" ? "on" : ""}`} aria-pressed={tab === "mine"} onClick={() => go("mine")}>
            {t.tabMine}
            {books.length ? <small>{books.length}</small> : null}
          </button>
        )}
      </div>
      {tab === "pages" ? (
        <PagesShelf params={params} />
      ) : works ? (
        <WorksShelf params={params} t={t} />
      ) : ready && !books.length ? (
        <div className="library-empty">
          <p className="library-empty-title">{t.emptyTitle}</p>
          <p>{t.emptyNote}</p>
          <p>
            <button className="btn primary" onClick={openFilePicker}>
              {t.choose}
            </button>
          </p>
        </div>
      ) : (
        <>
          <div className="library-tools">
            <label className="library-grep">
              <span>{t.find}</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.findMinePlaceholder} aria-label={t.filterLabel} />
            </label>
            <div className="presets" role="group" aria-label={t.sort}>
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
                <button key={key} className={sort === key ? "on" : ""} aria-pressed={sort === key} onClick={() => setSort(key)}>
                  {t.sorts[key]}
                </button>
              ))}
            </div>
          </div>
          <BookTable books={shown} />
        </>
      )}
    </div>
  );
}
