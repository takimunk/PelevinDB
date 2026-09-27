# xbook

A terminal over books. Find a book in Project Gutenberg or upload your own (EPUB, FB2, TXT, Markdown). Jev (TypeSafe) reads it page by page, and xbook turns the answers into a CLI-style dashboard: emotions, pace, mood, narration, themes, story shape and genre. Every book sits on a shared 3D map, placed by meaning.

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
`xbookx.xyz` DNS, persistent corpus storage and runtime OpenPanel setup.

## Interface

The whole UI is monospace text: a tmux-style top bar, a status line, `[ bracket ]` buttons, `ls -l` tables, `less`-style reader. Keys: `/` or `⌘K` to find, `u` to upload, `1` `2` `3` to switch views, `←` `→` `q` in the reader.

- **ASCII WebGL** (`src/ui/ascii-gl.ts`): three.js renders into a target with one texel per character cell. Additive points turn density into brightness. A full-screen pass then picks a glyph from ` .·:-=+*%#@` and tints it. The desk shows a slowly turning chaos-game Sierpinski tetrahedron in LED colours.
- **Text charts** (`src/ui/term.tsx`, `src/features/book/charts/Text.tsx`): braille line plots, block gauges and bipolar sliders, drawn character by character, plus SVG ridgelines (one area chart per emotion or theme with a shared hover cursor).
- **Micro-pixel strips** (`src/ui/PixelStrip.tsx`): one pixel per Jev parameter, coloured by group, brightness = value. Hover a pixel to read `group.key value`. Strips appear:
  - on the dashboard header (85 fingerprint coordinates);
  - in the reader (54 page answers);
  - in the neighbours list;
  - on the map, when hovering a node.
- **Map** (`src/features/map/BookGraph.tsx`): a crisp vector view projected with a three.js camera. It shows square nodes (filled for your books), nearest-neighbour edges with similarity on hover, named axes and a grid, with labels placed without overlap.
  - 3D: `WASD` moves, `Q`/`E` go down and up, drag orbits.
  - 2D: a flat, straight-on view where `WASD` and drag pan and `Q`/`E` zoom.
  - In both, scroll zooms and `R` resets. Each axis is a principal component or any single Jev answer, such as tension × light.

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

```sh
npm run atlas -- --count=100        # 48 sampled pages per book, about $0.011 per book
npm run atlas -- --count=24 --pages=80
```

The script downloads texts from Gutenberg, analyses an even sample of pages and prints what the run cost. Answers are cached in `node_modules/.cache/xbook-atlas`, so an interrupted or extended run never pays twice.

## 500 greatest books

`data/greatest-500.json` ranks 500 public-domain works. Titles on more canon lists rank higher. The sources are:

- Wikipedia: Bokklubben World Library, The Big Read, Great Books of the Western World, Harvard Classics, Le Monde's 100 Books of the Century, Western canon;
- Gutenberg's "Best Books Ever" and "Classics of Literature" shelves.

Remaining places go to canonical authors' most-read works. `scripts/curate-greatest.py` rebuilds the list.

```sh
npm run greatest                    # English EPUBs into library/greatest-500/ (git-ignored)
```

Files are named `001 Dante Alighieri - The divine comedy.epub`, and the download resumes where it stopped. Only works in the public domain are on Gutenberg, so 20th-century books still under copyright are not on the list.

## Corpus store

Full analyses of the ranked canon live in one SQLite file, `data/xbook.db`. It uses the built-in `node:sqlite`, so there are no native dependencies. The file is git-ignored, and `XBOOK_DB` overrides the path.

```sh
npm run corpus -- --top=100 --dry          # download and page the texts, print the exact cost
npm run corpus -- --top=100 --max-usd=10   # read every page, then write briefs and public/atlas.json
```

Each answer is written as soon as it arrives. A rerun only pays for pages that are still missing, and the `--max-usd` cap stops a run cleanly.

The store keeps the source of truth and nothing derived:

| Table | Contents |
| --- | --- |
| `books` | metadata, rank and the normalised text |
| `segments` | exact page boundaries |
| `analyses` | raw Jev answer per page and rubric, with input tokens |
| `profiles` | whole-book request |
| `briefs` | OpenRouter answer, tokens and cost |
| `runs` | spend per run |

Fingerprints, maps and charts are recomputed from these rows, so a rubric change or a new chart never requires migrating data. Answers are keyed by `RUBRIC_VERSION`, so old and new rubrics can coexist. The schema is plain SQL with JSON in `TEXT` columns and is versioned with `PRAGMA user_version`. To deploy, the file can ship as is on a persistent volume, or it can move to libSQL/Turso or to Postgres (JSON becomes `JSONB`) without changes to the model. All SQL is in `server/store.ts`.

### Corpus in the UI

The web server opens the store read-only, once and only when it is first needed. It never creates, migrates or writes the file, so `npm run corpus` can keep writing while the app is running. If there is no file, the list is empty and book requests return 404.

| Route | Returns |
| --- | --- |
| `GET /api/corpus` | `{ available, books }`: for each book, id, title, author, rank, Gutenberg id, pages, chars, pages analysed, `complete` (every page read) and `briefed` |
| `GET /api/corpus/pg-{id}` | book metadata, text, stored page boundaries, analyses in page order (`null` for pages not read yet), profile and latest brief |

The id must match `pg-{gutenberg id}`. Book payloads carry a weak `ETag` built from the stored answers, with `Cache-Control: no-cache`, so repeat visits get a `304`. They are compressed with brotli or gzip through `node:zlib`, with no extra dependency. Compressed bodies are cached per ETag. War and Peace (1,782 pages) is 5.5 MB of JSON, which becomes 1.45 MB with gzip or 1.27 MB with brotli.

Canon books open at `#/book/pg-{id}` through the same book page as local books. `src/storage/books.ts` picks the source: the IndexedDB library or the read-only corpus repository (`src/storage/corpus.ts`, which fetches on demand and keeps the last 3 books in memory). Canon pages are read-only. They carry a `corpus · read by jev` badge, and there are no analyze, delete or rewrite-brief actions. Tokens and cost come from the usage stored with each answer. Where to find them:

- **Library:** the `~/canon` tab (`#/library?tab=canon`), with sortable columns.
- **Map:** ▣ marks canon books read in full; their card links to the book page.
- **Search:** results tagged `CAN`.
- **Neighbours** on any book page.

If you have your own fingerprinted copy of the same Gutenberg book, the map shows your copy instead of the canon node, and the canon page links to it.

## Storage, search, import

- **Library:** kept in IndexedDB. Analysis runs in the background on four workers and can be stopped and resumed; finished pages are never recomputed.
- **Search:** covers the library, the canon, the atlas and the Project Gutenberg catalog (official OPDS, through a caching server proxy).
- **Import:**
  - EPUB in OPF spine order. XHTML chapters are parsed as XML first, so self-closing `<title/>` tags no longer swallow the body.
  - FB2 without footnotes and binaries, including Windows-1251.
  - TXT and Markdown.
  - Limits: 20 MB files, 20M characters.
- **Export:** JSON `xbook.book.v2` (text, boundaries, every answer, profile, fingerprint, completeness) and CSV with formula-injection protection.

## Layout

```
shared/          dimension catalog and types shared by server and client
server/          Express: Jev adapter, OpenRouter brief, SQLite store, read-only corpus API, request validation, Gutenberg proxy, Vite middleware
scripts/         analyze-corpus.ts (full reads → SQLite), build-atlas.ts (sampled atlas), curate-greatest.py + fetch-greatest.ts (500 books)
data/            greatest-500.json (ranked list), xbook.db (corpus store, git-ignored)
src/domain/      pure logic: text, stats, arcs, fingerprint, PCA, atlas, cost, dossier, export
src/storage/     IndexedDB library store, read-only corpus repository, and the book source that picks between them
src/services/    HTTP client and background analyzer
src/io/          EPUB / FB2 / TXT import
src/app/         shell, router, importer
src/features/    home, search, library, book (dashboard, charts, reader), map
src/ui/          terminal primitives: ASCII WebGL, text grids, pixel strips
```

## Checks

```sh
npm test                           # unit: segmentation, stats, arcs, fingerprint, PCA, cost, dossier, map axes, Jev + brief adapters, validation, OPDS
npx playwright install chromium
npm run test:e2e                   # search, book page + brief, reader, export, import, resume, 2D/3D map, canon pages, phone width
npm run build
```

Integration contract: [TypeSafe HTTP API](https://docs.typesafe.ai/api), [Score](https://docs.typesafe.ai/primitives/score), [Choice](https://docs.typesafe.ai/primitives/choice), [Noul](https://docs.typesafe.ai/primitives/noul), [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring). Jev is requested as `jev-latest`; the actual model version is stored with every answer.
