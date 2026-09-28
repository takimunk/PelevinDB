import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type RefObject } from "react";
import { EMOTIONS, labelOf, type EmotionId } from "../../../shared/catalog.ts";
import { href, navigate } from "../../app/router.ts";
import { rememberLens } from "../book/SentenceText.tsx";
import { useLang, useT, type Lang } from "../../i18n/index.ts";
import { dec } from "../../ui/format.ts";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { Translatable } from "../../ui/Translatable.tsx";
import { AUTHOR_URL, GitHubMark, REPO_URL, XMark } from "../../ui/Social.tsx";
import { ContactButton, ContactDialog } from "../../ui/Contact.tsx";
import { primaryTitle } from "../library/labels.ts";
import "./home.css";

/** A note let go on the river: `key` changes for each new note. */
/** The scene's handle (src/ui/UralScene.tsx RiverHandle): a sent note goes onto the river without re-rendering it. */
type RiverHandle = { addNote: (note: { token?: string; text: string; expiresAt?: string }) => void };
type SceneProps = { className?: string; onSign?: () => void; onPaper?: (at: { x: number; y: number }) => void; handle?: RefObject<RiverHandle | null> };
type SceneModule = { UralScene: ComponentType<SceneProps> };
// The scene is optional: if src/ui/UralScene.tsx is missing the glob is empty and the stage is left out.
const sceneLoader = Object.values(import.meta.glob<SceneModule>("../../ui/UralScene.tsx"))[0];
const UralScene = sceneLoader ? lazy(() => sceneLoader().then((m) => ({ default: m.UralScene }))) : null;

const PER = 5;

/** GET /api/corpus/top-pages (server/stats.ts `TopPages`). */
type TopPage = { id: string; title: string; titleEn: string | null; year: number | null; page: number; n?: number | null; score: number; quote: string };
type TopPages = { emotion: EmotionId; items: TopPage[] }[];

const T = {
  en: {
    description: ["An independent research project.", "A computational reading of Viktor Olegovich’s work."],
    github: "Source on GitHub",
    author: "by",
    authorName: "central dogma specialist",
    newTab: "opens in a new tab",
    topTitle: "The most emotional pages",
    topNote: "After Plutchik’s model of eight emotions.",
    loading: "Finding the strongest pages",
    empty: "The pages have not been analysed yet. The strongest ones will appear here once the analysis has run.",
    failed: "Could not load the pages. Try reloading.",
    open: (title: string, page: number) => `${title}, page ${page}`,
    score: "score",
    fig1: "Fig. 1 — “Ural”, after Chapaev and Void",
    riverNote: "Leave a note to the river",
    startTitle: "Where to start",
    start: [
      { label: "Explore the map of every work", path: "/map?view=laugh" },
      { label: "In which book is love strongest?", path: "/library?view=themes&sort=love&dir=-1" },
      { label: "The most joyful quotes", path: "/library?tab=lines&dim=joy" },
    ],
  },
  ru: {
    description: ["Независимый исследовательский проект.", "Вычислительное прочтение творчества Виктора Олеговича."],
    github: "Исходный код на GitHub",
    author: "автор —",
    authorName: "central dogma specialist",
    newTab: "откроется в новой вкладке",
    topTitle: "Самые эмоциональные страницы",
    topNote: "По модели 8 эмоций Плутчика.",
    loading: "Ищем самые сильные страницы",
    empty: "Страницы ещё не проанализированы. Самые сильные появятся здесь, когда пройдёт анализ.",
    failed: "Не удалось загрузить страницы. Попробуйте обновить.",
    open: (title: string, page: number) => `${title}, страница ${page}`,
    score: "оценка",
    fig1: "Рис. 1 — «Урал», по мотивам «Чапаева и Пустоты»",
    riverNote: "Оставить записку реке",
    startTitle: "С чего начать",
    start: [
      { label: "Изучите карту всех произведений", path: "/map?view=laugh" },
      { label: "В какой книге любовь сильнее всего?", path: "/library?view=themes&sort=love&dir=-1" },
      { label: "Самые радостные цитаты", path: "/library?tab=lines&dim=joy" },
    ],
  },
};
type Dict = (typeof T)["en"];

let request: Promise<TopPages | null> | null = null;
/** `null` once loaded means there is no corpus; the promise is shared so revisiting home does not refetch. */
function loadTopPages() {
  request ??= fetch(`/api/corpus/top-pages?per=${PER}`).then(
    (r) => (r.status === 404 ? null : r.ok ? (r.json() as Promise<TopPages>) : Promise.reject(new Error(`HTTP ${r.status}`))),
  );
  request.catch(() => (request = null));
  return request;
}

function useTopPages() {
  const [state, setState] = useState<{ data?: TopPages | null; error?: boolean }>({});
  useEffect(() => {
    let alive = true;
    loadTopPages().then(
      (data) => alive && setState({ data }),
      () => alive && setState({ error: true }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function External({ to, children, t }: { to: string; children: React.ReactNode; t: Dict }) {
  return (
    <a className="hero-link" href={to} target="_blank" rel="noopener" title={t.newTab}>
      {children}
    </a>
  );
}

function Entry({ item, lang, t }: { item: TopPage; lang: Lang; t: Dict }) {
  const title = primaryTitle(item, lang);
  return (
    <li>
      <a className="top-entry" href={href(`/book/${item.id}?page=${item.page}${item.n ? `&s=${item.n}` : ""}`)} aria-label={`${t.open(title, item.page)}: ${item.quote}`}>
        <Translatable className="top-quote" text={item.quote} refKey={`t:${item.id}:${item.page}`} auto />
        <span className="top-meta">
          <span className="top-book">{title}</span>
          {item.year ? <span> · {item.year}</span> : null}
          <span title={t.score}> · {dec(item.score)}</span>
        </span>
      </a>
    </li>
  );
}

function TopPagesShowcase({ t, lang }: { t: Dict; lang: Lang }) {
  const { data, error } = useTopPages();
  const loading = data === undefined && !error;
  const empty = data === null || (data && data.every((c) => !c.items.length));
  const byEmotion = new Map((data ?? []).map((c) => [c.emotion, c.items]));
  return (
    <section className="top-pages" aria-labelledby="top-title" aria-busy={loading}>
      <header className="section-head">
        <h2 id="top-title">{t.topTitle}</h2>
        <p>{t.topNote}</p>
      </header>
      {error ? (
        <p className="top-state">{t.failed}</p>
      ) : empty ? (
        <p className="top-state">{t.empty}</p>
      ) : (
        <div className="top-grid">
          {EMOTIONS.map((e) => (
            <div key={e.id} className="top-col" style={{ "--emotion": e.color } as React.CSSProperties}>
              <h3>
                <i className="swatch" aria-hidden="true" />
                {labelOf(e, lang)}
              </h3>
              {loading ? (
                <div className="top-loading" role="status" aria-label={t.loading}>
                  {Array.from({ length: PER }, (_, i) => (
                    <span key={i}>
                      <span className="skeleton" />
                      <span className="skeleton" />
                      <span className="skeleton short" />
                    </span>
                  ))}
                </div>
              ) : (
                <ol>
                  {(byEmotion.get(e.id) ?? []).map((item) => (
                    <Entry key={`${item.id}:${item.page}`} item={item} lang={lang} t={t} />
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Easter egg: the «УРАЛ» sign opens «Чапаев и Пустота» at the rainbow stream, page 305, second sentence ("Просто
 * глядеть на эти постоянно возникающие разноцветные огни…"), highlighted as the page's brightest.
 */
const STREAM = "/book/pv-chapaev-i-pustota?page=305&s=2";
function toTheStream() {
  rememberLens("light");
  navigate(STREAM);
}

export function HomePage() {
  const t = useT(T);
  const lang = useLang();
  // The paper by the towel opens a note to the river; once stored, the note rides the river in the scene.
  // The scene is memoised and its props are stable, so opening the note or sending it never re-renders it.
  const [paper, setPaper] = useState<{ x: number; y: number } | null>(null);
  const river = useRef<RiverHandle | null>(null);
  const onSent = useCallback((text: string, reply: { token?: string; expiresAt?: string }) => river.current?.addNote({ text, ...reply }), []);
  const onClosePaper = useCallback(() => setPaper(null), []);
  const onPaper = useCallback((at: { x: number; y: number }) => setPaper(at), []);
  return (
    <div className="home">
      {UralScene && (
        <figure className="stage">
          <div className="stage-frame">
            <Suspense fallback={null}>
              <UralScene className="stage-scene" onSign={toTheStream} onPaper={onPaper} handle={river} />
            </Suspense>
            {/* The paper in the scene, for the keyboard: shown only when focused. */}
            <button
              type="button"
              className="stage-note"
              aria-haspopup="dialog"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onPaper({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
            >
              {t.riverNote}
            </button>
          </div>
          <figcaption className="fig-caption stage-caption">{t.fig1}</figcaption>
        </figure>
      )}
      {UralScene && (
        <ContactDialog
          variant="river"
          open={!!paper}
          from={paper}
          onClose={onClosePaper}
          onSent={onSent}
        />
      )}
      <section className="hero">
        <h1 className="hero-wordmark">
          <Wordmark size="hero" />
        </h1>
        <div className="hero-copy">
          <p className="hero-description">
            {/* Each sentence on its own line. */}
            {t.description.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
          <div className="hero-links">
            <External to={REPO_URL} t={t}>
              <GitHubMark />
              {t.github}
            </External>
            <span className="hero-author">
              <XMark />
              <span>
                {t.author}{" "}
                <External to={AUTHOR_URL} t={t}>
                  {t.authorName}
                </External>
              </span>
            </span>
            <ContactButton />
          </div>
        </div>
      </section>
      <section className="home-start" aria-labelledby="home-start-title">
        <header className="section-head">
          <h2 id="home-start-title">{t.startTitle}</h2>
        </header>
        <div className="home-start-grid">
          {t.start.map((item) => (
            <a className="home-start-link" key={item.path} href={href(item.path)}>
              <span className="home-start-text">{item.label}</span>
              <span className="home-start-arrow" aria-hidden="true">
                {" "}
                ↗
              </span>
            </a>
          ))}
        </div>
      </section>
      <TopPagesShowcase t={t} lang={lang} />
    </div>
  );
}
