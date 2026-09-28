import { useMemo, useState } from "react";
import { EMOTIONS, labelOf, MODES, MOODS, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { Analyses } from "../../domain/analysis.ts";
import { explorePages, THEME_THRESHOLD, type PageFilter, type PageSort } from "../../domain/explore.ts";
import { firstSentence, type Segment } from "../../domain/text.ts";
import { plural, useLang, useT, type Lang } from "../../i18n/index.ts";
import { Meter } from "../../ui/term.tsx";
import { num, pageRef } from "./i18n.ts";

const PAGE_SIZE = 12;

type Option = { value: string; label: string; color?: string };
type Group = { group: string; options: Option[] };
const NARRATION = MODES.filter((m) => m.id !== "paratext");

const T = {
  en: {
    show: "show",
    sortBy: "sort by",
    pages: (n: number) => `${n} ${plural(n, ["page", "pages"])}`,
    none: "No analysed page matches this filter.",
    score: "score",
    showing: (a: number, b: string) => `showing ${a} of ${b}`,
    more: (n: number) => `show ${n} more`,
    g: {
      everything: "everything",
      emotion: "leading emotion",
      mood: "mood",
      narration: "narration",
      theme: `theme ≥ ${THEME_THRESHOLD * 100}% likely`,
      order: "order",
      emotionSort: "emotion",
      texture: "texture",
      themeSort: "theme",
    },
    all: "all pages",
    emotionPages: (l: string) => `${l} pages`,
    moodPages: (l: string) => `${l} mood`,
    modePages: (l: string) => `mostly ${l}`,
    themePages: (l: string) => `about ${l}`,
    reading: "reading order",
    intensity: "intensity",
  },
  ru: {
    show: "показать",
    sortBy: "сортировать",
    pages: (n: number) => `${n} ${plural(n, ["страница", "страницы", "страниц"])}`,
    none: "Ни одна проанализированная страница не подходит под фильтр.",
    score: "оценка",
    showing: (a: number, b: string) => `показано ${a} из ${b}`,
    more: (n: number) => `показать ещё ${n}`,
    g: {
      everything: "всё",
      emotion: "ведущая эмоция",
      mood: "настроение",
      narration: "повествование",
      theme: `тема с вероятностью ≥ ${THEME_THRESHOLD * 100} %`,
      order: "порядок",
      emotionSort: "эмоция",
      texture: "фактура",
      themeSort: "тема",
    },
    all: "все страницы",
    emotionPages: (l: string) => `эмоция: ${l}`,
    moodPages: (l: string) => `настроение: ${l}`,
    modePages: (l: string) => `в основном ${l}`,
    themePages: (l: string) => `тема: ${l}`,
    reading: "по порядку чтения",
    intensity: "сила эмоций",
  },
};

function groups(lang: Lang) {
  const t = T[lang];
  const l = (x: { label: string; ru?: string }) => labelOf(x, lang).toLowerCase();
  const filters: Group[] = [
    { group: t.g.everything, options: [{ value: "all", label: t.all }] },
    { group: t.g.emotion, options: EMOTIONS.map((e) => ({ value: `emotions:${e.id}`, label: t.emotionPages(l(e)), color: e.color })) },
    { group: t.g.mood, options: MOODS.map((m) => ({ value: `mood:${m.id}`, label: t.moodPages(l(m)), color: m.color })) },
    { group: t.g.narration, options: NARRATION.map((m) => ({ value: `mode:${m.id}`, label: t.modePages(l(m)), color: m.color })) },
    { group: t.g.theme, options: THEMES.map((th) => ({ value: `themes:${th.id}`, label: t.themePages(l(th)) })) },
  ];
  const sorts: Group[] = [
    {
      group: t.g.order,
      options: [
        { value: "page", label: t.reading },
        { value: "intensity", label: t.intensity },
      ],
    },
    { group: t.g.emotionSort, options: EMOTIONS.map((e) => ({ value: `emotions:${e.id}`, label: l(e), color: e.color })) },
    { group: t.g.texture, options: TEXTURES.map((tx) => ({ value: `texture:${tx.id}`, label: l(tx) })) },
    { group: t.g.mood, options: MOODS.map((m) => ({ value: `mood:${m.id}`, label: t.moodPages(l(m)), color: m.color })) },
    { group: t.g.narration, options: NARRATION.map((m) => ({ value: `mode:${m.id}`, label: l(m), color: m.color })) },
    { group: t.g.themeSort, options: THEMES.map((th) => ({ value: `themes:${th.id}`, label: l(th) })) },
  ];
  return { filters, sorts };
}

const find = (list: Group[], value: string) => list.flatMap((g) => g.options).find((o) => o.value === value);

/** Every page, filtered by a Jev answer and ranked by any score. Quotes are cut only for the rows on screen. */
/** `offset` shifts page labels when the pages are a slice of the book (onPick still gets the slice index). */
export function QuoteExplorer({ segments, analyses, onPick, offset = 0 }: { segments: Segment[]; analyses: Analyses; onPick: (index: number) => void; offset?: number }) {
  const t = useT(T);
  const lang = useLang();
  const { filters, sorts } = useMemo(() => groups(lang), [lang]);
  const [filter, setFilter] = useState<PageFilter>("all");
  const [sort, setSort] = useState<PageSort>("intensity");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const hits = useMemo(() => explorePages(analyses, filter, sort), [analyses, filter, sort]);
  const counts = useMemo(() => new Map(filters.flatMap((g) => g.options).map((o) => [o.value, explorePages(analyses, o.value as PageFilter, "page").length])), [analyses, filters]);
  const shown = hits.slice(0, limit);
  const metric = find(sorts, sort === "page" ? "intensity" : sort)!;
  const color = metric.color ?? find(filters, filter)?.color;
  const select = (label: string, value: string, list: Group[], onChange: (v: string) => void, count?: (v: string) => number | undefined) => (
    <label className="field">
      <span className="eyebrow">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {list.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map((o) => {
              const n = count?.(o.value);
              return (
                <option key={o.value} value={o.value}>
                  {n == null ? o.label : `${o.label} · ${num(lang, n)}`}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </label>
  );
  return (
    <div className="explorer">
      <div className="explorer-controls">
        {select(
          t.show,
          filter,
          filters,
          (v) => {
            setFilter(v as PageFilter);
            setSort(v === "all" ? "intensity" : (v as PageSort));
            setLimit(PAGE_SIZE);
          },
          (v) => counts.get(v),
        )}
        {select(t.sortBy, sort, sorts, (v) => {
          setSort(v as PageSort);
          setLimit(PAGE_SIZE);
        })}
        <span className="explorer-count num" aria-live="polite">
          {t.pages(hits.length)}
        </span>
      </div>
      {shown.length ? (
        <ol className="explorer-hits">
          {shown.map((h) => (
            <li key={h.index}>
              <button onClick={() => onPick(h.index)}>
                <span className="hit-page num">{pageRef(lang, offset + h.index + 1)}</span>
                <span className="hit-score">
                  <Meter value={h.value} color={color} className="thin" /> <span className="num">{num(lang, h.value, 2)}</span>
                </span>
                <q>{firstSentence(segments[h.index].text, 180)}</q>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="placeholder">{t.none}</p>
      )}
      <p className="explorer-foot">
        <span className="dim">
          {t.score} = {metric.label} · {t.showing(shown.length, num(lang, hits.length))}
        </span>
        {hits.length > limit && (
          <button className="link-u" onClick={() => setLimit(limit + PAGE_SIZE)}>
            {t.more(Math.min(PAGE_SIZE, hits.length - limit))}
          </button>
        )}
      </p>
    </div>
  );
}
