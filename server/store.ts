// Durable server-side store: one SQLite file (node:sqlite, no native deps).
// Raw Jev and LLM answers are the source of truth; fingerprints, maps and charts are derived in code.
// Plain SQL with JSON in TEXT columns, so the same schema moves to Postgres (JSONB) or libSQL unchanged.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BRIEF_LANGS, type BookBrief, type BookKind, type BookProfile, type BriefLang, type SegmentAnalysis } from "../shared/types.ts";

export const DEFAULT_DB = "data/xbook.db";

export const MIGRATIONS = [
  `CREATE TABLE books (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    source_ref  TEXT NOT NULL,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL,
    rank        INTEGER,
    chars       INTEGER NOT NULL,
    page_chars  INTEGER NOT NULL,
    pages       INTEGER NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (source, source_ref)
  ) STRICT;
  CREATE TABLE segments (
    book_id  TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    idx      INTEGER NOT NULL,
    start    INTEGER NOT NULL,
    end      INTEGER NOT NULL,
    PRIMARY KEY (book_id, idx)
  ) STRICT;
  CREATE TABLE analyses (
    book_id       TEXT NOT NULL,
    idx           INTEGER NOT NULL,
    rubric        TEXT NOT NULL,
    model         TEXT NOT NULL,
    answer        TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (book_id, idx, rubric),
    FOREIGN KEY (book_id, idx) REFERENCES segments(book_id, idx) ON DELETE CASCADE
  ) STRICT;
  CREATE TABLE profiles (
    book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    rubric        TEXT NOT NULL,
    model         TEXT NOT NULL,
    answer        TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (book_id, rubric)
  ) STRICT;
  CREATE TABLE briefs (
    book_id            TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    model              TEXT NOT NULL,
    answer             TEXT NOT NULL,
    prompt_tokens      INTEGER NOT NULL,
    completion_tokens  INTEGER NOT NULL,
    cost_usd           REAL NOT NULL,
    created_at         TEXT NOT NULL,
    PRIMARY KEY (book_id, created_at)
  ) STRICT;
  CREATE TABLE runs (
    id           INTEGER PRIMARY KEY,
    command      TEXT NOT NULL,
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    jev_tokens   INTEGER NOT NULL DEFAULT 0,
    brief_usd    REAL NOT NULL DEFAULT 0
  ) STRICT;`,
  // v2: bibliographic fields for the Pelevin corpus; `rank` holds chronological order.
  `ALTER TABLE books ADD COLUMN year INTEGER;
  ALTER TABLE books ADD COLUMN kind TEXT;
  ALTER TABLE books ADD COLUMN title_en TEXT;`,
  // v3: briefs per language. Rebuilt so the key includes the language; every earlier brief is English.
  `CREATE TABLE briefs_v3 (
    book_id            TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    lang               TEXT NOT NULL DEFAULT 'en',
    model              TEXT NOT NULL,
    answer             TEXT NOT NULL,
    prompt_tokens      INTEGER NOT NULL,
    completion_tokens  INTEGER NOT NULL,
    cost_usd           REAL NOT NULL,
    created_at         TEXT NOT NULL,
    PRIMARY KEY (book_id, lang, created_at)
  ) STRICT;
  INSERT INTO briefs_v3 (book_id, lang, model, answer, prompt_tokens, completion_tokens, cost_usd, created_at)
    SELECT book_id, 'en', model, answer, prompt_tokens, completion_tokens, cost_usd, created_at FROM briefs;
  DROP TABLE briefs;
  ALTER TABLE briefs_v3 RENAME TO briefs;`,
];

export type StoredBook = {
  id: string;
  source: "gutenberg" | "upload" | "pelevin";
  /** Gutenberg id for "gutenberg"; for "pelevin", a hash of the stored text (a changed text gets a new row). */
  sourceRef: string;
  title: string;
  author: string;
  rank: number | null;
  chars: number;
  pageChars: number;
  pages: number;
  /** First publication year (Pelevin corpus; null for older sources). */
  year?: number | null;
  kind?: BookKind | null;
  titleEn?: string | null;
};

/** `briefed`: a brief exists in every language of BRIEF_LANGS; `briefedLangs`: the languages that have one. */
export type BookProgress = StoredBook & { analysed: number; profiled: boolean; briefed: boolean; briefedLangs: BriefLang[] };

const BOOK_COLUMNS = "id, source, source_ref, title, author, rank, chars, page_chars, pages, year, kind, title_en";

const now = () => new Date().toISOString();

function briefState(raw: unknown) {
  const have = new Set(typeof raw === "string" ? raw.split(",") : []);
  const briefedLangs = BRIEF_LANGS.filter((l) => have.has(l));
  return { briefed: briefedLangs.length === BRIEF_LANGS.length, briefedLangs };
}

/** `readOnly` never creates or migrates the file, so the web server cannot touch what the corpus script writes. */
export function openStore(path = process.env.XBOOK_DB || DEFAULT_DB, { readOnly = false } = {}) {
  if (!readOnly && path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  db.exec(readOnly ? "PRAGMA busy_timeout = 5000;" : "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (readOnly && version !== MIGRATIONS.length) {
    db.close();
    throw new Error(`Store schema v${version} does not match v${MIGRATIONS.length}.`);
  }
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec("COMMIT");
  }

  const tx = <T>(work: () => T): T => {
    db.exec("BEGIN");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  const toBook = (r: Record<string, unknown>): StoredBook => ({
    id: String(r.id),
    source: r.source as StoredBook["source"],
    sourceRef: String(r.source_ref),
    title: String(r.title),
    author: String(r.author),
    rank: r.rank == null ? null : Number(r.rank),
    chars: Number(r.chars),
    pageChars: Number(r.page_chars),
    pages: Number(r.pages),
    year: r.year == null ? null : Number(r.year),
    kind: r.kind == null ? null : (String(r.kind) as BookKind),
    titleEn: r.title_en == null ? null : String(r.title_en),
  });

  const q = {
    book: db.prepare(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = ?`),
    books: db.prepare(`SELECT ${BOOK_COLUMNS} FROM books ORDER BY rank IS NULL, rank, title`),
    deleteBook: db.prepare("DELETE FROM books WHERE id = ?"),
    deleteAnswers: db.prepare("DELETE FROM analyses WHERE book_id = ?"),
    updateMeta: db.prepare("UPDATE books SET title = :title, title_en = :titleEn, year = :year, kind = :kind, rank = :rank WHERE id = :id"),
    text: db.prepare("SELECT text FROM books WHERE id = ?"),
    insertBook: db.prepare(
      `INSERT INTO books (id, source, source_ref, title, author, rank, chars, page_chars, pages, text, created_at, year, kind, title_en)
       VALUES (:id, :source, :sourceRef, :title, :author, :rank, :chars, :pageChars, :pages, :text, :at, :year, :kind, :titleEn)`,
    ),
    insertSegment: db.prepare("INSERT INTO segments (book_id, idx, start, end) VALUES (?, ?, ?, ?)"),
    segments: db.prepare("SELECT idx, start, end FROM segments WHERE book_id = ? ORDER BY idx"),
    putAnalysis: db.prepare(
      `INSERT OR REPLACE INTO analyses (book_id, idx, rubric, model, answer, input_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    analyses: db.prepare("SELECT idx, answer FROM analyses WHERE book_id = ? AND rubric = ?"),
    putProfile: db.prepare(`INSERT OR REPLACE INTO profiles (book_id, rubric, model, answer, input_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?)`),
    profile: db.prepare("SELECT answer FROM profiles WHERE book_id = ? AND rubric = ?"),
    putBrief: db.prepare(
      `INSERT INTO briefs (book_id, lang, model, answer, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    brief: db.prepare("SELECT answer FROM briefs WHERE book_id = ? AND lang = ? ORDER BY created_at DESC LIMIT 1"),
    progress: db.prepare(
      `SELECT b.id, b.source, b.source_ref, b.title, b.author, b.rank, b.chars, b.page_chars, b.pages, b.year, b.kind, b.title_en,
              (SELECT COUNT(*) FROM analyses a WHERE a.book_id = b.id AND a.rubric = :rubric) AS analysed,
              EXISTS (SELECT 1 FROM profiles p WHERE p.book_id = b.id AND p.rubric = :rubric) AS profiled,
              (SELECT GROUP_CONCAT(DISTINCT r.lang) FROM briefs r WHERE r.book_id = b.id) AS brief_langs
       FROM books b ORDER BY b.rank IS NULL, b.rank, b.title`,
    ),
    stamp: db.prepare(
      `SELECT b.created_at
              || '|' || (SELECT COUNT(*) || ':' || COALESCE(MAX(a.created_at), '') FROM analyses a WHERE a.book_id = b.id AND a.rubric = :rubric)
              || '|' || COALESCE((SELECT p.created_at FROM profiles p WHERE p.book_id = b.id AND p.rubric = :rubric), '')
              || '|' || COALESCE((SELECT MAX(r.created_at) FROM briefs r WHERE r.book_id = b.id), '') AS stamp
       FROM books b WHERE b.id = :id`,
    ),
    spend: db.prepare(
      `SELECT (SELECT COALESCE(SUM(input_tokens), 0) FROM analyses) + (SELECT COALESCE(SUM(input_tokens), 0) FROM profiles) AS jev,
              (SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) FROM briefs) AS brief_tokens,
              (SELECT COALESCE(SUM(cost_usd), 0) FROM briefs) AS brief_usd`,
    ),
    everyAnalysis: db.prepare("SELECT book_id, idx, model, answer FROM analyses WHERE rubric = ? ORDER BY book_id, idx"),
    totals: db.prepare(
      `SELECT (SELECT COUNT(*) FROM analyses) + (SELECT COUNT(*) FROM profiles) AS jev_requests,
              (SELECT model FROM analyses GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1) AS jev_model,
              (SELECT COUNT(*) FROM briefs) AS briefs,
              (SELECT model FROM briefs GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1) AS brief_model,
              (SELECT COALESCE(SUM(unixepoch(finished_at, 'subsec') - unixepoch(started_at, 'subsec')), 0) FROM runs WHERE finished_at IS NOT NULL) AS seconds,
              (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at), '') FROM analyses)
                || '|' || (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at), '') FROM profiles)
                || '|' || (SELECT COUNT(*) || ':' || COALESCE(MAX(created_at), '') FROM briefs) AS stamp`,
    ),
    startRun: db.prepare("INSERT INTO runs (command, started_at) VALUES (?, ?)"),
    finishRun: db.prepare("UPDATE runs SET finished_at = ?, jev_tokens = ?, brief_usd = ? WHERE id = ?"),
  };

  const briefOf = (id: string, lang: BriefLang = "en"): BookBrief | null => {
    const r = q.brief.get(id, lang) as { answer: string } | undefined;
    return r ? { lang, ...JSON.parse(r.answer) } : null;
  };

  return {
    db,
    close: () => db.close(),

    book: (id: string) => {
      const r = q.book.get(id);
      return r ? toBook(r) : null;
    },
    text: (id: string) => (q.text.get(id) as { text: string } | undefined)?.text ?? null,

    /** Stores a book with its exact page boundaries, so answers stay tied to the text they were given. */
    addBook(book: StoredBook, text: string, segments: { start: number; end: number }[]) {
      tx(() => {
        q.insertBook.run({ ...book, rank: book.rank, year: book.year ?? null, kind: book.kind ?? null, titleEn: book.titleEn ?? null, text, at: now() });
        segments.forEach((s, i) => q.insertSegment.run(book.id, i, s.start, s.end));
      });
    },
    books: () => (q.books.all() as Record<string, unknown>[]).map(toBook),
    /** Deletes the matching books with their pages, answers, profiles and briefs; returns how many went. */
    deleteBooks(match: (b: StoredBook) => boolean) {
      const ids = (q.books.all() as Record<string, unknown>[]).map(toBook).filter(match).map((b) => b.id);
      tx(() => {
        for (const id of ids) {
          q.deleteAnswers.run(id);
          q.deleteBook.run(id);
        }
      });
      return ids.length;
    },
    /** Bibliographic fields change without touching the text, so stored answers stay valid. */
    updateBookMeta(id: string, m: { title: string; titleEn: string | null; year: number | null; kind: BookKind | null; rank: number | null }) {
      q.updateMeta.run({ id, ...m });
    },
    segments: (id: string) => q.segments.all(id) as { idx: number; start: number; end: number }[],

    putAnalysis(id: string, idx: number, a: SegmentAnalysis) {
      q.putAnalysis.run(id, idx, a.rubric, a.model, JSON.stringify(a), a.usage?.input_tokens ?? 0, now());
    },
    analyses(id: string, rubric: string): Map<number, SegmentAnalysis> {
      return new Map((q.analyses.all(id, rubric) as { idx: number; answer: string }[]).map((r) => [r.idx, JSON.parse(r.answer)]));
    },
    putProfile(id: string, p: BookProfile) {
      q.putProfile.run(id, p.rubric, p.model, JSON.stringify(p), p.usage?.input_tokens ?? 0, now());
    },
    profile(id: string, rubric: string): BookProfile | null {
      const r = q.profile.get(id, rubric) as { answer: string } | undefined;
      return r ? JSON.parse(r.answer) : null;
    },
    /** Stores a brief under its own `lang` (English when unset). Older briefs of the same language stay as history. */
    putBrief(id: string, b: BookBrief) {
      const lang = b.lang ?? "en";
      q.putBrief.run(id, lang, b.model, JSON.stringify({ ...b, lang }), b.usage.prompt_tokens, b.usage.completion_tokens, b.usage.cost, b.createdAt);
    },
    /** The latest brief in `lang`. */
    brief: briefOf,
    /** The latest brief in every language that has one. */
    briefs(id: string): Partial<Record<BriefLang, BookBrief>> {
      const out: Partial<Record<BriefLang, BookBrief>> = {};
      for (const lang of BRIEF_LANGS) {
        const b = briefOf(id, lang);
        if (b) out[lang] = b;
      }
      return out;
    },

    progress(rubric: string): BookProgress[] {
      return (q.progress.all({ rubric }) as Record<string, unknown>[]).map((r) => ({
        ...toBook(r),
        analysed: Number(r.analysed),
        profiled: Boolean(r.profiled),
        ...briefState(r.brief_langs),
      }));
    },
    /** Changes whenever any stored answer, profile or brief of the book changes; cheap enough for an ETag. */
    stamp(id: string, rubric: string): string | null {
      const r = q.stamp.get({ id, rubric }) as { stamp: string } | undefined;
      return r ? r.stamp : null;
    },
    spend() {
      const r = q.spend.get() as { jev: number; brief_tokens: number; brief_usd: number };
      return { jevTokens: Number(r.jev), briefTokens: Number(r.brief_tokens), briefUsd: Number(r.brief_usd) };
    },
    /** Streams every answer of a rubric in book and page order without holding them all in memory. */
    *everyAnalysis(rubric: string): Generator<{ bookId: string; idx: number; model: string; answer: SegmentAnalysis }> {
      for (const r of q.everyAnalysis.iterate(rubric) as Iterable<{ book_id: string; idx: number; model: string; answer: string }>)
        yield { bookId: r.book_id, idx: r.idx, model: r.model, answer: JSON.parse(r.answer) };
    },
    /** Request counts, models and run time; `stamp` changes whenever any answer, profile or brief is added. */
    totals() {
      const r = q.totals.get() as Record<string, unknown>;
      return {
        jevRequests: Number(r.jev_requests),
        jevModel: r.jev_model == null ? null : String(r.jev_model),
        briefs: Number(r.briefs),
        briefModel: r.brief_model == null ? null : String(r.brief_model),
        seconds: Number(r.seconds),
        stamp: String(r.stamp),
      };
    },
    startRun: (command: string) => Number(q.startRun.run(command, now()).lastInsertRowid),
    finishRun: (run: number, jevTokens: number, briefUsd: number) => void q.finishRun.run(now(), jevTokens, briefUsd, run),
  };
}

export type Store = ReturnType<typeof openStore>;
