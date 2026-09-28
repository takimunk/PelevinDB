import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  handleContact,
  jevCost,
  looksLikeContact,
  messageInput,
  messagesPath,
  MessageStore,
  MODERATION,
  riverQuestions,
  riverText,
  RIVER_CHARS,
  riverTtlHours,
  scoreRiverNote,
} from "../server/messages.ts";
import { rateLimiter } from "../server/corpus.ts";
import { BudgetStore, JEV_MODEL, meteredFetch } from "../server/budget.ts";
import { EMOTIONS, MOODS, THEMES } from "../shared/catalog.ts";

const ORIGIN = "http://127.0.0.1:5173";
const allowAll = () => ({ ok: true }) as const;

test("return addresses: email, Telegram handle or link, phone; anything else is refused", () => {
  for (const ok of ["a@b.co", " name.surname+x@mail.example.org ", "@pelevin_reader", "t.me/pelevin_reader", "https://t.me/someone1", "+7 (912) 345-67-89", "89123456789"])
    assert.ok(looksLikeContact(ok), ok);
  for (const bad of ["hello", "a@b", "@ab", "123", "+1 2", "http://example.com", "@@user", "user@ mail.com"]) assert.ok(!looksLikeContact(bad), bad);
});

test("validation trims, strips control characters and enforces limits", () => {
  const ok = messageInput({ contact: "  a@b.co ", text: "  Hello\u0007 there \r\n ", name: "  Ivan   Petrov " });
  assert.deepEqual(ok, { value: { kind: "contact", contact: "a@b.co", name: "Ivan Petrov", text: "Hello there" } });
  assert.ok("error" in messageInput({ contact: "a@b.co", text: "   " }));
  assert.ok("error" in messageInput({ text: "no way to answer" }), "contact messages need a return address");
  assert.ok("error" in messageInput({ contact: "not a contact", text: "x" }));
  assert.ok("error" in messageInput({ contact: "a@b.co", text: "x".repeat(4001) }));
  assert.ok("error" in messageInput({ kind: "letter", contact: "a@b.co", text: "x" }));
  // River notes: the return address is optional, and the text is short.
  assert.ok("value" in messageInput({ kind: "river", text: "Река течёт." }));
  assert.ok("error" in messageInput({ kind: "river", text: "x".repeat(281) }));
  assert.ok("error" in messageInput({ kind: "river", text: "x", contact: "nope" }));
  assert.ok("error" in messageInput(null));
});

test("honeypot: a filled hidden field is answered as success and nothing is stored", () => {
  const store = new MessageStore(":memory:");
  const out = handleContact({ contact: "a@b.co", text: "buy now", website: "http://spam" }, { expectedOrigin: ORIGIN, allow: allowAll, store: () => store });
  assert.equal(out.status, 200);
  assert.equal(store.list().length, 0);
  store.close();
});

test("same-origin check and per-client rate limit", () => {
  const store = new MessageStore(":memory:");
  let now = 0;
  const limit = rateLimiter(2, 600_000, () => now);
  const send = (origin?: string) =>
    handleContact({ contact: "@reader_one", text: "A question about the map." }, { origin, expectedOrigin: ORIGIN, allow: () => limit("1.2.3.4"), store: () => store });
  assert.equal(send("https://evil.example").status, 403);
  assert.equal(send(ORIGIN).status, 200);
  assert.equal(send(undefined).status, 200);
  const blocked = send(ORIGIN);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.retryAfter! > 0);
  now = 600_001;
  assert.equal(send(ORIGIN).status, 200);
  assert.equal(store.list().length, 3);
  store.close();
});

test("the river shows only approved river notes, shortened, and never moderation data", () => {
  const store = new MessageStore(":memory:");
  const hidden = store.add({ kind: "river", contact: "", name: "", text: "not yet approved" });
  const shown = store.add({ kind: "river", contact: "", name: "", text: "слово ".repeat(60) });
  const contact = store.add({ kind: "contact", contact: "a@b.co", name: "", text: "private" });
  store.approve(shown);
  store.approve(contact); // approving a contact message must still never put it on the river
  for (let i = 0; i < 20; i++) {
    const sample = store.riverSample(6);
    assert.deepEqual(
      sample.map((n) => n.id),
      [shown],
    );
    assert.ok(sample[0].text.length <= RIVER_CHARS);
    assert.ok(sample[0].text.endsWith("…"));
    assert.deepEqual(Object.keys(sample[0]).sort(), ["emotion", "expiresAt", "id", "intensity", "text", "themes"]);
  }
  store.approve(shown, -1);
  assert.deepEqual(store.riverSample(), []);
  assert.ok(hidden > 0);
  store.close();
});

test("riverText keeps short notes and cuts long ones at a word", () => {
  assert.equal(riverText("  a  short\nnote "), "a short note");
  const cut = riverText("word ".repeat(50), 40);
  assert.ok(cut.length <= 40 && cut.endsWith("…") && !cut.includes("wor…"));
});

test("messages.db sits beside the corpus store unless named", () => {
  assert.equal(messagesPath({ XBOOK_DB: "/app/data/xbook.db" }), "/app/data/messages.db");
  assert.equal(messagesPath({ XBOOK_DB: "/app/data/xbook.db", XBOOK_MESSAGES_DB: "/vol/m.db" }), "/vol/m.db");
  assert.ok(messagesPath({}).endsWith("data/messages.db"));
});

// ---------------------------------------------------------------- Jev reading with a mocked TypeSafe

function jevReply(moderation: string, { sadness = 3, tokens = 3100 } = {}) {
  const answers: Record<string, unknown> = {};
  for (const e of EMOTIONS) answers[`emotion_${e.id}`] = { type: "score", score: e.id === "sadness" ? sadness : 1, confidence: 0.8 };
  for (const t of THEMES) answers[`theme_${t.id}`] = { type: "noul", noul: t.id === "memory" ? 0.9 : 0.1 };
  answers.mood = { type: "choice", choice: "melancholic", confidence: 0.7, probabilities: Object.fromEntries(MOODS.map((m) => [m.id, m.id === "melancholic" ? 0.8 : 0.02])) };
  answers.moderation = {
    type: "choice",
    choice: moderation,
    confidence: 0.9,
    probabilities: Object.fromEntries(MODERATION.map((m) => [m.id, m.id === moderation ? 0.92 : 0.02])),
  };
  return Response.json({ model: JEV_MODEL, answers, usage: { input_tokens: tokens } });
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "xbook-messages-"));
  const store = new MessageStore(join(dir, "messages.db"));
  const ledger = new BudgetStore(join(dir, "spending.db"));
  const calls: unknown[] = [];
  const through = (reply: () => Response | Promise<Response>) =>
    meteredFetch("typesafe", () => ledger, async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return reply();
    });
  const note = (text = "Я сидел у реки и вспоминал отца.") => store.add({ kind: "river", contact: "", name: "", text });
  const done = () => {
    store.close();
    ledger.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { store, ledger, calls, through, note, done };
}

test("one Jev request per note: page wording for emotions, mood and themes, plus moderation", () => {
  const ids = Object.keys(riverQuestions);
  assert.equal(ids.length, EMOTIONS.length + THEMES.length + 2);
  assert.ok(ids.includes("mood") && ids.includes("moderation") && ids.includes("emotion_joy") && ids.includes("theme_love"));
  assert.ok(!ids.some((id) => id.startsWith("texture_") || id === "mode"));
});

test("Jev says ok: the note is scored, approved, charged through the ledger, and the river gets its leading emotion", async () => {
  const t = setup();
  const id = t.note();
  const outcome = await scoreRiverNote(t.store, id, "Я сидел у реки и вспоминал отца.", { apiKey: "k", dailyLimit: 5, fetcher: t.through(() => jevReply("ok")) });
  assert.equal(outcome, "approved");
  assert.equal(t.calls.length, 1);
  assert.deepEqual((t.calls[0] as { state: unknown }).state, { passage: "Я сидел у реки и вспоминал отца." });
  const m = t.store.get(id)!;
  assert.ok(m.approved);
  assert.equal(m.score!.emotions.sadness, 0.75);
  assert.equal(m.score!.tokens, 3100);
  assert.ok(Math.abs(t.ledger.summary("typesafe").used - jevCost(3100)) < 1e-6);
  const [river] = t.store.riverSample();
  assert.deepEqual(river, { id, text: "Я сидел у реки и вспоминал отца.", emotion: "sadness", intensity: 0.75, themes: ["memory"], expiresAt: t.store.get(id)!.expiresAt });
  t.done();
});

test("Jev flags the note: it is scored but stays off the river", async () => {
  const t = setup();
  for (const label of ["spam", "abuse", "personal", "nonsense"]) {
    const id = t.note();
    assert.equal(await scoreRiverNote(t.store, id, "x", { apiKey: "k", dailyLimit: 50, fetcher: t.through(() => jevReply(label)) }), "held");
    const m = t.store.get(id)!;
    assert.ok(!m.approved && m.score?.moderation.choice === label);
  }
  assert.deepEqual(t.store.riverSample(), []);
  t.done();
});

test("a note rejected by hand stays rejected even when Jev says ok; one approved by hand stays approved when flagged", async () => {
  const t = setup();
  const a = t.note();
  const b = t.note();
  t.store.approve(a, -1);
  t.store.approve(b, 1);
  await scoreRiverNote(t.store, a, "x", { apiKey: "k", dailyLimit: 5, fetcher: t.through(() => jevReply("ok")) });
  await scoreRiverNote(t.store, b, "x", { apiKey: "k", dailyLimit: 5, fetcher: t.through(() => jevReply("spam")) });
  assert.ok(t.store.get(a)!.rejected && !t.store.get(a)!.approved);
  assert.ok(t.store.get(b)!.approved);
  t.done();
});

test("Jev unavailable: the note stays unscored and unapproved, and scoring never throws", async () => {
  const t = setup();
  const id = t.note();
  const opts = { apiKey: "k", dailyLimit: 50 };
  assert.equal(await scoreRiverNote(t.store, id, "x", { ...opts, fetcher: t.through(() => new Response("down", { status: 500 })) }), "failed");
  assert.equal(await scoreRiverNote(t.store, id, "x", { ...opts, fetcher: t.through(() => Response.json({ model: JEV_MODEL, answers: {} })) }), "failed");
  assert.equal(await scoreRiverNote(t.store, id, "x", { ...opts, fetcher: t.through(() => Promise.reject(new Error("offline"))) }), "failed");
  assert.equal(await scoreRiverNote(t.store, id, "x", { dailyLimit: 50, apiKey: "" }), "skipped");
  const m = t.store.get(id)!;
  assert.ok(!m.approved && m.score === null);
  assert.deepEqual(t.store.unscored().map((n) => n.id), [id]);
  t.done();
});

test("budget exhausted: the ledger refuses the call and the note waits", async () => {
  const t = setup();
  t.ledger.reserve("typesafe", 10_000_000);
  const id = t.note();
  assert.equal(await scoreRiverNote(t.store, id, "x", { apiKey: "k", dailyLimit: 5, fetcher: t.through(() => jevReply("ok")) }), "failed");
  assert.equal(t.calls.length, 0);
  assert.ok(!t.store.get(id)!.approved);
  t.done();
});

test("daily cap: calls stop at the limit and resume the next UTC day", async () => {
  const t = setup();
  const day1 = new Date("2026-09-29T10:00:00Z");
  const fetcher = t.through(() => jevReply("ok"));
  const outcomes = [];
  for (let i = 0; i < 4; i++) outcomes.push(await scoreRiverNote(t.store, t.note(), "x", { apiKey: "k", dailyLimit: 3, fetcher, now: day1 }));
  assert.deepEqual(outcomes, ["approved", "approved", "approved", "capped"]);
  assert.equal(t.calls.length, 3);
  assert.equal(await scoreRiverNote(t.store, t.note(), "x", { apiKey: "k", dailyLimit: 0, fetcher }), "skipped");
  assert.equal(await scoreRiverNote(t.store, t.note(), "x", { apiKey: "k", dailyLimit: 3, fetcher, now: new Date("2026-09-30T00:00:01Z") }), "approved");
  assert.deepEqual(
    t.store.jevDays().map((d) => [d.day, d.calls, d.tokens]),
    [
      ["2026-09-30", 1, 3100],
      ["2026-09-29", 3, 9300],
    ],
  );
  t.done();
});

test("POST flow: a saved river note triggers the reading, a contact message does not", () => {
  const store = new MessageStore(":memory:");
  const saved: string[] = [];
  const opts = { expectedOrigin: ORIGIN, allow: allowAll, store: () => store, onSaved: (_id: number, m: { kind: string }) => saved.push(m.kind) };
  handleContact({ kind: "river", text: "Вода." }, opts);
  handleContact({ contact: "a@b.co", text: "Hi" }, opts);
  handleContact({ kind: "river", text: "" }, opts);
  assert.deepEqual(saved, ["river", "contact"]); // the route itself skips contact messages
  store.close();
});

test("river notes expire from the river after RIVER_TTL_HOURS but are never deleted", () => {
  const store = new MessageStore(":memory:");
  const sent = new Date("2026-09-29T10:00:00Z");
  const a = store.add({ kind: "river", contact: "", name: "", text: "old" }, sent, 24);
  const b = store.add({ kind: "river", contact: "", name: "", text: "short" }, sent, 1);
  store.approve(a);
  store.approve(b);
  assert.equal(store.get(a)!.expiresAt, "2026-09-30T10:00:00.000Z");
  assert.deepEqual(store.riverSample(10, new Date("2026-09-29T10:30:00Z")).map((n) => n.id).sort(), [a, b]);
  assert.deepEqual(store.riverSample(10, new Date("2026-09-29T12:00:00Z")).map((n) => n.id), [a]);
  assert.deepEqual(store.riverSample(10, new Date("2026-09-30T10:00:01Z")), []);
  assert.equal(store.list().length, 2, "expired notes stay in the file");
  assert.equal(riverTtlHours({}), 24);
  assert.equal(riverTtlHours({ RIVER_TTL_HOURS: "6" }), 6);
  assert.equal(riverTtlHours({ RIVER_TTL_HOURS: "nope" }), 24);
  store.close();
});

test("the sender gets a token for their river note and can read its emotion, not its moderation", () => {
  const store = new MessageStore(":memory:");
  const out = handleContact({ kind: "river", text: "Вода." }, { expectedOrigin: ORIGIN, allow: allowAll, store: () => store });
  const token = out.body.token as string;
  assert.match(token, /^[0-9a-f-]{36}$/);
  assert.ok(typeof out.body.expiresAt === "string");
  const unread = store.reading(token)!;
  assert.deepEqual({ emotion: unread.emotion, themes: unread.themes }, { emotion: null, themes: [] });
  assert.equal(store.reading("00000000-0000-0000-0000-000000000000"), null);
  assert.equal(store.reading(token, new Date(Date.now() + 25 * 3_600_000)), null, "expired");
  assert.ok(!("moderation" in unread));
  const contact = handleContact({ contact: "a@b.co", text: "Hi" }, { expectedOrigin: ORIGIN, allow: allowAll, store: () => store });
  assert.deepEqual(contact.body, { ok: true }, "contact messages get no token");
  store.close();
});
