import { isCorpusId } from "../../shared/corpus.ts";
import type { Segment } from "../domain/text.ts";
import { useCorpusBook, type CorpusExtra } from "./corpus.ts";
import { useBook, type BookContent, type BookMeta } from "./library.ts";

/** Where a book lives: the user's IndexedDB library (editable) or the server canon (read-only). */
export type BookOrigin = "library" | "corpus";

/**
 * `excerpt` is true for server books sent without their copyrighted text: each segment's `text` is then a short
 * opening of the page, while `start`/`end` (and so page and char counts) still describe the real page.
 * Library books are the user's own files and always carry their full text.
 */
export type BookView = { meta?: BookMeta; content?: BookContent; segments: Segment[]; missing: boolean; origin: BookOrigin; rank: number | null } & CorpusExtra;

const NO_EXTRA: CorpusExtra = { excerpt: false, year: null, kind: null, titleEn: null, lines: [] };

/** One book shape for BookPage regardless of source; both hooks always run, the unused one stays idle. */
export function useBookView(id: string): BookView {
  const canon = isCorpusId(id);
  const local = useBook(canon ? null : id);
  const corpus = useCorpusBook(canon ? id : null);
  return canon ? { ...corpus, origin: "corpus" } : { ...local, ...NO_EXTRA, origin: "library", rank: null };
}
