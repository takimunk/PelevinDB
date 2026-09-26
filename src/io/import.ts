import JSZip from "jszip";
import { normalize } from "../domain/text.ts";
export const MAX_TEXT = 20_000_000;
export type ImportedBook = { title: string; author: string; text: string; format: string };
function parseXml(raw: string) {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("Could not parse the book XML. Check the file.");
  return doc;
}
const nodes = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagNameNS("*", name));
function plain(root: Element | Document): string {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll("script,style,nav,binary").forEach((n) => n.remove());
  copy
    .querySelectorAll("p,div,h1,h2,h3,h4,li,br,section")
    .forEach((n) => n.append("\n\n"));
  return copy.textContent ?? "";
}
/** EPUB chapters are XHTML: the HTML parser treats `<title/>` as an open tag and swallows the body. */
function chapterBody(raw: string): Element {
  const xml = new DOMParser().parseFromString(raw, "application/xhtml+xml");
  const body = xml.querySelector("parsererror") ? null : nodes(xml, "body")[0];
  return body ?? new DOMParser().parseFromString(raw, "text/html").body;
}
function decoded(data: ArrayBuffer): string {
  const head = new TextDecoder().decode(data.slice(0, 200));
  const encoding = head.match(/encoding=["']([^"']+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(encoding).decode(data);
  } catch {
    throw new Error(
      "Unsupported text encoding. Save the file as UTF-8.",
    );
  }
}
export async function importBook(file: File): Promise<ImportedBook> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("File too large: 20 MB max.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  let title = file.name.replace(/\.[^.]+$/, ""),
    author = "Unknown author",
    text = "";
  const data = await file.arrayBuffer();
  if (ext === "txt" || ext === "md") text = decoded(data);
  else if (ext === "fb2") {
    const doc = parseXml(decoded(data));
    title = nodes(doc, "book-title")[0]?.textContent || title;
    const person = nodes(doc, "author")[0];
    if (person)
      author =
        ["first-name", "middle-name", "last-name"]
          .map((k) => nodes(person, k)[0]?.textContent)
          .filter(Boolean)
          .join(" ") || author;
    text = nodes(doc, "body")
      .filter((n) => n.getAttribute("name") !== "notes")
      .map(plain)
      .join("\n\n");
  } else if (ext === "epub") {
    const zip = await JSZip.loadAsync(data);
    let expanded = 0;
    async function read(path: string) {
      const entry = zip.file(path);
      if (!entry) throw new Error(`EPUB is missing a file: ${path}`);
      // Bound expansion before decompressing untrusted archive entries.
      const declared = (
        entry as unknown as { _data?: { uncompressedSize?: number } }
      )._data?.uncompressedSize;
      if (
        typeof declared !== "number" ||
        declared > 10_000_000 ||
        expanded + declared > 80_000_000
      )
        throw new Error("Unpacked book is too large.");
      expanded += declared;
      return await entry.async("string");
    }
    const container = parseXml(await read("META-INF/container.xml"));
    const opfPath = nodes(container, "rootfile")[0]?.getAttribute("full-path");
    if (!opfPath) throw new Error("EPUB has no package document.");
    const opf = parseXml(await read(opfPath));
    title = nodes(opf, "title")[0]?.textContent || title;
    author = nodes(opf, "creator")[0]?.textContent || author;
    const manifest = new Map(
      nodes(opf, "item").map((n) => [
        n.getAttribute("id"),
        n.getAttribute("href"),
      ]),
    );
    const chunks: string[] = [];
    for (const ref of nodes(opf, "itemref")) {
      if (ref.getAttribute("linear") === "no") continue;
      const href = manifest.get(ref.getAttribute("idref"));
      if (!href) throw new Error("EPUB spine is broken.");
      const url = new URL(href, `https://epub.local/${opfPath}`);
      if (url.origin !== "https://epub.local")
        throw new Error("External EPUB chapters are not supported.");
      const raw = await read(decodeURIComponent(url.pathname.slice(1)));
      chunks.push(plain(chapterBody(raw)));
    }
    text = chunks.join("\n\n");
  } else throw new Error("Supported formats: EPUB, FB2, TXT, Markdown.");
  text = normalize(text);
  if (!text)
    throw new Error(
      "No text found. The file may be DRM-protected or contain only images.",
    );
  if (text.length > MAX_TEXT)
    throw new Error(`Book too long: ${(text.length / 1e6).toFixed(1)}M chars, limit is ${MAX_TEXT / 1e6}M.`);
  return {
    title: title.trim(),
    author: author.trim(),
    text,
    format: ext!.toUpperCase(),
  };
}
