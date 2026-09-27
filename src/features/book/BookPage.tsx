import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EMOTIONS, ERAS, GENRES, highOf, labelOf, lowOf, MODES, MOODS, PROFILE_SCALES, SEGMENT_QUESTION_COUNT, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import { ARC_SHAPES, argmax, bookStats, moments, series, storyArc, topEntries } from "../../domain/analysis.ts";
import { spend, tokens, usd } from "../../domain/cost.ts";
import { buildCsv, buildExport } from "../../domain/export.ts";
import { DEFAULT_WEIGHTS, fingerprintValues } from "../../domain/fingerprint.ts";
import { bookInsights, dnaInsights } from "../../domain/insights.ts";
import { neighbours } from "../../domain/pca.ts";
import { firstSentence, READING_CHARS_PER_MINUTE } from "../../domain/text.ts";
import { navigate } from "../../app/router.ts";
import { plural, useLang, useT, type Lang } from "../../i18n/index.ts";
import { requestBrief, startAnalysis, stopAnalysis, useBriefJob, useJob } from "../../services/analyzer.ts";
import { useServerStatus } from "../../services/api.ts";
import { useLocalMode } from "../../services/mode.ts";
import { useBookView } from "../../storage/books.ts";
import { useCorpusPage } from "../../storage/corpus.ts";
import { briefFor, removeBook, touchBook, useLibrary } from "../../storage/library.ts";
import { PixelStrip } from "../../ui/PixelStrip.tsx";
import { Meter, Swatch } from "../../ui/term.tsx";
import { starPath, useCorpus, useEmbedding } from "../map/corpus.ts";
import { KIND_LABELS } from "../map/encoding.ts";
import { meanSource, Radar, radarAxes } from "./charts/Radar.tsx";
import { ArcPlot, Bars, Dna, ModeBars, MoodBars, PulsePlot, Sliders, Spectrogram, ThemeLines } from "./charts/Text.tsx";
import { num, pageRef, pct } from "./i18n.ts";
import { InsightList } from "./Insights.tsx";
import { QuoteExplorer } from "./QuoteExplorer.tsx";
import { Reader } from "./Reader.tsx";
import "./book.css";

const T = {
  en: {
    notFound: "Book not found",
    notFoundCanon: "This book is not in the corpus, or the server has no corpus database.",
    notFoundLocal: "It may have been removed from your library.",
    home: "Back to the start",
    opening: "Opening the book…",
    corpus: "PelevinDB corpus",
    readByJev: "read by Jev",
    gutenberg: "Project Gutenberg",
    localFile: (f: string) => `Your file · ${f}`,
    rank: (r: number) => `#${r}`,
    noCharacter: "The book’s character appears once Jev has read it.",
    arc: "arc",
    pages: "pages",
    chars: "characters",
    reading: "reading time",
    min: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    jev: "read by Jev",
    complete: "complete",
    tokens: "tokens",
    cost: "cost",
    tokensHint: (tok: string, req: string, brief?: string) => `Jev: ${tok} input tokens over ${req} requests at $0.042 per million${brief ? ` · brief: ${brief} tokens` : ""}`,
    costHint: (jev: string, brief?: string) => `Jev ${jev}${brief ? ` · brief ${brief}` : ""}`,
    stop: "Stop",
    resume: "Resume",
    analyze: "Analyze",
    map: "Map",
    export: "Export",
    json: "JSON · full dataset",
    csv: "CSV · pages",
    yourCopy: "Your copy",
    delete: "Delete book",
    deleteTitle: "Remove from library",
    confirmDelete: (t: string) => `Delete “${t}” and all its scores?`,
    progress: (d: number, n: number) => `${d} of ${n} pages · ${SEGMENT_QUESTION_COUNT} questions each`,
    canonNote: (d: string, n: string) => `A read-only corpus book: Jev has read ${d} of ${n} pages so far.`,
    noKey: "Add TYPESAFE_API_KEY to .env and restart the server so Jev can read the book.",
    howItWorks: `Each page is one Jev request with ${SEGMENT_QUESTION_COUNT} independent questions, then one request about the whole book. Text is sent to TypeSafe only after you press Analyze.`,
    fingerprint: "fingerprint coordinates",
    meanOf: (n: number) => `mean of ${n} other ${plural(n, ["book", "books"])}`,
    excerptNote: "The text opens one page at a time: pick a quote, a page in a chart or a line in explore to read that page in full.",
    s: {
      brief: "Brief",
      quotes: "Quotes",
      insights: "Insights",
      dna: "DNA",
      spectrogram: "Spectrogram",
      pulse: "Pulse",
      mood: "Mood",
      narration: "Narration",
      shape: "Shape",
      texture: "Texture",
      whole: "Whole book",
      themes: "Themes",
      neighbours: "Neighbours",
    },
    n: {
      briefBy: (m: string) => `written by ${m} from the data below`,
      brief: "a reader’s brief written from everything measured here",
      extremes: "the most extreme pages, found in code from Jev answers · click to read",
      explore: "filter every page by a Jev answer and rank by any score · click to read",
      insights: "computed from Jev answers · click a page to read",
      dna: "one column per page range · height = emotional intensity · colour = leading emotion · click to read",
      spectrogram: "Plutchik’s emotions over time · click to read",
      pulse: "tension, pace, light and interiority · extreme pages marked · click to read",
      mood: "one of 11 per page",
      narration: "one of 9 per page",
      shape: "light curve against Vonnegut’s six arcs",
      texture: "7 bipolar scores · book mean",
      whole: "one extra Jev request over six sampled pages",
      themes: "top 10 of 19 · how likely each page is about the theme · click to read",
      neighbours: "nearest fingerprints · cosine similarity",
    },
    views: { extremes: "extremes", explore: "explore" },
    quotesView: "Quotes view",
    whyRead: "Why read it",
    whoSuits: "Who it suits",
    skipIf: "Skip if",
    tokensIn: "in",
    tokensOut: "out",
    rewriting: "Rewriting…",
    rewrite: "Rewrite",
    briefWait: "The brief is written once Jev has read the whole book.",
    briefOtherLang: "No English brief yet, so the Russian one is shown.",
    writeInLang: "Write it in English",
    briefCanon: "No brief is stored for this corpus book yet.",
    writing: "Writing brief…",
    writeBrief: "Write brief",
    briefCost: "sends the measured data and six short quotes to OpenRouter · about $0.01",
    briefKey: "Add OPENROUTER_API_KEY to .env and restart the server to get a reader’s brief.",
    error: "Error",
    era: "era",
    confidence: "confidence",
    profileWait: "The whole-book profile appears once Jev finishes every page.",
    library: "library",
    noNeighbours: "No other books with Jev data yet.",
    noFingerprint: "Neighbours appear once the book has a fingerprint.",
    coverage: (d: string, n: string) => `showing ${d} of ${n} pages · charts fill in as Jev reads`,
    measures: "What Jev measures on each page",
    preview: [
      ["emotions", "8", "Plutchik’s wheel, scored"],
      ["texture", "7", "pace · tension · interiority · imagery · ideas · humour · light"],
      ["mood", "11", "one choice"],
      ["narration", "9", "one choice"],
      ["themes", "19", "yes or no each"],
      ["whole book", "1", "genre · era · six scales, once per book"],
    ],
    previewCanon: "This corpus book has not been read yet.",
    previewLocal: "Press Analyze to build the dashboard.",
  },
  ru: {
    notFound: "Книга не найдена",
    notFoundCanon: "Этой книги нет в корпусе, или на сервере нет базы корпуса.",
    notFoundLocal: "Возможно, её удалили из вашей библиотеки.",
    home: "На главную",
    opening: "Открываем книгу…",
    corpus: "Корпус PelevinDB",
    readByJev: "прочитано Jev",
    gutenberg: "Проект «Гутенберг»",
    localFile: (f: string) => `Ваш файл · ${f}`,
    rank: (r: number) => `№ ${r}`,
    noCharacter: "Характер книги появится, когда Jev её прочитает.",
    arc: "дуга",
    pages: "страниц",
    chars: "знаков",
    reading: "время чтения",
    min: (n: number) => `${n} мин`,
    hours: (n: number) => `${n} ч`,
    jev: "прочитано Jev",
    complete: "полностью",
    tokens: "токены",
    cost: "стоимость",
    tokensHint: (tok: string, req: string, brief?: string) => `Jev: ${tok} входных токенов за ${req} запросов по $0,042 за миллион${brief ? ` · аннотация: ${brief} токенов` : ""}`,
    costHint: (jev: string, brief?: string) => `Jev ${jev}${brief ? ` · аннотация ${brief}` : ""}`,
    stop: "Стоп",
    resume: "Продолжить",
    analyze: "Анализировать",
    map: "На карте",
    export: "Экспорт",
    json: "JSON · все данные",
    csv: "CSV · страницы",
    yourCopy: "Ваша копия",
    delete: "Удалить книгу",
    deleteTitle: "Убрать из библиотеки",
    confirmDelete: (t: string) => `Удалить «${t}» и все её оценки?`,
    progress: (d: number, n: number) => `${d} из ${n} страниц · по ${SEGMENT_QUESTION_COUNT} вопросов`,
    canonNote: (d: string, n: string) => `Книга корпуса, только для чтения: Jev прочитал ${d} из ${n} страниц.`,
    noKey: "Добавьте TYPESAFE_API_KEY в .env и перезапустите сервер, чтобы Jev мог прочитать книгу.",
    howItWorks: `Каждая страница — один запрос к Jev с ${SEGMENT_QUESTION_COUNT} независимыми вопросами, затем один запрос обо всей книге. Текст уходит в TypeSafe только после нажатия «Анализировать».`,
    fingerprint: "координат отпечатка",
    meanOf: (n: number) => `среднее ${n} ${plural(n, ["другой книги", "других книг", "других книг"])}`,
    excerptNote: "Текст открывается по одной странице: выберите цитату, страницу на графике или строку в поиске, чтобы прочитать её целиком.",
    s: {
      brief: "Коротко",
      quotes: "Цитаты",
      insights: "Выводы",
      dna: "ДНК",
      spectrogram: "Спектрограмма",
      pulse: "Пульс",
      mood: "Настроение",
      narration: "Повествование",
      shape: "Форма",
      texture: "Фактура",
      whole: "Вся книга",
      themes: "Темы",
      neighbours: "Соседи",
    },
    n: {
      briefBy: (m: string) => `написано ${m} по данным ниже`,
      brief: "аннотация для читателя по всем измерениям на этой странице",
      extremes: "самые крайние страницы, найденные в коде по ответам Jev · нажмите, чтобы читать",
      explore: "отберите страницы по любому ответу Jev и отсортируйте по любой оценке",
      insights: "вычислено по ответам Jev · нажмите на страницу, чтобы читать",
      dna: "столбец — диапазон страниц · высота — сила эмоции · цвет — ведущая эмоция",
      spectrogram: "эмоции Плутчика по ходу книги · нажмите, чтобы читать",
      pulse: "напряжение, темп, свет и внутренний мир · отмечены крайние страницы",
      mood: "одно из 11 на страницу",
      narration: "одно из 9 на страницу",
      shape: "кривая света против шести сюжетов Воннегута",
      texture: "7 двухполюсных шкал · среднее по книге",
      whole: "отдельный запрос к Jev по шести страницам",
      themes: "10 из 19 · вероятность, что страница об этой теме",
      neighbours: "ближайшие отпечатки · косинусное сходство",
    },
    views: { extremes: "крайние", explore: "поиск" },
    quotesView: "Вид цитат",
    whyRead: "Зачем читать",
    whoSuits: "Кому подойдёт",
    skipIf: "Не стоит, если",
    tokensIn: "вход",
    tokensOut: "выход",
    rewriting: "Переписываем…",
    rewrite: "Переписать",
    briefWait: "Аннотация появится, когда Jev прочитает всю книгу.",
    briefOtherLang: "Русской аннотации пока нет, поэтому показана английская.",
    writeInLang: "Написать по-русски",
    briefCanon: "Для этой книги корпуса аннотации пока нет.",
    writing: "Пишем аннотацию…",
    writeBrief: "Написать аннотацию",
    briefCost: "отправляет в OpenRouter измеренные данные и шесть коротких цитат · около $0,01",
    briefKey: "Добавьте OPENROUTER_API_KEY в .env и перезапустите сервер, чтобы получить аннотацию.",
    error: "Ошибка",
    era: "эпоха",
    confidence: "уверенность",
    profileWait: "Профиль всей книги появится, когда Jev прочитает все страницы.",
    library: "библиотека",
    noNeighbours: "Других книг с данными Jev пока нет.",
    noFingerprint: "Соседи появятся, когда у книги будет отпечаток.",
    coverage: (d: string, n: string) => `показано ${d} из ${n} страниц · графики дополняются по мере чтения`,
    measures: "Что Jev измеряет на каждой странице",
    preview: [
      ["эмоции", "8", "колесо Плутчика, оценки"],
      ["фактура", "7", "темп · напряжение · внутренний мир · образность · идеи · юмор · свет"],
      ["настроение", "11", "один выбор"],
      ["повествование", "9", "один выбор"],
      ["темы", "19", "да или нет для каждой"],
      ["вся книга", "1", "жанр · эпоха · шесть шкал, один раз на книгу"],
    ],
    previewCanon: "Эту книгу корпуса ещё не прочитали.",
    previewLocal: "Нажмите «Анализировать», чтобы построить страницу книги.",
  },
};

function Panel({ n, title, note, className = "", children }: { n?: number; title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h3 data-n={n != null ? String(n).padStart(2, "0") : undefined}>{title}</h3>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N} ._-]/gu, "") || "xbook"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Main and secondary title: the Russian original and the English title, ordered by interface language. */
export function titles(title: string, titleEn: string | null | undefined, lang: Lang) {
  if (!titleEn || titleEn === title) return { main: title, sub: null };
  return lang === "ru" ? { main: title, sub: titleEn } : { main: titleEn, sub: title };
}

export function BookPage({ id, page }: { id: string; page?: number }) {
  const t = useT(T);
  const lang = useLang();
  const { meta, content, segments, missing, origin, rank, excerpt, year, kind, titleEn } = useBookView(id);
  const canon = origin === "corpus";
  // Analysing, rewriting briefs and deleting exist only for your own books in local mode.
  const local = useLocalMode();
  const editable = !canon && local;
  const { books } = useLibrary();
  const localCopy = canon ? books.find((b) => b.source === "gutenberg" && `pg-${b.sourceRef}` === id) : undefined;
  const job = useJob(id);
  const status = useServerStatus();
  const configured = status?.configured ?? null;
  const briefJob = useBriefJob(id);
  const corpus = useCorpus();
  const embedding = useEmbedding(corpus, DEFAULT_WEIGHTS);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    touchBook(id);
    window.scrollTo({ top: 0 });
  }, [id]);

  const analyses = useMemo(() => content?.analyses ?? [], [content]);
  const stats = useMemo(() => bookStats(segments, analyses), [segments, analyses]);
  const arc = useMemo(() => storyArc(series(analyses, (a) => a.texture.valence)), [analyses]);
  const peaks = useMemo(() => moments(analyses), [analyses]);
  const dna = useMemo(() => dnaInsights(analyses), [analyses]);
  const insights = useMemo(() => bookInsights(analyses), [analyses]);
  const [quoteView, setQuoteView] = useState<"extremes" | "explore">("extremes");
  const similar = useMemo(() => {
    const byId = new Map(corpus.map((s) => [s.id, s]));
    return neighbours(embedding.rows, id, 6).flatMap((n) => (byId.has(n.id) ? [{ ...n, star: byId.get(n.id)! }] : []));
  }, [embedding, corpus, id]);

  const selected = page ? Math.min(segments.length, page) - 1 : null;
  const openPage = useCallback((index: number) => navigate(`/book/${id}?page=${index + 1}`, { replace: page != null }), [id, page]);
  const openAt = (position: number) => openPage(Math.round(position * (segments.length - 1)));
  const move = useCallback(
    (delta: number) => {
      if (selected == null) return;
      const next = Math.max(0, Math.min(segments.length - 1, selected + delta));
      navigate(`/book/${id}?page=${next + 1}`, { replace: true });
    },
    [selected, segments.length, id],
  );
  // Excerpt-only corpus books: the open page's full text, fetched for that page alone.
  const pageText = useCorpusPage(id, selected != null ? selected + 1 : null, segments.length, excerpt && selected != null);
  const closeReader = useCallback(() => navigate(`/book/${id}`, { replace: true }), [id]);

  if (missing)
    return (
      <div className="empty-page book-missing">
        <p className="eyebrow">404</p>
        <h1>{t.notFound}</h1>
        <p>{canon ? t.notFoundCanon : t.notFoundLocal}</p>
        <button className="btn primary" onClick={() => navigate("/")}>
          {t.home}
        </button>
      </div>
    );
  if (!meta || !content) return <div className="loading-page book-loading">{t.opening}</div>;

  const running = job?.status === "running";
  const done = running ? job.done : meta.analyzed;
  const coverage = segments.length ? done / segments.length : 0;
  const complete = done === segments.length;
  const hasData = stats.narrative > 0;
  const topMood = MOODS.find((m) => m.id === argmax(stats.mood));
  const topMode = MODES.find((m) => m.id === argmax(stats.mode));
  const topThemes = topEntries(stats.themes, 3).map(([tid]) =>
    labelOf(
      THEMES.find((th) => th.id === tid)!,
      lang,
    ).toLowerCase(),
  );
  const lead = EMOTIONS.find((e) => e.id === argmax(stats.emotions))!;
  const arcShape = ARC_SHAPES.find((s) => s.id === arc.shape);
  const minutes = meta.chars / READING_CHARS_PER_MINUTE;
  const kindLabel = kind ? KIND_LABELS[kind]?.[lang] : null;
  const source = canon ? [kindLabel, year, `${t.corpus}${rank ? ` ${t.rank(rank)}` : ""}`].filter(Boolean).join(" · ") : meta.source === "gutenberg" ? t.gutenberg : t.localFile(meta.format);
  const picked = briefFor(content, lang);
  const brief = picked?.brief;
  const cost = spend(analyses, content.profile, brief);
  const others = corpus.filter((s) => s.id !== id).map((s) => s.fingerprint);
  const name = titles(meta.title, titleEn, lang);
  const n2 = (v: number) => num(lang, v);

  const exportData = (type: "json" | "csv") => {
    const book = { title: meta.title, author: meta.author, format: meta.format, source: meta.source };
    if (type === "json") download(`${meta.title}.json`, JSON.stringify(buildExport(book, segments, analyses, content.profile, meta.fingerprint, brief), null, 2), "application/json");
    else download(`${meta.title}.csv`, buildCsv(segments, analyses), "text/csv;charset=utf-8");
    setExportOpen(false);
  };
  let section = 0;
  const next = () => ++section;

  return (
    <div className="book-page">
      <section className="book-hero">
        <div className="hero-main">
          <div className="eyebrow">
            {source}
            {canon && <span className="corpus-badge">{t.readByJev}</span>}
          </div>
          <h1 className="book-title">{name.main}</h1>
          {name.sub && <p className="book-subtitle">{name.sub}</p>}
          <p className="book-author">{meta.author}</p>
          {hasData ? (
            <p className="book-character">
              <span>
                <Swatch color={lead.color} round />
                {labelOf(lead, lang).toLowerCase()}
              </span>
              {topMood && (
                <span>
                  <Swatch color={topMood.color} round />
                  {labelOf(topMood, lang).toLowerCase()}
                </span>
              )}
              {topMode && <span>{labelOf(topMode, lang).toLowerCase()}</span>}
              {topThemes.length > 0 && <span>{topThemes.join(", ")}</span>}
              {arcShape && (
                <span>
                  {t.arc}: {(lang === "ru" ? arcShape.ru : arcShape.label).toLowerCase()}
                </span>
              )}
            </p>
          ) : (
            <p className="book-character placeholder">{t.noCharacter}</p>
          )}
          <dl className="book-facts">
            <div>
              <dt>{t.pages}</dt>
              <dd className="num">{n2(segments.length)}</dd>
            </div>
            <div>
              <dt>{t.chars}</dt>
              <dd className="num">{n2(meta.chars)}</dd>
            </div>
            <div>
              <dt>{t.reading}</dt>
              <dd className="num">{minutes < 90 ? t.min(Math.round(minutes)) : t.hours(Math.round(minutes / 60))}</dd>
            </div>
            <div>
              <dt>{t.jev}</dt>
              <dd className="data-badge num">
                <Meter value={coverage} className="thin" /> {complete ? t.complete : pct(lang, coverage)}
              </dd>
            </div>
            <div title={t.tokensHint(n2(cost.jevTokens), n2(cost.jevRequests), cost.briefTokens ? n2(cost.briefTokens) : undefined)}>
              <dt>{t.tokens}</dt>
              <dd className="num">{tokens(cost.totalTokens)}</dd>
            </div>
            <div title={t.costHint(usd(cost.jevUsd), brief ? usd(cost.briefUsd) : undefined)}>
              <dt>{t.cost}</dt>
              <dd className="cost num">{usd(cost.totalUsd)}</dd>
            </div>
          </dl>
          <div className="book-actions">
            {editable &&
              !complete &&
              (running ? (
                <button className="btn" onClick={() => stopAnalysis(id)}>
                  {t.stop} · {done}/{segments.length}
                </button>
              ) : (
                <button className="btn primary" disabled={!configured} onClick={() => void startAnalysis(id)}>
                  {done ? t.resume : t.analyze}
                </button>
              ))}
            <button className="btn" onClick={() => navigate(`/map?focus=${id}`)} disabled={!meta.fingerprint}>
              {t.map}
            </button>
            <div className="menu-wrap">
              <button className="btn ghost" onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen}>
                {t.export}
              </button>
              {exportOpen && (
                <div className="menu">
                  <button onClick={() => exportData("json")}>{t.json}</button>
                  <button onClick={() => exportData("csv")}>{t.csv}</button>
                </div>
              )}
            </div>
            {canon ? (
              local &&
              localCopy && (
                <button className="btn ghost" onClick={() => navigate(`/book/${localCopy.id}`)}>
                  {t.yourCopy}
                </button>
              )
            ) : (
              editable && (
              <button
                className="btn ghost danger"
                aria-label={t.delete}
                title={t.deleteTitle}
                onClick={() => {
                  if (confirm(t.confirmDelete(meta.title))) {
                    stopAnalysis(id);
                    void removeBook(id).then(() => navigate("/library?tab=mine"));
                  }
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
                </svg>
              </button>
              )
            )}
          </div>
          {running && (
            <div className="progress-line" aria-live="polite">
              <Meter value={coverage} />
              <span className="num">{t.progress(done, segments.length)}</span>
            </div>
          )}
          {!complete && !running && (
            <p className="analysis-note" role={job?.status === "error" ? "alert" : undefined}>
              {canon ? t.canonNote(n2(done), n2(segments.length)) : job?.status === "error" ? `${t.error}: ${job.error}` : configured === false ? t.noKey : t.howItWorks}
            </p>
          )}
          {excerpt && (
            <p className="excerpt-note" role="note">
              {t.excerptNote}
            </p>
          )}
          {meta.fingerprint && (
            <div className="hero-strip">
              <PixelStrip values={fingerprintValues(meta.fingerprint)} size={8} label={t.fingerprint} />
            </div>
          )}
        </div>
        {meta.fingerprint && (
          <div className="hero-radar">
            <Radar axes={radarAxes(meta.fingerprint, meanSource(others), lang)} color={lead.color} refLabel={t.meanOf(others.length)} />
          </div>
        )}
      </section>

      <Panel n={next()} title={t.s.brief} note={brief ? t.n.briefBy(brief.model) : t.n.brief} className="brief-panel">
        {brief ? (
          <div className="brief" lang={picked!.lang}>
            {picked!.fallback && (
              <p className="brief-lang dim" lang={lang}>
                {t.briefOtherLang}
                {editable && status?.brief && (
                  <>
                    {" "}
                    <button className="link-u" onClick={() => void requestBrief(id, lang)} disabled={briefJob?.status === "running"}>
                      {briefJob?.status === "running" ? t.writing : t.writeInLang}
                    </button>
                  </>
                )}
              </p>
            )}
            <p className="brief-logline">{brief.logline}</p>
            <p className="brief-what">{brief.what}</p>
            <div className="brief-cols">
              <div>
                <h4 className="eyebrow">{t.whyRead}</h4>
                <ul>
                  {brief.why.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="eyebrow">{t.whoSuits}</h4>
                <ul>
                  {brief.who.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="brief-skip">
              <span className="eyebrow">{t.skipIf}</span> {brief.skip}
            </p>
            <p className="brief-foot num">
              {n2(brief.usage.prompt_tokens)} {t.tokensIn} · {n2(brief.usage.completion_tokens)} {t.tokensOut} · {usd(brief.usage.cost)}
              {editable && status?.brief && !picked!.fallback && (
                <button className="link-u" onClick={() => void requestBrief(id, lang)} disabled={briefJob?.status === "running"}>
                  {briefJob?.status === "running" ? t.rewriting : t.rewrite}
                </button>
              )}
            </p>
          </div>
        ) : !hasData || !complete ? (
          <p className="placeholder">{t.briefWait}</p>
        ) : canon ? (
          <p className="placeholder">{t.briefCanon}</p>
        ) : status?.brief ? (
          <div className="brief-empty">
            <button className="btn primary" onClick={() => void requestBrief(id, lang)} disabled={briefJob?.status === "running"}>
              {briefJob?.status === "running" ? t.writing : t.writeBrief}
            </button>
            <span className="dim">{t.briefCost}</span>
          </div>
        ) : (
          <p className="placeholder">{t.briefKey}</p>
        )}
        {briefJob?.status === "error" && (
          <p className="analysis-note" role="alert">
            {t.error}: {briefJob.error}
          </p>
        )}
      </Panel>

      {hasData && peaks.length > 0 && (
        <Panel n={next()} title={t.s.quotes} note={quoteView === "extremes" ? t.n.extremes : t.n.explore}>
          <div className="presets quote-views" role="group" aria-label={t.quotesView}>
            {(["extremes", "explore"] as const).map((v) => (
              <button key={v} className={quoteView === v ? "on" : ""} aria-pressed={quoteView === v} onClick={() => setQuoteView(v)}>
                {t.views[v]}
              </button>
            ))}
          </div>
          {quoteView === "extremes" ? (
            <ol className="quotes">
              {peaks.map((m) => (
                <li key={m.id}>
                  <button onClick={() => openPage(m.index)} style={{ ["--mark" as string]: m.color }}>
                    <span className="quote-label">
                      <Swatch color={m.color} round />
                      {lang === "ru" ? m.ru : m.label}
                    </span>
                    <q>{firstSentence(segments[m.index].text, 220)}</q>
                    <span className="quote-page num">
                      {pageRef(lang, m.index + 1)} · {pct(lang, m.index / Math.max(1, segments.length - 1))}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <QuoteExplorer segments={segments} analyses={analyses} onPick={openPage} />
          )}
        </Panel>
      )}

      {hasData && (
        <Panel n={next()} title={t.s.insights} note={t.n.insights}>
          <InsightList insights={insights} pages={segments.length} onPick={openPage} />
        </Panel>
      )}

      <Panel n={next()} title={t.s.dna} note={t.n.dna}>
        <Dna analyses={analyses} insights={dna} onPick={openPage} />
      </Panel>

      {hasData ? (
        <>
          <Panel n={next()} title={t.s.spectrogram} note={t.n.spectrogram}>
            <Spectrogram analyses={analyses} emotions={stats.emotions} onPick={openAt} />
          </Panel>
          <Panel n={next()} title={t.s.pulse} note={t.n.pulse}>
            <PulsePlot analyses={analyses} moments={peaks} onPick={openPage} />
          </Panel>

          <div className="grid three">
            <Panel n={next()} title={t.s.mood} note={t.n.mood}>
              <MoodBars mood={stats.mood} />
            </Panel>
            <Panel n={next()} title={t.s.narration} note={t.n.narration}>
              <ModeBars mode={stats.mode} />
            </Panel>
            <Panel n={next()} title={t.s.shape} note={t.n.shape}>
              <ArcPlot curve={arc.curve} shape={arc.shape} fits={arc.fits} />
            </Panel>
          </div>

          <div className="grid two pair">
            <Panel n={next()} title={t.s.texture} note={t.n.texture}>
              <Sliders items={TEXTURES.map((tx) => ({ id: tx.id, low: lowOf(tx, lang), high: highOf(tx, lang), value: stats.texture[tx.id], label: labelOf(tx, lang) }))} />
            </Panel>
            <Panel n={next()} title={t.s.whole} note={t.n.whole}>
              {content.profile ? (
                <>
                  <Bars
                    items={topEntries(content.profile.genre, 3).map(([gid, p]) => ({
                      id: gid,
                      label: labelOf(
                        GENRES.find((g) => g.id === gid)!,
                        lang,
                      ),
                      value: p,
                      color: "var(--d1)",
                    }))}
                    sort={false}
                  />
                  <p className="profile-era">
                    <span className="eyebrow">{t.era}</span>{" "}
                    <b>
                      {labelOf(
                        ERAS.find((e) => e.id === argmax(content.profile!.era))!,
                        lang,
                      )}
                    </b>
                  </p>
                  <Sliders
                    items={PROFILE_SCALES.map((s) => ({
                      id: s.id,
                      low: lowOf(s, lang),
                      high: highOf(s, lang),
                      value: content.profile!.scales[s.id],
                      label: `${t.confidence} ${pct(lang, content.profile!.scaleConfidence[s.id])}`,
                    }))}
                  />
                </>
              ) : (
                <p className="placeholder">{t.profileWait}</p>
              )}
            </Panel>
          </div>

          <Panel n={next()} title={t.s.themes} note={t.n.themes}>
            <ThemeLines analyses={analyses} themes={stats.themes} onPick={openAt} />
          </Panel>

          <Panel n={next()} title={t.s.neighbours} note={t.n.neighbours}>
            {similar.length ? (
              <ul className="neighbours">
                {similar.map(({ id: nid, similarity, star }) => (
                  <li key={nid}>
                    <button onClick={() => navigate(starPath(star))}>
                      <span className="nb-sim num">{Math.round(Math.max(0, similarity) * 100)}</span>
                      <span className="nb-name">
                        <b>{lang === "ru" || !star.titleEn ? star.title : star.titleEn}</b>{" "}
                        <small>
                          {star.author}
                          {star.year ? ` · ${star.year}` : ""}
                          {star.kind === "library" ? ` · ${t.library}` : ""}
                        </small>
                      </span>
                      <PixelStrip values={fingerprintValues(star.fingerprint)} size={3} idle=" " />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="placeholder">{meta.fingerprint ? t.noNeighbours : t.noFingerprint}</p>
            )}
          </Panel>
          {!complete && <p className="coverage-note">{t.coverage(n2(done), n2(segments.length))}</p>}
        </>
      ) : (
        <section className="preview panel">
          <p className="eyebrow">{t.measures}</p>
          <dl>
            {t.preview.map(([k, n, what]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="num">{n}</dd>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <p className="dim">{canon ? t.previewCanon : t.previewLocal}</p>
        </section>
      )}

      {selected != null && segments[selected] && (
        <Reader segment={segments[selected]} analysis={analyses[selected] ?? null} total={segments.length} onMove={move} onClose={closeReader} excerpt={excerpt} page={pageText} />
      )}
    </div>
  );
}
