import { readFileSync } from "node:fs";
import path from "node:path";
import { devices, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

export const FAKE_YT_API = readFileSync(path.join(__dirname, "../support/fake-youtube-iframe-api.js"), "utf8");

/** Replace the official IFrame API (unreachable in CI sandboxes) with a contract-compatible stub. */
export async function stubYouTube(context: BrowserContext) {
  await context.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_YT_API }));
  await context.route(/https:\/\/(i\.ytimg\.com|www\.youtube\.com\/s\/)/, (route) => route.fulfill({ status: 204 }));
}

export async function createParty(page: Page, name = "Friday Night Karaoke", rules?: (page: Page) => Promise<void>) {
  await page.goto("/create");
  await page.getByTestId("party-name-input").fill(name);
  if (rules) {
    await page.getByRole("button", { name: /Party rules/ }).click();
    await rules(page);
  }
  await page.getByTestId("create-party").click();
  await page.waitForURL(/\/host\/[0-9a-f-]{36}$/);
  const partyId = page.url().split("/host/")[1];
  const code = (await page.getByTestId("join-code").textContent())!.trim();
  return { partyId, code };
}

export async function newGuest(browser: Browser, code: string, name: string, avatar = "🦄") {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  await stubYouTube(context);
  const page = await context.newPage();
  await page.goto(`/p/${code}`);
  await page.getByTestId("display-name-input").fill(name);
  await page.getByRole("button", { name: `Avatar ${avatar}` }).click();
  await page.getByTestId("join-submit").click();
  await expect(page.getByTestId("guest-party-name")).toBeVisible();
  return { context, page };
}

/** Sends a command with the page's own cookies (used for concurrency & authz tests). */
export async function command(page: Page, partyId: string, body: Record<string, unknown>) {
  return page.evaluate(
    async ({ partyId, body }) => {
      const res = await fetch(`/api/parties/${partyId}/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: res.status, json: await res.json() };
    },
    { partyId, body },
  );
}

export async function state(page: Page, partyId: string) {
  return page.evaluate(async (partyId) => (await (await fetch(`/api/parties/${partyId}/state`)).json()).snapshot, partyId);
}

export async function addSongFromSearch(page: Page, query: string, titleMatch: RegExp) {
  await page.getByTestId("guest-tab-search").click();
  await page.getByTestId("song-search-input").fill(query);
  const row = page.getByTestId("search-result").filter({ hasText: titleMatch }).first();
  await expect(row).toBeVisible();
  await row.getByTestId("add-song").click();
}

/** Decodes the QR code inside `locator` from a real screenshot, like a phone camera would. */
export async function decodeQr(page: Page, selector: string): Promise<string | null> {
  const buffer = await page.locator(selector).first().screenshot();
  const png = PNG.sync.read(buffer);
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return result?.data ?? null;
}
