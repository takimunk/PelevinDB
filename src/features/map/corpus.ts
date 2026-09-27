import { useMemo } from "react";
import { BOOK_KINDS, type BookKind, type CorpusEntry } from "../../../shared/types.ts";
import type { Fingerprint, Weights } from "../../domain/fingerprint.ts";
import { embed } from "../../domain/pca.ts";
import { useAtlas } from "../../storage/atlas.ts";
import { useCorpusList } from "../../storage/corpus.ts";
import { useLibrary } from "../../storage/library.ts";
import { useLocalMode } from "../../services/mode.ts";

export type Star = {
  id: string;
  title: string;
  author: string;
  chars: number;
  fingerprint: Fingerprint;
  kind: "atlas" | "library";
  /** Pages Jev read: all of them for library books, a sample for the atlas. */
  pagesRead?: number;
  /** Set when the server corpus holds the book, so its full page can be opened. */
  canon?: CorpusEntry;
  /** Publication year, kind of work and English title, when the corpus or the atlas knows them. */
  year?: number;
  work?: BookKind;
  titleEn?: string;
};

/** Optional metadata from a corpus entry or an atlas row; either may lack it, so read it defensively. */
function meta(...sources: (object | undefined)[]) {
  let year: number | undefined, work: BookKind | undefined, titleEn: string | undefined;
  for (const s of sources) {
    const v = (s ?? {}) as { year?: unknown; kind?: unknown; titleEn?: unknown };
    if (year == null && typeof v.year === "number" && Number.isFinite(v.year)) year = v.year;
    if (work == null && typeof v.kind === "string" && (BOOK_KINDS as readonly string[]).includes(v.kind)) work = v.kind as BookKind;
    if (titleEn == null && typeof v.titleEn === "string" && v.titleEn) titleEn = v.titleEn;
  }
  return { ...(year != null && { year }), ...(work && { work }), ...(titleEn && { titleEn }) };
}

/** Library and canon books open their page; sampled atlas books only exist on the map. */
export const starPath = (star: Pick<Star, "id" | "kind" | "canon">) => (star.kind === "library" || star.canon ? `/book/${star.id}` : `/map?focus=${star.id}`);

/** Jev-measured atlas plus every library book that already has Jev data. */
export function useCorpus({ includeAtlas = true } = {}) {
  const atlas = useAtlas();
  const canon = useCorpusList();
  const local = useLocalMode();
  const { books: all } = useLibrary();
  // Your own analysed books join the map only in local mode.
  const books = useMemo(() => (local ? all : []), [local, all]);
  return useMemo<Star[]>(() => {
    const own: Star[] = books
      .filter((b) => b.fingerprint && b.fingerprint.coverage > 0)
      .map((b) => ({ id: b.id, title: b.title, author: b.author, chars: b.chars, fingerprint: b.fingerprint!, kind: "library", pagesRead: b.analyzed }));
    const onMap = new Set(books.filter((b) => b.source === "gutenberg" && b.fingerprint && b.fingerprint.coverage > 0).map((b) => b.sourceRef));
    const byId = new Map(canon?.books.map((c) => [c.id, c]));
    const reference: Star[] = includeAtlas
      ? atlas
          .filter((a) => a.gutenberg == null || !onMap.has(String(a.gutenberg)))
          .map((a) => ({
            id: a.id,
            title: a.title,
            author: a.author,
            chars: a.chars,
            fingerprint: a.fingerprint,
            kind: "atlas",
            pagesRead: a.pagesRead,
            canon: byId.get(a.id),
            ...meta(byId.get(a.id), a),
          }))
      : [];
    return [...reference, ...own];
  }, [atlas, canon, books, includeAtlas]);
}

export function useEmbedding(stars: Star[], weights: Weights) {
  return useMemo(() => embed(stars, weights), [stars, weights]);
}
