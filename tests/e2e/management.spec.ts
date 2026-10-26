import { expect, test } from "@playwright/test";
import { addSongFromSearch, command, createParty, newGuest, state } from "./helpers";

test("voting: one vote per guest per song, and votes can reorder the queue", async ({ browser, page: host }) => {
  const { partyId, code } = await createParty(host, "Vote Night", async (p) => {
    await p.getByRole("radio", { name: "Votes reorder" }).click();
  });
  const a = await newGuest(browser, code, "Gia", "🍕");
  const b = await newGuest(browser, code, "Hal", "🌮");
  for (const ref of ["demo:neon-heartbeat", "demo:happy-birthday", "demo:auld-lang-syne"]) await command(a.page, partyId, { type: "add_song", ref });

  await b.page.getByTestId("guest-tab-queue").click();
  const last = b.page.getByTestId("queue-item").filter({ hasText: "Auld Lang Syne" });
  await last.getByTestId("vote-button").click();
  await expect(last.getByTestId("vote-count")).toHaveText("1");
  // Moved above "Happy Birthday" (the up-next song stays first).
  await expect.poll(async () => (await state(host, partyId)).upcoming.map((q: { song: { id: string } }) => q.song.id)).toEqual([
    "demo:neon-heartbeat",
    "demo:auld-lang-syne",
    "demo:happy-birthday",
  ]);
  const item = (await state(b.page, partyId)).upcoming[1];
  const again = await command(b.page, partyId, { type: "vote", queueItemId: item.id });
  expect(again.status).toBe(409);
  expect(again.json.error.code).toBe("already_voted");
  const own = await command(a.page, partyId, { type: "vote", queueItemId: item.id });
  expect(own.json.error.code).toBe("own_song");
  await expect(host.getByTestId("host-queue")).toContainText("Auld Lang Syne");
  await a.context.close();
  await b.context.close();
});

test("limits, approval, paused submissions, removal and ending the party", async ({ browser, page: host }) => {
  const { partyId, code } = await createParty(host, "Rules Night", async (p) => {
    await p.getByRole("switch", { name: "Require host approval" }).click();
    await p.getByRole("button", { name: "Decrease max waiting songs" }).click();
    await p.getByRole("button", { name: "Decrease max waiting songs" }).click(); // 3 → 1
  });
  const g = await newGuest(browser, code, "Ivy", "🦋");

  // Approval flow with realtime host notification.
  await addSongFromSearch(g.page, "glitter", /Glitter on the Ceiling/);
  await expect(g.page.getByText("Sent to the host for approval 🎶")).toBeVisible();
  await host.getByTestId("tab-requests").click();
  await expect(host.getByTestId("approval-list")).toContainText("Glitter on the Ceiling");
  // Limit: one waiting song per guest.
  const over = await command(g.page, partyId, { type: "add_song", ref: "demo:twinkle-twinkle" });
  expect(over.status).toBe(429);
  expect(over.json.error.code).toBe("limit_reached");
  await host.getByRole("button", { name: "Approve Glitter on the Ceiling (Official Video)" }).click();
  await expect(g.page.getByText("The host approved your song.")).toBeVisible();

  // Host pauses submissions: guests see why they can't add, and the API refuses.
  await host.getByTestId("toggle-submissions").click();
  await expect(g.page.getByText("The queue is paused.")).toBeVisible();
  await g.page.getByTestId("guest-tab-search").click();
  await expect(g.page.getByText("The host has paused song submissions for now.")).toBeVisible();
  const closed = await command(g.page, partyId, { type: "add_song", ref: "demo:take-me-out" });
  expect(closed.json.error.code).toBe("submissions_closed");
  await host.getByTestId("toggle-submissions").click();

  // Remove a participant: they get a clear screen and lose access.
  const rogue = await newGuest(browser, code, "Rogue", "👽");
  await host.getByTestId("tab-guests").click();
  await host.getByRole("button", { name: "Remove Rogue from the party" }).click();
  await rogue.page.reload();
  await expect(rogue.page.getByRole("heading", { name: "You've left this party" })).toBeVisible();
  expect((await command(rogue.page, partyId, { type: "add_song", ref: "demo:take-me-out" })).status).toBe(403);
  await rogue.context.close();

  // End the party (with confirmation): connected guests see the goodbye screen.
  await host.getByTestId("end-party").click();
  await host.getByRole("button", { name: "End party" }).last().click();
  await expect(g.page.getByRole("heading", { name: "That's a wrap!" })).toBeVisible({ timeout: 20_000 });
  // New visitors to the QR link learn the party is over; joining is refused.
  const late = await browser.newPage();
  await late.goto(`/p/${code}`);
  await expect(late.getByRole("heading", { name: "That's a wrap!" })).toBeVisible();
  const join = await late.evaluate(async (partyId) => (await fetch(`/api/parties/${partyId}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Late" }) })).status, partyId);
  expect(join).toBe(410);
  await late.close();
  await g.context.close();
});

test("host history: replay creates a new entry and the set list exports", async ({ browser, page: host }) => {
  const { partyId, code } = await createParty(host, "History Night");
  const g = await newGuest(browser, code, "Jo", "👑");
  await command(g.page, partyId, { type: "add_song", ref: "demo:twinkle-twinkle" });
  await command(host, partyId, { type: "start" });
  await command(host, partyId, { type: "finish" });
  await host.getByTestId("tab-history").click();
  await expect(host.getByTestId("history-list")).toContainText("Twinkle, Twinkle, Little Star");
  await host.getByRole("button", { name: "Replay Twinkle, Twinkle, Little Star" }).click();
  await expect.poll(async () => (await state(host, partyId)).upcoming.length).toBe(1);
  const snap = await state(host, partyId);
  expect(snap.history).toHaveLength(1);
  const csv = await host.evaluate(async (partyId) => (await fetch(`/api/parties/${partyId}/export?format=csv`)).text(), partyId);
  expect(csv).toContain("Twinkle, Twinkle, Little Star");
  expect(csv).toContain("Jo");
  const guestExport = await g.page.evaluate(async (partyId) => (await fetch(`/api/parties/${partyId}/export`)).status, partyId);
  expect(guestExport).toBe(403);
  await g.context.close();
});
