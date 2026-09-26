import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  Layers3,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildExport,
  colorFor,
  demoScores,
  dominant,
  emotions,
  intensity,
  PAGE_CHARS,
  sampleBook,
  segmentText,
  treemap,
  type Book,
  type Emotion,
  type Mode,
  type Segment,
} from "./model";
import { importBook } from "./import";
const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
function Dot({ color }: { color: string }) {
  return <i className="dot" style={{ background: color }} />;
}
export default function App() {
  const [book, setBook] = useState<Book>(sampleBook);
  const [mode, setMode] = useState<Mode>("pages");
  const [segments, setSegments] = useState<Segment[]>(() =>
    demoScores(segmentText(sampleBook.text, "pages")),
  );
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<Emotion | null>(null);
  const [view, setView] = useState<"sequence" | "treemap">("sequence");
  const [modal, setModal] = useState<"upload" | "method" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [drag, setDrag] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [chartMode, setChartMode] = useState<"all" | "dominant">("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => setConnected(s.configured))
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,a[href]",
        );
        const first = focusable?.[0],
          last = focusable?.[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal]);
  const analyzed = segments.filter((s) => s.scores).length;
  const current = segments[selected] ?? segments[0];
  const stats = useMemo(() => {
    const totalWeight = segments
      .filter((s) => s.scores)
      .reduce((a, s) => a + s.text.length, 0);
    return emotions
      .map((e) => ({
        ...e,
        mean: totalWeight
          ? segments.reduce(
              (a, s) => a + (s.scores?.[e.id] ?? 0) * s.text.length,
              0,
            ) / totalWeight
          : 0,
        count: segments.filter((s) => dominant(s) === e.id).length,
      }))
      .sort((a, b) => b.mean - a.mean);
  }, [segments]);
  const average = analyzed
    ? segments.reduce(
        (a, s) => a + intensity(s) * (s.scores ? s.text.length : 0),
        0,
      ) /
      segments.filter((s) => s.scores).reduce((a, s) => a + s.text.length, 0)
    : 0;
  const chart = useMemo(() => {
    const step = Math.max(1, Math.ceil(segments.length / 160));
    return Array.from({ length: Math.ceil(segments.length / step) }, (_, i) => {
      const chunk = segments
        .slice(i * step, (i + 1) * step)
        .filter((s) => s.scores);
      return {
        page: i * step + 1,
        intensity: chunk.length
          ? chunk.reduce((a, s) => a + intensity(s), 0) / chunk.length
          : null,
        ...Object.fromEntries(
          emotions.map((e) => [
            e.id,
            chunk.length
              ? chunk.reduce((a, s) => a + s.scores![e.id], 0) / chunk.length
              : null,
          ]),
        ),
      };
    });
  }, [segments]);
  function reset(next: Book, nextMode: Mode) {
    abortRef.current?.abort();
    setBusy(false);
    setBook(next);
    setMode(nextMode);
    setSelected(0);
    setFilter(null);
    setError("");
    const parts = segmentText(next.text, nextMode);
    setSegments(next.demo ? demoScores(parts) : parts);
  }
  async function upload(file?: File) {
    if (!file || importing) return;
    setImporting(true);
    setError("");
    try {
      const next = await importBook(file);
      reset(next, mode);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть книгу.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function analyze() {
    if (busy || !connected) return;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    const queue = segments.filter((s) => !s.scores);
    let next = 0;
    try {
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (next < queue.length && !controller.signal.aborted) {
            const segment = queue[next++];
            const response = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: segment.text }),
              signal: controller.signal,
            });
            const result = await response.json();
            controller.signal.throwIfAborted();
            if (!response.ok) throw new Error(result.error || "Ошибка анализа");
            setSegments((old) =>
              old.map((s) => (s.id === segment.id ? { ...s, ...result } : s)),
            );
          }
        }),
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "Ошибка анализа");
        controller.abort();
      }
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  }
  function download(type: "json" | "csv") {
    const data = buildExport(book, mode, segments);
    const quote = (v: unknown) =>
      '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const content =
      type === "json"
        ? JSON.stringify(data, null, 2)
        : "\uFEFF" +
          [
            [
              "id",
              "start",
              "end",
              "text",
              "model",
              "demo",
              "mode",
              "status",
              ...emotions.map((e) => e.id),
              ...emotions.map((e) => e.id + "_confidence"),
            ],
            ...segments.map((s) => [
              s.id,
              s.start,
              s.end,
              /^[=+@\-\t\r]/.test(s.text) ? "'" + s.text : s.text,
              s.model,
              !!book.demo,
              mode,
              s.scores ? "complete" : "not-analyzed",
              ...emotions.map((e) => s.scores?.[e.id]),
              ...emotions.map((e) => s.confidence?.[e.id]),
            ]),
          ]
            .map((row) => row.map(quote).join(","))
            .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], {
        type: type === "json" ? "application/json" : "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${book.title.replace(/[^\p{L}\p{N} _-]/gu, "") || "xbook"}.${type}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportOpen(false);
  }
  function cell(s: Segment) {
    const dim = filter && dominant(s) !== filter;
    return (
      <button
        key={s.id}
        className={`tile ${s.id === current.id ? "selected" : ""}`}
        style={{
          background: s.scores ? colorFor(s) : "#e0e4dc",
          opacity: dim ? 0.16 : 0.56 + intensity(s) * 0.44,
        }}
        onClick={() => setSelected(s.id - 1)}
        aria-label={`${mode === "pages" ? "Страница" : "Фрагмент"} ${s.id}, ${emotions.find((e) => e.id === dominant(s))?.label ?? (s.scores ? "Нейтрально" : "Не проанализировано")}`}
        aria-pressed={s.id === current.id}
        title={`№ ${s.id} · ${emotions.find((e) => e.id === dominant(s))?.label ?? "Без оценки"} · ${Math.round(intensity(s) * 100)}%`}
      />
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="logo" href="/" aria-label="xbook главная">
          <span className="brand-symbol">x</span>xbook
          <span className="beta">BETA</span>
        </a>
        <div className="workspace-label">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <button
          className="nav-item active"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <BookOpen size={18} /> Атлас книги <span className="nav-dot" />
        </button>
        <button className="nav-item" onClick={() => setModal("method")}>
          <SlidersHorizontal size={18} /> Методология{" "}
          <ArrowUpRight size={14} className="nav-end" />
        </button>
        <div className="sidebar-divider" />
        <div className="workspace-label book-label">
          ТЕКУЩАЯ КНИГА{" "}
          <button
            title="Загрузить книгу"
            aria-label="Загрузить книгу"
            onClick={() => setModal("upload")}
          >
            <Plus size={17} />
          </button>
        </div>
        <button className="library-book" onClick={() => setSelected(0)}>
          <span className="mini-cover">
            <span>море</span>
          </span>
          <span>
            <strong>{book.title}</strong>
            <small>
              {book.demo
                ? "Демо-датасет"
                : book.format + " · " + fmt(segments.length) + " фрагментов"}
            </small>
          </span>
        </button>
        <div className="sidebar-bottom">
          <div className="small-map" aria-hidden="true">
            {Array.from({ length: 35 }, (_, i) => (
              <i
                key={i}
                style={{
                  background: emotions[(i * 7 + Math.floor(i / 7)) % 8].color,
                  opacity: 0.35 + (i % 4) * 0.14,
                }}
              />
            ))}
          </div>
          <h3>
            У каждой истории
            <br />
            свой ландшафт.
          </h3>
          <p>
            Посмотрите на знакомый
            <br />
            текст по-новому.
          </p>
          <button onClick={() => setModal("method")}>
            Как это работает <ArrowUpRight size={14} />
          </button>
          <div className="local-status">
            <span /> {connected ? "Jev подключён" : "Локальное пространство"}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            Библиотека <span>/</span>
            <strong>Атлас книги</strong>
          </div>
          <button className="help" onClick={() => setModal("method")}>
            <CircleHelp size={16} /> О проекте
          </button>
        </header>
        <main>
          <section className="page-heading">
            <div className="eyebrow">
              <span /> ТЕКСТ. ЧУВСТВА. ДАННЫЕ.
            </div>
            <div className="heading-row">
              <div>
                <h1>Эмоциональный атлас</h1>
                <p>История между строк — в цвете, ритме и эмоциях.</p>
              </div>
              <button className="primary" onClick={() => setModal("upload")}>
                <Plus size={17} /> Загрузить книгу
              </button>
            </div>
          </section>
          {error && !modal && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Закрыть ошибку">
                <X size={16} />
              </button>
            </div>
          )}
          <section className="book-strip">
            <div className="book-cover" aria-hidden="true">
              <span>
                там, где
                <br />
                начинается
              </span>
              <b>море</b>
              <i />
            </div>
            <div className="book-info">
              <div className="book-title-row">
                <h2>{book.title}</h2>
                <span className="format-tag">{book.format}</span>
              </div>
              <p>{book.author}</p>
              <div className="book-meta">
                <span>
                  <FileText size={13} /> {fmt(book.text.length)} знаков
                </span>
                <span className="tiny-separator">·</span>
                <span>
                  {fmt(segments.length)}{" "}
                  {mode === "pages" ? "условных страниц" : "фрагментов"}
                </span>
                <span className="data-badge">
                  {book.demo ? (
                    <Sparkles size={11} />
                  ) : analyzed === segments.length ? (
                    <Check size={11} />
                  ) : (
                    <Layers3 size={11} />
                  )}
                  {book.demo
                    ? "Демо-данные"
                    : analyzed === segments.length
                      ? "Анализ завершён"
                      : analyzed
                        ? `${analyzed} / ${segments.length}`
                        : "Готово к анализу"}
                </span>
              </div>
            </div>
            <div className="export-wrap">
              <button
                className="secondary"
                onClick={() => setExportOpen(!exportOpen)}
                aria-expanded={exportOpen}
              >
                <ArrowDownToLine size={15} /> Экспорт <ChevronDown size={13} />
              </button>
              {exportOpen && (
                <div className="export-menu">
                  <button onClick={() => download("json")}>
                    JSON · полный датасет
                  </button>
                  <button onClick={() => download("csv")}>
                    CSV · таблица оценок
                  </button>
                </div>
              )}
            </div>
          </section>
          {!book.demo && analyzed < segments.length && (
            <section className="analysis-banner">
              <div>
                <strong>
                  {busy
                    ? `Анализируем текст · ${analyzed} из ${segments.length}`
                    : connected
                      ? "Книга готова к исследованию"
                      : "Текст загружен. Подключите Jev для анализа."}
                </strong>
                <p>
                  {connected
                    ? "Текст будет отправлен в TypeSafe. 8 независимых оценок на фрагмент, до 4 запросов одновременно."
                    : "Добавьте TYPESAFE_API_KEY в .env и перезапустите сервер. Демо-книга доступна без ключа."}
                </p>
              </div>
              {busy ? (
                <button
                  className="secondary"
                  onClick={() => {
                    abortRef.current?.abort();
                    setBusy(false);
                  }}
                >
                  Остановить
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={!connected}
                  onClick={analyze}
                >
                  <Sparkles size={15} />
                  {analyzed ? "Продолжить" : "Анализировать"}
                </button>
              )}
            </section>
          )}
          <div className="metrics">
            <div>
              <span>
                Единицы анализа <Layers3 size={14} />
              </span>
              <strong>
                {fmt(segments.length)}
                <small>{mode === "pages" ? "страниц" : "фрагментов"}</small>
              </strong>
              <p>
                {mode === "pages"
                  ? `До ${fmt(PAGE_CHARS)} знаков на страницу`
                  : "По абзацам, длинные разделены"}
              </p>
            </div>
            <div>
              <span>
                Ведущая эмоция <span className="metric-icon">↗</span>
              </span>
              <strong className="emotion-metric">
                <Dot color={stats[0].color} />
                {analyzed ? stats[0].label : "—"}
              </strong>
              <p>
                {analyzed
                  ? `${Math.round(stats[0].mean * 100)}% · средняя выраженность`
                  : "Появится после анализа"}
              </p>
            </div>
            <div>
              <span>
                Эмоциональная интенсивность{" "}
                <span className="metric-icon">⌁</span>
              </span>
              <strong>
                {analyzed ? Math.round(average * 100) : "—"}
                <small>/ 100</small>
              </strong>
              <div className="meter">
                <i style={{ width: `${average * 100}%` }} />
              </div>
            </div>
            <div>
              <span>
                Измерения <span className="metric-icon">◌</span>
              </span>
              <strong>
                8<small>эмоций</small>
              </strong>
              <p>Независимые оценки от 0 до 1</p>
            </div>
          </div>
          <div className="section-bar">
            <div className="section-tabs">
              <span className="section-tab">
                Обзор эмоций <span>01</span>
              </span>
            </div>
            <button className="method-link" onClick={() => setModal("method")}>
              <SlidersHorizontal size={14} /> Как считаем страницы
            </button>
          </div>
          <div className="visual-grid">
            <section className="panel map-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    Ландшафт книги{" "}
                    <span className="subtle-pill">{fmt(segments.length)}</span>
                  </h3>
                  <p>
                    {view === "sequence"
                      ? "Одна ячейка — один фрагмент. Читайте слева направо."
                      : "Площадь группы — число фрагментов с ведущей эмоцией."}
                  </p>
                </div>
                <div className="segmented">
                  <button
                    className={view === "sequence" ? "chosen" : ""}
                    onClick={() => setView("sequence")}
                  >
                    Страницы
                  </button>
                  <button
                    className={view === "treemap" ? "chosen" : ""}
                    onClick={() => setView("treemap")}
                  >
                    Treemap
                  </button>
                </div>
              </div>
              <div className="map-toolbar">
                <div className="map-key">
                  <span className="little-grid">▦</span>
                  {view === "sequence"
                    ? "Порядок повествования"
                    : "Группировка по эмоциям"}
                </div>
                <select
                  aria-label="Разбиение текста"
                  value={mode}
                  disabled={busy}
                  onChange={(e) => reset(book, e.target.value as Mode)}
                >
                  <option value="pages">Условные страницы</option>
                  <option value="paragraphs">Абзацы</option>
                </select>
              </div>
              {view === "sequence" ? (
                <div className="page-map">{segments.map(cell)}</div>
              ) : (
                <div className="treemap">
                  {treemap(
                    [
                      ...emotions.map((e) => ({
                        id: e.id,
                        value: segments.filter((s) => dominant(s) === e.id)
                          .length,
                      })),
                      {
                        id: "neutral",
                        value: segments.filter((s) => dominant(s) === "neutral")
                          .length,
                      },
                    ],
                    0,
                    0,
                    160,
                    100,
                  ).map((rect) => {
                    const emotion = emotions.find((e) => e.id === rect.id);
                    const group = segments.filter(
                      (s) => dominant(s) === rect.id,
                    );
                    return (
                      <div
                        className="tree-group"
                        key={rect.id}
                        style={{
                          left: `${rect.x / 1.6}%`,
                          top: `${rect.y}%`,
                          width: `${rect.width / 1.6}%`,
                          height: `${rect.height}%`,
                          background: (emotion?.color ?? "#bcc2b9") + "32",
                        }}
                      >
                        <div
                          title={`${emotion?.label ?? "Без оценки"} · ${group.length}`}
                        >
                          <span>{emotion?.label ?? "Без оценки"}</span>
                          <b>{group.length}</b>
                        </div>
                        <div className="tree-cells">{group.map(cell)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="map-scale">
                <span>Начало книги</span>
                <span>
                  {filter ? (
                    <button onClick={() => setFilter(null)}>
                      Сбросить фильтр ×
                    </button>
                  ) : (
                    "Нажмите на ячейку, чтобы прочитать текст"
                  )}
                </span>
                <span>Конец</span>
              </div>
              <div className="legend">
                {emotions.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setFilter(filter === e.id ? null : e.id)}
                    className={filter === e.id ? "legend-active" : ""}
                    aria-pressed={filter === e.id}
                  >
                    <Dot color={e.color} />
                    {e.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="panel distribution">
              <div className="panel-heading">
                <div>
                  <h3>Палитра эмоций</h3>
                  <p>Средняя выраженность в тексте</p>
                </div>
                <span className="soft-icon">◒</span>
              </div>
              <div className="distribution-bars">
                {stats.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setFilter(filter === e.id ? null : e.id)}
                    className={filter === e.id ? "bar-active" : ""}
                    aria-pressed={filter === e.id}
                  >
                    <div>
                      <span>
                        <Dot color={e.color} />
                        {e.label}
                      </span>
                      <b>{analyzed ? Math.round(e.mean * 100) + "%" : "—"}</b>
                    </div>
                    <div className="bar-track">
                      <i
                        style={{
                          width: `${e.mean * 100}%`,
                          background: e.color,
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
              <div className="distribution-note">
                <span>↳</span> Эмоции могут сосуществовать.
                <br />
                Их оценки не складываются в 100%.
              </div>
            </section>
          </div>
          <div className="bottom-grid">
            <section className="panel timeline">
              <div className="panel-heading">
                <div>
                  <h3>Ритм повествования</h3>
                  <p>Как меняется эмоциональный тон по ходу книги</p>
                </div>
                <select
                  aria-label="Вид графика"
                  value={chartMode}
                  onChange={(e) =>
                    setChartMode(e.target.value as "all" | "dominant")
                  }
                >
                  <option value="all">Все эмоции</option>
                  <option value="dominant">Интенсивность</option>
                </select>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chart}
                    margin={{ top: 12, right: 12, left: -22, bottom: 0 }}
                  >
                    <defs>
                      {emotions.map((e) => (
                        <linearGradient
                          id={e.id}
                          key={e.id}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor={e.color}
                            stopOpacity={0.25}
                          />
                          <stop
                            offset="100%"
                            stopColor={e.color}
                            stopOpacity={0.01}
                          />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 5"
                      vertical={false}
                      stroke="#e9ece6"
                    />
                    <XAxis
                      dataKey="page"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={45}
                      tick={{ fontSize: 10, fill: "#8a9288" }}
                    />
                    <YAxis
                      domain={[0, 1]}
                      ticks={[0, 0.25, 0.5, 0.75, 1]}
                      tickFormatter={(n) => `${n * 100}`}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "#8a9288" }}
                    />
                    <Tooltip
                      labelFormatter={(l) => `Фрагмент ${l}`}
                      formatter={(v, name) => [
                        typeof v === "number" ? `${Math.round(v * 100)}%` : "—",
                        name,
                      ]}
                      contentStyle={{
                        borderRadius: 9,
                        border: "1px solid #e4e8df",
                        fontSize: 12,
                      }}
                    />
                    {chartMode === "dominant" ? (
                      <Area
                        type="monotone"
                        dataKey="intensity"
                        name="Интенсивность"
                        stroke="#426b50"
                        fill="#dce8db"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    ) : (
                      emotions
                        .filter((e) => !filter || e.id === filter)
                        .map((e) => (
                          <Area
                            key={e.id}
                            type="monotone"
                            dataKey={e.id}
                            name={e.label}
                            stroke={e.color}
                            fill={`url(#${e.id})`}
                            strokeWidth={1.6}
                            isAnimationActive={false}
                          />
                        ))
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-caption">
                <span>ПОЗИЦИЯ В ТЕКСТЕ →</span>
                <span>
                  {segments.length > 160
                    ? "Средние значения по окнам"
                    : "Оценки по фрагментам"}{" "}
                  · шкала 0–100
                </span>
              </div>
            </section>
            <section className="panel reader">
              <div className="reader-top">
                <span>
                  <FileText size={14} />{" "}
                  {mode === "pages" ? "СТРАНИЦА" : "ФРАГМЕНТ"}{" "}
                  {String(current.id).padStart(3, "0")}
                </span>
                <div>
                  <button
                    aria-label="Предыдущая страница"
                    disabled={selected === 0}
                    onClick={() => setSelected(selected - 1)}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    aria-label="Следующая страница"
                    disabled={selected >= segments.length - 1}
                    onClick={() => setSelected(selected + 1)}
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              <div className="reader-text" key={`${book.title}-${current.id}`}>
                {current.text}
              </div>
              <div className="reader-emotions">
                {[...emotions]
                  .sort(
                    (a, b) =>
                      (current.scores?.[b.id] ?? 0) -
                      (current.scores?.[a.id] ?? 0),
                  )
                  .map((e) => (
                    <span
                      key={e.id}
                      title={
                        current.confidence
                          ? `Уверенность: ${Math.round(current.confidence[e.id] * 100)}%`
                          : "Уверенность модели недоступна"
                      }
                    >
                      <Dot color={e.color} />
                      {e.label}
                      <b>
                        {current.scores
                          ? Math.round(current.scores[e.id] * 100) + "%"
                          : "—"}
                      </b>
                    </span>
                  ))}
              </div>
              <div className="reader-footer">
                {fmt(current.end - current.start)} знаков{" "}
                <span>
                  {book.demo
                    ? "Синтетические оценки"
                    : current.scores
                      ? "Jev · оценка текста"
                      : "Ожидает анализа"}
                </span>
              </div>
            </section>
          </div>
          <footer>
            <span>
              <span className="footer-brand">xbook</span> Другой способ читать.
            </span>
            <span>
              {book.demo
                ? "Демо-история и оценки созданы для прототипа"
                : "Текст хранится в текущей вкладке"}
              <span className="footer-dot">·</span>
              <button onClick={() => setModal("method")}>
                О данных <ArrowUpRight size={12} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              ref={closeRef}
              onClick={() => setModal(null)}
              aria-label="Закрыть"
            >
              <X size={19} />
            </button>
            {modal === "upload" ? (
              <>
                <div className="modal-icon">
                  <BookOpen size={24} />
                </div>
                <h2 id="modal-title">Новая история, новый ландшафт</h2>
                <p>
                  Загрузите книгу, чтобы превратить её в исследуемый датасет.
                </p>
                <button
                  className={`dropzone ${drag ? "dragging" : ""}`}
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    void upload(e.dataTransfer.files[0]);
                  }}
                >
                  {importing ? (
                    <LoaderCircle className="spin" size={30} />
                  ) : (
                    <Upload size={30} />
                  )}
                  <strong>
                    {importing ? "Читаем книгу…" : "Перетащите книгу сюда"}
                  </strong>
                  <span>или выберите файл на компьютере</span>
                  <small>EPUB · FB2 · TXT · MD · до 20 МБ</small>
                </button>
                <input
                  type="file"
                  ref={fileRef}
                  accept=".epub,.fb2,.txt,.md"
                  hidden
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                <p className="upload-note">
                  Книга откроется локально. Отправка текста в TypeSafe начнётся
                  только после нажатия «Анализировать». Новая книга заменит
                  текущую — сначала экспортируйте нужные результаты.
                </p>
                <button
                  className="demo-link"
                  onClick={() => {
                    reset(sampleBook, "pages");
                    setModal(null);
                  }}
                >
                  Открыть демонстрационную книгу <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <>
                <div className="modal-icon">
                  <SlidersHorizontal size={24} />
                </div>
                <h2 id="modal-title">От текста к ландшафту</h2>
                <p>Одинаковые правила — сравнимые данные.</p>
                <div className="method-step">
                  <span>01</span>
                  <div>
                    <h4>Воспроизводимая страница</h4>
                    <p>
                      До 1 800 знаков нормализованного текста, с границей между
                      словами. Это условная единица объёма, а не точная вёрстка
                      листа. Фиксируем NFC, пробелы и переносы строк; границы
                      сохраняем в датасете.
                    </p>
                  </div>
                </div>
                <div className="method-step">
                  <span>02</span>
                  <div>
                    <h4>Восемь независимых измерений</h4>
                    <p>
                      Jev оценивает выраженность каждой эмоции по пяти уровням:
                      от отсутствия до доминирующего переживания. Значения
                      приводятся к 0–1. Это интерпретация эмоционального тона
                      текста, а не измерение чувств конкретного читателя.
                    </p>
                  </div>
                </div>
                <div className="method-step">
                  <span>03</span>
                  <div>
                    <h4>Распределение и динамика</h4>
                    <p>
                      Цвет ячейки — ведущая эмоция. Если все оценки ниже 0,2,
                      фрагмент нейтральный. Палитра — средние оценки с весом по
                      длине фрагмента. Интенсивность — максимум оценок;
                      уверенность Jev хранится отдельно.
                    </p>
                  </div>
                </div>
                <div className="method-step">
                  <span>04</span>
                  <div>
                    <h4>Смысловые блоки — следующий шаг</h4>
                    <p>
                      Сейчас доступны страницы и абзацы (длинные делятся по
                      лимиту). Смена разбиения сбрасывает оценки — сначала
                      экспортируйте результат. Семантическое разбиение с помощью
                      Jev ещё не реализовано. Демо-история содержит
                      повторяющиеся фрагменты и синтетические оценки для
                      исследования интерфейса.
                    </p>
                  </div>
                </div>
                <button className="primary full" onClick={() => setModal(null)}>
                  Понятно <Check size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
