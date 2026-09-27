// One shared page-preview tooltip for every chart on the book page that maps to a page:
// page number and position, the hovered metric, and a sentence. For a corpus book with sentence analysis the sentence
// is the one that carries the hovered dimension most (GET /api/corpus/:id/peek/:n, one sentence, fetched once the
// pointer rests and cached); until then, and for your own books, the page's first sentence from the loaded text.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { FOCUS, type FocusId } from "../../../shared/catalog.ts";
import type { Segment } from "../../domain/text.ts";
import { useLang } from "../../i18n/index.ts";
import { pageRef, pct } from "./i18n.ts";

const MAX = 140;

/** The page's first whole sentence (a fragment the page opens mid-sentence with is skipped), cut to ~140 chars at a word. */
export function previewSentence(page: string): string {
  const clean = page.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = [...clean.matchAll(/[^.!?…]+[.!?…]+["»”)]*/gu)].map((m) => m[0].trim());
  const opensMid = !/^[\p{Lu}«"“—–(0-9-]/u.test(clean);
  const pick = sentences.find((s, i) => !(i === 0 && opensMid) && s.length >= 12) ?? (opensMid && sentences.length > 1 ? sentences[1] : clean);
  if (pick.length <= MAX) return pick;
  const window = pick.slice(0, MAX - 1);
  const word = window.lastIndexOf(" ");
  return `${(word > MAX * 0.5 ? window.slice(0, word) : window).replace(/[\s,;:—–-]+$/u, "")}…`;
}

type Tip = { x: number; y: number; index: number; metric?: ReactNode; dim?: FocusId | null } | null;
let tip: Tip = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Scope = { segments: Segment[]; offset: number; bookId: string | null };
const ScopeContext = createContext<Scope>({ segments: [], offset: 0, bookId: null });

// ───────── Peak sentences, fetched one at a time ─────────

/** A chart's own id (an emotion, a texture) as a focus dimension, when there is one. */
export const asFocus = (id: string): FocusId | null => (FOCUS.some((f) => f.id === id) ? (id as FocusId) : null);

/** The focus dimension of each extreme-page moment (src/domain/analysis.ts `moments`); "still" has none. */
export const MOMENT_FOCUS: Record<string, FocusId | null> = { climax: "tension", still: null, light: "light", dark: "dark", wonder: "surprise", inner: "interiority" };

const PEEK_CACHE = 600;
/** A page's peak sentence and the dimension it was chosen by (the leading emotion when the asked one has none). */
export type Peek = { text: string | null; dim: FocusId | null };
const peeks = new Map<string, Peek>();
const inflight = new Map<string, Promise<Peek | null>>();

const peekKey = (bookId: string, page: number, dim: FocusId | null | undefined) => `${bookId}#${page}#${dim ?? ""}`;

/** The sentence of a corpus page (1-based) that carries `dim` most; null if the request failed. Cached per page and dimension. */
export function loadPeek(bookId: string, page: number, dim?: FocusId | null): Promise<Peek | null> {
  const key = peekKey(bookId, page, dim);
  if (peeks.has(key)) return Promise.resolve(peeks.get(key)!);
  let p = inflight.get(key);
  if (!p) {
    // Only a real answer is cached: a failed or rate-limited request may be asked again on the next hover.
    p = fetch(`/api/corpus/${encodeURIComponent(bookId)}/peek/${page}${dim ? `?dim=${dim}` : ""}`)
      .then(async (r) => {
        if (!r.ok) return null;
        const body = (await r.json()) as Partial<Peek>;
        const peek: Peek = { text: body.text ?? null, dim: body.dim ?? null };
        peeks.set(key, peek);
        for (const old of peeks.keys()) if (peeks.size > PEEK_CACHE) peeks.delete(old);
        return peek;
      })
      .catch(() => null)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** A page's peak sentence for `dim` (or its leading emotion), or null while loading or when there is none. */
export function usePeek(bookId: string | null, page: number | null, dim?: FocusId | null) {
  const key = bookId && page != null ? peekKey(bookId, page, dim) : null;
  const [state, setState] = useState<{ key: string; text: string | null } | null>(null);
  useEffect(() => {
    if (!key || !bookId || page == null) return;
    let alive = true;
    void loadPeek(bookId, page, dim).then((p) => alive && setState({ key, text: p?.text ?? null }));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!key) return null;
  return peeks.has(key) ? peeks.get(key)!.text : state?.key === key ? state.text : null;
}

/** The page (global index) and dimension the preview shows right now, if it is open. */
export const currentTip = () => (tip ? { index: tip.index, dim: tip.dim ?? null } : null);

/**
 * The reader highlight that shows the same sentence as the preview of `page` (0-based) for `dim`: the dimension the
 * server actually quoted by, or none when it quoted nothing. Waits for the answer (usually cached from the hover).
 */
export async function previewLens(bookId: string, page: number, dim: FocusId | null | undefined): Promise<FocusId | null> {
  const peek = await loadPeek(bookId, page + 1, dim);
  return peek ? (peek.text ? peek.dim : null) : (dim ?? null);
}

/** A quote that becomes the page's peak sentence for `dim` once it arrives; `fallback` until then or without one. */
export function PeakQuote({ bookId, page, dim, fallback }: { bookId: string | null; page: number; dim?: FocusId | null; fallback: string }) {
  const peak = usePeek(bookId, page, dim);
  return <q>{peak ?? fallback}</q>;
}

/** Provides the book's segments (global page order) to the tooltip and every chart below. `bookId`: a corpus book. */
export function PreviewProvider({ segments, bookId = null, children }: { segments: Segment[]; bookId?: string | null; children: ReactNode }) {
  const value = useMemo(() => ({ segments, offset: 0, bookId }), [segments, bookId]);
  return (
    <ScopeContext.Provider value={value}>
      {children}
      <PageTooltip />
    </ScopeContext.Provider>
  );
}

/** Charts below see page indices relative to a slice of the book that starts at `offset`. */
export function PreviewOffset({ offset, children }: { offset: number; children: ReactNode }) {
  const outer = useContext(ScopeContext);
  const value = useMemo(() => ({ ...outer, offset }), [outer, offset]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** Show the preview for a page (index local to the chart's slice) at the pointer, or hide it. */
export function usePreview() {
  const { offset } = useContext(ScopeContext);
  return useMemo(
    () => ({
      /** `dim`: the dimension the pointer is on, so the preview quotes the sentence that carries it. */
      show(e: { clientX: number; clientY: number }, index: number, metric?: ReactNode, dim?: FocusId | null) {
        tip = { x: e.clientX, y: e.clientY, index: offset + index, metric, dim };
        emit();
      },
      hide() {
        if (!tip) return;
        tip = null;
        emit();
      },
    }),
    [offset],
  );
}

function PageTooltip() {
  const lang = useLang();
  const { segments, bookId } = useContext(ScopeContext);
  const current = useSyncExternalStore(
    subscribe,
    () => tip,
    () => null,
  );
  // Ask for the peak sentence only once the pointer rests on a page and dimension for a moment.
  const key = bookId && current ? peekKey(bookId, current.index + 1, current.dim) : null;
  const [tried, setTried] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !bookId || !current || peeks.has(key)) return;
    const page = current.index + 1;
    const dim = current.dim;
    const timer = setTimeout(() => void loadPeek(bookId, page, dim).then(() => setTried(key)), 120);
    return () => clearTimeout(timer);
  }, [key]);
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState({ x: false, y: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !current) return;
    const r = el.getBoundingClientRect();
    setFlip({ x: current.x + 16 + r.width > innerWidth - 8, y: current.y + 18 + r.height > innerHeight - 8 });
  }, [current]);
  // Hide when the page scrolls under a still pointer.
  useLayoutEffect(() => {
    const hide = () => tip && ((tip = null), emit());
    addEventListener("scroll", hide, { passive: true });
    return () => removeEventListener("scroll", hide);
  }, []);
  if (!current || !segments[current.index]) return null;
  const n = segments.length;
  const fallback = previewSentence(segments[current.index].text);
  // undefined: not fetched yet (the first sentence shows, faded); null: Jev names no sentence (the first sentence shows).
  const peak = key != null && peeks.has(key) ? peeks.get(key)!.text : undefined;
  const sentence = peak ?? fallback;
  const pending = key != null && peak === undefined && tried !== key;
  return (
    <div
      ref={ref}
      className="page-tip"
      role="tooltip"
      style={{
        left: flip.x ? current.x - 16 : current.x + 16,
        top: flip.y ? current.y - 14 : current.y + 18,
        transform: `translate(${flip.x ? "-100%" : "0"}, ${flip.y ? "-100%" : "0"})`,
      }}
    >
      <p className="page-tip-meta num">
        {pageRef(lang, current.index + 1)} · {pct(lang, current.index / Math.max(1, n - 1))}
        {current.metric != null && <span className="page-tip-metric"> · {current.metric}</span>}
      </p>
      {sentence && <p className={`page-tip-text ${pending ? "pending" : ""}`}>{sentence}</p>}
    </div>
  );
}
