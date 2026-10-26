import type { SongMetadata, VideoKind } from "@/lib/domain/types";

/**
 * Classifies a video using only its real metadata (title and channel name).
 * The result is a hint, and the UI phrases it as such ("Title says karaoke").
 * We never claim a video is a karaoke version unless its metadata says so.
 */
export function classifyVideo(title: string, channel: string): Pick<SongMetadata, "videoKind" | "lyricsInVideo" | "classificationBasis"> {
  const t = title.toLowerCase();
  const c = channel.toLowerCase();

  const karaoke = /\bkaraoke\b|\bsing[\s-]?along\b|\bsingalong\b|\boff[\s-]?vocal\b/.test(t) || /karaoke/.test(c);
  if (karaoke) {
    return {
      videoKind: "karaoke",
      lyricsInVideo: "likely",
      classificationBasis: /karaoke/.test(t) ? "Title mentions “karaoke”" : /karaoke/.test(c) ? "Karaoke channel" : "Title mentions a sing-along version",
    };
  }
  const instrumental = /\binstrumental\b|\bbacking track\b/.test(t);
  if (instrumental) {
    const withLyrics = /\blyrics?\b/.test(t);
    return {
      videoKind: "instrumental",
      lyricsInVideo: withLyrics ? "likely" : "no",
      classificationBasis: withLyrics ? "Title mentions an instrumental with lyrics" : "Title mentions an instrumental",
    };
  }
  if (/\blyrics?\b|\blyric video\b/.test(t)) {
    return { videoKind: "lyric_video", lyricsInVideo: "likely", classificationBasis: "Title mentions lyrics" };
  }
  if (/official\s+(music\s+)?video|official\s+audio|official\s+mv/.test(t) || /vevo$/.test(c)) {
    return { videoKind: "official", lyricsInVideo: "no", classificationBasis: /vevo$/.test(c) ? "VEVO channel" : "Title says official video" };
  }
  return { videoKind: "video", lyricsInVideo: "unknown", classificationBasis: undefined };
}

const KIND_RANK: Record<VideoKind, number> = {
  karaoke: 0,
  sample: 1,
  lyric_video: 2,
  instrumental: 3,
  official: 4,
  video: 5,
};

/** Stable sort that floats karaoke-friendly videos to the top. */
export function rankForKaraoke<T extends { metadata: SongMetadata }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => KIND_RANK[a.item.metadata.videoKind] - KIND_RANK[b.item.metadata.videoKind] || a.index - b.index)
    .map((x) => x.item);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** YouTube Data API snippets HTML-escape titles. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
