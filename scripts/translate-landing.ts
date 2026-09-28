// Translates every quote the home page can show (TOP_PAGES_MAX per emotion) into English, stores them in the
// translations cache and writes server/translations.seed.json, which the server loads into an empty cache on startup.
//
//   npm run translate:landing             translate what is missing, then write the seed
//   npm run translate:landing -- --dry    count only, no model calls
//   npm run translate:landing -- --max-usd 0.10
import { writeFileSync } from "node:fs";
import { openStore, DEFAULT_DB } from "../server/store.ts";
import { TOP_PAGES_MAX, topPages } from "../server/stats.ts";
import {
  DEFAULT_TRANSLATE_MODEL,
  PROMPT_VERSION,
  SEED_FILE,
  readSeed,
  resolveRefs,
  sourceHash,
  translateRefs,
  translationCache,
  translationsPath,
  type Seed,
} from "../server/translate.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const maxAt = args.indexOf("--max-usd");
const maxUsd = maxAt >= 0 ? Number(args[maxAt + 1]) : 0.1;
const model = process.env.TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL;

const store = openStore(process.env.XBOOK_DB || DEFAULT_DB, { readOnly: true });
const refs = topPages(store, TOP_PAGES_MAX).flatMap((col) => col.items.map((it) => `t:${it.id}:${it.page}`));
const sources = resolveRefs(store, refs);
const cache = translationCache();
const todo = [...new Set([...sources.values()].flat().filter((ru) => cache.get(sourceHash(ru)) == null))];
const chars = todo.reduce((s, ru) => s + ru.length, 0);
console.log(`${refs.length} landing quotes, ${sources.size} resolved, ${todo.length} not yet translated (${chars} chars) · cache ${translationsPath()} · model ${model}`);

if (!dry && todo.length) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Add OPENROUTER_API_KEY to .env first.");
  let spent = 0;
  // Batches of at most 10 misses per request keep each call small; stop before the spend ceiling.
  for (let i = 0; i < refs.length; i += 10) {
    if (spent >= maxUsd) {
      console.warn(`stopped at $${spent.toFixed(5)}: the --max-usd ceiling is $${maxUsd}`);
      break;
    }
    try {
      await translateRefs(store, refs.slice(i, i + 10), cache, {
        apiKey,
        model,
        onCall: (r) => {
          spent += r.cost;
          console.log(`  ${r.texts.length} quotes · ${r.tokens.prompt} in / ${r.tokens.completion} out tokens · $${r.cost.toFixed(6)} · ${r.model}`);
        },
      });
    } catch (error) {
      console.warn(`  quotes ${i + 1}–${i + 10} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`spent $${spent.toFixed(6)}`);
}

const previous = readSeed();
const seed: Seed = {
  version: 1,
  prompt: PROMPT_VERSION,
  model,
  translations: previous?.prompt === PROMPT_VERSION ? { ...previous.translations } : {},
};
let missing = 0;
for (const ru of [...sources.values()].flat()) {
  const hash = sourceHash(ru);
  const en = cache.get(hash);
  if (en == null) missing++;
  else seed.translations[hash] = en;
}
seed.translations = Object.fromEntries(Object.entries(seed.translations).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(SEED_FILE, `${JSON.stringify(seed, null, 1)}\n`);
console.log(`seed: ${Object.keys(seed.translations).length} translations → ${SEED_FILE}${missing ? ` (${missing} landing quotes still missing)` : ""}`);
