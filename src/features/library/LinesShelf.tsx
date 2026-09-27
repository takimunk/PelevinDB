// The library's "Lines" tab: the strongest sentences of the corpus in one focus dimension (the most quotable, the
// funniest, the darkest…), ranked on the server (GET /api/corpus/lines). One sentence per row, five result pages of
// 25 at most: the same copyright guard as the Pages tab. Opening a line opens its page with that highlight on.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { FOCUS, labelOf, SENTENCE_ACTS, SENTENCE_EMOTIONS, SENTENCE_FLAGS, type FocusId } from "../../../shared/catalog.ts";
import type { LineFacet, LineRow, LinesResult } from "../../../server/sentences.ts";
import { href, navigate } from "../../app/router.ts";
import { plural, useLang, useT, type Lang } from "../../i18n/index.ts";
import { dec, fmt } from "../../ui/format.ts";
import { kindLabel, primaryTitle } from "./labels.ts";
import { rememberLens } from "../book/SentenceText.tsx";

const FACETS: LineFacet[] = ["book", "kind", "decade", "flag", "act"];

const T = {
  en: {
    find: "Find",
    placeholder: "a word from a line, or a title",
    search: "Search the lines",
    rank: "Rank by",
    filters: "Filters",
    hideFilters: "Hide filters",
    facets: { book: "book", kind: "form", decade: "decade", flag: "kind of line", act: "voice" } as Record<LineFacet, string>,
    any: "any",
    filterBy: (name: string) => `Filter by ${name}`,
    decade: (d: string) => `${d}s`,
    count: (n: number) => `${fmt(n)} ${plural(n, ["line", "lines"])}`,
    readNote: (n: number) => `${fmt(n)} read one by one`,
    clear: "Clear filters",
    table: "Lines of the corpus",
    head: { line: "line", book: "book", reading: "read alone" },
    page: (n: number) => `p. ${n}`,
    open: (title: string, page: number) => `${title}, page ${page}`,
    results: "Result pages",
    resultPage: (n: number) => `Result page ${n}`,
    cap: "Beyond this, narrow the filters: this keeps us within copyright.",
    loading: "Reading the index",
    empty: "No lines match these filters.",
    failed: "Could not load the lines. Try again in a minute.",
    unavailable: "Sentence analysis is not on this server yet.",
    how: "Each page names the sentence that carries each quality most. A line’s weight is the page’s score times that choice, so the strongest sentences of the strongest pages lead. “Kind of line” and “voice” come from reading a sentence on its own, done for a sample.",
  },
  ru: {
    find: "Найти",
    placeholder: "слово из фразы или название",
    search: "Поиск по фразам",
    rank: "Ранжировать по",
    filters: "Фильтры",
    hideFilters: "Скрыть фильтры",
    facets: { book: "книга", kind: "форма", decade: "десятилетие", flag: "тип фразы", act: "голос" } as Record<LineFacet, string>,
    any: "любой",
    filterBy: (name: string) => `Фильтр: ${name}`,
    decade: (d: string) => `${d}-е`,
    count: (n: number) => `${fmt(n)} ${plural(n, ["фраза", "фразы", "фраз"])}`,
    readNote: (n: number) => `${fmt(n)} прочитаны по одной`,
    clear: "Сбросить фильтры",
    table: "Фразы корпуса",
    head: { line: "фраза", book: "книга", reading: "отдельно" },
    page: (n: number) => `с. ${n}`,
    open: (title: string, page: number) => `${title}, страница ${page}`,
    results: "Страницы результатов",
    resultPage: (n: number) => `Страница результатов ${n}`,
    cap: "Дальше — только с фильтрами: так мы остаёмся в рамках авторского права.",
    loading: "Читаем индекс",
    empty: "Под эти фильтры фраз нет.",
    failed: "Не удалось загрузить фразы. Попробуйте через минуту.",
    unavailable: "Разбора по фразам на этом сервере пока нет.",
    how: "На каждой странице Jev называет фразу, которая сильнее всего несёт каждое качество. Вес фразы — оценка страницы, умноженная на этот выбор, поэтому впереди самые сильные фразы самых сильных страниц. «Тип фразы» и «голос» — из чтения фразы по отдельности, сделанного для выборки.",
  },
};
type Dict = (typeof T)["en"];

type State = { q: string; dim: FocusId; p: number } & Partial<Record<LineFacet, string>>;

export function readLinesState(params: Record<string, string>): State {
  const p = Number(params.p);
  return {
    q: params.q ?? "",
    dim: FOCUS.some((f) => f.id === params.dim) ? (params.dim as FocusId) : "quotable",
    p: Number.isInteger(p) && p >= 1 && p <= 5 ? p : 1,
    ...Object.fromEntries(FACETS.filter((f) => params[f]).map((f) => [f, params[f]])),
  };
}

function writeLinesState(s: State) {
  const out = new URLSearchParams({ tab: "lines" });
  if (s.q) out.set("q", s.q);
  if (s.dim !== "quotable") out.set("dim", s.dim);
  for (const f of FACETS) if (s[f]) out.set(f, s[f]!);
  if (s.p > 1) out.set("p", String(s.p));
  return out.toString();
}

function apiQuery(s: State) {
  const out = new URLSearchParams();
  if (s.q.trim()) out.set("q", s.q.trim());
  for (const f of FACETS) if (s[f]) out.set(f, s[f]!);
  out.set("dim", s.dim);
  out.set("page", String(s.p));
  return out.toString();
}

function facetLabel(f: LineFacet, value: string, lang: Lang, t: Dict, books: LinesResult["books"]) {
  const list = f === "flag" ? SENTENCE_FLAGS : f === "act" ? SENTENCE_ACTS : null;
  if (list) {
    const item = (list as readonly { id: string; label: string; ru?: string }[]).find((x) => x.id === value);
    return item ? labelOf(item, lang).toLowerCase() : value;
  }
  if (f === "kind") return kindLabel(value as never, lang) ?? value;
  if (f === "decade") return t.decade(value);
  const b = books[value];
  return b ? `${primaryTitle(b, lang)}${b.year ? ` (${b.year})` : ""}` : value;
}

function useLines(state: State) {
  const key = apiQuery(state);
  const [result, setResult] = useState<{ key: string; data?: LinesResult; error?: "failed" | "unavailable" } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        fetch(`/api/corpus/lines?${key}`, { signal: controller.signal })
          .then(async (r) => {
            if (r.status === 404) return setResult({ key, error: "unavailable" });
            if (!r.ok) return setResult({ key, error: "failed" });
            const data = (await r.json()) as LinesResult;
            setResult(data.total || data.read || Object.keys(data.books).length ? { key, data } : { key, error: "unavailable" });
          })
          .catch(() => !controller.signal.aborted && setResult({ key, error: "failed" })),
      result ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  return { result, loading: result?.key !== key };
}

/** What Jev answered about the sentence read alone: leading emotion, voice and the flags it holds. */
function Reading({ r, lang }: { r: LineRow; lang: Lang }) {
  if (!r.read) return <span className="lt-read dim" role="cell">·</span>;
  const emotion = SENTENCE_EMOTIONS.find((e) => e.id === r.read!.emotion)!;
  const flags = SENTENCE_FLAGS.filter((f) => r.read!.flags[f.id] >= 0.5);
  return (
    <span className="lt-read" role="cell">
      <i className="swatch" style={{ background: emotion.color }} aria-hidden="true" />
      {labelOf(emotion, lang).toLowerCase()} · {labelOf(SENTENCE_ACTS.find((a) => a.id === r.read!.act)!, lang).toLowerCase()}
      {flags.map((f) => (
        <span key={f.id} className="tag">
          {labelOf(f, lang).toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export function LinesShelf({ params }: { params: Record<string, string> }) {
  const t = useT(T);
  const lang = useLang();
  const state = readLinesState(params);
  const [showFilters, setShowFilters] = useState(false);
  const { result, loading } = useLines(state);
  const data = result?.data;
  const set = (next: Partial<State>) => navigate(`/library?${writeLinesState({ ...state, p: 1, ...next })}`, { replace: true });
  const dim = FOCUS.find((f) => f.id === state.dim)!;
  const filtered = !!(state.q || FACETS.some((f) => state[f]));
  const facets = useMemo(
    () =>
      FACETS.map((f) => {
        const counts = Object.entries(data?.facets[f] ?? {});
        if (f === "book") counts.sort((a, b) => (data!.books[a[0]]?.year ?? 0) - (data!.books[b[0]]?.year ?? 0));
        else if (f === "decade") counts.sort((a, b) => a[0].localeCompare(b[0]));
        else counts.sort((a, b) => b[1] - a[1]);
        return { f, counts };
      }).filter(({ f, counts }) => counts.length || state[f]),
    [data],
  );

  if (result?.error === "unavailable")
    return (
      <div className="library-empty">
        <p className="library-empty-title">{t.unavailable}</p>
      </div>
    );

  return (
    <div className={`pages-shelf lines-shelf ${loading ? "is-loading" : ""}`} aria-busy={loading}>
      <div className="shelf-tools">
        <label className="library-grep">
          <span>{t.find}</span>
          <input value={state.q} onChange={(e) => set({ q: e.target.value })} placeholder={t.placeholder} aria-label={t.search} />
        </label>
      </div>
      <div className="lines-dims" role="radiogroup" aria-label={t.rank}>
        {FOCUS.map((f) => (
          <button key={f.id} role="radio" aria-checked={state.dim === f.id} className={state.dim === f.id ? "on" : ""} style={{ "--c": f.color } as CSSProperties} onClick={() => set({ dim: f.id })}>
            <i aria-hidden="true" />
            {labelOf(f, lang).toLowerCase()}
          </button>
        ))}
      </div>
      {facets.length > 0 && (
        <>
          <button className="btn shelf-filter-toggle" aria-expanded={showFilters} aria-controls="lines-refinements" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? t.hideFilters : t.filters}
            {data ? ` · ${t.count(data.total)}` : ""}
          </button>
          <div id="lines-refinements" className={`shelf-refinements ${showFilters ? "expanded" : ""}`}>
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
          </div>
        </>
      )}
      <p className="shelf-count">
        {data ? t.count(data.total) : " "}
        {data?.read ? ` · ${t.readNote(data.read)}` : ""}
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
          <ol className="lines-list" aria-label={t.table} start={(data.page - 1) * data.pageSize + 1}>
            {data.rows.map((r) => (
              <li key={`${r.id}:${r.page}:${r.n}`}>
                <a href={href(`/book/${r.id}?page=${r.page}`)} onClick={() => rememberLens(state.dim)} aria-label={t.open(primaryTitle(r, lang), r.page)}>
                  <q className="pt-quote" lang="ru">
                    {r.text}
                  </q>
                  <span className="lines-meta">
                    <span className="lines-weight num" style={{ "--c": dim.color, "--w": Math.min(1, r.weights[state.dim]).toFixed(3) } as CSSProperties}>
                      <i aria-hidden="true" />
                      {dec(r.weights[state.dim])}
                    </span>
                    <span className="pt-book">
                      <b>{primaryTitle(r, lang)}</b>
                      <small>{[r.year, t.page(r.page)].filter(Boolean).join(" · ")}</small>
                    </span>
                    <Reading r={r} lang={lang} />
                  </span>
                </a>
              </li>
            ))}
          </ol>
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
      <p className="shelf-note">{t.how}</p>
    </div>
  );
}
