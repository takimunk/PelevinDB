// EPUB → plain text blocks for the Pelevin corpus (scripts/ingest-pelevin.ts).
// The source EPUBs are FB2 conversions (Litres-style): OPF spine + NCX table of contents,
// headings in <div class="title…">, footnote references as <a class="a">[n]</a>, notes in a "Примечания" file.
// Plain regex tokenising is enough for this markup and keeps the script dependency-free (jszip only).
import { join } from "node:path";
import JSZip from "jszip";

export const DEFAULT_DIR = "/Users/diipushk/Documents/Codex/2026-09-26/applications-mentioned-by-the-user-appshot/outputs/Пелевин_EPUB";
/** Extracted plain texts, one `{id}.txt` per work; git-ignored with node_modules. */
export const CACHE = join("node_modules", ".cache", "pelevin");
/** The curated list: works with metadata and every excluded file or section with its reason. */
export const LIST = join("data", "pelevin.json");

export type Block = { kind: "h" | "p"; text: string; file: string; anchors: string[] };
export type TocEntry = { label: string; file: string; anchor: string | null; depth: number; children: TocEntry[] };
export type Epub = { title: string; author: string; blocks: Block[]; toc: TocEntry[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "", mdash: "—", ndash: "–", laquo: "«", raquo: "»", hellip: "…" };

export const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const clean = (s: string) => decode(s).replace(/[­​﻿]/g, "").replace(/[ \t \r\n]+/g, " ").trim();

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((x) => x != null) ?? null;

const BLOCK = /^(p|div|h[1-6]|li|br|tr|blockquote|section|td|dd|dt)$/i;

/** Splits one XHTML chapter into heading/paragraph blocks, remembering which ids start at or before each block. */
export function xhtmlBlocks(raw: string, file: string): Block[] {
  const body = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? raw;
  const out: Block[] = [];
  let buf = "";
  let anchors: string[] = [];
  let heading = 0; // depth inside title divs / h tags
  let skip = 0; // inside footnote refs, scripts, styles
  const stack: { name: string; heading: boolean; skip: boolean }[] = [];
  const flush = () => {
    const text = clean(buf);
    if (text) {
      out.push({ kind: heading > 0 ? "h" : "p", text, file, anchors });
      anchors = [];
    }
    buf = "";
  };
  const re = /<(\/?)([a-zA-Z0-9:]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m: RegExpExecArray | null; (m = re.exec(body)); ) {
    if (m[5] != null) {
      if (!skip) buf += m[5];
      continue;
    }
    const [, close, rawName, rest, selfClose] = m;
    const name = rawName.toLowerCase().replace(/^.*:/, "");
    if (close) {
      // pop to the matching element
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name !== name) continue;
        const popped = stack.splice(i);
        if (BLOCK.test(name) || popped.some((e) => e.heading)) flush();
        for (const e of popped) {
          if (e.heading) heading--;
          if (e.skip) skip--;
        }
        break;
      }
      continue;
    }
    const id = attr(rest, "id");
    if (id) anchors.push(id);
    if (name === "br") {
      buf += "\n";
      continue;
    }
    if (selfClose) continue;
    const cls = attr(rest, "class") ?? "";
    const isHeading = /^h[1-6]$/.test(name) || (name === "div" && /\btitle\d*\b/.test(cls));
    const isSkip = name === "script" || name === "style" || (name === "a" && /\ba\b/.test(cls) && /#/.test(attr(rest, "href") ?? "")) || name === "sup";
    if (BLOCK.test(name) || isHeading) flush();
    stack.push({ name, heading: isHeading, skip: isSkip });
    if (isHeading) heading++;
    if (isSkip) skip++;
  }
  flush();
  return out;
}

function parseNav(xml: string, base: string): TocEntry[] {
  const root: TocEntry[] = [];
  const stack: TocEntry[][] = [root];
  const re = /<navPoint\b[^>]*>|<\/navPoint>|<text>([\s\S]*?)<\/text>|<content\b([^>]*)\/?>/g;
  let current: TocEntry | null = null;
  for (let m: RegExpExecArray | null; (m = re.exec(xml)); ) {
    if (m[0].startsWith("<navPoint")) {
      current = { label: "", file: "", anchor: null, depth: stack.length - 1, children: [] };
      stack[stack.length - 1].push(current);
      stack.push(current.children);
    } else if (m[0] === "</navPoint>") {
      stack.pop();
      current = null;
    } else if (m[1] != null && current && !current.label) current.label = clean(m[1]);
    else if (m[2] != null && current) {
      const src = decodeURIComponent(attr(m[2], "src") ?? "");
      const [file, anchor] = src.split("#");
      current.file = resolve(base, file);
      current.anchor = anchor || null;
    }
  }
  return root;
}

const resolve = (base: string, href: string) => {
  const parts = (base ? base.split("/") : []).concat(href.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
};

export async function readEpub(data: Buffer | Uint8Array): Promise<Epub> {
  const zip = await JSZip.loadAsync(data);
  const read = async (path: string) => {
    const f = zip.file(path);
    if (!f) throw new Error(`missing ${path}`);
    return f.async("string");
  };
  const container = await read("META-INF/container.xml");
  const opfPath = attr(container.match(/<rootfile\b[^>]*>/)![0], "full-path")!;
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const opf = await read(opfPath);
  const title = clean(opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1] ?? "");
  const author = clean(opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/)?.[1] ?? "");
  const manifest = new Map<string, { href: string; type: string }>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = attr(m[0], "id");
    const href = attr(m[0], "href");
    if (id && href) manifest.set(id, { href: resolve(base, decodeURIComponent(href)), type: attr(m[0], "media-type") ?? "" });
  }
  const blocks: Block[] = [];
  for (const m of opf.matchAll(/<itemref\b[^>]*>/g)) {
    const item = manifest.get(attr(m[0], "idref") ?? "");
    if (!item || !/html/.test(item.type)) continue;
    const raw = await read(item.href);
    const bs = xhtmlBlocks(raw, item.href);
    // An empty chapter still marks where its file starts.
    if (!bs.length) bs.push({ kind: "p", text: "", file: item.href, anchors: [] });
    blocks.push(...bs);
  }
  const ncxId = opf.match(/<spine\b[^>]*toc="([^"]+)"/)?.[1];
  const ncx = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((i) => /ncx/.test(i.type));
  const toc = ncx ? parseNav(await read(ncx.href), ncx.href.includes("/") ? ncx.href.slice(0, ncx.href.lastIndexOf("/")) : "") : [];
  return { title, author, blocks, toc };
}

/** Index of the first block a TOC entry points at (file start, or the block carrying the anchor). */
export function tocIndex(blocks: Block[], e: { file: string; anchor: string | null }) {
  if (e.anchor) {
    const i = blocks.findIndex((b) => b.file === e.file && b.anchors.includes(e.anchor!));
    if (i >= 0) return i;
  }
  return blocks.findIndex((b) => b.file === e.file);
}

export const flatToc = (toc: TocEntry[]): TocEntry[] => toc.flatMap((e) => [e, ...flatToc(e.children)]);

/** Blocks → plain text: paragraphs separated by blank lines. */
export const blocksText = (blocks: Block[]) =>
  blocks
    .map((b) => b.text)
    .filter(Boolean)
    .join("\n\n");

// ---------- content fingerprints ----------

const WORD = /[\p{L}\p{N}]+/gu;
export const words = (text: string) => (text.toLowerCase().replace(/ё/g, "е").match(WORD) ?? []);

/** 32-bit FNV-1a */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hashed word 8-gram shingles. */
export function shingles(text: string, n = 8): Set<number> {
  const w = words(text);
  const out = new Set<number>();
  for (let i = 0; i + n <= w.length; i++) out.add(fnv(w.slice(i, i + n).join(" ")));
  return out;
}

/** |A ∩ B| / |A|: how much of A is contained in B. */
export function containment(a: Set<number>, b: Set<number>) {
  if (!a.size) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / a.size;
}
