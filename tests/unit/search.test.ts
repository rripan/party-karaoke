import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Live search is tested against a mocked fetch that returns responses shaped
 * like the YouTube Data API v3 (search.list + videos.list).
 */
function video(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    snippet: { title, channelTitle: "Chan", liveBroadcastContent: "none", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
    contentDetails: { duration: "PT3M30S" },
    status: { embeddable: true, privacyStatus: "public", uploadStatus: "processed" },
    ...extra,
  };
}

describe("live YouTube search (API key configured)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubEnv("YOUTUBE_REGION_CODE", "US");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns playable results, filters unplayable ones and ranks karaoke first", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        calls.push(String(url));
        if (url.pathname.endsWith("/search")) {
          return Response.json({ items: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"].map((videoId) => ({ id: { videoId } })) });
        }
        return Response.json({
          items: [
            video("aaaaaaaaaaa", "Song &amp; Dance (Official Video)"),
            video("bbbbbbbbbbb", "Song (Karaoke Version)"),
            video("ccccccccccc", "Blocked", { status: { embeddable: false, privacyStatus: "public" } }),
            video("ddddddddddd", "Region", { contentDetails: { duration: "PT3M", regionRestriction: { blocked: ["US"] } } }),
          ],
        });
      }),
    );
    const { searchSongs } = await import("@/lib/youtube/service");
    const res = await searchSongs("song", "karaoke");
    expect(res.mode).toBe("live");
    expect(res.results.map((r) => r.song.youtubeVideoId)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(res.results[1].song.title).toBe("Song & Dance (Official Video)");
    expect(res.results[0].song.durationSeconds).toBe(210);
    expect(res.results[0].sample).toBe(false);
    const searchUrl = new URL(calls[0]);
    expect(searchUrl.searchParams.get("q")).toBe("song karaoke");
    expect(searchUrl.searchParams.get("videoEmbeddable")).toBe("true");
    expect(searchUrl.searchParams.get("regionCode")).toBe("US");
    // Cached: a second identical search costs no quota.
    await searchSongs("song", "karaoke");
    expect(calls).toHaveLength(2);
  });

  it("maps quota and key errors to friendly messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 })));
    const { searchSongs, YouTubeError } = await import("@/lib/youtube/service");
    await expect(searchSongs("quota please", "all")).rejects.toBeInstanceOf(YouTubeError);
    await expect(searchSongs("quota again", "all")).rejects.toMatchObject({ code: "quota" });
  });

  it("reports network failures without leaking the API key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { errors: [{ reason: "keyInvalid" }] } }, { status: 400 })));
    const { searchSongs } = await import("@/lib/youtube/service");
    await expect(searchSongs("x", "all")).rejects.toMatchObject({ code: "misconfigured" });
    expect(warn.mock.calls.flat().join(" ")).not.toContain("test-key");
  });

  it("resolves a pasted link via videos.list and rejects private/embedding-disabled videos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        const id = url.searchParams.get("id");
        if (id === "eeeeeeeeeee") return Response.json({ items: [video(id, "Private", { status: { privacyStatus: "private", embeddable: true } })] });
        if (id === "fffffffffff") return Response.json({ items: [] });
        return Response.json({ items: [video(id!, "Fine (Lyrics)")] });
      }),
    );
    const { resolveSongRef } = await import("@/lib/youtube/service");
    await expect(resolveSongRef("https://youtu.be/eeeeeeeeeee")).rejects.toMatchObject({ code: "private" });
    await expect(resolveSongRef("fffffffffff")).rejects.toMatchObject({ code: "not_found" });
    const song = await resolveSongRef("https://www.youtube.com/watch?v=ggggggggggg");
    expect(song).toMatchObject({ id: "yt:ggggggggggg", metadata: { videoKind: "lyric_video" } });
  });
});

describe("demo search (no API key)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("YOUTUBE_API_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is clearly labelled as sample content", async () => {
    const { searchSongs } = await import("@/lib/youtube/service");
    const res = await searchSongs("birthday", "all");
    expect(res.mode).toBe("demo");
    expect(res.notice).toMatch(/sample songs.*not live YouTube results/);
    expect(res.results.every((r) => r.sample && r.song.source === "demo")).toBe(true);
    expect(res.results[0].song.title).toBe("Happy Birthday to You");
    expect(res.results[0].lyrics).toBe("synced");
  });

  it("filters by honest catalog metadata", async () => {
    const { searchSongs } = await import("@/lib/youtube/service");
    const karaoke = await searchSongs("", "karaoke");
    expect(karaoke.results.every((r) => r.song.metadata.videoKind === "karaoke" || r.lyrics === "synced")).toBe(true);
    const official = await searchSongs("", "official");
    expect(official.results.map((r) => r.song.metadata.videoKind)).toEqual(["official"]);
  });
});
