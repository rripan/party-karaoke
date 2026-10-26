import { expect, test, type Page } from "@playwright/test";
import { addSongFromSearch, command, createParty, decodeQr, newGuest, state, stubYouTube } from "./helpers";

test.describe.configure({ mode: "serial" });

async function lyricIndex(host: Page) {
  return Number(await host.getByTestId("synced-lyrics").getAttribute("data-line-index"));
}

test("the core party journey: create → QR → join → queue → sing → next singer", async ({ browser, page: host }) => {
  await stubYouTube(host.context());

  // --- Party creation (1-4)
  const { partyId, code } = await createParty(host, "Friday Night Karaoke");
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  expect(partyId).toMatch(/^[0-9a-f-]{36}$/);
  const joinUrl = (await host.getByTestId("join-url").textContent())!.trim();
  expect(joinUrl).toBe(`localhost:3200/p/${code}`);
  // The QR on the TV stage decodes (from pixels) to the invitation URL.
  const decoded = await decodeQr(host, '[data-testid=stage-idle] svg[data-qr-value]');
  expect(decoded).toBe(`http://localhost:3200/p/${code}`);
  const cardQr = await decodeQr(host, '[data-testid=invite-card] svg[data-qr-value]');
  expect(cardQr).toBe(`http://localhost:3200/p/${code}`);

  await host.getByRole("button", { name: "Rename party" }).click();
  await host.getByTestId("rename-input").fill("Main Character Mic Night");
  await host.getByRole("button", { name: "Save" }).click();
  await expect(host.getByTestId("party-name")).toHaveText("Main Character Mic Night");

  // --- Guest joining (5-9)
  const alex = await newGuest(browser, code, "Alex", "🎸");
  await expect(alex.page.getByText("You're in! Welcome to Main Character Mic Night 🎤")).toBeVisible();
  await expect(host.getByTestId("guest-count")).toHaveText("1"); // realtime, no refresh
  await alex.page.reload();
  await expect(alex.page.getByTestId("guest-name")).toHaveText("Alex");
  await expect(alex.page.getByTestId("display-name-input")).toHaveCount(0);
  // A guest can't open host controls or the TV output, nor call host commands.
  const guestHost = await alex.context.newPage();
  await guestHost.goto(`/host/${partyId}`);
  await expect(guestHost.getByRole("heading", { name: "Host controls are locked" })).toBeVisible();
  await guestHost.goto(`/tv/${partyId}`);
  await expect(guestHost.getByRole("heading", { name: /Open the TV screen from the host/ })).toBeVisible();
  await guestHost.close();
  expect((await command(alex.page, partyId, { type: "skip" })).status).toBe(403);
  expect((await command(alex.page, partyId, { type: "clear_queue" })).status).toBe(403);

  // --- Search & queue (11-18)
  await expect(alex.page.getByTestId("demo-search-banner")).toBeVisible();
  await addSongFromSearch(alex.page, "neon", /Neon Heartbeat/);
  await expect(alex.page.getByText("Your song was added! 🎤")).toBeVisible();
  await expect(host.getByTestId("host-queue")).toContainText("Neon Heartbeat"); // appears without refresh

  const bea = await newGuest(browser, code, "Bea", "🦊");
  const cam = await newGuest(browser, code, "Cam", "🐙");
  // Simultaneous submissions from three guests: nothing lost, positions unique.
  const results = await Promise.all([
    command(alex.page, partyId, { type: "add_song", ref: "demo:happy-birthday" }),
    command(bea.page, partyId, { type: "add_song", ref: "demo:living-room-tour" }),
    command(cam.page, partyId, { type: "add_song", ref: "demo:amazing-grace" }),
    command(bea.page, partyId, { type: "add_song", ref: "demo:synthwave-sunset" }),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
  let snap = await state(host, partyId);
  expect(snap.upcoming).toHaveLength(5);
  expect(snap.upcoming.map((q: { position: number }) => q.position)).toEqual([1, 2, 3, 4, 5]);

  // Duplicates and invalid links are rejected with clear messages.
  await bea.page.getByTestId("song-search-input").fill("neon");
  await expect(bea.page.getByTestId("search-result").filter({ hasText: "Neon Heartbeat" }).getByTestId("add-song")).toBeDisabled();
  const dup = await command(bea.page, partyId, { type: "add_song", ref: "demo:neon-heartbeat" });
  expect(dup.status).toBe(409);
  expect(dup.json.error.message).toContain("already in the queue");
  const invalid = await command(bea.page, partyId, { type: "add_song", ref: "https://vimeo.com/12345" });
  expect(invalid.json.error.message).toBe("Only YouTube links are supported.");
  await bea.page.getByTestId("song-search-input").fill("https://www.youtube.com/watch?v=too-short");
  await expect(bea.page.getByTestId("link-error")).toContainText("invalid video ID");

  // Host reorders with the keyboard (drag-and-drop via dnd-kit's keyboard sensor).
  const before = (await state(host, partyId)).upcoming.map((q: { song: { title: string } }) => q.song.title);
  await host.getByTestId("tab-queue").click();
  const handle = host.getByRole("button", { name: `Reorder ${before[2]}. Press space, then arrow keys.` });
  await handle.focus();
  // dnd-kit measures layout between moves, so give each key a beat.
  for (const key of ["Space", "ArrowUp", "ArrowUp", "Space"]) {
    await host.keyboard.press(key);
    await host.waitForTimeout(250);
  }
  await expect.poll(async () => (await state(host, partyId)).upcoming[0].song.title).toBe(before[2]);

  // Host removes a song; a guest can't remove someone else's.
  snap = await state(host, partyId);
  const camItem = snap.upcoming.find((q: { requestedBy: { displayName: string } }) => q.requestedBy.displayName === "Cam");
  const notMine = await command(bea.page, partyId, { type: "remove_own", queueItemId: camItem.id });
  expect(notMine.status).toBe(403);
  await host.getByTestId("host-queue").getByRole("button", { name: "Remove from queue" }).last().click();
  await expect.poll(async () => (await state(host, partyId)).upcoming.length).toBe(4);

  // Put Neon Heartbeat (word-timed sample lyrics) on top for the playback checks.
  snap = await state(host, partyId);
  const neon = snap.upcoming.find((q: { song: { id: string } }) => q.song.id === "demo:neon-heartbeat");
  await command(host, partyId, { type: "move_to_top", queueItemId: neon.id });

  // --- Playback & lyrics (19-31)
  await host.getByTestId("control-start").click();
  await expect(host.getByTestId("intro-splash")).toContainText("Alex");
  await expect(alex.page.getByTestId("turn-banner")).toContainText("your turn");
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
  await expect(host.getByText("Simulated playback · sample track · no audio")).toBeVisible();
  await expect(host.getByTestId("stage")).toHaveAttribute("data-layout", "split");
  await expect(host.getByTestId("current-lyric")).toContainText("Lights are low", { timeout: 8_000 });
  await expect(host.getByTestId("next-lyric")).toContainText("Every window");

  // Pause: player and lyrics freeze on the real (simulated) clock.
  await host.getByTestId("control-pause").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "paused");
  const frozenAt = await host.getByTestId("elapsed").textContent();
  const frozenLine = await lyricIndex(host);
  await host.waitForTimeout(2500);
  expect(await host.getByTestId("elapsed").textContent()).toBe(frozenAt);
  expect(await lyricIndex(host)).toBe(frozenLine);
  await expect.poll(async () => (await state(alex.page, partyId)).playback.status).toBe("paused");

  // Resume, then seek forward and backward: lyrics follow the player position.
  await host.getByTestId("control-play").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing");
  await command(host, partyId, { type: "seek", positionSeconds: 30 });
  await expect(host.getByTestId("current-lyric")).toContainText("Hold the mic up");
  await command(host, partyId, { type: "seek", positionSeconds: 9 });
  await expect(host.getByTestId("current-lyric")).toContainText("Every window");

  // Refresh mid-song: queue survives, and the app does NOT claim playback resumed.
  await host.reload();
  await expect(host.getByTestId("play-next")).toContainText("Resume from", { timeout: 15_000 });
  snap = await state(host, partyId);
  expect(snap.playback.status).toBe("paused");
  expect(snap.playback.interrupted).toBe(true);
  expect(snap.upcoming.length).toBe(3);
  await host.getByTestId("play-next").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing");

  // TV mode: full-screen stage, big readable lyrics on a 1080p TV.
  await host.setViewportSize({ width: 1920, height: 1080 });
  await host.getByTestId("enter-tv-mode").click();
  await expect(host.getByTestId("stage-wrap")).toHaveAttribute("data-tv-mode", "true");
  const fontPx = await host.getByTestId("current-lyric").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(56);
  const tvQr = await decodeQr(host, '[data-testid=stage-qr] svg[data-qr-value]');
  expect(tvQr).toBe(`http://localhost:3200/p/${code}`);
  await host.getByTestId("exit-tv-mode").click({ force: true });
  await host.setViewportSize({ width: 1440, height: 900 });

  // Skip → next singer is announced; history records the skip.
  await host.getByTestId("control-skip").click();
  await expect(host.getByTestId("intro-splash")).toBeVisible();
  snap = await state(host, partyId);
  expect(snap.history[0].completionStatus).toBe("skipped");
  expect(snap.history[0].song.id).toBe("demo:neon-heartbeat");

  for (const g of [alex, bea, cam]) await g.context.close();
});

test("lyrics fallbacks are honest for karaoke videos, plain lyrics and missing lyrics", async ({ browser, page: host }) => {
  const { partyId, code } = await createParty(host, "Lyrics Lab", async (p) => {
    await p.getByRole("switch", { name: "Auto-advance" }).click();
  });
  const g = await newGuest(browser, code, "Dana", "🐼");
  for (const ref of ["demo:main-character-karaoke", "demo:amazing-grace", "demo:synthwave-sunset"]) {
    expect((await command(g.page, partyId, { type: "add_song", ref })).status).toBe(200);
  }
  // 1) Karaoke video: plays full-screen with its own lyrics, no second overlay.
  await host.getByTestId("control-start").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
  await expect(host.getByTestId("stage")).toHaveAttribute("data-layout", "video");
  await expect(host.getByLabel("Lyrics shown in the video")).toBeVisible();
  await expect(host.getByTestId("synced-lyrics")).toHaveCount(0);

  // 2) Plain lyrics: shown, explicitly not synchronised.
  await host.getByTestId("control-finish").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
  await expect(host.getByText("Lyrics · not synchronised")).toBeVisible();
  await expect(host.getByTestId("plain-lyrics")).toContainText("Amazing grace!");
  await expect(host.getByTestId("synced-lyrics")).toHaveCount(0);

  // 3) No lyrics: the song still plays; the stage says separate lyrics are unavailable.
  await host.getByTestId("control-finish").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
  const snap = await state(host, partyId);
  expect(snap.nowPlaying.lyrics.availabilityStatus).toBe("unavailable");
  expect(snap.nowPlaying.lyrics.timingFormat).toBe("none");
  await host.getByRole("radio", { name: "Split" }).click();
  await expect(host.getByTestId("lyrics-notice")).toContainText("Separate lyrics unavailable");
  await expect(host.getByTestId("synced-lyrics")).toHaveCount(0);
  await g.context.close();
});

test("songs finish on the player's own end event and auto-advance", async ({ browser, page: host }) => {
  const { partyId, code } = await createParty(host, "Short Songs");
  const g = await newGuest(browser, code, "Eli", "🌟");
  await command(g.page, partyId, { type: "add_song", ref: "demo:row-your-boat" }); // 21s sample
  await command(g.page, partyId, { type: "add_song", ref: "demo:happy-birthday" });
  await host.getByTestId("control-start").click();
  await expect(host.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
  await command(host, partyId, { type: "seek", positionSeconds: 17 });
  // No separate countdown ends the song: only the player's "ended" does.
  await expect.poll(async () => (await state(host, partyId)).history.length, { timeout: 20_000 }).toBe(1);
  const snap = await state(host, partyId);
  expect(snap.history[0].completionStatus).toBe("completed");
  expect(snap.participants[0].performanceCount).toBe(1);
  expect(snap.nowPlaying.song.id).toBe("demo:happy-birthday");
  await expect(host.getByTestId("intro-splash")).toContainText("Eli");
  await g.context.close();
});

test("the TV window takes over playback and the dashboard becomes a remote", async ({ browser, page: host }) => {
  const { partyId, code } = await createParty(host, "Two Screens");
  const g = await newGuest(browser, code, "Kai", "🎹");
  await command(g.page, partyId, { type: "add_song", ref: "demo:glitter-ceiling" });

  const tv = await host.context().newPage(); // same browser = same host cookie
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(`/tv/${partyId}`);
  await tv.getByTestId("arm-tv").click();
  await expect(host.getByText("The video is playing on another screen")).toBeVisible();

  await host.getByTestId("control-start").click(); // the dashboard drives the TV
  await expect(tv.getByTestId("simulated-player")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
  await expect(host.getByTestId("simulated-player")).toHaveCount(0); // no double audio
  await expect(host.getByText("Playing on the TV screen")).toBeVisible();
  await expect(tv.getByTestId("current-lyric")).not.toBeEmpty();
  await host.getByTestId("control-pause").click();
  await expect(tv.getByTestId("simulated-player")).toHaveAttribute("data-state", "paused");
  await tv.close();
  await g.context.close();
});
