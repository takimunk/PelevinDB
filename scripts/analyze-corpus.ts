// Full Jev analysis of the ranked canon into the SQLite store (data/xbook.db), then briefs and public/atlas.json.
// Usage: npm run corpus -- [--top=100] [--dry] [--max-usd=10] [--no-brief]
//   --dry       downloads and pages the texts (free) and prints the exact page count and cost estimate.
//   --max-usd   stops cleanly once this run's Jev spend reaches the cap; rerun to continue.
// Every answer is written as soon as it arrives, so an interrupted run resumes without paying twice.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RUBRIC_VERSION } from "../shared/catalog.ts";
import type { SegmentAnalysis } from "../shared/types.ts";
import { DEFAULT_BRIEF_MODEL, writeBrief } from "../server/brief.ts";
import { fetchCatalogText } from "../server/gutenberg.ts";
import { analyzeProfile, analyzeSegment } from "../server/jev.ts";
import { openStore, type Store } from "../server/store.ts";
import type { AtlasBook } from "../src/domain/atlas.ts";
import { buildDossier } from "../src/domain/dossier.ts";
import { DEFAULT_WEIGHTS, fingerprintFrom, type Fingerprint } from "../src/domain/fingerprint.ts";
import { embed, neighbours } from "../src/domain/pca.ts";
import { normalize, PAGE_CHARS, segmentText, type Segment } from "../src/domain/text.ts";
import { args as readArgs, ATLAS_CACHE, cleanAuthor, cleanTitle, pool, profileExcerpts, readGreatest, usd, type Entry } from "./lib.ts";

const CONCURRENCY = 8;
const RETRIES = 3;
const TOKENS_PER_PAGE = 5_165;
const ATLAS = join("public", "atlas.json");

const args = readArgs();
const top = Number(args.top ?? 100);
const dry = args.dry === "true";
const maxUsd = Number(args["max-usd"] ?? Infinity);
const jevKey = process.env.TYPESAFE_API_KEY;
const briefKey = process.env.OPENROUTER_API_KEY;
if (!dry && !jevKey) {
  console.error("TYPESAFE_API_KEY is not set. Add it to .env.");
  process.exit(1);
}

const signal = new AbortController().signal;
const store = openStore();
const run = dry ? 0 : store.startRun(process.argv.slice(2).join(" ") || "corpus");
let spent = 0;
let briefUsd = 0;
let capped = false;

const bookId = (e: Entry) => `pg-${e.gutenberg}`;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function ensureBook(e: Entry) {
  const id = bookId(e);
  if (store.book(id)) return id;
  const raw = (await readJson<{ text: string }>(join(ATLAS_CACHE, `${id}.text.json`))) ?? (await fetchCatalogText(String(e.gutenberg), signal));
  const text = normalize(raw.text);
  const segments = segmentText(text, "pages");
  store.addBook(
    { id, source: "gutenberg", sourceRef: String(e.gutenberg), title: cleanTitle(e.title), author: cleanAuthor(e.author), rank: e.rank, chars: text.length, pageChars: PAGE_CHARS, pages: segments.length },
    text,
    segments,
  );
  return id;
}

function segmentsOf(store: Store, id: string): Segment[] {
  const text = store.text(id)!;
  return store.segments(id).map((s) => ({ id: s.idx, start: s.start, end: s.end, text: text.slice(s.start, s.end) }));
}

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

/** The sampled atlas run already paid for some pages of the same text; reuse them when the rubric matches. */
async function fromAtlasCache(id: string, idx: number) {
  const hit = await readJson<SegmentAnalysis>(join(ATLAS_CACHE, `${id}.p${idx}.json`));
  return hit?.rubric === RUBRIC_VERSION ? hit : null;
}

async function analyseBook(id: string) {
  const segments = segmentsOf(store, id);
  const done = store.analyses(id, RUBRIC_VERSION);
  const missing = segments.map((s) => s.id).filter((i) => !done.has(i));
  let failed = 0;
  await pool(missing, CONCURRENCY, async (i) => {
    if (capped) return;
    try {
      const cached = await fromAtlasCache(id, i);
      const answer = cached ?? (await withRetry(() => analyzeSegment(segments[i].text, jevKey!, signal)));
      store.putAnalysis(id, i, answer);
      if (!cached) spent += answer.usage?.input_tokens ?? 0;
      if (usd(spent) >= maxUsd) capped = true;
    } catch {
      failed++;
    }
  });
  const analyses = store.analyses(id, RUBRIC_VERSION);
  if (analyses.size < segments.length || store.profile(id, RUBRIC_VERSION)) return { failed };
  const list = segments.map((s) => analyses.get(s.id) ?? null);
  const excerpts = profileExcerpts(segments.map((s) => s.id), list).map((i) => segments[i].text);
  const profile = await withRetry(() => analyzeProfile(excerpts, jevKey!, signal));
  store.putProfile(id, profile);
  spent += profile.usage?.input_tokens ?? 0;
  return { failed };
}

function fingerprints(ids: string[]) {
  const out: { id: string; fingerprint: Fingerprint }[] = [];
  for (const id of ids) {
    const segments = segmentsOf(store, id);
    const analyses = store.analyses(id, RUBRIC_VERSION);
    const fingerprint = fingerprintFrom(segments, segments.map((s) => analyses.get(s.id) ?? null), store.profile(id, RUBRIC_VERSION) ?? undefined);
    if (fingerprint) out.push({ id, fingerprint });
  }
  return out;
}

async function writeBriefs(complete: string[], prints: { id: string; fingerprint: Fingerprint }[]) {
  if (!briefKey || args["no-brief"] === "true") return;
  const rows = embed(prints, DEFAULT_WEIGHTS).rows;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_BRIEF_MODEL;
  await pool(complete.filter((id) => !store.brief(id)), 3, async (id) => {
    const book = store.book(id)!;
    const segments = segmentsOf(store, id);
    const analyses = store.analyses(id, RUBRIC_VERSION);
    const near = neighbours(rows, id, 5).map((n) => ({ title: store.book(n.id)!.title, author: store.book(n.id)!.author, similarity: n.similarity }));
    const dossier = buildDossier(book, segments, segments.map((s) => analyses.get(s.id) ?? null), store.profile(id, RUBRIC_VERSION) ?? undefined, near);
    try {
      const brief = await withRetry(() => writeBrief(dossier, briefKey, model, signal));
      store.putBrief(id, brief);
      briefUsd += brief.usage.cost;
      console.log(`brief ${book.title.slice(0, 50)} · $${brief.usage.cost.toFixed(4)}`);
    } catch (error) {
      console.warn(`brief skip ${book.title}: ${error instanceof Error ? error.message : error}`);
    }
  });
}

/** Fully read books replace their sampled atlas entries; sampled ones not yet in the store stay. */
async function exportAtlas(prints: { id: string; fingerprint: Fingerprint }[]) {
  const previous = (await readJson<{ books: AtlasBook[] }>(ATLAS))?.books ?? [];
  const full: AtlasBook[] = prints.map(({ id, fingerprint }) => {
    const b = store.book(id)!;
    return { id, title: b.title, author: b.author, gutenberg: Number(b.sourceRef), chars: b.chars, pagesRead: b.pages, fingerprint };
  });
  const ids = new Set(full.map((b) => b.id));
  const books = [...full, ...previous.filter((b) => !ids.has(b.id))];
  await writeFile(ATLAS, JSON.stringify({ generatedAt: new Date().toISOString(), books }, null, 1));
  return books.length;
}

const entries = (await readGreatest()).slice(0, top);
let pages = 0,
  missingPages = 0;
for (const e of entries) {
  try {
    const id = await ensureBook(e);
    const book = store.book(id)!;
    const missing = book.pages - store.analyses(id, RUBRIC_VERSION).size;
    pages += book.pages;
    missingPages += missing;
    if (dry) continue;
    if (capped) break;
    const { failed } = await analyseBook(id);
    console.log(`${String(e.rank).padStart(3)} ${failed ? "part" : "ok  "} ${book.title.slice(0, 50).padEnd(50)} ${book.pages} p · run ${(spent / 1e6).toFixed(1)}M tok · $${usd(spent).toFixed(2)}`);
  } catch (error) {
    console.warn(`${String(e.rank).padStart(3)} skip ${e.title.slice(0, 50)}: ${error instanceof Error ? error.message : error}`);
  }
}

if (dry) {
  const tokens = missingPages * TOKENS_PER_PAGE + entries.length * 4_400;
  console.log(`\ntop ${entries.length}: ${pages.toLocaleString()} pages, ${missingPages.toLocaleString()} still to read.`);
  console.log(`estimate: ${(tokens / 1e6).toFixed(0)}M Jev tokens ≈ $${usd(tokens).toFixed(2)} + briefs ≈ $${(entries.length * 0.002).toFixed(2)}`);
} else {
  const progress = store.progress(RUBRIC_VERSION);
  const complete = progress.filter((b) => b.profiled && b.analysed === b.pages).map((b) => b.id);
  const prints = fingerprints(complete);
  await writeBriefs(complete, prints);
  const total = await exportAtlas(prints);
  store.finishRun(run, spent, briefUsd);
  const all = store.spend();
  console.log(`\n${complete.length} books fully read · atlas: ${total} books${capped ? ` · stopped at the $${maxUsd} cap, rerun to continue` : ""}`);
  console.log(`this run: ${(spent / 1e6).toFixed(1)}M Jev tokens ≈ $${usd(spent).toFixed(2)} + briefs $${briefUsd.toFixed(2)}`);
  console.log(`store total: ${(all.jevTokens / 1e6).toFixed(1)}M Jev tokens ≈ $${usd(all.jevTokens).toFixed(2)} + briefs $${all.briefUsd.toFixed(2)}`);
}
store.close();
