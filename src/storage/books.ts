import { isCorpusId } from "../../shared/corpus.ts";
import type { Segment } from "../domain/text.ts";
import { useCorpusBook } from "./corpus.ts";
import { useBook, type BookContent, type BookMeta } from "./library.ts";

/** Where a book lives: the user's IndexedDB library (editable) or the server canon (read-only). */
export type BookOrigin = "library" | "corpus";

export type BookView = { meta?: BookMeta; content?: BookContent; segments: Segment[]; missing: boolean; origin: BookOrigin; rank: number | null };

/** One book shape for BookPage regardless of source; both hooks always run, the unused one stays idle. */
export function useBookView(id: string): BookView {
  const canon = isCorpusId(id);
  const local = useBook(canon ? null : id);
  const corpus = useCorpusBook(canon ? id : null);
  return canon ? { ...corpus, origin: "corpus" } : { ...local, origin: "library", rank: null };
}
