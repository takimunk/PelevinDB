// The reader's page text split into its sentences, tinted by one focus dimension: how much of the page's score each
// sentence carries (page score × the focus probability, relative to the page's peak sentence). Click a sentence to
// see what Jev answered about it on its own, when it has read it.
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
    off: "off",
    peak: "peak",
    sentence: (n: number) => `Sentence ${n}`,
    reads: "Read alone",
    none: "Jev finds no sentence on this page that carries it.",
    pending: "Sentence analysis has not reached this page yet.",
  },
  ru: {
    lens: "Подсветка фраз",
    off: "нет",
    peak: "пик",
    sentence: (n: number) => `Фраза ${n}`,
    reads: "Отдельно",
    none: "Jev не находит на этой странице фразы, которая это несёт.",
    pending: "Разбор по фразам до этой страницы ещё не дошёл.",
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

/** Sets the reader's highlight (remembered for this viewer); the Lines views set it before opening a line's page. */
export function rememberLens(next: FocusId | null) {
  try {
    if (next) localStorage.setItem(STORAGE, next);
    else localStorage.removeItem(STORAGE);
  } catch {
    /* storage is a convenience only */
  }
  window.dispatchEvent(new CustomEvent(LENS_EVENT, { detail: next }));
}

export function useLens() {
  const [lens, setLens] = useState<FocusId | null>(readLens);
  useEffect(() => {
    const on = (e: Event) => setLens((e as CustomEvent<FocusId | null>).detail);
    window.addEventListener(LENS_EVENT, on);
    return () => window.removeEventListener(LENS_EVENT, on);
  }, []);
  return [lens, rememberLens] as const;
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
        {t.off}
      </button>
      {FOCUS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={lens === f.id}
          className={lens === f.id ? "on" : ""}
          disabled={disabled}
          style={{ "--c": f.color } as CSSProperties}
          onClick={() => onLens(f.id)}
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

export function SentenceText({
  text,
  sentences,
  analysis,
  lens,
  jump = 0,
}: {
  text: string;
  sentences: PageSentences;
  analysis: SegmentAnalysis | null;
  lens: FocusId | null;
  /** Bumped when the reader points at a dimension: scrolls to its peak sentence again and flashes it. */
  jump?: number;
}) {
  const t = useT(T);
  const lang = useLang();
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => setOpen(null), [text]);
  // Opening a page with a highlight on, or pointing at an emotion, brings the peak sentence into view; a pointed
  // sentence flashes once so the eye finds it.
  useEffect(() => {
    const peak = root.current?.querySelector<HTMLElement>(".sent.peak");
    if (!peak) return;
    peak.scrollIntoView({ block: "center", behavior: jump ? "smooth" : "auto" });
    if (jump && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      peak.animate([{ outline: "2px solid var(--c)", outlineOffset: "3px" }, { outline: "2px solid transparent", outlineOffset: "3px" }], { duration: 1400, easing: "ease-out" });
  }, [text, lens, jump]);
  const color = lens ? FOCUS.find((f) => f.id === lens)!.color : undefined;
  const lensed = lens ? lensWeights(sentences, analysis, lens) : null;
  const parts: React.ReactNode[] = [];
  let at = 0;
  sentences.spans.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    const w = lensed?.weights[i] ?? 0;
    const read = sentences.read[i];
    const body = text.slice(start, end);
    // Only sentences Jev read on their own are highlighted and open a card. Without a lens the tint is the
    // sentence's leading emotion, its opacity the sentence's intensity (with a faint floor, so calm ones still show).
    const style = lensed
      ? ({ "--w": Math.sqrt(w).toFixed(3), "--c": color } as CSSProperties)
      : read
        ? ({
            "--w": (0.12 + 0.88 * read.scales.arousal).toFixed(3),
            "--c": SENTENCE_EMOTIONS.find((e) => e.id === read.emotion)!.color,
          } as CSSProperties)
        : undefined;
    const peak = lensed && i === lensed.peak ? "peak" : "";
    if (!read) {
      parts.push(
        <span key={i} className={`sent ${peak}`} style={style}>
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
      <span ref={root} className={`sent-text ${lensed ? "lensed" : "felt"}`}>
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
