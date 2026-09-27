import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { EMOTIONS, ERAS, GENRES, type EmotionId, highOf, labelOf, lowOf, MODES, MOODS, PROFILE_SCALES, SEGMENT_QUESTION_COUNT, TEXTURES, THEMES } from "../../../shared/catalog.ts";
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
import { GroupLegend, PixelStrip } from "../../ui/PixelStrip.tsx";
import { Meter, StackBar, Swatch } from "../../ui/term.tsx";
import { starPath, useCorpus, useEmbedding } from "../map/corpus.ts";
import { KIND_LABELS } from "../map/encoding.ts";
import { meanSource, Radar, radarAxes } from "./charts/Radar.tsx";
import { ArcPlot, Bars, Dna, PulsePlot, Sliders, Spectrogram, ThemeLines } from "./charts/Text.tsx";
import { num, pageRef, pct } from "./i18n.ts";
import { useDash, type DashState } from "./dash.ts";
import { InsightList } from "./Insights.tsx";
import { PreviewOffset, PreviewProvider } from "./preview.tsx";
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
    dashboard: "Measurements",
    c: {
      spectrogram: "emotions over the book",
      radar: "star chart",
      pulse: "pulse",
      quotes: "extreme pages",
      explore: "explore",
      mood: "mood",
      narration: "narration",
      shape: "story shape",
      texture: "texture vs corpus",
      whole: "whole book",
      themes: "themes over the book",
      neighbours: "neighbours",
      tension: "tension",
      vs: (n: number) => `vs ${n} ${plural(n, ["book", "books"])}`,
      corpusMean: "| = corpus mean",
      top: "top",
      moodMode: "mood · narration",
      sortBy: "sort",
      byScore: "score",
      byPage: "page",
      byYear: "year",
      byOrder: "order",
      byStrength: "strength",
      byAppearance: "first seen",
      clickHighlight: "click a part to highlight its pages",
      relNote: "relative: centre = corpus mean",
    },
    s: {
      brief: "Brief",
      quotes: "Extreme pages",
      insights: "Insights",
      dna: "Plot development",
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
    dashboard: "Измерения",
    c: {
      spectrogram: "эмоции по ходу книги",
      radar: "звёздная диаграмма",
      pulse: "пульс",
      quotes: "крайние страницы",
      explore: "поиск по страницам",
      mood: "настроение",
      narration: "повествование",
      shape: "форма сюжета",
      texture: "фактура против корпуса",
      whole: "вся книга",
      themes: "темы по ходу книги",
      neighbours: "соседи",
      tension: "напряжение",
      vs: (n: number) => `против ${n} ${plural(n, ["книги", "книг", "книг"])}`,
      corpusMean: "| = среднее по корпусу",
      top: "главное",
      moodMode: "настроение · повествование",
      sortBy: "сортировка",
      byScore: "сила",
      byPage: "стр.",
      byYear: "год",
      byOrder: "порядок",
      byStrength: "сила",
      byAppearance: "появление",
      clickHighlight: "нажмите на часть, чтобы подсветить её страницы",
      relNote: "относительно: центр = среднее по корпусу",
    },
    s: {
      brief: "Коротко",
      quotes: "Крайние страницы",
      insights: "Выводы",
      dna: "Развитие сюжета",
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

function Panel({ title, note, className = "", children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h3>{title}</h3>
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

  const dash = useDash(id);
  const { state: ds, set: setDash, path: dashPath } = dash;
  const selected = page ? Math.min(segments.length, page) - 1 : null;
  const openPage = useCallback((index: number) => navigate(dashPath(index + 1), { replace: page != null }), [dashPath, page]);
  const openAt = (position: number) => openPage(Math.round(position * (segments.length - 1)));
  const move = useCallback(
    (delta: number) => {
      if (selected == null) return;
      const next = Math.max(0, Math.min(segments.length - 1, selected + delta));
      navigate(dashPath(next + 1), { replace: true });
    },
    [selected, segments.length, dashPath],
  );
  // Excerpt-only corpus books: the open page's full text, fetched for that page alone.
  const pageText = useCorpusPage(id, selected != null ? selected + 1 : null, segments.length, excerpt && selected != null);
  const closeReader = useCallback(() => navigate(dashPath(null), { replace: true }), [dashPath]);

  // The dashboard's slice of the book: its own stats, arc and extreme pages, indexed from `from`.
  const view = useMemo(() => {
    const n = analyses.length;
    const from = Math.min(Math.max(0, n - 1), Math.floor((ds.range[0] / 100) * n));
    const to = Math.max(from + 1, Math.ceil((ds.range[1] / 100) * n));
    const a = analyses.slice(from, to);
    const segs = segments.slice(from, to);
    const [group, key] = (ds.hl ?? ":").split(":") as ["mood" | "mode" | "", string];
    const marks = ds.hl ? a.map((x) => !!x && (group === "mood" ? argmax(x.mood) : argmax(x.mode)) === key) : undefined;
    return {
      from,
      analyses: a,
      segments: segs,
      stats: bookStats(segs, a),
      arc: storyArc(series(a, (x) => x.texture.valence)),
      peaks: moments(a),
      marks,
      matches: marks ? marks.filter(Boolean).length : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses, segments, dash.key]);
  const pickIn = useCallback((i: number) => openPage(view.from + i), [openPage, view.from]);
  const atIn = useCallback((p: number) => openPage(view.from + Math.round(p * Math.max(0, view.analyses.length - 1))), [openPage, view]);

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
  const source = canon ? kindLabel : meta.source === "gutenberg" ? t.gutenberg : t.localFile(meta.format);
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
  const mean = meanSource(others);
  const vs = view.stats;
  const vMood = MOODS.find((m) => m.id === argmax(vs.mood));
  const vMode = MODES.find((m) => m.id === argmax(vs.mode));
  const vLead = EMOTIONS.find((e) => e.id === argmax(vs.emotions))!;
  const bestFit = view.arc.fits.find((f) => f.id === view.arc.shape);
  const textureRows = TEXTURES.map((tx) => ({ tx, v: vs.texture[tx.id], d: mean ? vs.texture[tx.id] - mean.texture[tx.id] : 0 }));
  const textureGap = mean ? [...textureRows].sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0] : null;
  const textureShown = ds.xs === "diff" ? [...textureRows].sort((a, b) => Math.abs(b.d) - Math.abs(a.d)) : textureRows;
  const topGenre = content.profile ? topEntries(content.profile.genre, 1)[0] : null;
  const topTheme = topEntries(vs.themes, 1)[0];
  const signed = (v: number) => `${v >= 0 ? "+" : "−"}${num(lang, Math.abs(v), 2)}`;
  // Relative mode centres every scale on the corpus mean: 0.5 + (book − corpus).
  const rel = (v: number, ref: number | undefined) => (ds.rel && ref != null ? Math.max(0, Math.min(1, 0.5 + v - ref)) : v);
  const peaksShown = ds.qs === "page" ? [...view.peaks].sort((a, b) => a.index - b.index) : view.peaks;
  const similarShown = ds.ns === "year" ? [...similar].sort((a, b) => (a.star.year ?? 9999) - (b.star.year ?? 9999)) : similar;
  const whole = ds.range[0] === 0 && ds.range[1] === 100;
  const actions = (
    <div className="book-actions title-actions">
      {editable &&
        !complete &&
        (running ? (
          <button className="btn small" onClick={() => stopAnalysis(id)}>
            {t.stop} · {done}/{segments.length}
          </button>
        ) : (
          <button className="btn small primary" disabled={!configured} onClick={() => void startAnalysis(id)}>
            {done ? t.resume : t.analyze}
          </button>
        ))}
      <button className="btn small" onClick={() => navigate(`/map?focus=${id}`)} disabled={!meta.fingerprint}>
        {t.map}
      </button>
      <div className="menu-wrap">
        <button className="btn small ghost" onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen}>
          {t.export}
        </button>
        {exportOpen && (
          <div className="menu">
            <button onClick={() => exportData("json")}>{t.json}</button>
            <button onClick={() => exportData("csv")}>{t.csv}</button>
          </div>
        )}
      </div>
      {canon
        ? local &&
          localCopy && (
            <button className="btn small ghost" onClick={() => navigate(`/book/${localCopy.id}`)}>
              {t.yourCopy}
            </button>
          )
        : editable && (
            <button
              className="btn small ghost danger"
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
          )}
    </div>
  );

  return (
    <PreviewProvider segments={segments}>
      <div className="book-page">
        {/* 1. Title block */}
        <header className="book-hero">
          <div className="eyebrow">{source}</div>
          <div className="book-title-row">
            <h1 className="book-title">
              {name.main}
              {year != null && <small className="book-year">{year}</small>}
            </h1>
            {actions}
          </div>
          {name.sub && <p className="book-subtitle">{name.sub}</p>}
          {!canon && <p className="book-author">{meta.author}</p>}
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

          {/* 2. The 85-dimension fingerprint, compact */}
          {meta.fingerprint && (
            <div className="hero-strip">
              <PixelStrip values={fingerprintValues(meta.fingerprint)} size={5} label={t.fingerprint} />
              <GroupLegend />
            </div>
          )}

          {/* 3. Facts */}
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
            {!canon && (
              <>
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
              </>
            )}
          </dl>
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
        </header>

        {/* 4. Plot development (emotion columns per page range), full width */}
        <Panel title={t.s.dna} note={t.n.dna} className="dna-panel">
          <Dna analyses={analyses} insights={dna} onPick={openPage} />
        </Panel>

        {/* 5. Brief */}
        <Panel title={t.s.brief} note={brief ? t.n.briefBy(brief.model) : t.n.brief} className="brief-panel">
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
                {!canon && `${n2(brief.usage.prompt_tokens)} ${t.tokensIn} · ${n2(brief.usage.completion_tokens)} ${t.tokensOut} · ${usd(brief.usage.cost)}`}
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

        {/* 6a. Extreme pages (and explore), readable, above the dashboard */}
        {hasData && view.peaks.length > 0 && (
          <section className="panel extremes-panel">
            <header className="panel-head">
              <h3>{t.s.quotes}</h3>
              <p>{quoteView === "extremes" ? t.n.extremes : t.n.explore}</p>
              <span className="cell-controls">
                <Tabs
                  label={t.quotesView}
                  value={quoteView}
                  options={[
                    ["extremes", t.views.extremes],
                    ["explore", t.views.explore],
                  ]}
                  onChange={setQuoteView}
                />
                {quoteView === "extremes" && (
                  <Tabs
                    label={t.c.sortBy}
                    value={ds.qs}
                    options={[
                      ["score", t.c.byScore],
                      ["page", t.c.byPage],
                    ]}
                    onChange={(qs) => setDash({ qs })}
                  />
                )}
              </span>
            </header>
            {quoteView === "extremes" ? (
              <ol className="quotes">
                {peaksShown.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => pickIn(m.index)}>
                      <span className="quote-label">
                        <Swatch color={m.color} round />
                        {lang === "ru" ? m.ru : m.label}
                      </span>
                      <q>{firstSentence(view.segments[m.index].text, 220)}</q>
                      <span className="quote-page num">
                        {pageRef(lang, view.from + m.index + 1)} · {pct(lang, (view.from + m.index) / Math.max(1, segments.length - 1))}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <QuoteExplorer segments={view.segments} analyses={view.analyses} onPick={pickIn} offset={view.from} />
            )}
          </section>
        )}

        {/* 6. One dense dashboard of everything else, with analyst controls in the URL */}
        {hasData ? (
          <PreviewOffset offset={view.from}>
            <section className="dash" aria-label={t.dashboard}>
              <DashBar state={ds} set={setDash} matches={view.matches} pages={view.analyses.length} />

              <Cell span={8} title={t.c.spectrogram} keyNote={`${labelOf(vLead, lang).toLowerCase()} ${num(lang, vs.emotions[vLead.id], 2)}`}>
                <Spectrogram analyses={view.analyses} emotions={vs.emotions} onPick={atIn} compact only={ds.emo} smoothing={ds.smooth} marks={view.marks} />
              </Cell>
              <Cell span={4} title={t.c.radar} keyNote={others.length ? t.c.vs(others.length) : undefined} className="cell-radar">
                {meta.fingerprint && <Radar axes={radarAxes(meta.fingerprint, mean, lang)} color={lead.color} refLabel={t.meanOf(others.length)} />}
              </Cell>

              <Cell span={8} title={t.c.pulse} keyNote={insights.tension != null && whole ? `${t.c.tension} ${insights.tension > 0 ? "↑" : "↓"} r=${num(lang, insights.tension, 2)}` : undefined}>
                <PulsePlot analyses={view.analyses} moments={view.peaks} onPick={pickIn} compact smoothing={ds.smooth} highlight={view.marks} />
              </Cell>
              <Cell
                span={4}
                title={t.c.neighbours}
                controls={
                  <Tabs
                    label={t.c.sortBy}
                    value={ds.ns}
                    options={[
                      ["similarity", "cos"],
                      ["year", t.c.byYear],
                    ]}
                    onChange={(ns) => setDash({ ns })}
                  />
                }
              >
                {similarShown.length ? (
                  <ul className="neighbours compact">
                    {similarShown.map(({ id: nid, similarity, star }) => (
                      <li key={nid}>
                        <button onClick={() => navigate(starPath(star))}>
                          <span className="nb-sim num">{Math.round(Math.max(0, similarity) * 100)}</span>
                          <span className="nb-name">
                            <b>{lang === "ru" || !star.titleEn ? star.title : star.titleEn}</b>
                            <small className="num">
                              {star.year ?? ""}
                              {star.kind === "library" ? ` · ${t.library}` : ""}
                            </small>
                          </span>
                          <PixelStrip values={fingerprintValues(star.fingerprint)} size={2} idle=" " />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="placeholder">{meta.fingerprint ? t.noNeighbours : t.noFingerprint}</p>
                )}
              </Cell>

              <Cell span={6} title={t.c.moodMode} keyNote={vMood ? `${labelOf(vMood, lang).toLowerCase()} ${pct(lang, vs.mood[vMood.id])}` : undefined}>
                <Strip
                  label={t.c.mood}
                  active={ds.hl}
                  onPick={(hl) => setDash({ hl })}
                  group="mood"
                  items={MOODS.map((m) => ({ id: m.id, label: labelOf(m, lang), value: vs.mood[m.id] ?? 0, color: m.color }))}
                />
                <Strip
                  label={t.c.narration}
                  active={ds.hl}
                  onPick={(hl) => setDash({ hl })}
                  group="mode"
                  items={MODES.filter((m) => m.id !== "paratext").map((m) => ({ id: m.id, label: labelOf(m, lang), value: vs.mode[m.id] ?? 0, color: m.color }))}
                />
                {vMode && (
                  <p className="cell-foot">
                    {t.c.narration}: {labelOf(vMode, lang).toLowerCase()} {pct(lang, vs.mode[vMode.id])} · {t.c.clickHighlight}
                  </p>
                )}
              </Cell>
              <Cell span={6} title={t.c.shape} keyNote={bestFit ? `r=${num(lang, bestFit.r, 2)}` : undefined}>
                <ArcPlot curve={view.arc.curve} shape={view.arc.shape} fits={view.arc.fits} compact pages={view.analyses.length} onPick={pickIn} />
              </Cell>
              <Cell
                span={6}
                title={t.c.texture}
                keyNote={textureGap ? `${labelOf(textureGap.tx, lang).toLowerCase()} ${signed(textureGap.d)}` : undefined}
                controls={
                  mean && (
                    <Tabs
                      label={t.c.sortBy}
                      value={ds.xs}
                      options={[
                        ["value", t.c.byOrder],
                        ["diff", "Δ"],
                      ]}
                      onChange={(xs) => setDash({ xs })}
                    />
                  )
                }
              >
                <Sliders
                  items={textureShown.map(({ tx, v }) => ({
                    id: tx.id,
                    low: lowOf(tx, lang),
                    high: highOf(tx, lang),
                    value: rel(v, mean?.texture[tx.id]),
                    label: labelOf(tx, lang),
                    reference: ds.rel ? 0.5 : mean?.texture[tx.id],
                  }))}
                />
                {mean && <p className="cell-foot">{ds.rel ? t.c.relNote : t.c.corpusMean}</p>}
              </Cell>
              <Cell
                span={6}
                title={t.c.whole}
                keyNote={
                  topGenre
                    ? `${labelOf(
                        GENRES.find((g) => g.id === topGenre[0])!,
                        lang,
                      ).toLowerCase()} ${pct(lang, topGenre[1])}`
                    : undefined
                }
              >
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
                      items={PROFILE_SCALES.map((ps) => ({
                        id: ps.id,
                        low: lowOf(ps, lang),
                        high: highOf(ps, lang),
                        value: rel(content.profile!.scales[ps.id], mean?.profile?.scales[ps.id]),
                        label: `${t.confidence} ${pct(lang, content.profile!.scaleConfidence[ps.id])}`,
                        reference: ds.rel ? 0.5 : mean?.profile?.scales[ps.id],
                      }))}
                    />
                  </>
                ) : (
                  <p className="placeholder">{t.profileWait}</p>
                )}
              </Cell>

              <Cell
                span={12}
                title={t.c.themes}
                keyNote={
                  topTheme
                    ? `${labelOf(
                        THEMES.find((th) => th.id === topTheme[0])!,
                        lang,
                      ).toLowerCase()} ${pct(lang, topTheme[1])}`
                    : undefined
                }
                controls={
                  <Tabs
                    label={t.c.sortBy}
                    value={ds.ts}
                    options={[
                      ["strength", t.c.byStrength],
                      ["appearance", t.c.byAppearance],
                    ]}
                    onChange={(ts) => setDash({ ts })}
                  />
                }
              >
                <ThemeLines analyses={view.analyses} themes={vs.themes} onPick={atIn} compact order={ds.ts} smoothing={ds.smooth} marks={view.marks} />
              </Cell>
              {!complete && <p className="coverage-note">{t.coverage(n2(done), n2(segments.length))}</p>}
            </section>
          </PreviewOffset>
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

        {/* 7. Insights at the end */}
        {hasData && (
          <Panel title={t.s.insights} note={t.n.insights}>
            <InsightList insights={insights} pages={segments.length} onPick={openPage} />
          </Panel>
        )}

        {selected != null && segments[selected] && (
          <Reader segment={segments[selected]} analysis={analyses[selected] ?? null} total={segments.length} onMove={move} onClose={closeReader} excerpt={excerpt} page={pageText} />
        )}
      </div>
    </PreviewProvider>
  );
}

/** One dashboard cell: a tiny mono title, optional controls, an optional key number, and the chart. */
function Cell({ span, title, keyNote, controls, className = "", children }: { span: number; title: string; keyNote?: ReactNode; controls?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`cell span-${span} ${className}`}>
      <header className="cell-head">
        <h3>{title}</h3>
        {controls && <span className="cell-controls">{controls}</span>}
        {keyNote != null && <span className="cell-key num">{keyNote}</span>}
      </header>
      {children}
    </section>
  );
}

/** A tiny mono segmented control. */
function Tabs<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: [V, string][]; onChange: (v: V) => void }) {
  return (
    <span className="cell-tabs" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </span>
  );
}

/** A distribution as one stacked strip plus its largest parts; clicking a part highlights its pages everywhere. */
function Strip({
  label,
  group,
  items,
  active,
  onPick,
}: {
  label: string;
  group: "mood" | "mode";
  items: { id: string; label: string; value: number; color: string }[];
  active: string | null;
  onPick: (hl: string | null) => void;
}) {
  const lang = useLang();
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, i) => sum + i.value, 0) || 1;
  const shown = hover ? sorted.filter((i) => i.id === hover) : sorted.slice(0, 3);
  return (
    <div className="strip">
      <span className="strip-label">{label}</span>
      <StackBar items={sorted} onHover={setHover} />
      <ul className="strip-top">
        {shown.map((i) => {
          const key = `${group}:${i.id}`;
          return (
            <li key={i.id}>
              <button className={active === key ? "on" : ""} aria-pressed={active === key} onClick={() => onPick(active === key ? null : key)}>
                <Swatch color={i.color} />
                <span>{i.label.toLowerCase()}</span>
                <b className="num">{pct(lang, i.value / total)}</b>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const BAR = {
  en: {
    label: "Dashboard filters",
    range: "range",
    ranges: [
      ["0-100", "whole"],
      ["0-33", "1st ⅓"],
      ["33-67", "2nd ⅓"],
      ["67-100", "3rd ⅓"],
    ] as [string, string][],
    from: "from %",
    to: "to %",
    emotions: "emotions",
    allEmotions: "all",
    highlight: "highlight",
    none: "none",
    mood: "mood",
    narration: "narration",
    smooth: "smooth",
    scale: "scale",
    abs: "abs",
    rel: "rel",
    matches: (n: number, of: number) => `${n}/${of} pages`,
    reset: "reset",
  },
  ru: {
    label: "Фильтры панели",
    range: "часть",
    ranges: [
      ["0-100", "вся"],
      ["0-33", "1-я ⅓"],
      ["33-67", "2-я ⅓"],
      ["67-100", "3-я ⅓"],
    ] as [string, string][],
    from: "от %",
    to: "до %",
    emotions: "эмоции",
    allEmotions: "все",
    highlight: "подсветка",
    none: "нет",
    mood: "настроение",
    narration: "повествование",
    smooth: "сглаживание",
    scale: "шкала",
    abs: "абс",
    rel: "отн",
    matches: (n: number, of: number) => `${n}/${of} стр.`,
    reset: "сброс",
  },
};

/** The dashboard's filter bar: part of the book, emotions shown, highlighted pages, smoothing and scale. */
function DashBar({ state, set, matches, pages }: { state: DashState; set: (p: Partial<DashState>) => void; matches: number; pages: number }) {
  const t = useT(BAR);
  const lang = useLang();
  const range = `${state.range[0]}-${state.range[1]}`;
  const clampPct = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== "" ? Math.max(0, Math.min(100, Math.round(Number(v)))) : fallback);
  const toggleEmo = (id: EmotionId) => set({ emo: state.emo.includes(id) ? state.emo.filter((e) => e !== id) : [...state.emo, id] });
  const changed = range !== "0-100" || state.emo.length || state.hl || !state.smooth || state.rel;
  return (
    <div className="dash-bar" role="group" aria-label={t.label}>
      <span className="dash-field">
        <span className="dash-label">{t.range}</span>
        <Tabs
          label={t.range}
          value={range}
          options={t.ranges.some(([v]) => v === range) ? t.ranges : [...t.ranges, [range, `${state.range[0]}–${state.range[1]}%`]]}
          onChange={(v) => set({ range: v.split("-").map(Number) as [number, number] })}
        />
        <input
          className="dash-num"
          type="number"
          min={0}
          max={99}
          value={state.range[0]}
          aria-label={t.from}
          onChange={(e) => set({ range: [Math.min(clampPct(e.target.value, 0), state.range[1] - 1), state.range[1]] })}
        />
        <span className="dim">–</span>
        <input
          className="dash-num"
          type="number"
          min={1}
          max={100}
          value={state.range[1]}
          aria-label={t.to}
          onChange={(e) => set({ range: [state.range[0], Math.max(clampPct(e.target.value, 100), state.range[0] + 1)] })}
        />
      </span>
      <span className="dash-field">
        <span className="dash-label">{t.emotions}</span>
        <span className="cell-tabs dash-emos" role="group" aria-label={t.emotions}>
          <button className={!state.emo.length ? "on" : ""} aria-pressed={!state.emo.length} onClick={() => set({ emo: [] })}>
            {t.allEmotions}
          </button>
          {EMOTIONS.map((e) => (
            <button key={e.id} className={state.emo.includes(e.id) ? "on" : ""} aria-pressed={state.emo.includes(e.id)} onClick={() => toggleEmo(e.id)} title={labelOf(e, lang)}>
              <Swatch color={e.color} round />
              {labelOf(e, lang).toLowerCase()}
            </button>
          ))}
        </span>
      </span>
      <span className="dash-field">
        <label className="dash-label" htmlFor="dash-hl">
          {t.highlight}
        </label>
        <select id="dash-hl" className="dash-select" value={state.hl ?? ""} onChange={(e) => set({ hl: e.target.value || null })}>
          <option value="">{t.none}</option>
          <optgroup label={t.mood}>
            {MOODS.map((m) => (
              <option key={m.id} value={`mood:${m.id}`}>
                {labelOf(m, lang).toLowerCase()}
              </option>
            ))}
          </optgroup>
          <optgroup label={t.narration}>
            {MODES.filter((m) => m.id !== "paratext").map((m) => (
              <option key={m.id} value={`mode:${m.id}`}>
                {labelOf(m, lang).toLowerCase()}
              </option>
            ))}
          </optgroup>
        </select>
        {state.hl && <span className="dash-count num">{t.matches(matches, pages)}</span>}
      </span>
      <span className="dash-field">
        <Tabs
          label={t.smooth}
          value={state.smooth ? "on" : "off"}
          options={[
            ["on", `${t.smooth} ✓`],
            ["off", `${t.smooth} ✗`],
          ]}
          onChange={(v) => set({ smooth: v === "on" })}
        />
        <span className="dash-label">{t.scale}</span>
        <Tabs
          label={t.scale}
          value={state.rel ? "rel" : "abs"}
          options={[
            ["abs", t.abs],
            ["rel", t.rel],
          ]}
          onChange={(v) => set({ rel: v === "rel" })}
        />
      </span>
      {changed ? (
        <button className="link-u dash-reset" onClick={() => set({ range: [0, 100], emo: [], hl: null, smooth: true, rel: false })}>
          {t.reset}
        </button>
      ) : null}
    </div>
  );
}
