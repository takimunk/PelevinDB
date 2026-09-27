# PelevinDB

Independent fork of [takimunk/xbook](https://github.com/takimunk/xbook), with the original Git history preserved.

A computational reading of Viktor Pelevin's complete works. Every page of 94 deduplicated works (novels, novellas, stories, essays, interviews; 8,612 pages) is read by Jev (TypeSafe), which answers 36 questions per page. The answers become book dashboards, a 3D map of the books by meaning, and essays. The site is bilingual (ru/en), with light and dark themes.

## Run

Node.js 22.18+ (the server is TypeScript, run natively without a build step).

```sh
npm ci
cp .env.example .env   # add TYPESAFE_API_KEY, optionally OPENROUTER_API_KEY
npm run dev            # http://127.0.0.1:5173
```

Without a key you still get search, import, the reader, the map with the reference atlas and export. No score is ever invented: every number on screen is a Jev answer or is computed from Jev answers.

Both keys stay on the server and never use a `VITE_` prefix. Book text goes to TypeSafe only after you press `[ analyze ]`. The brief sends OpenRouter only the derived numbers and about six short quotes, never the book. `.env` is git-ignored.

```sh
npm run build && npm start   # production, loopback only
```

This is a single-user prototype. Exposing a server that holds an API key needs authentication, spend quotas and server-side storage.

## Deployment and analytics

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Coolify container, CI deployment gate,
`pelevindb.xyz` DNS, persistent corpus storage and runtime OpenPanel setup.

## Interface

Ink on paper: black and white for everything except analytics, where colour carries data. Two faces: EB Garamond for prose, titles and the menu, JetBrains Mono for everything programmatic. The PelevinDB logo is ASCII art (`src/ui/Wordmark.tsx`). Keys: `/` or `⌘K` to find, `1`–`5` to switch sections, `←` `→` in the reader. Language and theme live in `src/i18n/index.ts`; strings sit next to each component as `{ en, ru }`.

- **Home** (`src/features/home/`): the particle scene "Ural", after *Chapaev and Void* (`src/ui/UralScene.tsx`, built in a Web Worker: an anime figure drawn by its silhouette edges, an endless river whose light follows particle density, a road sign, light-theme shadows), then the most emotional pages of the corpus by Plutchik's eight emotions (`GET /api/corpus/top-pages`).
- **Library** (`src/features/library/`): every work with facets (form, genre, era, arc, mood, emotion), quick filters, lenses and sortable score columns.
- **Map** (`src/features/map/BookGraph.tsx`): a vector view projected with a three.js camera. Points fade with depth, titles take their region's colour with the year beside them, region names sit under the books. 3D: `WASD` moves, `Q`/`E` go down and up, drag orbits. 2D: `WASD` and drag pan, `Q`/`E` zoom. Scroll zooms and `R` resets. Each axis is a principal component or any single Jev answer.
- **Blog** (`src/features/blog/`): the first post is a bag-of-words EDA of the whole corpus with eight interactive charts, built from `public/blog/eda.json` and `eda-freq.json`.
- **Micro-pixel strips** (`src/ui/PixelStrip.tsx`): one pixel per Jev parameter, coloured by group, brightness = value.

## Book page

From top to bottom:

- **Hero:** facts, including tokens processed and cost in USD. Jev costs $0.042 per million input tokens (output is free), so a page costs about $0.0002. The brief's cost comes from OpenRouter's `usage.cost`. Hover for the breakdown.
- **Star chart** (`charts/Radar.tsx`): 12 axes (tension, pace, emotion, light, humour, imagery, ideas, interiority, density, scope, plot, fantastic). A dashed polygon shows the mean of the other books on the map.
- **Brief** (`server/brief.ts`): once analysis is complete, an OpenRouter model writes a logline, what the book is, three reasons to read it, three kinds of reader it suits, and who should skip it. It works from a dossier of measured data (`src/domain/dossier.ts`) and returns strict JSON. The model defaults to `google/gemini-3.8-flash` and can be changed with `OPENROUTER_MODEL`.
- **Quotes:** the most extreme pages (climax, stillest, brightest, darkest, biggest surprise, deepest interiority). Click one to read it. The `explore` view filters every page by leading emotion, mood, narration mode or theme and ranks the results by any Jev score (`src/domain/explore.ts`).
- **Insights** (`src/domain/insights.ts`): where the book turns, the most volatile stretch, emotional range, dialogue share, the strongest theme shift and the tension trend, each computed from Jev answers.
- **Charts:** DNA (with the leading emotion per third, the intensity peak and the calmest and most intense stretches), spectrogram (a ridgeline of the eight emotions), pulse (with every extreme page marked), mood, narration, shape, texture beside whole book, themes (a ridgeline of the ten strongest themes across the book) and neighbours.

## What Jev asks every page

A page is up to 1,800 characters. Each page is one request with 36 independent questions (speculative fan-out):

| Group | Primitive | Dimensions |
| --- | --- | --- |
| Emotions | 8 × Score | Plutchik: joy, trust, fear, surprise, sadness, disgust, anger, anticipation |
| Texture | 7 × Score | pace, tension, interiority, imagery, ideas, humour, light |
| Mood | Choice of 11 | meditative, idyllic, melancholic, tender, playful, mysterious, suspenseful, kinetic, grim, solemn, everyday |
| Narration | Choice of 9 | action, dialogue, description, introspection, exposition, digression, document, verse, paratext |
| Themes | 19 × Noul | love, family, friendship, death, war, power, money, crime, faith, nature, journey, home, memory, loneliness, identity, freedom, art, science, supernatural |

After the pages, one more request covers the whole book, using six evenly sampled excerpts. It asks for:

- genre (Choice of 12);
- era (Choice of 9);
- six scales: reality, scope, hope, character vs plot, density and audience.

Anything that can be computed is computed in code, not asked: length-weighted means, story shape (correlation of the light curve with Vonnegut's six arcs, Reagan et al. 2016), volatility, climax, stillest, brightest and darkest pages, and the theme heatmap. Pages Jev marks as paratext (contents, licence, title page) are excluded from stats.

All dimensions live in one place, `shared/catalog.ts`. The Jev questions, the response parser, the charts and the map all read from it. Changing wording bumps `RUBRIC_VERSION`.

## The map

Each book has an 85-dimensional fingerprint of named coordinates: emotions, texture, mood, narration, themes, arc and profile. Because every axis has a meaning, the map's axis labels come straight from the principal-component loadings.

`src/domain/pca.ts` builds the map with deterministic power iteration and three components:

1. Features are standardised.
2. Missing values are imputed with the mean.
3. Each group's weight is divided by √(group size).

Presets (feel / about / craft) and sliders reweight the map instantly without calling Jev again. Neighbours are ranked by cosine similarity.

**Regions** (`src/domain/clusters.ts`) group the books on whatever the current view shows: deterministic k-means in the 2 or 3 displayed coordinates, with k from 2 to 7 picked by silhouette. Each region is named in code from the features whose mean differs most from the corpus (in standard deviations, favouring the view's axes and weighted groups), using the word list in `src/domain/region-words.ts`, e.g. "Playful realm of laughter" or "Quiet cove of ideas". They appear as translucent outlined areas (in 3D, the on-screen silhouette of each region's convex hull, reshaping as the camera orbits), with a legend: hover a region to highlight it, click it to fly there.

The reference atlas (`public/atlas.json`) contains only books Jev has really read. It is built from the top of the 500-book list:

`public/atlas.json` holds the fingerprints of every fully read book. `npm run corpus` rewrites it at the end of a run; `XBOOK_ATLAS` serves it from another path, such as a persistent volume.

## The Pelevin corpus

```sh
npm run pelevin:ingest -- --dir="/path/to/Пелевин_EPUB"   # parse, dedupe and replace the store's books
npm run pelevin:eda                                        # bag-of-words dataset for the blog (needs pymorphy3, numpy, scikit-learn, scipy)
```

The ingest (`scripts/ingest-pelevin.ts`) reads EPUBs in spine order, splits collections into works, and deduplicates by content (word 8-gram shingles, containment ≥ 0.8), so a story printed in five collections is kept once. Anthologies keep only Pelevin's own pieces; translations of other authors are excluded. The curated result, with years, forms, English titles and every exclusion with its reason, is `data/pelevin.json`. Plain texts are cached in `node_modules/.cache/pelevin/` and never enter the repository.

## Corpus store

Full analyses of the corpus live in one SQLite file, `data/xbook.db`. It uses the built-in `node:sqlite`, so there are no native dependencies. The file is git-ignored, and `XBOOK_DB` overrides the path.

```sh
npm run corpus -- --dry                    # print the exact page count and cost
npm run corpus -- --max-usd=3              # read every missing page, write ru/en briefs and public/atlas.json
npm run corpus -- --briefs-only            # only the missing briefs (--brief-langs=en,ru by default)
```

Each answer is written as soon as it arrives. A rerun only pays for pages that are still missing, and the `--max-usd` cap stops a run cleanly.

The store keeps the source of truth and nothing derived:

| Table | Contents |
| --- | --- |
| `books` | metadata (year, form, English title, chronological rank) and the normalised text |
| `segments` | exact page boundaries |
| `analyses` | raw Jev answer per page and rubric, with input tokens |
| `profiles` | whole-book request |
| `briefs` | OpenRouter answer per language (ru/en), tokens and cost |
| `runs` | spend per run |

Fingerprints, maps and charts are recomputed from these rows, so a rubric change or a new chart never requires migrating data. Answers are keyed by `RUBRIC_VERSION`, so old and new rubrics can coexist. The schema is plain SQL with JSON in `TEXT` columns and is versioned with `PRAGMA user_version`. To deploy, the file can ship as is on a persistent volume, or it can move to libSQL/Turso or to Postgres (JSON becomes `JSONB`) without changes to the model. All SQL is in `server/store.ts`.

### Corpus in the UI

The web server opens the store read-only, once and only when it is first needed. It never creates, migrates or writes the file, so `npm run corpus` can keep writing while the app is running. If there is no file, the list is empty and book requests return 404.

| Route | Returns |
| --- | --- |
| `GET /api/corpus` | `{ available, books }`: for each work, id, title, English title, year, form, rank, pages, chars, pages analysed, `complete` and `briefed` / `briefedLangs` |
| `GET /api/corpus/pv-{slug}` | metadata, a short excerpt per page, page boundaries, analyses in page order, profile and the latest brief per language |
| `GET /api/corpus/pv-{slug}/page/{n}` | the full text of one page |
| `GET /api/corpus/top-pages?per=5` | the strongest pages per Plutchik emotion, with a one-sentence quote each |
| `GET /api/corpus-stats` | corpus-wide totals and distributions |

Ids look like `pv-chapaev-i-pustota`. Book payloads carry a weak `ETag` built from the stored answers, with `Cache-Control: no-cache`, so repeat visits get a `304`, and are compressed with brotli or gzip through `node:zlib`.

Corpus books open at `#/book/pv-{slug}` and are read-only: there are no analyze, delete or rewrite-brief actions. Tokens and cost come from the usage stored with each answer.

## Text policy and local mode

The books are under copyright. The corpus API never sends a whole book: a book payload carries a ≤220-character excerpt per page, and the reader fetches the full text of one page at a time from `GET /api/corpus/:id/page/:n`, rate limited per client (`CORPUS_PAGES_PER_MINUTE`, 60 by default). `CORPUS_FULL_TEXT=1` restores full payloads for private use.

Uploading your own books (EPUB, FB2, TXT, Markdown), analysing them in the browser and writing their briefs exist only in local mode: `npm run dev`, or `LOCAL_MODE=1`. On the public site (`NODE_ENV=production` without `LOCAL_MODE`) the upload UI is hidden and `/api/analyze`, `/api/profile` and `/api/brief` return 404, so the API keys are never spent by visitors.

## Layout

```
shared/          dimension catalog (en/ru labels) and types shared by server and client
server/          Express: Jev adapter, OpenRouter brief, SQLite store, read-only corpus API, local mode, validation, Vite middleware
scripts/         ingest-pelevin.ts (EPUBs → store), analyze-corpus.ts (full reads → SQLite, briefs, atlas), eda-pelevin.py (blog dataset)
data/            pelevin.json (curated works), xbook.db (corpus store, git-ignored)
public/          atlas.json (fingerprints), blog/ (EDA dataset)
src/i18n/        language and theme
src/domain/      pure logic: text, stats, arcs, fingerprint, PCA, clusters, atlas, cost, dossier, export
src/storage/     IndexedDB library (local mode), read-only corpus repository
src/services/    HTTP client, local mode, background analyzer
src/features/    home, search, library, book (dashboard, charts, reader), map, blog
src/ui/          scene, wordmark, charts primitives, pixel strips
```

## Checks

```sh
npm test                           # unit: segmentation, stats, arcs, fingerprint, PCA, cost, dossier, map axes, Jev + brief adapters, validation, OPDS
npx playwright install chromium
npm run test:e2e                   # search, book page + brief, reader, export, import, resume, 2D/3D map, corpus pages, local and public modes, phone width
npm run build
```

Integration contract: [TypeSafe HTTP API](https://docs.typesafe.ai/api), [Score](https://docs.typesafe.ai/primitives/score), [Choice](https://docs.typesafe.ai/primitives/choice), [Noul](https://docs.typesafe.ai/primitives/noul), [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring). Jev is requested as `jev-latest`; the actual model version is stored with every answer.
