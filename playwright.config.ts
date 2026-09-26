import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * Browser tests against a production build (pnpm build first). Every flow runs at desktop
 * and phone size. Chrome only on pull requests; the nightly run adds more browsers.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // The supplier and document lists are large sample pages; with every test running at once
  // on a cold server, navigation can take longer than the 5-second default.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: "es-PR",
    timezoneId: "America/Puerto_Rico",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(PORT), SHOW_UI_REVIEW: "true" },
  },
});
