import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const BASE = `http://localhost:${PORT}`;

/**
 * E2E tests run against a dedicated production server in local (demo) mode with a
 * mock oEmbed endpoint, so they need no credentials or internet access.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "node tests/support/mock-oembed.mjs",
      url: "http://127.0.0.1:3299/health",
      reuseExistingServer: true,
    },
    {
      // Production build: closest to a real party, and no dev overlays in the way.
      command: `rm -rf .data-e2e && next build && next start -p ${PORT}`,
      url: `${BASE}/api/config`,
      reuseExistingServer: false,
      timeout: 400_000,
      env: {
        APP_URL: BASE,
        DATA_DIR: ".data-e2e",
        RATE_LIMIT_SCALE: "20",
        YOUTUBE_OEMBED_ENDPOINT: "http://127.0.0.1:3299/oembed",
        YOUTUBE_API_KEY: "",
        // Set E2E_DATABASE_URL to run the same suite against the Postgres store.
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
        NEXT_PUBLIC_SUPABASE_URL: "",
      },
    },
  ],
});
