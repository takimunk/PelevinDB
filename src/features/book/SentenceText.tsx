// The reader's page text split into its sentences. With no lens chosen ("all"), each dimension's peak sentence takes
// that dimension's colour. A lens narrows to one focus dimension: how much of the page's score each sentence carries
// (page score × the focus probability, relative to the page's peak sentence). Click a sentence to see its own
// sentence-level analysis, when it has one.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  FOCUS,
  labelOf,
  SENTENCE_ACTS,
  SENTENCE_EMOTIONS,
  SENTENCE_FLAGS,
  SENTENCE_SCALES,
  type FocusId,
} from "../../../shared/catalog.ts";
import type {
  PageSentences,
  SegmentAnalysis,
  SentenceRead,
} from "../../../shared/types.ts";
import { pageScore } from "../../../shared/focus.ts";
import { useLang, useT } from "../../i18n/index.ts";

const T = {
  en: {
    lens: "Highlight sentences",
    all: "all",
    peak: "peak",
    sentence: (n: number) => `Sentence ${n}`,
    reads: "On its own",
    none: "No sentence on this page carries it.",
    pending: "Sentence analysis has not reached this page yet.",
  },
  ru: {
    lens: "Подсветка предложений",
    all: "все",
    peak: "пик",
    sentence: (n: number) => `Предложение ${n}`,
    reads: "Отдельно",
    none: "На этой странице нет предложения, которое это несёт.",
    pending: "Разбор по предложениям до этой страницы ещё не дошёл.",
  },
};

const STORAGE = "pelevindb.reader.lens";
const readLens = (): FocusId | null => {
  try {
    const v = localStorage.getItem(STORAGE);
    return FOCUS.some((f) => f.id === v) ? (v as FocusId) : null;
  } catch {
    return null;
  }
};

const LENS_EVENT = "pelevindb:lens";

/** A pointed lens set before the reader opens: the reader flashes that sentence once it shows the page. */
let pointPending = false;

/**
 * Sets the reader's highlight (remembered for this viewer). `point`: also scroll to its sentence and flash it, as when
 * a chart, a quote or a line opens a page on the sentence it previewed.
 */
export function rememberLens(next: FocusId | null, { point = false } = {}) {
  try {
    if (next) localStorage.setItem(STORAGE, next);
    else localStorage.removeItem(STORAGE);
  } catch {
    /* storage is a convenience only */
  }
  if (point) pointPending = true;
  window.dispatchEvent(new CustomEvent(LENS_EVENT, { detail: { lens: next, point } }));
}

/** The reader's lens, and a counter that goes up each time something points at a sentence. */
export function useLens() {
  const [lens, setLens] = useState<FocusId | null>(readLens);
  const [pointed, setPointed] = useState(() => {
    const was = pointPending;
    pointPending = false;
    return was ? 1 : 0;
  });
  useEffect(() => {
    const on = (e: Event) => {
      const { lens: next, point } = (e as CustomEvent<{ lens: FocusId | null; point: boolean }>).detail;
      setLens(next);
      if (point) {
        pointPending = false;
        setPointed((n) => n + 1);
      }
    };
    window.addEventListener(LENS_EVENT, on);
    return () => window.removeEventListener(LENS_EVENT, on);
  }, []);
  return [lens, (next: FocusId | null) => rememberLens(next), pointed] as const;
}

export function LensBar({
  lens,
  onLens,
  disabled,
}: {
  lens: FocusId | null;
  onLens: (l: FocusId | null) => void;
  disabled?: boolean;
}) {
  const t = useT(T);
  const lang = useLang();
  return (
    <div className="reader-lens" role="radiogroup" aria-label={t.lens}>
      <span className="reader-lens-label">{t.lens}</span>
      <button
        role="radio"
        aria-checked={lens == null}
        className={lens == null ? "on" : ""}
        onClick={() => onLens(null)}
      >
        {t.all}
      </button>
      {FOCUS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={lens === f.id}
          className={lens === f.id ? "on" : ""}
          disabled={disabled}
          style={{ "--c": f.color } as CSSProperties}
          // Choosing the chosen lens again returns to every highlight.
          onClick={() => onLens(lens === f.id ? null : f.id)}
        >
          <i aria-hidden="true" />
          {labelOf(f, lang).toLowerCase()}
        </button>
      ))}
    </div>
  );
}

/** Per sentence 0–1: page score × focus probability ÷ the page's largest probability. */
export function lensWeights(
  sentences: PageSentences,
  analysis: SegmentAnalysis | null,
  lens: FocusId,
) {
  const p = sentences.focus?.focus[lens];
  if (!p?.length) return null;
  const max = Math.max(...p);
  if (!(max > (sentences.focus!.none[lens] ?? 0)))
    return { weights: p.map(() => 0), peak: -1 };
  const score = pageScore(analysis, lens);
  return { weights: p.map((v) => (score * v) / max), peak: p.indexOf(max) };
}

/**
 * The "all" view: per sentence, the dimension whose peak it is (when Jev names one over "none"), weighted by the page
 * score. A sentence that is the peak of several takes the one with the strongest page score; quotable, which has no
 * page score, only when no scored dimension claims the sentence.
 */
export function allPeaks(sentences: PageSentences, analysis: SegmentAnalysis | null) {
  const f = sentences.focus;
  if (!f) return null;
  const out: ({ ids: FocusId[]; id: FocusId; w: number } | null)[] = sentences.spans.map(() => null);
  for (const d of FOCUS) {
    const p = f.focus[d.id];
    if (!p?.length) continue;
    const max = Math.max(...p);
    if (!(max > (f.none[d.id] ?? 0))) continue;
    const i = p.indexOf(max);
    const w = d.source ? pageScore(analysis, d.id) : 0;
    const cur = out[i];
    if (!cur) out[i] = { ids: [d.id], id: d.id, w };
    else {
      cur.ids.push(d.id);
      if (w > cur.w) Object.assign(cur, { id: d.id, w });
    }
  }
  return out;
}

export function SentenceText({
  text,
  sentences,
  analysis,
  lens,
  jump = 0,
  point,
  display,
}: {
  text: string;
  sentences: PageSentences;
  /** Visible text per sentence index (a translation); highlights stay keyed by index, gaps come from `text`. */
  display?: string[];
  analysis: SegmentAnalysis | null;
  lens: FocusId | null;
  /** Bumped when the reader points at a dimension: scrolls to its peak sentence again and flashes it. */
  jump?: number;
  /** A sentence (0-based) to mark, scroll to and flash, as a link to one sentence asks. */
  point?: number;
}) {
  const t = useT(T);
  const lang = useLang();
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => setOpen(null), [text]);
  // Opening a page with a highlight on, or pointing at an emotion, brings the peak sentence into view; a pointed
  // sentence flashes once so the eye finds it.
  const flashed = useRef(0);
  useEffect(() => {
    const peak = root.current?.querySelector<HTMLElement>(".sent.peak");
    if (!peak) return;
    const fresh = jump !== flashed.current;
    flashed.current = jump;
    peak.scrollIntoView({ block: "center", behavior: fresh && jump ? "smooth" : "auto" });
    if (fresh && jump && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      peak.animate([{ outline: "2px solid var(--c)", outlineOffset: "3px" }, { outline: "2px solid transparent", outlineOffset: "3px" }], { duration: 1400, easing: "ease-out" });
  }, [text, lens, jump]);
  // A linked sentence wins over the lens peak: it runs after, so it has the last scroll.
  useEffect(() => {
    if (point == null) return;
    const el = root.current?.querySelectorAll<HTMLElement>(".sent")[point];
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      el.animate([{ outline: "2px solid var(--ink)", outlineOffset: "3px" }, { outline: "2px solid transparent", outlineOffset: "3px" }], { duration: 2200, easing: "ease-out" });
  }, [text, point]);
  const color = lens ? FOCUS.find((f) => f.id === lens)!.color : undefined;
  const lensed = lens ? lensWeights(sentences, analysis, lens) : null;
  const all = lens ? null : allPeaks(sentences, analysis);
  const parts: React.ReactNode[] = [];
  let at = 0;
  sentences.spans.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    const w = lensed?.weights[i] ?? 0;
    const read = sentences.read[i];
    const body = display?.[i] ?? text.slice(start, end);
    // With a lens, every sentence takes its share of the dimension. With all, each peak sentence takes its dimension's
    // colour (a floor keeps weak pages visible). A page without focus answers falls back to the sentences read on
    // their own: the tint is the sentence's leading emotion, its opacity the sentence's intensity.
    const peakOf = all?.[i];
    const style = lensed
      ? ({ "--w": Math.sqrt(w).toFixed(3), "--c": color } as CSSProperties)
      : all
        ? peakOf
          ? ({ "--w": (0.35 + 0.65 * Math.sqrt(peakOf.w)).toFixed(3), "--c": FOCUS.find((f) => f.id === peakOf.id)!.color } as CSSProperties)
          : undefined
        : read
        ? ({
            "--w": (0.12 + 0.88 * read.scales.arousal).toFixed(3),
            "--c": SENTENCE_EMOTIONS.find((e) => e.id === read.emotion)!.color,
          } as CSSProperties)
        : undefined;
    const peak = `${lensed && i === lensed.peak ? "peak" : ""} ${peakOf ? "tinted" : ""} ${point === i ? "pointed" : ""}`;
    const title = peakOf ? peakOf.ids.map((id) => labelOf(FOCUS.find((f) => f.id === id)!, lang).toLowerCase()).join(" · ") : undefined;
    if (!read) {
      parts.push(
        <span key={i} className={`sent ${peak}`} style={style} title={title}>
          {body}
        </span>,
      );
      at = end;
      return;
    }
    const toggle = () => setOpen(open === i ? null : i);
    parts.push(
      <span
        key={i}
        className={`sent read ${peak} ${open === i ? "open" : ""}`}
        style={style}
        title={title}
        role="button"
        tabIndex={0}
        aria-expanded={open === i}
        aria-label={t.sentence(i + 1)}
        onClick={toggle}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())
        }
      >
        {body}
      </span>,
    );
    if (open === i)
      parts.push(
        <SentenceCard
          key={`card-${i}`}
          n={i}
          read={read}
          sentences={sentences}
          lens={lens}
          weight={lensed?.weights[i] ?? null}
        />,
      );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));

  return (
    <>
      {lens && !sentences.focus && (
        <span className="reader-lens-note">{t.pending}</span>
      )}
      {lens && lensed && lensed.peak < 0 && (
        <span className="reader-lens-note">{t.none}</span>
      )}
      <span ref={root} className={`sent-text ${lensed ? "lensed" : all ? "all" : "felt"}`}>
        {parts}
      </span>
    </>
  );
}

function SentenceCard({
  n,
  read,
  sentences,
  lens,
  weight,
}: {
  n: number;
  read: SentenceRead;
  sentences: PageSentences;
  lens: FocusId | null;
  weight: number | null;
}) {
  const t = useT(T);
  const lang = useLang();
  const top = sentences.focus
    ? FOCUS.map((f) => ({
        f,
        p:
          sentences.focus!.focus[f.id][n] /
          Math.max(1e-9, ...sentences.focus!.focus[f.id]),
      }))
        .filter(
          (x) =>
            x.p >= 0.999 &&
            sentences.focus!.focus[x.f.id][n] > sentences.focus!.none[x.f.id],
        )
        .map((x) => x.f)
    : [];
  return (
    <span className="sent-card" role="note">
      <b>{t.sentence(n + 1)}</b>
      {lens && weight != null && (
        <span className="num dim">
          {" "}
          ·{" "}
          {labelOf(
            FOCUS.find((f) => f.id === lens)!,
            lang,
          ).toLowerCase()}{" "}
          {Math.round(weight * 100)}
        </span>
      )}
      {top.length > 0 && (
        <span className="sent-peaks">
          {top.map((f) => (
            <span
              key={f.id}
              className="tag"
              style={{ "--c": f.color } as CSSProperties}
            >
              {t.peak}: {labelOf(f, lang).toLowerCase()}
            </span>
          ))}
        </span>
      )}
      <span className="sent-read">
        <span className="dim">{t.reads}:</span>{" "}
        {labelOf(
          SENTENCE_EMOTIONS.find((e) => e.id === read.emotion)!,
          lang,
        ).toLowerCase()}{" "}
        ·{" "}
        {labelOf(
          SENTENCE_ACTS.find((a) => a.id === read.act)!,
          lang,
        ).toLowerCase()}
        {SENTENCE_FLAGS.filter((f) => read.flags[f.id] >= 0.5).map((f) => (
          <span key={f.id} className="tag">
            {labelOf(f, lang).toLowerCase()}
          </span>
        ))}
        <span className="sent-scales num">
          {SENTENCE_SCALES.map(
            (s) =>
              `${labelOf(s, lang).toLowerCase()} ${Math.round(read.scales[s.id] * 100)}`,
          ).join(" · ")}
        </span>
      </span>
    </span>
  );
}
