import { EMOTIONS, THEMES, type EmotionId, type ThemeId } from "../../shared/catalog.ts";
import type { SegmentAnalysis } from "../../shared/types.ts";
import { argmax, dominantEmotion, intensity, isParatext, NEUTRAL_THRESHOLD, pearson, type Analyses } from "./analysis.ts";

type Page = { index: number; a: SegmentAnalysis };
/** A run of pages, `from`–`to` inclusive page indices, with the mean of the measured value. */
export type Stretch = { from: number; to: number; value: number };

const narrative = (analyses: Analyses): Page[] => analyses.flatMap((a, index) => (a && !isParatext(a) ? [{ index, a }] : []));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const stretchSize = (k: number) => Math.max(2, Math.round(k / 12));

function quantile(xs: number[], q: number) {
  const sorted = [...xs].sort((a, b) => a - b);
  const t = (sorted.length - 1) * q;
  const i = Math.floor(t);
  return sorted[i] + (sorted[Math.min(sorted.length - 1, i + 1)] - sorted[i]) * (t - i);
}

/** The window of `w` consecutive narrative pages with the highest (`sign` 1) or lowest (-1) mean. */
function extremeWindow(pages: Page[], values: number[], w: number, sign: 1 | -1): Stretch | null {
  if (w < 1 || values.length < w) return null;
  let sum = 0,
    best = -Infinity,
    end = -1;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] - (i >= w ? values[i - w] : 0);
    if (i >= w - 1 && sign * sum > best) {
      best = sign * sum;
      end = i;
    }
  }
  return { from: pages[end - w + 1].index, to: pages[end].index, value: (sign * best) / w };
}

function leadingEmotion(pages: Page[]) {
  const means = Object.fromEntries(EMOTIONS.map((e) => [e.id, mean(pages.map((p) => p.a.emotions[e.id]))])) as Record<EmotionId, number>;
  const id = argmax(means);
  return { emotion: means[id] < NEUTRAL_THRESHOLD ? ("neutral" as const) : id, value: means[id] };
}

export type DnaInsights = {
  /** Equal slices of the book (opening, middle, ending) with the emotion that leads each on average. */
  parts: { from: number; to: number; emotion: EmotionId | "neutral"; value: number }[];
  peak: { index: number; emotion: EmotionId | "neutral"; value: number } | null;
  intense: Stretch | null;
  calm: Stretch | null;
  mean: number;
};

/** What the DNA strip shows, in numbers: who leads each part, where intensity peaks, the loudest and quietest stretch. */
export function dnaInsights(analyses: Analyses, parts = 3): DnaInsights {
  const pages = narrative(analyses);
  const n = analyses.length;
  const values = pages.map((p) => intensity(p.a));
  const slices = Array.from({ length: parts }, (_, k) => {
    const from = Math.floor((k / parts) * n),
      to = Math.floor(((k + 1) / parts) * n) - 1;
    const inside = pages.filter((p) => p.index >= from && p.index <= to);
    return inside.length ? { from, to, ...leadingEmotion(inside) } : null;
  }).filter((s) => s != null);
  const top = pages.reduce<Page | null>((m, p) => (!m || intensity(p.a) > intensity(m.a) ? p : m), null);
  const w = stretchSize(pages.length);
  const intense = pages.length >= 4 ? extremeWindow(pages, values, w, 1) : null;
  const calm = pages.length >= 4 ? extremeWindow(pages, values, w, -1) : null;
  const varied = intense && calm && intense.value - calm.value >= 0.05;
  return {
    parts: slices,
    peak: top ? { index: top.index, emotion: dominantEmotion(top.a), value: intensity(top.a) } : null,
    intense: varied ? intense : null,
    calm: varied ? calm : null,
    mean: mean(values),
  };
}

export type BookInsights = {
  /** The page where light before and after differs most. */
  turn: { index: number; before: number; after: number } | null;
  /** Where emotions change fastest from page to page; `ratio` compares it with the whole book. */
  volatile: (Stretch & { ratio: number }) | null;
  /** Light from the 10th to the 90th percentile of pages, and how many emotions lead at least one page. */
  range: { low: number; high: number; emotions: number } | null;
  /** Share of narrative pages where dialogue is the leading narration mode. */
  dialogue: number | null;
  /** The theme whose likelihood differs most between the first and the last third. */
  themeShift: { id: ThemeId; from: number; to: number } | null;
  /** Correlation of tension with position: positive means it builds. */
  tension: number | null;
};

export function bookInsights(analyses: Analyses): BookInsights {
  const pages = narrative(analyses);
  const k = pages.length;
  const n = analyses.length;
  if (!k) return { turn: null, volatile: null, range: null, dialogue: null, themeShift: null, tension: null };

  const light = pages.map((p) => p.a.texture.valence);
  const prefix = [0];
  for (const v of light) prefix.push(prefix[prefix.length - 1] + v);
  const w = Math.max(2, Math.round(k / 8));
  let turn: BookInsights["turn"] = null;
  for (let i = w; i <= k - w; i++) {
    const before = (prefix[i] - prefix[i - w]) / w,
      after = (prefix[i + w] - prefix[i]) / w;
    if (Math.abs(after - before) >= 0.1 && (!turn || Math.abs(after - before) > Math.abs(turn.after - turn.before))) turn = { index: pages[i].index, before, after };
  }

  let volatile: BookInsights["volatile"] = null;
  if (k >= 6) {
    const change = pages.slice(1).map((p, j) => mean(EMOTIONS.map((e) => Math.abs(p.a.emotions[e.id] - pages[j].a.emotions[e.id]))));
    const overall = mean(change);
    const top = extremeWindow(pages.slice(1), change, stretchSize(k), 1);
    if (top && overall > 0) volatile = { ...top, from: pages[pages.findIndex((p) => p.index === top.from) - 1].index, ratio: top.value / overall };
  }

  const leading = new Set(pages.map((p) => dominantEmotion(p.a)).filter((e) => e !== "neutral"));
  const range = { low: quantile(light, 0.1), high: quantile(light, 0.9), emotions: leading.size };
  const dialogue = pages.filter((p) => argmax(p.a.mode) === "dialogue").length / k;

  const first = pages.filter((p) => p.index < n / 3),
    last = pages.filter((p) => p.index >= (2 * n) / 3);
  let themeShift: BookInsights["themeShift"] = null;
  if (first.length && last.length)
    for (const t of THEMES) {
      const from = mean(first.map((p) => p.a.themes[t.id])),
        to = mean(last.map((p) => p.a.themes[t.id]));
      if (Math.abs(to - from) >= 0.1 && (!themeShift || Math.abs(to - from) > Math.abs(themeShift.to - themeShift.from))) themeShift = { id: t.id, from, to };
    }

  const r = k >= 6 ? pearson(pages.map((p) => p.index), pages.map((p) => p.a.texture.tension)) : 0;
  return { turn, volatile, range, dialogue, themeShift, tension: Math.abs(r) >= 0.3 ? r : null };
}
