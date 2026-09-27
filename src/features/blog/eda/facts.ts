// Corpus counts quoted in the prose, computed from eda.json so the text never drifts from the charts.
// Interpretive numbers (decade means, correlations, peaks) are quoted from the data agent's findings on the same file.
import type { Eda, Kind } from "./data.ts";

export function facts(eda: Eda) {
  const { books } = eda;
  const count = (k: Kind) => books.filter((b) => b.kind === k).length;
  const words = books.reduce((a, b) => a + b.words, 0);
  const novels = books.filter((b) => b.kind === "novel");
  const years = books.map((b) => b.year);

  // The busiest year, and the longest unbroken run of years with a new novel.
  const perYear = new Map<number, number>();
  books.forEach((b) => perYear.set(b.year, (perYear.get(b.year) ?? 0) + 1));
  const [peakYear, peakCount] = [...perYear].sort((a, z) => z[1] - a[1] || a[0] - z[0])[0] ?? [0, 0];
  const novelYears = [...new Set(novels.map((b) => b.year))].sort((a, z) => a - z);
  let run = { from: novelYears[0] ?? 0, to: novelYears[0] ?? 0 },
    cur = { ...run };
  novelYears.forEach((y, i) => {
    cur = i && y === novelYears[i - 1] + 1 ? { from: cur.from, to: y } : { from: y, to: y };
    if (cur.to - cur.from > run.to - run.from) run = { ...cur };
  });

  return {
    n: books.length,
    novels: novels.length,
    novellas: count("novella"),
    stories: count("story"),
    essays: count("essay"),
    interviews: count("interview"),
    words,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    peakYear,
    peakCount,
    peakStories: books.filter((b) => b.year === peakYear && b.kind === "story").length,
    novelRun: run,
    fields: eda.fields.length,
    topics: eda.topics.length,
    vocab: eda.method.vocabSize,
    stopwords: eda.method.stopwords,
    byId: (id: string) => books.find((b) => b.id === id),
  };
}

export type Facts = ReturnType<typeof facts>;
