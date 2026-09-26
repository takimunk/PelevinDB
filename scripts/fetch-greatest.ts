// Downloads the EPUBs listed in data/greatest-500.json from Project Gutenberg into library/greatest-500/.
// Prefers the image-free EPUB: only the text matters for analysis.
// Usage: npm run greatest -- [--limit=100]
// Existing files are skipped, so an interrupted run resumes. Two workers with a pause keep the load polite.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Entry = { rank: number; gutenberg: number; title: string; author: string };

const OUT = join("library", "greatest-500");
const WORKERS = 2;
const PAUSE_MS = 1000;

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const { books } = JSON.parse(await readFile(join("data", "greatest-500.json"), "utf8")) as { books: Entry[] };
const list = books.slice(0, Number(args.limit ?? books.length));

const clean = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
const surnameFirst = (author: string) => author.replace(/,?\s*\d{3,4}\??\s*(BCE)?-.*$/, "").trim();
const fileName = (b: Entry) => `${String(b.rank).padStart(3, "0")} ${clean(surnameFirst(b.author))} - ${clean(b.title.split(/[:;]/)[0])}.epub`;

await mkdir(OUT, { recursive: true });
const have = new Set((await readdir(OUT)).map((f) => f.slice(0, 3)));
const queue = list.filter((b) => !have.has(String(b.rank).padStart(3, "0")));
console.log(`${list.length - queue.length} already downloaded, ${queue.length} to go → ${OUT}`);

const failed: Entry[] = [];
let done = 0;
async function download(b: Entry) {
  for (const url of [
    `https://www.gutenberg.org/cache/epub/${b.gutenberg}/pg${b.gutenberg}.epub`,
    `https://www.gutenberg.org/cache/epub/${b.gutenberg}/pg${b.gutenberg}-images-3.epub`,
  ]) {
    const response = await fetch(url, { headers: { "User-Agent": "xbook/1.0 (personal reading library)" } }).catch(() => null);
    if (!response?.ok) continue;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.subarray(0, 2).toString() !== "PK") continue;
    await writeFile(join(OUT, fileName(b)), bytes);
    return true;
  }
  return false;
}

let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (next < queue.length) {
      const b = queue[next++];
      const ok = await download(b);
      if (!ok) failed.push(b);
      console.log(`${String(++done).padStart(3)}/${queue.length} ${ok ? "ok  " : "FAIL"} #${b.rank} ${b.title.slice(0, 60)}`);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }),
);
if (failed.length) console.log(`failed: ${failed.map((b) => `#${b.rank} (pg ${b.gutenberg})`).join(", ")}`);
