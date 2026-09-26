import { EMOTIONS, ERAS, GENRES, MODES, MOODS, PROFILE_SCALES, TEXTURES, THEMES } from "../../shared/catalog.ts";
import type { BookProfile, BriefDossier, Distribution } from "../../shared/types.ts";
import { ARC_SHAPES, argmax, bookStats, moments, series, storyArc, topEntries, type Analyses } from "./analysis.ts";
import { firstSentence, READING_CHARS_PER_MINUTE, type Segment } from "./text.ts";

const round = (v: number) => Math.round(v * 100) / 100;

function ranked<K extends string>(items: readonly { id: K; label: string }[], dist: Distribution<K>, n: number): [string, number][] {
  return topEntries(dist, n).map(([id, v]) => [items.find((i) => i.id === id)!.label.toLowerCase(), round(v)]);
}

/** Condenses the dashboard into the evidence the brief writer sees. Only short quotes leave the device. */
export function buildDossier(
  book: { title: string; author: string; chars: number },
  segments: Segment[],
  analyses: Analyses,
  profile: BookProfile | undefined,
  neighbours: { title: string; author: string; similarity: number }[],
): BriefDossier {
  const stats = bookStats(segments, analyses);
  const arc = storyArc(series(analyses, (a) => a.texture.valence));
  const shape = ARC_SHAPES.find((s) => s.id === arc.shape);
  const { paratext: _, ...narration } = stats.mode;
  return {
    title: book.title,
    author: book.author,
    pages: segments.length,
    readingHours: round(book.chars / READING_CHARS_PER_MINUTE / 60),
    coverage: round(stats.coverage),
    emotions: ranked(EMOTIONS, stats.emotions, 8),
    moods: ranked(MOODS, stats.mood, 5),
    narration: ranked(
      MODES.filter((m) => m.id !== "paratext"),
      narration as Distribution<Exclude<(typeof MODES)[number]["id"], "paratext">>,
      4,
    ),
    themes: ranked(THEMES, stats.themes, 8),
    texture: TEXTURES.map((t) => ({ low: t.low.toLowerCase(), high: t.high.toLowerCase(), value: round(stats.texture[t.id]) })),
    arc: shape ? { shape: shape.label, hint: shape.hint.toLowerCase() } : null,
    profile: profile
      ? {
          genre: ranked(GENRES, profile.genre, 3),
          era: ERAS.find((e) => e.id === argmax(profile.era))!.label,
          scales: PROFILE_SCALES.map((s) => ({ low: s.low.toLowerCase(), high: s.high.toLowerCase(), value: round(profile.scales[s.id]) })),
        }
      : null,
    moments: moments(analyses).map((m) => ({
      label: m.label.toLowerCase(),
      position: round(m.index / Math.max(1, segments.length - 1)),
      quote: firstSentence(segments[m.index].text, 220),
    })),
    neighbours: neighbours.slice(0, 5).map((n) => ({ ...n, similarity: round(n.similarity) })),
  };
}
