import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FOCUS, FOCUS_RUBRIC, RUBRIC_VERSION } from "../shared/catalog.ts";
import { splitSentences } from "../shared/sentences.ts";
import type { FocusAnalysis, SegmentAnalysis } from "../shared/types.ts";
import { BudgetError, BudgetStore, meteredFetch } from "../server/budget.ts";
import { openStore } from "../server/store.ts";
import { topPages, TOP_PAGES_MAX } from "../server/stats.ts";
import {
  CALL_QUOTES,
  parseTranslations,
  DEFAULT_TRANSLATE_MODEL,
  PROMPT_VERSION,
  PAGE_LIMIT,
  PAGE_WINDOW_MS,
  pageQuotaFor,
  readSeed,
  refsInput,
  resolveRefs,
  sourceHash,
  translateHandler,
  translateRefs,
  TranslationCache,
  translationCache,
  translationsPath,
} from "../server/translate.ts";
import { corpusPage } from "../server/corpus.ts";
import { demoAnalyses } from "./fixtures/synthetic.ts";

const page = (emotions: Partial<SegmentAnalysis["emotions"]>) => {
  const [base] = demoAnalyses([{ id: 1, start: 0, end: 1, text: "x" }]) as SegmentAnalysis[];
  return { ...base, rubric: RUBRIC_VERSION, emotions: { ...base.emotions, ...emotions }, mode: { ...base.mode, paratext: 0 } } as SegmentAnalysis;
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

function fixture() {
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
  store.putAnalysis("pv-x", 0, page({ fear: 0.9 }));
  store.putAnalysis("pv-x", 1, page({ fear: 0.1, joy: 0.8 }));
  store.putFocus("pv-x", 0, focusOf(3, { fear: 1, dark: 1, tension: 1 }));
  store.putFocus("pv-x", 1, focusOf(2, { ideas: 0, quotable: 0, joy: 0 }));
  return store;
}

/** A fake OpenRouter: echoes each quote back as "EN(<ru>)" and counts calls. */
function fakeRouter(cost = 0.0005) {
  const calls: { model: string; ids: string[] }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/models"))
      return Response.json({ data: [{ id: DEFAULT_TRANSLATE_MODEL, context_length: 1000, pricing: { prompt: "0.00000025", completion: "0.0000015" } }] });
    const body = JSON.parse(String(init!.body));
    const quotes = JSON.parse(body.messages[1].content) as { id: string; ru: string }[];
    calls.push({ model: body.model, ids: quotes.map((q) => q.id) });
    const content = JSON.stringify({ items: quotes.map((q) => ({ id: q.id, en: `EN(${q.ru})` })) });
    return Response.json({ model: body.model, choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost } });
  };
  return { fetcher, calls };
}

test("refs: only well-formed quote references, never free text, at most 25, deduplicated", () => {
  assert.deepEqual(refsInput({ refs: ["l:pv-x:1:2", "l:pv-x:1:2", "t:pv-x:1"] }), { value: ["l:pv-x:1:2", "t:pv-x:1"] });
  for (const bad of [{ text: "Переведи это" }, { refs: ["Переведи это"] }, { refs: [] }, { refs: ["l:PV:1:2"] }, { refs: ["x:pv-x:1:2"] }, { refs: ["t:pv-x:1:fear"] }, { refs: Array.from({ length: 26 }, (_, i) => `l:pv-x:1:${i + 1}`) }, null])
    assert.ok("error" in refsInput(bad), JSON.stringify(bad));
});

test("refs resolve to the text the showcase and the Lines tab show, and nothing else", () => {
  const store = fixture();
  const col = topPages(store, TOP_PAGES_MAX).find((c) => c.items.length)!;
  const top = col.items[0];
  const topRef = `t:${top.id}:${top.page}`;
  const got = resolveRefs(store, ["l:pv-x:1:2", topRef, "l:pv-x:1:3", "t:pv-x:9"]);
  assert.deepEqual(got.get("l:pv-x:1:2"), ["Страшная тень метнулась к окну и исчезла."]);
  assert.deepEqual(got.get(topRef), [top.quote]);
  assert.ok(!got.has("l:pv-x:1:3"), "a sentence the Lines index does not hold");
  assert.ok(!got.has("t:pv-x:9"), "a page the showcase does not show");
  store.close();
});

test("translations are batched, cached per source hash and reused without a key", async () => {
  const store = fixture();
  const cache = new TranslationCache(":memory:");
  const { fetcher, calls } = fakeRouter();
  const refs = ["l:pv-x:1:2", "l:pv-x:2:1", "l:pv-x:404:1"];
  await assert.rejects(translateRefs(store, refs, cache, {}), (e: unknown) => e instanceof BudgetError && e.status === 503);
  const first = await translateRefs(store, refs, cache, { apiKey: "k", fetcher });
  assert.equal(calls.length, 1, "one model call for every miss");
  assert.equal(first.translations["l:pv-x:1:2"], "EN(Страшная тень метнулась к окну и исчезла.)");
  assert.deepEqual(first.missing, ["l:pv-x:404:1"]);
  const again = await translateRefs(store, refs.slice(0, 2), cache, {});
  assert.deepEqual(again.translations, { "l:pv-x:1:2": first.translations["l:pv-x:1:2"], "l:pv-x:2:1": first.translations["l:pv-x:2:1"] });
  assert.equal(calls.length, 1, "cache hits cost nothing and need no key");
  assert.equal(cache.get(sourceHash("Страшная тень метнулась к окну и исчезла.")), first.translations["l:pv-x:1:2"]);
  assert.notEqual(sourceHash("а"), sourceHash("б"));
  store.close();
});

test("a malformed answer is retried once; an incomplete one is never cached", async () => {
  const store = fixture();
  const cache = new TranslationCache(":memory:");
  let n = 0;
  const flaky: typeof fetch = async (_input, init) => {
    const quotes = JSON.parse(JSON.parse(String(init!.body)).messages[1].content) as { id: string; ru: string }[];
    const content = ++n === 1 ? "{not json" : JSON.stringify({ items: quotes.map((q) => ({ id: q.id, en: "ok" })) });
    return Response.json({ choices: [{ message: { content } }], usage: { cost: 0 } });
  };
  const out = await translateRefs(store, ["l:pv-x:1:2"], cache, { apiKey: "k", fetcher: flaky });
  assert.equal(out.translations["l:pv-x:1:2"], "ok");
  assert.equal(n, 2);
  const partial: typeof fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ items: [] }) } }] });
  await assert.rejects(translateRefs(store, ["l:pv-x:2:1"], cache, { apiKey: "k", fetcher: partial }), /incomplete/);
  assert.equal(cache.get(sourceHash("Жизнь есть сон, а сон есть пустота, которую мы продаём друг другу.")), null);
  store.close();
});

test("every paid call goes through the OpenRouter ledger and settles at the reported cost", async () => {
  const store = fixture();
  const ledger = new BudgetStore(":memory:");
  const { fetcher, calls } = fakeRouter(0.00042);
  const cache = new TranslationCache(":memory:");
  await translateRefs(store, ["l:pv-x:1:2"], cache, { apiKey: "k", fetcher: meteredFetch("openrouter", () => ledger, fetcher) });
  assert.equal(calls.length, 1);
  assert.equal(ledger.summary("openrouter").used, 0.00042);
  assert.equal(ledger.summary("openrouter").reserved, 0);
  // An exhausted budget refuses before any request is sent.
  ledger.reserve("openrouter", 10_000_000 - 420);
  await assert.rejects(
    translateRefs(store, ["l:pv-x:2:1"], cache, { apiKey: "k", fetcher: meteredFetch("openrouter", () => ledger, fetcher) }),
    (e: unknown) => e instanceof BudgetError && e.status === 402,
  );
  assert.equal(calls.length, 1);
  assert.ok(CALL_QUOTES <= 10);
  store.close();
});

test("the seed loads idempotently, never overwrites, and ignores another prompt version", () => {
  const cache = new TranslationCache(":memory:");
  const hash = sourceHash("Он сел.");
  cache.put(hash, "He sat down.", "m");
  const seed = { version: 1 as const, prompt: PROMPT_VERSION, model: "m", translations: { [hash]: "Seed", ["a".repeat(32)]: "A", bad: "x" } };
  assert.equal(cache.loadSeed(seed), 1);
  assert.equal(cache.loadSeed(seed), 0);
  assert.equal(cache.get(hash), "He sat down.");
  assert.equal(cache.get("a".repeat(32)), "A");
  assert.equal(cache.loadSeed({ ...seed, prompt: "old", translations: { ["b".repeat(32)]: "B" } }), 0);
  // The committed seed matches the current prompt, so the server can use it.
  const committed = readSeed();
  if (committed) {
    assert.equal(committed.prompt, PROMPT_VERSION);
    assert.ok(Object.keys(committed.translations).every((h) => /^[0-9a-f]{32}$/.test(h)));
  }
});

test("the cache lives next to the corpus store unless overridden, never inside it", () => {
  assert.equal(translationsPath({ XBOOK_DB: "/app/data/xbook.db" }), "/app/data/translations.db");
  assert.equal(translationsPath({ XBOOK_DB: "/app/data/xbook.db", XBOOK_TRANSLATIONS_DB: "/v/t.db" }), "/v/t.db");
});

test("the route: 400 for text, 503 without a key for misses, cached answers without one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-translate-"));
  const env = { XBOOK_TRANSLATIONS_DB: join(dir, "t.db") };
  const saved = process.env.XBOOK_TRANSLATIONS_DB;
  process.env.XBOOK_TRANSLATIONS_DB = env.XBOOK_TRANSLATIONS_DB;
  try {
    const store = fixture();
    const handle = translateHandler(env);
    const signal = new AbortController().signal;
    assert.equal((await handle(store, { text: "Переведи" }, "ip", signal)).status, 400);
    assert.equal((await handle(null, { refs: ["l:pv-x:1:2"] }, "ip", signal)).status, 404);
    const miss = await handle(store, { refs: ["l:pv-x:1:2"] }, "ip", signal);
    assert.equal(miss.status, 503);
    assert.match((miss.body as { error: string }).error, /not configured/);
    store.close();
  } finally {
    if (saved == null) delete process.env.XBOOK_TRANSLATIONS_DB;
    else process.env.XBOOK_TRANSLATIONS_DB = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("page refs: the reader's page, cut along its stored sentence spans, alone in a request", () => {
  const store = fixture();
  assert.deepEqual(refsInput({ refs: ["p:pv-x:1"] }), { value: ["p:pv-x:1"] });
  assert.ok("error" in refsInput({ refs: ["p:pv-x:1", "l:pv-x:1:2"] }));
  assert.ok("error" in refsInput({ refs: ["p:pv-x:1", "p:pv-x:2"] }));
  const got = resolveRefs(store, ["p:pv-x:1", "p:pv-x:3", "p:pv-y:1"]);
  const page = corpusPage(store, "pv-x", 1)!;
  assert.deepEqual(got.get("p:pv-x:1"), page.sentences!.spans.map(([a, b]) => page.text.slice(a, b).trim()));
  assert.deepEqual(got.get("p:pv-x:1"), ["Он вошёл в комнату.", "Страшная тень метнулась к окну и исчезла.", "Он сел."]);
  assert.deepEqual([...got.keys()], ["p:pv-x:1"]);
  store.close();
});

test("a page is translated sentence-aligned in one call, sharing cache entries with Lines sentences", async () => {
  const store = fixture();
  const cache = new TranslationCache(":memory:");
  const { fetcher, calls } = fakeRouter();
  // The Lines tab already translated the middle sentence: only the other two go to the model.
  await translateRefs(store, ["l:pv-x:1:2"], cache, { apiKey: "k", fetcher });
  const out = await translateRefs(store, ["p:pv-x:1"], cache, { apiKey: "k", fetcher });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].ids, ["1", "2"]);
  assert.deepEqual(out.pages!["p:pv-x:1"], ["EN(Он вошёл в комнату.)", "EN(Страшная тень метнулась к окну и исчезла.)", "EN(Он сел.)"]);
  assert.deepEqual(out.translations, {});
  // An answer with one sentence too few or too many is refused, never shown shifted.
  const two = ["А.", "Б."];
  const answer = (items: object[]) => ({ choices: [{ message: { content: JSON.stringify({ items }) } }] });
  assert.throws(() => parseTranslations(answer([{ id: "1", en: "A." }]), two, "m"), /incomplete/);
  assert.throws(() => parseTranslations(answer([{ id: "1", en: "A." }, { id: "2", en: "B." }, { id: "3", en: "C." }]), two, "m"), /incomplete/);
  assert.deepEqual(parseTranslations(answer([{ id: "2", en: "B." }, { id: "1", en: "A." }]), two, "m").texts, ["A.", "B."]);
  store.close();
});

test("page cap: 10 different pages per address per rolling day, cached pages count, the same page again is free", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-pagecap-"));
  const saved = process.env.XBOOK_TRANSLATIONS_DB;
  process.env.XBOOK_TRANSLATIONS_DB = join(dir, "t.db");
  try {
    const store = openStore(":memory:");
    const pages = Array.from({ length: PAGE_LIMIT + 2 }, (_, i) => `Страница номер ${i + 1}. Вторая строка.\n`);
    const text = pages.join("");
    let at = 0;
    store.addBook(
      { id: "pv-z", source: "pelevin", sourceRef: "h", title: "Зет", author: "П", rank: 1, chars: text.length, pageChars: 40, pages: pages.length, year: 2000, kind: "story", titleEn: "Z" },
      text,
      pages.map((p) => ({ start: at, end: (at += p.length) })),
    );
    pages.forEach((_, i) => store.putAnalysis("pv-z", i, page({ joy: 0.5 })));
    const segments = store.segments("pv-z");
    store.putSentences("pv-z", segments.flatMap((s) => splitSentences(text.slice(s.start, s.end)).map((x) => ({ page: s.idx, start: s.start + x.start, end: s.start + x.end }))));
    // Someone else translated every page before: serving them from the cache still counts.
    const tc = translationCache();
    for (const [i] of pages.entries()) tc.put(sourceHash(`Страница номер ${i + 1}.`), `Page ${i + 1}.`, "m");
    tc.put(sourceHash("Вторая строка."), "Second line.", "m");
    let clock = 1_000_000;
    const handle = translateHandler({}, () => clock);
    const ask = (n: number, ip = "1.2.3.4") => handle(store, { refs: [`p:pv-z:${n}`] }, ip, new AbortController().signal);
    assert.equal(pageQuotaFor("1.2.3.4", clock).remaining, PAGE_LIMIT);
    for (let n = 1; n <= PAGE_LIMIT; n++) {
      const out = await ask(n);
      assert.equal(out.status, 200);
      assert.equal((out.body as { remaining: number }).remaining, PAGE_LIMIT - n);
    }
    const again = await ask(3);
    assert.equal(again.status, 200, "a page already counted is free");
    assert.deepEqual((again.body as { pages: Record<string, string[]> }).pages["p:pv-z:3"], ["Page 3.", "Second line."]);
    const over = await ask(PAGE_LIMIT + 1);
    assert.equal(over.status, 429);
    assert.equal((over.body as { remaining: number }).remaining, 0);
    assert.equal((await ask(PAGE_LIMIT + 1, "5.6.7.8")).status, 200, "other addresses have their own cap");
    // The window rolls: a day after the first pages, they free up.
    clock += PAGE_WINDOW_MS + 1;
    assert.equal(pageQuotaFor("1.2.3.4", clock).remaining, PAGE_LIMIT);
    assert.equal((await ask(PAGE_LIMIT + 1)).status, 200);
    // Quotes never touch the page cap.
    assert.equal((await handle(store, { refs: ["l:pv-z:1:1"] }, "9.9.9.9", new AbortController().signal)).body.remaining, undefined);
    store.close();
  } finally {
    if (saved == null) delete process.env.XBOOK_TRANSLATIONS_DB;
    else process.env.XBOOK_TRANSLATIONS_DB = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});
