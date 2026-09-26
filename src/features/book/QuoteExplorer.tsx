import { useMemo, useState } from "react";
import { EMOTIONS, MODES, MOODS, TEXTURES, THEMES } from "../../../shared/catalog.ts";
import type { Analyses } from "../../domain/analysis.ts";
import { explorePages, THEME_THRESHOLD, type PageFilter, type PageSort } from "../../domain/explore.ts";
import { firstSentence, type Segment } from "../../domain/text.ts";
import { bar } from "../../ui/ascii.ts";
import { fmt, plural } from "../../ui/format.ts";

const PAGE_SIZE = 12;

type Option = { value: string; label: string; color?: string };
const NARRATION = MODES.filter((m) => m.id !== "paratext");

const FILTERS: { group: string; options: Option[] }[] = [
  { group: "everything", options: [{ value: "all", label: "all pages" }] },
  { group: "leading emotion", options: EMOTIONS.map((e) => ({ value: `emotions:${e.id}`, label: `${e.label.toLowerCase()} pages`, color: e.color })) },
  { group: "mood", options: MOODS.map((m) => ({ value: `mood:${m.id}`, label: `${m.label.toLowerCase()} mood`, color: m.color })) },
  { group: "narration", options: NARRATION.map((m) => ({ value: `mode:${m.id}`, label: `mostly ${m.label.toLowerCase()}`, color: m.color })) },
  { group: `theme ≥ ${THEME_THRESHOLD * 100}% likely`, options: THEMES.map((t) => ({ value: `themes:${t.id}`, label: `about ${t.label.toLowerCase()}` })) },
];

const SORTS: { group: string; options: Option[] }[] = [
  {
    group: "order",
    options: [
      { value: "page", label: "reading order" },
      { value: "intensity", label: "intensity" },
    ],
  },
  { group: "emotion", options: EMOTIONS.map((e) => ({ value: `emotions:${e.id}`, label: e.label.toLowerCase(), color: e.color })) },
  { group: "texture", options: TEXTURES.map((t) => ({ value: `texture:${t.id}`, label: t.id === "valence" ? "light" : t.label.toLowerCase() })) },
  { group: "mood", options: MOODS.map((m) => ({ value: `mood:${m.id}`, label: `${m.label.toLowerCase()} mood`, color: m.color })) },
  { group: "narration", options: NARRATION.map((m) => ({ value: `mode:${m.id}`, label: m.label.toLowerCase(), color: m.color })) },
  { group: "theme", options: THEMES.map((t) => ({ value: `themes:${t.id}`, label: t.label.toLowerCase() })) },
];

const find = (groups: typeof SORTS, value: string) => groups.flatMap((g) => g.options).find((o) => o.value === value);

/** Every page, filtered by a Jev answer and ranked by any score. Quotes are cut only for the rows on screen. */
export function QuoteExplorer({ segments, analyses, onPick }: { segments: Segment[]; analyses: Analyses; onPick: (index: number) => void }) {
  const [filter, setFilter] = useState<PageFilter>("all");
  const [sort, setSort] = useState<PageSort>("intensity");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const hits = useMemo(() => explorePages(analyses, filter, sort), [analyses, filter, sort]);
  const counts = useMemo(
    () => new Map(FILTERS.flatMap((g) => g.options).map((o) => [o.value, explorePages(analyses, o.value as PageFilter, "page").length])),
    [analyses],
  );
  const shown = hits.slice(0, limit);
  const metric = find(SORTS, sort === "page" ? "intensity" : sort)!;
  const color = metric.color ?? find(FILTERS, filter)?.color ?? "var(--accent)";
  const select = (label: string, value: string, groups: typeof SORTS, onChange: (v: string) => void, count?: (v: string) => number | undefined) => (
    <label>
      <span className="dim">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map((o) => {
              const n = count?.(o.value);
              return (
                <option key={o.value} value={o.value}>
                  {n == null ? o.label : `${o.label} · ${fmt(n)}`}
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
          "show",
          filter,
          FILTERS,
          (v) => {
            setFilter(v as PageFilter);
            setSort(v === "all" ? "intensity" : (v as PageSort));
            setLimit(PAGE_SIZE);
          },
          (v) => counts.get(v),
        )}
        {select("sort by", sort, SORTS, (v) => {
          setSort(v as PageSort);
          setLimit(PAGE_SIZE);
        })}
        <span className="dim" aria-live="polite">
          {fmt(hits.length)} {plural(hits.length, "page")}
        </span>
      </div>
      {shown.length ? (
        <ol className="explorer-hits">
          {shown.map((h) => (
            <li key={h.index}>
              <button onClick={() => onPick(h.index)}>
                <span className="hit-page">p.{h.index + 1}</span>
                <span className="hit-score">
                  <span style={{ color }}>{bar(h.value, 6, "█", "·")}</span> {h.value.toFixed(2)}
                </span>
                <q>{firstSentence(segments[h.index].text, 180)}</q>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="placeholder">no analysed page matches this filter.</p>
      )}
      <p className="explorer-foot">
        <span className="dim">
          score = {metric.label} · showing {shown.length} of {fmt(hits.length)}
        </span>
        {hits.length > limit && (
          <button className="link" onClick={() => setLimit(limit + PAGE_SIZE)}>
            show {Math.min(PAGE_SIZE, hits.length - limit)} more
          </button>
        )}
      </p>
    </div>
  );
}
