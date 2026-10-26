import "server-only";
import { DEMO_TRACKS, demoSong, getDemoTrack, searchDemoCatalog } from "@/lib/demo/catalog";
import type { LyricsAvailability, Song } from "@/lib/domain/types";
import { lyricsService } from "@/lib/lyrics/service";
import { serverEnv } from "@/lib/server/env";
import { TtlCache } from "@/lib/server/ttl-cache";
import { classifyVideo, decodeEntities, rankForKaraoke } from "./classify";
import { parseIsoDuration, parseSongRef, songIdForVideo } from "./url";

export const SEARCH_FILTERS = ["karaoke", "all", "lyrics", "official", "popular", "recent"] as const;
export type SearchFilter = (typeof SEARCH_FILTERS)[number];

export interface SearchResult {
  song: Song;
  lyrics: LyricsAvailability;
  sample: boolean;
}

export interface SearchResponse {
  mode: "live" | "demo";
  query: string;
  filter: SearchFilter;
  results: SearchResult[];
  notice?: string;
}

export type ResolveErrorCode =
  | "invalid"
  | "not_found"
  | "private"
  | "embedding_disabled"
  | "region_blocked"
  | "live"
  | "quota"
  | "rate_limited"
  | "network"
  | "misconfigured";

const RESOLVE_MESSAGES: Record<ResolveErrorCode, string> = {
  invalid: "That doesn't look like a valid YouTube video.",
  not_found: "That video doesn't exist or was deleted.",
  private: "That video is private.",
  embedding_disabled: "The video's owner doesn't allow it to be played on other sites. Try another version.",
  region_blocked: "That video isn't available in this region. Try another version.",
  live: "Live streams and premieres can't be queued. Pick a regular video.",
  quota: "YouTube search is resting (daily API quota reached). Paste a YouTube link instead, or try again later.",
  rate_limited: "YouTube is receiving too many requests. Give it a few seconds.",
  network: "Couldn't reach YouTube. Check the internet connection and try again.",
  misconfigured: "YouTube search isn't configured correctly. Ask the host to check the API key.",
};

export class YouTubeError extends Error {
  constructor(
    public code: ResolveErrorCode,
    message = RESOLVE_MESSAGES[code],
    public status = code === "network" ? 502 : code === "quota" || code === "rate_limited" ? 503 : 422,
  ) {
    super(message);
    this.name = "YouTubeError";
  }
}

const API = "https://www.googleapis.com/youtube/v3";
const searchCache = new TtlCache<SearchResponse>(300);
const videoCache = new TtlCache<Song>(1000);

interface ApiVideo {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url: string; width?: number }>;
  };
  contentDetails?: { duration?: string; regionRestriction?: { allowed?: string[]; blocked?: string[] } };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
}

async function callApi<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const key = serverEnv().youtubeApiKey;
  if (!key) throw new YouTubeError("misconfigured");
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch {
    throw new YouTubeError("network");
  }
  if (res.ok) return (await res.json()) as T;
  let reason = "";
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: string }[]; message?: string } };
    reason = body.error?.errors?.[0]?.reason ?? "";
  } catch {
    /* ignore */
  }
  // Never log the URL: it contains the API key.
  console.warn(`[youtube] ${endpoint} failed: ${res.status} ${reason}`);
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new YouTubeError("quota");
  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || res.status === 429) {
    throw new YouTubeError("rate_limited");
  }
  if (reason === "keyInvalid" || reason === "accessNotConfigured" || res.status === 400 || res.status === 403) {
    throw new YouTubeError("misconfigured");
  }
  throw new YouTubeError("network");
}

function bestThumb(v: ApiVideo): string {
  const t = v.snippet?.thumbnails ?? {};
  return t.medium?.url ?? t.high?.url ?? t.default?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
}

function regionBlocked(v: ApiVideo, region: string | undefined): boolean {
  if (!region) return false;
  const r = v.contentDetails?.regionRestriction;
  if (!r) return false;
  if (r.blocked?.includes(region)) return true;
  if (r.allowed && !r.allowed.includes(region)) return true;
  return false;
}

/** Returns the reason a video can't be queued, or null if it's playable. */
function unplayableReason(v: ApiVideo): ResolveErrorCode | null {
  const region = serverEnv().youtubeRegion;
  if (v.status?.privacyStatus === "private") return "private";
  if (v.status?.uploadStatus && !["processed", "uploaded"].includes(v.status.uploadStatus)) return "not_found";
  if (v.status?.embeddable === false) return "embedding_disabled";
  if (regionBlocked(v, region)) return "region_blocked";
  if (v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") return "live";
  return null;
}

function songFromApi(v: ApiVideo): Song {
  const title = decodeEntities(v.snippet?.title ?? "Untitled video");
  const channel = decodeEntities(v.snippet?.channelTitle ?? "YouTube");
  return {
    id: songIdForVideo(v.id),
    source: "youtube",
    youtubeVideoId: v.id,
    title,
    channelName: channel,
    thumbnailUrl: bestThumb(v),
    durationSeconds: parseIsoDuration(v.contentDetails?.duration),
    metadata: { ...classifyVideo(title, channel), publishedAt: v.snippet?.publishedAt },
  };
}

async function fetchVideos(ids: string[]): Promise<ApiVideo[]> {
  if (!ids.length) return [];
  const data = await callApi<{ items?: ApiVideo[] }>("videos", {
    part: "snippet,contentDetails,status",
    id: ids.join(","),
    maxResults: "50",
  });
  return data.items ?? [];
}

function buildQuery(query: string, filter: SearchFilter): string {
  const q = query.trim();
  const has = (w: string) => q.toLowerCase().includes(w);
  if (filter === "karaoke" && !has("karaoke")) return `${q} karaoke`;
  if (filter === "lyrics" && !has("lyric")) return `${q} lyrics`;
  if (filter === "official" && !has("official")) return `${q} official music video`;
  return q;
}

async function lyricsFor(song: Song): Promise<LyricsAvailability> {
  const meta = await lyricsService().check(song, { cheapOnly: true });
  return meta.availabilityStatus;
}

export function searchMode(): "live" | "demo" {
  return serverEnv().youtubeApiKey ? "live" : "demo";
}

export async function searchSongs(query: string, filter: SearchFilter): Promise<SearchResponse> {
  const q = query.trim().slice(0, 120);
  if (searchMode() === "demo") {
    const tracks = q ? searchDemoCatalog(q, filter) : searchDemoCatalog("", filter === "all" ? "popular" : filter);
    const results = await Promise.all(
      tracks.map(async (t) => {
        const song = demoSong(t);
        return { song, lyrics: await lyricsFor(song), sample: true };
      }),
    );
    return {
      mode: "demo",
      query: q,
      filter,
      results,
      notice:
        "Demo mode: these are sample songs bundled with the app, not live YouTube results. Add a YOUTUBE_API_KEY to search YouTube.",
    };
  }

  if (!q) return { mode: "live", query: q, filter, results: [] };
  const cacheKey = `${filter}|${q.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const params: Record<string, string> = {
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: "15",
    safeSearch: "moderate",
    q: buildQuery(q, filter),
    order: filter === "popular" ? "viewCount" : filter === "recent" ? "date" : "relevance",
  };
  const region = serverEnv().youtubeRegion;
  if (region) params.regionCode = region;
  const search = await callApi<{ items?: { id?: { videoId?: string } }[] }>("search", params);
  const ids = (search.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => Boolean(x));
  const videos = await fetchVideos(ids);
  const byId = new Map(videos.map((v) => [v.id, v]));
  let songs = ids
    .map((id) => byId.get(id))
    .filter((v): v is ApiVideo => Boolean(v) && unplayableReason(v!) === null)
    .map(songFromApi);
  for (const s of songs) videoCache.set(s.youtubeVideoId!, s, 60 * 60 * 1000);
  if (filter === "karaoke" || filter === "all") songs = rankForKaraoke(songs);

  const results = await Promise.all(songs.map(async (song) => ({ song, lyrics: await lyricsFor(song), sample: false })));
  const response: SearchResponse = {
    mode: "live",
    query: q,
    filter,
    results,
    notice: results.length ? undefined : "No playable videos found. Try different words or a different filter.",
  };
  searchCache.set(cacheKey, response, 15 * 60 * 1000);
  return response;
}

/** oEmbed is YouTube's official keyless metadata endpoint for a single video. */
async function resolveViaOEmbed(videoId: string): Promise<Song> {
  const target = `https://www.youtube.com/watch?v=${videoId}`;
  let res: Response;
  try {
    // YOUTUBE_OEMBED_ENDPOINT exists only so automated tests can point at a local mock.
    const endpoint = process.env.YOUTUBE_OEMBED_ENDPOINT ?? "https://www.youtube.com/oembed";
    res = await fetch(`${endpoint}?format=json&url=${encodeURIComponent(target)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new YouTubeError("network", "Couldn't reach YouTube to check that link. Check the internet connection.");
  }
  if (res.status === 401) throw new YouTubeError("embedding_disabled");
  if (res.status === 403) throw new YouTubeError("private");
  if (res.status === 404 || res.status === 400) throw new YouTubeError("not_found", "That video doesn't exist, was deleted, or is private.");
  if (!res.ok) throw new YouTubeError("network");
  const data = (await res.json()) as { title?: string; author_name?: string };
  const title = data.title ?? "YouTube video";
  const channel = data.author_name ?? "YouTube";
  return {
    id: songIdForVideo(videoId),
    source: "youtube",
    youtubeVideoId: videoId,
    title,
    channelName: channel,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    durationSeconds: null,
    metadata: classifyVideo(title, channel),
  };
}

/**
 * Turns a client-supplied reference (video ID, URL or demo id) into trusted
 * song metadata. Client-provided titles are never trusted.
 */
export async function resolveSongRef(ref: string): Promise<Song> {
  const parsed = parseSongRef(ref);
  if (parsed.kind === "invalid") throw new YouTubeError("invalid", parsed.reason);
  if (parsed.kind === "demo") {
    const track = getDemoTrack(parsed.trackId);
    if (!track) throw new YouTubeError("invalid", "That sample song doesn't exist.");
    return demoSong(track);
  }
  const cached = videoCache.get(parsed.videoId);
  if (cached) return cached;
  let song: Song;
  if (serverEnv().youtubeApiKey) {
    const [video] = await fetchVideos([parsed.videoId]);
    if (!video) throw new YouTubeError("not_found", "That video doesn't exist, was deleted, or is private.");
    const reason = unplayableReason(video);
    if (reason) throw new YouTubeError(reason);
    song = songFromApi(video);
  } else {
    song = await resolveViaOEmbed(parsed.videoId);
  }
  videoCache.set(parsed.videoId, song, 60 * 60 * 1000);
  return song;
}

export const DEMO_TRACK_COUNT = DEMO_TRACKS.length;
