import { test, expect } from "@playwright/test";

test("OpenPanel records initial and hash navigation without private book ids or queries", async ({ page, baseURL }) => {
  const events: { type: string; payload: { name: string; properties: Record<string, unknown> } }[] = [];
  await page.route("**/api/analytics-config", (route) => route.fulfill({
    json: { clientId: "test-web-client", apiUrl: "https://analytics.example.test" },
  }));
  await page.route("https://analytics.example.test/**", async (route) => {
    if (route.request().method() === "POST") events.push(route.request().postDataJSON());
    await route.fulfill({ json: { deviceId: "test-device", sessionId: "test-session" } });
  });
  await page.goto("/#/library?search=private-search");
  await expect.poll(() => events.length).toBe(1);
  expect(events[0].payload.name).toBe("screen_view");
  expect(events[0].payload.properties.__path).toBe(`${baseURL}/library`);
  await page.evaluate(() => { location.hash = "/book/private-book-id?page=4"; });
  await expect.poll(() => events.length).toBe(2);
  expect(events[1].payload.properties.__path).toBe(`${baseURL}/book/local`);
  expect(JSON.stringify(events)).not.toContain("private-search");
  expect(JSON.stringify(events)).not.toContain("private-book-id");
  await page.evaluate(() => { location.hash = "/book/pg-1342?page=2"; });
  await expect.poll(() => events.length).toBe(3);
  expect(events[2].payload.properties.__path).toBe(`${baseURL}/book/pg-1342`);
  await page.evaluate(() => { location.hash = "/book/pv-generation-p?page=3"; });
  await expect.poll(() => events.length).toBe(4);
  expect(events[3].payload.properties.__path).toBe(`${baseURL}/book/pv-generation-p`);
});

test("analytics config failure does not prevent the app from opening", async ({ page }) => {
  await page.route("**/api/analytics-config", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
});
