import { useMemo } from "react";
import type { CorpusEntry } from "../../../shared/types.ts";
import type { Fingerprint, Weights } from "../../domain/fingerprint.ts";
import { embed } from "../../domain/pca.ts";
import { useAtlas } from "../../storage/atlas.ts";
import { useCorpusList } from "../../storage/corpus.ts";
import { useLibrary } from "../../storage/library.ts";

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
};

/** Library and canon books open their page; sampled atlas books only exist on the map. */
export const starPath = (star: Pick<Star, "id" | "kind" | "canon">) => (star.kind === "library" || star.canon ? `/book/${star.id}` : `/map?focus=${star.id}`);

/** Jev-measured atlas plus every library book that already has Jev data. */
export function useCorpus({ includeAtlas = true } = {}) {
  const atlas = useAtlas();
  const canon = useCorpusList();
  const { books } = useLibrary();
  return useMemo<Star[]>(() => {
    const own: Star[] = books
      .filter((b) => b.fingerprint && b.fingerprint.coverage > 0)
      .map((b) => ({ id: b.id, title: b.title, author: b.author, chars: b.chars, fingerprint: b.fingerprint!, kind: "library", pagesRead: b.analyzed }));
    const onMap = new Set(books.filter((b) => b.source === "gutenberg" && b.fingerprint && b.fingerprint.coverage > 0).map((b) => b.sourceRef));
    const byId = new Map(canon?.books.map((c) => [c.id, c]));
    const reference: Star[] = includeAtlas
      ? atlas
          .filter((a) => !onMap.has(String(a.gutenberg)))
          .map((a) => ({ id: a.id, title: a.title, author: a.author, chars: a.chars, fingerprint: a.fingerprint, kind: "atlas", pagesRead: a.pagesRead, canon: byId.get(a.id) }))
      : [];
    return [...reference, ...own];
  }, [atlas, canon, books, includeAtlas]);
}

export function useEmbedding(stars: Star[], weights: Weights) {
  return useMemo(() => embed(stars, weights), [stars, weights]);
}
