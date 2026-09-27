import { useEffect, useMemo, useState } from "react";
import type { BookLine, CorpusBook, CorpusEntry, CorpusStats, PageSentences } from "../../shared/types.ts";
import { fingerprintFrom, type Fingerprint } from "../domain/fingerprint.ts";
import { useAtlas } from "./atlas.ts";
import type { Segment } from "../domain/text.ts";
import { api } from "../services/api.ts";
import type { BookContent, BookMeta } from "./library.ts";

/** Read-only repository for the server-side canon; nothing here is written to IndexedDB. */
export type CorpusList = { available: boolean; books: CorpusEntry[] };
/** `excerpt`: the server sent a short opening per page instead of the copyrighted text (see CorpusBook). */
/** `lines`: the book's strongest sentences (most quotable, funniest, most abstract), once sentence analysis has run. */
export type CorpusExtra = { excerpt: boolean; year: number | null; kind: CorpusEntry["kind"] | null; titleEn: string | null; lines: BookLine[] };
export type CorpusView = { meta: BookMeta; content: BookContent; segments: Segment[]; rank: number | null } & CorpusExtra;

const MAX_CACHED = 3;
const EMPTY: CorpusList = { available: false, books: [] };
const NO_SEGMENTS: Segment[] = [];
const NO_LINES: BookLine[] = [];

let list: Promise<CorpusList> | null = null;

export function loadCorpusList() {
  list ??= api.corpus().catch(() => {
    list = null;
    return EMPTY;
  });
  return list;
}

export function useCorpusList() {
  const [value, setValue] = useState<CorpusList | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCorpusList().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

export type CanonRow = CorpusEntry & { fingerprint?: Fingerprint };

/** The canon list joined with the fingerprints `npm run corpus` exported to the atlas. */
export function useCanonShelf() {
  const list = useCorpusList();
  const atlas = useAtlas();
  const rows = useMemo<CanonRow[] | null>(() => {
    if (!list) return null;
    const prints = new Map(atlas.map((a) => [a.id, a.fingerprint]));
    return list.books.map((b) => ({ ...b, fingerprint: prints.get(b.id) }));
  }, [list, atlas]);
  return { available: list?.available ?? null, rows };
}

let stats: Promise<CorpusStats | null> | null = null;

/** `null` once loaded means there is no corpus on the server. */
export function useCorpusStats() {
  const [value, setValue] = useState<CorpusStats | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    stats ??= api.corpusStats().catch(() => {
      stats = null;
      return null;
    });
    void stats.then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

/** Uses the stored page boundaries, never re-paginates: every answer belongs to exactly the text Jev was given. */
function toView(book: CorpusBook): CorpusView {
  const full = typeof book.text === "string";
  const segments = book.segments.map(([start, end], i) => ({ id: i + 1, start, end, text: full ? book.text!.slice(start, end) : (book.excerpts?.[i] ?? "") }));
  const profile = book.profile ?? undefined;
  const meta: BookMeta = {
    id: book.id,
    title: book.title,
    author: book.author,
    format: "TXT",
    source: "gutenberg",
    sourceRef: book.gutenberg ?? undefined,
    addedAt: 0,
    openedAt: 0,
    chars: book.chars,
    pages: segments.length,
    analyzed: book.analyses.filter(Boolean).length,
    fingerprint: fingerprintFrom(segments, book.analyses, profile),
  };
  return {
    meta,
    content: { id: book.id, text: book.text ?? "", analyses: book.analyses, profile, briefs: book.briefs ?? (book.brief ? { en: book.brief } : {}), brief: book.brief ?? undefined },
    segments,
    rank: book.rank,
    excerpt: !full,
    year: book.year ?? null,
    kind: book.kind ?? null,
    titleEn: book.titleEn ?? null,
    lines: book.lines ?? NO_LINES,
  };
}

const cache = new Map<string, Promise<CorpusView>>();

export function loadCorpusBook(id: string) {
  let view = cache.get(id);
  if (view) cache.delete(id);
  else {
    view = api.corpusBook(id).then(toView);
    view.catch(() => cache.delete(id));
  }
  cache.set(id, view);
  for (const old of cache.keys()) if (cache.size > MAX_CACHED) cache.delete(old);
  return view;
}

/** Same shape as `useBook` so BookPage renders canon and library books through one code path. */
export function useCorpusBook(id: string | null) {
  const [state, setState] = useState<{ id: string; view?: CorpusView; missing?: boolean } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ id });
    loadCorpusBook(id).then(
      (view) => alive && setState({ id, view }),
      () => alive && setState({ id, missing: true }),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  const current = state?.id === id ? state : null;
  const view = current?.view;
  return {
    meta: view?.meta,
    content: view?.content,
    segments: view?.segments ?? NO_SEGMENTS,
    rank: view?.rank ?? null,
    missing: !!current?.missing,
    excerpt: view?.excerpt ?? false,
    year: view?.year ?? null,
    kind: view?.kind ?? null,
    titleEn: view?.titleEn ?? null,
    lines: view?.lines ?? NO_LINES,
  };
}

/** One page of a corpus book with its full text and sentences; the book payload itself carries only excerpts. */
export type CorpusPageText = { page: number; text: string; start: number; end: number; sentences?: PageSentences | null };

const PAGE_CACHE = 12;
const pages = new Map<string, Promise<CorpusPageText>>();

/** Fetches a single page (1-based) on demand; a small cache keeps back-and-forth reading instant. */
export function loadCorpusPage(id: string, page: number) {
  const key = `${id}#${page}`;
  let p = pages.get(key);
  if (p) pages.delete(key);
  else {
    p = fetch(`/api/corpus/${encodeURIComponent(id)}/page/${page}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
      return (await r.json()) as CorpusPageText;
    });
    p.catch(() => pages.delete(key));
  }
  pages.set(key, p);
  for (const old of pages.keys()) if (pages.size > PAGE_CACHE) pages.delete(old);
  return p;
}

/**
 * Full text of the open page of a corpus book, fetched only while `enabled` (the reader is open on an
 * excerpt-only book). Neighbouring pages are prefetched so paging feels immediate; never the whole book.
 */
export function useCorpusPage(id: string, page: number | null, total: number, enabled: boolean) {
  const [state, setState] = useState<{ key: string; text?: string; sentences?: PageSentences | null; error?: string } | null>(null);
  const key = `${id}#${page}`;
  useEffect(() => {
    if (!enabled || page == null) return;
    let alive = true;
    setState((s) => (s?.key === key ? s : { key }));
    loadCorpusPage(id, page).then(
      (p) => alive && setState({ key, text: p.text, sentences: p.sentences ?? null }),
      (e: Error) => alive && setState({ key, error: e.message }),
    );
    const prefetch = setTimeout(() => {
      for (const n of [page + 1, page - 1]) if (n >= 1 && n <= total) void loadCorpusPage(id, n).catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(prefetch);
    };
  }, [id, page, total, enabled, key]);
  const current = state?.key === key ? state : null;
  return {
    text: current?.text ?? null,
    sentences: current?.sentences ?? null,
    loading: enabled && page != null && !current?.text && !current?.error,
    error: current?.error ?? null,
  };
}
