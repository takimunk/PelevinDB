import assert from "node:assert/strict";
import { test } from "node:test";
import { noticeText, notifyTelegram } from "../server/telegram.ts";

const note = { id: 7, kind: "contact" as const, contact: "@reader", name: "", text: "Hello <b>there</b>" };

test("messages are forwarded as plain text with the reply address", async () => {
  let sent: { url: string; body: { chat_id: string; text: string; parse_mode?: string } } | undefined;
  const fetcher = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return Response.json({ ok: true });
  }) as typeof fetch;
  assert.equal(await notifyTelegram(note, { env: { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42" }, fetcher }), "sent");
  assert.equal(sent!.url, "https://api.telegram.org/bott/sendMessage");
  assert.equal(sent!.body.chat_id, "42");
  assert.equal(sent!.body.parse_mode, undefined);
  assert.match(sent!.body.text, /Message #7\nreply to: @reader\n\nHello <b>there<\/b>/);
});

test("without a token or chat nothing is sent", async () => {
  const fetcher = (async () => assert.fail("must not call Telegram")) as typeof fetch;
  assert.equal(await notifyTelegram(note, { env: {}, fetcher }), "skipped");
});

test("a rejected token is not retried and never throws", async () => {
  let calls = 0;
  const fetcher = (async () => (calls++, new Response("", { status: 401 }))) as typeof fetch;
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await notifyTelegram(note, { env: { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "42" }, fetcher }), "failed");
  } finally {
    console.warn = warn;
  }
  assert.equal(calls, 1);
});

test("river notes carry the verdict and the approve command; long text is cut", () => {
  const text = noticeText({ ...note, kind: "river", contact: "", verdict: "held", emotion: "fear", text: "x".repeat(5000) });
  assert.match(text, /^River note #7\njev: held · fear\n/);
  assert.match(text, /…$/);
  assert.ok(text.length <= 4000);
  assert.doesNotMatch(noticeText({ ...note, kind: "river", contact: "", text: "hi" }), /reply to/);
});
