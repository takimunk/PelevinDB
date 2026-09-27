import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FOCUS, FOCUS_NONE, FOCUS_RUBRIC, RUBRIC_VERSION, SENTENCE_QUESTION_COUNT, SENTENCE_RUBRIC } from "../shared/catalog.ts";
import { numberedPassage, SENTENCE_MAX, splitSentences } from "../shared/sentences.ts";
import type { FocusAnalysis, SegmentAnalysis, SentenceAnalysis } from "../shared/types.ts";
import { focusQuestions, parseFocus, parseSentence, sentenceQuestions } from "../server/jev.ts";
import { corpusBook, pageResponse } from "../server/corpus.ts";
import { MIGRATIONS, openStore } from "../server/store.ts";
import { linesQuery, MAX_RESULT_PAGES, peakQuote, peek, queryLines, sentenceQuote } from "../server/sentences.ts";
import { queryPages, pagesQuery } from "../server/pages.ts";
import { focusWeights, peakSentence } from "../shared/focus.ts";
import { demoAnalyses } from "./fixtures/synthetic.ts";

const texts = (page: string) => splitSentences(page).map((s) => page.slice(s.start, s.end));

test("sentences: Russian punctuation, initials, abbreviations and whole dialogue lines", () => {
  assert.deepEqual(texts("Он кивнул. Потом ушёл! А она?"), ["Он кивнул.", "Потом ушёл!", "А она?"]);
  assert.deepEqual(texts("В. И. Ленин жил в г. Москве, т. е. в столице. Дальше."), ["В. И. Ленин жил в г. Москве, т. е. в столице.", "Дальше."]);
  assert.deepEqual(texts("«Иди». — Куда? Он молчал…\n— Да, — сказал он. — Пойдём."), ["«Иди».", "— Куда?", "Он молчал…", "— Да, — сказал он. — Пойдём."]);
  // A sentence split by a page break: the page opens mid-sentence and the fragment stays a unit.
  assert.deepEqual(texts("и тогда он понял. Всё."), ["и тогда он понял.", "Всё."]);
  // A paragraph without letters ("***", "…") joins a neighbour.
  assert.deepEqual(texts("***\nНачало.\n…\nКонец."), ["***\nНачало.\n…", "Конец."]);
  assert.equal(splitSentences("").length, 0);
});

test("sentences: run-ons are capped at clause boundaries and every letter stays covered", () => {
  const long = Array.from({ length: 60 }, (_, i) => `слово${i}, и ещё`).join(" ") + ".";
  const units = splitSentences(long);
  assert.ok(units.length > 1);
  for (const u of units) assert.ok(u.end - u.start <= SENTENCE_MAX);
  assert.equal(units.map((u) => long.slice(u.start, u.end)).join(" ").replace(/\s+/g, ""), long.replace(/\s+/g, ""));
  const page = "Первое. Второе.\nТретье.";
  assert.equal(numberedPassage(page, splitSentences(page)), "[1] Первое. [2] Второе.\n[3] Третье.");
});

function choiceAnswer(options: string[], best: string) {
  return { type: "choice", choice: best, confidence: 0.7, probabilities: Object.fromEntries(options.map((o) => [o, o === best ? 0.6 : 0.4 / (options.length - 1)])) };
}

test("focus request: one Choice per dimension over the sentence numbers and none, parsed per sentence", () => {
  const q = focusQuestions(3);
  assert.equal(Object.keys(q).length, FOCUS.length);
  assert.ok(!FOCUS.some((f) => (f.id as string) === "anticipation"));
  for (const question of Object.values(q)) {
    assert.deepEqual(Object.keys((question as { criteria: object }).criteria), ["1", "2", "3", FOCUS_NONE]);
    assert.match(question.instructions, /`passage`/);
  }
  const options = ["1", "2", "3", FOCUS_NONE];
  const answers = Object.fromEntries(FOCUS.map((f) => [`focus_${f.id}`, choiceAnswer(options, f.id === "quotable" ? FOCUS_NONE : "2")]));
  const f = parseFocus({ model: "jev", answers, usage: { input_tokens: 9 } }, 3);
  assert.equal(f.sentences, 3);
  assert.equal(f.rubric, FOCUS_RUBRIC);
  assert.deepEqual(f.focus.fear.map((p) => Math.round(p * 100)), [13, 60, 13]);
  assert.equal(peakSentence(f, "fear"), 1);
  assert.equal(peakSentence(f, "quotable"), null);
  assert.throws(() => parseFocus({ model: "jev", answers: { ...answers, focus_fear: { type: "score", score: 1 } } }, 3), /invalid/);
});

test("sentence request asks 14 sentence-sized questions and parses them", () => {
  assert.equal(Object.keys(sentenceQuestions).length, SENTENCE_QUESTION_COUNT);
  assert.equal(SENTENCE_QUESTION_COUNT, 14);
  const answers = Object.fromEntries(
    Object.entries(sentenceQuestions).map(([id, q]) =>
      q.type === "score" ? [id, { type: "score", score: 4, confidence: 0.9 }] : q.type === "noul" ? [id, { type: "noul", noul: 0.8 }] : [id, choiceAnswer(Object.keys(q.criteria), Object.keys(q.criteria)[1])],
    ),
  );
  const a = parseSentence({ model: "jev", answers });
  assert.equal(a.rubric, SENTENCE_RUBRIC);
  assert.equal(a.scales.irony, 1);
  assert.equal(a.flags.aphorism, 0.8);
  assert.equal(a.emotion.trust, 0.6);
  assert.equal(a.act.speech, 0.6);
});

const page = (emotions: Partial<SegmentAnalysis["emotions"]>, texture: Partial<SegmentAnalysis["texture"]> = {}) => {
  const [base] = demoAnalyses([{ id: 1, start: 0, end: 1, text: "x" }]) as SegmentAnalysis[];
  return { ...base, rubric: RUBRIC_VERSION, emotions: { ...base.emotions, ...emotions }, texture: { ...base.texture, ...texture }, mode: { ...base.mode, paratext: 0 } } as SegmentAnalysis;
};

function focusOf(count: number, peaks: Partial<Record<(typeof FOCUS)[number]["id"], number>>): FocusAnalysis {
  const focus = {} as FocusAnalysis["focus"];
  const none = {} as FocusAnalysis["none"];
  for (const f of FOCUS) {
    const peak = peaks[f.id];
    focus[f.id] = Array.from({ length: count }, (_, i) => (peak == null ? 0.1 / count : i === peak ? 0.8 : 0.2 / (count - 1)));
    none[f.id] = peak == null ? 0.9 : 0;
  }
  return { sentences: count, focus, none, confidence: Object.fromEntries(FOCUS.map((f) => [f.id, 0.7])) as FocusAnalysis["confidence"], model: "jev", rubric: FOCUS_RUBRIC };
}

function sentenceFixture() {
  const store = openStore(":memory:");
  const p1 = "Он вошёл в комнату. Страшная тень метнулась к окну и исчезла. Он сел.";
  const p2 = "Жизнь есть сон, а сон есть пустота, которую мы продаём друг другу. Смешно.";
  const text = `${p1}\n${p2}`;
  store.addBook({ id: "pv-x", source: "pelevin", sourceRef: "h", title: "Икс", author: "П", rank: 1, chars: text.length, pageChars: 80, pages: 2, year: 1999, kind: "story", titleEn: "X" }, text, [
    { start: 0, end: p1.length + 1 },
    { start: p1.length + 1, end: text.length },
  ]);
  const segments = store.segments("pv-x");
  store.putSentences("pv-x", segments.flatMap((s) => splitSentences(text.slice(s.start, s.end)).map((x) => ({ page: s.idx, start: s.start + x.start, end: s.start + x.end }))));
  store.putAnalysis("pv-x", 0, page({ fear: 0.9 }, { valence: 0.2 }));
  store.putAnalysis("pv-x", 1, page({ fear: 0.1 }, { ideas: 0.9, humor: 0.6 }));
  store.putFocus("pv-x", 0, focusOf(3, { fear: 1, dark: 1, tension: 1 }));
  store.putFocus("pv-x", 1, focusOf(2, { ideas: 0, quotable: 0, humor: 1 }));
  return { store, text };
}

test("store v4 keeps sentence boundaries, focus and sentence answers; the page route and quotes use them", () => {
  const { store } = sentenceFixture();
  assert.equal(store.sentences("pv-x").get(0)!.length, 3);
  const before = pageResponse(store, "pv-x", "1", () => ({ ok: true }));
  assert.equal(before.status, 200);
  const body = (before as { body: { text: string; sentences: { spans: [number, number][]; focus: unknown; read: unknown[] } } }).body;
  assert.deepEqual(body.sentences.spans.map(([s, e]) => body.text.slice(s, e)), ["Он вошёл в комнату.", "Страшная тень метнулась к окну и исчезла.", "Он сел."]);
  assert.deepEqual(body.sentences.read, [null, null, null]);

  const read = { emotion: { fear: 0.7 }, act: { narration: 0.9 }, scales: { valence: 0.1, arousal: 0.8, irony: 0, abstraction: 0, imagery: 0.5 }, flags: { aphorism: 0.1, punchline: 0, wordplay: 0, allusion: 0, illusion: 0, market: 0, turn: 0.6 }, rubric: SENTENCE_RUBRIC, model: "jev", usage: { input_tokens: 7 } } as unknown as SentenceAnalysis;
  store.putSentenceAnalysis("pv-x", 0, 1, read);
  const after = pageResponse(store, "pv-x", "1", () => ({ ok: true })) as { etag: string; body: { sentences: { read: ({ emotion: string } | null)[] } } };
  assert.notEqual(after.etag, (before as { etag: string }).etag);
  assert.equal(after.body.sentences.read[1]!.emotion, "fear");
  assert.equal(store.spend().jevTokens, 7);

  assert.equal(peakQuote(store, "pv-x", 0, "fear"), "Страшная тень метнулась к окну и исчезла.");
  assert.equal(peakQuote(store, "pv-x", 0, "joy"), null, "no peak when Jev answers none");
  assert.equal(peakQuote(store, "pv-x", 1, "humor"), null, "too short to quote");
  const lines = corpusBook(store, "pv-x", false)!.lines!;
  assert.deepEqual(lines.find((l) => l.dim === "quotable"), { dim: "quotable", page: 2, n: 1, text: "Жизнь есть сон, а сон есть пустота, которую мы продаём друг другу.", weight: 0.8, read: null });
  store.close();
});

test("peek returns one page's peak sentence for a dimension, or its leading emotion's", () => {
  const { store } = sentenceFixture();
  assert.deepEqual(peek(store, "pv-x", 0, "tension"), { text: "Страшная тень метнулась к окну и исчезла.", dim: "tension" });
  // Page 1 leads with fear (0.9), so no dimension means fear.
  assert.deepEqual(peek(store, "pv-x", 0, null), { text: "Страшная тень метнулась к окну и исчезла.", dim: "fear" });
  // No sentence carries joy on page 1: the leading emotion's sentence stands in.
  assert.deepEqual(peek(store, "pv-x", 0, "joy"), { text: "Страшная тень метнулась к окну и исчезла.", dim: "fear" });
  assert.equal(peek(store, "pv-x", 9, "fear"), null);
  // However short, the peak is quoted: the reader highlights it, so the preview must show the same sentence.
  assert.deepEqual(peek(store, "pv-x", 1, "humor"), { text: "Смешно.", dim: "humor" });
  store.close();
});

test("pages sorted by an emotion quote the page's peak sentence for it", () => {
  const { store } = sentenceFixture();
  const q = pagesQuery({ sort: "fear" });
  assert.ok("query" in q);
  const rows = queryPages(store, q.query).rows;
  assert.equal(rows[0].quote, "Страшная тень метнулась к окну и исчезла.");
  store.close();
});

test("lines rank sentences by page score × focus, filter by flags and stop at the result-page cap", () => {
  const { store } = sentenceFixture();
  const q = linesQuery({ dim: "ideas" });
  assert.ok("query" in q);
  const result = queryLines(store, q.query);
  assert.equal(result.rows[0].text, "Жизнь есть сон, а сон есть пустота, которую мы продаём друг другу.");
  assert.equal(result.rows[0].weights.ideas, 0.72);
  assert.equal(result.read, 0);
  assert.equal(queryLines(store, { ...q.query, flag: "aphorism" }).total, 0);
  assert.ok("error" in linesQuery({ page: String(MAX_RESULT_PAGES + 1) }));
  assert.ok("error" in linesQuery({ dim: "anticipation" }));
  assert.equal(sentenceQuote("x".repeat(400)).length, 220);
  assert.equal(sentenceQuote("и дальше.", true), "…и дальше.");
  assert.deepEqual(focusWeights(focusOf(2, { fear: 0 }), page({ fear: 0.5 }), "fear"), [0.4, 0.1]);
  store.close();
});

test("a read-only server still opens a v3 file, without sentences", () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-"));
  const file = join(dir, "v3.db");
  try {
    const db = new DatabaseSync(file);
    for (const m of MIGRATIONS.slice(0, 3)) db.exec(m);
    db.exec("PRAGMA user_version = 3");
    db.close();
    const store = openStore(file, { readOnly: true });
    assert.equal(store.hasSentences, false);
    assert.equal(store.sentences("pv-x").size, 0);
    assert.equal(store.spend().jevTokens, 0);
    assert.equal(store.totals().jevRequests, 0);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
