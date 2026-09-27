// Read-only view of the canon analysed by scripts/analyze-corpus.ts, shaped for the browser.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { FOCUS_RUBRIC, RUBRIC_VERSION } from "../shared/catalog.ts";
import { BOOK_KINDS, type BookKind, type CorpusBook, type CorpusEntry, type PageSentences } from "../shared/types.ts";
import { bookLines, pageSentences } from "./sentences.ts";
import { DEFAULT_DB, openStore, type Store } from "./store.ts";
import { corpusId, pageNumber } from "./validate.ts";

const PAYLOAD_VERSION = 4;

/** Every stored answer a book payload or a page depends on: pages, focus and single sentences. */
const answersStamp = (store: Store, id: string) => {
  const stamp = store.stamp(id, RUBRIC_VERSION);
  return stamp == null ? null : `${stamp}|${store.stamp(id, FOCUS_RUBRIC)}|${store.sentenceStamp(id)}`;
};
/** Longest per-page excerpt the public site sends instead of the text. */
export const EXCERPT_CHARS = 220;

/**
 * The corpus is copyrighted, so by default the API never sends a book's text: each page travels as a short
 * excerpt cut at a sentence or word boundary. `CORPUS_FULL_TEXT=1` restores the full text for private use.
 */
export const fullTextEnabled = (env: NodeJS.ProcessEnv = process.env) => env.CORPUS_FULL_TEXT === "1";

/** At most `max` characters from the start of a page, ending on a sentence if one fits, otherwise on a word, with an ellipsis. */
export function pageExcerpt(page: string, max = EXCERPT_CHARS): string {
  const clean = page.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max);
  let sentence = -1;
  for (const m of window.matchAll(/[.!?…](?:["»”)]*)(?=\s)/gu)) sentence = m.index! + m[0].length;
  if (sentence >= max * 0.45) return window.slice(0, sentence);
  const word = window.slice(0, max - 1).lastIndexOf(" ");
  const cut = (word >= max * 0.5 ? window.slice(0, word) : window.slice(0, max - 1)).replace(/[\s,;:—–-]+$/u, "");
  return `${cut}…`;
}

/** Metadata the Pelevin store may add (year, kind, English title); read defensively until every store has it. */
function extra(book: object) {
  const b = book as { year?: unknown; kind?: unknown; titleEn?: unknown; title_en?: unknown };
  const year = typeof b.year === "number" && Number.isFinite(b.year) ? b.year : typeof b.year === "string" && /^\d{4}$/.test(b.year) ? Number(b.year) : null;
  const kind = typeof b.kind === "string" && (BOOK_KINDS as readonly string[]).includes(b.kind) ? (b.kind as BookKind) : null;
  const en = b.titleEn ?? b.title_en;
  const titleEn = typeof en === "string" && en.trim() ? en.trim() : null;
  return { ...(year != null && { year }), ...(kind && { kind }), ...(titleEn && { titleEn }) };
}
const PACKED_BOOKS = 6;

let store: Store | null = null;
let failed = false;

/** Opens the store once, on first use. No file means no corpus yet, which is not an error. */
export function corpusStore(path = process.env.XBOOK_DB || DEFAULT_DB): Store | null {
  if (store || failed || !existsSync(path)) return store;
  try {
    store = openStore(path, { readOnly: true });
  } catch (error) {
    failed = true;
    console.warn(`corpus unavailable: ${error instanceof Error ? error.message : error}`);
  }
  return store;
}

export function corpusList(store: Store): CorpusEntry[] {
  return store.progress(RUBRIC_VERSION).map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    rank: b.rank,
    gutenberg: b.source === "gutenberg" ? b.sourceRef : null,
    pages: b.pages,
    chars: b.chars,
    analysed: b.analysed,
    complete: b.analysed === b.pages,
    briefed: b.briefed,
    briefedLangs: b.briefedLangs,
    ...extra(b),
  }));
}

export function corpusETag(store: Store, id: string, full = fullTextEnabled()): string | null {
  const stamp = answersStamp(store, id);
  if (stamp == null) return null;
  return `W/"${createHash("sha1")
    .update(`${PAYLOAD_VERSION}|${full ? "full" : "excerpt"}|${RUBRIC_VERSION}|${id}|${stamp}`)
    .digest("base64url")}"`;
}

/** The stored book for the browser: excerpts per page by default, the whole text only when `full`. */
export function corpusBook(store: Store, id: string, full = fullTextEnabled()): CorpusBook | null {
  const book = store.book(id);
  const text = store.text(id);
  if (!book || text == null) return null;
  const segments = store.segments(id);
  const analyses = store.analyses(id, RUBRIC_VERSION);
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    rank: book.rank,
    gutenberg: book.source === "gutenberg" ? book.sourceRef : null,
    pages: book.pages,
    chars: book.chars,
    ...extra(book),
    ...(full ? { text } : { text: null, excerpts: segments.map((s) => pageExcerpt(text.slice(s.start, s.end))) }),
    segments: segments.map((s) => [s.start, s.end]),
    analyses: segments.map((s) => analyses.get(s.idx) ?? null),
    profile: store.profile(id, RUBRIC_VERSION),
    briefs: store.briefs(id),
    brief: store.brief(id, "en"),
    lines: bookLines(store, id),
  };
}

/** GET /api/corpus/:id/page/:n: the full text of exactly one page (1-based), never more, and its sentences. */
export type CorpusPage = { page: number; text: string; start: number; end: number; sentences: PageSentences | null };

export function corpusPage(store: Store, id: string, page: number): CorpusPage | null {
  if (!Number.isInteger(page) || page < 1) return null;
  const segment = store.segments(id)[page - 1];
  if (!segment) return null;
  const text = store.text(id);
  if (text == null) return null;
  return { page, text: text.slice(segment.start, segment.end), start: segment.start, end: segment.end, sentences: pageSentences(store, id, segment.idx, segment.start) };
}

export function corpusPageETag(store: Store, id: string, page: number): string | null {
  const stamp = answersStamp(store, id);
  if (stamp == null) return null;
  return `W/"${createHash("sha1").update(`page|${id}|${page}|${stamp}`).digest("base64url")}"`;
}

/** A fixed-window limit per client, so one-page reading cannot turn into downloading whole books. */
export function rateLimiter(limit = 60, windowMs = 60_000, now = () => Date.now()) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string): { ok: true } | { ok: false; retryAfter: number } => {
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    let entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) hits.set(key, (entry = { start: t, count: 0 }));
    if (++entry.count > limit) return { ok: false, retryAfter: Math.ceil((entry.start + windowMs - t) / 1000) };
    return { ok: true };
  };
}

export type PageResponse = { status: 200; body: CorpusPage; etag: string } | { status: 400 | 404 | 429; body: { error: string }; retryAfter?: number };

/** Everything GET /api/corpus/:id/page/:n decides, without Express, so it can be tested directly. */
export function pageResponse(store: Store | null, rawId: unknown, rawPage: unknown, allow: () => { ok: true } | { ok: false; retryAfter: number }): PageResponse {
  const id = corpusId(rawId);
  if ("error" in id) return { status: 400, body: { error: id.error } };
  const n = pageNumber(rawPage);
  if ("error" in n) return { status: 400, body: { error: n.error } };
  const limit = allow();
  if (!limit.ok) return { status: 429, body: { error: "Too many pages at once. Try again in a minute." }, retryAfter: limit.retryAfter };
  if (!store) return { status: 404, body: { error: "No corpus yet: run npm run corpus." } };
  const etag = corpusPageETag(store, id.value, n.value);
  const page = etag ? corpusPage(store, id.value, n.value) : null;
  if (!etag || !page) return { status: 404, body: { error: "This page is not in the corpus." } };
  return { status: 200, body: page, etag };
}

export type Encoding = "br" | "gzip" | "identity";

const compress: Record<Encoding, (body: Buffer) => Promise<Buffer>> = {
  br: (body) => promisify(brotliCompress)(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } }),
  gzip: (body) => promisify(gzip)(body),
  identity: async (body) => body,
};

const packed = new Map<string, Promise<Buffer>>();

/** A War and Peace payload is ~5.5 MB of JSON, so encoded bodies are kept per ETag and built off the event loop. */
export function packCorpusBook(store: Store, id: string, etag: string, encoding: Encoding, full = fullTextEnabled()): Promise<Buffer> | null {
  const key = `${etag}:${encoding}`;
  let body = packed.get(key);
  if (!body) {
    const book = corpusBook(store, id, full);
    if (!book) return null;
    body = compress[encoding](Buffer.from(JSON.stringify(book)));
    body.catch(() => packed.delete(key));
    packed.set(key, body);
    for (const old of packed.keys()) if (packed.size > PACKED_BOOKS) packed.delete(old);
  } else {
    packed.delete(key);
    packed.set(key, body);
  }
  return body;
}
