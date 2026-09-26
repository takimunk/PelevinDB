import type { Fingerprint } from "./fingerprint.ts";

/** A reference book measured by Jev with `npm run atlas` (public/atlas.json). */
export type AtlasBook = {
  id: string;
  title: string;
  author: string;
  gutenberg: number;
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
