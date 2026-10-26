export type PlayerState = "unloaded" | "loading" | "cued" | "playing" | "paused" | "buffering" | "ended" | "error";

export type PlayerEvent =
  | { type: "state"; state: PlayerState }
  | { type: "error"; code: string }
  | { type: "duration"; seconds: number };

/**
 * Common surface for the real YouTube IFrame player and the demo-mode
 * simulated player. Lyrics and progress always read `getCurrentTime()` from
 * here, i.e. the actual playback position — never an independent timer.
 */
export interface PlayerHandle {
  readonly kind: "youtube" | "simulated";
  load(opts: { startSeconds: number }): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number | null;
  getState(): PlayerState;
}
