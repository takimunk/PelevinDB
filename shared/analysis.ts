import type { Distribution, SegmentAnalysis } from "./types.ts";

const PARATEXT_THRESHOLD = 0.5;

export function argmax<K extends string>(dist: Distribution<K>): K {
  let best = Object.keys(dist)[0] as K;
  for (const key of Object.keys(dist) as K[]) if (dist[key] > dist[best]) best = key;
  return best;
}

/** Title pages, tables of contents and licences are excluded from every aggregate. */
export const isParatext = (a: SegmentAnalysis | null | undefined) => !!a && a.mode.paratext > PARATEXT_THRESHOLD;
