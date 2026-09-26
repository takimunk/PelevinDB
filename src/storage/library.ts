import { useEffect, useState, useSyncExternalStore } from "react";
import type { BookBrief, BookProfile, SegmentAnalysis } from "../../shared/types.ts";
import type { Analyses } from "../domain/analysis.ts";
import { fingerprintFrom, type Fingerprint } from "../domain/fingerprint.ts";
import { segmentText, type Segment } from "../domain/text.ts";
import type { ImportedBook } from "../io/import.ts";
import { db } from "./db.ts";

export type BookSource = "upload" | "gutenberg";

export type BookMeta = {
  id: string;
  title: string;
  author: string;
  format: string;
  source: BookSource;
  sourceRef?: string;
  addedAt: number;
  openedAt: number;
  chars: number;
  pages: number;
  analyzed: number;
  fingerprint?: Fingerprint;
};

export type BookContent = {
  id: string;
  text: string;
  analyses: Analyses;
  profile?: BookProfile;
  brief?: BookBrief;
};

let books: BookMeta[] = [];
let ready = false;
let initializing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const contents = new Map<string, BookContent>();
const segmentCache = new Map<string, Segment[]>();
const dirty = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());
const sorted = (list: BookMeta[]) => [...list].sort((a, b) => b.openedAt - a.openedAt);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initLibrary() {
  initializing ??= (async () => {
    books = sorted(await db.all<BookMeta>("books"));
    // Older versions seeded a sample book with synthetic scores.
    for (const stale of books.filter((b) => (b as { demo?: boolean }).demo)) await removeBook(stale.id);
    ready = true;
    emit();
  })();
  return initializing;
}

let snapshot = { books, ready };
function getSnapshot() {
  if (snapshot.books !== books || snapshot.ready !== ready) snapshot = { books, ready };
  return snapshot;
}

export const getBooks = () => books;

export function useLibrary() {
  useEffect(() => void initLibrary(), []);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function segmentsOf(id: string, text: string) {
  let segments = segmentCache.get(id);
  if (!segments) {
    segments = segmentText(text, "pages");
    segmentCache.set(id, segments);
  }
  return segments;
}

const newId = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12);

export async function addBook(book: ImportedBook, source: BookSource, sourceRef?: string) {
  const existing = sourceRef && books.find((b) => b.source === source && b.sourceRef === sourceRef);
  if (existing) return existing.id;
  const id = newId();
  const segments = segmentsOf(id, book.text);
  const analyses: Analyses = new Array(segments.length).fill(null);
  const now = Date.now();
  const meta: BookMeta = {
    id,
    title: book.title || "Untitled",
    author: book.author || "Unknown author",
    format: book.format,
    source,
    sourceRef,
    addedAt: now,
    openedAt: now,
    chars: book.text.length,
    pages: segments.length,
    analyzed: 0,
  };
  const content: BookContent = { id, text: book.text, analyses };
  await db.put("content", content);
  await db.put("books", meta);
  contents.set(id, content);
  books = sorted([...books.filter((b) => b.id !== id), meta]);
  emit();
  return id;
}

export async function removeBook(id: string) {
  await db.delete("books", id);
  await db.delete("content", id);
  contents.delete(id);
  segmentCache.delete(id);
  books = books.filter((b) => b.id !== id);
  emit();
}

export async function loadContent(id: string) {
  const cached = contents.get(id);
  if (cached) return cached;
  await initLibrary();
  const content = contents.get(id) ?? (await db.get<BookContent>("content", id));
  if (!content) return content;
  contents.set(id, content);
  return content;
}

function patchMeta(id: string, patch: Partial<BookMeta>) {
  books = books.map((b) => (b.id === id ? { ...b, ...patch } : b));
  if (patch.openedAt) books = sorted(books);
  emit();
}

export function touchBook(id: string) {
  const meta = books.find((b) => b.id === id);
  if (!meta) return;
  patchMeta(id, { openedAt: Date.now() });
  void db.put("books", books.find((b) => b.id === id));
}

function scheduleFlush() {
  flushTimer ??= setTimeout(() => void flush(), 1200);
}

/** Recomputes the fingerprint and persists changed books in one batch. */
export async function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const content = contents.get(id);
    const meta = books.find((b) => b.id === id);
    if (!content || !meta) continue;
    const segments = segmentsOf(id, content.text);
    const analyzed = content.analyses.filter(Boolean).length;
    patchMeta(id, { analyzed, fingerprint: fingerprintFrom(segments, content.analyses, content.profile) });
    await db.put("content", content);
    await db.put("books", books.find((b) => b.id === id));
  }
}

const contentListeners = new Map<string, Set<() => void>>();
function emitContent(id: string) {
  contentListeners.get(id)?.forEach((l) => l());
}

export function setAnalysis(id: string, index: number, analysis: SegmentAnalysis) {
  const content = contents.get(id);
  if (!content) return;
  const analyses = content.analyses.slice();
  analyses[index] = analysis;
  contents.set(id, { ...content, analyses });
  dirty.add(id);
  scheduleFlush();
  emitContent(id);
}

export function setProfile(id: string, profile: BookProfile) {
  const content = contents.get(id);
  if (!content) return;
  contents.set(id, { ...content, profile });
  dirty.add(id);
  void flush();
  emitContent(id);
}

export function setBrief(id: string, brief: BookBrief) {
  const content = contents.get(id);
  if (!content) return;
  contents.set(id, { ...content, brief });
  void db.put("content", contents.get(id));
  emitContent(id);
}

/** Loads a book and re-renders on every new Jev answer. `null` keeps the hook idle. */
export function useBook(id: string | null) {
  const { books: list, ready: libraryReady } = useLibrary();
  const meta = list.find((b) => b.id === id);
  const [content, setContent] = useState<BookContent | undefined>(() => (id ? contents.get(id) : undefined));
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setMissing(false);
    setContent(contents.get(id));
    void loadContent(id).then((c) => {
      if (!alive) return;
      if (c) setContent(c);
      else setMissing(true);
    });
    const listener = () => setContent(contents.get(id));
    const set = contentListeners.get(id) ?? new Set();
    set.add(listener);
    contentListeners.set(id, set);
    return () => {
      alive = false;
      set.delete(listener);
    };
  }, [id]);
  const segments = id && content ? segmentsOf(id, content.text) : [];
  return { meta, content, segments, missing: missing || (libraryReady && !meta) };
}
