// Page-level navigation across the whole corpus (the library's "Pages" tab): every story page as one row with a
// one-sentence quote, its leading emotion, mood and narration, and its scores. Filters, sort and facet counts are
// computed here; the row index is built once per store stamp.
//
// Copyright guard: a query returns at most PAGE_SIZE rows per result page and only the first MAX_RESULT_PAGES result
// pages, one sentence per row. Anything further has to be reached by narrowing the filters.
import { createHash } from "node:crypto";
import { argmax, isParatext } from "../shared/analysis.ts";
import { EMOTIONS, FOCUS, MODES, MOODS, RUBRIC_VERSION, TEXTURES, THEMES, type EmotionId, type FocusId, type ModeId, type MoodId, type TextureId, type ThemeId } from "../shared/catalog.ts";
import type { BookKind } from "../shared/types.ts";
import { peakQuote } from "./sentences.ts";
import { pageQuote } from "./stats.ts";
import type { Store } from "./store.ts";

export const PAGE_SIZE = 25;
export const MAX_RESULT_PAGES = 5;
/** A theme counts as present on a page from this Jev score up. */
export const THEME_PRESENT = 0.5;
const MAX_QUERY = 100;

export type ScoreKey = EmotionId | TextureId | "intensity";
export const SCORE_KEYS: ScoreKey[] = ["intensity", ...EMOTIONS.map((e) => e.id), ...TEXTURES.map((t) => t.id)];
export const FACET_KEYS = ["book", "kind", "decade", "emotion", "mood", "mode", "theme"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

/** One row of GET /api/corpus/pages. `page` is 1-based, as in `/book/:id?page=`. */
export type PageRow = {
  id: string;
  title: string;
  titleEn: string | null;
  year: number | null;
  kind: BookKind | null;
  page: number;
  quote: string;
  emotion: EmotionId;
  mood: MoodId;
  mode: ModeId;
  themes: ThemeId[];
  /** Every score, 0–1, rounded to three decimals. `intensity` is the strongest emotion. */
  scores: Record<ScoreKey, number>;
};

export type PagesQuery = {
  q: string;
  book: string | null;
  kind: string | null;
  decade: string | null;
  emotion: string | null;
  mood: string | null;
  mode: string | null;
  theme: string | null;
  sort: ScoreKey;
  dir: 1 | -1;
  page: number;
};

export type PagesResult = {
  total: number;
  page: number;
  pageSize: number;
  /** How many result pages this query may browse: at most MAX_RESULT_PAGES. */
  pages: number;
  maxPages: number;
  rows: PageRow[];
  /** For each facet, value → rows matching every other active filter. */
  facets: Record<FacetKey, Record<string, number>>;
  /** Book id → titles, for the book facet's labels. */
  books: Record<string, { title: string; titleEn: string | null; year: number | null }>;
};

type IndexRow = PageRow & { decade: string | null; search: string };
type Index = { stamp: string; rows: IndexRow[]; books: PagesResult["books"] };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");
const cache = new WeakMap<Store, Index>();

/** Every story page of the corpus, in book and page order, with its quote. Rebuilt when the store changes. */
export function pageIndex(store: Store): Index {
  const stamp = store.totals().stamp;
  const cached = cache.get(store);
  if (cached?.stamp === stamp) return cached;

  const meta = new Map(store.books().map((b) => [b.id, b]));
  const texts = new Map<string, { text: string | null; segments: Map<number, { start: number; end: number }> }>();
  const pageText = (id: string, idx: number) => {
    let t = texts.get(id);
    if (!t) texts.set(id, (t = { text: store.text(id), segments: new Map(store.segments(id).map((s) => [s.idx, s])) }));
    const s = t.segments.get(idx);
    return t.text != null && s ? t.text.slice(s.start, s.end) : "";
  };

  const rows: IndexRow[] = [];
  const books: PagesResult["books"] = {};
  for (const { bookId, idx, answer: a } of store.everyAnalysis(RUBRIC_VERSION)) {
    if (isParatext(a)) continue;
    const b = meta.get(bookId);
    const year = b?.year ?? null;
    const title = b?.title ?? bookId;
    const titleEn = b?.titleEn ?? null;
    books[bookId] ??= { title, titleEn, year };
    const scores = { intensity: r3(Math.max(...EMOTIONS.map((e) => a.emotions[e.id]))) } as Record<ScoreKey, number>;
    for (const e of EMOTIONS) scores[e.id] = r3(a.emotions[e.id]);
    for (const t of TEXTURES) scores[t.id] = r3(a.texture[t.id]);
    const quote = pageQuote(pageText(bookId, idx));
    rows.push({
      id: bookId,
      title,
      titleEn,
      year,
      kind: b?.kind ?? null,
      page: idx + 1,
      quote,
      emotion: argmax(a.emotions),
      mood: argmax(a.mood),
      mode: argmax(a.mode),
      themes: THEMES.filter((t) => a.themes[t.id] >= THEME_PRESENT).map((t) => t.id),
      scores,
      decade: year == null ? null : String(Math.floor(year / 10) * 10),
      search: norm(`${title} ${titleEn ?? ""} ${quote}`),
    });
  }
  const index = { stamp, rows, books };
  cache.set(store, index);
  return index;
}

/** Parses and validates the URL query. Unknown values are rejected, never silently widened. */
export function pagesQuery(raw: Record<string, unknown>): { query: PagesQuery } | { error: string } {
  const str = (k: string) => (typeof raw[k] === "string" && (raw[k] as string).trim() ? (raw[k] as string).trim() : null);
  const q = str("q") ?? "";
  if (q.length > MAX_QUERY) return { error: `Search text is limited to ${MAX_QUERY} characters.` };
  const one = <T extends string>(k: string, allowed: readonly T[] | null, pattern?: RegExp) => {
    const v = str(k);
    if (v == null) return { ok: null };
    if (allowed ? !allowed.includes(v as T) : !pattern!.test(v)) return { bad: `Unknown ${k}: ${v.slice(0, 40)}` };
    return { ok: v };
  };
  const checks = {
    book: one("book", null, /^[a-z0-9-]{1,96}$/),
    kind: one("kind", null, /^[a-z]{1,20}$/),
    decade: one("decade", null, /^\d{3}0$/),
    emotion: one("emotion", EMOTIONS.map((e) => e.id)),
    mood: one("mood", MOODS.map((m) => m.id)),
    mode: one("mode", MODES.map((m) => m.id)),
    theme: one("theme", THEMES.map((t) => t.id)),
    sort: one("sort", SCORE_KEYS),
  };
  for (const c of Object.values(checks)) if ("bad" in c) return { error: c.bad! };
  const pageRaw = str("page") ?? "1";
  const page = /^\d{1,4}$/.test(pageRaw) ? Number(pageRaw) : NaN;
  if (!Number.isInteger(page) || page < 1) return { error: "Result page must be a whole number from 1." };
  if (page > MAX_RESULT_PAGES)
    return { error: `Results stop after page ${MAX_RESULT_PAGES} to respect copyright. Narrow the filters to see other pages.` };
  const v = (c: { ok?: string | null }) => c.ok ?? null;
  return {
    query: {
      q,
      book: v(checks.book),
      kind: v(checks.kind),
      decade: v(checks.decade),
      emotion: v(checks.emotion),
      mood: v(checks.mood),
      mode: v(checks.mode),
      theme: v(checks.theme),
      sort: (v(checks.sort) as ScoreKey | null) ?? "intensity",
      dir: str("dir") === "1" ? 1 : -1,
      page,
    },
  };
}

const facetOf: Record<FacetKey, (r: IndexRow) => string[]> = {
  book: (r) => [r.id],
  kind: (r) => (r.kind ? [r.kind] : []),
  decade: (r) => (r.decade ? [r.decade] : []),
  emotion: (r) => [r.emotion],
  mood: (r) => [r.mood],
  mode: (r) => [r.mode],
  theme: (r) => r.themes,
};

/** Filters, facet counts (each facet ignores its own filter), sort and the capped result page. */
export function queryPages(store: Store, query: PagesQuery): PagesResult {
  const { rows, books } = pageIndex(store);
  const words = norm(query.q).split(/\s+/).filter(Boolean);
  const text = (r: IndexRow) => words.every((w) => r.search.includes(w));
  const active = FACET_KEYS.filter((f) => query[f] != null);

  const facets = Object.fromEntries(FACET_KEYS.map((f) => [f, {} as Record<string, number>])) as PagesResult["facets"];
  const matched: IndexRow[] = [];
  for (const r of rows) {
    if (!text(r)) continue;
    const fails = active.filter((f) => !facetOf[f](r).includes(query[f]!));
    if (!fails.length) matched.push(r);
    // A row counts toward facet f when it passes every filter except f's own.
    for (const f of FACET_KEYS) {
      if (fails.length > 1 || (fails.length === 1 && fails[0] !== f)) continue;
      for (const value of facetOf[f](r)) facets[f][value] = (facets[f][value] ?? 0) + 1;
    }
  }
  const key = query.sort;
  matched.sort((a, b) => (a.scores[key] - b.scores[key]) * query.dir || a.id.localeCompare(b.id) || a.page - b.page);
  const pages = Math.min(MAX_RESULT_PAGES, Math.ceil(matched.length / PAGE_SIZE));
  const start = (query.page - 1) * PAGE_SIZE;
  return {
    total: matched.length,
    page: query.page,
    pageSize: PAGE_SIZE,
    pages,
    maxPages: MAX_RESULT_PAGES,
    rows: matched.slice(start, start + PAGE_SIZE).map(({ decade: _d, search: _s, ...row }) => {
      // The quote follows the sort: the page's most frightening sentence when sorted by fear. A text search keeps
      // the indexed quote, so the words searched for stay visible.
      const dim = words.length ? null : quoteDim(query.sort, query.dir, row.emotion);
      return { ...row, quote: (dim && peakQuote(store, row.id, row.page - 1, dim)) || row.quote };
    }),
    facets,
    books,
  };
}

/** The focus dimension whose peak sentence best quotes a page sorted by `sort`, if any. */
function quoteDim(sort: ScoreKey, dir: 1 | -1, leading: EmotionId): FocusId | null {
  if (sort === "intensity") return FOCUS.some((f) => f.id === leading) ? (leading as FocusId) : null;
  if (sort === "valence") return dir === -1 ? "light" : "dark";
  return dir === -1 && FOCUS.some((f) => f.id === sort) ? (sort as FocusId) : null;
}

/** A weak ETag for one query against the current store. */
export function pagesETag(store: Store, query: PagesQuery) {
  const key = JSON.stringify([pageIndex(store).stamp, query]);
  return `W/"${createHash("sha1").update(`pages2|${key}`).digest("base64url")}"`;
}
