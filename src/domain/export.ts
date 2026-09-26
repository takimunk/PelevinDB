import { EMOTIONS, MODES, MOODS, RUBRIC_VERSION, TEXTURES, THEMES } from "../../shared/catalog.ts";
import type { BookBrief, BookProfile } from "../../shared/types.ts";
import { argmax, type Analyses } from "./analysis.ts";
import type { Fingerprint } from "./fingerprint.ts";
import { PAGE_CHARS, type Segment } from "./text.ts";

type ExportBook = { title: string; author: string; format: string; source: string };

export function buildExport(
  book: ExportBook,
  segments: Segment[],
  analyses: Analyses,
  profile?: BookProfile,
  fingerprint?: Fingerprint,
  brief?: BookBrief,
) {
  const done = analyses.filter(Boolean).length;
  return {
    schema: "xbook.book.v2",
    book,
    rubricVersion: RUBRIC_VERSION,
    segmentation: {
      mode: "pages",
      maxCharacters: PAGE_CHARS,
      offsets: "UTF-16, normalized NFC text, end exclusive",
      normalization: "NFC, LF, collapsed horizontal whitespace, at most two newlines, trim",
    },
    status: done === segments.length ? "complete" : done ? "partial" : "not-analyzed",
    meaning: {
      scores: "Score answers normalized to 0–1 (level / max level); independent, not shares",
      choices: "mood and mode keep Jev's full probability distribution",
      themes: "Noul probability that the theme is a significant subject of the page",
    },
    profile: profile ?? null,
    fingerprint: fingerprint ?? null,
    brief: brief ?? null,
    segments: segments.map((s, i) => ({ ...s, analysis: analyses[i] ?? null })),
  };
}

const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';

export function buildCsv(segments: Segment[], analyses: Analyses) {
  const header = [
    "id",
    "start",
    "end",
    "text",
    "model",
    "input_tokens",
    ...EMOTIONS.map((e) => `emotion_${e.id}`),
    ...TEXTURES.map((t) => `texture_${t.id}`),
    "mood",
    ...MOODS.map((m) => `mood_${m.id}`),
    "mode",
    ...MODES.map((m) => `mode_${m.id}`),
    ...THEMES.map((t) => `theme_${t.id}`),
  ];
  const rows = segments.map((s, i) => {
    const a = analyses[i];
    return [
      s.id,
      s.start,
      s.end,
      // Neutralize spreadsheet formula injection.
      /^[=+@\-\t\r]/.test(s.text) ? "'" + s.text : s.text,
      a?.model,
      a?.usage?.input_tokens,
      ...EMOTIONS.map((e) => a?.emotions[e.id]),
      ...TEXTURES.map((t) => a?.texture[t.id]),
      a && argmax(a.mood),
      ...MOODS.map((m) => a?.mood[m.id]),
      a && argmax(a.mode),
      ...MODES.map((m) => a?.mode[m.id]),
      ...THEMES.map((t) => a?.themes[t.id]),
    ];
  });
  return "\uFEFF" + [header, ...rows].map((r) => r.map(quote).join(",")).join("\r\n");
}
