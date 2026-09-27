// Splits a page into sentences: the unit of the sentence-level Jev requests. Boundaries are offsets into the page,
// so answers stay tied to the exact text they were given, like page boundaries are.
//
// Russian prose rules: a sentence ends at . ! ? … (with any closing quotes or brackets) before whitespace and a
// capital, a digit, an opening quote or a dash. Initials ("В. И. Ленин") and common abbreviations do not end a
// sentence. A dialogue line (a paragraph opening with a dash) stays whole while it is short, so "— Да, — сказал он."
// is one unit. Fragments without letters join their neighbour.

export type Sentence = { start: number; end: number };

/** A dialogue line up to this length is one unit, even when it holds several sentences. */
export const DIALOGUE_LINE_MAX = 240;
/** Longest unit: longer sentences are cut at the last clause boundary (;:, or a dash) before this length. */
export const SENTENCE_MAX = 600;

const ABBREVIATIONS = new Set(
  "т е д п г гг в вв см ср др пр им ул стр рис тыс млн млрд руб коп проф акад доц им напр св ст илл соч изд гл кн т.е т.д т.п mr mrs dr st vs etc".split(" "),
);
const END = /[.!?…]+["»”)\]]*/gu;
const STARTS_SENTENCE = /^[\s]*[\p{Lu}\d«"“„(\[—–-]/u;
const DASH_LINE = /^\s*[—–-]/;

function endsWithAbbreviation(text: string, dot: number) {
  if (text[dot] !== ".") return false;
  const word = text.slice(0, dot).match(/([\p{L}.]+)$/u)?.[1] ?? "";
  if (!word) return false;
  // A single capital letter is an initial: "В. И. Ленин".
  if (/^\p{Lu}$/u.test(word)) return true;
  return ABBREVIATIONS.has(word.toLocaleLowerCase("ru"));
}

/** Sentence boundaries within one paragraph, as offsets into `text`. */
function splitParagraph(text: string, start: number, end: number): Sentence[] {
  const para = text.slice(start, end);
  if (DASH_LINE.test(para) && para.trim().length <= DIALOGUE_LINE_MAX) return [{ start, end }];
  const cuts: number[] = [];
  for (const m of para.matchAll(END)) {
    const after = m.index! + m[0].length;
    if (after >= para.length) continue;
    if (!/\s/.test(para[after])) continue;
    if (!STARTS_SENTENCE.test(para.slice(after))) continue;
    if (endsWithAbbreviation(para, m.index!)) continue;
    cuts.push(after);
  }
  const out: Sentence[] = [];
  let from = 0;
  for (const cut of [...cuts, para.length]) {
    out.push(...capLength(para, from, cut).map((s) => ({ start: start + s.start, end: start + s.end })));
    from = cut;
  }
  return out;
}

/** Cuts a run-on sentence at clause boundaries so no unit exceeds SENTENCE_MAX. */
function capLength(text: string, start: number, end: number): Sentence[] {
  const out: Sentence[] = [];
  while (end - start > SENTENCE_MAX) {
    const window = text.slice(start, start + SENTENCE_MAX);
    const clause = Math.max(window.lastIndexOf("; "), window.lastIndexOf(": "), window.lastIndexOf(" — "), window.lastIndexOf(", "));
    const cut = clause > SENTENCE_MAX / 3 ? clause + 2 : Math.max(window.lastIndexOf(" ") + 1, SENTENCE_MAX);
    out.push({ start, end: start + cut });
    start += cut;
  }
  out.push({ start, end });
  return out;
}

/** Trims whitespace off each unit and drops empty ones. */
function trim(text: string, s: Sentence): Sentence | null {
  let { start, end } = s;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return end > start ? { start, end } : null;
}

/** Every sentence of `page`, in order, as offsets into `page`. Covers all of its letters. */
export function splitSentences(page: string): Sentence[] {
  const units: Sentence[] = [];
  const paragraphs = /[^\n]+/g;
  for (const m of page.matchAll(paragraphs)) {
    for (const s of splitParagraph(page, m.index!, m.index! + m[0].length)) {
      const t = trim(page, s);
      if (t) units.push(t);
    }
  }
  // A fragment without letters (a lone "…", "***" or a number) joins the unit before it, or the next one.
  const merged: Sentence[] = [];
  for (const u of units) {
    const letters = /\p{L}/u.test(page.slice(u.start, u.end));
    if (!letters && merged.length) merged[merged.length - 1].end = u.end;
    else merged.push({ ...u });
  }
  if (merged.length > 1 && !/\p{L}/u.test(page.slice(merged[0].start, merged[0].end))) {
    merged[1].start = merged[0].start;
    merged.shift();
  }
  return merged;
}

/** Joins every sentence of a page as "[1] … [2] …", keeping paragraph breaks, for the focus request. */
export function numberedPassage(page: string, sentences: Sentence[]): string {
  let out = "";
  sentences.forEach((s, i) => {
    const gap = i === 0 ? "" : page.slice(sentences[i - 1].end, s.start).includes("\n") ? "\n" : " ";
    out += `${gap}[${i + 1}] ${page.slice(s.start, s.end)}`;
  });
  return out;
}
