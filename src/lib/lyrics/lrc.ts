import type { LyricLine, LyricWord } from "./types";

const LINE_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const LAST_LINE_MS = 5000;

function toMs(min: string, sec: string, frac?: string): number {
  const f = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
  return Number(min) * 60_000 + Number(sec) * 1000 + f;
}

/**
 * Parses LRC and "enhanced" LRC (per-word `<mm:ss.xx>` tags). Timing comes
 * exclusively from the source file; nothing is interpolated or invented.
 */
export function parseLrc(source: string): { lines: LyricLine[]; timing: "word" | "line" } {
  let offset = 0;
  const raw: { startMs: number; text: string; words?: { startMs: number; text: string }[]; wordsEndMs?: number }[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const offsetTag = line.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (offsetTag) {
      offset = Number(offsetTag[1]);
      continue;
    }
    const stamps: number[] = [];
    LINE_TAG.lastIndex = 0;
    let rest = line;
    let m: RegExpExecArray | null;
    while ((m = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(rest))) {
      stamps.push(toMs(m[1], m[2], m[3]));
      rest = rest.slice(m[0].length);
    }
    if (!stamps.length) continue; // metadata tags like [ar:...] or untimed text

    let words: { startMs: number; text: string }[] | undefined;
    let wordsEndMs: number | undefined;
    WORD_TAG.lastIndex = 0;
    if (WORD_TAG.test(rest)) {
      words = [];
      // split() with 3 capture groups yields: [lead, min, sec, frac, text, min, sec, frac, text, ...]
      const parts = rest.split(WORD_TAG);
      for (let i = 1; i < parts.length; i += 4) {
        const at = toMs(parts[i], parts[i + 1], parts[i + 2]);
        const text = parts[i + 3] ?? "";
        if (text.trim()) words.push({ startMs: at, text });
        else if (i + 4 >= parts.length) wordsEndMs = at; // trailing tag marks the end of the last word
      }
      rest = words.map((w) => w.text).join("");
      if (!words.length) words = undefined;
    }
    WORD_TAG.lastIndex = 0;
    for (const s of stamps) raw.push({ startMs: s, text: rest.trim(), words, wordsEndMs });
  }

  raw.sort((a, b) => a.startMs - b.startMs);
  const lines: LyricLine[] = raw.map((r, i) => {
    const startMs = Math.max(0, r.startMs - offset);
    const next = raw[i + 1];
    const endMs = next ? Math.max(startMs, next.startMs - offset) : startMs + LAST_LINE_MS;
    let words: LyricWord[] | undefined;
    if (r.words) {
      words = r.words.map((w, wi, arr) => {
        const ws = Math.max(0, w.startMs - offset);
        const nextWord = arr[wi + 1];
        const lastEnd = r.wordsEndMs !== undefined ? Math.min(endMs, r.wordsEndMs - offset) : endMs;
        return { startMs: ws, endMs: nextWord ? Math.max(ws, nextWord.startMs - offset) : Math.max(ws, lastEnd), text: w.text };
      });
    }
    return { startMs, endMs, text: r.text, words };
  });
  const timing = lines.length > 0 && lines.every((l) => !l.text || l.words?.length) ? "word" : "line";
  return { lines, timing };
}

/** Index of the line active at `timeMs`, or -1 before the first line. */
export function activeLineIndex(lines: LyricLine[], timeMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= timeMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** 0..1 progress through a word (or line) at `timeMs`. */
export function progressWithin(startMs: number, endMs: number, timeMs: number): number {
  if (timeMs <= startMs) return 0;
  if (timeMs >= endMs || endMs <= startMs) return 1;
  return (timeMs - startMs) / (endMs - startMs);
}
