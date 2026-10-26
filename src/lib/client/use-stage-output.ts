"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { estimatePosition } from "@/lib/domain/party-logic";
import type { PartySnapshot } from "@/lib/domain/snapshot";
import { createMediaClock } from "@/lib/player/media-clock";
import type { PlayerEvent, PlayerHandle } from "@/lib/player/types";

const BLOCK_DETECT_MS = 3500;
const HEARTBEAT_MS = 10_000;
export const OUTPUT_STALE_MS = 25_000;

export function getClientId(): string {
  if (typeof window === "undefined") return "server";
  const key = "kp-stage-client";
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

class HandleHolder {
  handle: PlayerHandle | null = null;
  set(h: PlayerHandle | null) {
    this.handle = h;
  }
}

export type StageOutput = ReturnType<typeof useStageOutput>;

/**
 * Drives the real player on the screen that is the party's "output".
 *  - Applies host commands (play/pause/seek/restart) by sequence number, once.
 *  - Starts the song after the intro; if the browser blocks autoplay it
 *    reports "blocked" so a big "Play Next Song" button appears.
 *  - Reports what the player actually does (playing, paused, ended, errors).
 * The server never assumes playback happened unless this player says so.
 */
export function useStageOutput({
  snapshot,
  clockOffsetMs,
  command,
  enabled,
  autoClaim,
}: {
  snapshot: PartySnapshot | null;
  clockOffsetMs: number;
  command: (cmd: Record<string, unknown>) => Promise<unknown>;
  enabled: boolean;
  /** Claim output automatically when no other screen holds it. */
  autoClaim: boolean;
}) {
  const [clientId] = useState(getClientId);
  const [handle, setHandleState] = useState<PlayerHandle | null>(null);
  // Holder (not a ref) so the media clock can read the live handle from rAF callbacks.
  const [holder] = useState(() => new HandleHolder());
  const pb = snapshot?.playback ?? null;
  const item = snapshot?.nowPlaying ?? null;
  const isOutput = Boolean(enabled && pb && pb.outputClientId === clientId);

  const latest = useRef({ snapshot, isOutput, clockOffsetMs });
  useLayoutEffect(() => {
    latest.current = { snapshot, isOutput, clockOffsetMs };
  });
  const lastSeq = useRef<number | null>(null);
  const loadedKey = useRef<string | null>(null);
  const blockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claiming = useRef(false);

  const setHandle = useCallback(
    (h: PlayerHandle | null) => {
      holder.set(h);
      setHandleState(h);
      if (!h) loadedKey.current = null;
    },
    [holder],
  );

  const [nowMs] = useState(() => createMediaClock(() => holder.handle));

  const report = useCallback(
    (state: string, extra: { errorCode?: string } = {}) => {
      const { snapshot: snap, isOutput: out } = latest.current;
      const h = holder.handle;
      const current = snap?.nowPlaying;
      if (!out || !current) return;
      void command({
        type: "player_report",
        clientId,
        queueItemId: current.id,
        state,
        positionSeconds: Math.max(0, h?.getCurrentTime() ?? 0),
        durationSeconds: h?.getDuration() ?? null,
        ...extra,
      }).catch(() => {
        /* transient network errors: the heartbeat will resync */
      });
    },
    [clientId, command, holder],
  );

  const tryPlay = useCallback(() => {
    const h = holder.handle;
    if (!h) return;
    const itemId = latest.current.snapshot?.nowPlaying?.id;
    // Arm the autoplay check *before* play(): some players emit "playing" synchronously.
    if (blockTimer.current) clearTimeout(blockTimer.current);
    blockTimer.current = setTimeout(() => {
      // Only judge the same player and song we tried to start.
      if (holder.handle !== h || latest.current.snapshot?.nowPlaying?.id !== itemId) return;
      const s = h.getState();
      if (s !== "playing" && s !== "buffering" && s !== "ended" && s !== "error") report("blocked");
    }, BLOCK_DETECT_MS);
    h.play();
  }, [report, holder]);

  /** Call from a click handler on this screen (a user gesture unlocks autoplay). */
  const playNow = useCallback(() => {
    tryPlay();
  }, [tryPlay]);

  const claim = useCallback(async () => {
    if (claiming.current) return;
    claiming.current = true;
    try {
      await command({ type: "claim_output", clientId });
    } finally {
      claiming.current = false;
    }
  }, [clientId, command]);

  // Claim output when nobody else (recently) holds it.
  const outputOwner = pb?.outputClientId ?? null;
  const outputSeen = pb?.outputLastSeenAt ? Date.parse(pb.outputLastSeenAt) : 0;
  useEffect(() => {
    if (!enabled || !autoClaim || !snapshot || snapshot.party.status === "ended") return;
    if (outputOwner === clientId) return;
    const stale = !outputOwner || Date.now() + clockOffsetMs - outputSeen > OUTPUT_STALE_MS;
    if (stale) void claim();
  }, [enabled, autoClaim, snapshot, outputOwner, outputSeen, clientId, clockOffsetMs, claim]);

  // After a reload this tab may still be the registered output, but its old
  // player is gone: tell the server once, so it stops claiming "playing".
  const announced = useRef(false);
  useEffect(() => {
    if (!isOutput || announced.current) return;
    announced.current = true;
    void command({ type: "claim_output", clientId, fresh: true }).catch(() => {});
  }, [isOutput, clientId, command]);

  // Load the song on stage into the player.
  const key = item ? `${item.id}:${item.song.id}` : null;
  useEffect(() => {
    const h = handle;
    if (!isOutput || !h || !key || !pb) return;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    const start = pb.status === "intro" ? 0 : estimatePosition({ ...pb, partyId: "" }, Date.now() + clockOffsetMs);
    h.load({ startSeconds: start });
    lastSeq.current = pb.command.seq;
  }, [isOutput, handle, key, pb, clockOffsetMs]);

  // Apply new host commands exactly once.
  const seq = pb?.command.seq ?? 0;
  useEffect(() => {
    const h = handle;
    if (!isOutput || !h || !pb || !key || loadedKey.current !== key) return;
    if (lastSeq.current === null) lastSeq.current = seq;
    if (seq <= lastSeq.current) return;
    lastSeq.current = seq;
    const { type, positionSeconds } = pb.command;
    if (type === "play") {
      if (Math.abs(h.getCurrentTime() - positionSeconds) > 1.5) h.seek(positionSeconds);
      tryPlay();
    } else if (type === "pause" || type === "stop") {
      h.pause();
    } else if (type === "seek") {
      h.seek(positionSeconds);
    } else if (type === "restart") {
      h.seek(0);
      tryPlay();
    }
  }, [isOutput, handle, seq, pb, key, tryPlay]);

  // Auto-start after the "Next up" intro.
  const introUntil = pb?.status === "intro" ? pb.introUntil : null;
  useEffect(() => {
    if (!isOutput || !introUntil || !handle) return;
    const wait = Math.max(0, Date.parse(introUntil) - (Date.now() + clockOffsetMs));
    const id = setTimeout(() => {
      if (latest.current.snapshot?.playback.status === "intro") tryPlay();
    }, wait);
    return () => clearTimeout(id);
  }, [isOutput, introUntil, handle, clockOffsetMs, tryPlay]);

  // Heartbeat: keeps position fresh for guests and marks this screen alive.
  const hasItem = Boolean(item);
  useEffect(() => {
    if (!isOutput) return;
    const id = setInterval(() => {
      if (latest.current.snapshot?.nowPlaying) report("heartbeat");
      else void command({ type: "claim_output", clientId }).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [isOutput, hasItem, report, command, clientId]);

  useEffect(() => () => {
    if (blockTimer.current) clearTimeout(blockTimer.current);
  }, []);

  const onEvent = useCallback(
    (e: PlayerEvent) => {
      if (e.type === "error") {
        report("error", { errorCode: e.code });
        return;
      }
      if (e.type !== "state") return;
      if (e.state === "playing" && blockTimer.current) clearTimeout(blockTimer.current);
      if (e.state === "playing" || e.state === "paused" || e.state === "buffering" || e.state === "ended") report(e.state);
    },
    [report],
  );

  return { clientId, isOutput, handle, setHandle, onEvent, nowMs, playNow, claim };
}
