// Canon-wide aggregates over every stored page. Derived on read from the raw answers, cached until the store changes.
import { argmax, isParatext } from "../shared/analysis.ts";
import { EMOTIONS, FOCUS, RUBRIC_VERSION, type EmotionId, type FocusId } from "../shared/catalog.ts";
import { peakLine, sentenceOf } from "./sentences.ts";
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

// ───────── Top pages per emotion (the home page showcase) ─────────

/** `n`: the quoted sentence on the page (1-based, a book link's `s`), null when the page is not split into sentences. */
export type TopPage = { id: string; title: string; titleEn: string | null; year: number | null; page: number; n: number | null; score: number; quote: string };
export type TopPages = { emotion: EmotionId; items: TopPage[] }[];

export const TOP_PAGES_MAX = 10;
const QUOTE_MIN = 40;
const QUOTE_MAX = 160;
const EXCERPT_MAX = 140;

/**
 * One quotable sentence from a page: the first whole sentence of 40–160 characters (a fragment the page opens
 * mid-sentence with is skipped), else the page's opening cut at a word with an ellipsis. Never more than that.
 */
export function pageQuote(page: string): string {
  const clean = page.replace(/\s+/g, " ").trim();
  const sentences = [...clean.matchAll(/[^.!?…]+[.!?…]+["»”)]*/gu)].map((m) => ({ text: m[0].trim(), at: m.index! }));
  const opensMid = !/^[\p{Lu}«"“—–(0-9-]/u.test(clean);
  for (const [i, s] of sentences.entries()) {
    if (i === 0 && opensMid) continue;
    if (s.text.length >= QUOTE_MIN && s.text.length <= QUOTE_MAX) return s.text;
  }
  if (clean.length <= EXCERPT_MAX) return clean;
  const window = clean.slice(0, EXCERPT_MAX - 1);
  const word = window.lastIndexOf(" ");
  return `${(word > EXCERPT_MAX * 0.5 ? window.slice(0, word) : window).replace(/[\s,;:—–-]+$/u, "")}…`;
}

const topCache = new WeakMap<Store, Map<string, TopPages>>();

/** The version of the top-pages payload, part of its ETag. */
export const topPagesStamp = (store: Store, per: number) => `top3|${per}|${store.totals().stamp}`;

/**
 * For every Plutchik emotion, the `per` story pages of the whole corpus with the highest Jev score, highest first.
 * A page appears in one column only and each column takes at most one page per book, while other books have candidates.
 */
export function topPages(store: Store, per = 3): TopPages {
  const n = Math.max(1, Math.min(TOP_PAGES_MAX, Math.floor(per)));
  const key = topPagesStamp(store, n);
  const cached = topCache.get(store)?.get(key);
  if (cached) return cached;

  type Cand = { bookId: string; idx: number; score: number; confidence: number };
  const cands = new Map<EmotionId, Cand[]>(EMOTIONS.map((e) => [e.id, []]));
  for (const row of store.everyAnalysis(RUBRIC_VERSION)) {
    const a = row.answer;
    if (isParatext(a)) continue;
    for (const e of EMOTIONS) cands.get(e.id)!.push({ bookId: row.bookId, idx: row.idx, score: a.emotions[e.id], confidence: a.emotionConfidence?.[e.id] ?? 0 });
  }
  for (const list of cands.values()) list.sort((x, y) => y.score - x.score || y.confidence - x.confidence);

  // Round robin, so every column gets its best page before any gets its second.
  const used = new Set<string>();
  const picked = new Map<EmotionId, Cand[]>(EMOTIONS.map((e) => [e.id, []]));
  for (let round = 0; round < n; round++)
    for (const e of EMOTIONS) {
      const list = cands.get(e.id)!;
      const mine = picked.get(e.id)!;
      const books = new Set(mine.map((c) => c.bookId));
      let fallback = -1;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (used.has(`${c.bookId}#${c.idx}`)) continue;
        if (books.has(c.bookId)) {
          if (fallback < 0) fallback = i;
          continue;
        }
        fallback = i;
        break;
      }
      if (fallback < 0) continue;
      const c = list[fallback];
      mine.push(c);
      used.add(`${c.bookId}#${c.idx}`);
    }

  const meta = new Map(store.books().map((b) => [b.id, b]));
  const texts = new Map<string, { text: string; segments: Map<number, { start: number; end: number }> } | null>();
  const pageText = (bookId: string, idx: number) => {
    if (!texts.has(bookId)) {
      const text = store.text(bookId);
      texts.set(bookId, text == null ? null : { text, segments: new Map(store.segments(bookId).map((s) => [s.idx, s])) });
    }
    const t = texts.get(bookId);
    const s = t?.segments.get(idx);
    return t && s ? t.text.slice(s.start, s.end) : "";
  };

  const out: TopPages = EMOTIONS.map((e) => ({
    emotion: e.id,
    items: picked
      .get(e.id)!
      .sort((x, y) => y.score - x.score || y.confidence - x.confidence)
      .map((c) => {
        const b = meta.get(c.bookId);
        const peak = FOCUS.some((f) => f.id === e.id) ? peakLine(store, c.bookId, c.idx, e.id as FocusId) : null;
        const quote = peak?.text ?? pageQuote(pageText(c.bookId, c.idx));
        return {
          id: c.bookId,
          title: b?.title ?? "",
          titleEn: b?.titleEn ?? null,
          year: b?.year ?? null,
          page: c.idx + 1,
          n: peak?.n ?? sentenceOf(store, c.bookId, c.idx, quote),
          score: Math.round(c.score * 1000) / 1000,
          quote,
        };
      }),
  }));
  topCache.set(store, new Map([[key, out]]));
  return out;
}
