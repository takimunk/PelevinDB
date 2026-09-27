// Sentence-level views of the stored answers, shaped for the browser: the peak sentence of a page (sharper quotes),
// the sentences of the page open in the reader, and the corpus-wide "Lines" ranking.
//
// Copyright guard, as for pages: the reader gets sentence offsets into the one page it already holds; the Lines tab
// returns at most PAGE_SIZE sentences per result page and MAX_RESULT_PAGES result pages; a book payload carries
// at most BOOK_LINES sentences.
import { createHash } from "node:crypto";
import { argmax, isParatext } from "../shared/analysis.ts";
import {
  FOCUS,
  FOCUS_RUBRIC,
  RUBRIC_VERSION,
  SENTENCE_ACTS,
  SENTENCE_FLAGS,
  SENTENCE_RUBRIC,
  SENTENCE_SCALES,
  type FocusId,
} from "../shared/catalog.ts";
import type { BookKind, BookLine, FocusAnalysis, PageSentences, SegmentAnalysis, SentenceAnalysis, SentenceRead } from "../shared/types.ts";
import { focusWeights, peakSentence } from "../src/domain/sentences.ts";
import type { Store } from "./store.ts";

export const PAGE_SIZE = 25;
export const MAX_RESULT_PAGES = 5;
/** Per book and dimension, how many of its strongest sentences enter the Lines index. */
export const LINES_PER_BOOK = 60;
/** A flag counts as present from this Noul probability up. */
export const FLAG_PRESENT = 0.5;
const QUOTE_MIN = 20;
const QUOTE_MAX = 220;
const MAX_QUERY = 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** One sentence as a quote: whitespace folded, cut at a word with an ellipsis past QUOTE_MAX, "…" before a fragment. */
export function sentenceQuote(sentence: string, opensPage = false): string {
  let s = clean(sentence);
  if (opensPage && /^[\p{Ll},;:)]/u.test(s)) s = `…${s}`;
  if (s.length <= QUOTE_MAX) return s;
  const window = s.slice(0, QUOTE_MAX - 1);
  const word = window.lastIndexOf(" ");
  return `${(word > QUOTE_MAX * 0.6 ? window.slice(0, word) : window).replace(/[\s,;:—–-]+$/u, "")}…`;
}


export const compactRead = (a: SentenceAnalysis): SentenceRead => ({
  emotion: argmax(a.emotion),
  act: argmax(a.act),
  scales: Object.fromEntries(SENTENCE_SCALES.map((s) => [s.id, r3(a.scales[s.id])])) as SentenceRead["scales"],
  flags: Object.fromEntries(SENTENCE_FLAGS.map((f) => [f.id, r3(a.flags[f.id])])) as SentenceRead["flags"],
});


type BookCache = {
  text: string;
  pages: Map<number, SegmentAnalysis>;
  sentences: Map<number, { start: number; end: number }[]>;
  focus: Map<number, FocusAnalysis>;
  read: Map<string, SentenceAnalysis>;
};
const bookCache = new WeakMap<Store, { stamp: string; books: Map<string, BookCache | null> }>();

/** Everything sentence-level about a book, read once per store stamp; null when it is not split yet. */
function bookData(store: Store, id: string): BookCache | null {
  if (!store.hasSentences) return null;
  const stamp = store.totals().stamp;
  let cache = bookCache.get(store);
  if (cache?.stamp !== stamp) bookCache.set(store, (cache = { stamp, books: new Map() }));
  if (!cache.books.has(id)) {
    const text = store.text(id);
    const sentences = store.sentences(id);
    cache.books.set(
      id,
      text == null || !sentences.size
        ? null
        : { text, pages: store.analyses(id, RUBRIC_VERSION), sentences, focus: store.focus(id, FOCUS_RUBRIC), read: store.sentenceAnalyses(id, SENTENCE_RUBRIC) },
    );
    // Only the last few books stay: the Lines index holds what it needs on its own.
    for (const old of cache.books.keys()) if (cache.books.size > 8) cache.books.delete(old);
  }
  return cache.books.get(id) ?? null;
}

export function pageSentences(store: Store, id: string, page: number, pageStart: number): PageSentences | null {
  const b = bookData(store, id);
  const list = b?.sentences.get(page);
  if (!b || !list?.length) return null;
  const f = b.focus.get(page);
  return {
    spans: list.map((s) => [s.start - pageStart, s.end - pageStart]),
    focus: f && f.sentences === list.length ? { focus: roundFocus(f.focus), none: roundAll(f.none) } : null,
    read: list.map((_, i) => {
      const a = b.read.get(`${page}:${i}`);
      return a ? compactRead(a) : null;
    }),
  };
}

const roundAll = <K extends string>(r: Record<K, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r3(v as number)])) as Record<K, number>;
const roundFocus = (r: Record<FocusId, number[]>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as number[]).map(r3)])) as Record<FocusId, number[]>;

/**
 * The page's peak sentence for a dimension as a quote, or null when the page has no focus answer, Jev names no
 * sentence, or the sentence is too short to stand as a quote (then callers keep their own quote).
 */
export function peakQuote(store: Store, id: string, page: number, dim: FocusId): string | null {
  const b = bookData(store, id);
  const f = b?.focus.get(page);
  const list = b?.sentences.get(page);
  if (!b || !f || !list || f.sentences !== list.length) return null;
  const peak = peakSentence(f, dim);
  if (peak == null) return null;
  const s = list[peak];
  const text = b.text.slice(s.start, s.end);
  if (clean(text).replace(/^[—–-]\s*/, "").length < QUOTE_MIN) return null;
  return sentenceQuote(text, peak === 0);
}

// ───────── Book lines: the strongest few sentences of one book ─────────

export const BOOK_LINES = { quotable: 5, humor: 3, ideas: 3 } as const satisfies Partial<Record<FocusId, number>>;

/** The book's most quotable, funniest and most abstract sentences, one per page at most within a dimension. */
export function bookLines(store: Store, id: string): BookLine[] {
  const b = bookData(store, id);
  if (!b) return [];
  const out: BookLine[] = [];
  for (const [dim, count] of Object.entries(BOOK_LINES) as [FocusId, number][]) {
    const ranked: { page: number; idx: number; w: number }[] = [];
    for (const [page, f] of b.focus) {
      const a = b.pages.get(page) ?? null;
      if (!a || isParatext(a) || f.sentences !== b.sentences.get(page)?.length) continue;
      const peak = peakSentence(f, dim);
      if (peak == null) continue;
      const s = b.sentences.get(page)![peak];
      if (clean(b.text.slice(s.start, s.end)).length < QUOTE_MIN) continue;
      ranked.push({ page, idx: peak, w: focusWeights(f, a, dim)[peak] });
    }
    ranked.sort((x, y) => y.w - x.w);
    for (const r of ranked.slice(0, count)) {
      const s = b.sentences.get(r.page)![r.idx];
      const read = b.read.get(`${r.page}:${r.idx}`);
      out.push({ dim, page: r.page + 1, n: r.idx + 1, text: sentenceQuote(b.text.slice(s.start, s.end), r.idx === 0), weight: r3(r.w), read: read ? compactRead(read) : null });
    }
  }
  return out;
}

// ───────── Lines: the strongest sentences of the corpus ─────────

export const LINE_FACETS = ["book", "kind", "decade", "flag", "act"] as const;
export type LineFacet = (typeof LINE_FACETS)[number];

export type LineRow = {
  id: string;
  title: string;
  titleEn: string | null;
  year: number | null;
  kind: BookKind | null;
  page: number;
  n: number;
  text: string;
  /** Page score × the probability that this sentence carries the dimension most, per focus dimension. */
  weights: Record<FocusId, number>;
  read: SentenceRead | null;
};

export type LinesQuery = { q: string; dim: FocusId; book: string | null; kind: string | null; decade: string | null; flag: string | null; act: string | null; page: number };
export type LinesResult = {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  maxPages: number;
  rows: LineRow[];
  facets: Record<LineFacet, Record<string, number>>;
  books: Record<string, { title: string; titleEn: string | null; year: number | null }>;
  /** Sentences Jev has read on their own, of all sentences in the index. */
  read: number;
};

type LineIndexRow = LineRow & { decade: string | null; search: string };
type LineIndex = { stamp: string; rows: LineIndexRow[]; books: LinesResult["books"] };
const lineCache = new WeakMap<Store, LineIndex>();

/**
 * For every book and focus dimension, its LINES_PER_BOOK strongest sentences by weight (no more than one per page and
 * dimension), with their text. Rebuilt when the store changes.
 */
export function lineIndex(store: Store): LineIndex {
  const stamp = store.totals().stamp;
  const cached = lineCache.get(store);
  if (cached?.stamp === stamp) return cached;
  const rows: LineIndexRow[] = [];
  const books: LinesResult["books"] = {};
  if (store.hasSentences)
    for (const meta of store.books()) {
      const focus = store.focus(meta.id, FOCUS_RUBRIC);
      if (!focus.size) continue;
      const text = store.text(meta.id)!;
      const sentences = store.sentences(meta.id);
      const pages = store.analyses(meta.id, RUBRIC_VERSION);
      const read = store.sentenceAnalyses(meta.id, SENTENCE_RUBRIC);
      const weightsOf = new Map<number, Record<FocusId, number[]>>();
      for (const [page, f] of focus) {
        const a = pages.get(page) ?? null;
        if (!a || isParatext(a) || f.sentences !== sentences.get(page)?.length) continue;
        weightsOf.set(page, Object.fromEntries(FOCUS.map((d) => [d.id, focusWeights(f, a, d.id)])) as Record<FocusId, number[]>);
      }
      const chosen = new Set<string>();
      for (const d of FOCUS) {
        const ranked: { page: number; idx: number; w: number }[] = [];
        for (const [page, w] of weightsOf) {
          const f = focus.get(page)!;
          const peak = peakSentence(f, d.id);
          if (peak != null) ranked.push({ page, idx: peak, w: w[d.id][peak] });
        }
        ranked.sort((x, y) => y.w - x.w);
        let taken = 0;
        for (const r of ranked) {
          if (taken >= LINES_PER_BOOK) break;
          const s = sentences.get(r.page)![r.idx];
          if (clean(text.slice(s.start, s.end)).replace(/^[—–-]\s*/, "").length < QUOTE_MIN) continue;
          chosen.add(`${r.page}:${r.idx}`);
          taken++;
        }
      }
      if (!chosen.size) continue;
      const year = meta.year ?? null;
      books[meta.id] = { title: meta.title, titleEn: meta.titleEn ?? null, year };
      for (const key of chosen) {
        const [page, idx] = key.split(":").map(Number);
        const s = sentences.get(page)![idx];
        const w = weightsOf.get(page)!;
        const quote = sentenceQuote(text.slice(s.start, s.end), idx === 0);
        const a = read.get(key);
        rows.push({
          id: meta.id,
          title: meta.title,
          titleEn: meta.titleEn ?? null,
          year,
          kind: meta.kind ?? null,
          page: page + 1,
          n: idx + 1,
          text: quote,
          weights: Object.fromEntries(FOCUS.map((d) => [d.id, r3(w[d.id][idx])])) as Record<FocusId, number>,
          read: a ? compactRead(a) : null,
          decade: year == null ? null : String(Math.floor(year / 10) * 10),
          search: norm(`${meta.title} ${meta.titleEn ?? ""} ${quote}`),
        });
      }
    }
  const index = { stamp, rows, books };
  lineCache.set(store, index);
  return index;
}

export function linesQuery(raw: Record<string, unknown>): { query: LinesQuery } | { error: string } {
  const str = (k: string) => (typeof raw[k] === "string" && (raw[k] as string).trim() ? (raw[k] as string).trim() : null);
  const q = str("q") ?? "";
  if (q.length > MAX_QUERY) return { error: `Search text is limited to ${MAX_QUERY} characters.` };
  const checks: Record<string, [string | null, (v: string) => boolean]> = {
    dim: [str("dim"), (v) => FOCUS.some((f) => f.id === v)],
    book: [str("book"), (v) => /^[a-z0-9-]{1,96}$/.test(v)],
    kind: [str("kind"), (v) => /^[a-z]{1,20}$/.test(v)],
    decade: [str("decade"), (v) => /^\d{3}0$/.test(v)],
    flag: [str("flag"), (v) => SENTENCE_FLAGS.some((f) => f.id === v)],
    act: [str("act"), (v) => SENTENCE_ACTS.some((a) => a.id === v)],
  };
  for (const [k, [v, ok]] of Object.entries(checks)) if (v != null && !ok(v)) return { error: `Unknown ${k}: ${v.slice(0, 40)}` };
  const pageRaw = str("page") ?? "1";
  const page = /^\d{1,4}$/.test(pageRaw) ? Number(pageRaw) : NaN;
  if (!Number.isInteger(page) || page < 1) return { error: "Result page must be a whole number from 1." };
  if (page > MAX_RESULT_PAGES) return { error: `Results stop after page ${MAX_RESULT_PAGES} to respect copyright. Narrow the filters to see other lines.` };
  return {
    query: {
      q,
      dim: (checks.dim[0] as FocusId | null) ?? "quotable",
      book: checks.book[0],
      kind: checks.kind[0],
      decade: checks.decade[0],
      flag: checks.flag[0],
      act: checks.act[0],
      page,
    },
  };
}

const lineFacetOf: Record<LineFacet, (r: LineIndexRow) => string[]> = {
  book: (r) => [r.id],
  kind: (r) => (r.kind ? [r.kind] : []),
  decade: (r) => (r.decade ? [r.decade] : []),
  flag: (r) => (r.read ? SENTENCE_FLAGS.filter((f) => r.read!.flags[f.id] >= FLAG_PRESENT).map((f) => f.id) : []),
  act: (r) => (r.read ? [r.read.act] : []),
};

export function queryLines(store: Store, query: LinesQuery): LinesResult {
  const { rows, books } = lineIndex(store);
  const words = norm(query.q).split(/\s+/).filter(Boolean);
  const active = LINE_FACETS.filter((f) => query[f] != null);
  const facets = Object.fromEntries(LINE_FACETS.map((f) => [f, {} as Record<string, number>])) as LinesResult["facets"];
  const matched: LineIndexRow[] = [];
  for (const r of rows) {
    if (!words.every((w) => r.search.includes(w))) continue;
    const fails = active.filter((f) => !lineFacetOf[f](r).includes(query[f]!));
    if (!fails.length) matched.push(r);
    for (const f of LINE_FACETS) {
      if (fails.length > 1 || (fails.length === 1 && fails[0] !== f)) continue;
      for (const value of lineFacetOf[f](r)) facets[f][value] = (facets[f][value] ?? 0) + 1;
    }
  }
  // Weights are products of 5-level page scores and near-certain picks, so many tie at the top. Equal weights (to two
  // decimals) take turns across books, so a tie is never settled by a book's alphabetical place.
  const w = (r: LineIndexRow) => r.weights[query.dim];
  matched.sort((a, b) => w(b) - w(a) || a.id.localeCompare(b.id) || a.page - b.page || a.n - b.n);
  const turn = new Map<LineIndexRow, number>();
  const seen = new Map<string, number>();
  for (const r of matched) {
    const k = `${r.id}|${Math.round(w(r) * 100)}`;
    turn.set(r, seen.get(k) ?? 0);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  matched.sort((a, b) => Math.round(w(b) * 100) - Math.round(w(a) * 100) || turn.get(a)! - turn.get(b)! || w(b) - w(a) || a.page - b.page);
  const start = (query.page - 1) * PAGE_SIZE;
  return {
    total: matched.length,
    page: query.page,
    pageSize: PAGE_SIZE,
    pages: Math.min(MAX_RESULT_PAGES, Math.ceil(matched.length / PAGE_SIZE)),
    maxPages: MAX_RESULT_PAGES,
    rows: matched.slice(start, start + PAGE_SIZE).map(({ decade: _d, search: _s, ...row }) => row),
    facets,
    books,
    read: rows.filter((r) => r.read).length,
  };
}

export function linesETag(store: Store, query: LinesQuery) {
  const key = JSON.stringify([lineIndex(store).stamp, query]);
  return `W/"${createHash("sha1").update(`lines1|${key}`).digest("base64url")}"`;
}
