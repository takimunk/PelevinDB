// Canon-wide aggregates over every stored page. Derived on read from the raw answers, cached until the store changes.
import { argmax, isParatext } from "../shared/analysis.ts";
import { EMOTIONS, RUBRIC_VERSION, type EmotionId } from "../shared/catalog.ts";
import type { CorpusStats, PageRef, SegmentAnalysis } from "../shared/types.ts";
import type { Store } from "./store.ts";

const TENTHS = 10;
const SATURATED = 0.99;

type RecordKey = keyof CorpusStats["records"];
/** [score, Jev's confidence]; hundreds of pages reach a full score, so confidence breaks the tie. */
const RECORDS: Record<RecordKey, (a: SegmentAnalysis) => [number, number]> = {
  tension: (a) => [a.texture.tension, a.textureConfidence.tension],
  light: (a) => [a.texture.valence, a.textureConfidence.valence],
  dark: (a) => [1 - a.texture.valence, a.textureConfidence.valence],
  humor: (a) => [a.texture.humor, a.textureConfidence.humor],
  sadness: (a) => [a.emotions.sadness, a.emotionConfidence.sadness],
  ideas: (a) => [a.texture.ideas, a.textureConfidence.ideas],
};

const climax = (a: SegmentAnalysis) => a.texture.tension * 0.7 + a.texture.pace * 0.3;
const zeros = () => Object.fromEntries(EMOTIONS.map((e) => [e.id, 0])) as Record<EmotionId, number>;

const cache = new WeakMap<Store, { stamp: string; stats: CorpusStats }>();

export function corpusStats(store: Store): CorpusStats {
  const totals = store.totals();
  const cached = cache.get(store);
  if (cached?.stamp === totals.stamp) return cached.stats;

  const books = new Map(store.progress(RUBRIC_VERSION).map((b) => [b.id, b]));
  const leading = zeros();
  const saturated = zeros();
  const light = Array.from({ length: TENTHS }, () => ({ sum: 0, n: 0 }));
  const tension = Array.from({ length: TENTHS }, () => ({ sum: 0, n: 0 }));
  const climaxByTenth = Array<number>(TENTHS).fill(0);
  const best = {} as Record<RecordKey, { bookId: string; idx: number; value: number; confidence: number }>;
  let narrative = 0,
    fearOverJoy = 0;

  let bookId: string | null = null;
  let pages: { idx: number; a: SegmentAnalysis }[] = [];
  const closeBook = () => {
    const n = pages.length;
    if (!bookId || !n) return;
    let peak = 0;
    pages.forEach(({ a }, i) => {
      const tenth = Math.min(TENTHS - 1, Math.floor((i / n) * TENTHS));
      light[tenth].sum += a.texture.valence;
      light[tenth].n++;
      tension[tenth].sum += a.texture.tension;
      tension[tenth].n++;
      if (climax(a) > climax(pages[peak].a)) peak = i;
    });
    climaxByTenth[Math.min(TENTHS - 1, Math.floor((peak / Math.max(1, n - 1)) * TENTHS))]++;
  };

  for (const row of store.everyAnalysis(RUBRIC_VERSION)) {
    if (row.bookId !== bookId) {
      closeBook();
      bookId = row.bookId;
      pages = [];
    }
    const a = row.answer;
    if (isParatext(a)) continue;
    pages.push({ idx: row.idx, a });
    narrative++;
    leading[argmax(a.emotions)]++;
    if (a.emotions.fear > a.emotions.joy) fearOverJoy++;
    for (const e of EMOTIONS) if (a.emotions[e.id] >= SATURATED) saturated[e.id]++;
    for (const key of Object.keys(RECORDS) as RecordKey[]) {
      const [value, confidence] = RECORDS[key](a);
      const top = best[key];
      if (!top || value > top.value || (value === top.value && confidence > top.confidence)) best[key] = { bookId: row.bookId, idx: row.idx, value, confidence };
    }
  }
  closeBook();

  const ref = (key: RecordKey): PageRef => {
    const hit = best[key];
    const book = hit && books.get(hit.bookId);
    return { id: hit?.bookId ?? "", title: book?.title ?? "", author: book?.author ?? "", page: (hit?.idx ?? 0) + 1, value: hit?.value ?? 0 };
  };
  const spend = store.spend();
  const all = [...books.values()];
  const stats: CorpusStats = {
    books: all.length,
    complete: all.filter((b) => b.analysed === b.pages).length,
    pages: all.reduce((s, b) => s + b.pages, 0),
    analysed: all.reduce((s, b) => s + b.analysed, 0),
    profiled: all.filter((b) => b.profiled).length,
    narrative,
    chars: all.reduce((s, b) => s + b.chars, 0),
    jev: { model: totals.jevModel, requests: totals.jevRequests, tokens: spend.jevTokens },
    briefs: { model: totals.briefModel, count: totals.briefs, tokens: spend.briefTokens, usd: spend.briefUsd },
    seconds: totals.seconds,
    leading,
    fearOverJoy: narrative ? fearOverJoy / narrative : 0,
    saturated,
    lightByTenth: light.map((t) => (t.n ? t.sum / t.n : 0)),
    tensionByTenth: tension.map((t) => (t.n ? t.sum / t.n : 0)),
    climaxByTenth,
    records: Object.fromEntries((Object.keys(RECORDS) as RecordKey[]).map((k) => [k, ref(k)])) as CorpusStats["records"],
  };
  cache.set(store, { stamp: totals.stamp, stats });
  return stats;
}
