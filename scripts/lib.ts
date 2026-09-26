import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isParatext } from "../src/domain/analysis.ts";
import type { SegmentAnalysis } from "../shared/types.ts";

/** One row of data/greatest-500.json; `rank` orders by how many canon lists name the work. */
export type Entry = { rank: number; gutenberg: number; title: string; author: string; lists: string[] };

export const JEV_USD_PER_MTOK = 0.042;
export const PROFILE_EXCERPTS = 6;
export const ATLAS_CACHE = join("node_modules", ".cache", "xbook-atlas");

export async function readGreatest(): Promise<Entry[]> {
  return (JSON.parse(await readFile(join("data", "greatest-500.json"), "utf8")) as { books: Entry[] }).books;
}

export const args = (): Record<string, string> =>
  Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }));

/** "Tolstoy, Leo, graf, 1828-1910" → "Leo Tolstoy". */
export const cleanAuthor = (a: string) => {
  const name = a.replace(/,?\s*(\d{1,4}\??\s*(BCE)?-.*|\d{3,4}\??)$/, "").trim();
  const [last, first] = name.split(/,\s*/);
  return first && !/\(/.test(last) ? `${first.replace(/\s*\(.*\)/, "")} ${last}` : name;
};

export const cleanTitle = (t: string) => t.split(/[:;]/)[0].trim();

export async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

/** Six evenly spaced narrative pages for the whole-book request. */
export function profileExcerpts(indices: number[], analyses: (SegmentAnalysis | null)[]) {
  const narrative = indices.filter((i) => analyses[i] && !isParatext(analyses[i]));
  const n = Math.min(PROFILE_EXCERPTS, narrative.length);
  return Array.from({ length: n }, (_, k) => narrative[Math.round((k * (narrative.length - 1)) / Math.max(1, n - 1))]);
}

export const usd = (tokens: number) => (tokens / 1e6) * JEV_USD_PER_MTOK;
