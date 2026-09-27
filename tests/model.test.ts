import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOTIONS, MODES, MOODS, TEXTURES, THEMES } from "../shared/catalog.ts";
import type { SegmentAnalysis } from "../shared/types.ts";
import { bookStats, dominantEmotion, isParatext, moments, series, storyArc } from "../src/domain/analysis.ts";
import { DEMO_MODEL, SAMPLE_BOOK, demoAnalyses, fixtureCorpus } from "./fixtures/synthetic.ts";
import { buildCsv, buildExport } from "../src/domain/export.ts";
import { ALL_FEATURES, DEFAULT_WEIGHTS, fingerprintFrom, vectorize } from "../src/domain/fingerprint.ts";
import { embed, neighbours } from "../src/domain/pca.ts";
import { normalize, segmentText } from "../src/domain/text.ts";
import { JEV_USD_PER_MTOK, spend, usd } from "../src/domain/cost.ts";
import { buildDossier } from "../src/domain/dossier.ts";
import { axisOptions, buildAxis } from "../src/features/map/axes.ts";
import { MAP_PRESETS, matchPreset } from "../src/features/map/presets.ts";
import { canonFindings } from "../src/domain/canon.ts";
import { cluster, findRegions, silhouette } from "../src/domain/clusters.ts";
import { applyShelf, readState, writeState } from "../src/features/library/shelf.ts";
import type { Fingerprint } from "../src/domain/fingerprint.ts";
import { bookInsights, dnaInsights } from "../src/domain/insights.ts";
import { explorePages } from "../src/domain/explore.ts";

const fill = <K extends string>(items: readonly { id: K }[], v: number) => Object.fromEntries(items.map((i) => [i.id, v])) as Record<K, number>;

function analysis(overrides: Partial<SegmentAnalysis> = {}): SegmentAnalysis {
  return {
    emotions: fill(EMOTIONS, 0.1),
    emotionConfidence: fill(EMOTIONS, 0.8),
    texture: fill(TEXTURES, 0.5),
    textureConfidence: fill(TEXTURES, 0.8),
    mood: { ...fill(MOODS, 0), everyday: 1 },
    moodConfidence: 0.9,
    mode: { ...fill(MODES, 0), dialogue: 1 },
    modeConfidence: 0.9,
    themes: fill(THEMES, 0.1),
    model: "test",
    rubric: "test",
    ...overrides,
  };
}

test("segmentation preserves every normalized character with stable contiguous offsets", () => {
  for (const text of ["word ".repeat(4301), "😀".repeat(2011), "a".repeat(2400), "first\n\nsecond\n\n" + "third ".repeat(701)]) {
    for (const mode of ["pages", "paragraphs"] as const) {
      const normalized = normalize(text),
        parts = segmentText(normalized, mode);
      assert.equal(parts.map((s) => s.text).join(""), normalized);
      assert.deepEqual(parts, segmentText(normalized, mode));
      parts.forEach((s, i) => {
        assert.equal(s.start, i ? parts[i - 1].end : 0);
        assert.equal(s.text, normalized.slice(s.start, s.end));
        assert.ok(s.text.length <= 1800);
        assert.ok(s.end > s.start);
        assert.ok(!/[\uD800-\uDBFF]$/.test(s.text));
      });
    }
  }
});

test("normalization and paragraph boundaries are reproducible", () => {
  assert.equal(normalize("  cafe\u0301  \r\n\r\n\r\n next\tword "), "café\n\nnext word");
  assert.deepEqual(
    segmentText("one\n\ntwo\n\nthree", "paragraphs").map((p) => p.text),
    ["one\n\n", "two\n\n", "three"],
  );
  assert.deepEqual(segmentText("", "pages"), []);
  assert.throws(() => segmentText("abc", "pages", 0));
});

test("neutral pages are not forced into an emotion", () => {
  assert.equal(dominantEmotion(analysis()), "neutral");
  assert.equal(dominantEmotion(analysis({ emotions: { ...fill(EMOTIONS, 0.1), joy: 0.8 } })), "joy");
  assert.equal(dominantEmotion(null), "neutral");
});

test("paratext pages are excluded from book statistics and series", () => {
  const segments = segmentText("a ".repeat(2000), "pages");
  assert.equal(segments.length, 3);
  const toc = analysis({ mode: { ...fill(MODES, 0), paratext: 0.9 }, emotions: fill(EMOTIONS, 0.9) });
  const analyses = [toc, analysis(), null];
  assert.ok(isParatext(toc));
  const stats = bookStats(segments, analyses);
  assert.equal(stats.analyzed, 2);
  assert.equal(stats.narrative, 1);
  assert.equal(stats.emotions.joy, 0.1);
  assert.deepEqual(series(analyses, (a) => a.emotions.joy, 3), [null, 0.1, null]);
});

test("story arc recognises rising and falling curves and flat text", () => {
  const rise = Array.from({ length: 40 }, (_, i) => i / 39);
  assert.equal(storyArc(rise).shape, "rise");
  assert.equal(storyArc(rise.map((v) => 1 - v)).shape, "fall");
  assert.equal(storyArc(rise.map((v) => Math.sin(Math.PI * v))).shape, "icarus");
  assert.equal(storyArc(rise.map(() => 0.5)).shape, "flat");
});

test("moments point at distinct extreme pages", () => {
  const calm = analysis({ texture: { ...fill(TEXTURES, 0.5), pace: 0, tension: 0 } });
  const climax = analysis({ texture: { ...fill(TEXTURES, 0.5), pace: 1, tension: 1 } });
  const found = moments([calm, climax, analysis()]);
  assert.equal(found.find((m) => m.id === "climax")!.index, 1);
  assert.equal(found.find((m) => m.id === "still")!.index, 0);
  assert.equal(new Set(found.map((m) => m.index)).size, found.length);
});

test("moments explain themselves", () => {
  assert.ok(moments([analysis(), analysis()]).every((m) => m.hint.length > 0));
});

const emotional = (id: keyof ReturnType<typeof analysis>["emotions"], v: number, extra: Partial<SegmentAnalysis> = {}) =>
  analysis({ emotions: { ...fill(EMOTIONS, 0.1), [id]: v }, ...extra });

test("DNA insights name the leading emotion per part, the peak and the calm and intense stretches", () => {
  const toc = analysis({ mode: { ...fill(MODES, 0), paratext: 0.9 }, emotions: fill(EMOTIONS, 1) });
  const pages = [toc, ...Array.from({ length: 11 }, (_, i) => (i < 4 ? emotional("fear", 0.3) : i < 8 ? emotional("sadness", 0.5) : emotional("anger", 0.9)))];
  pages[10] = emotional("anger", 0.95);
  const d = dnaInsights(pages);
  assert.deepEqual(
    d.parts.map((p) => p.emotion),
    ["fear", "sadness", "anger"],
  );
  assert.equal(d.peak!.index, 10);
  assert.equal(d.peak!.emotion, "anger");
  assert.equal(d.calm!.from, 1);
  assert.ok(d.intense!.from >= 9 && d.intense!.to <= 11);
  const flat = dnaInsights(Array.from({ length: 12 }, () => emotional("joy", 0.5)));
  assert.equal(flat.calm, null);
  assert.equal(flat.intense, null);
  assert.equal(dnaInsights([analysis(), analysis(), analysis()]).parts[0].emotion, "neutral");
  assert.deepEqual(dnaInsights([]).parts, []);
});

test("book insights find the turn, the volatile stretch, range, dialogue, theme shift and tension trend", () => {
  const texture = (valence: number, tension: number) => ({ ...fill(TEXTURES, 0.5), valence, tension });
  const pages = Array.from({ length: 24 }, (_, i) =>
    analysis({
      texture: texture(i < 12 ? 0.8 : 0.2, i / 23),
      emotions: { ...fill(EMOTIONS, 0.1), joy: i >= 16 && i < 20 && i % 2 ? 0.9 : 0.1 },
      mode: { ...fill(MODES, 0), [i % 4 ? "dialogue" : "action"]: 1 },
      themes: { ...fill(THEMES, 0.1), death: i >= 16 ? 0.9 : 0.1 },
    }),
  );
  const b = bookInsights(pages);
  assert.equal(b.turn!.index, 12);
  assert.ok(b.turn!.before > b.turn!.after);
  assert.ok(b.volatile!.from >= 15 && b.volatile!.to <= 20 && b.volatile!.ratio > 1);
  assert.ok(Math.abs(b.range!.low - 0.2) < 1e-9 && Math.abs(b.range!.high - 0.8) < 1e-9);
  assert.equal(b.range!.emotions, 1);
  assert.equal(b.dialogue, 0.75);
  assert.equal(b.themeShift!.id, "death");
  assert.ok(Math.abs(b.themeShift!.from - 0.1) < 1e-9 && Math.abs(b.themeShift!.to - 0.9) < 1e-9);
  assert.ok(b.tension! > 0.9);
  const same = bookInsights(Array.from({ length: 10 }, () => analysis()));
  assert.equal(same.turn, null);
  assert.equal(same.themeShift, null);
  assert.equal(same.tension, null);
  assert.equal(bookInsights([null, null]).range, null);
});

test("quote explorer filters by leading emotion, mood, mode or theme and ranks by any score", () => {
  const toc = analysis({ mode: { ...fill(MODES, 0), paratext: 0.9 }, emotions: { ...fill(EMOTIONS, 0.1), anger: 0.99 } });
  const pages = [toc, emotional("anger", 0.5), emotional("joy", 0.7), emotional("anger", 0.9), null, emotional("anger", 0.5, { themes: { ...fill(THEMES, 0.1), war: 0.8 } })];
  assert.deepEqual(
    explorePages(pages, "emotions:anger", "emotions:anger").map((h) => h.index),
    [3, 1, 5],
  );
  assert.deepEqual(
    explorePages(pages, "emotions:anger", "page").map((h) => h.index),
    [1, 3, 5],
  );
  assert.deepEqual(
    explorePages(pages, "themes:war", "intensity").map((h) => [h.index, h.value]),
    [[5, 0.5]],
  );
  assert.equal(explorePages(pages, "mood:everyday", "texture:tension").length, 4);
  assert.equal(explorePages(pages, "mode:action", "page").length, 0);
  assert.deepEqual(
    explorePages(pages, "all", "emotions:joy").map((h) => h.index),
    [2, 1, 3, 5],
  );
  const big = Array.from({ length: 1800 }, (_, i) => emotional(i % 3 ? "fear" : "anger", (i % 97) / 97 + 0.2));
  const started = performance.now();
  const hits = explorePages(big, "emotions:anger", "emotions:anger");
  assert.equal(hits.length, 600);
  assert.ok(hits.every((h, i) => !i || hits[i - 1].value >= h.value));
  assert.ok(performance.now() - started < 200);
});

test("export reports status, model and token usage per page", () => {
  const segments = segmentText(SAMPLE_BOOK.text, "pages");
  const analyses = demoAnalyses(segments).map((a) => ({ ...a, usage: { input_tokens: 5000 } }));
  assert.equal(analyses.length, segments.length);
  assert.ok(analyses.every((a) => a.model === DEMO_MODEL));
  const book = { title: "t", author: "a", format: "TXT", source: "upload" };
  const dataset = buildExport(book, segments, analyses);
  assert.equal(dataset.status, "complete");
  assert.equal(dataset.brief, null);
  assert.equal(buildExport(book, segments, segments.map(() => null)).status, "not-analyzed");
  const csv = buildCsv(segments.slice(0, 2), analyses);
  assert.ok(csv.split("\r\n")[1].includes('"5000"'));
  assert.ok(csv.startsWith("\uFEFF\"id\""));
  assert.equal(csv.split("\r\n").length, 3);
});

test("fingerprints vectorize to the full, named feature space", () => {
  const segments = segmentText(SAMPLE_BOOK.text, "pages");
  const fp = fingerprintFrom(segments, demoAnalyses(segments))!;
  const vector = vectorize(fp);
  assert.equal(vector.length, ALL_FEATURES.length);
  // Missing book profile stays NaN so PCA can impute it instead of inventing zeros.
  assert.ok(vector.some((v) => Number.isNaN(v)));
  assert.ok(Math.abs(Object.values(fp.mode).reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.equal(fingerprintFrom(segments, segments.map(() => null)), undefined);
});

test("PCA map is deterministic, explains variance and places similar books together", () => {
  const items = fixtureCorpus();
  const a = embed(items, DEFAULT_WEIGHTS),
    b = embed(items, DEFAULT_WEIGHTS);
  assert.deepEqual(a.points, b.points);
  assert.equal(a.axes.length, 3);
  assert.ok(a.axes[0].explained >= a.axes[1].explained && a.axes[1].explained >= a.axes[2].explained && a.axes[0].explained < 1);
  assert.ok(a.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
  const near = neighbours(a.rows, "book-2", 1).map((n) => n.id);
  assert.deepEqual(near, ["book-3"]);
  const zero = embed(items, { emotions: 0, texture: 0, mood: 0, mode: 0, themes: 0, arc: 0, profile: 0 });
  assert.ok(zero.points.every((p) => p.x === 0 && p.y === 0 && p.z === 0));
});

test("spend adds Jev input tokens at list price and the brief at its reported cost", () => {
  const segments = segmentText(SAMPLE_BOOK.text, "pages");
  const analyses = demoAnalyses(segments).map((a) => ({ ...a, usage: { input_tokens: 5000 } }));
  analyses[0] = { ...analyses[0], usage: undefined } as never;
  const s = spend(analyses, undefined, { usage: { prompt_tokens: 1000, completion_tokens: 500, cost: 0.004 } } as never);
  assert.equal(s.jevRequests, segments.length - 1);
  assert.equal(s.jevTokens, (segments.length - 1) * 5000);
  assert.ok(Math.abs(s.jevUsd - (s.jevTokens / 1e6) * JEV_USD_PER_MTOK) < 1e-12);
  assert.equal(s.totalTokens, s.jevTokens + 1500);
  assert.equal(usd(0.0042), "$0.0042");
  assert.equal(usd(1.234), "$1.23");
});

test("dossier condenses the dashboard with ranked labels and short quotes", () => {
  const segments = segmentText(SAMPLE_BOOK.text, "pages");
  const d = buildDossier({ title: "T", author: "A", chars: SAMPLE_BOOK.text.length }, segments, demoAnalyses(segments), undefined, []);
  assert.equal(d.emotions.length, 8);
  assert.ok(d.emotions[0][1] >= d.emotions[1][1]);
  assert.ok(d.moments.every((m) => m.quote.length <= 221));
  assert.ok(JSON.stringify(d).length < 24_000);
});

test("map axes can be a principal component or one centred feature", () => {
  const items = fixtureCorpus().map((i) => ({ ...i, title: i.id, author: "", chars: 1, kind: "library" as const }));
  const embedding = embed(items, DEFAULT_WEIGHTS);
  const pc = buildAxis("pc0", items, embedding);
  assert.equal(pc.values.size, items.length);
  const tension = buildAxis("texture:tension", items, embedding);
  const values = [...tension.values.values()];
  assert.ok(Math.abs(values.reduce((s, v) => s + v, 0)) < 1e-9);
  assert.equal(tension.plus, "more tension");
});

test("map presets only use existing axes and recognise themselves", () => {
  const embedding = embed(fixtureCorpus(), DEFAULT_WEIGHTS);
  const ids = new Set(axisOptions(embedding).flatMap((g) => g.options.map((o) => o.id)));
  for (const p of MAP_PRESETS) {
    for (const axis of p.axes) assert.ok(ids.has(axis), `${p.id}: ${axis}`);
    assert.equal(matchPreset(p.mode, p.axes, p.weights), p.id);
  }
  assert.equal(matchPreset("2d", ["mode:dialogue", "themes:war"], DEFAULT_WEIGHTS), undefined);
});

test("clustering picks the number of groups by silhouette and is deterministic", () => {
  const blobs = [
    [0, 0],
    [5, 5],
    [0, 5],
  ].flatMap(([x, y], b) => Array.from({ length: 6 }, (_, i) => [x + Math.sin(i + b) * 0.3, y + Math.cos(i * 2 + b) * 0.3]));
  const labels = cluster(blobs)!;
  assert.equal(new Set(labels).size, 3);
  for (let b = 0; b < 3; b++) assert.equal(new Set(labels.slice(b * 6, b * 6 + 6)).size, 1);
  assert.deepEqual(cluster(blobs), labels);
  assert.ok(silhouette(blobs, labels) > 0.8);
  assert.equal(cluster(blobs.slice(0, 7)), null);
});

test("map regions partition the view and get distinct names from distinctive features", () => {
  const items = fixtureCorpus();
  const coords = new Map(items.map((b, i) => [b.id, [i < 4 ? -0.8 : 0.8, (i % 2) * 0.05]]));
  const regions = findRegions(items, coords, { weights: DEFAULT_WEIGHTS, axes: ["pc0", "pc1"] });
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.flatMap((r) => r.members).sort(), items.map((b) => b.id).sort());
  assert.equal(new Set(regions.map((r) => r.name)).size, 2);
  assert.ok(regions.every((r) => / of /.test(r.name) && r.traits.length > 0 && r.centre.length === 2));
  assert.deepEqual(findRegions(items, coords, { weights: DEFAULT_WEIGHTS, axes: ["pc0", "pc1"] }), regions);
  assert.deepEqual(findRegions(items.slice(0, 3), coords, { weights: DEFAULT_WEIGHTS, axes: [] }), []);
});

test("canon findings pair near-twins by different authors and need four books", () => {
  const books = fixtureCorpus().map((b, i) => ({ ...b, title: b.id, author: `author ${i}`, rank: i + 1 }));
  assert.equal(canonFindings(books.slice(0, 3)), null);
  const f = canonFindings(books)!;
  assert.equal(f.count, 8);
  const twin = f.twins[0];
  assert.equal(Math.floor(Number(twin.a.id.slice(5)) / 2), Math.floor(Number(twin.b.id.slice(5)) / 2));
  assert.ok(f.opposites.similarity < twin.similarity);
  const sameAuthor = books.map((b) => ({ ...b, author: b.id.slice(0, 6) + Math.floor(Number(b.id.slice(5)) / 2) }));
  assert.ok(canonFindings(sameAuthor)!.twins.every((p) => p.a.author !== p.b.author));
});

test("library shelf state round-trips through the URL and sorts missing values last", () => {
  const state = { view: "feel", sort: "light", dir: -1, q: "war", lens: "bleak", facets: { genre: "satire" } } as const;
  const params = Object.fromEntries(new URLSearchParams(writeState(state)));
  assert.deepEqual(readState(params), state);
  assert.deepEqual(readState({ view: "nope", sort: "nope", lens: "nope" }), { view: "overview", sort: "rank", dir: 1, q: "", lens: null, facets: {} });

  const [a, b] = fixtureCorpus();
  const row = (id: string, fingerprint?: Fingerprint, pages = 10) => ({ id, title: id, author: "", rank: null, gutenberg: null, pages, chars: 1, analysed: pages, complete: true, briefed: false, fingerprint });
  const rows = [row("none"), row("a", a.fingerprint, 900), row("b", b.fingerprint, 50)];
  for (const dir of [1, -1] as const) assert.equal(applyShelf(rows, { ...readState({}), sort: "light", dir }).at(-1)!.id, "none");
  assert.deepEqual(applyShelf(rows, { ...readState({}), lens: "doorstop" }).map((r) => r.id), ["a"]);
  assert.deepEqual(applyShelf(rows, { ...readState({}), q: "B" }).map((r) => r.id), ["b"]);
});
