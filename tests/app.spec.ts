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

/** Button by its label, ignoring case and surrounding symbols such as arrows. */
const button = (page: Page, label: string) => page.getByRole("button", { name: new RegExp(`^\\W*${label}\\W*$`, "i") });

/** Book page section heading; the section number ("01") is CSS content and part of the accessible name. */
const section = (page: Page, title: string) => page.getByRole("heading", { name: new RegExp(`^(\\d+\\s*)?${title}$`) });

/** A dashboard cell by its tiny title (upper-cased only by CSS). */
const cell = (page: Page, title: string) => page.locator(".cell").filter({ has: page.locator(".cell-head h3", { hasText: new RegExp(`^${title}$`) }) });

/** The book page order: title and actions, compact fingerprint, facts, plot development, brief, extreme pages, one dashboard of cells, insights last. */
async function expectBookLayout(page: Page) {
  await expect(page.locator(".hero-strip .pixels i")).toHaveCount(85);
  const titles = ["emotions over the book", "star chart", "pulse", "neighbours", "mood · narration", "story shape", "texture vs corpus", "whole book", "themes over the book"];
  await expect(page.locator(".cell-head h3")).toHaveText(titles);
  const y = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
  const order = [await y(".book-title"), await y(".title-actions"), await y(".hero-strip"), await y(".book-facts"), await y(".dna-panel"), await y(".brief-panel"), await y(".extremes-panel"), await y(".dash"), await y(".insights")];
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await expect(page.locator(".panel-head h3")).toHaveText(["Plot development", "Brief", "Extreme pages", "Insights"]);
  await expect(page.locator(".extremes-panel .quotes li")).toHaveCount(6);
  await expect(page.locator(".dash .quotes")).toHaveCount(0);
  const brief = (await page.locator(".brief-panel").boundingBox())!;
  const dash = (await page.locator(".dash").boundingBox())!;
  expect(Math.abs(brief.width - dash.width)).toBeLessThan(4);
  await expect(page.locator("[data-n]")).toHaveCount(0);
}

async function openReader(page: Page, index = 1) {
  await expect(page.locator(".book-title")).toBeVisible();
  await page.goto(`${page.url().split("?")[0]}?page=${index}`);
  await expect(page.locator(".reader-text")).toBeVisible();
}

const pelevinList = {
  available: true,
  books: [
    { id: "pv-chapaev", title: "Чапаев и Пустота", titleEn: "Chapaev and Void", year: 1996, kind: "novel", author: "Виктор Пелевин", rank: null, gutenberg: null, pages: 330, chars: 594_000, analysed: 0, complete: false, briefed: false },
    { id: "pv-omon", title: "Омон Ра", titleEn: "Omon Ra", year: 1992, kind: "novella", author: "Виктор Пелевин", rank: null, gutenberg: null, pages: 90, chars: 162_000, analysed: 45, complete: false, briefed: false },
  ],
};

const topPagesFixture = [
  { emotion: "joy", items: [{ id: "pv-omon", title: "Омон Ра", titleEn: "Omon Ra", year: 1992, page: 12, score: 0.94, quote: "Это было не сияние, не музыка – а что-то совсем иное." }] },
  { emotion: "fear", items: [{ id: "pv-chapaev", title: "Чапаев и Пустота", titleEn: "Chapaev and Void", year: 1996, page: 40, score: 0.99, quote: "Сказать, что я испугался – значит не сказать ничего." }] },
];

test("home starting points open the requested map, works and lines views", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pelevindb.lang", "ru"));
  await page.route("**/api/corpus", (route) => route.fulfill({ json: canonList }));
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/corpus/lines?*", (route) => route.fulfill({ json: {
    total: 1, read: 1, page: 1, pageSize: 25, maxPages: 5, pages: 1, rows: [], books: {},
    facets: { book: {}, kind: {}, decade: {}, flag: {}, act: {} },
  } }));

  await page.goto("/");
  const start = page.getByRole("region", { name: "С чего начать" });
  await expect(start.locator(".home-start-card")).toHaveCount(3);
  await start.getByRole("link", { name: "Посмотреть карту" }).click();
  await expect(page).toHaveURL(/#\/map\?view=laugh$/);
  await expect(page.getByRole("group", { name: "Вид" }).getByRole("button", { name: "2d" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Смех в темноте" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/#/");
  await start.getByRole("link", { name: "Смотреть произведения" }).click();
  await expect(page).toHaveURL(/#\/library\?view=themes&sort=love&dir=-1$/);
  await expect(page.getByRole("group", { name: "Столбцы" }).getByRole("button", { name: "темы" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table", { name: "Произведения Пелевина" }).getByRole("columnheader", { name: "любовь" })).toHaveAttribute("aria-sort", "descending");

  await page.goto("/#/");
  await start.getByRole("link", { name: "Читать цитаты" }).click();
  await expect(page).toHaveURL(/#\/library\?tab=lines&dim=joy$/);
  await expect(page.getByRole("radio", { name: "радость" })).toHaveAttribute("aria-checked", "true");

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/");
  const cards = await start.locator(".home-start-card").evaluateAll((items) => items.map((item) => item.getBoundingClientRect()));
  expect(cards.map((card) => Math.round(card.y))).toEqual([Math.round(cards[0].y), Math.round(cards[0].y), Math.round(cards[0].y)]);
  expect(Math.max(...cards.map((card) => card.height))).toBeLessThanOrEqual(130);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("home shows the wordmark, project links and top pages by emotion; search, language and theme switch", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/corpus", (route) => route.fulfill({ json: pelevinList }));
  await page.route("**/api/corpus/top-pages?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("per")).toBe("5");
    return route.fulfill({ json: topPagesFixture });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("pelevindb.lang", "en"));
  await page.reload();
  // Home shows the big logo in the hero; the header's small one stays out of the way (and out of the a11y tree).
  await expect(page.getByRole("heading", { level: 1, name: "PelevinDB" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("img", { name: "PelevinDB" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Source on GitHub", exact: true })).toHaveAttribute("href", "https://github.com/takimunk/pelevindb");
  await expect(page.getByRole("banner").getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/takimunk/pelevindb");
  await expect(page.getByRole("link", { name: "central dogma specialist" })).toHaveAttribute("rel", "noopener");
  const top = page.getByRole("region", { name: "The most emotional pages" });
  await expect(top.getByRole("heading", { level: 3 })).toHaveCount(8);
  const fear = top.getByRole("link", { name: /Chapaev and Void, page 40/ });
  await expect(fear).toContainText("1996 · 0.99");
  await expect(page.getByText(/Gutenberg|canon/i)).toHaveCount(0);
  await fear.click();
  await expect(page).toHaveURL(/#\/book\/pv-chapaev\?page=40$/);

  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1, name: "PelevinDB" })).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Search" });
  // The key listener attaches after the route renders; "/" only ever opens the dialog, so retrying is safe.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByRole("combobox", { name: "Search books" }).fill("void");
  await expect(dialog.getByRole("option", { name: /Chapaev and Void/ })).toBeVisible();
  await dialog.getByRole("combobox", { name: "Search books" }).fill("пустота");
  await dialog.getByRole("option", { name: /Chapaev and Void/ }).click();
  await expect(page).toHaveURL(/#\/book\/pv-chapaev$/);

  await page.goto("/#/");
  await page.getByRole("button", { name: "Russian" }).click();
  await expect(page.getByRole("link", { name: "Обзор", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 2, name: "Самые эмоциональные страницы" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Исходный код на GitHub", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.getByRole("button", { name: "английский" }).click();

  const theme = page.locator(".theme-toggle");
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.keyboard.press("4");
  await expect(page).toHaveURL(/#\/blog$/);
  await page.keyboard.press("5");
  await expect(page).toHaveURL(/#\/about$/);
  await page.keyboard.press("2");
  await expect(page.getByRole("heading", { level: 1, name: "Pelevin’s works" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "PelevinDB, home" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("home says so when the corpus has not been read yet", async ({ page }) => {
  await page.route("**/api/corpus/top-pages?*", (route) => route.fulfill({ status: 404, json: { error: "No corpus yet" } }));
  await page.goto("/");
  await expect(page.getByText("The pages have not been read yet.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const pageRow = (i: number) => ({
  id: "pv-omon",
  title: "Омон Ра",
  titleEn: "Omon Ra",
  year: 1992,
  kind: "novel",
  page: i + 1,
  quote: `Фраза номер ${i + 1}, которой начинается страница.`,
  emotion: "fear",
  mood: "grim",
  mode: "dialogue",
  themes: ["death"],
  scores: Object.fromEntries(["intensity", ...EMOTIONS.map((e) => e.id), ...TEXTURES.map((t) => t.id)].map((k) => [k, 0.5])),
});
const pagesResult = (page: number) => ({
  total: 300,
  page,
  pageSize: 25,
  pages: 5,
  maxPages: 5,
  rows: Array.from({ length: 25 }, (_, i) => pageRow((page - 1) * 25 + i)),
  facets: { book: { "pv-omon": 300 }, kind: { novel: 300 }, decade: { "1990": 300 }, emotion: { fear: 200, joy: 100 }, mood: { grim: 300 }, mode: { dialogue: 300 }, theme: { death: 120 } },
  books: { "pv-omon": { title: "Омон Ра", titleEn: "Omon Ra", year: 1992 } },
});

test("library pages tab browses quotes with facets, sort and at most five result pages", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const asked: URLSearchParams[] = [];
  await page.route("**/api/corpus/pages?*", (route) => {
    const q = new URL(route.request().url()).searchParams;
    asked.push(q);
    return route.fulfill({ json: pagesResult(Number(q.get("page"))) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#/library");
  await page.getByRole("button", { name: /^Pages/ }).click();
  await expect(page).toHaveURL(/tab=pages/);
  const table = page.getByRole("table", { name: "Pages of the corpus" });
  await expect(table.locator("a.bt-row")).toHaveCount(25);
  await expect(table.locator("a.bt-row").first()).toContainText("Фраза номер 1");
  await expect(table.locator("a.bt-row").first()).toHaveAttribute("href", "#/book/pv-omon?page=1");

  await page.getByRole("combobox", { name: "Filter by emotion" }).selectOption("joy");
  await expect(page).toHaveURL(/emotion=joy/);
  await expect.poll(() => asked.at(-1)?.get("emotion")).toBe("joy");
  await page.getByRole("button", { name: "funniest" }).click();
  await expect.poll(() => asked.at(-1)?.get("sort")).toBe("humor");
  await expect(page.getByRole("columnheader", { name: /humou?r/i })).toHaveAttribute("aria-sort", "descending");

  const pager = page.getByRole("navigation", { name: "Result pages" });
  await expect(pager.getByRole("button")).toHaveCount(5);
  await pager.getByRole("button", { name: "Result page 3" }).click();
  await expect.poll(() => asked.at(-1)?.get("page")).toBe("3");
  await expect(table.locator("a.bt-row").first()).toContainText("Фраза номер 51");
  await expect(page.getByText("Beyond this, narrow the filters")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the pages API refuses result pages beyond the fifth", async ({ request }) => {
  const res = await request.get("/api/corpus/pages?page=6");
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toMatch(/copyright/);
});

test("analysed book shows cost, radar, brief, quotes, every chart, the reader and exports the dataset", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: true, brief: true } }));
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
  await expect(page.locator(".cell-radar svg")).toBeVisible();
  await expect(page.locator(".quotes li").first()).toBeVisible();
  await expectBookLayout(page);
  await expect(page.locator(".hero-strip .pixels i")).toHaveCount(85);
  await expect(page.locator(".ridge-themes .ridge-row svg")).toHaveCount(10);
  await expect(page.locator(".ridge-emotions .ridge-row svg")).toHaveCount(8);
  // Thin bars, one per page or page bin, instead of areas.
  expect(await page.locator(".ridge-emotions .ridge-row").first().locator("rect").count()).toBeGreaterThan(10);
  await expect(page.locator(".neighbours")).toContainText(/Walden|Meditations|Moby Dick|Emma|Dracula|Ulysses|Candide|Hamlet/);
  await expect(page.locator(".insights")).toContainText("dialogue");
  await expect(page.locator(".chart-caption")).toContainText("peaks on p.");
  await expect(page.locator(".quotes li")).toHaveCount(6);

  const texture = (await cell(page, "texture vs corpus").boundingBox())!;
  const whole = (await cell(page, "whole book").boundingBox())!;
  expect(Math.abs(texture.y - whole.y)).toBeLessThan(4);
  expect(whole.x).toBeGreaterThan(texture.x + 300);

  // Hovering a chart previews the page: number, position and its first sentence, without stealing the click.
  await page.locator(".dna .chart-svg").scrollIntoViewIfNeeded();
  const dnaBox = (await page.locator(".dna .chart-svg").boundingBox())!;
  await page.mouse.move(dnaBox.x + dnaBox.width * 0.6, dnaBox.y + 60);
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  await expect(tip.locator(".page-tip-meta")).toContainText(/p\.\d+ · \d+%/);
  await expect(tip.locator(".page-tip-text")).toContainText(/\w{3,}.*[.!?…]/);
  await expect(tip).toHaveCSS("pointer-events", "none");
  await page.mouse.move(dnaBox.x - 40, dnaBox.y - 40);
  await expect(tip).toHaveCount(0);
  await page.locator(".ridge-emotions").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150); // the preview hides on scroll; let that settle before hovering
  const specRow = (await page.locator(".ridge-emotions .ridge-row svg").first().boundingBox())!;
  await page.mouse.move(specRow.x + specRow.width / 3, specRow.y + specRow.height / 2);
  await expect(page.getByRole("tooltip")).toContainText(/joy/);
  await page.mouse.move(0, 0);

  // Dashboard controls live in the URL and drive every cell.
  const bar = page.getByRole("group", { name: "Dashboard filters" });
  await bar.getByRole("button", { name: "1st ⅓" }).click();
  await expect(page).toHaveURL(/range=0-33/);
  await bar.getByRole("group", { name: "emotions" }).getByRole("button", { name: /^fear/i }).click();
  await expect(page).toHaveURL(/emo=fear/);
  await expect(page.locator(".ridge-emotions .ridge-row svg")).toHaveCount(1);
  await bar.getByLabel("highlight").selectOption("mood:meditative");
  await expect(page.locator(".chart-svg.pulse .hl-band").first()).toBeAttached();
  await expect(page.getByRole("group", { name: "Dashboard filters" })).toContainText(/\d+\/\d+ pages/);
  await cell(page, "neighbours").getByRole("button", { name: "year" }).click();
  await expect(page).toHaveURL(/ns=year/);
  await cell(page, "texture vs corpus").getByRole("button", { name: "Δ" }).click();
  await expect(page).toHaveURL(/xs=diff/);
  await bar.getByRole("button", { name: "reset" }).click();
  await expect(page).not.toHaveURL(/range=|emo=|hl=/);
  await expect(page.locator(".ridge-emotions .ridge-row svg")).toHaveCount(8);

  await page.locator(".quotes li button").first().click();
  await expect(page.locator(".reader-text")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".reader")).toHaveCount(0);

  await page.locator(".chart-svg.pulse").click({ position: { x: 200, y: 100 } });
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
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: false } }));
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
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: false } }));
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
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: false } }));
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
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: true } }));
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
  // Page completion can render before the subsequent whole-book profile request.
  await expect.poll(() => profiles).toBe(1);
  await expect(cell(page, "emotions over the book")).toBeVisible();
  await expect(button(page, "map")).toBeEnabled();
});

test("map switches 2D/3D, takes any answer as an axis, shows coordinates on hover and fits a phone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/map");
  await expect(page.getByRole("heading", { name: "Map of the works" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3d", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".graph canvas")).toBeVisible();
  await expect(page.locator(".node-label")).toHaveCount(8);
  await expect(page.getByRole("group", { name: "Regions" }).getByRole("button")).toHaveCount(2);
  const desktopLegend = (await page.locator(".graph-regions").boundingBox())!;
  const desktopCanvas = (await page.locator(".graph canvas").boundingBox())!;
  expect(desktopLegend.y).toBeGreaterThanOrEqual(desktopCanvas.y + desktopCanvas.height - 1);

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
  await expect(page.getByRole("button", { name: "2d", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  await page.getByRole("button", { name: "Search the books" }).click();
  await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("canon books open read-only from the library, the map and search with brief, charts and stored cost", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: true, brief: true } }));
  await page.route("**/api/corpus", (route) => route.fulfill({ json: canonList }));
  const fetched: string[] = [];
  await page.route("**/api/corpus/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    fetched.push(id);
    return id === canonBook.id ? route.fulfill({ json: canonBook }) : route.fulfill({ status: 404, json: { error: "This book is not in the corpus." } });
  });

  await page.goto("/#/library");
  await expect(page.getByRole("button", { name: /^Pelevin’s works/ })).toHaveAttribute("aria-pressed", "true");
  const rows = page.locator(".canon-table a.bt-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Meditations");
  await expect(rows.nth(1)).toContainText("Emma");
  // The public shelf shows no model coverage, tokens or costs.
  await expect(page.locator(".canon-table")).not.toContainText("%");
  await page.getByRole("button", { name: /^pages/ }).click();
  await page.getByRole("button", { name: /^pages/ }).click();
  await expect(page.getByRole("columnheader", { name: /pages/ })).toHaveAttribute("aria-sort", "descending");
  await expect(rows.first()).toContainText("Emma");
  await rows.filter({ hasText: "Meditations" }).click();

  await expect(page).toHaveURL(/#\/book\/pg-901$/);
  await expect(page.locator(".book-title")).toHaveText("Meditations");
  await expect(page.locator(".corpus-badge")).toHaveCount(0);
  await expect(page.locator(".eyebrow").first()).not.toContainText("corpus");
  // Corpus pages show no model coverage, tokens or costs.
  await expect(page.locator(".data-badge")).toHaveCount(0);
  await expect(page.locator(".brief-logline")).toHaveText(briefAnswer.logline);
  await expect(page.locator(".cost")).toHaveCount(0);
  await expect(page.locator(".book-hero")).not.toContainText("$");
  await expectBookLayout(page);
  await expect(page.locator(".cell-radar svg")).toBeVisible();
  await expect(page.locator(".hero-strip .pixels i")).toHaveCount(85);
  // Highlighting a mood dims the other pages' bars in the ridgelines.
  await page.getByRole("group", { name: "Dashboard filters" }).getByLabel("highlight").selectOption("mood:suspenseful");
  await expect(page.locator('.ridge-emotions rect[opacity="0.22"]').first()).toBeAttached();
  await page.getByRole("group", { name: "Dashboard filters" }).getByRole("button", { name: "reset" }).click();
  for (const label of ["analyze", "resume", "write brief"]) await expect(button(page, label)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete book" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /rewrite/i })).toHaveCount(0);
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
  await expect(page.locator(".star-card")).toContainText(`corpus · Jev read all ${canonBook.pages} pages`);
  await expect(page.getByRole("button", { name: /Meditations Fixture Author/ }).locator(".glyph.canon")).toHaveCount(1);
  await button(page, "open book →").click();
  await expect(page).toHaveURL(/#\/book\/pg-901$/);
  await expect(page.locator(".brief-logline")).toHaveText(briefAnswer.logline);

  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search books" }).fill("Meditations");
  await page.getByRole("option", { name: /Meditations/ }).click();
  await expect(page.locator(".book-title")).toHaveText("Meditations");
  expect(fetched).toEqual(["pg-901"]);

  await page.goto("/#/book/pg-999");
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/library?tab=canon");
  await expect(page.locator(".canon-table a.bt-row")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("corpus books send excerpts and open their full text one page at a time", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const excerptBook = {
    ...canonBook,
    id: "pv-generation-p",
    title: "Generation «П»",
    titleEn: "Homo Zapiens",
    year: 1999,
    kind: "novel",
    rank: 1,
    gutenberg: null,
    text: null,
    excerpts: canonSegments.map((s) => s.text.slice(0, 120)),
  };
  await page.route("**/api/corpus", (route) =>
    route.fulfill({ json: { available: true, books: [{ ...canonList.books[0], id: excerptBook.id, title: excerptBook.title, titleEn: "Homo Zapiens", year: 1999, kind: "novel", gutenberg: null }] } }),
  );
  await page.route("**/api/corpus/pv-generation-p", (route) => route.fulfill({ json: excerptBook }));
  const requested: number[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/corpus/pv-generation-p/page/*", async (route) => {
    const n = Number(route.request().url().split("/").at(-1));
    requested.push(n);
    if (n === 2) await gate;
    const s = canonSegments[n - 1];
    return s ? route.fulfill({ json: { page: n, text: s.text, start: s.start, end: s.end } }) : route.fulfill({ status: 404, json: { error: "This page is not in the corpus." } });
  });

  await page.goto("/#/book/pv-generation-p");
  await expect(page.locator(".book-title")).toHaveText(/^Homo Zapiens/);
  await expect(page.locator(".book-title .book-year")).toHaveText("1999");
  await expect(page.locator(".book-subtitle")).toHaveText("Generation «П»");
  await expect(page.locator(".book-hero .eyebrow")).toHaveText("Novel");
  await expect(page.locator(".book-author")).toHaveCount(0);
  await expect(page.locator(".book-hero")).not.toContainText(/read by Jev|\$|tokens/);
  await expect(page.locator(".excerpt-note")).toHaveCount(0);
  await expect(page.locator(".book-facts")).toContainText(String(canonSegments.length));
  await expect(page.locator(".quotes li").first()).toBeVisible();
  expect(requested).toEqual([]);

  await page.goto("/#/book/pv-generation-p?page=2");
  await expect(page.locator(".reader-notice")).toContainText("Loading the page");
  await expect(page.locator(".reader-excerpt")).toContainText(canonSegments[1].text.slice(0, 40).trim());
  release();
  const deep = canonSegments[1].text.slice(600, 660).trim();
  await expect(page.locator(".reader-text")).toContainText(deep);
  await expect(page.locator(".reader-one-page")).toHaveText("One page at a time");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator(".reader-page")).toContainText("p.3");
  await expect(page.locator(".reader-one-page")).toBeVisible();
  await expect.poll(() => Math.max(...requested)).toBeLessThanOrEqual(4);
  expect(new Set(requested).size).toBeLessThanOrEqual(4);
  await page.keyboard.press("Escape");

  await page.locator(".lang-switch button[lang=ru]").click();
  await expect(page.locator(".book-title")).toHaveText(/^Generation «П»/);
  await expect(page.locator(".book-subtitle")).toHaveText("Homo Zapiens");
  await expect(page.locator(".book-hero .eyebrow")).toHaveText("Роман");
  await expect(page.locator(".book-title .book-year")).toHaveText("1999");
  await expect(cell(page, "эмоции по ходу книги")).toBeVisible();
  await expect(section(page, "Коротко")).toBeVisible();
  await page.goto("/#/book/pv-generation-p?page=2");
  await expect(page.locator(".reader-one-page")).toHaveText("По одной странице");
  await expect(page.locator(".reader-page")).toContainText("с. 2");
  expect(errors).toEqual([]);
});

test("the public site hides uploading, your library and the analysis actions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let analyzed = 0;
  await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: false, configured: false, brief: false } }));
  await page.route("**/api/analyze", (route) => ((analyzed += 1), route.fulfill({ status: 404, json: { error: "Not available on the public site." } })));
  await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
  await page.route("**/api/corpus", (route) => route.fulfill({ json: canonList }));
  await page.route("**/api/corpus/pg-901", (route) => route.fulfill({ json: canonBook }));
  const indexedDb: string[] = [];
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<typeof indexedDB.open>) => {
      (window as unknown as { __idb: string[] }).__idb = [...((window as unknown as { __idb?: string[] }).__idb ?? []), String(args[0])];
      return open(...args);
    };
  });

  await page.goto("/");
  await expect(page.locator(".topbar .search-trigger")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator(".upload-button")).toHaveCount(0);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await expect(page.locator(".footer-meta")).toHaveCount(0);
  await page.keyboard.press("u");
  await expect(page.locator("input[type=file]")).toHaveCount(0);

  await page.goto("/#/library?tab=mine");
  await expect(page.locator(".canon-table a.bt-row").first()).toBeVisible();
  await expect(page.locator(".shelf-tabs").getByRole("button", { name: /your books/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /upload/i })).toHaveCount(0);

  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search books" }).fill("Meditations");
  await expect(page.getByRole("option", { name: /Meditations/ }).first()).toBeVisible();
  await expect(page.getByRole("option", { name: /upload/i })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/#/book/pg-901");
  await expect(page.locator(".book-title")).toHaveText("Meditations");
  for (const label of ["analyze", "resume", "write brief", "rewrite"]) await expect(button(page, label)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete book" })).toHaveCount(0);

  await page.goto("/#/map");
  await expect(page.locator(".graph canvas")).toBeVisible();
  await expect(page.locator(".graph-legend .glyph.own")).toHaveCount(0);
  indexedDb.push(...((await page.evaluate(() => (window as unknown as { __idb?: string[] }).__idb)) ?? []));
  expect(indexedDb).toEqual([]);
  expect(analyzed).toBe(0);
  expect(errors).toEqual([]);
});

test.describe("phone workflows", () => {
  // Each journey visits every page; WebKit needs more time on shared CI runners.
  test.setTimeout(60_000);
  test.use({ hasTouch: true, isMobile: true });

  for (const width of [320, 390, 430]) {
    test(`library, book, reader, search and map work at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/atlas.json", (route) => route.fulfill({ json: atlas }));
      await page.route("**/api/status", (route) => route.fulfill({ json: { localMode: true, configured: false } }));
      await page.route("**/api/corpus", (route) => route.fulfill({ json: canonList }));
      await page.route("**/api/corpus/pg-901", (route) => route.fulfill({ json: canonBook }));
      const fits = async () => {
        // On failure, name what sticks out, so a regression points at its element.
        const wide = await page.evaluate(() => {
          if (document.documentElement.scrollWidth <= innerWidth) return [];
          return [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5)
            .slice(0, 8)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className)} → ${Math.round(el.getBoundingClientRect().right)}`);
        });
        expect(wide, `page wider than ${width}px`).toEqual([]);
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
      await page.getByRole("button", { name: "Search the books", exact: true }).tap();
      await page.getByRole("dialog", { name: "Search" }).getByRole("combobox", { name: "Search books" }).fill("Meditations");
      await expect(page.getByRole("option", { name: /Meditations/ })).toBeVisible();
      await page.getByRole("button", { name: "Close search" }).tap();
      await expect(page.getByRole("dialog", { name: "Search" })).toHaveCount(0);

      await page.getByRole("link", { name: "Library", exact: true }).tap();
      await expect(page.locator(".canon-cards > li")).toHaveCount(2);
      await expect(page.locator(".shelf-scroll")).toBeHidden();
      await page.locator(".shelf-filter-toggle").tap();
      await expect(page.getByRole("combobox", { name: "Filter by genre" })).toBeVisible();
      await page.locator(".shelf-filter-toggle").tap();
      await page.getByRole("combobox", { name: "Sort works" }).selectOption("pages");
      await page.getByRole("button", { name: "Reverse sort order" }).tap();
      await expect(page.locator(".canon-card-link").first()).toContainText("Emma");
      await page.locator(".canon-card-metrics summary").first().tap();
      await expect(page.locator(".canon-card-metrics dl").first()).toBeVisible();
      await fits();
      if (width === 390) await page.screenshot({ path: "/tmp/xbook-mobile-library.png", fullPage: true });
      await page.locator(".canon-card-link").filter({ hasText: "Meditations" }).tap();
      await expect(page.locator(".brief-logline")).toBeVisible();
      await fits();
      for (const selector of [".quotes", ".dash", ".neighbours", ".sliders", ".ridges"]) {
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
      await page.getByRole("button", { name: "Show page analysis" }).tap();
      await expect(page.locator(".reader-analysis")).toBeVisible();
      await fits();
      await page.getByRole("button", { name: "Hide page analysis" }).tap();
      await page.getByRole("button", { name: "Next page" }).tap();
      await page.getByRole("button", { name: "Close reader" }).tap();
      await expect(page.locator(".reader")).toHaveCount(0);

      await page.getByRole("link", { name: "Map", exact: true }).tap();
      await expect(page.locator(".graph canvas")).toBeVisible();
      await expect(page.locator(".graph-touch-help")).toBeVisible();
      const legend = page.getByRole("group", { name: "Regions" });
      await expect(legend.getByRole("button")).toHaveCount(2);
      const legendBox = (await legend.boundingBox())!;
      const mapBox = (await page.locator(".graph canvas").boundingBox())!;
      expect(legendBox.y).toBeGreaterThanOrEqual(mapBox.y + mapBox.height);
      await expect(page.locator(".graph-regions")).toHaveCSS("position", "static");
      await legend.getByRole("button").first().tap();
      await expect(legend.getByRole("button").first()).toHaveClass(/on/);
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
      await page.getByRole("button", { name: /^Your books/ }).tap();
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
      await expect(page.locator(".graph-regions")).toBeVisible();
      const landscapeLegend = (await page.locator(".graph-regions").boundingBox())!;
      const landscapeCanvas = (await page.locator(".graph canvas").boundingBox())!;
      expect(landscapeLegend.y).toBeGreaterThanOrEqual(landscapeCanvas.y + landscapeCanvas.height);
      await fits();
    });
  }
});
