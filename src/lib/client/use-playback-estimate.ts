"use client";

import { useEffect, useState } from "react";
import { estimatePosition } from "@/lib/domain/party-logic";
import type { PlaybackView } from "@/lib/domain/snapshot";

/**
 * Progress for screens that are NOT the player (guest phones, remote host
 * views). It extrapolates from the last position the real player reported,
 * so it's approximate — the stage itself always reads the player directly.
 */
export function usePlaybackEstimate(playback: PlaybackView | null | undefined, clockOffsetMs: number, intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = playback?.status === "playing" || playback?.status === "intro";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [ticking, intervalMs]);
  if (!playback) return { position: 0, duration: null as number | null, introLeft: 0 };
  const serverNow = now + clockOffsetMs;
  const position = estimatePosition({ ...playback, partyId: "" }, serverNow);
  const introLeft = playback.status === "intro" && playback.introUntil ? Math.max(0, (Date.parse(playback.introUntil) - serverNow) / 1000) : 0;
  return { position, duration: playback.durationSeconds, introLeft };
}
