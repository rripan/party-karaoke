/** YouTube URL / video ID validation. Pure and shared by client and server. */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

export function isValidVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

export type ParsedRef =
  | { kind: "youtube"; videoId: string }
  | { kind: "demo"; trackId: string }
  | { kind: "invalid"; reason: string };

/**
 * Accepts a bare 11-character video ID, `demo:<slug>` for the bundled sample
 * catalog, or a YouTube URL (watch, youtu.be, embed, shorts, live, music).
 */
export function parseSongRef(input: string): ParsedRef {
  const value = input.trim();
  if (value.startsWith("demo:")) {
    const trackId = value.slice(5);
    return /^[a-z0-9-]{1,60}$/.test(trackId) ? { kind: "demo", trackId } : { kind: "invalid", reason: "Unknown sample song." };
  }
  if (value.startsWith("yt:")) return parseSongRef(value.slice(3));
  if (isValidVideoId(value)) return { kind: "youtube", videoId: value };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { kind: "invalid", reason: "That doesn't look like a YouTube link." };
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return { kind: "invalid", reason: "Only YouTube links are supported." };

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(?:embed|shorts|live|v|e)\/([^/?#]+)/);
    candidate = match?.[1] ?? null;
  }
  if (!candidate) {
    if (url.searchParams.get("list")) {
      return { kind: "invalid", reason: "Playlists aren't supported — share a single video link." };
    }
    return { kind: "invalid", reason: "That YouTube link doesn't point to a video." };
  }
  return isValidVideoId(candidate)
    ? { kind: "youtube", videoId: candidate }
    : { kind: "invalid", reason: "That YouTube link has an invalid video ID." };
}

export function looksLikeUrl(input: string): boolean {
  const v = input.trim();
  return /^(https?:\/\/)?([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(v);
}

/** Parses ISO-8601 durations such as PT1H2M10S. Returns null for live/unknown. */
export function parseIsoDuration(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  const total = d * 86400 + h * 3600 + min * 60 + s;
  return total > 0 ? total : null;
}

export function songIdForVideo(videoId: string) {
  return `yt:${videoId}`;
}
