import type {
  EmotionId,
  EraId,
  GenreId,
  ModeId,
  MoodId,
  ProfileScaleId,
  TextureId,
  ThemeId,
} from "./catalog.ts";

export type Distribution<K extends string> = Record<K, number>;

/** Jev bills input tokens only; output tokens are free. */
export type JevUsage = { input_tokens?: number; output_tokens?: number };

/** Jev judgments for one page. Scores are normalized to 0–1; Choices keep full probabilities. */
export type SegmentAnalysis = {
  emotions: Distribution<EmotionId>;
  emotionConfidence: Distribution<EmotionId>;
  texture: Distribution<TextureId>;
  textureConfidence: Distribution<TextureId>;
  mood: Distribution<MoodId>;
  moodConfidence: number;
  mode: Distribution<ModeId>;
  modeConfidence: number;
  /** Noul probability that the theme is a significant subject of the page. */
  themes: Distribution<ThemeId>;
  model: string;
  rubric: string;
  usage?: JevUsage;
};

/** Whole-book judgments made once from evenly spaced excerpts. */
export type BookProfile = {
  genre: Distribution<GenreId>;
  genreConfidence: number;
  era: Distribution<EraId>;
  eraConfidence: number;
  scales: Distribution<ProfileScaleId>;
  scaleConfidence: Distribution<ProfileScaleId>;
  model: string;
  rubric: string;
  usage?: JevUsage;
};

/** Everything the dashboard measured, condensed for the brief writer. Values are 0–1. */
export type BriefDossier = {
  title: string;
  author: string;
  pages: number;
  readingHours: number;
  coverage: number;
  emotions: [string, number][];
  moods: [string, number][];
  narration: [string, number][];
  themes: [string, number][];
  texture: { low: string; high: string; value: number }[];
  arc: { shape: string; hint: string } | null;
  profile: { genre: [string, number][]; era: string; scales: { low: string; high: string; value: number }[] } | null;
  moments: { label: string; position: number; quote: string }[];
  neighbours: { title: string; author: string; similarity: number }[];
};

/** A reader's brief written by an LLM from the dossier. */
export type BookBrief = {
  logline: string;
  what: string;
  why: string[];
  who: string[];
  skip: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; cost: number };
  createdAt: number;
};

/** A canon book in the server store (data/xbook.db), as listed by GET /api/corpus. */
export type CorpusEntry = {
  id: string;
  title: string;
  author: string;
  rank: number | null;
  gutenberg: string | null;
  pages: number;
  chars: number;
  analysed: number;
  complete: boolean;
  briefed: boolean;
};

/** GET /api/corpus/:id: the stored text, its exact page boundaries and every stored answer in page order. */
export type CorpusBook = Omit<CorpusEntry, "analysed" | "complete" | "briefed"> & {
  text: string;
  segments: [start: number, end: number][];
  analyses: (SegmentAnalysis | null)[];
  profile: BookProfile | null;
  brief: BookBrief | null;
};

/** A single stored page; `page` is 1-based, as in `/book/:id?page=`. */
export type PageRef = { id: string; title: string; author: string; page: number; value: number };

/** GET /api/corpus-stats: what reading the canon cost and what every stored page says, aggregated. */
export type CorpusStats = {
  books: number;
  complete: number;
  pages: number;
  analysed: number;
  profiled: number;
  /** Pages that are story, not title pages, contents or licences. */
  narrative: number;
  chars: number;
  jev: { model: string | null; requests: number; tokens: number };
  briefs: { model: string | null; count: number; tokens: number; usd: number };
  /** Sum of `npm run corpus` run durations. */
  seconds: number;
  /** Narrative pages whose strongest emotion is each one. */
  leading: Distribution<EmotionId>;
  /** Share of narrative pages with more fear than joy. */
  fearOverJoy: number;
  /** Narrative pages scoring at least 0.99 on the emotion. */
  saturated: Distribution<EmotionId>;
  /** Mean light and tension of every page in each tenth of its book. */
  lightByTenth: number[];
  tensionByTenth: number[];
  /** Books by the tenth their climax (most tension and pace) falls in. */
  climaxByTenth: number[];
  /** The single most extreme page of the canon on each scale. */
  records: { tension: PageRef; light: PageRef; dark: PageRef; humor: PageRef; sadness: PageRef; ideas: PageRef };
};

export type CatalogHit = {
  id: string;
  title: string;
  author: string;
  source: "gutenberg";
};
