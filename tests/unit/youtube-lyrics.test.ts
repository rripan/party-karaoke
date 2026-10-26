import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSong, DEMO_TRACKS, getDemoTrack, withSampleWordTiming } from "@/lib/demo/catalog";
import { activeLineIndex, parseLrc, progressWithin } from "@/lib/lyrics/lrc";
import { LicensedDatasetProvider, LicensedHttpProvider, payloadFromLicensed, SampleLyricsProvider } from "@/lib/lyrics/providers";
import { LyricsService } from "@/lib/lyrics/service";
import { classifyVideo, decodeEntities, rankForKaraoke } from "@/lib/youtube/classify";
import { parseIsoDuration, parseSongRef } from "@/lib/youtube/url";
import { ytSong } from "./helpers";

describe("YouTube URL validation", () => {
  it.each([
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("accepts %s", (input, id) => {
    expect(parseSongRef(input)).toEqual({ kind: "youtube", videoId: id });
  });

  it.each([
    ["https://vimeo.com/123", "Only YouTube links"],
    ["https://evil.com/watch?v=dQw4w9WgXcQ", "Only YouTube links"],
    ["https://www.youtube.com/watch?v=short", "invalid video ID"],
    ["https://www.youtube.com/playlist?list=PL123", "Playlists"],
    ["https://www.youtube.com/channel/UC123", "doesn't point to a video"],
    ["not a url at all", "doesn't look like a YouTube link"],
    ["demo:../../etc", "Unknown sample song"],
  ])("rejects %s", (input, reason) => {
    const parsed = parseSongRef(input);
    expect(parsed.kind).toBe("invalid");
    expect((parsed as { reason: string }).reason).toContain(reason);
  });

  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT3M45S")).toBe(225);
    expect(parseIsoDuration("PT1H2M10S")).toBe(3730);
    expect(parseIsoDuration("P0D")).toBeNull(); // live streams
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});

describe("video classification uses real metadata only", () => {
  it("labels karaoke, lyric, official and instrumental videos from their titles", () => {
    expect(classifyVideo("Bohemian Rhapsody (Karaoke Version)", "Sing King")).toMatchObject({ videoKind: "karaoke", lyricsInVideo: "likely" });
    expect(classifyVideo("Some Song (Lyrics)", "Fan Channel")).toMatchObject({ videoKind: "lyric_video", lyricsInVideo: "likely" });
    expect(classifyVideo("Artist - Song (Official Music Video)", "ArtistVEVO")).toMatchObject({ videoKind: "official", lyricsInVideo: "no" });
    expect(classifyVideo("Song (Instrumental)", "Beats")).toMatchObject({ videoKind: "instrumental", lyricsInVideo: "no" });
    expect(classifyVideo("Song", "SingKingKaraoke")).toMatchObject({ videoKind: "karaoke" });
    // Nothing in the metadata → no claims.
    expect(classifyVideo("Live at Wembley 1986", "Archive")).toMatchObject({ videoKind: "video", lyricsInVideo: "unknown" });
  });

  it("ranks karaoke versions first without reordering ties", () => {
    const items = ["A (Official Video)", "B karaoke", "C lyrics", "D karaoke"].map((t) => ({ t, metadata: classifyVideo(t, "x") }));
    expect(rankForKaraoke(items).map((i) => i.t)).toEqual(["B karaoke", "D karaoke", "C lyrics", "A (Official Video)"]);
  });

  it("decodes HTML entities in API titles", () => {
    expect(decodeEntities("Rock &amp; Roll &#39;Live&#39; &quot;x&quot;")).toBe(`Rock & Roll 'Live' "x"`);
  });
});

describe("LRC parsing", () => {
  it("parses line timing, offsets, multi-stamps and metadata tags", () => {
    const { lines, timing } = parseLrc(`[ar:Someone]\n[offset:+500]\n[00:01.00][00:10.00]Chorus\n[00:05.50]Verse\n[00:12.00]`);
    expect(timing).toBe("line");
    expect(lines.map((l) => [l.startMs, l.text])).toEqual([
      [500, "Chorus"],
      [5000, "Verse"],
      [9500, "Chorus"],
      [11500, ""],
    ]);
    expect(lines[0].endMs).toBe(5000);
  });

  it("parses enhanced (word-level) LRC including the closing tag", () => {
    const { lines, timing } = parseLrc("[00:02.00]<00:02.00>Hello <00:02.50>big <00:03.00>world<00:04.00>");
    expect(timing).toBe("word");
    expect(lines[0].text).toBe("Hello big world");
    expect(lines[0].words!.map((w) => [w.text, w.startMs, w.endMs])).toEqual([
      ["Hello ", 2000, 2500],
      ["big ", 2500, 3000],
      ["world", 3000, 4000],
    ]);
  });

  it("finds the active line by playback time (seek-safe, no internal timer)", () => {
    const { lines } = parseLrc("[00:01.00]a\n[00:03.00]b\n[00:06.00]c");
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 5999)).toBe(1);
    expect(activeLineIndex(lines, 60_000)).toBe(2);
    expect(activeLineIndex(lines, 2000)).toBe(0); // seeking backwards just works
    expect(progressWithin(1000, 3000, 2000)).toBe(0.5);
  });
});

describe("lyrics providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sample provider only serves the bundled demo tracks, with honest timing types", async () => {
    const p = new SampleLyricsProvider();
    const neon = await p.fetch(demoSong(getDemoTrack("neon-heartbeat")!));
    expect(neon).toMatchObject({ kind: "synced", timing: "word", sample: true });
    const bday = await p.fetch(demoSong(getDemoTrack("happy-birthday")!));
    expect(bday).toMatchObject({ kind: "synced", timing: "line", licensingReference: "Public domain" });
    expect(await p.fetch(demoSong(getDemoTrack("amazing-grace")!))).toMatchObject({ kind: "plain" });
    expect(await p.fetch(demoSong(getDemoTrack("synthwave-sunset")!))).toBeNull();
    expect(p.supports(ytSong("dQw4w9WgXcQ"))).toBe(false);
  });

  it("every demo track's authored timing parses and stays inside the track", () => {
    for (const t of DEMO_TRACKS) {
      if (t.lyrics.type !== "lrc") continue;
      const lrc = t.lyrics.wordTiming ? withSampleWordTiming(t.lyrics.lrc) : t.lyrics.lrc;
      const { lines } = parseLrc(lrc);
      expect(lines.length).toBeGreaterThan(2);
      expect(lines.at(-1)!.startMs / 1000).toBeLessThanOrEqual(t.durationSeconds);
      for (let i = 1; i < lines.length; i++) expect(lines[i].startMs).toBeGreaterThanOrEqual(lines[i - 1].startMs);
    }
  });

  it("licensed payloads require a license reference and lyrics", () => {
    expect(payloadFromLicensed({ lrc: "[00:01.00]hi" }, { id: "x", name: "X" })).toBeNull();
    expect(payloadFromLicensed({ license: "Contract #42" }, { id: "x", name: "X" })).toBeNull();
    const ok = payloadFromLicensed({ license: "Contract #42", lrc: "[00:01.00]hi", offsetMs: 250 }, { id: "x", name: "X" });
    expect(ok).toMatchObject({ kind: "synced", licensingReference: "Contract #42" });
    expect((ok as { lines: { startMs: number }[] }).lines[0].startMs).toBe(1250);
  });

  it("dataset provider reads per-video licensed files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lyrics-"));
    writeFileSync(path.join(dir, "dQw4w9WgXcQ.json"), JSON.stringify({ license: "Licensed dataset v1", plain: "la la la" }));
    const p = new LicensedDatasetProvider(dir);
    expect(await p.fetch(ytSong("dQw4w9WgXcQ"))).toMatchObject({ kind: "plain", text: "la la la" });
    expect(await p.fetch(ytSong("aaaaaaaaaaa"))).toBeNull();
  });

  it("an HTTP provider outage degrades to 'error' without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    const service = new LyricsService([new SampleLyricsProvider(), new LicensedHttpProvider("https://lyrics.example/api", "k")]);
    const meta = await service.check(ytSong("bbbbbbbbbbb"));
    expect(meta.availabilityStatus).toBe("error");
    expect(meta.timingFormat).toBe("none");
  });

  it("never reports synced lyrics when a provider has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const service = new LyricsService([new SampleLyricsProvider(), new LicensedHttpProvider("https://lyrics.example/api", undefined)]);
    expect((await service.check(ytSong("ccccccccccc"))).availabilityStatus).toBe("unavailable");
  });
});
