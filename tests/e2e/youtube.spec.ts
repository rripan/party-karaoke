import { expect, test } from "@playwright/test";
import { command, createParty, newGuest, state, stubYouTube } from "./helpers";

/**
 * YouTube paths with a mocked oEmbed endpoint and a stub of the IFrame API
 * (youtube.com is unreachable from the test sandbox). These verify our
 * integration logic — link validation, error mapping, player state wiring —
 * not YouTube itself. Real playback is verified manually (see README).
 */
test("pasted YouTube links are validated, queued, played and failures can be skipped", async ({ browser, page: host }) => {
  await stubYouTube(host.context());
  const { partyId, code } = await createParty(host, "Link Night");
  const g = await newGuest(browser, code, "Fran", "🔥");

  // Embedding disabled, deleted/private, and malformed links get specific messages.
  const search = g.page.getByTestId("song-search-input");
  await search.fill("https://youtu.be/BBBBBBBBBBB");
  await expect(g.page.getByTestId("link-error")).toContainText("doesn't allow it to be played on other sites");
  await search.fill("https://www.youtube.com/watch?v=CCCCCCCCCCC");
  await expect(g.page.getByTestId("link-error")).toContainText("doesn't exist");
  await search.fill("https://www.youtube.com/playlist?list=PL123");
  await expect(g.page.getByTestId("link-error")).toContainText("Playlists aren't supported");

  // A valid karaoke video: metadata comes from the server, labelled from its title.
  await search.fill("https://www.youtube.com/watch?v=AAAAAAAAAAA&t=42");
  await expect(g.page.getByText("Test Anthem (Karaoke Version)")).toBeVisible();
  await expect(g.page.getByText("Lyrics in video")).toBeVisible();
  await g.page.getByTestId("inspector-add").click();
  await expect(g.page.getByText("Your song was added! 🎤")).toBeVisible();
  // Server-side duplicate check also covers links.
  const dup = await command(g.page, partyId, { type: "add_song", ref: "AAAAAAAAAAA" });
  expect(dup.status).toBe(409);
  expect((await command(g.page, partyId, { type: "add_song", ref: "https://youtu.be/DDDDDDDDDDD" })).status).toBe(200);

  // Plays through the (stubbed) official IFrame API; karaoke video → full video layout.
  await host.getByTestId("control-start").click();
  await expect(host.locator('[data-testid=fake-yt-iframe][data-state="1"]')).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("stage")).toHaveAttribute("data-layout", "video");
  await expect.poll(async () => (await state(host, partyId)).playback.status).toBe("playing");
  await host.getByTestId("control-pause").click();
  await expect(host.locator('[data-testid=fake-yt-iframe][data-state="2"]')).toBeVisible();
  await host.getByTestId("control-play").click();
  await expect(host.locator('[data-testid=fake-yt-iframe][data-state="1"]')).toBeVisible();
  // Duration reported by the player is stored for songs without metadata (oEmbed has none).
  await expect.poll(async () => (await state(host, partyId)).playback.durationSeconds).toBe(30);

  // Next video fails like "embedding disabled": understandable error, skip keeps the queue.
  await host.getByTestId("control-skip").click();
  await expect(host.getByTestId("video-error")).toContainText("doesn't allow it to be played on other websites", { timeout: 15_000 });
  await expect(host.getByRole("button", { name: "Choose another version" })).toBeVisible();
  await host.getByTestId("video-error").getByRole("button", { name: "Skip song" }).click();
  await expect(host.getByTestId("stage-idle")).toBeVisible();
  const snap = await state(host, partyId);
  expect(snap.history.map((h: { completionStatus: string }) => h.completionStatus)).toEqual(["skipped", "skipped"]);
  await g.context.close();
});
