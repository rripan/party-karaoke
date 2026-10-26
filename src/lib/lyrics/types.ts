export interface LyricWord {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  text: string;
  words?: LyricWord[];
}

interface PayloadBase {
  provider: string;
  providerName: string;
  licensingReference: string;
  attribution?: string;
  /** True for the bundled sample content (original or public-domain lyrics). */
  sample?: boolean;
}

export type LyricsPayload =
  | (PayloadBase & { kind: "synced"; timing: "word" | "line"; lines: LyricLine[] })
  | (PayloadBase & { kind: "plain"; text: string })
  | { kind: "none"; reason: string; provider?: string };
