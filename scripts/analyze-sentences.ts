// Sentence-level Jev analysis of the books already read page by page (see docs in README, "Sentence level").
// Usage: npm run sentences -- [--only=pv-nika,pv-t] [--pilot] [--dry] [--max-usd=2]
//                             [--no-focus] [--pages=K] [--sample=N] [--candidates=N]
//   Every selected book is split into sentences first (free, stored once in `sentences`).
//   focus         one request per story page: which sentence carries each dimension most (on by default).
//   --pages=K     the sentence request for every sentence of K evenly spaced story pages per book (the pilot's check).
//   --sample=N    the sentence request for N sentences drawn evenly (by a fixed hash) from every selected story page.
//   --candidates=N  the sentence request for the N sentences with the most focus weight in each dimension.
//   --pilot       three short works, focus plus --pages=10, then prints how well the two requests agree.
//   --dry         reads nothing and pays nothing: prints request counts and the cost estimate.
// Answers are written as they arrive, so a rerun only pays for what is missing. The $10 provider cap still applies.
import { createHash } from "node:crypto";
import { isParatext } from "../shared/analysis.ts";
import { FOCUS, FOCUS_RUBRIC, RUBRIC_VERSION, SENTENCE_RUBRIC } from "../shared/catalog.ts";
import { numberedPassage, splitSentences } from "../shared/sentences.ts";
import { analyzeFocus, analyzeSentence } from "../server/jev.ts";
import { openStore } from "../server/store.ts";
import { focusWeights } from "../shared/focus.ts";
import { args as readArgs, pool, usd } from "./lib.ts";

const CONCURRENCY = 8;
const RETRIES = 3;
/** Measured in the pilot: every numbered option costs about 17.5 tokens in each focus question. */
const FOCUS_TOKENS = { base: 2_420, perOption: 17.5 };
const SENTENCE_TOKENS = { base: 1_950, perChar: 0.63 };
const PILOT = ["pv-nika", "pv-zheltaya-strela", "pv-kormlenie-krokodila-hufu"];

const args = readArgs();
const pilot = args.pilot === "true";
const only = pilot ? new Set(PILOT) : args.only ? new Set(args.only.split(",")) : null;
const dry = args.dry === "true";
const maxUsd = Number(args["max-usd"] ?? Infinity);
const doFocus = args["no-focus"] !== "true";
const pagesPerBook = Number(args.pages ?? (pilot ? 10 : 0));
const sample = Number(args.sample ?? 0);
const candidates = Number(args.candidates ?? 0);
const key = process.env.TYPESAFE_API_KEY;
if (!dry && !key) {
  console.error("TYPESAFE_API_KEY is not set. Add it to .env.");
  process.exit(1);
}

const signal = new AbortController().signal;
const store = openStore();
const run = dry ? 0 : store.startRun(process.argv.slice(2).join(" ") || "sentences");
let spent = 0;
let capped = false;
let failed = 0;

async function withRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= RETRIES) throw error;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const charge = (tokens = 0) => {
  spent += tokens;
  if (usd(spent) >= maxUsd) capped = true;
};

/** A stable pseudo-random number in [0, 1) for a key, so samples do not change between runs. */
const hash01 = (s: string) => createHash("sha1").update(s).digest().readUInt32BE(0) / 2 ** 32;

type Unit = { page: number; idx: number; start: number; end: number };
type Book = { id: string; text: string; story: number[]; byPage: Map<number, { start: number; end: number }[]>; flat: Unit[] };

function load(id: string): Book {
  const text = store.text(id)!;
  const segments = store.segments(id);
  if (!store.isSplit(id) && !dry) {
    store.putSentences(
      id,
      segments.flatMap((s) => splitSentences(text.slice(s.start, s.end)).map((x) => ({ page: s.idx, start: s.start + x.start, end: s.start + x.end }))),
    );
  }
  const byPage = store.isSplit(id)
    ? store.sentences(id)
    : new Map(segments.map((s) => [s.idx, splitSentences(text.slice(s.start, s.end)).map((x) => ({ start: s.start + x.start, end: s.start + x.end }))]));
  const pages = store.analyses(id, RUBRIC_VERSION);
  const story = segments.map((s) => s.idx).filter((i) => pages.has(i) && !isParatext(pages.get(i)));
  const flat = [...byPage.entries()].sort((a, b) => a[0] - b[0]).flatMap(([page, list]) => list.map((s, idx) => ({ page, idx, ...s })));
  return { id, text, story, byPage, flat };
}

const books = store
  .books()
  .filter((b) => b.source === "pelevin" && (!only || only.has(b.id)))
  .map((b) => load(b.id));
if (!books.length) {
  console.error("No stored books match.");
  process.exit(1);
}

// ── Focus: one request per story page ────────────────────────────────────────────────────────────────────────
const focusJobs = doFocus
  ? books.flatMap((b) => {
      const done = store.focus(b.id, FOCUS_RUBRIC);
      return b.story.filter((p) => !done.has(p) && (b.byPage.get(p)?.length ?? 0) > 0).map((page) => ({ book: b, page }));
    })
  : [];

const pageText = (b: Book, page: number) => {
  const list = b.byPage.get(page)!;
  return b.text.slice(list[0].start, list.at(-1)!.end);
};

async function runFocus() {
  let n = 0;
  await pool(focusJobs, CONCURRENCY, async ({ book, page }) => {
    if (capped) return;
    const list = book.byPage.get(page)!;
    const base = list[0].start;
    const local = list.map((s) => ({ start: s.start - base, end: s.end - base }));
    try {
      const answer = await withRetry(() => analyzeFocus(numberedPassage(pageText(book, page), local), list.length, key!, signal));
      store.putFocus(book.id, page, answer);
      charge(answer.usage?.input_tokens);
    } catch (error) {
      failed++;
      console.warn(`focus skip ${book.id} p${page + 1}: ${error instanceof Error ? error.message : error}`);
    }
    if (++n % 200 === 0) console.log(`focus ${n}/${focusJobs.length} · $${usd(spent).toFixed(2)}`);
  });
}

// ── Sentences: one request per sentence ──────────────────────────────────────────────────────────────────────
function sentenceTargets(): { book: Book; unit: Unit; at: number }[] {
  const want = new Map<string, { book: Book; unit: Unit; at: number }>();
  const add = (book: Book, at: number) => {
    const u = book.flat[at];
    want.set(`${book.id}:${u.page}:${u.idx}`, { book, unit: u, at });
  };
  const storyUnits = books.reduce((s, b) => {
    const story = new Set(b.story);
    return s + b.flat.filter((u) => story.has(u.page)).length;
  }, 0);
  const rate = Math.min(1, sample / Math.max(1, storyUnits));
  for (const book of books) {
    const story = new Set(book.story);
    if (pagesPerBook > 0) {
      const k = Math.min(pagesPerBook, book.story.length);
      for (let j = 0; j < k; j++) {
        const page = book.story[Math.round(((j + 0.5) * book.story.length) / k - 0.5)];
        book.flat.forEach((u, at) => u.page === page && add(book, at));
      }
    }
    if (sample > 0) {
      book.flat.forEach((u, at) => story.has(u.page) && hash01(`${book.id}:${u.page}:${u.idx}`) < rate && add(book, at));
    }
  }
  if (candidates > 0) {
    for (const f of FOCUS) {
      const ranked: { book: Book; at: number; w: number }[] = [];
      for (const book of books) {
        const focus = store.focus(book.id, FOCUS_RUBRIC);
        const pages = store.analyses(book.id, RUBRIC_VERSION);
        const index = new Map(book.flat.map((u, at) => [`${u.page}:${u.idx}`, at]));
        for (const [page, answer] of focus) {
          const w = focusWeights(answer, pages.get(page) ?? null, f.id);
          w.forEach((v, idx) => ranked.push({ book, at: index.get(`${page}:${idx}`)!, w: v }));
        }
      }
      ranked.sort((a, b) => b.w - a.w);
      for (const r of ranked.slice(0, candidates)) if (r.at != null) add(r.book, r.at);
    }
  }
  const done = new Map(books.map((b) => [b.id, store.sentenceAnalyses(b.id, SENTENCE_RUBRIC)]));
  return [...want.values()].filter(({ book, unit }) => !done.get(book.id)!.has(`${unit.page}:${unit.idx}`));
}

const slice = (b: Book, u: Unit | undefined) => (u ? b.text.slice(u.start, u.end) : "");

async function runSentences(targets: ReturnType<typeof sentenceTargets>) {
  let n = 0;
  await pool(targets, CONCURRENCY, async ({ book, unit, at }) => {
    if (capped) return;
    const context = {
      before: [slice(book, book.flat[at - 2]), slice(book, book.flat[at - 1])].filter(Boolean).join(" "),
      sentence: slice(book, unit),
      after: slice(book, book.flat[at + 1]),
    };
    try {
      const answer = await withRetry(() => analyzeSentence(context, key!, signal));
      store.putSentenceAnalysis(book.id, unit.page, unit.idx, answer);
      charge(answer.usage?.input_tokens);
    } catch (error) {
      failed++;
      console.warn(`sentence skip ${book.id} p${unit.page + 1}#${unit.idx + 1}: ${error instanceof Error ? error.message : error}`);
    }
    if (++n % 500 === 0) console.log(`sentences ${n}/${targets.length} · $${usd(spent).toFixed(2)}`);
  });
}

const focusEstimate = focusJobs.reduce((s, { book, page }) => {
  const list = book.byPage.get(page)!;
  return s + FOCUS_TOKENS.base + FOCUS.length * FOCUS_TOKENS.perOption * list.length;
}, 0);
const units = books.reduce((s, b) => s + b.flat.length, 0);
console.log(`${books.length} books · ${units.toLocaleString("en")} sentences · ${focusJobs.length.toLocaleString("en")} focus pages to request`);

if (dry) {
  // Candidates are ranked from stored focus answers, so pages still waiting for focus contribute none.
  const targets = sentenceTargets();
  const sentenceEstimate = targets.reduce((s, t) => s + SENTENCE_TOKENS.base + SENTENCE_TOKENS.perChar * (t.unit.end - t.unit.start) * 3, 0);
  console.log(`focus ≈ ${(focusEstimate / 1e6).toFixed(1)}M tokens ≈ $${usd(focusEstimate).toFixed(2)}`);
  console.log(`sentences: ${targets.length.toLocaleString("en")} to request ≈ ${(sentenceEstimate / 1e6).toFixed(1)}M tokens ≈ $${usd(sentenceEstimate).toFixed(2)}`);
  if (candidates > 0 && focusJobs.length) console.log("candidates cover only pages with focus answers: run focus first for the full set.");
  store.close();
  process.exit(0);
}

await runFocus();
const targets = pagesPerBook || sample || candidates ? sentenceTargets() : [];
if (targets.length) console.log(`sentences: ${targets.length.toLocaleString("en")} to request`);
if (!capped) await runSentences(targets);
store.finishRun(run, spent, 0);
console.log(`done · ${(spent / 1e6).toFixed(2)}M tokens · $${usd(spent).toFixed(3)}${failed ? ` · ${failed} failed (rerun to retry)` : ""}${capped ? " · stopped at --max-usd" : ""}`);

if (pilot) {
  const { agreement } = await import("./sentence-agreement.ts");
  agreement(store, PILOT);
}
store.close();
