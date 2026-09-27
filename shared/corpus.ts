/**
 * Corpus book ids: `pv-{slug}` for Pelevin's works (scripts/analyze-corpus.ts), and the older
 * `pg-{Project Gutenberg id}` so stores built before the switch keep opening.
 */
export const CORPUS_ID = /^(?:pg-[1-9]\d{0,6}|pv-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const MAX_ID = 96;

export const isCorpusId = (id: string) => id.length <= MAX_ID && CORPUS_ID.test(id);
