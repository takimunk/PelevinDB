import { isCorpusId } from "../shared/corpus.ts";
import { BRIEF_LANGS, type BriefDossier, type BriefLang } from "../shared/types.ts";

export const MAX_PAGE = 1800;
export const MAX_EXCERPTS = 8;

export type Parsed<T> = { value: T } | { error: string };

export function pageInput(body: unknown): Parsed<string> {
  const text = (body as { text?: unknown } | null)?.text;
  return typeof text === "string" && text.trim() && text.length <= MAX_PAGE ? { value: text } : { error: `Expected text of 1 to ${MAX_PAGE} chars.` };
}

export function excerptsInput(body: unknown): Parsed<string[]> {
  const excerpts = (body as { excerpts?: unknown } | null)?.excerpts;
  return Array.isArray(excerpts) &&
    excerpts.length > 0 &&
    excerpts.length <= MAX_EXCERPTS &&
    excerpts.every((e) => typeof e === "string" && e.trim() && e.length <= MAX_PAGE)
    ? { value: excerpts as string[] }
    : { error: `Expected 1 to ${MAX_EXCERPTS} excerpts of up to ${MAX_PAGE} chars.` };
}

export function corpusId(value: unknown): Parsed<string> {
  return typeof value === "string" && isCorpusId(value) ? { value } : { error: "Expected a corpus book id like pv-generation-p or pg-1342." };
}

/** A 1-based page number from the URL. */
export function pageNumber(value: unknown): Parsed<number> {
  return typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? { value: Number(value) } : { error: "Expected a page number from 1." };
}

export const MAX_DOSSIER = 24_000;

/** A dossier plus the brief language ("en" when absent). */
export function briefInput(body: unknown): Parsed<{ dossier: BriefDossier; lang: BriefLang }> {
  const lang = (body as { lang?: unknown } | null)?.lang ?? "en";
  if (typeof lang !== "string" || !(BRIEF_LANGS as readonly string[]).includes(lang)) return { error: `Expected lang to be one of ${BRIEF_LANGS.join(", ")}.` };
  const dossier = dossierInput(body);
  return "error" in dossier ? dossier : { value: { dossier: dossier.value, lang: lang as BriefLang } };
}

export function dossierInput(body: unknown): Parsed<BriefDossier> {
  const dossier = (body as { dossier?: unknown } | null)?.dossier as Partial<BriefDossier> | undefined;
  const ok =
    !!dossier &&
    typeof dossier === "object" &&
    !Array.isArray(dossier) &&
    typeof dossier.title === "string" &&
    dossier.title.trim().length > 0 &&
    typeof dossier.author === "string" &&
    JSON.stringify(dossier).length <= MAX_DOSSIER;
  return ok ? { value: dossier as BriefDossier } : { error: `Expected a book dossier of up to ${MAX_DOSSIER} chars.` };
}
