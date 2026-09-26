// Corpus analysis for the promo film: reads data/xbook.db read-only and writes video/src/data/analysis.json.
// Every number is computed with the app's own domain code from stored Jev answers.
// Usage (from the repo root): node video/scripts/analyze.ts
import { writeFileSync } from "node:fs";
import { EMOTIONS, MOODS, RUBRIC_VERSION, THEMES } from "../../shared/catalog.ts";
import type { SegmentAnalysis } from "../../shared/types.ts";
import { openStore } from "../../server/store.ts";
import { ARC_SHAPES, dominantEmotion, intensity, isParatext, moments, pearson, smooth, storyArc, series, type Analyses } from "../../src/domain/analysis.ts";
import { JEV_USD_PER_MTOK } from "../../src/domain/cost.ts";
import { DEFAULT_WEIGHTS, fingerprintFrom, fingerprintValues, GROUP_COLORS, type Fingerprint } from "../../src/domain/fingerprint.ts";
import { embed, neighbours } from "../../src/domain/pca.ts";
import type { Segment } from "../../src/domain/text.ts";

const OUT = "video/src/data/analysis.json";
const BINS = 40;
const FEATURED = "pg-2701"; // Moby Dick
const QUESTIONS_PER_PAGE = 36;

const store = openStore(undefined, { readOnly: true });
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

type Book = { id: string; title: string; author: string; rank: number; pages: number; analyses: Analyses; fingerprint: Fingerprint };

const books: Book[] = [];
for (const p of store.progress(RUBRIC_VERSION)) {
  if (p.analysed !== p.pages || !p.profiled) continue;
  const text = store.text(p.id)!;
  const segments: Segment[] = store.segments(p.id).map((s) => ({ id: s.idx, start: s.start, end: s.end, text: text.slice(s.start, s.end) }));
  const stored = store.analyses(p.id, RUBRIC_VERSION);
  const analyses = segments.map((s) => stored.get(s.id) ?? null);
  const fingerprint = fingerprintFrom(segments, analyses, store.profile(p.id, RUBRIC_VERSION) ?? undefined);
  if (fingerprint) books.push({ id: p.id, title: p.title, author: p.author, rank: p.rank ?? 0, pages: p.pages, analyses, fingerprint });
}

const pages = books.flatMap((b) => b.analyses.filter((a): a is SegmentAnalysis => !!a && !isParatext(a)));
const spend = store.spend();
const totalPages = books.reduce((s, b) => s + b.pages, 0);

// The canon's average shape: each book resampled onto the same 0–100% axis, then averaged.
const curve = (pick: (a: SegmentAnalysis) => number) => {
  const perBook = books.map((b) => smooth(series(b.analyses, pick, BINS), 1.2));
  return Array.from({ length: BINS }, (_, i) => round(mean(perBook.map((c) => c[i]).filter((v): v is number => v != null))));
};
const tension = curve((a) => a.texture.tension);
const light = curve((a) => a.texture.valence);
const pace = curve((a) => a.texture.pace);
const peakAt = tension.indexOf(Math.max(...tension));

// Where each book's single most tense stretch lands, as a share of its length.
const climaxPositions = books.map((b) => {
  const s = smooth(series(b.analyses, (a) => a.texture.tension * 0.7 + a.texture.pace * 0.3, 60), 2);
  let best = 0;
  s.forEach((v, i) => v != null && v > (s[best] ?? -1) && (best = i));
  return best / (s.length - 1);
});
const climaxHistogram = Array.from({ length: 10 }, (_, k) => climaxPositions.filter((t) => Math.min(9, Math.floor(t * 10)) === k).length);
const lateClimax = climaxPositions.filter((t) => t >= 0.7).length / books.length;

const arcCounts = Object.fromEntries([...ARC_SHAPES.map((s) => s.id), "flat"].map((id) => [id, 0])) as Record<string, number>;
const arcExamples: Record<string, string[]> = {};
for (const b of books) {
  const shape = storyArc(series(b.analyses, (a) => a.texture.valence)).shape;
  arcCounts[shape]++;
  (arcExamples[shape] ??= []).push(b.title);
}

const moodShare = MOODS.map((m) => ({
  id: m.id,
  label: m.label,
  color: m.color,
  share: round(pages.filter((a) => Object.entries(a.mood).sort((x, y) => y[1] - x[1])[0][0] === m.id).length / pages.length),
})).sort((a, b) => b.share - a.share);

const pagePearson = (x: (a: SegmentAnalysis) => number, y: (a: SegmentAnalysis) => number) => round(pearson(pages.map(x), pages.map(y)), 2);
const correlations = [
  { a: "tension", b: "light", r: pagePearson((a) => a.texture.tension, (a) => a.texture.valence) },
  { a: "fear", b: "tension", r: pagePearson((a) => a.emotions.fear, (a) => a.texture.tension) },
  { a: "pace", b: "interiority", r: pagePearson((a) => a.texture.pace, (a) => a.texture.interiority) },
  { a: "humour", b: "light", r: pagePearson((a) => a.texture.humor, (a) => a.texture.valence) },
];

const extreme = (label: string, read: (f: Fingerprint) => number, sign = 1) => {
  const b = [...books].sort((x, y) => sign * (read(y.fingerprint) - read(x.fingerprint)))[0];
  return { label, title: b.title, author: b.author, value: round(read(b.fingerprint), 2) };
};
const extremes = [
  extreme("most tense", (f) => f.texture.tension),
  extreme("darkest", (f) => f.texture.valence, -1),
  extreme("brightest", (f) => f.texture.valence),
  extreme("funniest", (f) => f.texture.humor),
  extreme("most inward", (f) => f.texture.interiority),
  extreme("fastest", (f) => f.texture.pace),
];

const embedding = embed(books.map((b) => ({ id: b.id, fingerprint: b.fingerprint })), DEFAULT_WEIGHTS);
const scale = Math.max(...embedding.points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]));
const byId = new Map(books.map((b) => [b.id, b]));
const edges = new Map<string, { a: string; b: string; s: number }>();
for (const b of books)
  for (const n of neighbours(embedding.rows, b.id, 2)) {
    const key = [b.id, n.id].sort().join("|");
    edges.set(key, { a: b.id, b: n.id, s: round(n.similarity, 2) });
  }
const pairs = [...edges.values()].sort((x, y) => y.s - x.s);
const crossAuthor = pairs.filter((p) => byId.get(p.a)!.author !== byId.get(p.b)!.author);

const featured = byId.get(FEATURED)!;
const dnaBins = 96;
const dna = Array.from({ length: dnaBins }, (_, k) => {
  const from = Math.floor((k / dnaBins) * featured.pages);
  const to = Math.max(from + 1, Math.floor(((k + 1) / dnaBins) * featured.pages));
  const slice = featured.analyses.slice(from, to).filter((a): a is SegmentAnalysis => !!a && !isParatext(a));
  if (!slice.length) return null;
  const sums = Object.fromEntries(EMOTIONS.map((e) => [e.id, mean(slice.map((a) => a.emotions[e.id]))]));
  const lead = dominantEmotion({ ...slice[0], emotions: sums as SegmentAnalysis["emotions"] });
  return { e: lead, v: round(mean(slice.map(intensity)), 2) };
});
const featuredSpectrum = EMOTIONS.map((e) => ({
  id: e.id,
  color: e.color,
  values: smooth(series(featured.analyses, (a) => a.emotions[e.id], 60), 2).map((v) => (v == null ? null : round(v, 2))),
}));

const climaxMoment = moments(featured.analyses).find((m) => m.id === "climax")!;
const climaxAnswer = featured.analyses[climaxMoment.index]!;
const featuredText = store.text(featured.id)!;
const climaxSegment = store.segments(featured.id)[climaxMoment.index];
const topOf = (d: Record<string, number>, n: number) =>
  Object.entries(d)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => [k, round(v, 2)]);
const featuredPage = {
  index: climaxMoment.index,
  text: featuredText.slice(climaxSegment.start, climaxSegment.end).replace(/\s+/g, " ").trim(),
  emotions: EMOTIONS.map((e) => [e.id, round(climaxAnswer.emotions[e.id], 2)]),
  texture: Object.entries(climaxAnswer.texture).map(([k, v]) => [k, round(v, 2)]),
  mood: topOf(climaxAnswer.mood, 1)[0],
  mode: topOf(climaxAnswer.mode, 1)[0],
  themes: topOf(climaxAnswer.themes, 3),
};

const themeShare = THEMES.map((t) => ({ id: t.id, label: t.label, value: round(mean(books.map((b) => b.fingerprint.themes[t.id])), 3) })).sort((a, b) => b.value - a.value);

const result = {
  generatedAt: new Date().toISOString(),
  rubric: RUBRIC_VERSION,
  scale: {
    books: books.length,
    pages: totalPages,
    judgments: totalPages * QUESTIONS_PER_PAGE,
    dimensions: 85,
    jevTokens: spend.jevTokens,
    jevUsd: round((spend.jevTokens / 1e6) * JEV_USD_PER_MTOK, 2),
    briefUsd: round(spend.briefUsd, 2),
    usdPerPage: round(((spend.jevTokens / 1e6) * JEV_USD_PER_MTOK) / totalPages, 5),
  },
  canonCurve: { tension, light, pace, peakAt: round(peakAt / (BINS - 1), 2) },
  climax: { histogram: climaxHistogram, lateShare: round(lateClimax, 2), median: round([...climaxPositions].sort()[Math.floor(books.length / 2)], 2) },
  arcs: ARC_SHAPES.map((s) => ({ id: s.id, label: s.label, count: arcCounts[s.id], examples: (arcExamples[s.id] ?? []).slice(0, 3) })).concat([
    { id: "flat", label: "Flat", count: arcCounts.flat, examples: (arcExamples.flat ?? []).slice(0, 3) },
  ]),
  moodShare,
  correlations,
  extremes,
  themes: themeShare.slice(0, 8),
  map: {
    axes: embedding.axes.map((a) => ({ explained: round(a.explained, 3), positive: a.positive.map((f) => f.label), negative: a.negative.map((f) => f.label) })),
    points: embedding.points.map((p) => {
      const b = byId.get(p.id)!;
      const e = Object.entries(b.fingerprint.emotions).sort((x, y) => y[1] - x[1])[0][0];
      return { id: p.id, title: b.title, author: b.author, rank: b.rank, x: round(p.x / scale), y: round(p.y / scale), z: round(p.z / scale), emotion: e };
    }),
    edges: pairs.map((p) => [p.a, p.b, p.s]),
    closestPairs: crossAuthor.slice(0, 6).map((p) => ({ a: byId.get(p.a)!.title, b: byId.get(p.b)!.title, s: p.s })),
  },
  featured: {
    id: featured.id,
    title: featured.title,
    author: featured.author,
    pages: featured.pages,
    page: featuredPage,
    dna,
    spectrum: featuredSpectrum,
    fingerprint: fingerprintValues(featured.fingerprint).map((v) => ({ group: v.group, label: v.label, value: round(Number.isFinite(v.value) ? v.value : 0, 2) })),
    groupColors: GROUP_COLORS,
  },
};

writeFileSync(OUT, JSON.stringify(result));
store.close();
console.log(JSON.stringify({ ...result, map: { axes: result.map.axes, closestPairs: result.map.closestPairs }, featured: featured.title }, null, 1));
