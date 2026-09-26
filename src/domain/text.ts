export type Segment = { id: number; start: number; end: number; text: string };
export type Mode = "pages" | "paragraphs";
export const PAGE_CHARS = 1800;
export const READING_CHARS_PER_MINUTE = 1300;

export function normalize(text: string) {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function segmentText(text: string, mode: Mode = "pages", size = PAGE_CHARS): Segment[] {
  if (!Number.isInteger(size) || size < 100) throw new Error("Invalid page size");
  const result: Segment[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (mode === "paragraphs") {
      const boundary = text.indexOf("\n\n", start);
      if (boundary !== -1 && boundary + 2 <= end) end = boundary + 2;
    }
    if (end < text.length && !/\s/.test(text[end]) && !/\s/.test(text[end - 1])) {
      const window = text.slice(start, end);
      const match = [...window.matchAll(/\s/g)].at(-1);
      if (match && match.index! > size / 2) end = start + match.index! + 1;
      // Do not split UTF-16 surrogate pairs.
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    result.push({ id: result.length + 1, start, end, text: text.slice(start, end) });
    start = end;
  }
  return result;
}

export function firstSentence(text: string, max = 160) {
  let clean = text.replace(/\s+/g, " ").trim();
  if (/^[a-zа-яё,;:)]/u.test(clean)) {
    const start = clean.search(/[.!?…]\s+(?=[\p{Lu}«"—–-])/u);
    if (start > 0 && start < clean.length - 40) clean = clean.slice(start + 1).trim();
  }
  const sentence = clean.match(/^.{20,}?[.!?…](?=\s|$)/)?.[0] ?? clean;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + "…" : sentence;
}
