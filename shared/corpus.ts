/** Canon books are stored as `pg-{Project Gutenberg id}` by scripts/analyze-corpus.ts. */
export const CORPUS_ID = /^pg-[1-9]\d{0,6}$/;

export const isCorpusId = (id: string) => CORPUS_ID.test(id);
