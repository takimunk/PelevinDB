// Read-only view of the canon analysed by scripts/analyze-corpus.ts, shaped for the browser.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { RUBRIC_VERSION } from "../shared/catalog.ts";
import type { CorpusBook, CorpusEntry } from "../shared/types.ts";
import { DEFAULT_DB, openStore, type Store } from "./store.ts";

const PAYLOAD_VERSION = 1;
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
  }));
}

export function corpusETag(store: Store, id: string): string | null {
  const stamp = store.stamp(id, RUBRIC_VERSION);
  if (stamp == null) return null;
  return `W/"${createHash("sha1").update(`${PAYLOAD_VERSION}|${RUBRIC_VERSION}|${id}|${stamp}`).digest("base64url")}"`;
}

export function corpusBook(store: Store, id: string): CorpusBook | null {
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
    text,
    segments: segments.map((s) => [s.start, s.end]),
    analyses: segments.map((s) => analyses.get(s.idx) ?? null),
    profile: store.profile(id, RUBRIC_VERSION),
    brief: store.brief(id),
  };
}

export type Encoding = "br" | "gzip" | "identity";

const compress: Record<Encoding, (body: Buffer) => Promise<Buffer>> = {
  br: (body) => promisify(brotliCompress)(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } }),
  gzip: (body) => promisify(gzip)(body),
  identity: async (body) => body,
};

const packed = new Map<string, Promise<Buffer>>();

/** A War and Peace payload is ~5.5 MB of JSON, so encoded bodies are kept per ETag and built off the event loop. */
export function packCorpusBook(store: Store, id: string, etag: string, encoding: Encoding): Promise<Buffer> | null {
  const key = `${etag}:${encoding}`;
  let body = packed.get(key);
  if (!body) {
    const book = corpusBook(store, id);
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
