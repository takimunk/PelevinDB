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
  reporter: "list",
});
