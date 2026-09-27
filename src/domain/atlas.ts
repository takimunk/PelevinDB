import type { Fingerprint } from "./fingerprint.ts";

/** A book on the map, measured by Jev and exported by `npm run corpus` (public/atlas.json or XBOOK_ATLAS). */
export type AtlasBook = {
  id: string;
  title: string;
  author: string;
  /** Absent for works that are not on Project Gutenberg (the Pelevin corpus). */
  gutenberg?: number | null;
  chars: number;
  /** Pages Jev actually read; the atlas samples evenly spaced pages. */
  pagesRead: number;
  fingerprint: Fingerprint;
};

export async function loadAtlas(): Promise<AtlasBook[]> {
  try {
    const response = await fetch("/atlas.json");
    if (response.ok && response.headers.get("content-type")?.includes("json")) {
      const data = (await response.json()) as { books?: AtlasBook[] };
      if (Array.isArray(data.books)) return data.books;
    }
  } catch {
    // No atlas yet.
  }
  return [];
}
