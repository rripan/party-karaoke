/**
 * Pure party domain logic. Every function here mutates the aggregate it is
 * given (callers pass a private clone) and throws DomainError for any rule
 * violation. No I/O happens here, which keeps the rules identical across the
 * in-memory store and the Postgres store, and makes them easy to unit test.
 */
import type { GuestCommand, HostCommand } from "./commands";
import { AVATARS, DEFAULT_SETTINGS, mergeSettings } from "./settings";
import type {
  CompletionStatus,
  LyricsMeta,
  Participant,
  PartyAggregate,
  PartySettings,
  PlaybackCommandType,
  PlaybackState,
  QueueItem,
  Song,
} from "./types";

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export interface Ctx {
  now: Date;
  newId: () => string;
}

export interface CommandResult {
  /** When true, the change is bookkeeping only and clients need not refetch. */
  silent?: boolean;
  queueItemId?: string;
  participantId?: string;
}

export const INTRO_MS = 6000;
export const REPLACE_INTRO_MS = 2500;
export const MAX_PARTICIPANTS = 200;
export const MAX_ACTIVE_QUEUE = 300;
const REPORT_GRACE_MS = 2000;

const iso = (d: Date) => d.toISOString();

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createPartyAggregate(input: {
  id: string;
  joinCode: string;
  name: string;
  hostTokenHash: string;
  settings?: PartySettings;
  now: Date;
}): PartyAggregate {
  const now = iso(input.now);
  return {
    party: {
      id: input.id,
      joinCode: input.joinCode,
      name: normalizePartyName(input.name),
      hostTokenHashes: [input.hostTokenHash],
      status: "active",
      settings: input.settings ?? structuredClone(DEFAULT_SETTINGS),
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      endedAt: null,
      endedReason: null,
      version: 1,
    },
    participants: [],
    queue: [],
    songs: {},
    playback: emptyPlayback(input.id, now),
    history: [],
    votes: [],
    lyrics: {},
  };
}

export function emptyPlayback(partyId: string, now: string): PlaybackState {
  return {
    partyId,
    currentQueueItemId: null,
    status: "idle",
    positionSeconds: 0,
    playbackStartedAt: null,
    pausedAt: null,
    updatedAt: now,
    durationSeconds: null,
    command: { seq: 0, type: "stop", positionSeconds: 0, issuedAt: now },
    error: null,
    autoplayBlocked: false,
    interrupted: false,
    introUntil: null,
    outputClientId: null,
    outputLastSeenAt: null,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const RESERVED_NAMES = new Set(["host", "the host", "admin", "administrator", "system", "karaoke"]);

export function normalizeDisplayName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    // control characters, zero-width and bidi override characters
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...cleaned].length;
  if (length < 1) throw new DomainError("invalid_name", "Please enter a display name.");
  if (length > 24) throw new DomainError("invalid_name", "Display names can be up to 24 characters.");
  if (RESERVED_NAMES.has(cleaned.toLowerCase())) {
    throw new DomainError("invalid_name", "That name is reserved. Try another one!");
  }
  return cleaned;
}

export function normalizePartyName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...cleaned].length;
  if (length < 1) throw new DomainError("invalid_party_name", "Give your party a name.");
  if (length > 60) throw new DomainError("invalid_party_name", "Party names can be up to 60 characters.");
  return cleaned;
}

export function normalizeAvatar(raw: string | undefined): string {
  if (raw && (AVATARS as readonly string[]).includes(raw)) return raw;
  if (raw) throw new DomainError("invalid_avatar", "Please pick one of the available avatars.");
  return AVATARS[0];
}

function assertNotEnded(agg: PartyAggregate) {
  if (agg.party.status === "ended") {
    throw new DomainError("party_ended", "This party has ended.", 410);
  }
}

function activeParticipant(agg: PartyAggregate, participantId: string): Participant {
  const p = agg.participants.find((x) => x.id === participantId);
  if (!p) throw new DomainError("not_a_participant", "You are not part of this party.", 403);
  if (p.removedAt) throw new DomainError("participant_removed", "The host removed you from this party.", 403);
  return p;
}

function findItem(agg: PartyAggregate, queueItemId: string): QueueItem {
  const item = agg.queue.find((q) => q.id === queueItemId);
  if (!item) throw new DomainError("not_found", "That song is no longer in the queue.", 404);
  return item;
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

const byPosition = (a: QueueItem, b: QueueItem) => a.position - b.position || a.addedAt.localeCompare(b.addedAt);

export function upcomingItems(agg: PartyAggregate): QueueItem[] {
  return agg.queue.filter((q) => q.status === "queued").sort(byPosition);
}

export function pendingItems(agg: PartyAggregate): QueueItem[] {
  return agg.queue.filter((q) => q.status === "pending_approval").sort(byPosition);
}

export function currentItem(agg: PartyAggregate): QueueItem | null {
  const id = agg.playback.currentQueueItemId;
  return id ? (agg.queue.find((q) => q.id === id) ?? null) : null;
}

function renumber(items: QueueItem[]) {
  items.forEach((item, index) => {
    item.position = index + 1;
  });
}

function appendPosition(items: QueueItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.position), 0) + 1;
}

export function voteCounts(agg: PartyAggregate): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of agg.votes) counts.set(v.queueItemId, (counts.get(v.queueItemId) ?? 0) + 1);
  return counts;
}

/**
 * Applies the predictable vote ordering rule for the current voting mode:
 *  - reorder:  upcoming songs sort by votes (desc); ties keep their current
 *              order; the song that is up next and host-pinned songs keep
 *              their slots. The playing song is never part of the queue list.
 *  - requests: only songs awaiting approval are ordered by votes.
 */
export function applyVoteOrdering(agg: PartyAggregate) {
  const mode = agg.party.settings.votingMode;
  const counts = voteCounts(agg);
  const score = (q: QueueItem) => counts.get(q.id) ?? 0;
  if (mode === "reorder") {
    const list = upcomingItems(agg);
    const locked = (q: QueueItem, index: number) => index === 0 || q.pinned;
    const free = list.filter((q, i) => !locked(q, i)).sort((a, b) => score(b) - score(a) || byPosition(a, b));
    let cursor = 0;
    const ordered = list.map((q, i) => (locked(q, i) ? q : free[cursor++]));
    renumber(ordered);
  } else if (mode === "requests") {
    const list = pendingItems(agg).sort((a, b) => score(b) - score(a) || byPosition(a, b));
    renumber(list);
  }
}

// ---------------------------------------------------------------------------
// Playback helpers
// ---------------------------------------------------------------------------

export function estimatePosition(pb: PlaybackState, nowMs: number): number {
  let pos = pb.positionSeconds;
  if (pb.status === "playing" && pb.playbackStartedAt) {
    pos += Math.max(0, (nowMs - Date.parse(pb.playbackStartedAt)) / 1000);
  }
  if (pb.durationSeconds) pos = Math.min(pos, pb.durationSeconds);
  return Math.max(0, pos);
}

function issueCommand(pb: PlaybackState, type: PlaybackCommandType, positionSeconds: number, now: Date) {
  pb.command = { seq: pb.command.seq + 1, type, positionSeconds, issuedAt: iso(now) };
  pb.updatedAt = iso(now);
}

function setIdle(agg: PartyAggregate, now: Date) {
  const pb = agg.playback;
  pb.currentQueueItemId = null;
  pb.status = "idle";
  pb.positionSeconds = 0;
  pb.playbackStartedAt = null;
  pb.pausedAt = null;
  pb.durationSeconds = null;
  pb.error = null;
  pb.autoplayBlocked = false;
  pb.interrupted = false;
  pb.introUntil = null;
  issueCommand(pb, "stop", 0, now);
}

function startItem(agg: PartyAggregate, item: QueueItem, ctx: Ctx, introMs = INTRO_MS) {
  const pb = agg.playback;
  item.status = "playing";
  item.startedAt = iso(ctx.now);
  item.pinned = false;
  pb.currentQueueItemId = item.id;
  pb.status = "intro";
  pb.positionSeconds = 0;
  pb.playbackStartedAt = null;
  pb.pausedAt = null;
  pb.durationSeconds = agg.songs[item.songId]?.durationSeconds ?? null;
  pb.error = null;
  pb.autoplayBlocked = false;
  pb.interrupted = false;
  pb.introUntil = iso(new Date(ctx.now.getTime() + introMs));
  issueCommand(pb, "load", 0, ctx.now);
  renumber(upcomingItems(agg));
}

/** Starts the next queued song, or goes idle if the queue is empty. */
export function advance(agg: PartyAggregate, ctx: Ctx): QueueItem | null {
  const next = upcomingItems(agg)[0];
  if (!next) {
    setIdle(agg, ctx.now);
    return null;
  }
  startItem(agg, next, ctx);
  return next;
}

/** Closes out the song on stage and records it in history. */
export function finishCurrent(
  agg: PartyAggregate,
  outcome: CompletionStatus,
  ctx: Ctx,
  reason: string | null = null,
) {
  const item = currentItem(agg);
  if (!item) return;
  const now = iso(ctx.now);
  if (outcome === "completed") {
    item.status = "completed";
    item.completedAt = now;
    const performer = agg.participants.find((p) => p.id === item.participantId);
    if (performer) performer.performanceCount += 1;
  } else {
    item.status = "skipped";
    item.skippedAt = now;
  }
  item.statusReason = reason ?? (outcome === "unavailable" ? "unavailable" : null);
  agg.history.push({
    id: ctx.newId(),
    partyId: agg.party.id,
    songId: item.songId,
    participantId: item.participantId,
    queueItemId: item.id,
    playedAt: item.startedAt ?? now,
    endedAt: now,
    completionStatus: outcome,
  });
  setIdle(agg, ctx.now);
}

const YT_ERRORS: Record<string, string> = {
  "2": "YouTube rejected the video ID for this song.",
  "5": "This video can't be played in the browser's HTML5 player.",
  "100": "This video was removed or is private.",
  "101": "The video's owner doesn't allow it to be played on other websites.",
  "150": "The video's owner doesn't allow it to be played on other websites.",
  "153": "YouTube needs a referrer to play this video. Check the site's referrer policy.",
  timeout: "The video didn't start loading. YouTube may be unreachable.",
  api_unavailable: "The YouTube player couldn't be loaded. Check the network connection.",
};

export function describePlayerError(code: string | undefined): string {
  return YT_ERRORS[code ?? ""] ?? "This video can't be played right now.";
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

export function joinParty(
  agg: PartyAggregate,
  input: { displayName: string; avatar?: string; tokenHash: string },
  ctx: Ctx,
): Participant {
  assertNotEnded(agg);
  const displayName = normalizeDisplayName(input.displayName);
  const avatar = normalizeAvatar(input.avatar);
  const active = agg.participants.filter((p) => !p.removedAt);
  if (active.length >= MAX_PARTICIPANTS) {
    throw new DomainError("party_full", "This party is full.", 409);
  }
  if (active.some((p) => p.displayName.toLowerCase() === displayName.toLowerCase())) {
    throw new DomainError("name_taken", `Someone is already called “${displayName}”. Try adding an initial!`, 409);
  }
  const participant: Participant = {
    id: ctx.newId(),
    partyId: agg.party.id,
    displayName,
    avatar,
    tokenHash: input.tokenHash,
    joinedAt: iso(ctx.now),
    lastSeenAt: iso(ctx.now),
    removedAt: null,
    performanceCount: 0,
  };
  agg.participants.push(participant);
  return participant;
}

// ---------------------------------------------------------------------------
// Guest commands
// ---------------------------------------------------------------------------

export type DomainGuestCommand =
  | Exclude<GuestCommand, { type: "add_song" }>
  | { type: "add_song"; song: Song; lyrics?: LyricsMeta | null };

export function applyGuestCommand(
  agg: PartyAggregate,
  participantId: string,
  cmd: DomainGuestCommand,
  ctx: Ctx,
): CommandResult {
  assertNotEnded(agg);
  const me = activeParticipant(agg, participantId);
  const settings = agg.party.settings;

  switch (cmd.type) {
    case "add_song": {
      if (!settings.submissionsOpen) {
        throw new DomainError("submissions_closed", "The host has paused song submissions for now.", 403);
      }
      const song = cmd.song;
      const mineOpen = agg.queue.filter(
        (q) => q.participantId === me.id && (q.status === "queued" || q.status === "pending_approval"),
      );
      if (mineOpen.length >= settings.maxPendingPerGuest) {
        throw new DomainError(
          "limit_reached",
          `You already have ${mineOpen.length} song${mineOpen.length === 1 ? "" : "s"} waiting. Sing one first!`,
          429,
        );
      }
      if (settings.preventDuplicates) {
        const dup = agg.queue.find(
          (q) =>
            q.songId === song.id &&
            (q.status === "queued" || q.status === "pending_approval" || q.status === "playing"),
        );
        if (dup) {
          const by = agg.participants.find((p) => p.id === dup.participantId)?.displayName ?? "someone";
          throw new DomainError("duplicate", `That song is already in the queue (requested by ${by}).`, 409);
        }
      }
      const open = agg.queue.filter((q) => q.status === "queued" || q.status === "pending_approval");
      if (open.length >= MAX_ACTIVE_QUEUE) {
        throw new DomainError("queue_full", "The queue is full. Try again after a few songs.", 409);
      }
      agg.songs[song.id] = song;
      if (cmd.lyrics) agg.lyrics[song.id] = cmd.lyrics;
      const status = settings.requireApproval ? "pending_approval" : "queued";
      const item: QueueItem = {
        id: ctx.newId(),
        partyId: agg.party.id,
        songId: song.id,
        participantId: me.id,
        position: appendPosition(status === "queued" ? upcomingItems(agg) : pendingItems(agg)),
        status,
        pinned: false,
        statusReason: null,
        addedAt: iso(ctx.now),
        startedAt: null,
        completedAt: null,
        skippedAt: null,
        replayOf: null,
      };
      agg.queue.push(item);
      applyVoteOrdering(agg);
      return { queueItemId: item.id };
    }

    case "remove_own": {
      const item = findItem(agg, cmd.queueItemId);
      if (item.participantId !== me.id) {
        throw new DomainError("forbidden", "You can only remove your own songs.", 403);
      }
      if (!settings.allowGuestRemoval) {
        throw new DomainError("forbidden", "The host has turned off removing songs. Ask the host!", 403);
      }
      if (item.status !== "queued" && item.status !== "pending_approval") {
        throw new DomainError("not_removable", "Only songs that haven't started can be removed.", 409);
      }
      item.status = "removed";
      item.statusReason = "guest_removed";
      agg.votes = agg.votes.filter((v) => v.queueItemId !== item.id);
      renumber(upcomingItems(agg));
      renumber(pendingItems(agg));
      return { queueItemId: item.id };
    }

    case "vote": {
      if (settings.votingMode === "off") {
        throw new DomainError("voting_disabled", "Voting is turned off for this party.", 403);
      }
      const item = findItem(agg, cmd.queueItemId);
      const votable =
        item.status === "queued" || (item.status === "pending_approval" && settings.votingMode === "requests");
      if (!votable) throw new DomainError("not_votable", "You can't vote for this song right now.", 409);
      if (item.participantId === me.id) {
        throw new DomainError("own_song", "You can't vote for your own song — but nice confidence!", 409);
      }
      if (agg.votes.some((v) => v.queueItemId === item.id && v.participantId === me.id)) {
        throw new DomainError("already_voted", "You already voted for this song.", 409);
      }
      agg.votes.push({
        id: ctx.newId(),
        partyId: agg.party.id,
        queueItemId: item.id,
        participantId: me.id,
        createdAt: iso(ctx.now),
      });
      applyVoteOrdering(agg);
      return { queueItemId: item.id };
    }

    case "unvote": {
      const before = agg.votes.length;
      agg.votes = agg.votes.filter((v) => !(v.queueItemId === cmd.queueItemId && v.participantId === me.id));
      if (agg.votes.length === before) return { silent: true };
      applyVoteOrdering(agg);
      return { queueItemId: cmd.queueItemId };
    }

    case "update_profile": {
      if (cmd.displayName !== undefined) {
        const name = normalizeDisplayName(cmd.displayName);
        const clash = agg.participants.some(
          (p) => p.id !== me.id && !p.removedAt && p.displayName.toLowerCase() === name.toLowerCase(),
        );
        if (clash) throw new DomainError("name_taken", `Someone is already called “${name}”.`, 409);
        me.displayName = name;
      }
      if (cmd.avatar !== undefined) me.avatar = normalizeAvatar(cmd.avatar);
      return { participantId: me.id };
    }
  }
}

// ---------------------------------------------------------------------------
// Host commands
// ---------------------------------------------------------------------------

export type DomainHostCommand =
  | Exclude<HostCommand, { type: "replace_video" }>
  | { type: "replace_video"; queueItemId: string; song: Song; lyrics?: LyricsMeta | null };

export function applyHostCommand(agg: PartyAggregate, cmd: DomainHostCommand, ctx: Ctx): CommandResult {
  assertNotEnded(agg);
  const pb = agg.playback;
  const settings = agg.party.settings;
  const nowMs = ctx.now.getTime();

  switch (cmd.type) {
    case "update_settings": {
      const previous = settings;
      const next = mergeSettings(previous, cmd.patch);
      agg.party.settings = next;
      if (previous.requireApproval && !next.requireApproval) {
        // Nothing should be stranded in the approval list once approval is off.
        let pos = appendPosition(upcomingItems(agg));
        for (const item of pendingItems(agg)) {
          item.status = "queued";
          item.position = pos++;
        }
      }
      applyVoteOrdering(agg);
      return {};
    }

    case "rename":
      agg.party.name = normalizePartyName(cmd.name);
      return {};

    case "approve": {
      const item = findItem(agg, cmd.queueItemId);
      if (item.status !== "pending_approval") throw new DomainError("not_pending", "That song isn't waiting for approval.", 409);
      item.status = "queued";
      item.position = appendPosition(upcomingItems(agg));
      renumber(pendingItems(agg));
      applyVoteOrdering(agg);
      return { queueItemId: item.id };
    }

    case "reject": {
      const item = findItem(agg, cmd.queueItemId);
      if (item.status !== "pending_approval") throw new DomainError("not_pending", "That song isn't waiting for approval.", 409);
      item.status = "rejected";
      item.statusReason = "host_rejected";
      agg.votes = agg.votes.filter((v) => v.queueItemId !== item.id);
      renumber(pendingItems(agg));
      return { queueItemId: item.id };
    }

    case "remove_item": {
      const item = findItem(agg, cmd.queueItemId);
      if (item.status === "playing") throw new DomainError("is_playing", "That song is on stage — use Skip instead.", 409);
      if (item.status !== "queued" && item.status !== "pending_approval") {
        throw new DomainError("not_removable", "That song is no longer in the queue.", 409);
      }
      item.status = "removed";
      item.statusReason = "host_removed";
      agg.votes = agg.votes.filter((v) => v.queueItemId !== item.id);
      renumber(upcomingItems(agg));
      renumber(pendingItems(agg));
      return { queueItemId: item.id };
    }

    case "move_to_top": {
      const item = findItem(agg, cmd.queueItemId);
      if (item.status === "pending_approval") {
        item.status = "queued";
        renumber(pendingItems(agg));
      } else if (item.status !== "queued") {
        throw new DomainError("not_queued", "Only upcoming songs can be moved.", 409);
      }
      const rest = upcomingItems(agg).filter((q) => q.id !== item.id);
      renumber([item, ...rest]);
      if (settings.votingMode === "reorder") item.pinned = true;
      return { queueItemId: item.id };
    }

    case "unpin": {
      const item = findItem(agg, cmd.queueItemId);
      item.pinned = false;
      applyVoteOrdering(agg);
      return { queueItemId: item.id };
    }

    case "reorder": {
      const list = upcomingItems(agg);
      const ids = new Set(list.map((q) => q.id));
      const unique = new Set(cmd.orderedIds);
      if (unique.size !== cmd.orderedIds.length || cmd.orderedIds.length !== list.length || !cmd.orderedIds.every((x) => ids.has(x))) {
        throw new DomainError("stale_queue", "The queue changed while you were dragging. Try again.", 409);
      }
      const byId = new Map(list.map((q) => [q.id, q]));
      renumber(cmd.orderedIds.map((x) => byId.get(x)!));
      if (settings.votingMode === "reorder" && cmd.movedId && byId.has(cmd.movedId)) {
        byId.get(cmd.movedId)!.pinned = true;
      }
      return {};
    }

    case "clear_queue": {
      const cleared = new Set<string>();
      for (const item of agg.queue) {
        if (item.status === "queued" || item.status === "pending_approval") {
          item.status = "removed";
          item.statusReason = "cleared";
          cleared.add(item.id);
        }
      }
      agg.votes = agg.votes.filter((v) => !cleared.has(v.queueItemId));
      return {};
    }

    case "start": {
      if (agg.party.status === "paused") agg.party.status = "active";
      if (pb.currentQueueItemId) {
        if (cmd.queueItemId && cmd.queueItemId !== pb.currentQueueItemId) {
          throw new DomainError("stage_busy", "A song is already on stage. Skip it first or move this one to the top.", 409);
        }
        return applyHostCommand(agg, { type: "play" }, ctx);
      }
      if (cmd.queueItemId) {
        const chosen = findItem(agg, cmd.queueItemId);
        if (chosen.status !== "queued") throw new DomainError("not_queued", "That song isn't in the queue.", 409);
        renumber([chosen, ...upcomingItems(agg).filter((q) => q.id !== chosen.id)]);
      }
      const started = advance(agg, ctx);
      if (!started) throw new DomainError("queue_empty", "The queue is empty. Get someone to add a song!", 409);
      return { queueItemId: started.id };
    }

    case "play": {
      if (!pb.currentQueueItemId) return applyHostCommand(agg, { type: "start" }, ctx);
      if (pb.status === "error") throw new DomainError("video_error", "This video can't play. Skip it or choose another version.", 409);
      if (agg.party.status === "paused") agg.party.status = "active";
      const pos = estimatePosition(pb, nowMs);
      pb.status = "playing";
      pb.positionSeconds = pos;
      pb.playbackStartedAt = iso(ctx.now);
      pb.pausedAt = null;
      pb.autoplayBlocked = false;
      pb.interrupted = false;
      pb.introUntil = null;
      issueCommand(pb, "play", pos, ctx.now);
      return {};
    }

    case "pause": {
      if (!pb.currentQueueItemId) return { silent: true };
      if (!["playing", "buffering", "intro", "ready"].includes(pb.status)) return { silent: true };
      const pos = estimatePosition(pb, nowMs);
      pb.status = "paused";
      pb.positionSeconds = pos;
      pb.playbackStartedAt = null;
      pb.pausedAt = iso(ctx.now);
      pb.introUntil = null;
      issueCommand(pb, "pause", pos, ctx.now);
      return {};
    }

    case "restart": {
      if (!pb.currentQueueItemId) throw new DomainError("nothing_playing", "Nothing is on stage right now.", 409);
      if (pb.status === "error") throw new DomainError("video_error", "This video can't play. Skip it or choose another version.", 409);
      pb.status = "playing";
      pb.positionSeconds = 0;
      pb.playbackStartedAt = iso(ctx.now);
      pb.pausedAt = null;
      pb.autoplayBlocked = false;
      pb.interrupted = false;
      pb.introUntil = null;
      issueCommand(pb, "restart", 0, ctx.now);
      return {};
    }

    case "seek": {
      if (!pb.currentQueueItemId) throw new DomainError("nothing_playing", "Nothing is on stage right now.", 409);
      let pos = cmd.positionSeconds;
      if (pb.durationSeconds) pos = Math.min(pos, Math.max(0, pb.durationSeconds - 1));
      pb.positionSeconds = pos;
      if (pb.status === "playing" || pb.status === "buffering") {
        pb.status = "playing";
        pb.playbackStartedAt = iso(ctx.now);
      } else {
        pb.playbackStartedAt = null;
      }
      issueCommand(pb, "seek", pos, ctx.now);
      return {};
    }

    case "skip":
    case "finish":
    case "report_unavailable": {
      if (!pb.currentQueueItemId) {
        if (cmd.type === "skip") return applyHostCommand(agg, { type: "start" }, ctx);
        throw new DomainError("nothing_playing", "Nothing is on stage right now.", 409);
      }
      const outcome: CompletionStatus =
        cmd.type === "finish" ? "completed" : cmd.type === "skip" ? "skipped" : "unavailable";
      finishCurrent(agg, outcome, ctx, cmd.type === "report_unavailable" ? (cmd.reason ?? "unavailable") : null);
      const next = advance(agg, ctx);
      return { queueItemId: next?.id };
    }

    case "replace_video": {
      const item = findItem(agg, cmd.queueItemId);
      if (!["queued", "pending_approval", "playing"].includes(item.status)) {
        throw new DomainError("not_replaceable", "That song is no longer in the queue.", 409);
      }
      agg.songs[cmd.song.id] = cmd.song;
      if (cmd.lyrics) agg.lyrics[cmd.song.id] = cmd.lyrics;
      item.songId = cmd.song.id;
      if (item.id === pb.currentQueueItemId) startItem(agg, item, ctx, REPLACE_INTRO_MS);
      return { queueItemId: item.id };
    }

    case "replay": {
      const entry = agg.history.find((h) => h.id === cmd.historyId);
      if (!entry) throw new DomainError("not_found", "That history entry doesn't exist.", 404);
      const performer = agg.participants.find((p) => p.id === entry.participantId && !p.removedAt);
      if (!performer) throw new DomainError("performer_gone", "That singer has left the party.", 409);
      const list = upcomingItems(agg);
      const item: QueueItem = {
        id: ctx.newId(),
        partyId: agg.party.id,
        songId: entry.songId,
        participantId: entry.participantId,
        position: cmd.toTop ? 0 : appendPosition(list),
        status: "queued",
        pinned: Boolean(cmd.toTop && settings.votingMode === "reorder"),
        statusReason: null,
        addedAt: iso(ctx.now),
        startedAt: null,
        completedAt: null,
        skippedAt: null,
        replayOf: entry.queueItemId,
      };
      agg.queue.push(item);
      renumber(upcomingItems(agg));
      return { queueItemId: item.id };
    }

    case "remove_participant": {
      const p = agg.participants.find((x) => x.id === cmd.participantId);
      if (!p || p.removedAt) throw new DomainError("not_found", "That guest isn't in the party.", 404);
      p.removedAt = iso(ctx.now);
      const removed = new Set<string>();
      for (const item of agg.queue) {
        if (item.participantId === p.id && (item.status === "queued" || item.status === "pending_approval")) {
          item.status = "removed";
          item.statusReason = "participant_removed";
          removed.add(item.id);
        }
      }
      agg.votes = agg.votes.filter((v) => v.participantId !== p.id && !removed.has(v.queueItemId));
      renumber(upcomingItems(agg));
      renumber(pendingItems(agg));
      applyVoteOrdering(agg);
      return { participantId: p.id };
    }

    case "pause_party": {
      agg.party.status = "paused";
      if (pb.status === "playing" || pb.status === "buffering" || pb.status === "intro") {
        applyHostCommand(agg, { type: "pause" }, ctx);
      }
      return {};
    }

    case "resume_party":
      agg.party.status = "active";
      return {};

    case "end_party": {
      if (pb.currentQueueItemId) finishCurrent(agg, "skipped", ctx, "party_ended");
      agg.party.status = "ended";
      agg.party.endedAt = iso(ctx.now);
      agg.party.endedReason = "host";
      return {};
    }

    case "claim_output": {
      if (pb.outputClientId === cmd.clientId && !cmd.fresh) {
        pb.outputLastSeenAt = iso(ctx.now);
        return { silent: true };
      }
      pb.outputClientId = cmd.clientId;
      pb.outputLastSeenAt = iso(ctx.now);
      if (pb.status === "playing" || pb.status === "buffering") {
        // The new screen has not started real playback yet: never pretend it has.
        pb.positionSeconds = estimatePosition(pb, nowMs);
        pb.status = "paused";
        pb.playbackStartedAt = null;
        pb.pausedAt = iso(ctx.now);
        pb.interrupted = true;
      }
      return {};
    }

    case "player_report":
      return applyPlayerReport(agg, cmd, ctx);
  }
}

function applyPlayerReport(
  agg: PartyAggregate,
  cmd: Extract<HostCommand, { type: "player_report" }>,
  ctx: Ctx,
): CommandResult {
  const pb = agg.playback;
  const nowMs = ctx.now.getTime();
  if (pb.outputClientId && pb.outputClientId !== cmd.clientId) return { silent: true };
  pb.outputClientId = cmd.clientId;
  pb.outputLastSeenAt = iso(ctx.now);
  if (cmd.queueItemId !== pb.currentQueueItemId) return { silent: true };

  const before = {
    status: pb.status,
    blocked: pb.autoplayBlocked,
    interrupted: pb.interrupted,
    error: pb.error?.code ?? null,
    estimate: estimatePosition(pb, nowMs),
  };
  const item = currentItem(agg);
  if (cmd.durationSeconds && cmd.durationSeconds > 0) {
    pb.durationSeconds = Math.round(cmd.durationSeconds);
    const song = item ? agg.songs[item.songId] : undefined;
    if (song && !song.durationSeconds) song.durationSeconds = Math.round(cmd.durationSeconds);
  }

  const sinceCommand = nowMs - Date.parse(pb.command.issuedAt);
  const inGrace = sinceCommand < REPORT_GRACE_MS;
  const wantsPlaying = ["play", "restart", "seek"].includes(pb.command.type) && pb.status === "playing";

  switch (cmd.state) {
    case "ended": {
      finishCurrent(agg, "completed", ctx);
      if (agg.party.settings.autoAdvance && agg.party.status === "active") advance(agg, ctx);
      return {};
    }
    case "error":
      pb.status = "error";
      pb.error = { code: cmd.errorCode ?? "unknown", message: describePlayerError(cmd.errorCode) };
      pb.playbackStartedAt = null;
      pb.positionSeconds = cmd.positionSeconds;
      pb.introUntil = null;
      break;
    case "blocked":
      pb.status = "ready";
      pb.autoplayBlocked = true;
      pb.playbackStartedAt = null;
      pb.positionSeconds = cmd.positionSeconds;
      pb.introUntil = null;
      break;
    case "playing":
      if (pb.command.type === "pause" && inGrace) return { silent: true };
      pb.status = "playing";
      pb.positionSeconds = cmd.positionSeconds;
      pb.playbackStartedAt = iso(ctx.now);
      pb.pausedAt = null;
      pb.autoplayBlocked = false;
      pb.interrupted = false;
      pb.introUntil = null;
      pb.error = null;
      break;
    case "paused":
      if (pb.status === "intro" || (wantsPlaying && inGrace)) return { silent: true };
      pb.status = "paused";
      pb.positionSeconds = cmd.positionSeconds;
      pb.playbackStartedAt = null;
      pb.pausedAt = pb.pausedAt ?? iso(ctx.now);
      break;
    case "buffering":
      if (pb.status === "intro") return { silent: true };
      pb.status = "buffering";
      pb.positionSeconds = cmd.positionSeconds;
      pb.playbackStartedAt = null;
      break;
    case "ready":
      if (pb.status !== "error") return { silent: true };
      break;
    case "heartbeat":
      if (pb.status === "playing") {
        pb.positionSeconds = cmd.positionSeconds;
        pb.playbackStartedAt = iso(ctx.now);
      }
      break;
  }

  const drift = Math.abs(estimatePosition(pb, nowMs) - before.estimate);
  const unchanged =
    pb.status === before.status &&
    pb.autoplayBlocked === before.blocked &&
    pb.interrupted === before.interrupted &&
    (pb.error?.code ?? null) === before.error;
  return { silent: unchanged && drift < 2 };
}

/** Marks a party as expired (used by the cleanup job). */
export function expireParty(agg: PartyAggregate, ctx: Ctx) {
  if (agg.party.status === "ended") return;
  if (agg.playback.currentQueueItemId) finishCurrent(agg, "skipped", ctx, "party_expired");
  agg.party.status = "ended";
  agg.party.endedAt = iso(ctx.now);
  agg.party.endedReason = "expired";
}
