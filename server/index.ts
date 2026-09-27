import { BudgetError, budgetStore } from "./budget.ts";
import express, { type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_BRIEF_MODEL, writeBrief } from "./brief.ts";
import { AnalysisError, analyzeProfile, analyzeSegment } from "./jev.ts";
import { corpusETag, corpusList, corpusStore, fullTextEnabled, packCorpusBook, pageResponse, rateLimiter, type Encoding } from "./corpus.ts";
import { localMode } from "./mode.ts";
import { corpusStats, topPages, topPagesStamp } from "./stats.ts";
import { createHash as hashOf } from "node:crypto";
import { briefInput, corpusId, excerptsInput, pageInput, type Parsed } from "./validate.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const MAX_ACTIVE = 6;

const app = express();
app.disable("x-powered-by");
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
