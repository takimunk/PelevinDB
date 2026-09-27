// One shared page-preview tooltip for every chart on the book page that maps to a page:
// page number and position, the hovered metric, and the page's first sentence (from the text already loaded:
// corpus excerpts or your own book's segments; never fetched on hover).
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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

type Tip = { x: number; y: number; index: number; metric?: ReactNode } | null;
let tip: Tip = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

type Scope = { segments: Segment[]; offset: number };
const ScopeContext = createContext<Scope>({ segments: [], offset: 0 });

/** Provides the book's segments (global page order) to the tooltip and every chart below. */
export function PreviewProvider({ segments, children }: { segments: Segment[]; children: ReactNode }) {
  const value = useMemo(() => ({ segments, offset: 0 }), [segments]);
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
  const value = useMemo(() => ({ segments: outer.segments, offset }), [outer.segments, offset]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/** Show the preview for a page (index local to the chart's slice) at the pointer, or hide it. */
export function usePreview() {
  const { offset } = useContext(ScopeContext);
  return useMemo(
    () => ({
      show(e: { clientX: number; clientY: number }, index: number, metric?: ReactNode) {
        tip = { x: e.clientX, y: e.clientY, index: offset + index, metric };
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
  const { segments } = useContext(ScopeContext);
  const current = useSyncExternalStore(
    subscribe,
    () => tip,
    () => null,
  );
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
  const sentence = previewSentence(segments[current.index].text);
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
      {sentence && <p className="page-tip-text">{sentence}</p>}
    </div>
  );
}
