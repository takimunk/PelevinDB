// Sentence-level values derived from stored answers. A focus answer says where on a page each dimension sits; the
// page answer says how strong it is there. Their product ranks sentences across pages without asking Jev again.
import { FOCUS, type FocusId } from "../../shared/catalog.ts";
import type { FocusAnalysis, SegmentAnalysis } from "../../shared/types.ts";

/** The page score a focus dimension spreads over its sentences; 1 when the dimension has no page score. */
export function pageScore(page: SegmentAnalysis | null, id: FocusId): number {
  const source = FOCUS.find((f) => f.id === id)!.source;
  if (!source) return 1;
  if (!page) return 0;
  if (source.group === "emotion") return page.emotions[source.id];
  const v = page.texture[source.id];
  return "invert" in source && source.invert ? 1 - v : v;
}

/** Per sentence: page score × the probability that this sentence carries the dimension most. */
export function focusWeights(focus: FocusAnalysis, page: SegmentAnalysis | null, id: FocusId): number[] {
  const score = pageScore(page, id);
  return focus.focus[id].map((p) => score * p);
}

/** The sentence that carries a dimension most, when Jev names one with more weight than "none". */
export function peakSentence(focus: FocusAnalysis, id: FocusId): number | null {
  const p = focus.focus[id];
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  return p.length && p[best] > focus.none[id] ? best : null;
}
