import { BudgetError, budgetStore } from "./budget.ts";
import express, { type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_BRIEF_MODEL, writeBrief } from "./brief.ts";
import { AnalysisError, analyzeProfile, analyzeSegment } from "./jev.ts";
import { corpusETag, corpusList, corpusStore, fullTextEnabled, packCorpusBook, pageResponse, rateLimiter, type Encoding } from "./corpus.ts";
import { localMode } from "./mode.ts";
import { handleContact, messageStore, scoreRiverNote } from "./messages.ts";
import { notifyTelegram } from "./telegram.ts";
import { corpusStats, topPages, topPagesStamp } from "./stats.ts";
import { pagesETag, pagesQuery, queryPages } from "./pages.ts";
import { linesETag, linesQuery, peek, queryLines } from "./sentences.ts";
import { pageQuotaFor, translateHandler } from "./translate.ts";
import { FOCUS, FOCUS_RUBRIC, RUBRIC_VERSION, type FocusId } from "../shared/catalog.ts";
import { createHash as hashOf } from "node:crypto";
import { briefInput, corpusId, excerptsInput, pageInput, pageNumber, type Parsed } from "./validate.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const MAX_ACTIVE = 6;

const app = express();
app.disable("x-powered-by");
// In production the container is reachable only through the Coolify proxy (Traefik), one hop: without this every
// visitor shares the proxy's address, and so every per-IP limit. TRUST_PROXY overrides the hop count (0 turns it off).
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? 1 : 0)));
app.use(express.json({ limit: "96kb" }));

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "ok", revision: process.env.APP_REVISION || "unknown" });
});

app.get("/api/analytics-config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    clientId: process.env.OPENPANEL_CLIENT_ID || null,
    apiUrl: process.env.OPENPANEL_API_URL || "https://api.openpanel.dev",
  });
});

app.get("/api/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const budgets = { typesafe: budgetStore().summary("typesafe"), openrouter: budgetStore().summary("openrouter") };
    const local = localMode();
    res.json({
      localMode: local,
      configured: local && !!process.env.TYPESAFE_API_KEY && budgets.typesafe.remaining > 0,
      brief: local && !!process.env.OPENROUTER_API_KEY && budgets.openrouter.remaining > 0,
      budgets,
    });
  } catch {
    res.status(503).json({ localMode: localMode(), configured: false, brief: false, error: "Spending protection is unavailable. Analysis is paused." });
  }
});

let active = 0;

/** Wraps a paid upstream call: same-origin check, key presence, validation, concurrency and client aborts. */
function guardedRoute<T>(
  keyName: "TYPESAFE_API_KEY" | "OPENROUTER_API_KEY",
  validate: (body: unknown) => Parsed<T>,
  run: (input: T, key: string, signal: AbortSignal) => Promise<unknown>,
) {
  return async (req: Request, res: Response) => {
    // Paid routes exist only for your own uploads, which only local mode offers.
    if (!localMode()) {
      res.status(404).json({ error: "Not available on the public site." });
      return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== (process.env.APP_ORIGIN || `${req.protocol}://${req.headers.host}`)) {
      res.status(403).json({ error: "Request origin not allowed." });
      return;
    }
    const key = process.env[keyName];
    if (!key) {
      res.status(503).json({ error: `Add ${keyName} to .env and restart the server.` });
      return;
    }
    const input = validate(req.body);
    if ("error" in input) {
      res.status(400).json({ error: input.error });
      return;
    }
    if (active >= MAX_ACTIVE) {
      res.status(429).json({ error: "The server is busy. Analysis will resume automatically." });
      return;
    }
    active++;
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      res.json(await run(input.value, key, controller.signal));
    } catch (error) {
      if (!res.destroyed)
        res.status((error instanceof AnalysisError || error instanceof BudgetError) ? error.status : 502).json({
          error:
            (error instanceof AnalysisError || error instanceof BudgetError)
              ? error.message
              : "The model did not respond. Finished work is saved; try again.",
        });
    } finally {
      active--;
    }
  };
}

app.post(
  "/api/analyze",
  guardedRoute(
    "TYPESAFE_API_KEY",
    pageInput,
    (text, key, signal) => analyzeSegment(text, key, signal),
  ),
);

app.post(
  "/api/profile",
  guardedRoute(
    "TYPESAFE_API_KEY",
    excerptsInput,
    (excerpts, key, signal) => analyzeProfile(excerpts, key, signal),
  ),
);

app.post(
  "/api/brief",
  guardedRoute("OPENROUTER_API_KEY", briefInput, ({ dossier, lang }, key, signal) =>
    writeBrief(dossier, key, process.env.OPENROUTER_MODEL || DEFAULT_BRIEF_MODEL, signal, { lang }),
  ),
);

app.get("/api/corpus", (_req, res) => {
  const store = corpusStore();
  res.set("Cache-Control", "no-cache");
  res.json({ available: !!store, books: store ? corpusList(store) : [] });
});

app.get("/api/corpus-stats", (_req, res) => {
  const store = corpusStore();
  if (!store) {
    res.status(404).json({ error: "No corpus yet: run npm run corpus." });
    return;
  }
  res.set("Cache-Control", "no-cache");
  res.json(corpusStats(store));
});

// The home page showcase: the strongest pages per emotion, one short quote each. Registered before /api/corpus/:id.
app.get("/api/corpus/top-pages", (req, res) => {
  const store = corpusStore();
  if (!store) {
    res.status(404).json({ error: "No corpus yet: run npm run corpus." });
    return;
  }
  const per = Math.max(1, Math.min(10, Number(req.query.per) || 3));
  res.set({ "Cache-Control": "no-cache", ETag: `W/"${hashOf("sha1").update(topPagesStamp(store, per)).digest("base64url")}"` });
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  res.json(topPages(store, per));
});

// Page navigation across the corpus: one sentence per row, 25 rows per result page, at most 5 result pages.
const pagesLimit = rateLimiter(Number(process.env.CORPUS_QUERIES_PER_MINUTE) || 120);
app.get("/api/corpus/pages", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const parsed = pagesQuery(req.query as Record<string, unknown>);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const limit = pagesLimit(req.ip || "unknown");
  if (!limit.ok) {
    res.set("Retry-After", String(limit.retryAfter)).status(429).json({ error: "Too many searches at once. Try again in a minute." });
    return;
  }
  const store = corpusStore();
  if (!store) {
    res.status(404).json({ error: "No corpus yet: run npm run corpus." });
    return;
  }
  res.set("ETag", pagesETag(store, parsed.query));
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  res.json(queryPages(store, parsed.query));
});

// The strongest sentences of the corpus per focus dimension: one sentence per row, the same caps as pages.
app.get("/api/corpus/lines", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const parsed = linesQuery(req.query as Record<string, unknown>);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const limit = pagesLimit(req.ip || "unknown");
  if (!limit.ok) {
    res.set("Retry-After", String(limit.retryAfter)).status(429).json({ error: "Too many searches at once. Try again in a minute." });
    return;
  }
  const store = corpusStore();
  if (!store) {
    res.status(404).json({ error: "No corpus yet: run npm run corpus." });
    return;
  }
  res.set("ETag", linesETag(store, parsed.query));
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  res.json(queryLines(store, parsed.query));
});

// One page of full text at a time: the book payload carries only excerpts, and this route is rate limited
// per client so it serves reading, not bulk download.
const pageLimit = rateLimiter(Number(process.env.CORPUS_PAGES_PER_MINUTE) || 60);
app.get("/api/corpus/:id/page/:n", (req, res) => {
  const out = pageResponse(corpusStore(), req.params.id, req.params.n, () => pageLimit(req.ip || "unknown"));
  res.set("Cache-Control", "no-cache");
  if (out.status === 429) res.set("Retry-After", String(out.retryAfter));
  if (out.status !== 200) {
    res.status(out.status).json(out.body);
    return;
  }
  res.set("ETag", out.etag);
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  res.json(out.body);
});

// One sentence of a page for chart previews: the sentence that carries the hovered dimension most. Charts ask as the
// pointer rests on a page, so the limit is looser than full pages; a response is one sentence.
const peekLimit = rateLimiter(Number(process.env.CORPUS_PEEKS_PER_MINUTE) || 300);
app.get("/api/corpus/:id/peek/:n", (req, res) => {
  res.set("Cache-Control", "no-cache");
  const id = corpusId(req.params.id);
  const n = pageNumber(req.params.n);
  const rawDim = typeof req.query.dim === "string" ? req.query.dim : null;
  if ("error" in id || "error" in n || (rawDim != null && !FOCUS.some((f) => f.id === rawDim))) {
    res.status(400).json({ error: "Expected a corpus book id, a page number from 1 and an optional focus dimension." });
    return;
  }
  const limit = peekLimit(req.ip || "unknown");
  if (!limit.ok) {
    res.set("Retry-After", String(limit.retryAfter)).status(429).json({ error: "Too many previews at once." });
    return;
  }
  const store = corpusStore();
  const stamp = store?.stamp(id.value, RUBRIC_VERSION);
  if (!store || stamp == null) {
    res.status(404).json({ error: "This book is not in the corpus." });
    return;
  }
  res.set("ETag", `W/"${hashOf("sha1").update(`peek3|${id.value}|${n.value}|${rawDim}|${stamp}|${store.stamp(id.value, FOCUS_RUBRIC)}`).digest("base64url")}"`);
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  const out = peek(store, id.value, n.value - 1, rawDim as FocusId | null);
  if (!out) {
    res.status(404).json({ error: "This page is not in the corpus." });
    return;
  }
  res.json(out);
});

// Russian → English quote translation, public: the client names quotes (showcase or Lines references), never sends
// text; answers come from a durable cache, and new ones are rate limited and charged to the OpenRouter ledger.
const translate = translateHandler();
app.get("/api/corpus/translate/quota", (req, res) => {
  res.set("Cache-Control", "no-store").json(pageQuotaFor(req.ip || "unknown"));
});
app.post("/api/corpus/translate", async (req, res) => {
  // A reader who leaves mid-call does not abort it: the answer is paid for either way, so it is finished and cached
  // (an aborted call would also keep its whole ledger reservation).
  const out = await translate(corpusStore(), req.body, req.ip || "unknown", new AbortController().signal);
  res.set("Cache-Control", "no-store");
  if (out.retryAfter) res.set("Retry-After", String(out.retryAfter));
  if (!res.destroyed) res.status(out.status).json(out.body);
});

app.get("/api/corpus/:id", async (req, res) => {
  const id = corpusId(req.params.id);
  if ("error" in id) {
    res.status(400).json({ error: id.error });
    return;
  }
  const store = corpusStore();
  const etag = store && corpusETag(store, id.value);
  if (!store || !etag) {
    res.status(404).json({ error: store ? "This book is not in the corpus." : "No corpus yet: run npm run corpus." });
    return;
  }
  res.set({ ETag: etag, "Cache-Control": "no-cache", Vary: "Accept-Encoding" });
  if (req.fresh) {
    res.status(304).end();
    return;
  }
  const encoding = (req.acceptsEncodings("br", "gzip") || "identity") as Encoding;
  try {
    const body = await packCorpusBook(store, id.value, etag, encoding);
    if (!body) {
      res.status(404).json({ error: "This book is not in the corpus." });
      return;
    }
    if (encoding !== "identity") res.set("Content-Encoding", encoding);
    res.type("json").send(body);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: "Could not read the book from the corpus." });
  }
});

// The map atlas can live next to the store (e.g. on the persistent volume the corpus script writes to):
// XBOOK_ATLAS serves that file instead of the one baked into public/.
const atlasFile = process.env.XBOOK_ATLAS ? path.resolve(process.env.XBOOK_ATLAS) : null;
if (atlasFile)
  app.get("/atlas.json", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(atlasFile, (error) => {
      if (error && !res.headersSent) res.status(404).json({ books: [] });
    });
  });

// Messages from readers (the contact form and notes to the river), stored in messages.db beside the corpus.
// Per client, and a ceiling for everyone together so the file cannot be flooded.
const contactLimit = rateLimiter(Number(process.env.CONTACT_PER_TEN_MINUTES) || 8, 600_000);
const contactCeiling = rateLimiter(Number(process.env.CONTACT_PER_HOUR_TOTAL) || 300, 3_600_000);
let riverScoring = 0; // Jev readings in flight; beyond two, notes wait for `npm run messages -- --score`.
app.post("/api/contact", (req, res) => {
  res.set("Cache-Control", "no-store");
  const out = handleContact(req.body, {
    origin: req.headers.origin,
    expectedOrigin: process.env.APP_ORIGIN || `${req.protocol}://${req.headers.host}`,
    allow: () => {
      const own = contactLimit(req.ip || "unknown");
      return own.ok ? contactCeiling("all") : own;
    },
    store: messageStore,
    // Every message is forwarded to the owner on Telegram. River notes are read by Jev first (moderation and
    // emotions), so the forward carries the verdict; the reply to the reader never waits for either.
    onSaved: (id, m) => {
      if (m.kind !== "river") return void notifyTelegram({ ...m, id });
      if (riverScoring >= 2) return void notifyTelegram({ ...m, id, verdict: "not read yet (busy)" });
      riverScoring++;
      void scoreRiverNote(messageStore(), id, m.text)
        .then((verdict) => {
          const emotions = messageStore().get(id)?.score?.emotions;
          const emotion = emotions ? Object.entries(emotions).sort((a, b) => b[1] - a[1])[0][0] : null;
          return notifyTelegram({ ...m, id, verdict, emotion });
        })
        .finally(() => riverScoring--);
    },
  });
  if (out.retryAfter) res.set("Retry-After", String(out.retryAfter));
  res.status(out.status).json(out.body);
});

// A few approved river notes, in random order, for the Ural scene to surface now and then.
const riverLimit = rateLimiter(Number(process.env.RIVER_PER_MINUTE) || 30);
app.get("/api/river", (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!riverLimit(req.ip || "unknown").ok) {
    res.status(429).json({ notes: [] });
    return;
  }
  try {
    res.json({ notes: messageStore().riverSample(12) });
  } catch {
    res.json({ notes: [] });
  }
});

// How Jev read the visitor's own note, by the token POST /api/contact gave them: emotion only, never moderation.
app.get("/api/river/note/:token", (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!/^[0-9a-f-]{36}$/.test(req.params.token) || !riverLimit(req.ip || "unknown").ok) {
    res.status(404).json({ error: "No such note." });
    return;
  }
  try {
    const reading = messageStore().reading(req.params.token);
    if (reading) res.json(reading);
    else res.status(404).json({ error: "No such note." });
  } catch {
    res.status(404).json({ error: "No such note." });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Unknown API endpoint." });
});

app.use(
  (error: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
    if (error) res.status(400).json({ error: "Malformed or oversized request." });
    else next();
  },
);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(root, "dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => console.log(`xbook running at http://${host}:${port} · corpus text: ${fullTextEnabled() ? "full (CORPUS_FULL_TEXT=1)" : "excerpts only"}`));
