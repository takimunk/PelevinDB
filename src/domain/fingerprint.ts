import {
  EMOTIONS,
  ERAS,
  GENRES,
  MODES,
  MOODS,
  PROFILE_SCALES,
  TEXTURES,
  THEMES,
  type EmotionId,
  type EraId,
  type GenreId,
  type ModeId,
  type MoodId,
  type ProfileScaleId,
  type TextureId,
  type ThemeId,
} from "../../shared/catalog.ts";
import type { BookProfile, Distribution, SegmentAnalysis } from "../../shared/types.ts";
import { bookStats, series, storyArc, volatility, resample, type Analyses, type ArcId } from "./analysis.ts";
import type { Segment } from "./text.ts";

export const ARC_POINTS = 5;

/**
 * A book embedding whose every coordinate is an interpretable Jev judgment
 * (or a statistic computed in code from those judgments).
 */
export type Fingerprint = {
  emotions: Distribution<EmotionId>;
  texture: Distribution<TextureId>;
  mood: Distribution<MoodId>;
  mode: Distribution<ModeId>;
  themes: Distribution<ThemeId>;
  arc: number[];
  arcShape: ArcId;
  volatility: number;
  profile?: {
    genre: Distribution<GenreId>;
    era: Distribution<EraId>;
    scales: Distribution<ProfileScaleId>;
  };
  coverage: number;
};

export function fingerprintFrom(
  segments: Segment[],
  analyses: Analyses,
  profile?: BookProfile,
): Fingerprint | undefined {
  const stats = bookStats(segments, analyses);
  if (!stats.narrative) return undefined;
  const { paratext: _, ...narrativeModes } = stats.mode;
  const modeTotal = Object.values(narrativeModes).reduce((s, v) => s + v, 0) || 1;
  const valence = series(analyses, (a) => a.texture.valence);
  const arc = storyArc(valence);
  return {
    emotions: stats.emotions,
    texture: stats.texture,
    mood: stats.mood,
    mode: { ...stats.mode, ...Object.fromEntries(Object.entries(narrativeModes).map(([k, v]) => [k, v / modeTotal])), paratext: 0 },
    themes: stats.themes,
    arc: resample(arc.curve, ARC_POINTS),
    arcShape: arc.shape,
    volatility: volatility(analyses),
    profile: profile && { genre: profile.genre, era: profile.era, scales: profile.scales },
    coverage: stats.coverage,
  };
}

export type FeatureGroupId = "emotions" | "texture" | "mood" | "mode" | "themes" | "arc" | "profile";
export type Feature = { group: FeatureGroupId; key: string; label: string; ru: string; read: (f: Fingerprint) => number };

export const ACTS = ["opening", "setup", "middle", "escalation", "ending"];
export const ACTS_RU = ["начало", "завязка", "середина", "нарастание", "финал"];

export const FEATURE_GROUPS: { id: FeatureGroupId; label: string; hint: string; ru: string; hintRu: string; features: Feature[] }[] = [
  {
    id: "emotions",
    label: "Emotions",
    hint: "Plutchik's eight",
    ru: "Эмоции",
    hintRu: "Восемь эмоций Плутчика",
    features: EMOTIONS.map((e) => ({ group: "emotions", key: e.id, label: e.label, ru: e.ru, read: (f) => f.emotions[e.id] })),
  },
  {
    id: "texture",
    label: "Texture",
    hint: "Pace, tension, interiority, imagery, ideas, humor, light",
    ru: "Фактура",
    hintRu: "Темп, напряжение, внутренний мир, образность, идеи, юмор, свет",
    features: TEXTURES.map((t) => ({ group: "texture", key: t.id, label: t.label, ru: t.ru, read: (f) => f.texture[t.id] })),
  },
  {
    id: "mood",
    label: "Mood",
    hint: "From meditative to kinetic",
    ru: "Настроение",
    hintRu: "От созерцательного до динамичного",
    features: MOODS.map((m) => ({ group: "mood", key: m.id, label: m.label, ru: m.ru, read: (f) => f.mood[m.id] })),
  },
  {
    id: "mode",
    label: "Narration",
    hint: "Dialogue, description, action, introspection",
    ru: "Повествование",
    hintRu: "Диалог, описание, действие, самоанализ",
    features: MODES.filter((m) => m.id !== "paratext").map((m) => ({ group: "mode", key: m.id, label: m.label, ru: m.ru, read: (f) => f.mode[m.id] })),
  },
  {
    id: "themes",
    label: "Themes",
    hint: "Love, death, journey…",
    ru: "Темы",
    hintRu: "Любовь, смерть, путь…",
    features: THEMES.map((t) => ({ group: "themes", key: t.id, label: t.label, ru: t.ru, read: (f) => f.themes[t.id] })),
  },
  {
    id: "arc",
    label: "Story arc",
    hint: "Light across five acts, volatility",
    ru: "Сюжетная дуга",
    hintRu: "Свет в пяти актах и изменчивость",
    features: [
      ...ACTS.map((label, i) => ({ group: "arc" as const, key: `act${i}`, label: `light: ${label}`, ru: `свет: ${ACTS_RU[i]}`, read: (f: Fingerprint) => f.arc[i] ?? NaN })),
      { group: "arc", key: "volatility", label: "Volatility", ru: "Изменчивость", read: (f) => f.volatility },
    ],
  },
  {
    id: "profile",
    label: "Genre & world",
    hint: "Whole-book profile",
    ru: "Жанр и мир",
    hintRu: "Профиль всей книги",
    features: [
      ...GENRES.map((g) => ({ group: "profile" as const, key: g.id, label: g.label, ru: g.ru, read: (f: Fingerprint) => f.profile?.genre[g.id] ?? NaN })),
      ...ERAS.filter((e) => e.id !== "unclear").map((e) => ({ group: "profile" as const, key: e.id, label: e.label, ru: `эпоха: ${e.ru}`, read: (f: Fingerprint) => f.profile?.era[e.id] ?? NaN })),
      ...PROFILE_SCALES.map((s) => ({ group: "profile" as const, key: s.id, label: `${s.low} → ${s.high}`, ru: `${s.lowRu} → ${s.highRu}`, read: (f: Fingerprint) => f.profile?.scales[s.id] ?? NaN })),
    ],
  },
];

export const ALL_FEATURES = FEATURE_GROUPS.flatMap((g) => g.features);

export type Weights = Record<FeatureGroupId, number>;
export const DEFAULT_WEIGHTS: Weights = { emotions: 1, texture: 1, mood: 1, mode: 0.6, themes: 1, arc: 0.5, profile: 0.8 };

export const WEIGHT_PRESETS: { id: string; label: string; ru: string; weights: Weights }[] = [
  { id: "all", label: "All", ru: "Всё", weights: DEFAULT_WEIGHTS },
  { id: "feel", label: "Feel", ru: "Чувство", weights: { emotions: 1.4, texture: 0.6, mood: 1.4, mode: 0, themes: 0, arc: 0.8, profile: 0 } },
  { id: "about", label: "About", ru: "О чём", weights: { emotions: 0, texture: 0, mood: 0, mode: 0, themes: 1.5, arc: 0, profile: 1.2 } },
  { id: "craft", label: "Craft", ru: "Ремесло", weights: { emotions: 0, texture: 1.4, mood: 0.4, mode: 1.4, themes: 0, arc: 0.3, profile: 0.3 } },
];

export const vectorize = (f: Fingerprint) => ALL_FEATURES.map((feature) => feature.read(f));

export const GROUP_COLORS: Record<FeatureGroupId, string> = {
  emotions: "#dba100",
  texture: "#2f8fd8",
  mood: "#3f9b4f",
  mode: "#e4632a",
  themes: "#6f7fd6",
  arc: "#d6589a",
  profile: "#9152c8",
};

export type NamedValue = { group: FeatureGroupId; key: string; label: string; ru?: string; value: number };

/** The fingerprint as a flat list of named coordinates. */
export const fingerprintValues = (f: Fingerprint): NamedValue[] =>
  ALL_FEATURES.map((feature) => ({ group: feature.group, key: feature.key, label: feature.label, ru: feature.ru, value: feature.read(f) }));

/** Every raw Jev answer for one page, in catalog order. */
export function pageValues(a: SegmentAnalysis): NamedValue[] {
  const from = <K extends string>(group: FeatureGroupId, items: readonly { id: K; label: string; ru: string }[], dist: Record<K, number>) =>
    items.map((i) => ({ group, key: i.id, label: i.label, ru: i.ru, value: dist[i.id] }));
  return [
    ...from("emotions", EMOTIONS, a.emotions),
    ...from("texture", TEXTURES, a.texture),
    ...from("mood", MOODS, a.mood),
    ...from("mode", MODES, a.mode),
    ...from("themes", THEMES, a.themes),
  ];
}
