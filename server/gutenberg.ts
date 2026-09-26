import type { CatalogHit } from "../shared/types.ts";

const ORIGIN = "https://www.gutenberg.org";
const HEADERS = { "User-Agent": "xbook/0.2 (personal reading prototype)" };
const MAX_BYTES = 12 * 1024 * 1024;

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => entities[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();

/** Parses Project Gutenberg OPDS search results; navigation entries are skipped. */
export function parseOpds(xml: string): CatalogHit[] {
  const hits: CatalogHit[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = entry.match(/<id>[^<]*\/ebooks\/(\d+)\.opds<\/id>/)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    if (!id || !title) continue;
    const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? "";
    const author = decode(content);
    hits.push({
      id,
      title: decode(title),
      author: /^\d+ downloads$/.test(author) ? "" : author,
      source: "gutenberg",
    });
  }
  return hits;
}

/** Removes the Project Gutenberg header and licence and re-joins hard-wrapped lines. */
export function cleanGutenberg(raw: string) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const header = text.slice(0, 6000);
  const field = (name: string) =>
    header.match(new RegExp(`^${name}:\\s*(.+(?:\\n {2,}.+)*)`, "m"))?.[1]
      .replace(/\s+/g, " ")
      .trim();
  const start = text.search(/^\*{3} ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*$/im);
  const end = text.search(/^\*{3} ?END OF (THE|THIS) PROJECT GUTENBERG/im);
  let body = text.slice(
    start === -1 ? 0 : text.indexOf("\n", start) + 1,
    end === -1 ? undefined : end,
  );
  body = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  return {
    title: field("Title") ?? "",
    author: field("Author") ?? "",
    language: field("Language") ?? "",
    text: body,
  };
}

async function get(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error(`Gutenberg HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_BYTES) throw new Error("Book is too large.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error("Book is too large.");
  return new TextDecoder().decode(buffer);
}

const cache = new Map<string, { at: number; hits: CatalogHit[] }>();

export async function searchCatalog(query: string, signal: AbortSignal) {
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.hits;
  const xml = await get(
    `${ORIGIN}/ebooks/search.opds/?query=${encodeURIComponent(query)}`,
    signal,
  );
  const hits = parseOpds(xml).slice(0, 20);
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return hits;
}

export async function fetchCatalogText(id: string, signal: AbortSignal) {
  if (!/^\d{1,6}$/.test(id)) throw new Error("Invalid book id.");
  const raw = await get(`${ORIGIN}/cache/epub/${id}/pg${id}.txt`, signal);
  return cleanGutenberg(raw);
}
