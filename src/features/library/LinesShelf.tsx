// The library's "Quotes" tab (route `tab=lines`): sentences of the corpus ranked in one focus dimension (the most
// quotable, the funniest, the darkest…) on the server (GET /api/corpus/lines), 25 per result page. A quote links to
// its page with the exact sentence (`s`), which the reader scrolls to and marks; the dimension becomes the highlight.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { EMOTIONS, FOCUS, labelOf, MOODS, SENTENCE_ACTS, SENTENCE_EMOTIONS, SENTENCE_FLAGS, THEMES, type FocusId } from "../../../shared/catalog.ts";
import type { LineFacet, LineRow, LinesResult } from "../../../server/sentences.ts";
import { href, navigate, sentencePath } from "../../app/router.ts";
import { plural, useLang, useT, type Lang } from "../../i18n/index.ts";
import { dec, fmt } from "../../ui/format.ts";
import { setTranslateAll, Translatable, useTranslateAll } from "../../ui/Translatable.tsx";
import { kindLabel, primaryTitle } from "./labels.ts";
import { rememberLens } from "../book/SentenceText.tsx";

const FACETS: LineFacet[] = ["book", "kind", "decade", "flag", "act"];
/** A flag counts as present from this probability up (FLAG_PRESENT in server/sentences.ts). */
const FLAG_PRESENT = 0.5;

const T = {
  en: {
    find: "Find",
    quoteLang: "Quote language",
    langs: { ru: "Russian", en: "English" },
    placeholder: "a word from a quote, or a title",
    search: "Search the quotes",
    rank: "Rank by",
    filters: "Filters",
    hideFilters: "Hide filters",
    facets: { book: "book", kind: "form", decade: "decade", flag: "kind of quote", act: "voice" } as Record<LineFacet, string>,
    any: "any",
    filterBy: (name: string) => `Filter by ${name}`,
    decade: (d: string) => `${d}s`,
    count: (n: number) => `${fmt(n)} ${plural(n, ["quote", "quotes"])}`,
    clear: "Clear filters",
    table: "Quotes",
    page: (n: number) => `p. ${n}`,
    open: (title: string, page: number) => `${title}, page ${page}`,
    results: "Result pages",
    resultPage: (n: number) => `Result page ${n}`,
    first: "First result page",
    prev: "Previous result page",
    next: "Next result page",
    last: "Last result page",
    loading: "Loading",
    tagTitles: {
      sentence: "emotion of the sentence, analysed on its own",
      page: "leading emotion of the page",
      weight: "weight in the ranked quality: page score × how surely the sentence carries it",
      mood: "mood of the page",
      themes: "themes of the page",
      voice: "voice of the sentence",
      flags: "kind of quote",
    },
    empty: "No quotes match these filters.",
    failed: "Could not load the quotes. Try again in a minute.",
    unavailable: "Sentence analysis is not on this server yet.",
  },
  ru: {
    find: "Найти",
    quoteLang: "Язык цитат",
    langs: { ru: "русский", en: "английский" },
    placeholder: "слово из цитаты или название",
    search: "Поиск по цитатам",
    rank: "Ранжировать по",
    filters: "Фильтры",
    hideFilters: "Скрыть фильтры",
    facets: { book: "книга", kind: "форма", decade: "десятилетие", flag: "тип цитаты", act: "голос" } as Record<LineFacet, string>,
    any: "любой",
    filterBy: (name: string) => `Фильтр: ${name}`,
    decade: (d: string) => `${d}-е`,
    count: (n: number) => `${fmt(n)} ${plural(n, ["цитата", "цитаты", "цитат"])}`,
    clear: "Сбросить фильтры",
    table: "Цитаты",
    page: (n: number) => `с. ${n}`,
    open: (title: string, page: number) => `${title}, страница ${page}`,
    results: "Страницы результатов",
    resultPage: (n: number) => `Страница результатов ${n}`,
    first: "Первая страница результатов",
    prev: "Предыдущая страница результатов",
    next: "Следующая страница результатов",
    last: "Последняя страница результатов",
    loading: "Загрузка",
    tagTitles: {
      sentence: "эмоция предложения, проанализированного отдельно",
      page: "ведущая эмоция страницы",
      weight: "вес по выбранному качеству: оценка страницы × уверенность, что его несёт это предложение",
      mood: "настроение страницы",
      themes: "темы страницы",
      voice: "голос предложения",
      flags: "тип цитаты",
    },
    empty: "Под эти фильтры цитат нет.",
    failed: "Не удалось загрузить цитаты. Попробуйте через минуту.",
    unavailable: "Анализа по предложениям на этом сервере пока нет.",
  },
};
type Dict = (typeof T)["en"];

type State = { q: string; dim: FocusId; p: number } & Partial<Record<LineFacet, string>>;

export function readLinesState(params: Record<string, string>): State {
  const p = Number(params.p);
  return {
    q: params.q ?? "",
    dim: FOCUS.some((f) => f.id === params.dim) ? (params.dim as FocusId) : "quotable",
    p: Number.isInteger(p) && p >= 1 ? p : 1,
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

/**
 * One muted line about a quote: its emotion (the sentence's own when it was analysed alone, else the page's leading
 * one), its weight in the ranked dimension, the page's mood and themes, and, for sentences analysed alone, the voice
 * and the flags it carries. Colour marks data only (the emotion swatch and the weight bar).
 */
function LineTags({ r, dim, lang, t }: { r: LineRow; dim: FocusId; lang: Lang; t: Dict }) {
  const f = FOCUS.find((x) => x.id === dim)!;
  const own = r.read && r.read.emotion !== "neutral" ? SENTENCE_EMOTIONS.find((e) => e.id === r.read!.emotion) : null;
  const emotion = own ?? EMOTIONS.find((e) => e.id === r.emotion)!;
  const w = r.weights[dim];
  const low = (x: { label: string; ru?: string }) => labelOf(x, lang).toLowerCase();
  const act = r.read ? SENTENCE_ACTS.find((a) => a.id === r.read!.act) : null;
  const flags = r.read ? SENTENCE_FLAGS.filter((x) => r.read!.flags[x.id] >= FLAG_PRESENT) : [];
  const themes = r.themes.map((id) => low(THEMES.find((x) => x.id === id)!));
  return (
    <span className="lines-tags">
      <span title={own ? t.tagTitles.sentence : t.tagTitles.page}>
        <i className="lines-swatch" style={{ background: emotion.color }} aria-hidden="true" />
        {low(emotion)}
      </span>
      <span className="lines-weight" title={t.tagTitles.weight}>
        {low(f)} <i style={{ "--c": f.color, "--w": Math.min(1, w).toFixed(3) } as CSSProperties} aria-hidden="true" /> {dec(w)}
      </span>
      <span title={t.tagTitles.mood}>{low(MOODS.find((m) => m.id === r.mood)!)}</span>
      {themes.length > 0 && <span title={t.tagTitles.themes}>{themes.join(", ")}</span>}
      {act && <span title={t.tagTitles.voice}>{low(act)}</span>}
      {flags.length > 0 && <span title={t.tagTitles.flags}>{flags.map(low).join(", ")}</span>}
    </span>
  );
}

/** Result pages 1…`pages`: first, previous, a window around the current page, next, last. */
function Pager({ page, pages, go, t }: { page: number; pages: number; go: (p: number) => void; t: Dict }) {
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const step = (target: number, label: string, text: string) => (
    <button disabled={target === page || target < 1 || target > pages} aria-label={label} onClick={() => go(target)}>
      {text}
    </button>
  );
  return (
    <nav className="result-pages" aria-label={t.results}>
      {step(1, t.first, "«")}
      {step(page - 1, t.prev, "‹")}
      {numbers.map((n) => (
        <button key={n} className={n === page ? "on" : ""} aria-current={n === page ? "page" : undefined} aria-label={t.resultPage(n)} onClick={() => go(n)}>
          {n}
        </button>
      ))}
      {step(page + 1, t.next, "›")}
      {step(pages, t.last, "»")}
    </nav>
  );
}

export function LinesShelf({ params }: { params: Record<string, string> }) {
  const t = useT(T);
  const lang = useLang();
  const state = readLinesState(params);
  const [showFilters, setShowFilters] = useState(false);
  const { result, loading } = useLines(state);
  const english = useTranslateAll();
  const data = result?.data;
  const set = (next: Partial<State>) => navigate(`/library?${writeLinesState({ ...state, p: 1, ...next })}`, { replace: true });
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
        {/* Translations exist for the English interface only; the switch translates every quote on screen. */}
        {lang === "en" && (
          <div className="presets" role="group" aria-label={t.quoteLang}>
            {(["ru", "en"] as const).map((l) => (
              <button key={l} className={english === (l === "en") ? "on" : ""} aria-pressed={english === (l === "en")} onClick={() => setTranslateAll(l === "en")}>
                {t.langs[l]}
              </button>
            ))}
          </div>
        )}
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
                {/* `s` names the exact sentence; the lens only tints the page by this dimension (its peak may be another sentence). */}
                <a href={href(sentencePath(r.id, r.page, r.n))} onClick={() => rememberLens(state.dim)} aria-label={t.open(primaryTitle(r, lang), r.page)}>
                  <Translatable className="pt-quote" text={r.text} refKey={`l:${r.id}:${r.page}:${r.n}`} />
                  <span className="lines-meta">
                    <span className="pt-book">
                      <b>{primaryTitle(r, lang)}</b>
                      <small>{[r.year, t.page(r.page)].filter(Boolean).join(" · ")}</small>
                    </span>
                    <LineTags r={r} dim={state.dim} lang={lang} t={t} />
                  </span>
                </a>
              </li>
            ))}
          </ol>
          {data.pages > 1 && <Pager page={data.page} pages={data.pages} go={(p) => {
                navigate(`/library?${writeLinesState({ ...state, p })}`);
                window.scrollTo({ top: 0 });
              }} t={t} />}
        </>
      )}
    </div>
  );
}
