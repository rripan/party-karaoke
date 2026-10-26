import type { PlayerHandle } from "./types";

/**
 * Smooth time source for lyrics. Reads the player's real position and only
 * interpolates between reads while the player reports PLAYING (capped, so a
 * stalled player can't drift ahead). Pausing, seeking and buffering are all
 * picked up on the next read.
 */
export function createMediaClock(getHandle: () => PlayerHandle | null) {
  let lastRead = -1;
  let lastReadAt = 0;
  return function nowMs(): number {
    const h = getHandle();
    if (!h) return 0;
    const t = h.getCurrentTime();
    const perf = performance.now();
    if (t !== lastRead) {
      lastRead = t;
      lastReadAt = perf;
      return t * 1000;
    }
    if (h.getState() !== "playing") return t * 1000;
    return t * 1000 + Math.min(1000, perf - lastReadAt);
  };
}
