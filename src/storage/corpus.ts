import { useEffect, useMemo, useState } from "react";
import type { CorpusBook, CorpusEntry, CorpusStats } from "../../shared/types.ts";
import { fingerprintFrom, type Fingerprint } from "../domain/fingerprint.ts";
import { useAtlas } from "./atlas.ts";
import type { Segment } from "../domain/text.ts";
import { api } from "../services/api.ts";
import type { BookContent, BookMeta } from "./library.ts";

/** Read-only repository for the server-side canon; nothing here is written to IndexedDB. */
export type CorpusList = { available: boolean; books: CorpusEntry[] };
export type CorpusView = { meta: BookMeta; content: BookContent; segments: Segment[]; rank: number | null };

const MAX_CACHED = 3;
const EMPTY: CorpusList = { available: false, books: [] };
const NO_SEGMENTS: Segment[] = [];

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
  const segments = book.segments.map(([start, end], i) => ({ id: i + 1, start, end, text: book.text.slice(start, end) }));
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
  return { meta, content: { id: book.id, text: book.text, analyses: book.analyses, profile, brief: book.brief ?? undefined }, segments, rank: book.rank };
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
  return { meta: current?.view?.meta, content: current?.view?.content, segments: current?.view?.segments ?? NO_SEGMENTS, rank: current?.view?.rank ?? null, missing: !!current?.missing };
}
