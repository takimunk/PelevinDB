import { useMemo, useRef, useState } from "react";
import { EMOTIONS, labelOf, MOODS, THEMES } from "../../../shared/catalog.ts";
import { BOOK_KINDS } from "../../../shared/types.ts";
import { ARC_SHAPES, argmax, topEntries } from "../../domain/analysis.ts";
import { DEFAULT_WEIGHTS, FEATURE_GROUPS, fingerprintValues, WEIGHT_PRESETS, type Weights } from "../../domain/fingerprint.ts";
import { findRegions } from "../../domain/clusters.ts";
import { neighbours } from "../../domain/pca.ts";
import { navigate } from "../../app/router.ts";
import { plural, useLang, useT } from "../../i18n/index.ts";
import { GroupLegend, PixelStrip } from "../../ui/PixelStrip.tsx";
import { Meter, Swatch } from "../../ui/term.tsx";
import { Search } from "../search/Search.tsx";
import { useLocalMode } from "../../services/mode.ts";
import { axisOptions, buildAxis, DEFAULT_AXES, placeStars, type AxisChoice } from "./axes.ts";
import { MAP_PRESETS, matchPreset, type MapPreset } from "./presets.ts";
import { BookGraph, regionColor, starColor, type ColorBy, type GraphMode } from "./BookGraph.tsx";
import { starPath, useCorpus, useEmbedding, type Star } from "./corpus.ts";
import { DECADES, decadeColor, KIND_COLORS, KIND_LABELS } from "./encoding.ts";
import "./map.css";

const T = {
  en: {
    eyebrow: "Map",
    title: "Map of the works",
    intro: "The closer two books are, the more alike they read: in feeling, pace, themes and how they are told. Pick a view below, or put any single score on an axis. Lines join each book to the three most like it.",
    views: "Views",
    custom: "Custom view.",
    view: "View",
    axis: (a: string) => `${a} axis`,
    resetAxes: "reset axes to PCA",
    weightsNote: "Weights shape PCA and the edges.",
    compareBy: "Compare by",
    colour: "Colour",
    colourBy: { emotion: "emotion", decade: "decade", kind: "kind" } as Record<ColorBy, string>,
    colourNote: { emotion: "colour = leading emotion", decade: "colour = decade of first publication", kind: "colour = kind of work" } as Record<ColorBy, string>,
    layers: "Layers",
    atlas: "measured only",
    labels: "all labels",
    edges: "edges",
    regions: "regions",
    find: (n: number) => `Find among ${n} ${plural(n, ["book", "books"])}`,
    filter: "Filter books on the map",
    own: (n: number) => `${n} of your ${plural(n, ["book", "books"])} on the map.`,
    noOwn: "Analyse a book and it joins the map.",
    read: (n: number) => ` ${n} ${plural(n, ["book", "books"])}; each opens as a book page.`,
    rest: (n: number) => ` ${n} ${plural(n, ["book", "books"])} measured only.`,
    empty: "The map is empty until the corpus has been read.",
    tooFew: (n: number) => `${n} ${plural(n, ["book has", "books have"])} Jev data; the map needs at least 3. Read the corpus with npm run corpus.`,
    decade: (d: number) => `${d}s`,
    stage: "Book map",
    // star card
    yourBook: "your book",
    corpusAll: (n: number) => `corpus · Jev read all ${n} pages`,
    corpusSome: (a: number, n: number) => `corpus · Jev read ${a} of ${n} pages`,
    atlasCard: (n: string) => `measured · Jev read ${n} sampled pages`,
    close: "Close card",
    region: "region",
    emotion: "emotion",
    mood: "mood",
    pace: "pace",
    tension: "tension",
    themes: "themes",
    arc: "arc",
    flat: "flat line",
    fingerprint: "fingerprint coordinates",
    nearest: "Nearest",
    openBook: "Open book",
    openDashboard: "Open dashboard",
    fetch: "Fetch the text from Project Gutenberg",
    searchGutenberg: "search Project Gutenberg",
  },
  ru: {
    eyebrow: "Карта",
    title: "Карта произведений",
    intro: "Чем ближе книги, тем больше они похожи: по чувствам, темпу, темам и манере рассказа. Выберите вид ниже или поставьте на ось любую отдельную оценку. Линии соединяют каждую книгу с тремя самыми похожими.",
    views: "Виды",
    custom: "Свой вид.",
    view: "Вид",
    axis: (a: string) => `Ось ${a}`,
    resetAxes: "вернуть оси PCA",
    weightsNote: "Веса влияют на PCA и связи.",
    compareBy: "Сравнивать по",
    colour: "Цвет",
    colourBy: { emotion: "эмоция", decade: "десятилетие", kind: "жанр" } as Record<ColorBy, string>,
    colourNote: { emotion: "цвет = ведущая эмоция", decade: "цвет = десятилетие первой публикации", kind: "цвет = форма произведения" } as Record<ColorBy, string>,
    layers: "Слои",
    atlas: "только замеры",
    labels: "все подписи",
    edges: "связи",
    regions: "области",
    find: (n: number) => `Найти среди ${n} ${plural(n, ["книги", "книг", "книг"])}`,
    filter: "Фильтр книг на карте",
    own: (n: number) => `${n} ${plural(n, ["ваша книга", "ваши книги", "ваших книг"])} на карте.`,
    noOwn: "Проанализируйте книгу, и она появится на карте.",
    read: (n: number) => ` ${n} ${plural(n, ["книга", "книги", "книг"])}, каждая открывается страницей книги.`,
    rest: (n: number) => ` ${n} ${plural(n, ["книга", "книги", "книг"])} только с замерами.`,
    empty: "Карта пуста, пока корпус не прочитан.",
    tooFew: (n: number) => `Данные Jev есть у ${n} ${plural(n, ["книги", "книг", "книг"])}; карте нужно хотя бы 3. Прочитайте корпус командой npm run corpus.`,
    decade: (d: number) => `${d}-е`,
    stage: "Карта книг",
    yourBook: "ваша книга",
    corpusAll: (n: number) => `корпус · Jev прочитал все ${n} стр.`,
    corpusSome: (a: number, n: number) => `корпус · Jev прочитал ${a} из ${n} стр.`,
    atlasCard: (n: string) => `замеры · Jev прочитал ${n} стр. выборочно`,
    close: "Закрыть карточку",
    region: "область",
    emotion: "эмоция",
    mood: "настроение",
    pace: "темп",
    tension: "напряжение",
    themes: "темы",
    arc: "дуга",
    flat: "ровная линия",
    fingerprint: "координат отпечатка",
    nearest: "Ближайшие",
    openBook: "Открыть книгу",
    openDashboard: "Открыть страницу книги",
    fetch: "Скачать текст с «Гутенберга»",
    searchGutenberg: "поиск по «Гутенбергу»",
  },
};

/** Legend glyph for a node: disc = corpus book, square = your book, ring = measured only. */
const Glyph = ({ star, color }: { star: Star; color: string }) => (
  <i className={`glyph ${star.kind === "library" ? "own" : star.canon ? "canon" : "ref"}`} style={{ ["--c" as string]: color }} aria-hidden="true" />
);

function StarCard({
  star,
  similar,
  region,
  onClose,
  onPick,
}: {
  star: Star;
  similar: { star: Star; similarity: number }[];
  region?: { name: string; color: string };
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const t = useT(T);
  const lang = useLang();
  const fp = star.fingerprint;
  const mood = MOODS.find((m) => m.id === argmax(fp.mood))!;
  const lead = EMOTIONS.find((e) => e.id === argmax(fp.emotions))!;
  const themes = topEntries(fp.themes, 4).map(([id]) =>
    labelOf(
      THEMES.find((th) => th.id === id)!,
      lang,
    ).toLowerCase(),
  );
  const arc = ARC_SHAPES.find((a) => a.id === fp.arcShape);
  const [finding, setFinding] = useState(false);
  const sub = lang === "ru" ? null : star.titleEn;
  return (
    <aside className="star-card" aria-label={star.title}>
      <header className="star-card-top">
        <span className="eyebrow">
          {star.kind === "library"
            ? t.yourBook
            : star.canon
              ? star.canon.complete
                ? t.corpusAll(star.canon.pages)
                : t.corpusSome(star.canon.analysed, star.canon.pages)
              : t.atlasCard(String(star.pagesRead ?? "?"))}
        </span>
        <button className="btn icon" onClick={onClose} aria-label={t.close}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>
      <h2>{sub ?? star.title}</h2>
      {(sub || star.titleEn) && <p className="star-card-sub">{sub ? star.title : star.titleEn}</p>}
      <p className="star-card-author">
        {star.author}
        {star.year ? ` · ${star.year}` : ""}
        {star.work ? ` · ${KIND_LABELS[star.work][lang].toLowerCase()}` : ""}
      </p>
      <dl className="star-card-facts">
        {region && (
          <div>
            <dt>{t.region}</dt>
            <dd>
              <Swatch color={region.color} />
              {region.name}
            </dd>
          </div>
        )}
        <div>
          <dt>{t.emotion}</dt>
          <dd>
            <Swatch color={lead.color} round />
            {labelOf(lead, lang).toLowerCase()}
          </dd>
        </div>
        <div>
          <dt>{t.mood}</dt>
          <dd>
            <Swatch color={mood.color} round />
            {labelOf(mood, lang).toLowerCase()}
          </dd>
        </div>
        <div>
          <dt>{t.pace}</dt>
          <dd>
            <Meter value={fp.texture.pace} className="thin" />
          </dd>
        </div>
        <div>
          <dt>{t.tension}</dt>
          <dd>
            <Meter value={fp.texture.tension} className="thin" />
          </dd>
        </div>
        <div>
          <dt>{t.themes}</dt>
          <dd>{themes.join(", ")}</dd>
        </div>
        <div>
          <dt>{t.arc}</dt>
          <dd>{arc ? (lang === "ru" ? arc.ru : arc.label).toLowerCase() : t.flat}</dd>
        </div>
      </dl>
      <PixelStrip values={fingerprintValues(fp)} size={7} label={t.fingerprint} />
      <div className="star-card-near">
        <span className="eyebrow">{t.nearest}</span>
        {similar.map((n) => (
          <button key={n.star.id} onClick={() => onPick(n.star.id)}>
            <em className="num">{Math.round(Math.max(0, n.similarity) * 100)}</em> <span>{lang === "ru" || !n.star.titleEn ? n.star.title : n.star.titleEn}</span>
          </button>
        ))}
      </div>
      {star.kind === "library" || star.canon ? (
        <button className="btn primary full" onClick={() => navigate(starPath(star))}>
          {star.canon ? t.openBook : t.openDashboard} →
        </button>
      ) : star.id.startsWith("pg-") ? (
        finding ? (
          <Search initialQuery={star.title} autoFocus placeholder={t.searchGutenberg} />
        ) : (
          <button className="btn full" onClick={() => setFinding(true)}>
            {t.fetch}
          </button>
        )
      ) : null}
    </aside>
  );
}

export function MapPage({ focus }: { focus?: string }) {
  const t = useT(T);
  const local = useLocalMode();
  const lang = useLang();
  const stage = useRef<HTMLElement>(null);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [includeAtlas, setIncludeAtlas] = useState(true);
  const [labels, setLabels] = useState(false);
  const [threads, setThreads] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [filter, setFilter] = useState("");
  const [mode, setMode] = useState<GraphMode>("3d");
  const [axisChoice, setAxisChoice] = useState<AxisChoice[]>(DEFAULT_AXES);
  const [colorBy, setColorBy] = useState<ColorBy>("emotion");
  const selected = focus ?? null;
  const stars = useCorpus({ includeAtlas });
  const embedding = useEmbedding(stars, weights);
  const byId = useMemo(() => new Map(stars.map((s) => [s.id, s])), [stars]);
  const axes = useMemo(() => axisChoice.map((c) => buildAxis(c, stars, embedding, lang)), [axisChoice, stars, embedding, lang]);
  const options = useMemo(() => axisOptions(embedding, lang), [embedding, lang]);
  const dims = mode === "2d" ? 2 : 3;
  const coords = useMemo(
    () =>
      placeStars(
        stars.map((s) => s.id),
        axes,
        dims,
      ),
    [stars, axes, dims],
  );
  const regions = useMemo(() => findRegions(stars, coords, { weights, axes: axisChoice.slice(0, dims) }), [stars, coords, weights, axisChoice, dims]);
  const regionNames = useMemo(() => regions.map((r) => (lang === "ru" ? r.ru.name : r.name)), [regions, lang]);
  const select = (id: string | null) => {
    navigate(id ? `/map?focus=${id}` : "/map", { replace: true });
    if (id && window.matchMedia("(max-width: 960px)").matches) stage.current?.scrollIntoView({ block: "start" });
  };
  const current = selected ? byId.get(selected) : undefined;
  const currentRegion = current && showRegions ? regions.findIndex((r) => r.members.includes(current.id)) : -1;
  const similar = current ? neighbours(embedding.rows, current.id, 5).flatMap((n) => (byId.has(n.id) ? [{ star: byId.get(n.id)!, similarity: n.similarity }] : [])) : [];
  const preset = WEIGHT_PRESETS.find((p) => FEATURE_GROUPS.every((g) => p.weights[g.id] === weights[g.id]))?.id;
  const view = matchPreset(mode, axisChoice, weights);
  const applyView = (p: MapPreset) => {
    setMode(p.mode);
    setAxisChoice(p.axes);
    setWeights(p.weights);
  };
  const viewInfo = MAP_PRESETS.find((p) => p.id === view);
  const own = stars.filter((s) => s.kind === "library").length;
  const read = stars.filter((s) => s.canon?.complete).length;
  const needle = filter.toLowerCase();
  const list = stars.filter((s) => !needle || `${s.title} ${s.titleEn ?? ""} ${s.author}`.toLowerCase().includes(needle));
  // Decade and kind only make sense once the corpus carries them.
  const encodings: ColorBy[] = ["emotion", ...(stars.some((s) => s.year != null) ? (["decade"] as const) : []), ...(stars.some((s) => s.work) ? (["kind"] as const) : [])];
  const by = encodings.includes(colorBy) ? colorBy : "emotion";
  const decades = DECADES.filter((d) => stars.some((s) => s.year != null && Math.floor(s.year / 10) * 10 === d));

  return (
    <div className="map-page">
      <aside className="map-rail">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
        <p className="map-intro">{t.intro}</p>
        <div className="map-views" role="group" aria-label={t.views}>
          {MAP_PRESETS.map((p) => (
            <button key={p.id} className={view === p.id ? "on" : ""} aria-pressed={view === p.id} title={lang === "ru" ? p.ru.question : p.question} onClick={() => applyView(p)}>
              {lang === "ru" ? p.ru.label : p.label}
            </button>
          ))}
        </div>
        <p className="map-question">{viewInfo ? (lang === "ru" ? viewInfo.ru.question : viewInfo.question) : t.custom}</p>
        <div className="presets" role="group" aria-label={t.view}>
          {(["2d", "3d"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="axis-pickers">
          {(mode === "2d" ? [0, 1] : [0, 1, 2]).map((k) => (
            <label key={k}>
              <span className="axis-letter">{"xyz"[k]}</span>
              <select value={axisChoice[k]} onChange={(e) => setAxisChoice(axisChoice.map((c, i) => (i === k ? e.target.value : c)))} aria-label={t.axis("xyz"[k])}>
                {options.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
          {axisChoice.some((c, i) => c !== DEFAULT_AXES[i]) && (
            <button className="link-u" onClick={() => setAxisChoice(DEFAULT_AXES)}>
              {t.resetAxes}
            </button>
          )}
        </div>
        <p className="map-note">{t.weightsNote}</p>
        <div className="presets" role="group" aria-label={t.compareBy}>
          {WEIGHT_PRESETS.map((p) => (
            <button key={p.id} className={preset === p.id ? "on" : ""} aria-pressed={preset === p.id} onClick={() => setWeights(p.weights)}>
              {lang === "ru" ? p.ru : p.label}
            </button>
          ))}
        </div>
        <div className="weights">
          {FEATURE_GROUPS.map((g) => (
            <label key={g.id} title={lang === "ru" ? g.hintRu : g.hint}>
              <span>
                {(lang === "ru" ? g.ru : g.label).toLowerCase()}
                <em className="num">{weights[g.id].toFixed(1)}</em>
              </span>
              <input type="range" min={0} max={2} step={0.1} value={weights[g.id]} onChange={(e) => setWeights({ ...weights, [g.id]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        {encodings.length > 1 && (
          <div className="map-colour">
            <span className="eyebrow">{t.colour}</span>
            <div className="presets" role="group" aria-label={t.colour}>
              {encodings.map((e) => (
                <button key={e} className={by === e ? "on" : ""} aria-pressed={by === e} onClick={() => setColorBy(e)}>
                  {t.colourBy[e]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="map-key">
          <span className="dim">{t.colourNote[by]}</span>
          {by === "decade" &&
            decades.map((d) => (
              <span key={d}>
                <Swatch color={decadeColor(d)} round />
                {t.decade(d)}
              </span>
            ))}
          {by === "kind" &&
            BOOK_KINDS.filter((k) => stars.some((s) => s.work === k)).map((k) => (
              <span key={k}>
                <Swatch color={KIND_COLORS[k]} round />
                {KIND_LABELS[k][lang].toLowerCase()}
              </span>
            ))}
        </div>
        <div className="toggles">
          <span className="eyebrow">{t.layers}</span>
          <label>
            <input type="checkbox" checked={includeAtlas} onChange={(e) => setIncludeAtlas(e.target.checked)} /> {t.atlas}
          </label>
          <label>
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> {t.labels}
          </label>
          <label>
            <input type="checkbox" checked={threads} onChange={(e) => setThreads(e.target.checked)} /> {t.edges}
          </label>
          <label>
            <input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} /> {t.regions}
          </label>
        </div>
        <div className="map-list">
          <input className="map-filter" placeholder={t.find(stars.length)} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t.filter} />
          <ul>
            {list.map((s) => (
              <li key={s.id}>
                <button className={s.id === selected ? "on" : ""} onClick={() => select(s.id)}>
                  <Glyph star={s} color={starColor(s, by)} />
                  <span>{lang === "ru" || !s.titleEn ? s.title : s.titleEn}</span>
                  <small>
                    {s.author}
                    {s.year ? ` · ${s.year}` : ""}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <GroupLegend />
        <p className="map-foot">
          {local && (own ? t.own(own) : t.noOwn)}
          {read > 0 && t.read(read)}
          {stars.length > own + read && t.rest(stars.length - own - read)}
        </p>
      </aside>
      <section className="map-stage" ref={stage} aria-label={t.stage}>
        <BookGraph
          local={local}
          stars={stars}
          embedding={embedding}
          axes={axes}
          coords={coords}
          regions={regions}
          regionNames={regionNames}
          mode={mode}
          selected={selected}
          onSelect={select}
          labels={labels}
          threads={threads}
          showRegions={showRegions}
          colorBy={by}
        />
        {stars.length < 3 && (
          <div className="map-empty">
            <p>{stars.length ? t.tooFew(stars.length) : t.empty}</p>
          </div>
        )}
      </section>
      {current && (
        <StarCard
          key={current.id}
          star={current}
          similar={similar}
          region={currentRegion >= 0 ? { name: regionNames[currentRegion], color: regionColor(currentRegion) } : undefined}
          onClose={() => select(null)}
          onPick={select}
        />
      )}
    </div>
  );
}
