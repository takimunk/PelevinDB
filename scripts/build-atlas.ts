// Builds public/atlas.json: real Jev coordinates for the reference constellation on the map.
// Books come from data/greatest-500.json in rank order.
// Usage: npm run atlas -- [--count=100] [--pages=48]
// Needs TYPESAFE_API_KEY in .env. Answers are cached per page, so an interrupted run resumes for free.
// Cost: about 5,200 input tokens per page at $0.042/M, so 48 pages ≈ $0.011 per book.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BookProfile, SegmentAnalysis } from "../shared/types.ts";
import { fetchCatalogText } from "../server/gutenberg.ts";
import { analyzeProfile, analyzeSegment } from "../server/jev.ts";
import type { AtlasBook } from "../src/domain/atlas.ts";
import { fingerprintFrom } from "../src/domain/fingerprint.ts";
import { normalize, segmentText } from "../src/domain/text.ts";
import { ATLAS_CACHE as CACHE, args as readArgs, cleanAuthor, cleanTitle, pool, profileExcerpts, readGreatest, usd, type Entry } from "./lib.ts";

const CONCURRENCY = 6;
const OUT = join("public", "atlas.json");

const args = readArgs();
const pageBudget = Number(args.pages ?? 48);
const count = Number(args.count ?? 100);
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  console.error("TYPESAFE_API_KEY is not set. Add it to .env.");
  process.exit(1);
}

const signal = new AbortController().signal;
let tokens = 0;

async function cached<T>(name: string, compute: () => Promise<T>): Promise<T> {
  const file = join(CACHE, name);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    const value = await compute();
    tokens += (value as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0;
    await writeFile(file, JSON.stringify(value));
    return value;
  }
}

/** Evenly spaced page indices, skipping the first and last 2% where front and back matter live. */
function sample(total: number, n: number) {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const from = Math.floor(total * 0.02),
    to = Math.ceil(total * 0.98) - 1;
  return [...new Set(Array.from({ length: n }, (_, k) => Math.round(from + (k * (to - from)) / (n - 1))))];
}

async function measure(entry: Entry): Promise<AtlasBook> {
  const id = `pg-${entry.gutenberg}`;
  const raw = await cached(`${id}.text.json`, () => fetchCatalogText(String(entry.gutenberg), signal));
  const text = normalize(raw.text);
  const segments = segmentText(text, "pages");
  const picks = sample(segments.length, pageBudget);
  const analyses: (SegmentAnalysis | null)[] = new Array(segments.length).fill(null);
  await pool(picks, CONCURRENCY, async (i) => {
    analyses[i] = await cached(`${id}.p${i}.json`, () => analyzeSegment(segments[i].text, apiKey!, signal));
  });
  const excerpts = profileExcerpts(picks, analyses).map((i) => segments[i].text);
  const profile = await cached<BookProfile>(`${id}.profile.json`, () => analyzeProfile(excerpts, apiKey!, signal));
  const fingerprint = fingerprintFrom(segments, analyses, profile);
  if (!fingerprint) throw new Error("could not build a fingerprint");
  return { id, title: cleanTitle(entry.title), author: cleanAuthor(entry.author), gutenberg: entry.gutenberg, chars: text.length, pagesRead: picks.length, fingerprint };
}

await mkdir(CACHE, { recursive: true });
const list: Entry[] = await readGreatest();
const books: AtlasBook[] = [];
for (const entry of list.slice(0, count)) {
  try {
    books.push(await measure(entry));
    console.log(`${String(entry.rank).padStart(3)} ok   ${entry.title.slice(0, 60)} · ${(tokens / 1e6).toFixed(2)}M tokens so far`);
  } catch (error) {
    console.warn(`${String(entry.rank).padStart(3)} skip ${entry.title.slice(0, 60)}: ${error instanceof Error ? error.message : error}`);
  }
}

await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), pagesPerBook: pageBudget, books }, null, 1));
console.log(`\n${OUT}: ${books.length} books. New tokens this run: ${tokens.toLocaleString()} ≈ $${usd(tokens).toFixed(2)}.`);
