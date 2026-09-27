import { defineConfig } from "@playwright/test";
const baseURL = `http://127.0.0.1:${process.env.PORT || 5173}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL, headless: true },
  webServer: {
    command: "npm run build && npm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "iphone-webkit", grep: /phone workflows/, use: { browserName: "webkit" } },
  ],
  reporter: "list",
});
