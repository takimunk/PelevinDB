import {
  EMOTIONS,
  MODES,
  MOODS,
  TEXTURES,
  THEMES,
  type EmotionId,
  type ModeId,
  type MoodId,
  type TextureId,
  type ThemeId,
} from "../../shared/catalog.ts";
import { argmax, isParatext } from "../../shared/analysis.ts";
import type { Distribution, SegmentAnalysis } from "../../shared/types.ts";
import type { Segment } from "./text.ts";

export { argmax, isParatext };
export type Analyses = (SegmentAnalysis | null)[];
export const NEUTRAL_THRESHOLD = 0.2;

export function dominantEmotion(a: SegmentAnalysis | null | undefined): EmotionId | "neutral" {
  if (!a) return "neutral";
  const best = argmax(a.emotions);
  return a.emotions[best] < NEUTRAL_THRESHOLD ? "neutral" : best;
}

export const intensity = (a: SegmentAnalysis | null | undefined) =>
  a ? Math.max(...Object.values(a.emotions)) : 0;

export const emotionColor = (id: EmotionId | "neutral") =>
  EMOTIONS.find((e) => e.id === id)?.color ?? "#8a8780";
export const moodColor = (id: MoodId) => MOODS.find((m) => m.id === id)!.color;
export const modeColor = (id: ModeId) => MODES.find((m) => m.id === id)!.color;

export type BookStats = {
  emotions: Distribution<EmotionId>;
  texture: Distribution<TextureId>;
  mood: Distribution<MoodId>;
  mode: Distribution<ModeId>;
  themes: Distribution<ThemeId>;
  analyzed: number;
  narrative: number;
  coverage: number;
};

const zeros = <K extends string>(items: readonly { id: K }[]) =>
  Object.fromEntries(items.map((i) => [i.id, 0])) as Distribution<K>;

/** Length-weighted means over analyzed narrative pages. */
export function bookStats(segments: Segment[], analyses: Analyses): BookStats {
  const stats: BookStats = {
    emotions: zeros(EMOTIONS),
    texture: zeros(TEXTURES),
    mood: zeros(MOODS),
    mode: zeros(MODES),
    themes: zeros(THEMES),
    analyzed: 0,
    narrative: 0,
    coverage: 0,
  };
  let weight = 0;
  segments.forEach((s, i) => {
    const a = analyses[i];
    if (!a) return;
    stats.analyzed++;
    if (isParatext(a)) return;
    stats.narrative++;
    const w = s.text.length;
    weight += w;
    for (const group of ["emotions", "texture", "mood", "mode", "themes"] as const) {
      const target = stats[group] as Record<string, number>;
      const source = a[group] as Record<string, number>;
      for (const key of Object.keys(target)) target[key] += (source[key] ?? 0) * w;
    }
  });
  if (weight)
    for (const group of ["emotions", "texture", "mood", "mode", "themes"] as const) {
      const target = stats[group] as Record<string, number>;
      for (const key of Object.keys(target)) target[key] /= weight;
    }
  stats.coverage = segments.length ? stats.analyzed / segments.length : 0;
  return stats;
}

/** Bins a per-page value along the book; unanalyzed or paratext pages leave gaps (null). */
export function series(
  analyses: Analyses,
  pick: (a: SegmentAnalysis) => number,
  bins = Math.min(analyses.length, 120),
): (number | null)[] {
  const n = analyses.length;
  if (!n || bins < 1) return [];
  const sums = new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);
  analyses.forEach((a, i) => {
    if (!a || isParatext(a)) return;
    const b = Math.min(bins - 1, Math.floor((i / n) * bins));
    sums[b] += pick(a);
    counts[b]++;
  });
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
}

/** Gaussian smoothing that ignores gaps and keeps them where no data is nearby. */
export function smooth(values: (number | null)[], sigma = Math.max(1, values.length / 36)) {
  const radius = Math.ceil(sigma * 2.5);
  return values.map((_, i) => {
    let sum = 0,
      weight = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      const v = values[j];
      if (v == null) continue;
      const w = Math.exp(-((j - i) ** 2) / (2 * sigma * sigma));
      sum += v * w;
      weight += w;
    }
    return weight > 0.35 ? sum / weight : null;
  });
}

export const ARC_SHAPES = [
  { id: "rise", label: "Rags to riches", hint: "Steady rise", ru: "Из грязи в князи", hintRu: "Ровный подъём", f: (t: number) => t },
  { id: "fall", label: "Tragedy", hint: "Steady fall", ru: "Трагедия", hintRu: "Ровное падение", f: (t: number) => -t },
  { id: "hole", label: "Man in a hole", hint: "Fall, then rise", ru: "Человек в яме", hintRu: "Падение, затем подъём", f: (t: number) => -Math.sin(Math.PI * t) },
  { id: "icarus", label: "Icarus", hint: "Rise, then fall", ru: "Икар", hintRu: "Подъём, затем падение", f: (t: number) => Math.sin(Math.PI * t) },
  { id: "cinderella", label: "Cinderella", hint: "Rise, fall, rise", ru: "Золушка", hintRu: "Подъём, падение, подъём", f: (t: number) => t + 0.35 * Math.sin(2 * Math.PI * t) },
  { id: "oedipus", label: "Oedipus", hint: "Fall, rise, fall", ru: "Эдип", hintRu: "Падение, подъём, падение", f: (t: number) => -t - 0.35 * Math.sin(2 * Math.PI * t) },
] as const;
export type ArcId = (typeof ARC_SHAPES)[number]["id"] | "flat";

export function pearson(a: number[], b: number[]) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0,
    da = 0,
    db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Resamples a curve to `n` points by linear interpolation over non-null values. */
export function resample(values: (number | null)[], n: number) {
  const known = values
    .map((v, i) => [i / Math.max(1, values.length - 1), v] as const)
    .filter((p): p is readonly [number, number] => p[1] != null);
  if (!known.length) return [];
  return Array.from({ length: n }, (_, k) => {
    const t = n === 1 ? 0 : k / (n - 1);
    const right = known.findIndex(([x]) => x >= t);
    if (right === -1) return known.at(-1)![1];
    if (right === 0) return known[0][1];
    const [x0, y0] = known[right - 1],
      [x1, y1] = known[right];
    return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0 || 1);
  });
}

/** Classifies the valence curve against Vonnegut's story shapes (Reagan et al., 2016). */
export function storyArc(valence: (number | null)[]) {
  const curve = resample(smooth(valence, Math.max(1.5, valence.length / 12)), 48);
  if (curve.length < 2) return { shape: "flat" as ArcId, curve, fits: [] as { id: ArcId; r: number }[] };
  const range = Math.max(...curve) - Math.min(...curve);
  const fits = ARC_SHAPES.map((s) => ({
    id: s.id as ArcId,
    r: pearson(
      curve,
      curve.map((_, i) => s.f(i / (curve.length - 1))),
    ),
  })).sort((a, b) => b.r - a.r);
  return { shape: range < 0.08 || fits[0].r < 0.35 ? ("flat" as ArcId) : fits[0].id, curve, fits };
}

/** Mean absolute change of valence between neighbouring analyzed pages. */
export function volatility(analyses: Analyses) {
  let prev: number | null = null,
    sum = 0,
    count = 0;
  for (const a of analyses) {
    if (!a || isParatext(a)) continue;
    if (prev != null) {
      sum += Math.abs(a.texture.valence - prev);
      count++;
    }
    prev = a.texture.valence;
  }
  return count ? sum / count : 0;
}

export type Moment = { id: string; label: string; hint: string; ru: string; hintRu: string; index: number; value: number; color: string };

/** Extreme pages worth opening: the climax, the quietest page, the brightest and darkest. */
export function moments(analyses: Analyses): Moment[] {
  const candidates: { id: string; label: string; hint: string; ru: string; hintRu: string; color: string; pick: (a: SegmentAnalysis) => number }[] = [
    { id: "climax", label: "Climax", hint: "most tension and pace", ru: "Кульминация", hintRu: "больше всего напряжения и темпа", color: "#d93b30", pick: (a) => a.texture.tension * 0.7 + a.texture.pace * 0.3 },
    { id: "still", label: "Stillest page", hint: "slowest and most meditative", ru: "Самая тихая страница", hintRu: "медленнее и созерцательнее всего", color: "#5aa6d6", pick: (a) => (1 - a.texture.pace) * 0.6 + a.mood.meditative * 0.4 },
    { id: "light", label: "Brightest moment", hint: "most light and joy", ru: "Самый светлый момент", hintRu: "больше всего света и радости", color: "#dba100", pick: (a) => a.texture.valence * 0.6 + a.emotions.joy * 0.4 },
    { id: "dark", label: "Darkest moment", hint: "least light, most sadness", ru: "Самый тёмный момент", hintRu: "меньше всего света, больше всего грусти", color: "#4a5fd0", pick: (a) => (1 - a.texture.valence) * 0.6 + a.emotions.sadness * 0.4 },
    { id: "wonder", label: "Biggest surprise", hint: "strongest surprise", ru: "Главная неожиданность", hintRu: "сильнее всего удивление", color: "#17998a", pick: (a) => a.emotions.surprise },
    { id: "inner", label: "Deepest interiority", hint: "most inside a character's mind", ru: "Глубже всего в мыслях", hintRu: "больше всего внутри героя", color: "#9152c8", pick: (a) => a.texture.interiority },
  ];
  const used = new Set<number>();
  const result: Moment[] = [];
  for (const c of candidates) {
    let best = -1,
      value = -Infinity;
    analyses.forEach((a, i) => {
      if (!a || isParatext(a) || used.has(i)) return;
      const v = c.pick(a);
      if (v > value) {
        value = v;
        best = i;
      }
    });
    if (best !== -1) {
      used.add(best);
      result.push({ id: c.id, label: c.label, hint: c.hint, ru: c.ru, hintRu: c.hintRu, color: c.color, index: best, value });
    }
  }
  return result;
}

export function topEntries<K extends string>(dist: Distribution<K>, n: number) {
  return (Object.entries(dist) as [K, number][]).sort((a, b) => b[1] - a[1]).slice(0, n);
}
