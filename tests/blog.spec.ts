import { test, expect } from "@playwright/test";
import { mockEda, mockFreq } from "../src/features/blog/eda/mock.ts";

// The blog reads static JSON; serve the dev mock so the test does not depend on generated data.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/corpus", (route) => route.fulfill({ json: { available: false, books: [] } }));
  await page.route("**/blog/eda.json", (route) => route.fulfill({ json: mockEda() }));
  await page.route("**/blog/eda-freq.json", (route) => route.fulfill({ json: mockFreq() }));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("blog-test")) {
      sessionStorage.setItem("blog-test", "1");
      localStorage.setItem("pelevindb.lang", "en");
    }
  });
});

test("blog index lists the EDA post and opens it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/blog");
  const link = page.getByRole("link", { name: /Reading Pelevin by numbers/ });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#\/blog\/eda$/);
  await expect(page.getByRole("heading", { level: 1, name: /Reading Pelevin by numbers/ })).toBeVisible();
  await expect(page.locator("#fig-shelf svg[role=img]")).toBeVisible();
  await expect(page.locator("figure.eda-fig")).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("chart controls change what is plotted", async ({ page }) => {
  await page.goto("/#/blog/eda");
  const shelf = page.locator("#fig-shelf");
  const readout = shelf.locator(".eda-readout");
  const before = await readout.textContent();
  const interviews = shelf.getByRole("button", { name: /interviews/ });
  await expect(interviews).toHaveAttribute("aria-pressed", "false");
  await interviews.click();
  await expect(interviews).toHaveAttribute("aria-pressed", "true");
  await expect(readout).not.toHaveText(before ?? "");

  const style = page.locator("[id^=fig-style]").first();
  await style.getByLabel("Y axis").selectOption("dialogueShare");
  await expect(style.locator("svg[role=img]")).toHaveAttribute("aria-label", /Dialogue/);

  const words = page.locator("#fig-words");
  await words.scrollIntoViewIfNeeded();
  const input = words.getByRole("combobox");
  await input.fill("вамп");
  await words.getByRole("option", { name: /вампир/ }).click();
  await expect(words.getByRole("button", { name: /Remove вампир/ })).toBeVisible();
});

test("language switch changes the post title", async ({ page }) => {
  await page.goto("/#/blog/eda");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Reading Pelevin by numbers/);
  await page.locator('button[lang="ru"]').first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Пелевин в цифрах/);
  await expect(page.locator("#fig-shelf .eda-fig-title")).toHaveText(/Полка/);
});

test("about page is a short note with the project links", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/about");
  const about = page.locator("article.about");
  await expect(about.getByRole("heading", { level: 1 })).toHaveText("П");
  await expect(about.getByText(/a single interface to the whole corpus/)).toBeVisible();
  await expect(about.getByRole("heading", { name: "Copyright" })).toBeVisible();
  await expect(about.getByRole("heading", { name: "Contributing" })).toBeVisible();
  await expect(about.locator(".about-links").getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/takimunk/pelevindb");
  await expect(about.getByRole("link", { name: /central dogma specialist/ })).toHaveAttribute("href", "https://x.com/takimunk");
  await expect(about.locator("svg.social-mark")).toHaveCount(2);

  await page.locator('button[lang="ru"]').first().click();
  await expect(about.getByRole("heading", { level: 1 })).toHaveText("П");
  await expect(about.getByText(/общего интерфейса ко всему корпусу/)).toBeVisible();
  await expect(about.getByRole("heading", { name: "Авторские права" })).toBeVisible();
  expect(errors).toEqual([]);
});
