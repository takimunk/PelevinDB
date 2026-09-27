import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOTIONS, GENRES, MODES, MOODS, PROFILE_SCALES, RUBRIC_VERSION, SEGMENT_QUESTION_COUNT, TEXTURES, THEMES } from "../shared/catalog.ts";
import { analyzeProfile, analyzeSegment, parseSegment, profileQuestions, segmentQuestions } from "../server/jev.ts";
import { parseBrief, writeBrief } from "../server/brief.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { localMode } from "../server/mode.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { corpusBook, corpusETag, corpusList, EXCERPT_CHARS, fullTextEnabled, packCorpusBook, pageExcerpt, pageResponse, rateLimiter } from "../server/corpus.ts";
import { MIGRATIONS, openStore } from "../server/store.ts";
import { DatabaseSync } from "node:sqlite";
import { corpusStats, pageQuote, topPages } from "../server/stats.ts";
import { segmentText } from "../src/domain/text.ts";
import { SAMPLE_BOOK, demoAnalyses } from "./fixtures/synthetic.ts";
import type { SegmentAnalysis } from "../shared/types.ts";
import { briefInput, corpusId, dossierInput, excerptsInput, MAX_DOSSIER, MAX_PAGE, pageInput } from "../server/validate.ts";

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
    assert.equal(body.model, "jev-1.13.0");
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

test("local mode is on in development and with LOCAL_MODE=1, off in production and with LOCAL_MODE=0", () => {
  assert.equal(localMode({}), true);
  assert.equal(localMode({ NODE_ENV: "development" }), true);
  assert.equal(localMode({ LOCAL_MODE: "0" }), false);
  assert.equal(localMode({ NODE_ENV: "production" }), false);
  assert.equal(localMode({ NODE_ENV: "production", LOCAL_MODE: "1" }), true);
  assert.equal(localMode({ NODE_ENV: "production", LOCAL_MODE: "0" }), false);
});

/** Starts the real server (no Vite: LOCAL_MODE decides, NODE_ENV=production) and returns its base URL. */
async function startServer(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "xbook-mode-"));
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const child = spawn(process.execPath, ["server/index.ts"], {
    env: { ...process.env, NODE_ENV: "production", PORT: port, HOST: "127.0.0.1", XBOOK_DB: join(dir, "none.db"), XBOOK_BUDGET_DB: join(dir, "spend.db"), TYPESAFE_API_KEY: "", OPENROUTER_API_KEY: "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 15_000);
    child.stdout!.on("data", (d) => /running at/.test(String(d)) && (clearTimeout(timer), resolve()));
    child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("public mode rejects the upload analysis routes and reports localMode: false", async () => {
  const server = await startServer({ LOCAL_MODE: "0" });
  try {
    const status = await (await fetch(`${server.url}/api/status`)).json();
    assert.equal(status.localMode, false);
    assert.equal(status.configured, false);
    for (const route of ["/api/analyze", "/api/profile", "/api/brief"]) {
      const res = await fetch(server.url + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
      assert.equal(res.status, 404, route);
    }
    assert.equal((await fetch(`${server.url}/api/catalog/search?q=walden`)).status, 404);
  } finally {
    server.stop();
  }
});

test("local mode serves the upload analysis routes and reports localMode: true", async () => {
  const server = await startServer({ LOCAL_MODE: "1" });
  try {
    const status = await (await fetch(`${server.url}/api/status`)).json();
    assert.equal(status.localMode, true);
    const res = await fetch(`${server.url}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
    // Reaches the route itself: without a key it asks for one instead of hiding.
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /TYPESAFE_API_KEY/);
  } finally {
    server.stop();
  }
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
  const result = await writeBrief({ title: "T", author: "A" } as never, "or-key", "google/test", new AbortController().signal, { fetcher });
  assert.equal(sent!.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(sent!.auth, "Bearer or-key");
  assert.equal((sent!.body.response_format as { type: string }).type, "json_schema");
  assert.deepEqual(result.why, brief.why);
  assert.deepEqual(result.usage, { prompt_tokens: 900, completion_tokens: 200, cost: 0.0021 });
  assert.equal(result.lang, "en");
  const system = () => ((sent!.body.messages as { role: string; content: string }[])[0].content);
  assert.match(system(), /concrete English/);

  const ru = await writeBrief({ title: "T", author: "A" } as never, "or-key", "google/test", new AbortController().signal, { fetcher, lang: "ru" });
  assert.equal(ru.lang, "ru");
  assert.match(system(), /literary Russian/);
  assert.doesNotMatch(system(), /concrete English/);
  assert.deepEqual((sent!.body.response_format as { json_schema: { schema: { required: string[] } } }).json_schema.schema.required, ["logline", "what", "why", "who", "skip"]);
});

test("brief input accepts en or ru and defaults to en", () => {
  const dossier = { title: "T", author: "A" };
  assert.deepEqual(briefInput({ dossier }), { value: { dossier, lang: "en" } });
  assert.deepEqual(briefInput({ dossier, lang: "ru" }), { value: { dossier, lang: "ru" } });
  assert.ok("error" in briefInput({ dossier, lang: "de" }));
  assert.ok("error" in briefInput({ lang: "ru" }));
});

test("store keeps the latest brief per language and reports which languages exist", () => {
  const store = openStore(":memory:");
  store.addBook({ id: "pv-t", source: "pelevin", sourceRef: "h", title: "t", author: "A", rank: 1, chars: 4, pageChars: 10, pages: 1, year: 2009, kind: "novel", titleEn: "t" }, "text", [{ start: 0, end: 4 }]);
  const make = (lang: "en" | "ru" | undefined, logline: string, createdAt: number) => ({ ...brief, logline, model: "m", usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 }, createdAt, ...(lang && { lang }) });
  store.putBrief("pv-t", make(undefined, "old en", 1_000));
  assert.deepEqual(store.progress("r").map((b) => [b.briefed, b.briefedLangs]), [[false, ["en"]]]);
  store.putBrief("pv-t", make("ru", "по-русски", 2_000));
  store.putBrief("pv-t", make("en", "new en", 3_000));
  assert.equal(store.brief("pv-t")!.logline, "new en");
  assert.equal(store.brief("pv-t", "ru")!.logline, "по-русски");
  assert.equal(store.brief("pv-t", "ru")!.lang, "ru");
  assert.deepEqual(Object.keys(store.briefs("pv-t")).sort(), ["en", "ru"]);
  assert.deepEqual(store.progress("r").map((b) => [b.briefed, b.briefedLangs]), [[true, ["en", "ru"]]]);
  const book = corpusBook(store, "pv-t", true)!;
  assert.equal(book.briefs.ru!.logline, "по-русски");
  assert.equal(book.brief!.logline, "new en");
  store.close();
});

test("store migration v2 → v3 keeps existing briefs as English", () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-"));
  const file = join(dir, "v2.db");
  try {
    const db = new DatabaseSync(file);
    db.exec(MIGRATIONS[0]);
    db.exec(MIGRATIONS[1]);
    db.exec("PRAGMA user_version = 2");
    db.exec(`INSERT INTO books (id, source, source_ref, title, author, rank, chars, page_chars, pages, text, created_at) VALUES ('pv-x', 'pelevin', 'h', 'X', 'A', 1, 4, 10, 1, 'text', 'now')`);
    db.exec(`INSERT INTO briefs (book_id, model, answer, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES ('pv-x', 'm', '${JSON.stringify({ ...brief, model: "m", usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.002 }, createdAt: 5 })}', 1, 1, 0.002, '5')`);
    db.close();
    const store = openStore(file);
    assert.equal(Number((store.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version), MIGRATIONS.length);
    assert.equal(store.brief("pv-x", "en")!.logline, brief.logline);
    assert.equal(store.brief("pv-x", "en")!.lang, "en");
    assert.equal(store.brief("pv-x", "ru"), null);
    assert.deepEqual(store.progress("r")[0].briefedLangs, ["en"]);
    assert.equal(store.spend().briefUsd, 0.002);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    { id: "pg-7", title: "T", author: "A", rank: 2, gutenberg: "7", pages: 2, chars: 20, analysed: 1, complete: false, briefed: false, briefedLangs: [] },
  ]);
  const book = corpusBook(store, "pg-7", true)!;
  assert.deepEqual(book.segments, [
    [0, 9],
    [11, 20],
  ]);
  assert.equal(book.text!.slice(...book.segments[1]), "Two page.");
  assert.equal(book.excerpts, undefined);
  assert.deepEqual(book.analyses.map((a) => a?.usage?.input_tokens ?? null), [null, 5000]);
  assert.equal(book.profile, null);
  assert.equal(corpusBook(store, "pg-8"), null);

  const etag = corpusETag(store, "pg-7", true)!;
  assert.match(etag, /^W\/"[\w-]+"$/);
  assert.equal(corpusETag(store, "pg-8"), null);
  const packed = await packCorpusBook(store, "pg-7", etag, "gzip", true)!;
  assert.deepEqual(JSON.parse(gunzipSync(packed).toString()), book);
  assert.equal(packCorpusBook(store, "pg-7", etag, "gzip", true), packCorpusBook(store, "pg-7", etag, "gzip", true));
  store.close();
});

test("corpus books are sent as short page excerpts unless CORPUS_FULL_TEXT=1", async () => {
  assert.equal(fullTextEnabled({}), false);
  assert.equal(fullTextEnabled({ CORPUS_FULL_TEXT: "0" }), false);
  assert.equal(fullTextEnabled({ CORPUS_FULL_TEXT: "1" }), true);

  const store = corpusFixture();
  const book = corpusBook(store, "pg-7", false)!;
  assert.equal(book.text, null);
  assert.deepEqual(book.excerpts, ["One page.", "Two page."]);
  assert.deepEqual(book.segments, [
    [0, 9],
    [11, 20],
  ]);
  assert.equal(book.chars, 20);
  assert.notEqual(corpusETag(store, "pg-7", false), corpusETag(store, "pg-7", true));
  const etag = corpusETag(store, "pg-7", false)!;
  const body = gunzipSync(await packCorpusBook(store, "pg-7", etag, "gzip", false)!).toString();
  assert.ok(!body.includes("One page.\n\nTwo page."));
  store.close();
});

test("the page route serves exactly one page of full text, 404 out of range and 400 for bad ids", () => {
  const store = corpusFixture();
  const allow = () => ({ ok: true }) as const;
  const ok = pageResponse(store, "pg-7", "2", allow);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { page: 2, text: "Two page.", start: 11, end: 20 });
  assert.match((ok as { etag: string }).etag, /^W\/"[\w-]+"$/);
  assert.equal(pageResponse(store, "pg-7", "3", allow).status, 404);
  assert.equal(pageResponse(store, "pg-8", "1", allow).status, 404);
  assert.equal(pageResponse(null, "pv-x", "1", allow).status, 404);
  for (const [id, n] of [["pg-7/../x", "1"], ["PV-X", "1"], ["pg-7", "0"], ["pg-7", "-1"], ["pg-7", "1.5"], ["pg-7", "abc"]]) assert.equal(pageResponse(store, id, n, allow).status, 400, `${id} ${n}`);
  const limited = pageResponse(store, "pg-7", "1", () => ({ ok: false, retryAfter: 12 }));
  assert.equal(limited.status, 429);
  store.close();
});

test("page rate limit allows a reading pace per client and resets each window", () => {
  let t = 0;
  const allow = rateLimiter(3, 60_000, () => t);
  assert.deepEqual([allow("a"), allow("a"), allow("a")].map((r) => r.ok), [true, true, true]);
  assert.deepEqual(allow("a"), { ok: false, retryAfter: 60 });
  assert.equal(allow("b").ok, true);
  t = 60_000;
  assert.equal(allow("a").ok, true);
});

test("page excerpts stay short and end on a sentence or a word", () => {
  assert.equal(pageExcerpt("  Short   page.  "), "Short page.");
  const sentences = "Первое предложение довольно длинное, чтобы занять место. ".repeat(3) + "x".repeat(300);
  const a = pageExcerpt(sentences);
  assert.ok(a.length <= EXCERPT_CHARS);
  assert.match(a, /место\.$/);
  const words = "word ".repeat(100);
  const b = pageExcerpt(words);
  assert.ok(b.length <= EXCERPT_CHARS);
  assert.match(b, /word…$/);
  const solid = "y".repeat(400);
  assert.equal(pageExcerpt(solid).length, EXCERPT_CHARS);
});

test("corpus metadata carries year, kind and English title when the store has them", () => {
  const store = corpusFixture();
  const withMeta = {
    ...store,
    progress: (r: string) => store.progress(r).map((b) => ({ ...b, year: 1999, kind: "novel", titleEn: "Homo Zapiens" })),
    book: (id: string) => {
      const b = store.book(id);
      return b && { ...b, year: "1999", kind: "poem", title_en: " Homo Zapiens " };
    },
  } as typeof store;
  const [entry] = corpusList(withMeta);
  assert.equal(entry.year, 1999);
  assert.equal(entry.kind, "novel");
  assert.equal(entry.titleEn, "Homo Zapiens");
  const book = corpusBook(withMeta, "pg-7", false)!;
  assert.equal(book.year, 1999);
  assert.equal(book.kind, undefined);
  assert.equal(book.titleEn, "Homo Zapiens");
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

test("corpus id validation accepts pv-{slug} and pg-{gutenberg id} only", () => {
  assert.deepEqual(corpusId("pg-1342"), { value: "pg-1342" });
  assert.deepEqual(corpusId("pv-generation-p"), { value: "pv-generation-p" });
  assert.deepEqual(corpusId("pv-1999"), { value: "pv-1999" });
  for (const bad of ["pg-", "pg-0", "pg-01", "pg-12345678", "PG-1", "pg-1/../x", "pg-1 ", "abc", 7, null, "pv-", "pv--x", "pv-x-", "pv-Generation", "pv-x/../y", "pv-x_y", `pv-${"a".repeat(100)}`])
    assert.ok("error" in corpusId(bad), String(bad));
});

test("top pages per emotion rank story pages, skip paratext, never repeat a page and quote one sentence", () => {
  const store = openStore(":memory:");
  const sentence = "Он посмотрел на реку и понял, что она течёт сквозь него уже много лет подряд.";
  const pages = [`и дальше. ${sentence} Потом ещё одно предложение, которое уже не нужно никому.`, "Контент. Оглавление.", `${sentence}`, `${sentence}`];
  const text = pages.join("\n\n");
  let at = 0;
  const segs = pages.map((p) => {
    const s = { start: at, end: at + p.length };
    at += p.length + 2;
    return s;
  });
  store.addBook({ id: "pv-a", source: "pelevin", sourceRef: "a", title: "Омон Ра", titleEn: "Omon Ra", year: 1992, author: "П", rank: null, chars: text.length, pageChars: 1800, pages: 4 }, text, segs);
  const base = demoAnalyses(segmentText(SAMPLE_BOOK.text, "pages"))[0];
  const put = (idx: number, joy: number, paratext = 0) =>
    store.putAnalysis("pv-a", idx, {
      ...base,
      rubric: RUBRIC_VERSION,
      model: "jev",
      emotions: { ...base.emotions, joy, fear: 0.1 },
      mode: { ...base.mode, paratext },
    } as SegmentAnalysis);
  put(0, 0.9);
  put(1, 0.99, 0.95);
  put(2, 0.5);
  put(3, 0.7);

  const top = topPages(store, 3);
  assert.deepEqual(top.map((c) => c.emotion), EMOTIONS.map((e) => e.id));
  const joy = top.find((c) => c.emotion === "joy")!.items;
  // Joy picks first, so it gets the strongest story page; the paratext page (p. 2) never appears.
  assert.equal(joy[0].page, 1);
  assert.equal(joy[0].quote, sentence);
  assert.equal(joy[0].titleEn, "Omon Ra");
  assert.equal(joy[0].year, 1992);
  const seen = top.flatMap((c) => c.items.map((i) => i.page));
  assert.equal(new Set(seen).size, seen.length);
  assert.ok(!seen.includes(2));
  assert.equal(topPages(store, 3), top);
  put(2, 0.95);
  assert.equal(topPages(store, 3).find((c) => c.emotion === "joy")!.items[0].page, 3);
  store.close();

  assert.equal(pageQuote("коротко. " + "слово ".repeat(60)).endsWith("…"), true);
  assert.ok(pageQuote("слово ".repeat(60)).length <= 140);
});

test("corpus pages: filters, sort, facet counts, paratext skipped, one-sentence quotes and the 5-page cap", async () => {
  const { MAX_RESULT_PAGES, PAGE_SIZE, pagesETag, pagesQuery, queryPages } = await import("../server/pages.ts");
  const store = openStore(":memory:");
  const base = demoAnalyses(segmentText(SAMPLE_BOOK.text, "pages"))[0];
  const sentence = (i: number) => `Страница номер ${i} рассказывает о реке, которая течёт через весь город к морю.`;
  const add = (id: string, title: string, year: number, kind: "novel" | "story", n: number) => {
    const pages = Array.from({ length: n }, (_, i) => `${sentence(i)} ${"Второе предложение. ".repeat(20)}`);
    const text = pages.join("\n\n");
    let at = 0;
    const segs = pages.map((p) => {
      const seg = { start: at, end: at + p.length };
      at += p.length + 2;
      return seg;
    });
    store.addBook({ id, source: "pelevin", sourceRef: id, title, titleEn: null, year, kind, author: "П", rank: null, chars: text.length, pageChars: 1800, pages: n }, text, segs);
    return pages;
  };
  add("pv-a", "Омон Ра", 1992, "novel", 150);
  add("pv-b", "Жёлтая стрела", 1993, "story", 10);
  const put = (id: string, idx: number, humor: number, over: Partial<SegmentAnalysis> = {}) =>
    store.putAnalysis(id, idx, {
      ...base,
      rubric: RUBRIC_VERSION,
      model: "jev",
      texture: { ...base.texture, humor },
      mode: { ...base.mode, paratext: 0 },
      ...over,
    } as SegmentAnalysis);
  for (let i = 0; i < 150; i++) put("pv-a", i, i / 150);
  for (let i = 0; i < 10; i++) put("pv-b", i, 0.5, i === 0 ? { mode: { ...base.mode, paratext: 0.99 } } : {});

  const q = (raw: Record<string, string>) => {
    const parsed = pagesQuery(raw);
    assert.ok("query" in parsed, JSON.stringify(parsed));
    return queryPages(store, parsed.query);
  };
  const all = q({});
  assert.equal(all.total, 159, "the paratext page is skipped");
  assert.equal(all.pageSize, PAGE_SIZE);
  assert.equal(all.pages, MAX_RESULT_PAGES, "159 rows would be 7 result pages; the cap is 5");
  assert.equal(all.rows.length, PAGE_SIZE);
  assert.ok(all.rows.every((r) => r.quote.length <= 160 && !r.quote.includes("Второе")), "one sentence per row");
  assert.equal(all.facets.book["pv-a"], 150);
  assert.equal(all.facets.decade["1990"], 159);

  const funny = q({ sort: "humor", dir: "-1" });
  assert.equal(funny.rows[0].id, "pv-a");
  assert.equal(funny.rows[0].page, 150);
  const dull = q({ sort: "humor", dir: "1" });
  assert.equal(dull.rows[0].page, 1);

  const story = q({ kind: "story" });
  assert.equal(story.total, 9);
  assert.ok(story.rows.every((r) => r.id === "pv-b"));
  assert.equal(story.facets.kind.novel, 150, "a facet ignores its own filter");
  assert.equal(story.facets.book["pv-a"], undefined, "other facets respect it");
  assert.equal(q({ q: "желтая" }).total, 9, "search ignores case and ё");
  assert.equal(q({ q: "номер 149" }).total, 1);

  assert.ok("error" in pagesQuery({ page: "6" }));
  assert.match((pagesQuery({ page: "6" }) as { error: string }).error, /copyright/);
  assert.ok("error" in pagesQuery({ page: "0" }));
  assert.ok("error" in pagesQuery({ mood: "nope" }));
  assert.ok("error" in pagesQuery({ sort: "rank" }));
  assert.ok("error" in pagesQuery({ q: "x".repeat(101) }));
  assert.equal(q({ page: "5" }).rows.length, PAGE_SIZE);

  const etag = pagesETag(store, (pagesQuery({}) as { query: never }).query);
  assert.match(etag, /^W\//);
  put("pv-b", 1, 0.9);
  assert.notEqual(pagesETag(store, (pagesQuery({}) as { query: never }).query), etag);
  store.close();
});
