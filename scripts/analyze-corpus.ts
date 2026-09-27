// Full Jev analysis of the books already in the SQLite store (data/xbook.db), then briefs and public/atlas.json.
// Books get there only through `npm run pelevin:ingest` (local EPUBs); this script never downloads anything.
// Usage: npm run corpus -- [--source=pelevin] [--kind=novel,novella] [--only=pv-omon-ra,pv-t] [--top=N] [--dry] [--max-usd=10]
//                          [--brief-langs=en,ru] [--no-brief] [--briefs-only]
//   --source    which stored books to read (default: pelevin); --kind / --only / --top narrow the selection,
//               --top keeping the first N in rank (chronological) order.
//   --dry       reads nothing and pays nothing: prints the exact page count and the cost estimate.
//   --max-usd   stops cleanly once this run's spend (Jev + briefs) reaches the cap; rerun to continue.
//   --brief-langs  languages to write missing briefs in (default en,ru); existing briefs are never rewritten.
//   --briefs-only  skips Jev entirely (no key needed) and only writes the missing briefs of fully read books.
// Every answer is written as soon as it arrives, so an interrupted run resumes without paying twice.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RUBRIC_VERSION } from "../shared/catalog.ts";
import { DEFAULT_BRIEF_MODEL, writeBrief } from "../server/brief.ts";
import { analyzeProfile, analyzeSegment } from "../server/jev.ts";
import { openStore, type Store } from "../server/store.ts";
import { BRIEF_LANGS, type BriefLang } from "../shared/types.ts";
import type { AtlasBook } from "../src/domain/atlas.ts";
import { buildDossier } from "../src/domain/dossier.ts";
import { DEFAULT_WEIGHTS, fingerprintFrom, type Fingerprint } from "../src/domain/fingerprint.ts";
import { embed, neighbours } from "../src/domain/pca.ts";
import type { Segment } from "../src/domain/text.ts";
import { args as readArgs, pool, profileExcerpts, usd } from "./lib.ts";

const CONCURRENCY = 8;
const RETRIES = 3;
/** Measured mean Jev input per 1,800-char page and per whole-book profile request (rubric + text). */
const TOKENS_PER_PAGE = 5_165;
const PROFILE_TOKENS = 4_400;
const BRIEF_USD = 0.0025; // measured mean per brief (en and ru)
const ATLAS = join("public", "atlas.json");

const args = readArgs();
const source = args.source ?? "pelevin";
const top = Number(args.top ?? Infinity);
const kinds = args.kind ? new Set(args.kind.split(",")) : null;
const only = args.only ? new Set(args.only.split(",")) : null;
const dry = args.dry === "true";
const maxUsd = Number(args["max-usd"] ?? Infinity);
const briefsOnly = args["briefs-only"] === "true";
const briefLangs = (args["brief-langs"] ?? BRIEF_LANGS.join(",")).split(",").filter(Boolean) as BriefLang[];
if (briefLangs.some((l) => !(BRIEF_LANGS as readonly string[]).includes(l))) {
  console.error(`--brief-langs must be a subset of ${BRIEF_LANGS.join(",")}.`);
  process.exit(1);
}
const jevKey = process.env.TYPESAFE_API_KEY;
const briefKey = process.env.OPENROUTER_API_KEY;
if (!dry && !briefsOnly && !jevKey) {
  console.error("TYPESAFE_API_KEY is not set. Add it to .env.");
  process.exit(1);
}

const signal = new AbortController().signal;
const store = openStore();
const run = dry ? 0 : store.startRun(process.argv.slice(2).join(" ") || "corpus");
let spent = 0;
let briefUsd = 0;
let capped = false;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
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

async function analyseBook(id: string) {
  const segments = segmentsOf(store, id);
  const done = store.analyses(id, RUBRIC_VERSION);
  const missing = segments.map((s) => s.id).filter((i) => !done.has(i));
  let failed = 0;
  await pool(missing, CONCURRENCY, async (i) => {
    if (capped) return;
    try {
      const answer = await withRetry(() => analyzeSegment(segments[i].text, jevKey!, signal));
      store.putAnalysis(id, i, answer);
      spent += answer.usage?.input_tokens ?? 0;
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
  const jobs = complete.flatMap((id) => briefLangs.filter((lang) => !store.brief(id, lang)).map((lang) => ({ id, lang })));
  await pool(jobs, 3, async ({ id, lang }) => {
    if (usd(spent) + briefUsd >= maxUsd) {
      capped = true;
      return;
    }
    const book = store.book(id)!;
    const segments = segmentsOf(store, id);
    const analyses = store.analyses(id, RUBRIC_VERSION);
    const near = neighbours(rows, id, 5).map((n) => ({ title: store.book(n.id)!.title, author: store.book(n.id)!.author, similarity: n.similarity }));
    const dossier = buildDossier(book, segments, segments.map((s) => analyses.get(s.id) ?? null), store.profile(id, RUBRIC_VERSION) ?? undefined, near);
    try {
      const brief = await withRetry(() => writeBrief(dossier, briefKey, model, signal, { lang }));
      store.putBrief(id, brief);
      briefUsd += brief.usage.cost;
      console.log(`brief ${lang} ${book.title.slice(0, 50)} · $${brief.usage.cost.toFixed(4)}`);
    } catch (error) {
      console.warn(`brief ${lang} skip ${book.title}: ${error instanceof Error ? error.message : error}`);
    }
  });
}

/** Fully read books replace their atlas entries; other entries (none by default) stay. */
async function exportAtlas(prints: { id: string; fingerprint: Fingerprint }[]) {
  const previous = (await readJson<{ books: AtlasBook[] }>(ATLAS))?.books ?? [];
  const full: AtlasBook[] = prints.map(({ id, fingerprint }) => {
    const b = store.book(id)!;
    const meta = { ...(b.year != null && { year: b.year }), ...(b.kind && { kind: b.kind }), ...(b.titleEn && { titleEn: b.titleEn }) };
    return { id, title: b.title, author: b.author, ...(b.source === "gutenberg" && { gutenberg: Number(b.sourceRef) }), chars: b.chars, pagesRead: b.pages, fingerprint, ...meta };
  });
  const ids = new Set(full.map((b) => b.id));
  const books = [...full, ...previous.filter((b) => !ids.has(b.id))];
  await writeFile(ATLAS, JSON.stringify({ generatedAt: new Date().toISOString(), books }, null, 1));
  return books.length;
}

const entries = store
  .books()
  .filter((b) => b.source === source && (!kinds || (b.kind != null && kinds.has(b.kind))) && (!only || only.has(b.id)))
  .slice(0, top);
if (!entries.length) {
  console.error(`No stored books match (source=${source}). Run npm run pelevin:ingest first.`);
  store.close();
  process.exit(1);
}
let pages = 0,
  missingPages = 0,
  unprofiled = 0;
for (const book of entries) {
  const id = book.id;
  try {
    const missing = book.pages - store.analyses(id, RUBRIC_VERSION).size;
    pages += book.pages;
    missingPages += missing;
    if (!store.profile(id, RUBRIC_VERSION)) unprofiled++;
    if (dry || briefsOnly) continue;
    if (capped) break;
    const { failed } = await analyseBook(id);
    console.log(`${String(book.rank ?? "").padStart(3)} ${failed ? "part" : "ok  "} ${book.title.slice(0, 50).padEnd(50)} ${book.pages} p · run ${(spent / 1e6).toFixed(1)}M tok · $${usd(spent).toFixed(2)}`);
  } catch (error) {
    console.warn(`${String(book.rank ?? "").padStart(3)} skip ${book.title.slice(0, 50)}: ${error instanceof Error ? error.message : error}`);
  }
}

if (dry) {
  const tokens = missingPages * TOKENS_PER_PAGE + unprofiled * PROFILE_TOKENS;
  const missingBriefs = briefLangs.map((lang) => [lang, entries.filter((b) => !store.brief(b.id, lang)).length] as const);
  const toBrief = missingBriefs.reduce((s, [, n]) => s + n, 0);
  console.log(`\n${entries.length} ${source} books: ${pages.toLocaleString("en")} pages, ${missingPages.toLocaleString("en")} still to read, ${unprofiled} whole-book profiles to request.`);
  console.log(`briefs to write: ${missingBriefs.map(([l, n]) => `${l} ${n}`).join(", ")}`);
  console.log(`estimate: ${(tokens / 1e6).toFixed(1)}M Jev tokens ≈ $${usd(tokens).toFixed(2)} + briefs ≈ $${(toBrief * BRIEF_USD).toFixed(2)} (${toBrief} × ~$${BRIEF_USD})`);
} else {
  const progress = store.progress(RUBRIC_VERSION);
  const complete = progress.filter((b) => b.profiled && b.analysed === b.pages).map((b) => b.id);
  const prints = fingerprints(complete);
  // Neighbours come from every fully read book; briefs are written only for the selected ones.
  const selected = new Set(entries.map((b) => b.id));
  await writeBriefs(complete.filter((id) => selected.has(id)), prints);
  const total = await exportAtlas(prints);
  store.finishRun(run, spent, briefUsd);
  const all = store.spend();
  console.log(`\n${complete.length} books fully read · atlas: ${total} books${capped ? ` · stopped at the $${maxUsd} cap, rerun to continue` : ""}`);
  console.log(`this run: ${(spent / 1e6).toFixed(1)}M Jev tokens ≈ $${usd(spent).toFixed(2)} + briefs $${briefUsd.toFixed(2)}`);
  console.log(`store total: ${(all.jevTokens / 1e6).toFixed(1)}M Jev tokens ≈ $${usd(all.jevTokens).toFixed(2)} + briefs $${all.briefUsd.toFixed(2)}`);
}
store.close();
