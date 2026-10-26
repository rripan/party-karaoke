import { devices, expect, test } from "@playwright/test";

test("homepage presents the brand and both entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your Party. Your Playlist. Your Stage.");
  await expect(page.getByText("Scan. Add your song. Grab the mic.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a Karaoke Party" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Join a Party" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Preview of the TV karaoke screen" })).toBeVisible();
  // Honest mode status: no API key in tests → demo search is labelled as such.
  await expect(page.getByTestId("mode-status")).toContainText("Demo search (sample songs)");
});

test("homepage and join page fit a phone screen without horizontal scrolling", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  for (const url of ["/", "/join", "/create"]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${url} overflows horizontally`).toBeLessThanOrEqual(1);
  }
  await context.close();
});

test("unknown join codes and bad links get a friendly message", async ({ page }) => {
  await page.goto("/p/ZZZZ22");
  await expect(page.getByRole("heading", { name: "We couldn't find that party" })).toBeVisible();
  await page.goto("/join");
  await page.getByLabel("Party code").fill("abc");
  await expect(page.getByRole("button", { name: "Find the party" })).toBeDisabled();
});
