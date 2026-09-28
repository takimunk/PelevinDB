import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Provider = "typesafe" | "openrouter";
const LIMIT = 10_000_000; // Integer microdollars: $10 per provider.
export const JEV_MODEL = "jev-1.13.0";
const JEV_INPUT_LIMIT = 65_536;
const JEV_USD_PER_MILLION = 0.042;
export const ROUTER_MAX_PRICE = { prompt: 1, completion: 10, request: 0 };
export class BudgetError extends Error {
  status: number;
  constructor(message: string, status = 402) {
    super(message);
    this.status = status;
  }
}
const micros = (usd: number) => Math.ceil(usd * 1_000_000);

/** Reservations survive crashes and are never automatically refunded after an uncertain call. */
export class BudgetStore {
  db: DatabaseSync;
  readonly periodMode: "lifetime" | "monthly";
  constructor(file: string, periodMode: "lifetime" | "monthly" = "lifetime") {
    this.periodMode = periodMode;
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS spending (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL, period TEXT NOT NULL,
        reserved INTEGER NOT NULL CHECK(reserved >= 0), charged INTEGER NOT NULL CHECK(charged >= 0),
        settled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS spending_period ON spending(provider,period);
      CREATE TABLE IF NOT EXISTS budget_settings (id INTEGER PRIMARY KEY CHECK(id=1), period_mode TEXT NOT NULL);
    `);
    this.db
      .prepare("INSERT OR IGNORE INTO budget_settings VALUES (1, ?)")
      .run(periodMode);
    const saved = this.db
      .prepare("SELECT period_mode FROM budget_settings WHERE id=1")
      .get() as { period_mode: string };
    if (saved.period_mode !== periodMode)
      throw new Error(
        "Budget period cannot change without an explicit ledger migration",
      );
  }
  period(now = new Date()) {
    return this.periodMode === "monthly"
      ? now.toISOString().slice(0, 7)
      : "lifetime";
  }
  summary(provider: Provider, period = this.period()) {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(charged),0) AS charged, COALESCE(SUM(CASE WHEN settled=0 THEN charged ELSE 0 END),0) AS held FROM spending WHERE provider=? AND period=?",
      )
      .get(provider, period) as { charged: number; held: number };
    return {
      limit: 10,
      used: row.charged / 1e6,
      reserved: row.held / 1e6,
      remaining: Math.max(0, LIMIT - row.charged) / 1e6,
      period,
    };
  }
  reserve(provider: Provider, amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > LIMIT)
      throw new BudgetError(
        "This request exceeds the available analysis budget.",
      );
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const period = this.period();
      const row = this.db
        .prepare(
          "SELECT COALESCE(SUM(charged),0) AS total FROM spending WHERE provider=? AND period=?",
        )
        .get(provider, period) as { total: number };
      if (row.total + amount > LIMIT)
        throw new BudgetError(
          `${provider === "typesafe" ? "Page analysis" : "Book briefs"} has reached its $10 spending limit. Saved results remain available.`,
        );
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO spending (id,provider,period,reserved,charged,created_at) VALUES (?,?,?,?,?,?)",
        )
        .run(id, provider, period, amount, amount, new Date().toISOString());
      this.db.exec("COMMIT");
      return id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  settle(id: string, usd: number) {
    if (!Number.isFinite(usd) || usd < 0) return; // Missing/untrustworthy billing retains the full reservation.
    const amount = micros(usd);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare("SELECT reserved,settled FROM spending WHERE id=?")
        .get(id) as { reserved: number; settled: number } | undefined;
      if (!row || row.settled) {
        this.db.exec("COMMIT");
        return;
      }
      // An unexpected pricing contract change blocks further spending instead of silently allowing it.
      this.db
        .prepare("UPDATE spending SET charged=?,settled=1 WHERE id=?")
        .run(amount > row.reserved ? LIMIT : amount, id);
      this.db.exec("COMMIT");
      if (amount > row.reserved)
        throw new BudgetError(
          "Provider billing exceeded the approved request estimate. Further requests are blocked.",
          503,
        );
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
let store: BudgetStore | undefined;
export function budgetStore() {
  const mode = process.env.XBOOK_BUDGET_PERIOD || "lifetime";
  if (mode !== "lifetime" && mode !== "monthly")
    throw new Error("Invalid budget period");
  return (store ??= new BudgetStore(
    process.env.XBOOK_BUDGET_DB || resolve("data/spending.db"),
    mode,
  ));
}

type Catalog = {
  data: {
    id: string;
    context_length: number;
    pricing: Record<string, string>;
  }[];
};
let catalog: { expires: number; models: Catalog["data"] } | undefined;
async function routerContext(model: string, fetcher: typeof fetch) {
  if (!catalog || catalog.expires < Date.now()) {
    const response = await fetcher("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok)
      throw new BudgetError(
        "Cannot verify model pricing. Try again later.",
        503,
      );
    const body = (await response.json()) as Catalog;
    if (!Array.isArray(body.data))
      throw new BudgetError("Cannot verify model pricing.", 503);
    catalog = { expires: Date.now() + 60_000, models: body.data };
  }
  const entry = catalog.models.find((m) => m.id === model);
  if (
    !entry ||
    !Number.isSafeInteger(entry.context_length) ||
    entry.context_length <= 0
  )
    throw new BudgetError(
      "This brief model has no verified spending bound.",
      503,
    );
  for (const [kind, ceiling] of Object.entries(ROUTER_MAX_PRICE)) {
    const price = Number(
      entry.pricing[kind] ?? (kind === "request" ? "0" : undefined),
    );
    if (
      !Number.isFinite(price) ||
      price < 0 ||
      price > ceiling / (kind === "request" ? 1 : 1e6)
    )
      throw new BudgetError(
        "This brief model exceeds the approved price ceiling.",
        503,
      );
  }
  return entry.context_length;
}

/** One durable reservation per HTTP attempt, including retries. No keys or content enter the ledger. */
export function meteredFetch(
  provider: Provider,
  getStore = budgetStore,
  fetcher: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const expected =
      provider === "typesafe"
        ? "https://api.typesafe.ai/v1/systemone"
        : "https://openrouter.ai/api/v1/chat/completions";
    if (
      String(input) !== expected ||
      init?.method !== "POST" ||
      typeof init.body !== "string"
    )
      throw new BudgetError("Unmetered request refused.", 503);
    const body = JSON.parse(init.body);
    let reserve: number;
    if (provider === "typesafe") {
      if (body.model !== JEV_MODEL)
        throw new BudgetError("Unknown TypeSafe model pricing.", 503);
      reserve = micros((JEV_INPUT_LIMIT * JEV_USD_PER_MILLION) / 1e6);
    } else {
      const context = await routerContext(body.model, fetcher);
      if (body.max_tokens !== 2000 || body.stream || body.tools || body.plugins)
        throw new BudgetError("Unbounded brief request refused.", 503);
      body.provider = {
        ...body.provider,
        max_price: ROUTER_MAX_PRICE,
        require_parameters: true,
      };
      // Reserve a hard bound, not a guessed token count: no tokenizer emits more tokens than the prompt has UTF-8
      // bytes, and never more than the published context. Outputs are separately capped.
      const prompt = Math.min(context, Buffer.byteLength(JSON.stringify(body.messages ?? body)));
      reserve = micros(
        (prompt * ROUTER_MAX_PRICE.prompt +
          2000 * ROUTER_MAX_PRICE.completion) /
          1e6,
      );
    }
    init.signal?.throwIfAborted();
    const ledger = getStore();
    const id = ledger.reserve(provider, reserve);
    const response = await fetcher(input, {
      ...init,
      body: JSON.stringify(body),
      redirect: "error",
    });
    if (response.ok) {
      let raw:
        | { model?: string; usage?: { input_tokens?: number; cost?: number } }
        | undefined;
      try {
        raw = await response.clone().json();
      } catch {
        /* Keep reservation if the response cannot be accounted for. */
      }
      if (
        provider === "typesafe" &&
        raw?.model === JEV_MODEL &&
        Number.isSafeInteger(raw?.usage?.input_tokens) &&
        raw!.usage!.input_tokens! >= 0
      ) {
        ledger.settle(
          id,
          (raw!.usage!.input_tokens! * JEV_USD_PER_MILLION) / 1e6,
        );
      } else if (
        provider === "openrouter" &&
        typeof raw?.usage?.cost === "number"
      )
        ledger.settle(id, raw.usage.cost);
    }
    return response;
  };
}
