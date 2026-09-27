// The library's "Pages" tab: every story page of the corpus as a row with one quoted sentence, filtered and sorted
// on the server (GET /api/corpus/pages). Results stop after five pages of 25 rows: a copyright guard.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { EMOTIONS, labelOf, MODES, MOODS, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { FacetKey, PageRow, PagesResult, ScoreKey } from "../../../server/pages.ts";
import { href, navigate } from "../../app/router.ts";
import { plural, useLang, useT, type Lang } from "../../i18n/index.ts";
import { dec, fmt } from "../../ui/format.ts";
import { kindLabel, primaryTitle } from "./labels.ts";

const FACETS: FacetKey[] = ["book", "kind", "decade", "emotion", "mood", "mode", "theme"];
const VIEWS = {
  overview: ["intensity", "tension", "valence", "humor"],
  emotions: EMOTIONS.map((e) => e.id),
  texture: TEXTURES.map((t) => t.id),
} as const satisfies Record<string, readonly ScoreKey[]>;
type View = keyof typeof VIEWS;

/** Quick filters: each sets a sort or a facet in one tap. */
const LENSES: { id: string; set: Partial<State> }[] = [
  { id: "funniest", set: { sort: "humor", dir: -1 } },
  { id: "tensest", set: { sort: "tension", dir: -1 } },
  { id: "darkest", set: { sort: "valence", dir: 1 } },
  { id: "brightest", set: { sort: "valence", dir: -1 } },
  { id: "abstract", set: { sort: "ideas", dir: -1 } },
  { id: "fastest", set: { sort: "pace", dir: -1 } },
  { id: "dialogue", set: { mode: "dialogue" } },
  { id: "love", set: { theme: "love" } },
  { id: "death", set: { theme: "death" } },
];

const T = {
  en: {
    find: "Find",
    placeholder: "a word from a quote, or a title",
    search: "Search the pages",
    columns: "Columns",
    views: { overview: "overview", emotions: "emotions", texture: "texture" } as Record<View, string>,
    filters: "Filters",
    hideFilters: "Hide filters",
    facets: { book: "book", kind: "form", decade: "decade", emotion: "emotion", mood: "mood", mode: "narration", theme: "theme" } as Record<FacetKey, string>,
    any: "any",
    filterBy: (name: string) => `Filter by ${name}`,
    quick: "Quick filters",
    lenses: {
      funniest: "funniest",
      tensest: "tensest",
      darkest: "darkest",
      brightest: "brightest",
      abstract: "most abstract",
      fastest: "fastest",
      dialogue: "dialogue",
      love: "about love",
      death: "about death",
    } as Record<string, string>,
    decade: (d: string) => `${d}s`,
    count: (n: number) => `${fmt(n)} ${plural(n, ["page", "pages"])}`,
    sorted: (by: string, dir: 1 | -1) => `sorted by ${by} ${dir === 1 ? "↑" : "↓"}`,
    clear: "Clear filters",
    table: "Pages of the corpus",
    head: { quote: "quote", book: "book", emotion: "emotion", mood: "mood", mode: "narration" },
    intensity: "intensity",
    page: (n: number) => `p. ${n}`,
    open: (title: string, page: number) => `${title}, page ${page}`,
    sortBy: "Sort by",
    sortLabel: "Sort pages",
    reverse: "Reverse sort order",
    asc: "Ascending ↑",
    desc: "Descending ↓",
    results: "Result pages",
    resultPage: (n: number) => `Result page ${n}`,
    cap: "Beyond this, narrow the filters: this keeps us within copyright.",
    loading: "Reading the index",
    empty: "No pages match these filters.",
    failed: "Could not load the pages. Try again in a minute.",
    unavailable: "The corpus is not on this server yet.",
  },
  ru: {
    find: "Найти",
    placeholder: "слово из цитаты или название",
    search: "Искать по страницам",
    columns: "Столбцы",
    views: { overview: "обзор", emotions: "эмоции", texture: "фактура" } as Record<View, string>,
    filters: "Фильтры",
    hideFilters: "Скрыть фильтры",
    facets: { book: "книга", kind: "форма", decade: "десятилетие", emotion: "эмоция", mood: "настроение", mode: "повествование", theme: "тема" } as Record<FacetKey, string>,
    any: "любое",
    filterBy: (name: string) => `Фильтр: ${name}`,
    quick: "Быстрые фильтры",
    lenses: {
      funniest: "самые смешные",
      tensest: "самые напряжённые",
      darkest: "самые тёмные",
      brightest: "самые светлые",
      abstract: "самые отвлечённые",
      fastest: "самые быстрые",
      dialogue: "диалоги",
      love: "о любви",
      death: "о смерти",
    } as Record<string, string>,
    decade: (d: string) => `${d}-е`,
    count: (n: number) => `${fmt(n)} ${plural(n, ["страница", "страницы", "страниц"])}`,
    sorted: (by: string, dir: 1 | -1) => `сортировка: ${by.toLowerCase()} ${dir === 1 ? "↑" : "↓"}`,
    clear: "Сбросить фильтры",
    table: "Страницы корпуса",
    head: { quote: "цитата", book: "книга", emotion: "эмоция", mood: "настроение", mode: "повествование" },
    intensity: "сила эмоции",
    page: (n: number) => `с. ${n}`,
    open: (title: string, page: number) => `${title}, страница ${page}`,
    sortBy: "Сортировка",
    sortLabel: "Сортировать страницы",
    reverse: "Обратный порядок",
    asc: "По возрастанию ↑",
    desc: "По убыванию ↓",
    results: "Страницы результатов",
    resultPage: (n: number) => `Страница результатов ${n}`,
    cap: "Дальше — только через фильтры: так мы бережём авторские права.",
    loading: "Читаем указатель",
    empty: "Под эти фильтры ничего не подходит.",
    failed: "Не удалось загрузить страницы. Попробуйте через минуту.",
    unavailable: "Корпуса на этом сервере пока нет.",
  },
};
type Dict = (typeof T)["en"];

type State = {
  q: string;
  view: View;
  sort: ScoreKey;
  dir: 1 | -1;
  p: number;
} & Partial<Record<FacetKey, string>>;

const SCORES: ScoreKey[] = ["intensity", ...EMOTIONS.map((e) => e.id), ...TEXTURES.map((t) => t.id)];

export function readPagesState(params: Record<string, string>): State {
  const facets = Object.fromEntries(FACETS.filter((f) => params[f]).map((f) => [f, params[f]]));
  const p = Number(params.p);
  return {
    q: params.q ?? "",
    view: params.view in VIEWS ? (params.view as View) : "overview",
    sort: SCORES.includes(params.sort as ScoreKey) ? (params.sort as ScoreKey) : "intensity",
    dir: params.dir === "1" ? 1 : -1,
    p: Number.isInteger(p) && p >= 1 && p <= 5 ? p : 1,
    ...facets,
  };
}

function writePagesState(s: State) {
  const out = new URLSearchParams({ tab: "pages" });
  if (s.q) out.set("q", s.q);
  if (s.view !== "overview") out.set("view", s.view);
  if (s.sort !== "intensity") out.set("sort", s.sort);
  if (s.dir === 1) out.set("dir", "1");
  for (const f of FACETS) if (s[f]) out.set(f, s[f]!);
  if (s.p > 1) out.set("p", String(s.p));
  return out.toString();
}

/** The server's query string: the same filters, with `page` for the result page. */
function apiQuery(s: State) {
  const out = new URLSearchParams();
  if (s.q.trim()) out.set("q", s.q.trim());
  for (const f of FACETS) if (s[f]) out.set(f, s[f]!);
  out.set("sort", s.sort);
  out.set("dir", String(s.dir));
  out.set("page", String(s.p));
  return out.toString();
}

function scoreLabel(key: ScoreKey, lang: Lang, t: Dict) {
  if (key === "intensity") return t.intensity;
  const item = EMOTIONS.find((e) => e.id === key) ?? TEXTURES.find((x) => x.id === key)!;
  return labelOf(item, lang).toLowerCase();
}
const scoreColor = (key: ScoreKey) => EMOTIONS.find((e) => e.id === key)?.color ?? "var(--r)";

function facetLabel(f: FacetKey, value: string, lang: Lang, t: Dict, books: PagesResult["books"]) {
  const list = f === "emotion" ? EMOTIONS : f === "mood" ? MOODS : f === "mode" ? MODES : f === "theme" ? THEMES : null;
  if (list) {
    const item = (list as readonly { id: string; label: string; ru?: string }[]).find((x) => x.id === value);
    return item ? labelOf(item, lang).toLowerCase() : value;
  }
  if (f === "kind") return kindLabel(value as never, lang) ?? value;
  if (f === "decade") return t.decade(value);
  const b = books[value];
  return b ? `${primaryTitle(b, lang)}${b.year ? ` (${b.year})` : ""}` : value;
}

const debounceMs = 300;

function usePages(state: State) {
  const key = apiQuery(state);
  const [result, setResult] = useState<{ key: string; data?: PagesResult; error?: "failed" | "unavailable" } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(`/api/corpus/pages?${key}`, { signal: controller.signal })
          .then(async (r) => {
            if (r.status === 404) return setResult({ key, error: "unavailable" });
            if (!r.ok) return setResult({ key, error: "failed" });
            setResult({ key, data: (await r.json()) as PagesResult });
          })
          .catch(() => !controller.signal.aborted && setResult({ key, error: "failed" })),
      result ? debounceMs : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  return { result, loading: result?.key !== key };
}

function Score({ k, v, lang, t }: { k: ScoreKey; v: number; lang: Lang; t: Dict }) {
  const style = { background: `color-mix(in srgb, ${scoreColor(k)} ${(4 + v * 34).toFixed(1)}%, transparent)` } as CSSProperties;
  return (
    <span className="bt-score" role="cell" style={style} title={`${scoreLabel(k, lang, t)}: ${dec(v, 3)}`}>
      {dec(v)}
    </span>
  );
}

function Tag({ list, id, lang, dot }: { list: readonly { id: string; label: string; ru?: string; color?: string }[]; id: string; lang: Lang; dot?: boolean }) {
  const item = list.find((x) => x.id === id);
  return (
    <span className="bt-tag" role="cell">
      {dot && item?.color && <i className="swatch" style={{ background: item.color }} aria-hidden="true" />}
      {item ? labelOf(item, lang).toLowerCase() : id}
    </span>
  );
}

export function PagesShelf({ params }: { params: Record<string, string> }) {
  const t = useT(T);
  const lang = useLang();
  const state = readPagesState(params);
  const [showFilters, setShowFilters] = useState(false);
  const { result, loading } = usePages(state);
  const data = result?.data;
  const set = (next: Partial<State>) => navigate(`/library?${writePagesState({ ...state, p: 1, ...next })}`, { replace: true });
  // The sorted score is always shown, first, even when the view's columns don't include it.
  const viewCols = VIEWS[state.view] as readonly ScoreKey[];
  const cols = viewCols.includes(state.sort) ? viewCols : [state.sort, ...viewCols];
  const grid = { gridTemplateColumns: `minmax(24rem, 3fr) minmax(12rem, 1.3fr) 8rem 8rem 8rem ${cols.map(() => "5.4rem").join(" ")}` };
  const filtered = !!(state.q || FACETS.some((f) => state[f]));
  const lensOn = (l: (typeof LENSES)[number]) => Object.entries(l.set).every(([k, v]) => state[k as keyof State] === v);
  const facets = useMemo(
    () =>
      FACETS.map((f) => {
        const counts = Object.entries(data?.facets[f] ?? {});
        if (f === "book") counts.sort((a, b) => (data!.books[a[0]]?.year ?? 0) - (data!.books[b[0]]?.year ?? 0));
        else if (f === "decade") counts.sort((a, b) => a[0].localeCompare(b[0]));
        else counts.sort((a, b) => b[1] - a[1]);
        return { f, counts };
      }),
    [data],
  );
  const sort = (k: ScoreKey) => set(state.sort === k ? { dir: state.dir === 1 ? -1 : 1 } : { sort: k, dir: -1 });

  if (result?.error === "unavailable")
    return (
      <div className="library-empty">
        <p className="library-empty-title">{t.unavailable}</p>
      </div>
    );

  return (
    <div className={`pages-shelf ${loading ? "is-loading" : ""}`} aria-busy={loading}>
      <div className="shelf-tools">
        <label className="library-grep">
          <span>{t.find}</span>
          <input value={state.q} onChange={(e) => set({ q: e.target.value })} placeholder={t.placeholder} aria-label={t.search} />
        </label>
        <div className="presets shelf-views" role="group" aria-label={t.columns}>
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button key={v} className={state.view === v ? "on" : ""} aria-pressed={state.view === v} onClick={() => set({ view: v, p: state.p })}>
              {t.views[v]}
            </button>
          ))}
        </div>
      </div>
      <button className="btn shelf-filter-toggle" aria-expanded={showFilters} aria-controls="pages-refinements" onClick={() => setShowFilters(!showFilters)}>
        {showFilters ? t.hideFilters : t.filters}
        {data ? ` · ${t.count(data.total)}` : ""}
      </button>
      <div id="pages-refinements" className={`shelf-refinements ${showFilters ? "expanded" : ""}`}>
        <div className="shelf-filters">
          {facets.map(({ f, counts }) => (
            <label key={f} className={state[f] ? "on" : ""}>
              <span>{t.facets[f]}</span>
              <select value={state[f] ?? ""} onChange={(e) => set({ [f]: e.target.value || undefined })} aria-label={t.filterBy(t.facets[f])}>
                <option value="">{t.any}</option>
                {state[f] && !counts.some(([v]) => v === state[f]) && <option value={state[f]}>{facetLabel(f, state[f]!, lang, t, data?.books ?? {})}</option>}
                {counts.map(([v, n]) => (
                  <option key={v} value={v}>
                    {facetLabel(f, v, lang, t, data?.books ?? {})} ({fmt(n)})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="shelf-lenses" role="group" aria-label={t.quick}>
          {LENSES.map((l) => {
            const on = lensOn(l);
            const off: Partial<State> = "sort" in l.set ? { sort: "intensity", dir: -1 } : { [Object.keys(l.set)[0]]: undefined };
            return (
              <button key={l.id} className={on ? "on" : ""} aria-pressed={on} onClick={() => set(on ? off : l.set)}>
                {t.lenses[l.id]}
              </button>
            );
          })}
        </div>
      </div>
      <p className="shelf-count">
        {data ? t.count(data.total) : " "} · {t.sorted(scoreLabel(state.sort, lang, t), state.dir)}
        {filtered && (
          <button className="link" onClick={() => set({ q: "", ...Object.fromEntries(FACETS.map((f) => [f, undefined])) })}>
            {t.clear}
          </button>
        )}
      </p>

      {result?.error === "failed" ? (
        <p className="library-empty-title">{t.failed}</p>
      ) : !data ? (
        <div className="pages-loading" role="status" aria-label={t.loading}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      ) : !data.rows.length ? (
        <p className="library-empty-title">{t.empty}</p>
      ) : (
        <>
          <div className="canon-mobile">
            <div className="canon-sort">
              <label>
                <span className="eyebrow">{t.sortBy}</span>
                <select aria-label={t.sortLabel} value={state.sort} onChange={(e) => set({ sort: e.target.value as ScoreKey })}>
                  {SCORES.map((k) => (
                    <option key={k} value={k}>
                      {scoreLabel(k, lang, t)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn" aria-label={t.reverse} onClick={() => set({ dir: state.dir === 1 ? -1 : 1 })}>
                {state.dir === 1 ? t.asc : t.desc}
              </button>
            </div>
            <ul className="page-cards">
              {data.rows.map((r) => (
                <li key={`${r.id}:${r.page}`}>
                  <PageCard r={r} lang={lang} t={t} sort={state.sort} />
                </li>
              ))}
            </ul>
          </div>
          <div className="shelf-scroll">
            <div className="book-table pages-table" role="table" aria-label={t.table}>
              <div className="bt-row bt-head" role="row" style={grid}>
                <span role="columnheader">{t.head.quote}</span>
                <span role="columnheader">{t.head.book}</span>
                <span role="columnheader">{t.head.emotion}</span>
                <span role="columnheader">{t.head.mood}</span>
                <span role="columnheader">{t.head.mode}</span>
                {cols.map((k) => (
                  <span key={k} role="columnheader" className="bt-num" aria-sort={state.sort === k ? (state.dir === 1 ? "ascending" : "descending") : undefined}>
                    <button onClick={() => sort(k)} title={scoreLabel(k, lang, t)}>
                      {scoreLabel(k, lang, t)}
                      <i aria-hidden="true">{state.sort === k ? (state.dir === 1 ? "↑" : "↓") : ""}</i>
                    </button>
                  </span>
                ))}
              </div>
              {data.rows.map((r) => (
                <a key={`${r.id}:${r.page}`} className="bt-row" role="row" href={href(`/book/${r.id}?page=${r.page}`)} style={grid} aria-label={t.open(primaryTitle(r, lang), r.page)}>
                  <q className="pt-quote" role="cell" lang="ru">
                    {r.quote}
                  </q>
                  <span className="pt-book" role="cell">
                    <b>{primaryTitle(r, lang)}</b>
                    <small>
                      {[r.year, t.page(r.page)].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <Tag list={EMOTIONS} id={r.emotion} lang={lang} dot />
                  <Tag list={MOODS} id={r.mood} lang={lang} />
                  <Tag list={MODES} id={r.mode} lang={lang} />
                  {cols.map((k) => (
                    <Score key={k} k={k} v={r.scores[k]} lang={lang} t={t} />
                  ))}
                </a>
              ))}
            </div>
          </div>
          {data.pages > 1 && (
            <nav className="result-pages" aria-label={t.results}>
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={n === data.page ? "on" : ""} aria-current={n === data.page ? "page" : undefined} aria-label={t.resultPage(n)} onClick={() => set({ p: n })}>
                  {n}
                </button>
              ))}
            </nav>
          )}
          {data.total > data.pageSize * data.maxPages && <p className="result-cap">{t.cap}</p>}
        </>
      )}
    </div>
  );
}

function PageCard({ r, lang, t, sort }: { r: PageRow; lang: Lang; t: Dict; sort: ScoreKey }) {
  const emotion = EMOTIONS.find((e) => e.id === r.emotion);
  return (
    <a className="page-card" href={href(`/book/${r.id}?page=${r.page}`)} aria-label={t.open(primaryTitle(r, lang), r.page)}>
      <q className="pt-quote" lang="ru">
        {r.quote}
      </q>
      <span className="canon-card-meta">
        {primaryTitle(r, lang)}
        {r.year ? ` · ${r.year}` : ""} · {t.page(r.page)}
      </span>
      <span className="page-card-tags">
        {emotion && <i className="swatch" style={{ background: emotion.color }} aria-hidden="true" />}
        {[emotion && labelOf(emotion, lang), labelOf(MOODS.find((m) => m.id === r.mood)!, lang), labelOf(MODES.find((m) => m.id === r.mode)!, lang)]
          .filter(Boolean)
          .map((s) => s!.toLowerCase())
          .join(" · ")}
        <b>
          {scoreLabel(sort, lang, t)} {dec(r.scores[sort])}
        </b>
      </span>
    </a>
  );
}
