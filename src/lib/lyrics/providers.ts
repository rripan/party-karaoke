/**
 * Lyrics provider implementations.
 *
 * Only sources whose licensing permits display may be plugged in here. The
 * project ships with:
 *  - SampleLyricsProvider: original (CC0) and public-domain lyrics bound to the
 *    simulated demo tracks only.
 *  - LicensedDatasetProvider: a directory of JSON files you are licensed to
 *    display, keyed by YouTube video ID (timing must match that exact video).
 *  - LicensedHttpProvider: a generic adapter for a licensed lyrics API that you
 *    operate or have a contract for, returning the same JSON contract.
 * No third-party lyrics site is scraped or contacted by default.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getDemoTrack, withSampleWordTiming } from "@/lib/demo/catalog";
import type { Song } from "@/lib/domain/types";
import { isValidVideoId } from "@/lib/youtube/url";
import { parseLrc } from "./lrc";
import type { LyricsPayload } from "./types";

export interface LyricsProvider {
  id: string;
  name: string;
  /** Cheap local lookups can be done for every search result. */
  cheap: boolean;
  supports(song: Song): boolean;
  /** Resolves to null when the provider has no lyrics for this song. */
  fetch(song: Song, signal: AbortSignal): Promise<LyricsPayload | null>;
}

export class SampleLyricsProvider implements LyricsProvider {
  id = "sample";
  name = "Sample lyrics (demo)";
  cheap = true;

  supports(song: Song) {
    return song.source === "demo";
  }

  async fetch(song: Song): Promise<LyricsPayload | null> {
    const track = song.metadata.demoTrackId ? getDemoTrack(song.metadata.demoTrackId) : undefined;
    if (!track || track.lyrics.type === "none") return null;
    const base = {
      provider: this.id,
      providerName: this.name,
      licensingReference: track.license === "public-domain" ? "Public domain" : "Original lyrics, CC0",
      attribution: track.credit,
      sample: true,
    };
    if (track.lyrics.type === "plain") return { ...base, kind: "plain", text: track.lyrics.text };
    const lrc = track.lyrics.wordTiming ? withSampleWordTiming(track.lyrics.lrc) : track.lyrics.lrc;
    const parsed = parseLrc(lrc);
    return { ...base, kind: "synced", timing: parsed.timing, lines: parsed.lines };
  }
}

/** The JSON contract shared by the dataset and HTTP providers. */
export const licensedLyricsSchema = z
  .object({
    videoId: z.string().optional(),
    license: z.string().min(3).max(500),
    attribution: z.string().max(500).optional(),
    lrc: z.string().max(200_000).optional(),
    plain: z.string().max(200_000).optional(),
    offsetMs: z.number().int().min(-60_000).max(60_000).optional(),
  })
  .refine((v) => v.lrc || v.plain, { message: "lrc or plain lyrics are required" });

export function payloadFromLicensed(
  raw: unknown,
  provider: { id: string; name: string },
): LyricsPayload | null {
  const parsed = licensedLyricsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  const base = {
    provider: provider.id,
    providerName: provider.name,
    licensingReference: data.license,
    attribution: data.attribution,
  };
  if (data.lrc) {
    const { lines, timing } = parseLrc(data.lrc);
    const shift = data.offsetMs ?? 0;
    // Blank lines are kept: they mark instrumental gaps in the source timing.
    const shifted = lines.map((l) => ({
        ...l,
        startMs: Math.max(0, l.startMs + shift),
        endMs: Math.max(0, l.endMs + shift),
        words: l.words?.map((w) => ({ ...w, startMs: Math.max(0, w.startMs + shift), endMs: Math.max(0, w.endMs + shift) })),
      }));
    if (shifted.some((l) => l.text)) return { ...base, kind: "synced", timing, lines: shifted };
  }
  if (data.plain?.trim()) return { ...base, kind: "plain", text: data.plain.trim() };
  return null;
}

export class LicensedDatasetProvider implements LyricsProvider {
  id = "dataset";
  name: string;
  cheap = true;

  constructor(private dir: string, name?: string) {
    this.name = name ?? "Licensed lyrics dataset";
  }

  supports(song: Song) {
    return song.source === "youtube" && !!song.youtubeVideoId && isValidVideoId(song.youtubeVideoId);
  }

  async fetch(song: Song): Promise<LyricsPayload | null> {
    // The video ID is validated against a strict pattern, so it is safe as a filename.
    const file = path.join(this.dir, `${song.youtubeVideoId}.json`);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      return null;
    }
    return payloadFromLicensed(JSON.parse(text), this);
  }
}

export class LicensedHttpProvider implements LyricsProvider {
  id = "http";
  name: string;
  cheap = false;

  constructor(
    private baseUrl: string,
    private apiKey: string | undefined,
    name?: string,
    private timeoutMs = 3500,
  ) {
    this.name = name ?? "Licensed lyrics provider";
  }

  supports(song: Song) {
    return song.source === "youtube" && !!song.youtubeVideoId;
  }

  async fetch(song: Song, signal: AbortSignal): Promise<LyricsPayload | null> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("videoId", song.youtubeVideoId ?? "");
    url.searchParams.set("title", song.title);
    url.searchParams.set("artist", song.channelName);
    if (song.durationSeconds) url.searchParams.set("durationSeconds", String(song.durationSeconds));
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const res = await fetch(url, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      signal: AbortSignal.any([signal, timeout]),
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Lyrics provider responded with ${res.status}`);
    return payloadFromLicensed(await res.json(), this);
  }
}
