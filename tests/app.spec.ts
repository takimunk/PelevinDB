import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { EMOTIONS, MODES, MOODS, TEXTURES, THEMES, GENRES, ERAS, PROFILE_SCALES } from "../shared/catalog.ts";
import { tokens } from "../src/domain/cost.ts";
import { segmentText } from "../src/domain/text.ts";
import { DEMO_PROFILE, demoAnalyses, fixtureCorpus, SAMPLE_BOOK } from "./fixtures/synthetic.ts";

const uniform = <K extends string>(ids: readonly { id: K }[], value: number) => Object.fromEntries(ids.map((d) => [d.id, value]));
const oneHot = <K extends string>(ids: readonly { id: K }[], pick: K) => Object.fromEntries(ids.map((d) => [d.id, d.id === pick ? 0.9 : 0.1 / (ids.length - 1)]));

const segmentAnswer = {
  emotions: { ...uniform(EMOTIONS, 0.2), joy: 0.6 },
  emotionConfidence: uniform(EMOTIONS, 0.8),
  texture: uniform(TEXTURES, 0.4),
  textureConfidence: uniform(TEXTURES, 0.8),
  mood: oneHot(MOODS, "meditative"),
  moodConfidence: 0.8,
  mode: oneHot(MODES, "description"),
  modeConfidence: 0.8,
  themes: { ...uniform(THEMES, 0.1), nature: 0.9 },
  model: "test-jev",
  rubric: "test",
  usage: { input_tokens: 5000 },
};

/** Every page answers a little differently so charts and extreme-page quotes have something to rank. */
function pageAnswer(n: number) {
  const wave = (k: number) => 0.5 + 0.4 * Math.sin(n * 0.7 + k);
  return {
    ...segmentAnswer,
    emotions: { ...uniform(EMOTIONS, 0.2), joy: wave(0), fear: wave(2) },
    texture: Object.fromEntries(TEXTURES.map((t, k) => [t.id, wave(k)])),
    themes: { ...uniform(THEMES, 0.1), nature: wave(1), love: wave(3) },
  };
}

const briefAnswer = {
  logline: "A quiet book about weather and waiting.",
  what: "Short scenes of calm and storm.",
  why: ["steady imagery", "clear arc", "gentle pace"],
  who: ["patient readers", "nature lovers", "anyone on a train"],
  skip: "Readers who want plot.",
  model: "test-brief",
  usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.0021 },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const atlas = {
  books: fixtureCorpus().map((f, i) => ({
    id: `pg-${900 + i}`,
    title: ["Walden", "Meditations", "Moby Dick", "Emma", "Dracula", "Ulysses", "Candide", "Hamlet"][i],
    author: "Fixture Author",
    gutenberg: 900 + i,
    chars: 400_000,
    pagesRead: 48,
    fingerprint: f.fingerprint,
  })),
};

const profileAnswer = {
  genre: oneHot(GENRES, GENRES[0].id),
  genreConfidence: 0.8,
  era: oneHot(ERAS, ERAS[0].id),
  eraConfidence: 0.8,
  scales: uniform(PROFILE_SCALES, 0.5),
  scaleConfidence: uniform(PROFILE_SCALES, 0.8),
  model: "test-jev",
  rubric: "test",
};

const canonText = SAMPLE_BOOK.text.slice(0, 60_000);
const canonSegments = segmentText(canonText, "pages");
const canonBook = {
  id: "pg-901",
  title: "Meditations",
  author: "Fixture Author",
  rank: 2,
  gutenberg: "901",
  pages: canonSegments.length,
  chars: canonText.length,
  text: canonText,
  segments: canonSegments.map((s) => [s.start, s.end]),
  analyses: demoAnalyses(canonSegments).map((a) => ({ ...a, usage: { input_tokens: 5000 } })),
  profile: DEMO_PROFILE,
  brief: briefAnswer,
};
const canonList = {
  available: true,
  books: [
    { id: "pg-901", title: "Meditations", author: "Fixture Author", rank: 2, gutenberg: "901", pages: canonBook.pages, chars: canonBook.chars, analysed: canonBook.pages, complete: true, briefed: true },
    { id: "pg-903", title: "Emma", author: "Fixture Author", rank: 5, gutenberg: "903", pages: 120, chars: 216_000, analysed: 60, complete: false, briefed: false },
  ],
};

// The dev server may hold a real corpus; tests that need one mock it explicitly.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/corpus", (route) => route.fulfill({ json: { available: false, books: [] } }));
});

async function upload(page: Page, name: string, content: string | Buffer) {
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
  });
}

/** Terminal buttons render as `[ label ]`; the brackets are CSS content and part of the accessible name. */
const button = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^\\W*${label}\\W*$`) });

async function openReader(page: Page, index = 1) {
  await expect(page.locator(".book-title")).toBeVisible();
  await page.goto(`${page.url().split("?")[0]}?page=${index}`);
  await expect(page.locator(".reader-text")).toBeVisible();
}

test("home search finds the library, the atlas and the Gutenberg catalog", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/catalog/search?*", (route) =>
    route.fulfill({ json: { hits: [{ id: "205", title: "Walden, and On The Duty Of Civil Disobedience", author: "Henry David Thoreau", language: "en" }] } }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "xbook" })).toBeVisible();
  await expect(page.getByRole("button", { name: "upload epub · fb2 · txt" })).toBeVisible();

  const search = page.getByRole("combobox", { name: "Search books" });
  await search.fill("Walden");
  await expect(page.getByRole("option", { name: /MAP\s*Walden/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Walden, and On The Duty/ })).toBeVisible();
  await page.getByRole("option", { name: /MAP\s*Walden/ }).click();
  await expect(page).toHaveURL(/#\/map\?focus=pg-900/);
  await expect(page.locator(".star-card")).toContainText("Walden");
  expect(errors).toEqual([]);
});

test("analysed book shows cost, radar, brief, quotes, every chart, the reader and exports the dataset", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: true, brief: true } }));
  let n = 0;
  let dossier: Record<string, unknown> | null = null;
  await page.route("**/api/analyze", (route) => route.fulfill({ json: pageAnswer(n++) }));
  await page.route("**/api/profile", (route) => route.fulfill({ json: profileAnswer }));
  await page.route("**/api/brief", (route) => {
    dossier = route.request().postDataJSON();
    return route.fulfill({ json: briefAnswer });
  });
  await page.goto("/");
  const text = Array.from({ length: 14 }, (_, i) => `Chapter ${i + 1}. ${i % 2 ? "The storm broke over the harbour." : "A calm morning by the sea."} `.repeat(90)).join("\n\n");
  await upload(page, "sea.txt", text);
  await button(page, "analyze").click();
  await expect(page.locator(".data-badge")).toContainText("complete");

  await expect(page.locator(".brief-logline")).toHaveText(briefAnswer.logline);
  expect(dossier).toMatchObject({ dossier: { title: "sea" } });
  expect(JSON.stringify(dossier)).not.toContain("storm broke over the harbour. The storm broke over the harbour. The storm broke over the harbour. The storm broke over the harbour.");
  await expect(page.locator(".cost")).toContainText("$");
  await expect(page.locator(".hero-radar svg")).toBeVisible();
  await expect(page.locator(".quotes li").first()).toBeVisible();
  for (const title of ["BRIEF", "QUOTES", "INSIGHTS", "DNA", "SPECTROGRAM", "PULSE", "MOOD", "NARRATION", "SHAPE", "TEXTURE", "WHOLE BOOK", "THEMES", "NEIGHBOURS"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "NEURAL TRACE" })).toHaveCount(0);
  const headings = await page.locator(".panel-head h3").allTextContents();
  expect(headings.slice(0, 2)).toEqual(["BRIEF", "QUOTES"]);
  await expect(page.locator(".hero-strip .pixels i")).toHaveCount(85);
  await expect(page.locator(".ridge-themes .ridge-row svg")).toHaveCount(10);
  await expect(page.locator(".ridge-emotions .ridge-row svg")).toHaveCount(8);
  await expect(page.locator(".neighbours")).toContainText(/Walden|Meditations|Moby Dick|Emma|Dracula|Ulysses|Candide|Hamlet/);
  await expect(page.locator(".insights")).toContainText("dialogue");
  await expect(page.locator(".chart-caption")).toContainText("peaks on p.");
  await expect(page.locator(".pulse-marks li")).toHaveCount(await page.locator(".quotes li").count());

  const texture = (await page.getByRole("heading", { name: "TEXTURE", exact: true }).boundingBox())!;
  const whole = (await page.getByRole("heading", { name: "WHOLE BOOK", exact: true }).boundingBox())!;
  expect(Math.abs(texture.y - whole.y)).toBeLessThan(4);
  expect(whole.x).toBeGreaterThan(texture.x + 300);

  await page.locator(".quotes li button").first().click();
  await expect(page.locator(".reader-text")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader")).toHaveCount(0);

  await page.locator(".pulse-marks button").first().click();
  await expect(page.locator(".reader-text")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "explore", exact: true }).click();
  await page.getByRole("combobox", { name: "show" }).selectOption("emotions:fear");
  await expect(page.getByRole("combobox", { name: "sort by" })).toHaveValue("emotions:fear");
  const hits = page.locator(".explorer-hits li");
  await expect(hits.first()).toBeVisible();
  const scores = (await page.locator(".hit-score").allTextContents()).map((s) => Number(s.trim().split(" ").at(-1)));
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  await page.getByRole("combobox", { name: "sort by" }).selectOption("page");
  const order = (await page.locator(".hit-page").allTextContents()).map((s) => Number(s.slice(2)));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await hits.first().locator("button").click();
  await expect(page.locator(".reader-page")).toContainText(String(order[0]));
  await page.keyboard.press("Escape");

  await openReader(page, 3);
  await expect(page.locator(".reader-page")).toContainText("3");
  await expect(page.locator(".reader .pixels i")).toHaveCount(54);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator(".reader-page")).toContainText("4");
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader")).toHaveCount(0);

  await button(page, "export").click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON · full dataset" }).click();
  const dataset = JSON.parse(await readFile((await (await downloaded).path())!, "utf8"));
  expect(dataset.schema).toBe("xbook.book.v2");
  expect(dataset.brief.logline).toBe(briefAnswer.logline);
  expect(dataset.segments.length).toBe(n);
  expect(dataset.segments[0].analysis.usage.input_tokens).toBe(5000);
  expect(errors).toEqual([]);
});

test("TXT import has no invented scores; blank and unsupported files fail clearly", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: false } }));
  await page.goto("/");
  await upload(page, "journey.txt", "A calm morning.\n\nA storm is coming.");
  await expect(page.locator(".book-title")).toHaveText("journey");
  await expect(button(page, "analyze")).toBeDisabled();
  await expect(page.locator(".analysis-note")).toContainText("TYPESAFE_API_KEY");
  await expect(page.locator(".data-badge")).toContainText("0%");
  await expect(page.locator(".preview")).toContainText("What Jev measures on each page");
  await openReader(page);
  await expect(page.locator(".reader-text")).toContainText("A calm morning.");

  await upload(page, "empty.txt", "   ");
  await expect(page.getByRole("alert")).toContainText("No text found");
  await page.locator("input[type=file]").setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert")).toContainText("Supported formats: EPUB");
});

test("FB2 extracts metadata and excludes notes", async ({ page }) => {
  await page.goto("/");
  await upload(
    page,
    "book.fb2",
    '<?xml version="1.0"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Тестовая книга</book-title><author><first-name>Анна</first-name><last-name>Тестова</last-name></author></title-info></description><body><section><p>Первая история.</p><p>Вторая история.</p></section></body><body name="notes"><p>Скрытая сноска</p></body><binary>secret</binary></FictionBook>',
  );
  await expect(page.locator(".book-title")).toHaveText("Тестовая книга");
  await expect(page.locator(".book-author")).toHaveText("Анна Тестова");
  await openReader(page);
  await expect(page.locator(".reader-text")).toContainText("Первая история.");
  await expect(page.locator(".reader-text")).not.toContainText("Скрытая сноска");
});

test("EPUB follows spine order and reads XHTML chapters with self-closing tags", async ({ page }) => {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  zip.file(
    "OPS/book.opf",
    '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Spine order</dc:title><dc:creator>Test Writer</dc:creator></metadata><manifest><item id="b" href="second.xhtml"/><item id="a" href="first.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
  );
  zip.file("OPS/second.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title/></head><body><p>SECOND chapter</p></body></html>');
  zip.file("OPS/first.xhtml", '<html><body><p>FIRST chapter</p><script>alert("xss")</script></body></html>');
  await page.goto("/");
  await upload(page, "book.epub", await zip.generateAsync({ type: "nodebuffer" }));
  await expect(page.locator(".book-title")).toHaveText("Spine order");
  await openReader(page);
  await expect(page.locator(".reader-text")).toHaveText(/FIRST chapter\s+SECOND chapter/);
});

test("analysis survives a partial failure and resumes without recomputing finished pages", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: true } }));
  let count = 0,
    profiles = 0,
    fail = true;
  await page.route("**/api/analyze", async (route) => {
    count++;
    if (fail && count === 2) {
      await new Promise((r) => setTimeout(r, 150));
      return route.fulfill({ status: 503, json: { error: "Try resuming." } });
    }
    await route.fulfill({ json: segmentAnswer });
  });
  await page.route("**/api/profile", (route) => {
    profiles++;
    return route.fulfill({ json: profileAnswer });
  });
  await page.goto("/");
  await upload(page, "partial.txt", "Some story text. ".repeat(220));
  await button(page, "analyze").click();
  await expect(page.getByRole("alert")).toContainText("Try resuming.");
  const before = count;
  fail = false;
  await button(page, "resume").click();
  await expect(page.locator(".data-badge")).toContainText("complete");
  expect(count).toBe(before + 1);
  expect(profiles).toBe(1);
  await expect(page.getByRole("heading", { name: "SPECTROGRAM" })).toBeVisible();
  await expect(button(page, "map")).toBeEnabled();
});

test("map switches 2D/3D, takes any answer as an axis, shows coordinates on hover and fits a phone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/map");
  await expect(page.getByRole("heading", { name: "85 dimensions in 3" })).toBeVisible();
  await expect(page.locator(".graph canvas")).toBeVisible();
  await expect(page.locator(".node-label")).toHaveCount(8);
  await expect(page.getByRole("group", { name: "Regions" }).getByRole("button")).toHaveCount(2);

  const walden = page.locator('.node-label[data-node="pg-900"]');
  await expect(walden).toHaveAttribute("style", /translate/);
  const where = () => walden.evaluate((el) => /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform)!.slice(1).map(Number));
  const stage = (await page.locator(".graph canvas").boundingBox())!;
  const at = await where();
  await page.mouse.move(stage.x + at[0], stage.y + at[1]);
  await expect(page.locator(".node-card")).toContainText("Walden");
  await expect(page.locator(".node-card .pixels i")).toHaveCount(85);

  await page.mouse.move(stage.x + 5, stage.y + stage.height / 2);
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  expect(await where()).not.toEqual(at);

  await page.getByRole("button", { name: "2d", exact: true }).click();
  await expect(page.getByRole("heading", { name: "85 dimensions in 2" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "z axis" })).toHaveCount(0);
  const flat = await where();
  await page.getByRole("combobox", { name: "x axis" }).selectOption("texture:tension");
  await expect(page.locator(".graph-axes")).toContainText("tension");
  await expect.poll(where).not.toEqual(flat);
  await page.getByRole("button", { name: /reset axes/ }).click();
  await expect(page.getByRole("combobox", { name: "x axis" })).toHaveValue("pc0");

  await page.getByRole("button", { name: "Laughing in the dark" }).click();
  await expect(page.getByRole("button", { name: "Laughing in the dark" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "x axis" })).toHaveValue("texture:humor");
  await expect(page.locator(".map-question")).toContainText("dark comedy");
  await page.getByRole("combobox", { name: "x axis" }).selectOption("texture:tension");
  await expect(page.locator(".map-question")).toHaveText("Custom view.");

  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("button", { name: "About", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Meditations Fixture Author/ }).click();
  await expect(page.locator(".star-card")).toContainText("Meditations");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/#/", "/#/map", "/#/library"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
  }
  await page.getByRole("button", { name: "Find book" }).click();
  await expect(page.getByRole("dialog", { name: "Find book" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Find book" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("canon books open read-only from the library, the map and search with brief, charts and stored cost", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/status", (route) => route.fulfill({ json: { configured: true, brief: true } }));
  await page.route("**/api/corpus", (route) => route.fulfill({ json: canonList }));
  const fetched: string[] = [];
  await page.route("**/api/corpus/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    fetched.push(id);
    return id === canonBook.id ? route.fulfill({ json: canonBook }) : route.fulfill({ status: 404, json: { error: "This book is not in the corpus." } });
  });

  await page.goto("/#/library");
  await expect(button(page, "canon")).toHaveAttribute("aria-pressed", "true");
  const rows = page.locator(".canon-table a.bt-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Meditations");
  await expect(rows.nth(1)).toContainText("50%");
  await page.getByRole("button", { name: /^pages/ }).click();
  await page.getByRole("button", { name: /^pages/ }).click();
  await expect(page.getByRole("columnheader", { name: /pages/ })).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first()).toContainText("Emma");
  await rows.filter({ hasText: "Meditations" }).click();

  await expect(page).toHaveURL(/#\/book\/pg-901$/);
  await expect(page.locator(".book-title")).toHaveText("Meditations");
  await expect(page.locator(".corpus-badge")).toHaveText("corpus · read by jev");
  await expect(page.locator(".eyebrow").first()).toContainText("canon #2");
  await expect(page.locator(".data-badge")).toContainText("complete");
  await expect(page.locator(".brief-logline")).toHaveText(briefAnswer.logline);
  await expect(page.locator(".book-facts")).toContainText(tokens(canonBook.pages * 5000 + 1500));
  await expect(page.locator(".cost")).toContainText("$");
  for (const title of ["BRIEF", "QUOTES", "INSIGHTS", "DNA", "SPECTROGRAM", "PULSE", "MOOD", "NARRATION", "SHAPE", "TEXTURE", "WHOLE BOOK", "THEMES", "NEIGHBOURS"]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator(".hero-radar svg")).toBeVisible();
  await expect(page.locator(".hero-strip .pixels i")).toHaveCount(85);
  for (const label of ["analyze", "resume", "write brief"]) await expect(button(page, label)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete book" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "rewrite" })).toHaveCount(0);
  await expect(button(page, "export")).toBeVisible();

  await page.getByRole("button", { name: "explore", exact: true }).click();
  await expect(page.locator(".explorer-hits li").first()).toBeVisible();
  await page.locator(".explorer-hits li button").first().click();
  await expect(page.locator(".reader-text")).toBeVisible();
  const shown = Number((await page.locator(".reader-page").textContent())!.match(/p\.(\d+)/)![1]);
  await expect(page.locator(".reader-text")).toContainText(canonSegments[shown - 1].text.slice(0, 40).trim());
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Map" }).click();
  await page.getByRole("button", { name: /Meditations Fixture Author/ }).click();
  await expect(page.locator(".star-card")).toContainText(`canon · jev read all ${canonBook.pages} pages`);
  await expect(page.getByRole("button", { name: /Meditations Fixture Author/ })).toContainText("▣");
  await button(page, "open book →").click();
  await expect(page).toHaveURL(/#\/book\/pg-901$/);
  await expect(page.locator(".brief-logline")).toHaveText(briefAnswer.logline);

  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search books" }).fill("Meditations");
  await page.getByRole("option", { name: /CAN\s*Meditations/ }).click();
  await expect(page.locator(".book-title")).toHaveText("Meditations");
  expect(fetched).toEqual(["pg-901"]);

  await page.goto("/#/book/pg-999");
  await expect(page.getByRole("heading", { name: "404 · book not found" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/library?tab=canon");
  await expect(page.locator(".canon-table a.bt-row")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe("phone workflows", () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const width of [320, 390, 430]) {
    test(`library, book, reader, search and map work at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
      await page.route("**/api/status", (route) => route.fulfill({ json: { configured: false } }));
      await page.route("**/api/corpus", (route) => route.fulfill({ json: canonList }));
      await page.route("**/api/corpus/pg-901", (route) => route.fulfill({ json: canonBook }));
      const fits = async () => {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      };
      const touchTarget = async (selector: string) => {
        const box = await page.locator(selector).first().boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      };
      await page.goto("/");
      await fits();
      if (width === 390) await page.screenshot({ path: "/tmp/xbook-mobile-home.png", fullPage: true });
      await touchTarget(".nav a");
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
      await page.getByRole("button", { name: "Find book", exact: true }).tap();
      await page.getByRole("dialog", { name: "Find book" }).getByRole("combobox", { name: "Search books" }).fill("Meditations");
      await expect(page.getByRole("option", { name: /CAN\s*Meditations/ })).toBeVisible();
      await page.getByRole("button", { name: "Close search" }).tap();
      await expect(page.getByRole("dialog", { name: "Find book" })).toHaveCount(0);

      await page.getByRole("link", { name: "Library", exact: true }).tap();
      await expect(page.locator(".canon-cards > li")).toHaveCount(2);
      await expect(page.locator(".shelf-scroll")).toBeHidden();
      await page.locator(".shelf-filter-toggle").tap();
      await expect(page.getByRole("combobox", { name: "Filter by genre" })).toBeVisible();
      await page.locator(".shelf-filter-toggle").tap();
      await page.getByRole("combobox", { name: "Sort canon books" }).selectOption("pages");
      await page.getByRole("button", { name: "Reverse sort order" }).tap();
      await expect(page.locator(".canon-card-link").first()).toContainText("Emma");
      await page.locator(".canon-card-metrics summary").first().tap();
      await expect(page.locator(".canon-card-metrics dl").first()).toBeVisible();
      await fits();
      if (width === 390) await page.screenshot({ path: "/tmp/xbook-mobile-library.png", fullPage: true });
      await page.locator(".canon-card-link").filter({ hasText: "Meditations" }).tap();
      await expect(page.locator(".brief-logline")).toBeVisible();
      await fits();
      for (const selector of [".quotes", ".pulse-marks", ".neighbours", ".sliders", ".ridges"]) {
        const boxes = await page.locator(selector).evaluateAll((els) =>
          els.map((el) => ({
            client: el.clientWidth,
            scroll: el.scrollWidth,
          })),
        );
        for (const box of boxes) expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
      }
      if (width === 390) await page.screenshot({ path: "/tmp/xbook-mobile-book.png", fullPage: true });
      await page.getByRole("button", { name: "explore", exact: true }).tap();
      await page.getByRole("combobox", { name: "show" }).selectOption("emotions:fear");
      await page.locator(".explorer-hits li button").first().tap();
      await expect(page.locator(".reader-text")).toBeVisible();
      await expect(page.locator(".reader-analysis")).toBeHidden();
      await touchTarget(".reader-nav button");
      if (width === 390) await page.screenshot({ path: "/tmp/xbook-mobile-reader.png" });
      await page.getByRole("button", { name: "Show page analysis +" }).tap();
      await expect(page.locator(".reader-analysis")).toBeVisible();
      await fits();
      await page.getByRole("button", { name: "Hide page analysis −" }).tap();
      await page.getByRole("button", { name: "Next page" }).tap();
      await page.getByRole("button", { name: "Close reader" }).tap();
      await expect(page.locator(".reader")).toHaveCount(0);

      await page.getByRole("link", { name: "Map", exact: true }).tap();
      await expect(page.locator(".graph canvas")).toBeVisible();
      await expect(page.locator(".graph-touch-help")).toBeVisible();
      await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
      await page.getByRole("button", { name: "Reset map view" }).tap();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const meditations = page.locator('.node-label[data-node="pg-901"]');
      await expect(meditations).toHaveCSS("visibility", "visible");
      const point = await meditations.evaluate((el) =>
        /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/
          .exec((el as HTMLElement).style.transform)!
          .slice(1)
          .map(Number),
      );
      const canvasBox = (await page.locator(".graph canvas").boundingBox())!;
      await page.touchscreen.tap(canvasBox.x + point[0], canvasBox.y + point[1]);
      await expect(page.locator(".star-card")).toContainText("Meditations");
      await page.getByRole("button", { name: "Close card" }).tap();
      await page.getByRole("button", { name: /Meditations Fixture Author/ }).tap();
      await expect(page.locator(".star-card")).toContainText("Meditations");
      const graph = (await page.locator(".map-stage").boundingBox())!;
      const card = (await page.locator(".star-card").boundingBox())!;
      expect(card.y).toBeGreaterThanOrEqual(graph.y + graph.height);
      await fits();
      if (width === 390) await page.screenshot({ path: "/tmp/xbook-mobile-map.png" });
      await page.getByRole("button", { name: "Close card" }).tap();

      await page.getByRole("link", { name: "Overview", exact: true }).tap();
      await upload(page, "A-very-long-title-that-needs-to-wrap-on-a-phone.txt", "A calm morning. ".repeat(300));
      await fits();
      await page.getByRole("link", { name: "Library", exact: true }).tap();
      await button(page, "your books").tap();
      await expect(page.locator("a.bt-row .bt-author").first()).toBeVisible();
      await fits();
      await page.locator("a.bt-row").first().tap();
      await openReader(page);
      await fits();
      await page.getByRole("button", { name: "Close reader" }).tap();
      await page.setViewportSize({ width: 844, height: 390 });
      await openReader(page);
      await expect(page.locator(".reader-analysis")).toBeHidden();
      await page.getByRole("button", { name: "Close reader" }).tap();
      await fits();
      await page.goto("/#/map");
      await fits();
    });
  }
});
