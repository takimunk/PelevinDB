import type { SegmentAnalysis } from "../../shared/types.ts";
import { argmax, dominantEmotion, intensity, isParatext, type Analyses } from "./analysis.ts";

type Group = "emotions" | "mood" | "mode" | "themes";
/** `all`, or `group:id`: the page's leading emotion, mood or narration mode is `id`, or theme `id` is likely (≥ 50%). */
export type PageFilter = "all" | `${Group}:${string}`;
/** `page` keeps reading order; everything else sorts by that Jev score, highest first. */
export type PageSort = "page" | "intensity" | `${Group | "texture"}:${string}`;
export type PageHit = { index: number; value: number };

export const THEME_THRESHOLD = 0.5;

const split = (key: string) => key.split(":") as [Group | "texture", string];

export function pageScore(a: SegmentAnalysis, sort: PageSort): number {
  if (sort === "page" || sort === "intensity") return intensity(a);
  const [group, id] = split(sort);
  return (a[group] as Record<string, number>)[id] ?? 0;
}

export function pageMatches(a: SegmentAnalysis, filter: PageFilter): boolean {
  if (filter === "all") return true;
  const [group, id] = split(filter);
  if (group === "emotions") return dominantEmotion(a) === id;
  if (group === "themes") return a.themes[id as keyof typeof a.themes] >= THEME_THRESHOLD;
  return argmax(a[group as "mood" | "mode"] as Record<string, number>) === id;
}

/** Narrative pages that pass the filter, ranked by the sort score; ties keep reading order. */
export function explorePages(analyses: Analyses, filter: PageFilter, sort: PageSort): PageHit[] {
  const hits: PageHit[] = [];
  analyses.forEach((a, index) => {
    if (a && !isParatext(a) && pageMatches(a, filter)) hits.push({ index, value: pageScore(a, sort) });
  });
  return sort === "page" ? hits : hits.sort((x, y) => y.value - x.value || x.index - y.index);
}
