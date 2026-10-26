import { describe, expect, it } from "vitest";
import {
  applyGuestCommand,
  applyHostCommand,
  DomainError,
  estimatePosition,
  joinParty,
  upcomingItems,
  pendingItems,
} from "@/lib/domain/party-logic";
import { buildSnapshot } from "@/lib/domain/snapshot";
import { addGuest, Clock, makeParty, songs, ytSong } from "./helpers";

const add = (agg: Parameters<typeof applyGuestCommand>[0], pid: string, i: number, clock: Clock) =>
  applyGuestCommand(agg, pid, { type: "add_song", song: songs[i] }, clock.ctx());

function expectDomainError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}`);
}

describe("party creation and joining", () => {
  it("creates an active party with defaults and idle playback", () => {
    const { agg } = makeParty();
    expect(agg.party.status).toBe("active");
    expect(agg.party.joinCode).toBe("ABC234");
    expect(agg.playback.status).toBe("idle");
    expect(agg.party.hostTokenHashes).toHaveLength(1);
  });

  it("host can rename the party, with validation", () => {
    const { agg, clock } = makeParty();
    applyHostCommand(agg, { type: "rename", name: "  Birthday   Bash " }, clock.ctx());
    expect(agg.party.name).toBe("Birthday Bash");
    expectDomainError(() => applyHostCommand(agg, { type: "rename", name: "   " }, clock.ctx()), "invalid_party_name");
  });

  it("validates names, prevents duplicates and reserved names", () => {
    const { agg, clock } = makeParty();
    const alex = addGuest(agg, "  Alex ​ ", clock);
    expect(alex.displayName).toBe("Alex");
    expectDomainError(() => addGuest(agg, "alex", clock), "name_taken");
    expectDomainError(() => addGuest(agg, "Host", clock), "invalid_name");
    expectDomainError(() => addGuest(agg, "", clock), "invalid_name");
    expectDomainError(() => addGuest(agg, "x".repeat(25), clock), "invalid_name");
    expectDomainError(
      () => joinParty(agg, { displayName: "Sam", avatar: "<script>", tokenHash: "b".repeat(64) }, clock.ctx()),
      "invalid_avatar",
    );
  });

  it("rejects joining an ended party", () => {
    const { agg, clock } = makeParty();
    applyHostCommand(agg, { type: "end_party" }, clock.ctx());
    expectDomainError(() => addGuest(agg, "Late", clock), "party_ended");
  });
});

describe("queue submissions", () => {
  it("adds songs in order with contiguous positions", () => {
    const { agg, clock } = makeParty();
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    add(agg, a.id, 0, clock);
    add(agg, b.id, 1, clock);
    add(agg, a.id, 2, clock);
    expect(upcomingItems(agg).map((q) => q.position)).toEqual([1, 2, 3]);
    expect(upcomingItems(agg).map((q) => q.participantId)).toEqual([a.id, b.id, a.id]);
  });

  it("prevents duplicates and enforces per-guest limits", () => {
    const { agg, clock } = makeParty({ maxPendingPerGuest: 2 });
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    add(agg, a.id, 0, clock);
    expectDomainError(() => add(agg, b.id, 0, clock), "duplicate");
    add(agg, a.id, 1, clock);
    expectDomainError(() => add(agg, a.id, 2, clock), "limit_reached");
  });

  it("allows duplicates when the host turns prevention off", () => {
    const { agg, clock } = makeParty({ preventDuplicates: false });
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    add(agg, a.id, 0, clock);
    add(agg, b.id, 0, clock);
    expect(upcomingItems(agg)).toHaveLength(2);
  });

  it("respects paused submissions", () => {
    const { agg, clock } = makeParty();
    const a = addGuest(agg, "Alex", clock);
    applyHostCommand(agg, { type: "update_settings", patch: { submissionsOpen: false } }, clock.ctx());
    expectDomainError(() => add(agg, a.id, 0, clock), "submissions_closed");
  });

  it("routes songs through approval when required", () => {
    const { agg, clock } = makeParty({ requireApproval: true });
    const a = addGuest(agg, "Alex", clock);
    const { queueItemId } = add(agg, a.id, 0, clock);
    expect(pendingItems(agg)).toHaveLength(1);
    expect(upcomingItems(agg)).toHaveLength(0);
    applyHostCommand(agg, { type: "approve", queueItemId: queueItemId! }, clock.ctx());
    expect(upcomingItems(agg)).toHaveLength(1);
    const second = add(agg, a.id, 1, clock);
    applyHostCommand(agg, { type: "reject", queueItemId: second.queueItemId! }, clock.ctx());
    expect(agg.queue.find((q) => q.id === second.queueItemId)!.status).toBe("rejected");
  });

  it("auto-approves pending songs when approval is switched off", () => {
    const { agg, clock } = makeParty({ requireApproval: true });
    const a = addGuest(agg, "Alex", clock);
    add(agg, a.id, 0, clock);
    add(agg, a.id, 1, clock);
    applyHostCommand(agg, { type: "update_settings", patch: { requireApproval: false } }, clock.ctx());
    expect(upcomingItems(agg).map((q) => q.position)).toEqual([1, 2]);
  });

  it("lets guests remove only their own pending songs, when allowed", () => {
    const { agg, clock } = makeParty();
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    const mine = add(agg, a.id, 0, clock).queueItemId!;
    expectDomainError(() => applyGuestCommand(agg, b.id, { type: "remove_own", queueItemId: mine }, clock.ctx()), "forbidden");
    applyGuestCommand(agg, a.id, { type: "remove_own", queueItemId: mine }, clock.ctx());
    expect(upcomingItems(agg)).toHaveLength(0);

    applyHostCommand(agg, { type: "update_settings", patch: { allowGuestRemoval: false } }, clock.ctx());
    const again = add(agg, a.id, 1, clock).queueItemId!;
    expectDomainError(() => applyGuestCommand(agg, a.id, { type: "remove_own", queueItemId: again }, clock.ctx()), "forbidden");
  });
});

describe("host queue management", () => {
  it("reorders, moves to top, removes and clears", () => {
    const { agg, clock } = makeParty();
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    const ids = [add(agg, a.id, 0, clock), add(agg, b.id, 1, clock), add(agg, a.id, 2, clock)].map((r) => r.queueItemId!);
    applyHostCommand(agg, { type: "reorder", orderedIds: [ids[2], ids[0], ids[1]] }, clock.ctx());
    expect(upcomingItems(agg).map((q) => q.id)).toEqual([ids[2], ids[0], ids[1]]);
    applyHostCommand(agg, { type: "move_to_top", queueItemId: ids[1] }, clock.ctx());
    expect(upcomingItems(agg)[0].id).toBe(ids[1]);
    applyHostCommand(agg, { type: "remove_item", queueItemId: ids[0] }, clock.ctx());
    expect(upcomingItems(agg).map((q) => q.position)).toEqual([1, 2]);
    expectDomainError(() => applyHostCommand(agg, { type: "reorder", orderedIds: [ids[1]] }, clock.ctx()), "stale_queue");
    applyHostCommand(agg, { type: "clear_queue" }, clock.ctx());
    expect(upcomingItems(agg)).toHaveLength(0);
  });

  it("removing a participant drops their upcoming songs and votes", () => {
    const { agg, clock } = makeParty();
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    const bSong = add(agg, b.id, 1, clock).queueItemId!;
    add(agg, a.id, 0, clock);
    applyGuestCommand(agg, a.id, { type: "vote", queueItemId: bSong }, clock.ctx());
    applyHostCommand(agg, { type: "remove_participant", participantId: a.id }, clock.ctx());
    expect(upcomingItems(agg).map((q) => q.participantId)).toEqual([b.id]);
    expect(agg.votes).toHaveLength(0);
    expectDomainError(() => add(agg, a.id, 3, clock), "participant_removed");
  });
});

describe("voting", () => {
  it("prevents duplicate votes and self votes", () => {
    const { agg, clock } = makeParty();
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    const item = add(agg, a.id, 0, clock).queueItemId!;
    expectDomainError(() => applyGuestCommand(agg, a.id, { type: "vote", queueItemId: item }, clock.ctx()), "own_song");
    applyGuestCommand(agg, b.id, { type: "vote", queueItemId: item }, clock.ctx());
    expectDomainError(() => applyGuestCommand(agg, b.id, { type: "vote", queueItemId: item }, clock.ctx()), "already_voted");
    applyGuestCommand(agg, b.id, { type: "unvote", queueItemId: item }, clock.ctx());
    expect(agg.votes).toHaveLength(0);
  });

  it("rejects votes when voting is off", () => {
    const { agg, clock } = makeParty({ votingMode: "off" });
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    const item = add(agg, a.id, 0, clock).queueItemId!;
    expectDomainError(() => applyGuestCommand(agg, b.id, { type: "vote", queueItemId: item }, clock.ctx()), "voting_disabled");
  });

  it("display mode never reorders", () => {
    const { agg, clock } = makeParty({ votingMode: "display" });
    const [a, b, c] = ["A1", "B1", "C1"].map((n) => addGuest(agg, n, clock));
    const ids = [add(agg, a.id, 0, clock), add(agg, a.id, 1, clock), add(agg, b.id, 2, clock)].map((r) => r.queueItemId!);
    applyGuestCommand(agg, c.id, { type: "vote", queueItemId: ids[2] }, clock.ctx());
    expect(upcomingItems(agg).map((q) => q.id)).toEqual(ids);
  });

  it("reorder mode sorts by votes but keeps the up-next song and pinned songs in place", () => {
    const { agg, clock } = makeParty({ votingMode: "reorder", maxPendingPerGuest: 10 });
    const [a, b, c] = ["A1", "B1", "C1"].map((n) => addGuest(agg, n, clock));
    const ids = [0, 1, 2, 3].map((i) => add(agg, a.id, i, clock).queueItemId!);
    // Vote for the last song: it jumps to slot 2 (slot 1 is locked as "up next").
    applyGuestCommand(agg, b.id, { type: "vote", queueItemId: ids[3] }, clock.ctx());
    expect(upcomingItems(agg).map((q) => q.id)).toEqual([ids[0], ids[3], ids[1], ids[2]]);
    // Host pins ids[2] to the top; votes can't move it.
    applyHostCommand(agg, { type: "move_to_top", queueItemId: ids[2] }, clock.ctx());
    applyGuestCommand(agg, b.id, { type: "vote", queueItemId: ids[1] }, clock.ctx());
    applyGuestCommand(agg, c.id, { type: "vote", queueItemId: ids[1] }, clock.ctx());
    const order = upcomingItems(agg).map((q) => q.id);
    expect(order[0]).toBe(ids[2]);
    expect(order[1]).toBe(ids[1]);
  });

  it("requests mode orders only songs awaiting approval", () => {
    const { agg, clock } = makeParty({ votingMode: "requests", requireApproval: true });
    const [a, b, c] = ["A1", "B1", "C1"].map((n) => addGuest(agg, n, clock));
    const first = add(agg, a.id, 0, clock).queueItemId!;
    const second = add(agg, b.id, 1, clock).queueItemId!;
    applyGuestCommand(agg, c.id, { type: "vote", queueItemId: second }, clock.ctx());
    expect(pendingItems(agg).map((q) => q.id)).toEqual([second, first]);
  });
});

describe("playback and progression", () => {
  function partyWithSongs() {
    const ctx = makeParty({ autoAdvance: true });
    const a = addGuest(ctx.agg, "Alex", ctx.clock);
    const b = addGuest(ctx.agg, "Bea", ctx.clock);
    const ids = [add(ctx.agg, a.id, 0, ctx.clock), add(ctx.agg, b.id, 2, ctx.clock)].map((r) => r.queueItemId!);
    return { ...ctx, a, b, ids };
  }

  it("start → intro → playing anchors to wall clock; pause freezes position", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    expect(agg.playback.status).toBe("intro");
    expect(agg.playback.currentQueueItemId).toBe(ids[0]);
    expect(agg.playback.command.type).toBe("load");
    applyHostCommand(agg, { type: "claim_output", clientId: "stage-client-1" }, clock.ctx());
    clock.advance(6000);
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "playing", positionSeconds: 0, durationSeconds: 63 }, clock.ctx());
    expect(agg.playback.status).toBe("playing");
    clock.advance(10_000);
    expect(estimatePosition(agg.playback, clock.t)).toBeCloseTo(10, 1);
    applyHostCommand(agg, { type: "pause" }, clock.ctx());
    expect(agg.playback.status).toBe("paused");
    clock.advance(30_000);
    expect(estimatePosition(agg.playback, clock.t)).toBeCloseTo(10, 1);
    applyHostCommand(agg, { type: "play" }, clock.ctx());
    clock.advance(2000);
    expect(estimatePosition(agg.playback, clock.t)).toBeCloseTo(12, 1);
    applyHostCommand(agg, { type: "seek", positionSeconds: 40 }, clock.ctx());
    expect(agg.playback.command.type).toBe("seek");
    expect(estimatePosition(agg.playback, clock.t)).toBeCloseTo(40, 1);
    applyHostCommand(agg, { type: "restart" }, clock.ctx());
    expect(estimatePosition(agg.playback, clock.t)).toBe(0);
  });

  it("ignores reports from a different output or for a stale song", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "claim_output", clientId: "stage-client-1" }, clock.ctx());
    const r1 = applyHostCommand(agg, { type: "player_report", clientId: "other-client-2", queueItemId: ids[0], state: "ended", positionSeconds: 60 }, clock.ctx());
    expect(r1.silent).toBe(true);
    const r2 = applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[1], state: "ended", positionSeconds: 60 }, clock.ctx());
    expect(r2.silent).toBe(true);
    expect(agg.playback.currentQueueItemId).toBe(ids[0]);
  });

  it("ended report completes the song, records history, counts the performance and auto-advances", () => {
    const { agg, clock, ids, a } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "ended", positionSeconds: 63 }, clock.ctx());
    expect(agg.queue.find((q) => q.id === ids[0])!.status).toBe("completed");
    expect(agg.history).toHaveLength(1);
    expect(agg.history[0].completionStatus).toBe("completed");
    expect(agg.participants.find((p) => p.id === a.id)!.performanceCount).toBe(1);
    expect(agg.playback.currentQueueItemId).toBe(ids[1]);
    expect(agg.playback.status).toBe("intro");
  });

  it("without auto-advance the stage goes idle and waits for Next", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "update_settings", patch: { autoAdvance: false } }, clock.ctx());
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "ended", positionSeconds: 63 }, clock.ctx());
    expect(agg.playback.status).toBe("idle");
    expect(upcomingItems(agg)[0].id).toBe(ids[1]);
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    expect(agg.playback.currentQueueItemId).toBe(ids[1]);
  });

  it("skip records a skipped song and advances; empty queue goes idle", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "skip" }, clock.ctx());
    expect(agg.queue.find((q) => q.id === ids[0])!.status).toBe("skipped");
    expect(agg.playback.currentQueueItemId).toBe(ids[1]);
    applyHostCommand(agg, { type: "finish" }, clock.ctx());
    expect(agg.playback.status).toBe("idle");
    expect(agg.history.map((h) => h.completionStatus)).toEqual(["skipped", "completed"]);
    expectDomainError(() => applyHostCommand(agg, { type: "start" }, clock.ctx()), "queue_empty");
  });

  it("player errors keep the queue intact and an unavailable video can be skipped", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "error", positionSeconds: 0, errorCode: "150" }, clock.ctx());
    expect(agg.playback.status).toBe("error");
    expect(agg.playback.error?.message).toMatch(/doesn't allow/);
    expectDomainError(() => applyHostCommand(agg, { type: "play" }, clock.ctx()), "video_error");
    applyHostCommand(agg, { type: "report_unavailable" }, clock.ctx());
    expect(agg.history[0].completionStatus).toBe("unavailable");
    expect(agg.playback.currentQueueItemId).toBe(ids[1]);
  });

  it("a different version can replace the failing video", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "error", positionSeconds: 0, errorCode: "101" }, clock.ctx());
    applyHostCommand(agg, { type: "replace_video", queueItemId: ids[0], song: ytSong("dQw4w9WgXcQ") }, clock.ctx());
    expect(agg.queue.find((q) => q.id === ids[0])!.songId).toBe("yt:dQw4w9WgXcQ");
    expect(agg.playback.status).toBe("intro");
    expect(agg.playback.error).toBeNull();
  });

  it("autoplay blocks are surfaced as ready + blocked", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "blocked", positionSeconds: 0 }, clock.ctx());
    expect(agg.playback.status).toBe("ready");
    expect(agg.playback.autoplayBlocked).toBe(true);
  });

  it("a new stage claiming output never pretends playback continued", () => {
    const { agg, clock, ids } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "player_report", clientId: "stage-client-1", queueItemId: ids[0], state: "playing", positionSeconds: 5 }, clock.ctx());
    clock.advance(4000);
    applyHostCommand(agg, { type: "claim_output", clientId: "stage-client-2" }, clock.ctx());
    expect(agg.playback.status).toBe("paused");
    expect(agg.playback.interrupted).toBe(true);
    expect(agg.playback.positionSeconds).toBeCloseTo(9, 1);
  });

  it("replay creates a new queue entry without touching history", () => {
    const { agg, clock } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "finish" }, clock.ctx());
    const entry = agg.history[0];
    const { queueItemId } = applyHostCommand(agg, { type: "replay", historyId: entry.id, toTop: true }, clock.ctx());
    const item = agg.queue.find((q) => q.id === queueItemId)!;
    expect(item.replayOf).toBe(entry.queueItemId);
    expect(upcomingItems(agg)[0].id).toBe(item.id);
    expect(agg.history).toHaveLength(1);
    expect(agg.queue.find((q) => q.id === entry.queueItemId)!.status).toBe("completed");
  });

  it("ending the party blocks further commands", () => {
    const { agg, clock, a } = partyWithSongs();
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "end_party" }, clock.ctx());
    expect(agg.party.status).toBe("ended");
    expect(agg.history.at(-1)!.completionStatus).toBe("skipped");
    expectDomainError(() => add(agg, a.id, 4, clock), "party_ended");
    expectDomainError(() => applyHostCommand(agg, { type: "play" }, clock.ctx()), "party_ended");
  });
});

describe("snapshots", () => {
  it("hides other guests' pending songs and secrets, estimates waits", () => {
    const { agg, clock } = makeParty({ requireApproval: true });
    const a = addGuest(agg, "Alex", clock);
    const b = addGuest(agg, "Bea", clock);
    add(agg, a.id, 0, clock);
    add(agg, b.id, 1, clock);
    const forBea = buildSnapshot(agg, { role: "guest", participantId: b.id }, new Date(clock.t));
    expect(forBea.pending).toHaveLength(1);
    expect(forBea.pending[0].isMine).toBe(true);
    expect(JSON.stringify(forBea)).not.toContain(a.tokenHash);
    expect(JSON.stringify(forBea)).not.toContain(agg.party.hostTokenHashes[0]);
    expect(forBea.me).toMatchObject({ role: "guest", displayName: "Bea" });
    const forHost = buildSnapshot(agg, { role: "host" }, new Date(clock.t));
    expect(forHost.pending).toHaveLength(2);
  });

  it("awards badges from real activity only", () => {
    const { agg, clock } = makeParty({ maxPendingPerGuest: 10, autoAdvance: false });
    const a = addGuest(agg, "Alex", clock);
    for (let i = 0; i < 3; i++) add(agg, a.id, i, clock);
    applyHostCommand(agg, { type: "start" }, clock.ctx());
    applyHostCommand(agg, { type: "finish" }, clock.ctx());
    const snap = buildSnapshot(agg, { role: "host" }, new Date(clock.t));
    const alex = snap.participants.find((p) => p.id === a.id)!;
    expect(alex.badges).toContain("first_to_mic");
    expect(alex.badges).toContain("queue_master");
    expect(alex.badges).not.toContain("karaoke_legend");
    // "finish" auto-advanced: song 2 is on stage (46s + 6s intro + 20s changeover before song 3).
    expect(snap.nowPlaying?.song.id).toBe(songs[1].id);
    expect(snap.upcoming[0].estimatedStartInSeconds).toBe(46 + 6 + 20);
  });
});
