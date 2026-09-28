import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  BudgetStore,
  BudgetError,
  JEV_MODEL,
  meteredFetch,
} from "../server/budget.ts";
const request = {
  method: "POST",
  body: JSON.stringify({ model: JEV_MODEL, state: "test", questions: {} }),
};
const endpoint = "https://api.typesafe.ai/v1/systemone";
const ok = (tokens = 1000) =>
  Response.json({ model: JEV_MODEL, usage: { input_tokens: tokens } });

test("cap survives reopening; reservations count before billing and providers are separate", () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-budget-")),
    file = join(dir, "budget.db");
  let ledger = new BudgetStore(file);
  const id = ledger.reserve("typesafe", 6_000_000);
  assert.throws(() => ledger.reserve("typesafe", 5_000_000), BudgetError);
  ledger.reserve("openrouter", 10_000_000);
  ledger.settle(id, 2);
  ledger.settle(id, 0); // Double settlement cannot refund spending.
  ledger.close();
  ledger = new BudgetStore(file);
  assert.equal(ledger.summary("typesafe").used, 2);
  ledger.reserve("typesafe", 8_000_000);
  assert.throws(() => ledger.reserve("typesafe", 1), BudgetError);
  assert.throws(() => ledger.reserve("openrouter", 1), BudgetError);
  ledger.close();
  rmSync(dir, { recursive: true, force: true });
});
test("concurrent processes cannot oversubscribe one persistent budget", async () => {
  const dir = mkdtempSync(join(tmpdir(), "xbook-budget-")),
    file = join(dir, "budget.db");
  const store = new BudgetStore(file);
  const moduleURL = new URL("../server/budget.ts", import.meta.url).href;
  const results = await Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise<number>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              `import {BudgetStore,BudgetError} from ${JSON.stringify(moduleURL)}; const s=new BudgetStore(${JSON.stringify(file)}); try {s.reserve('typesafe',2_000_000)} catch(e) {process.exitCode=e instanceof BudgetError?2:3} finally {s.close()}`,
            ],
            { stdio: "ignore" },
          );
          child.on("error", reject);
          child.on("exit", (code) => resolve(code ?? 99));
        }),
    ),
  );
  assert.equal(results.filter((n) => n === 0).length, 5);
  assert.equal(results.filter((n) => n === 2).length, 3);
  assert.equal(store.summary("typesafe").used, 10);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
test("failed, aborted and unaccountable calls retain their reservations", async () => {
  const store = new BudgetStore(":memory:");
  const fail = meteredFetch(
    "typesafe",
    () => store,
    async () => {
      throw new Error("connection lost");
    },
  );
  await assert.rejects(() => fail(endpoint, request));
  const first = store.summary("typesafe").used;
  assert.ok(first > 0);
  await meteredFetch(
    "typesafe",
    () => store,
    async () => new Response("broken", { status: 503 }),
  )(endpoint, request);
  await meteredFetch(
    "typesafe",
    () => store,
    async () => Response.json({ usage: {} }),
  )(endpoint, request);
  assert.equal(
    store.summary("typesafe").used,
    Math.round(first * 3 * 1e6) / 1e6,
  );
  const signal = AbortSignal.abort();
  await assert.rejects(() => fail(endpoint, { ...request, signal }));
  assert.equal(
    store.summary("typesafe").used,
    Math.round(first * 3 * 1e6) / 1e6,
  );
  store.close();
});
test("successful accounting refunds unused hold and exhausted budgets never call upstream", async () => {
  const store = new BudgetStore(":memory:");
  let calls = 0;
  const run = meteredFetch(
    "typesafe",
    () => store,
    async () => {
      calls++;
      return ok();
    },
  );
  await run(endpoint, request);
  assert.equal(store.summary("typesafe").used, 0.000042);
  store.reserve("typesafe", 9_999_958);
  await assert.rejects(() => run(endpoint, request), BudgetError);
  assert.equal(calls, 1);
  store.close();
});
test("unexpected excess cost blocks further spending and missing costs never mean zero", () => {
  const store = new BudgetStore(":memory:");
  const id = store.reserve("openrouter", 1_000_000);
  store.settle(id, NaN);
  assert.equal(store.summary("openrouter").used, 1);
  assert.throws(() => store.settle(id, 1.01), BudgetError);
  assert.equal(store.summary("openrouter").remaining, 0);
  store.close();
});
const micros = (n: number) => Math.ceil(n);
test("OpenRouter requests reserve the prompt bytes (capped by context), enforce price ceilings and settle actual cost", async () => {
  const store = new BudgetStore(":memory:");
  let calls = 0;
  const run = meteredFetch(
    "openrouter",
    () => store,
    async (input, init) => {
      if (String(input).endsWith("/models"))
        return Response.json({
          data: [
            {
              id: "test/brief",
              context_length: 100_000,
              pricing: { prompt: "0.0000005", completion: "0.000002" },
            },
          ],
        });
      calls++;
      assert.deepEqual(JSON.parse(String(init?.body)).provider.max_price, {
        prompt: 1,
        completion: 10,
        request: 0,
      });
      // 1,030 bytes of messages at the $1/M prompt ceiling + 2,000 output tokens at $10/M.
      assert.equal(store.summary("openrouter").reserved, micros(1030 + 20_000) / 1e6);
      return Response.json({ usage: { cost: 0.005 } });
    },
  );
  await run("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "test/brief", max_tokens: 2000, messages: [{ role: "user", content: "ж".repeat(500) }] }),
  });
  assert.equal(calls, 1);
  assert.equal(store.summary("openrouter").used, 0.005);
  await assert.rejects(
    () =>
      run("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "unknown", max_tokens: 2000 }),
      }),
    BudgetError,
  );
  assert.equal(calls, 1);
  store.close();
});
