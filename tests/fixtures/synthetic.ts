import { EMOTIONS, ERAS, GENRES, MODES, MOODS, PROFILE_SCALES, TEXTURES, THEMES } from "../../shared/catalog.ts";
import type { BookProfile, Distribution, SegmentAnalysis } from "../../shared/types.ts";
import { fingerprintFrom, type Fingerprint } from "../../src/domain/fingerprint.ts";
import { normalize, segmentText, type Segment } from "../../src/domain/text.ts";

export const DEMO_MODEL = "synthetic-demo-v3";

const passages = [
  "In the morning the sea looked like a continuation of the sky. Lida opened the window and salt air filled the room. For the first time in months she had nowhere to be. On the sill stood the cup her father had once brought back from a voyage. She ran a finger along its thin crack and smiled.",
  "The house met her with silence. Everything was in its place: the keys by the door, the old coat, a letter on the table. Only the man these things belonged to was gone. Lida sat on the edge of a chair and listened to the day moving slowly behind the wall.",
  "By evening the wind rose. The attic door slammed so hard that she flinched. Down at the pier someone lit a lantern. Lida knew no boat came back in weather like this, and still she watched the water, waiting for a familiar silhouette.",
  "The neighbour brought bread and lingered in the doorway. They talked for a long time about simple things: the rain, the garden, when the post office would open again. The words made things calmer. Sometimes it is enough to know that someone lives on the other side of the fence.",
  "In the drawer beneath the charts she found a notebook. On the first page was an island she could not remember on any map. Then came dates and short entries. Lida turned a page, then another. The story, it turned out, had a completely different beginning.",
  "At dawn they walked down to the water. Lida took off her boots and stepped onto the cold sand. Nothing had ended and nothing was decided yet, but the horizon looked open again. She thought she might stay. At least until next spring.",
];

export const SAMPLE_BOOK = {
  title: "Where the Sea Begins",
  author: "xbook fixture",
  format: "TXT",
  text: normalize(Array.from({ length: 1800 }, (_, i) => passages[Math.floor(i / 300) % passages.length]).join("\n\n")),
};

type Chapter = {
  e: Partial<Record<(typeof EMOTIONS)[number]["id"], number>>;
  t: Partial<Record<(typeof TEXTURES)[number]["id"], number>>;
  mood: Partial<Record<(typeof MOODS)[number]["id"], number>>;
  mode: Partial<Record<(typeof MODES)[number]["id"], number>>;
  themes: Partial<Record<(typeof THEMES)[number]["id"], number>>;
};

const chapters: Chapter[] = [
  { e: { joy: 0.55, trust: 0.4, anticipation: 0.3 }, t: { pace: 0.15, tension: 0.05, interiority: 0.5, imagery: 0.8, valence: 0.78 }, mood: { meditative: 5, idyllic: 3 }, mode: { description: 5, introspection: 2 }, themes: { nature: 0.8, home: 0.5, memory: 0.4, family: 0.3 } },
  { e: { sadness: 0.7, trust: 0.2, fear: 0.15 }, t: { pace: 0.08, tension: 0.2, interiority: 0.85, imagery: 0.45, ideas: 0.3, valence: 0.18 }, mood: { melancholic: 6, meditative: 2 }, mode: { introspection: 5, description: 2 }, themes: { death: 0.75, memory: 0.8, home: 0.6, family: 0.55, loneliness: 0.7 } },
  { e: { fear: 0.6, anticipation: 0.65, sadness: 0.3, surprise: 0.25 }, t: { pace: 0.55, tension: 0.8, interiority: 0.4, imagery: 0.65, valence: 0.25 }, mood: { suspenseful: 5, grim: 1, mysterious: 1 }, mode: { action: 3, description: 3 }, themes: { nature: 0.7, death: 0.35, loneliness: 0.4, family: 0.3 } },
  { e: { trust: 0.7, joy: 0.4 }, t: { pace: 0.3, tension: 0.05, interiority: 0.2, imagery: 0.3, humor: 0.25, valence: 0.72 }, mood: { idyllic: 4, everyday: 3, tender: 1 }, mode: { dialogue: 6, action: 1 }, themes: { friendship: 0.8, home: 0.6 } },
  { e: { surprise: 0.7, anticipation: 0.6, joy: 0.2 }, t: { pace: 0.35, tension: 0.4, interiority: 0.55, imagery: 0.4, ideas: 0.2, valence: 0.55 }, mood: { mysterious: 6, suspenseful: 1 }, mode: { document: 4, introspection: 2 }, themes: { memory: 0.75, journey: 0.6, family: 0.6, identity: 0.5 } },
  { e: { joy: 0.5, trust: 0.6, anticipation: 0.5, sadness: 0.2 }, t: { pace: 0.2, tension: 0.1, interiority: 0.6, imagery: 0.7, ideas: 0.25, valence: 0.85 }, mood: { meditative: 4, tender: 3, idyllic: 1 }, mode: { description: 4, introspection: 3 }, themes: { nature: 0.7, home: 0.7, freedom: 0.6, identity: 0.45 } },
];

const wave = (i: number, j: number) => Math.sin(i * 2.39 + j * 4.1) * 0.07 + Math.sin(i * 0.37 + j * 1.7) * 0.05;
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function dist<K extends string>(ids: readonly { id: K }[], weights: Partial<Record<K, number>>, i: number): Distribution<K> {
  const raw = ids.map((d, j) => [d.id, Math.max(0.02, (weights[d.id] ?? 0.1) + wave(i, j) * 4)] as const);
  const total = raw.reduce((s, [, v]) => s + v, 0);
  return Object.fromEntries(raw.map(([k, v]) => [k, v / total])) as Distribution<K>;
}

function flat<K extends string>(ids: readonly { id: K }[], values: Partial<Record<K, number>>, i: number, base: number) {
  return Object.fromEntries(ids.map((d, j) => [d.id, clamp((values[d.id] ?? base) + wave(i, j))])) as Distribution<K>;
}

function blend<K extends string>(a: Partial<Record<K, number>>, b: Partial<Record<K, number>>, t: number, scale = 1) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as K[]);
  return Object.fromEntries([...keys].map((k) => [k, ((a[k] ?? 0) * (1 - t) + (b[k] ?? 0) * t) * scale])) as Partial<Record<K, number>>;
}

function chapterAt(i: number, total: number): Chapter {
  const position = (i / total) * chapters.length;
  const index = Math.min(chapters.length - 1, Math.floor(position));
  const next = chapters[Math.min(chapters.length - 1, index + 1)];
  const local = position - index;
  const t = local < 0.7 ? 0 : ((local - 0.7) / 0.3) ** 2 * (3 - 2 * ((local - 0.7) / 0.3));
  const scene = 0.82 + 0.28 * Math.sin(local * Math.PI * 3.2 + index);
  const a = chapters[index];
  return {
    e: blend(a.e, next.e, t, scene),
    t: { ...blend(a.t, next.t, t), tension: ((a.t.tension ?? 0) * (1 - t) + (next.t.tension ?? 0) * t) * scene },
    mood: blend(a.mood, next.mood, t),
    mode: blend(a.mode, next.mode, t),
    themes: blend(a.themes, next.themes, t),
  };
}

/** Deterministic synthetic Jev answers for tests. */
export function demoAnalyses(segments: Segment[]): SegmentAnalysis[] {
  return segments.map((_, i) => {
    const chapter = chapterAt(i, segments.length);
    const confidence = <K extends string>(ids: readonly { id: K }[]) =>
      Object.fromEntries(ids.map((d, j) => [d.id, clamp(0.72 + wave(i, j))])) as Distribution<K>;
    return {
      emotions: flat(EMOTIONS, chapter.e, i, 0.07),
      emotionConfidence: confidence(EMOTIONS),
      texture: flat(TEXTURES, chapter.t, i, 0.1),
      textureConfidence: confidence(TEXTURES),
      mood: dist(MOODS, chapter.mood, i),
      moodConfidence: 0.7,
      mode: dist(MODES, { ...chapter.mode, paratext: 0 }, i),
      modeConfidence: 0.7,
      themes: flat(THEMES, chapter.themes, i, 0.03),
      model: DEMO_MODEL,
      rubric: "synthetic",
    };
  });
}

export const DEMO_PROFILE: BookProfile = {
  genre: Object.fromEntries(GENRES.map((g) => [g.id, g.id === "literary" ? 0.72 : g.id === "romance" ? 0.08 : 0.02])) as BookProfile["genre"],
  genreConfidence: 0.7,
  era: Object.fromEntries(ERAS.map((e) => [e.id, e.id === "modern" ? 0.8 : 0.025])) as BookProfile["era"],
  eraConfidence: 0.7,
  scales: { realism: 0.1, scope: 0.1, worldview: 0.7, drive: 0.2, complexity: 0.4, audience: 0.7 },
  scaleConfidence: Object.fromEntries(PROFILE_SCALES.map((s) => [s.id, 0.7])) as BookProfile["scaleConfidence"],
  model: DEMO_MODEL,
  rubric: "synthetic",
};

/** Eight fingerprints: four distinct books cut from different chapters, each with a near-twin. */
export function fixtureCorpus(): { id: string; fingerprint: Fingerprint }[] {
  const segments = segmentText(SAMPLE_BOOK.text, "pages");
  const all = demoAnalyses(segments);
  const span = Math.floor(segments.length / 4);
  return Array.from({ length: 8 }, (_, k) => {
    const from = Math.floor(k / 2) * span + (k % 2) * 3;
    const analyses = all.map((a, i) => (i >= from && i < from + span - 3 ? a : null));
    return { id: `book-${k}`, fingerprint: fingerprintFrom(segments, analyses, DEMO_PROFILE)! };
  });
}
