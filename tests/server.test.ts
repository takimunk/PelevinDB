import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOTIONS, GENRES, MODES, MOODS, PROFILE_SCALES, RUBRIC_VERSION, SEGMENT_QUESTION_COUNT, TEXTURES, THEMES } from "../shared/catalog.ts";
import { analyzeProfile, analyzeSegment, parseSegment, profileQuestions, segmentQuestions } from "../server/jev.ts";
import { cleanGutenberg, parseOpds } from "../server/gutenberg.ts";
import { parseBrief, writeBrief } from "../server/brief.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { corpusBook, corpusETag, corpusList, packCorpusBook } from "../server/corpus.ts";
import { openStore } from "../server/store.ts";
import { corpusStats } from "../server/stats.ts";
import { segmentText } from "../src/domain/text.ts";
import { SAMPLE_BOOK, demoAnalyses } from "./fixtures/synthetic.ts";
import type { SegmentAnalysis } from "../shared/types.ts";
import { corpusId, dossierInput, excerptsInput, MAX_DOSSIER, MAX_PAGE, pageInput } from "../server/validate.ts";

function answers(questions: Record<string, { type: string; criteria?: unknown }>) {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      if (q.type === "score") return [id, { type: "score", score: 2, confidence: 0.8 }];
      if (q.type === "noul") return [id, { type: "noul", noul: 0.7 }];
      const options = Object.keys(q.criteria as object);
      return [id, { type: "choice", choice: options[0], confidence: 0.6, probabilities: Object.fromEntries(options.map((o, i) => [o, i ? 0.5 / (options.length - 1) : 0.5])) }];
    }),
  );
}
const segmentResponse = () => ({ model: "jev-test", answers: answers(segmentQuestions), usage: { input_tokens: 10 } });

test("segment request asks every dimension as one fan-out", () => {
  assert.equal(Object.keys(segmentQuestions).length, SEGMENT_QUESTION_COUNT);
  assert.equal(SEGMENT_QUESTION_COUNT, EMOTIONS.length + TEXTURES.length + 2 + THEMES.length);
  for (const q of Object.values(segmentQuestions)) assert.match(JSON.stringify(q.instructions), /`passage`/);
  assert.deepEqual(Object.keys((segmentQuestions.mood as { criteria: object }).criteria), MOODS.map((m) => m.id));
  assert.equal(Object.keys(profileQuestions).length, 2 + PROFILE_SCALES.length);
});

test("normalizes scores independently from confidence and keeps choice distributions", () => {
  const result = parseSegment(segmentResponse());
  assert.equal(result.emotions.joy, 0.5);
  assert.equal(result.emotionConfidence.joy, 0.8);
  assert.equal(result.texture.pace, 0.5);
  assert.equal(result.themes.love, 0.7);
  assert.ok(Math.abs(Object.values(result.mood).reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.equal(Object.keys(result.mode).length, MODES.length);
  assert.equal(result.usage?.input_tokens, 10);
});

test("rejects missing, out of range and nonfinite model results", () => {
  assert.throws(() => parseSegment({}));
  for (const score of [-1, 5, NaN, Infinity]) {
    const input = segmentResponse();
    (input.answers.emotion_joy as { score: number }).score = score;
    assert.throws(() => parseSegment(input));
  }
  const input = segmentResponse();
  (input.answers.theme_love as { noul: number }).noul = 2;
  assert.throws(() => parseSegment(input));
});

test("sends passage as state and keeps API credential in the authorization header", async () => {
  const result = await analyzeSegment("A quiet morning.", "test-secret", new AbortController().signal, async (url, init) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal((init!.headers as Record<string, string>).Authorization, "Bearer test-secret");
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.state, { passage: "A quiet morning." });
    assert.equal(body.model, "jev-latest");
    assert.ok(!JSON.stringify(body).includes("test-secret"));
    return new Response(JSON.stringify(segmentResponse()), { status: 200 });
  });
  assert.equal(result.model, "jev-test");
});

test("profile request sends excerpts and parses genre", async () => {
  const profile = await analyzeProfile(["one", "two"], "k", new AbortController().signal, async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string).state, { excerpts: ["one", "two"] });
    return new Response(JSON.stringify({ model: "jev-test", answers: answers(profileQuestions) }), { status: 200 });
  });
  assert.equal(profile.genre[GENRES[0].id], 0.5);
  assert.equal(profile.scales.realism, 0.5);
});

test("handles authentication failure without exposing upstream content", async () => {
  await assert.rejects(
    () => analyzeSegment("x", "test", new AbortController().signal, async () => new Response("private upstream content", { status: 401 })),
    /TypeSafe rejected the API key/,
  );
});

test("parses Gutenberg OPDS entries and skips navigation", () => {
  const xml = `<feed><entry><id>https://www.gutenberg.org/ebooks/authors/search.opds/?query=x</id><title>Authors</title></entry>
    <entry><id>https://www.gutenberg.org/ebooks/2600.opds</id><title>War and Peace</title><content type="text">graf Leo Tolstoy</content></entry>
    <entry><id>https://www.gutenberg.org/ebooks/19926.opds</id><title>Standard &amp; Selections
</title><content type="text">1839 downloads</content></entry></feed>`;
  assert.deepEqual(parseOpds(xml), [
    { id: "2600", title: "War and Peace", author: "graf Leo Tolstoy", source: "gutenberg" },
    { id: "19926", title: "Standard & Selections", author: "", source: "gutenberg" },
  ]);
});

test("strips Gutenberg boilerplate and re-joins hard-wrapped lines", () => {
  const raw = [
    "The Project Gutenberg eBook of Test",
    "Title: Test Book",
    "Author: Jane Writer",
    "",
    "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***",
    "",
    "It was a dark",
    "and stormy night.",
    "",
    "Second paragraph.",
    "*** END OF THE PROJECT GUTENBERG EBOOK TEST ***",
    "Licence text",
  ].join("\r\n");
  const book = cleanGutenberg(raw);
  assert.equal(book.title, "Test Book");
  assert.equal(book.author, "Jane Writer");
  assert.equal(book.text, "It was a dark and stormy night.\n\nSecond paragraph.");
});

test("request validation passes valid text through and never echoes it as an error", () => {
  assert.deepEqual(pageInput({ text: "A quiet morning." }), { value: "A quiet morning." });
  for (const body of [null, {}, { text: "" }, { text: "   " }, { text: 42 }, { text: "x".repeat(MAX_PAGE + 1) }]) {
    const parsed = pageInput(body);
    assert.ok("error" in parsed && !parsed.error.includes("xxx"));
  }
  assert.deepEqual(excerptsInput({ excerpts: ["one", "two"] }), { value: ["one", "two"] });
  assert.ok("error" in excerptsInput({ excerpts: [] }));
  assert.ok("error" in excerptsInput({ excerpts: ["ok", 3] }));
});

const brief = { logline: "A woman is confined to a room.", what: "A short story.", why: ["Tight.", "Eerie.", "Short."], who: ["Horror readers."], skip: "Skip if you want plot." };

test("brief asks OpenRouter for a strict JSON schema and reports tokens and cost", async () => {
  let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
  const fetcher = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization")! };
    return new Response(JSON.stringify({ model: "google/test", choices: [{ message: { content: JSON.stringify(brief) } }], usage: { prompt_tokens: 900, completion_tokens: 200, cost: 0.0021 } }));
  }) as typeof fetch;
  const result = await writeBrief({ title: "T", author: "A" } as never, "or-key", "google/test", new AbortController().signal, fetcher);
  assert.equal(sent!.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent!.auth, "Bearer or-key");
  assert.equal((sent!.body.response_format as { type: string }).type, "json_schema");
  assert.deepEqual(result.why, brief.why);
  assert.deepEqual(result.usage, { prompt_tokens: 900, completion_tokens: 200, cost: 0.0021 });
});

test("brief parsing rejects malformed or incomplete answers", () => {
  assert.throws(() => parseBrief({ choices: [{ message: { content: "not json" } }] }, "m"), /malformed/);
  assert.throws(() => parseBrief({ choices: [{ message: { content: JSON.stringify({ ...brief, why: [] }) } }] }, "m"), /incomplete/);
});

test("dossier validation needs a title and caps the size", () => {
  assert.ok("value" in dossierInput({ dossier: { title: "T", author: "A" } }));
  assert.ok("error" in dossierInput({ dossier: { author: "A" } }));
  assert.ok("error" in dossierInput({ dossier: [] }));
  assert.ok("error" in dossierInput({ dossier: { title: "T", author: "A", pad: "x".repeat(MAX_DOSSIER) } }));
});

test("store keeps answers per page and rubric, resumes, and totals spend", () => {
  const store = openStore(":memory:");
  const text = "One page.\n\nTwo page.";
  store.addBook(
    { id: "pg-1", source: "gutenberg", sourceRef: "1", title: "T", author: "A", rank: 1, chars: text.length, pageChars: 10, pages: 2 },
    text,
    [
      { start: 0, end: 9 },
      { start: 11, end: 20 },
    ],
  );
  const answer = { rubric: "r1", model: "jev", usage: { input_tokens: 5000 } } as unknown as SegmentAnalysis;
  store.putAnalysis("pg-1", 1, answer);
  store.putAnalysis("pg-1", 1, answer);
  assert.deepEqual([...store.analyses("pg-1", "r1").keys()], [1]);
  assert.equal(store.analyses("pg-1", "r2").size, 0);
  assert.equal(store.text("pg-1")!.slice(11, 20), "Two page.");
  assert.deepEqual(store.progress("r1").map((b) => [b.id, b.analysed, b.pages, b.profiled]), [["pg-1", 1, 2, false]]);
  assert.equal(store.spend().jevTokens, 5000);
  assert.throws(() => store.putAnalysis("pg-1", 7, answer));
  store.close();
});

function corpusFixture() {
  const store = openStore(":memory:");
  const text = "One page.\n\nTwo page.";
  store.addBook(
    { id: "pg-7", source: "gutenberg", sourceRef: "7", title: "T", author: "A", rank: 2, chars: text.length, pageChars: 10, pages: 2 },
    text,
    [
      { start: 0, end: 9 },
      { start: 11, end: 20 },
    ],
  );
  return store;
}
const analysis = { rubric: RUBRIC_VERSION, model: "jev", usage: { input_tokens: 5000 } } as unknown as SegmentAnalysis;

test("store stamp changes with every stored answer and is null for unknown books", () => {
  const store = corpusFixture();
  assert.equal(store.stamp("pg-404", RUBRIC_VERSION), null);
  const before = store.stamp("pg-7", RUBRIC_VERSION);
  store.putAnalysis("pg-7", 0, analysis);
  const after = store.stamp("pg-7", RUBRIC_VERSION);
  assert.notEqual(after, before);
  assert.equal(store.stamp("pg-7", "other-rubric"), before);
  store.putBrief("pg-7", { ...brief, model: "m", usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 }, createdAt: "2030-01-01T00:00:00.000Z" } as never);
  assert.notEqual(store.stamp("pg-7", RUBRIC_VERSION), after);
  store.close();
});

test("read-only store opens an existing file without migrating and refuses writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-"));
  const file = join(dir, "x.db");
  try {
    openStore(file).close();
    const store = openStore(file, { readOnly: true });
    assert.deepEqual(store.progress(RUBRIC_VERSION), []);
    assert.throws(() => store.putAnalysis("pg-1", 0, analysis), /readonly/i);
    store.close();
    assert.throws(() => openStore(join(dir, "missing.db"), { readOnly: true }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corpus list and book payload keep page order, gaps and the latest brief", async () => {
  const store = corpusFixture();
  store.putAnalysis("pg-7", 1, analysis);
  assert.deepEqual(corpusList(store), [
    { id: "pg-7", title: "T", author: "A", rank: 2, gutenberg: "7", pages: 2, chars: 20, analysed: 1, complete: false, briefed: false },
  ]);
  const book = corpusBook(store, "pg-7")!;
  assert.deepEqual(book.segments, [
    [0, 9],
    [11, 20],
  ]);
  assert.equal(book.text.slice(...book.segments[1]), "Two page.");
  assert.deepEqual(book.analyses.map((a) => a?.usage?.input_tokens ?? null), [null, 5000]);
  assert.equal(book.profile, null);
  assert.equal(corpusBook(store, "pg-8"), null);

  const etag = corpusETag(store, "pg-7")!;
  assert.match(etag, /^W\/"[\w-]+"$/);
  assert.equal(corpusETag(store, "pg-8"), null);
  const packed = await packCorpusBook(store, "pg-7", etag, "gzip")!;
  assert.deepEqual(JSON.parse(gunzipSync(packed).toString()), book);
  assert.equal(packCorpusBook(store, "pg-7", etag, "gzip"), packCorpusBook(store, "pg-7", etag, "gzip"));
  store.close();
});

test("corpus stats aggregate stored pages, pick record pages and refresh when the store changes", () => {
  const store = corpusFixture();
  const [dim, bright] = demoAnalyses(segmentText(SAMPLE_BOOK.text, "pages")).slice(0, 2);
  const page = (a: SegmentAnalysis, valence: number) =>
    ({ ...a, rubric: RUBRIC_VERSION, model: "jev", usage: { input_tokens: 1000 }, texture: { ...a.texture, valence } }) as SegmentAnalysis;
  store.putAnalysis("pg-7", 0, page(dim, 0.2));
  const first = corpusStats(store);
  assert.equal(first.analysed, 1);
  assert.equal(first.jev.tokens, 1000);
  assert.equal(corpusStats(store), first);

  store.putAnalysis("pg-7", 1, page(bright, 0.9));
  const stats = corpusStats(store);
  assert.notEqual(stats, first);
  assert.equal(stats.analysed, 2);
  assert.equal(stats.complete, 1);
  assert.equal(stats.jev.tokens, 2000);
  assert.deepEqual(stats.records.light, { id: "pg-7", title: "T", author: "A", page: 2, value: 0.9 });
  assert.equal(stats.records.dark.page, 1);
  store.close();
});

test("corpus id validation accepts only pg-{gutenberg id}", () => {
  assert.deepEqual(corpusId("pg-1342"), { value: "pg-1342" });
  for (const bad of ["pg-", "pg-0", "pg-01", "pg-12345678", "PG-1", "pg-1/../x", "pg-1 ", "abc", 7, null]) assert.ok("error" in corpusId(bad), String(bad));
});
