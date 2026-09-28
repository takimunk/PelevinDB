import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { EMOTIONS, FOCUS, type FocusId, highOf, labelOf, lowOf, MODES, MOODS, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { PageSentences, SegmentAnalysis } from "../../../shared/types.ts";
import { argmax, isParatext, modeColor, moodColor } from "../../domain/analysis.ts";
import type { Segment } from "../../domain/text.ts";
import { useLang, useT } from "../../i18n/index.ts";
import { Meter, Swatch, Track } from "../../ui/term.tsx";
import { num, pageRef } from "./i18n.ts";
import { LensBar, SentenceText, useLens } from "./SentenceText.tsx";
import { PageTranslationNote, TranslatePageButton, usePageTranslation } from "../../ui/PageTranslate.tsx";

const STATS = "pelevindb.reader.stats";

/** Whether the page analysis is open: remembered for this viewer; closed by default, so the text gets the room. */
function useStatsOpen() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STATS) === "open";
    } catch {
      return false;
    }
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

// ───────── A reminder to buy the book ─────────

/** The first reminder comes after this many different pages of one book in a session, then after every EVERY more. */
const FIRST = 10;
const EVERY = 25;
const READ = "pelevindb.reader.read";
type ReadLog = { pages: number[]; next: number };
// Session storage may be unavailable (a private window, blocked site data); the log then lives for this tab only.
const memory = new Map<string, ReadLog>();

function readLog(bookId: string): ReadLog {
  try {
    const raw = JSON.parse(sessionStorage.getItem(`${READ}.${bookId}`) ?? "null") as ReadLog | null;
    if (raw && Array.isArray(raw.pages) && typeof raw.next === "number") return raw;
  } catch {
    /* fall back to memory */
  }
  return memory.get(bookId) ?? { pages: [], next: FIRST };
}
function writeLog(bookId: string, log: ReadLog) {
  memory.set(bookId, log);
  try {
    sessionStorage.setItem(`${READ}.${bookId}`, JSON.stringify(log));
  } catch {
    /* memory keeps it */
  }
}

/** Counts the different pages of a book read in this session; true once a reminder is due, until it is acknowledged. */
function useBuyReminder(bookId: string, page: number, on: boolean) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!on) return;
    const log = readLog(bookId);
    if (!log.pages.includes(page)) log.pages.push(page);
    writeLog(bookId, log);
    if (log.pages.length > log.next) setDue(true);
  }, [bookId, page, on]);
  const acknowledge = () => {
    const log = readLog(bookId);
    writeLog(bookId, { ...log, next: log.pages.length + EVERY });
    setDue(false);
  };
  return [due, acknowledge] as const;
}

const T = {
  en: {
    page: (n: number) => `Page ${n}`,
    of: "of",
    prev: "Previous page",
    next: "Next page",
    close: "Close reader",
    closeText: "Close",
    analysis: "Page analysis",
    show: "Show page analysis",
    hide: "Hide page analysis",
    paratext: "Paratext (contents, licence, title page): excluded from the book’s statistics.",
    pending: "This page is not analysed yet.",
    mood: "mood",
    mode: "narration",
    texture: "texture",
    confidence: "confidence",
    chars: "chars",
    tokens: "tokens",
    waiting: "pending",
    keys: "← → page · Esc close",
    loadingPage: "Loading the page…",
    pageError: (e: string) => `Could not load the page: ${e}. Showing its opening lines.`,
    onePage: "One page at a time",
    pointAt: (e: string) => `Show the sentence with the most ${e}`,
    remindTitle: "Reading the whole book",
    remindText:
      "PelevinDB shows the text one page at a time, for research and reference. To read the book itself, from beginning to end, please consider buying a copy from a legal bookstore.",
    remindLink: (t: string) => `Find “${t}” on Litres`,
    ok: "OK",
  },
  ru: {
    page: (n: number) => `Страница ${n}`,
    of: "из",
    prev: "Предыдущая страница",
    next: "Следующая страница",
    close: "Закрыть чтение",
    closeText: "Закрыть",
    analysis: "Разбор страницы",
    show: "Показать разбор страницы",
    hide: "Скрыть разбор страницы",
    paratext: "Паратекст (оглавление, лицензия, титул): в статистику книги не входит.",
    pending: "Эта страница ещё не проанализирована.",
    mood: "настроение",
    mode: "повествование",
    texture: "фактура",
    confidence: "уверенность",
    chars: "знаков",
    tokens: "токенов",
    waiting: "ожидает",
    keys: "← → страницы · Esc закрыть",
    loadingPage: "Загружаем страницу…",
    pageError: (e: string) => `Не удалось загрузить страницу: ${e}. Показано её начало.`,
    onePage: "По одной странице",
    pointAt: (e: string) => `Показать предложение, где больше всего: ${e}`,
    remindTitle: "Чтение книги целиком",
    remindText:
      "PelevinDB показывает текст по одной странице — для исследования и справки. Чтобы прочитать саму книгу от начала до конца, пожалуйста, подумайте о покупке в легальном магазине.",
    remindLink: (t: string) => `Найти «${t}» на Литрес`,
    ok: "OK",
  },
};

/**
 * One page with its analysis. Corpus books arrive without their text (`excerpt`): the reader fetches the full text of
 * the open page only (`page`), showing the page's opening lines while it loads. On desktop it is the right pane of the
 * book page (the left one navigates); on phones a full-screen sheet.
 */
export function Reader({
  bookId,
  title,
  segment,
  analysis,
  total,
  onMove,
  onClose,
  excerpt = false,
  page,
  point,
}: {
  bookId: string;
  title: string;
  segment: Segment;
  analysis: SegmentAnalysis | null;
  total: number;
  onMove: (delta: number) => void;
  onClose: () => void;
  excerpt?: boolean;
  /** Full text of this page for excerpt-only books, fetched on demand. */
  page?: { text: string | null; sentences?: PageSentences | null; loading: boolean; error: string | null };
  /** A sentence of this page (1-based, from the URL's `s`) to scroll to and mark. */
  point?: number;
}) {
  const t = useT(T);
  const lang = useLang();
  const closeRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [showAnalysis, setShowAnalysis] = useStatsOpen();
  const [lens, setLens, pointed] = useLens();
  // Bumped on each click on an emotion, so the same emotion clicked twice still brings its sentence back.
  const [jump, setJump] = useState(0);
  const sentences = excerpt && page?.text ? (page.sentences ?? null) : null;
  // English UI, corpus page with its sentences: a machine translation on demand (the Russian stays the default).
  const translation = usePageTranslation(bookId, segment.id, lang === "en" && !!sentences);
  // The reminder is about the book's own text, so it counts corpus pages only (your own files are yours).
  const [remind, acknowledge] = useBuyReminder(bookId, segment.id, excerpt);
  const remindRef = useRef(remind);
  remindRef.current = remind;
  const pointAt = (id: FocusId) => {
    setLens(id);
    setJump((n) => n + 1);
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Only the phone sheet covers the page; on desktop the book page stays scrollable beside the reader.
    const sheet = matchMedia("(max-width: 960px)").matches;
    const overflow = document.body.style.overflow;
    if (sheet) document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (sheet) document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    textRef.current?.scrollTo({ top: 0 });
  }, [segment.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // While the reminder is open, the page stays where it is; Esc belongs to the reminder.
      if (remindRef.current) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, select, textarea")) return;
      if (e.key === "Escape" || e.key === "q") onClose();
      if (e.key === "ArrowRight" || e.key === "n") onMove(1);
      if (e.key === "ArrowLeft" || e.key === "p") onMove(-1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onMove, onClose]);
  const mood = analysis && MOODS.find((m) => m.id === argmax(analysis.mood))!;
  const mode = analysis && MODES.find((m) => m.id === argmax(analysis.mode))!;
  const lead = analysis && EMOTIONS.find((e) => e.id === argmax(analysis.emotions))!;
  const themes = analysis ? THEMES.filter((th) => analysis.themes[th.id] >= 0.5).sort((a, b) => analysis.themes[b.id] - analysis.themes[a.id]) : [];
  const chars = segment.end - segment.start;
  const known = analysis && !isParatext(analysis);
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
          <TranslatePageButton tr={translation} />
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
            <PageTranslationNote tr={translation} />
            {sentences ? (
              <span lang={translation.display ? "en" : undefined}>
                <SentenceText text={page.text} sentences={sentences} analysis={analysis} lens={lens} jump={jump + pointed} point={point != null ? point - 1 : undefined} display={translation.display} />
              </span>
            ) : (
              page.text
            )}
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
        <button className="reader-analysis-toggle" aria-label={showAnalysis ? t.hide : t.show} aria-expanded={showAnalysis} aria-controls="reader-analysis" onClick={() => setShowAnalysis(!showAnalysis)}>
          <span className="reader-analysis-name">{t.analysis}</span>
          {/* Collapsed, one line says what the page is: its leading emotion, mood and narration. */}
          {known && (
            <span className="reader-summary" aria-hidden="true">
              <span>
                <Swatch color={lead!.color} round />
                {labelOf(lead!, lang).toLowerCase()}
              </span>
              <span>
                <Swatch color={moodColor(mood!.id)} round />
                {labelOf(mood!, lang).toLowerCase()}
              </span>
              <span>
                <Swatch color={modeColor(mode!.id)} round />
                {labelOf(mode!, lang).toLowerCase()}
              </span>
            </span>
          )}
          <span aria-hidden="true">{showAnalysis ? "−" : "+"}</span>
        </button>
        <section id="reader-analysis" className={`reader-analysis ${showAnalysis ? "expanded" : ""}`}>
          {analysis ? (
            isParatext(analysis) ? (
              <p className="reader-note">{t.paratext}</p>
            ) : (
              <>
                <div className="reader-tags">
                  <span>
                    <span className="dim">{t.mood}</span> {labelOf(mood!, lang).toLowerCase()}
                  </span>
                  <span>
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
                        <span className="reader-emo-name">{labelOf(e, lang).toLowerCase()}</span>
                        <span className="num">{Math.round(analysis.emotions[e.id] * 100)}</span>
                        <Meter value={analysis.emotions[e.id]} color={e.color} className="thin" />
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
                <div className="reader-textures" role="list" aria-label={t.texture}>
                  {TEXTURES.map((tx) => (
                    <span
                      key={tx.id}
                      role="listitem"
                      title={`${lowOf(tx, lang)} ↔ ${highOf(tx, lang)} · ${t.confidence} ${Math.round(analysis.textureConfidence[tx.id] * 100)}%`}
                    >
                      <span className="reader-emo-name">{labelOf(tx, lang).toLowerCase()}</span>
                      <Track value={analysis.texture[tx.id]} label={`${labelOf(tx, lang)}: ${lowOf(tx, lang)} ↔ ${highOf(tx, lang)}, ${Math.round(analysis.texture[tx.id] * 100)}`} />
                    </span>
                  ))}
                </div>
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
      {remind && (
        <BuyReminder
          title={title}
          onOk={() => {
            acknowledge();
            closeRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </aside>
  );
}

/** A calm, modal note: the site shows the text for research; the book itself is worth buying. Esc or OK closes it. */
function BuyReminder({ title, onOk }: { title: string; onOk: () => void }) {
  const t = useT(T);
  const ok = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => ok.current?.focus({ preventScroll: true }), []);
  const key = (e: ReactKeyboardEvent) => {
    // The reader's own keys (arrows, Esc) must not reach it while the note is open.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onOk();
    } else if (e.key === "Tab") {
      const items = [...box.current!.querySelectorAll<HTMLElement>("a[href], button")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  };
  const search = `https://www.litres.ru/search/?q=${encodeURIComponent(`Пелевин ${title}`)}`;
  // In a portal: the reader's slide-in transform would otherwise pin the veil to the reader instead of the viewport.
  return createPortal(
    <div className="reader-remind-veil">
      <div ref={box} className="reader-remind" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} onKeyDown={key}>
        <h2 id={`${id}-t`}>{t.remindTitle}</h2>
        <p id={`${id}-d`}>{t.remindText}</p>
        <p>
          <a className="link-u" href={search} target="_blank" rel="noopener noreferrer">
            {t.remindLink(title)}
          </a>
        </p>
        <button ref={ok} className="btn small primary" onClick={onOk}>
          {t.ok}
        </button>
      </div>
    </div>,
    document.body,
  );
}
