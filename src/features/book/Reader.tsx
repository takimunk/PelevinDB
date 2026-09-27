import { useEffect, useRef, useState } from "react";
import { EMOTIONS, FOCUS, type FocusId, highOf, labelOf, lowOf, MODES, MOODS, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { PageSentences, SegmentAnalysis } from "../../../shared/types.ts";
import { argmax, isParatext, modeColor, moodColor } from "../../domain/analysis.ts";
import { pageValues } from "../../domain/fingerprint.ts";
import type { Segment } from "../../domain/text.ts";
import { useLang, useT } from "../../i18n/index.ts";
import { PixelStrip } from "../../ui/PixelStrip.tsx";
import { Meter, Swatch } from "../../ui/term.tsx";
import { Sliders } from "./charts/Text.tsx";
import { num, pageRef } from "./i18n.ts";
import { LensBar, SentenceText, useLens } from "./SentenceText.tsx";

const STATS = "pelevindb.reader.stats";

/** Whether the page stats are open: remembered for this viewer; by default open on desktop, closed on phones. */
function useStatsOpen() {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(STATS);
      if (v === "open" || v === "closed") return v === "open";
    } catch {
      /* storage is a convenience only */
    }
    return typeof window !== "undefined" && window.matchMedia("(min-width: 961px)").matches;
  });
  const set = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(STATS, next ? "open" : "closed");
    } catch {
      /* storage is a convenience only */
    }
  };
  return [open, set] as const;
}

const T = {
  en: {
    page: (n: number) => `Page ${n}`,
    of: "of",
    prev: "Previous page",
    next: "Next page",
    close: "Close reader",
    closeText: "Close",
    show: "Show page analysis",
    hide: "Hide page analysis",
    paratext: "Jev marks this page as paratext (contents, licence, title page). It is excluded from book stats.",
    pending: "Jev has not read this page yet.",
    answers: "Jev answers",
    mood: "mood",
    mode: "narration",
    confidence: "confidence",
    chars: "chars",
    tokens: "tokens",
    waiting: "pending",
    keys: "← → page · Esc close",
    loadingPage: "Loading the page…",
    pageError: (e: string) => `Could not load the page: ${e}. Showing its opening lines.`,
    onePage: "One page at a time",
    pointAt: (e: string) => `Show the sentence with the most ${e}`,
  },
  ru: {
    page: (n: number) => `Страница ${n}`,
    of: "из",
    prev: "Предыдущая страница",
    next: "Следующая страница",
    close: "Закрыть чтение",
    closeText: "Закрыть",
    show: "Показать разбор страницы",
    hide: "Скрыть разбор страницы",
    paratext: "Jev считает эту страницу паратекстом (оглавление, лицензия, титул). В статистику книги она не входит.",
    pending: "Jev ещё не прочитал эту страницу.",
    answers: "ответов Jev",
    mood: "настроение",
    mode: "повествование",
    confidence: "уверенность",
    chars: "знаков",
    tokens: "токенов",
    waiting: "ожидает",
    keys: "← → страницы · Esc закрыть",
    loadingPage: "Загружаем страницу…",
    pageError: (e: string) => `Не удалось загрузить страницу: ${e}. Показано её начало.`,
    onePage: "По одной странице",
    pointAt: (e: string) => `Показать фразу, где больше всего: ${e}`,
  },
};

/**
 * One page with every Jev answer about it. Corpus books arrive without their text (`excerpt`): the reader
 * fetches the full text of the open page only (`page`), showing the page's opening lines while it loads.
 */
export function Reader({
  segment,
  analysis,
  total,
  onMove,
  onClose,
  excerpt = false,
  page,
}: {
  segment: Segment;
  analysis: SegmentAnalysis | null;
  total: number;
  onMove: (delta: number) => void;
  onClose: () => void;
  excerpt?: boolean;
  /** Full text of this page for excerpt-only books, fetched on demand. */
  page?: { text: string | null; sentences?: PageSentences | null; loading: boolean; error: string | null };
}) {
  const t = useT(T);
  const lang = useLang();
  const closeRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [showAnalysis, setShowAnalysis] = useStatsOpen();
  const [lens, setLens] = useLens();
  // Bumped on each click on an emotion, so the same emotion clicked twice still brings its sentence back.
  const [jump, setJump] = useState(0);
  const sentences = excerpt && page?.text ? (page.sentences ?? null) : null;
  const pointAt = (id: FocusId) => {
    setLens(id);
    setJump((n) => n + 1);
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    textRef.current?.scrollTo({ top: 0 });
  }, [segment.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "q") onClose();
      if (e.key === "ArrowRight" || e.key === "n") onMove(1);
      if (e.key === "ArrowLeft" || e.key === "p") onMove(-1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onMove, onClose]);
  const mood = analysis && MOODS.find((m) => m.id === argmax(analysis.mood))!;
  const mode = analysis && MODES.find((m) => m.id === argmax(analysis.mode))!;
  const themes = analysis ? THEMES.filter((th) => analysis.themes[th.id] >= 0.5).sort((a, b) => analysis.themes[b.id] - analysis.themes[a.id]) : [];
  const chars = segment.end - segment.start;
  return (
    <aside className={`reader ${excerpt && !page?.text ? "excerpt-mode" : ""} ${sentences ? "has-lens" : ""}`} role="dialog" aria-modal="false" aria-label={t.page(segment.id)}>
      <header className="reader-top">
        <span className="reader-page">
          <b className="num">{pageRef(lang, segment.id)}</b>
          <span className="dim num">
            {" "}
            {t.of} {num(lang, total)}
          </span>
        </span>
        <div className="reader-nav">
          <button className="btn small" aria-label={t.prev} disabled={segment.id <= 1} onClick={() => onMove(-1)}>
            ←
          </button>
          <button className="btn small" aria-label={t.next} disabled={segment.id >= total} onClick={() => onMove(1)}>
            →
          </button>
          <button className="btn small ghost" ref={closeRef} aria-label={t.close} onClick={onClose}>
            {t.closeText}
          </button>
        </div>
      </header>
      {sentences && <LensBar lens={lens} onLens={setLens} />}
      <div className="reader-text" ref={textRef}>
        {excerpt && page?.text ? (
          <>
            {sentences ? <SentenceText text={page.text} sentences={sentences} analysis={analysis} lens={lens} jump={jump} /> : page.text}
            <span className="reader-one-page" role="note">
              {t.onePage}
            </span>
          </>
        ) : excerpt ? (
          <>
            <p className={`reader-excerpt ${page?.loading ? "loading" : ""}`}>{/^[\p{Ll},;:)]/u.test(segment.text) ? `…${segment.text}` : segment.text || "…"}</p>
            <p className="reader-notice" role="status" aria-live="polite">
              {page?.error ? t.pageError(page.error) : t.loadingPage}
            </p>
          </>
        ) : (
          segment.text
        )}
      </div>
      <div className="reader-details">
        <button className="reader-analysis-toggle" aria-expanded={showAnalysis} aria-controls="reader-analysis" onClick={() => setShowAnalysis(!showAnalysis)}>
          {showAnalysis ? t.hide : t.show} <span aria-hidden="true">{showAnalysis ? "−" : "+"}</span>
        </button>
        <section id="reader-analysis" className={`reader-analysis ${showAnalysis ? "expanded" : ""}`}>
          {analysis ? (
            isParatext(analysis) ? (
              <p className="reader-note">{t.paratext}</p>
            ) : (
              <>
                <PixelStrip values={pageValues(analysis)} size={10} label={t.answers} />
                <div className="reader-tags">
                  <span>
                    <Swatch color={moodColor(mood!.id)} round />
                    <span className="dim">{t.mood}</span> {labelOf(mood!, lang).toLowerCase()}
                  </span>
                  <span>
                    <Swatch color={modeColor(mode!.id)} round />
                    <span className="dim">{t.mode}</span> {labelOf(mode!, lang).toLowerCase()}
                  </span>
                  {themes.map((th) => (
                    <span key={th.id} className="tag">
                      {labelOf(th, lang).toLowerCase()}
                    </span>
                  ))}
                </div>
                <div className="reader-emotions">
                  {EMOTIONS.map((e) => {
                    const row = (
                      <>
                        <span>{labelOf(e, lang).toLowerCase()}</span>
                        <Meter value={analysis.emotions[e.id]} color={e.color} />
                        <span className="num">{Math.round(analysis.emotions[e.id] * 100)}</span>
                      </>
                    );
                    // With focus answers, an emotion points at the sentence that carries it most.
                    const focusable = sentences?.focus && FOCUS.some((f) => f.id === e.id);
                    return focusable ? (
                      <button key={e.id} className={lens === e.id ? "on" : ""} aria-pressed={lens === e.id} title={t.pointAt(labelOf(e, lang).toLowerCase())} onClick={() => pointAt(e.id as FocusId)}>
                        {row}
                      </button>
                    ) : (
                      <div key={e.id}>{row}</div>
                    );
                  })}
                </div>
                <Sliders
                  items={TEXTURES.map((tx) => ({
                    id: tx.id,
                    low: lowOf(tx, lang),
                    high: highOf(tx, lang),
                    value: analysis.texture[tx.id],
                    label: `${labelOf(tx, lang)} · ${t.confidence} ${Math.round(analysis.textureConfidence[tx.id] * 100)}%`,
                  }))}
                />
              </>
            )
          ) : (
            <p className="reader-note">{t.pending}</p>
          )}
          <footer className="reader-foot num">
            {num(lang, chars)} {t.chars} · {analysis ? `${analysis.model}${analysis.usage?.input_tokens ? ` · ${num(lang, analysis.usage.input_tokens)} ${t.tokens}` : ""}` : t.waiting} · {t.keys}
          </footer>
        </section>
      </div>
    </aside>
  );
}
