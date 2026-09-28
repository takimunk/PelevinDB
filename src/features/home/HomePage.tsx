import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { EMOTIONS, labelOf, type EmotionId } from "../../../shared/catalog.ts";
import { href, navigate } from "../../app/router.ts";
import { rememberLens } from "../book/SentenceText.tsx";
import { useLang, useT, type Lang } from "../../i18n/index.ts";
import { dec } from "../../ui/format.ts";
import { Wordmark } from "../../ui/Wordmark.tsx";
import { AUTHOR_URL, GitHubMark, REPO_URL, XMark } from "../../ui/Social.tsx";
import { primaryTitle } from "../library/labels.ts";
import "./home.css";

type SceneModule = { UralScene: ComponentType<{ className?: string; onSign?: () => void }> };
// The scene is optional: if src/ui/UralScene.tsx is missing the glob is empty and the stage is left out.
const sceneLoader = Object.values(import.meta.glob<SceneModule>("../../ui/UralScene.tsx"))[0];
const UralScene = sceneLoader ? lazy(() => sceneLoader().then((m) => ({ default: m.UralScene }))) : null;

const PER = 5;

/** GET /api/corpus/top-pages (server/stats.ts `TopPages`). */
type TopPage = { id: string; title: string; titleEn: string | null; year: number | null; page: number; score: number; quote: string };
type TopPages = { emotion: EmotionId; items: TopPage[] }[];

const T = {
  en: {
    description: "An independent research project. A computational reading of Viktor Olegovich’s work.",
    github: "Source on GitHub",
    author: "by",
    authorName: "central dogma specialist",
    newTab: "opens in a new tab",
    topTitle: "The most emotional pages",
    topNote: "After Plutchik’s model of eight emotions.",
    loading: "Finding the strongest pages",
    empty: "The pages have not been read yet. The strongest ones will appear here once the analysis has run.",
    failed: "Could not load the pages. Try reloading.",
    open: (title: string, page: number) => `${title}, page ${page}`,
    score: "score",
    fig1: "Fig. 1 — “Ural”, after Chapaev and Void",
    startTitle: "Where to start",
    start: [
      { label: "Explore the map of every work", path: "/map?view=laugh" },
      { label: "In which book is love strongest?", path: "/library?view=themes&sort=love&dir=-1" },
      { label: "Explore the most significant moments", path: "/library?tab=pages" },
    ],
  },
  ru: {
    description: "Независимый исследовательский проект. Вычислительное прочтение творчества Виктора Олеговича.",
    github: "Исходный код на GitHub",
    author: "автор —",
    authorName: "central dogma specialist",
    newTab: "откроется в новой вкладке",
    topTitle: "Самые эмоциональные страницы",
    topNote: "По модели 8 эмоций Плутчика.",
    loading: "Ищем самые сильные страницы",
    empty: "Страницы ещё не прочитаны. Самые сильные появятся здесь, когда пройдёт анализ.",
    failed: "Не удалось загрузить страницы. Попробуйте обновить.",
    open: (title: string, page: number) => `${title}, страница ${page}`,
    score: "оценка",
    fig1: "Рис. 1 — «Урал», по мотивам «Чапаева и Пустоты»",
    startTitle: "С чего начать",
    start: [
      { label: "Изучите карту всех произведений", path: "/map?view=laugh" },
      { label: "В какой книге любовь сильнее всего?", path: "/library?view=themes&sort=love&dir=-1" },
      { label: "Исследуйте наиболее значимые моменты", path: "/library?tab=pages" },
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
      <a className="top-entry" href={href(`/book/${item.id}?page=${item.page}`)} aria-label={`${t.open(title, item.page)}: ${item.quote}`}>
        <q className="top-quote" lang="ru">
          {item.quote}
        </q>
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
  return (
    <div className="home">
      {UralScene && (
        <div className="stage-frame">
          <Suspense fallback={null}>
            <UralScene className="stage-scene" onSign={toTheStream} />
          </Suspense>
        </div>
      )}
      {UralScene && <p className="fig-caption stage-caption">{t.fig1}</p>}
      <section className="hero">
        <h1 className="hero-wordmark">
          <Wordmark size="hero" />
        </h1>
        <div className="hero-copy">
          <p className="hero-description">{t.description}</p>
          <p className="hero-links">
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
          </p>
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
              <span className="home-start-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>
      <TopPagesShowcase t={t} lang={lang} />
    </div>
  );
}
