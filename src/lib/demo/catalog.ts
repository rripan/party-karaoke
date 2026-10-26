/**
 * Demo-mode sample catalog.
 *
 * Every lyric here is either ORIGINAL text written for this app (released
 * under CC0 by the project) or a song whose words are in the PUBLIC DOMAIN.
 * The artists of the original songs are fictional.
 *
 * These are *simulated* tracks: there is no audio, and the "video" is an
 * animated stage rendered by the app. The timestamps below define the
 * simulated track itself, so lyrics synchronised to it are genuinely in sync
 * with its (simulated) playback clock. They are never applied to real videos.
 */
import type { Song, SongMetadata, VideoKind } from "@/lib/domain/types";

export type DemoLyrics =
  | { type: "lrc"; lrc: string; wordTiming?: boolean }
  | { type: "plain"; text: string }
  | { type: "none" };

export interface DemoTrack {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  kind: VideoKind;
  lyricsInVideo: SongMetadata["lyricsInVideo"];
  tags: string[];
  popularity: number;
  addedDaysAgo: number;
  colors: [string, string];
  credit: string;
  license: "original-cc0" | "public-domain" | "none";
  lyrics: DemoLyrics;
  /** Lyrics drawn inside the simulated video picture (karaoke-video case). */
  onScreenLyrics?: string;
}

const ORIGINAL = "Original lyrics written for Party Karaoke (CC0). Fictional artist.";

export const DEMO_TRACKS: DemoTrack[] = [
  {
    id: "neon-heartbeat",
    title: "Neon Heartbeat",
    artist: "The Velvet Lasers",
    durationSeconds: 63,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["pop", "dance", "synced", "official"],
    popularity: 98,
    addedDaysAgo: 30,
    colors: ["#7c3aed", "#ff2e93"],
    credit: ORIGINAL,
    license: "original-cc0",
    lyrics: {
      type: "lrc",
      wordTiming: true,
      lrc: `[00:04.00]Lights are low and the city's awake
[00:08.00]Every window is a stage we can take
[00:12.00]Turn it up till the ceiling shakes
[00:16.00]This is all the noise that we make
[00:21.00]Neon heartbeat, beating in time
[00:25.00]Neon heartbeat, you and I
[00:29.00]Hold the mic up, let it shine
[00:33.00]Neon heartbeat, tonight's the night
[00:38.00]Pink and purple on the walls
[00:42.00]Echoes dancing down the halls
[00:46.00]When the chorus starts to call
[00:50.00]Everybody sing it, one and all
[00:55.00]Neon heartbeat, beating in time
[00:59.50]`,
    },
  },
  {
    id: "main-character-karaoke",
    title: "Main Character Energy (Karaoke Version)",
    artist: "Mira Nova",
    durationSeconds: 46,
    kind: "karaoke",
    lyricsInVideo: "likely",
    tags: ["pop", "karaoke"],
    popularity: 91,
    addedDaysAgo: 2,
    colors: ["#d946ef", "#22d3ee"],
    credit: ORIGINAL,
    license: "original-cc0",
    lyrics: { type: "none" },
    onScreenLyrics: `[00:04.00]Cue the lights, it's my scene
[00:09.00]Walking in like a movie screen
[00:14.00]Every step's a soundtrack beat
[00:19.00]Main character energy
[00:25.00]Roll the credits, say my name
[00:30.00]Nothing's ever gonna be the same
[00:36.00]Main character energy
[00:42.00]`,
  },
  {
    id: "happy-birthday",
    title: "Happy Birthday to You",
    artist: "Traditional",
    durationSeconds: 26,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["birthday", "classic", "synced"],
    popularity: 95,
    addedDaysAgo: 400,
    colors: ["#f59e0b", "#ff2e93"],
    credit: "Public domain lyrics.",
    license: "public-domain",
    lyrics: {
      type: "lrc",
      lrc: `[00:02.00]Happy birthday to you
[00:07.00]Happy birthday to you
[00:12.00]Happy birthday, dear friend
[00:18.00]Happy birthday to you
[00:23.50]`,
    },
  },
  {
    id: "friday-frequency-karaoke",
    title: "Friday Night Frequency (Karaoke Version)",
    artist: "The Velvet Lasers",
    durationSeconds: 40,
    kind: "karaoke",
    lyricsInVideo: "likely",
    tags: ["dance", "karaoke"],
    popularity: 84,
    addedDaysAgo: 1,
    colors: ["#6366f1", "#ff2e93"],
    credit: ORIGINAL,
    license: "original-cc0",
    lyrics: { type: "none" },
    onScreenLyrics: `[00:04.00]Tune it in, the weekend's on the air
[00:09.00]Static in our hearts and glitter in our hair
[00:14.00]Every voice is ringing on the Friday frequency
[00:20.00]Turn me up, turn me up, sing along with me
[00:26.00]Friday night frequency
[00:31.00]Sing along with me
[00:36.00]`,
  },
  {
    id: "living-room-tour",
    title: "Living Room Tour",
    artist: "Couch Legends",
    durationSeconds: 52,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["rock", "party", "synced"],
    popularity: 77,
    addedDaysAgo: 12,
    colors: ["#ef4444", "#a855f7"],
    credit: ORIGINAL,
    license: "original-cc0",
    lyrics: {
      type: "lrc",
      lrc: `[00:03.00]We sold out the sofa and the kitchen floor
[00:08.00]Got a crowd of twelve and they're begging for more
[00:13.00]Lamp for a spotlight, remote for a mic
[00:18.00]We're on the living room tour tonight
[00:24.00]Oh-oh, the living room tour
[00:28.00]No tickets, no stage, just open the door
[00:33.00]Oh-oh, the living room tour
[00:38.00]Sing it like you've never sung before
[00:44.00]Sing it like you've never sung before
[00:49.00]`,
    },
  },
  {
    id: "glitter-ceiling",
    title: "Glitter on the Ceiling (Official Video)",
    artist: "Disco Ghosts",
    durationSeconds: 44,
    kind: "official",
    lyricsInVideo: "no",
    tags: ["disco", "official", "synced"],
    popularity: 88,
    addedDaysAgo: 5,
    colors: ["#eab308", "#d946ef"],
    credit: ORIGINAL,
    license: "original-cc0",
    lyrics: {
      type: "lrc",
      wordTiming: true,
      lrc: `[00:03.00]Somebody threw the glitter way too high
[00:08.00]Now the ceiling's sparkling like a midnight sky
[00:13.00]Every little speck is a wish we made
[00:18.00]Dancing in a light that'll never fade
[00:24.00]Glitter on the ceiling, stars on the floor
[00:29.00]Hold on to the feeling, sing it once more
[00:35.00]Glitter on the ceiling, stars on the floor
[00:41.00]`,
    },
  },
  {
    id: "twinkle-twinkle",
    title: "Twinkle, Twinkle, Little Star",
    artist: "Jane Taylor (1806)",
    durationSeconds: 34,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["classic", "kids", "synced"],
    popularity: 60,
    addedDaysAgo: 600,
    colors: ["#0ea5e9", "#8b5cf6"],
    credit: "Public domain lyrics (Jane Taylor, 1806).",
    license: "public-domain",
    lyrics: {
      type: "lrc",
      wordTiming: true,
      lrc: `[00:02.00]Twinkle, twinkle, little star,
[00:07.00]How I wonder what you are!
[00:12.00]Up above the world so high,
[00:17.00]Like a diamond in the sky.
[00:22.00]Twinkle, twinkle, little star,
[00:27.00]How I wonder what you are!
[00:31.50]`,
    },
  },
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    artist: "John Newton (1779)",
    durationSeconds: 50,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["classic", "plain"],
    popularity: 70,
    addedDaysAgo: 900,
    colors: ["#14b8a6", "#6366f1"],
    credit: "Public domain lyrics (John Newton, 1779). No timing data — shown unsynchronised.",
    license: "public-domain",
    lyrics: {
      type: "plain",
      text: `Amazing grace! How sweet the sound
That saved a wretch like me!
I once was lost, but now am found;
Was blind, but now I see.

'Twas grace that taught my heart to fear,
And grace my fears relieved;
How precious did that grace appear
The hour I first believed.`,
    },
  },
  {
    id: "synthwave-sunset",
    title: "Synthwave Sunset (Instrumental)",
    artist: "Night Drive Club",
    durationSeconds: 40,
    kind: "instrumental",
    lyricsInVideo: "no",
    tags: ["instrumental", "chill"],
    popularity: 55,
    addedDaysAgo: 3,
    colors: ["#f97316", "#7c3aed"],
    credit: "Fictional instrumental — no lyrics exist.",
    license: "none",
    lyrics: { type: "none" },
  },
  {
    id: "row-your-boat",
    title: "Row, Row, Row Your Boat",
    artist: "Traditional",
    durationSeconds: 21,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["classic", "kids", "synced"],
    popularity: 50,
    addedDaysAgo: 700,
    colors: ["#22c55e", "#0ea5e9"],
    credit: "Public domain lyrics.",
    license: "public-domain",
    lyrics: {
      type: "lrc",
      wordTiming: true,
      lrc: `[00:02.00]Row, row, row your boat,
[00:06.00]Gently down the stream.
[00:10.00]Merrily, merrily, merrily, merrily,
[00:15.00]Life is but a dream.
[00:19.00]`,
    },
  },
  {
    id: "auld-lang-syne",
    title: "Auld Lang Syne",
    artist: "Robert Burns (1788)",
    durationSeconds: 50,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["classic", "new year", "synced"],
    popularity: 65,
    addedDaysAgo: 365,
    colors: ["#a855f7", "#f43f5e"],
    credit: "Public domain lyrics (Robert Burns, 1788).",
    license: "public-domain",
    lyrics: {
      type: "lrc",
      lrc: `[00:03.00]Should auld acquaintance be forgot,
[00:09.00]And never brought to mind?
[00:15.00]Should auld acquaintance be forgot,
[00:21.00]And auld lang syne?
[00:27.00]For auld lang syne, my dear,
[00:32.00]For auld lang syne,
[00:37.00]We'll tak a cup o' kindness yet,
[00:42.00]For auld lang syne.
[00:47.00]`,
    },
  },
  {
    id: "take-me-out",
    title: "Take Me Out to the Ball Game",
    artist: "Norworth & Von Tilzer (1908)",
    durationSeconds: 40,
    kind: "sample",
    lyricsInVideo: "no",
    tags: ["classic", "sports", "synced"],
    popularity: 58,
    addedDaysAgo: 500,
    colors: ["#3b82f6", "#ef4444"],
    credit: "Public domain lyrics (Jack Norworth, 1908).",
    license: "public-domain",
    lyrics: {
      type: "lrc",
      lrc: `[00:02.00]Take me out to the ball game,
[00:06.00]Take me out with the crowd;
[00:10.00]Buy me some peanuts and Cracker Jack,
[00:15.00]I don't care if I never get back.
[00:20.00]Let me root, root, root for the home team,
[00:25.00]If they don't win, it's a shame.
[00:29.00]For it's one, two, three strikes, you're out,
[00:34.00]At the old ball game.
[00:38.00]`,
    },
  },
];

export function getDemoTrack(id: string): DemoTrack | undefined {
  return DEMO_TRACKS.find((t) => t.id === id);
}

export function demoSong(track: DemoTrack): Song {
  return {
    id: `demo:${track.id}`,
    source: "demo",
    youtubeVideoId: null,
    title: track.title,
    channelName: track.artist,
    thumbnailUrl: null,
    durationSeconds: track.durationSeconds,
    metadata: {
      videoKind: track.kind,
      lyricsInVideo: track.lyricsInVideo,
      classificationBasis: track.kind === "karaoke" ? "Sample karaoke track (lyrics drawn in the simulated video)" : "Sample catalog entry",
      demoTrackId: track.id,
    },
  };
}

/**
 * Converts a line-timed LRC into enhanced LRC by spreading each line's words
 * across the line. Only used for the simulated sample tracks above, where
 * this authored timing *is* the track's timing.
 */
export function withSampleWordTiming(lrc: string): string {
  const lines = lrc.split("\n").map((l) => {
    const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    return m ? { at: Number(m[1]) * 60 + Number(m[2]), text: m[3] } : null;
  });
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!line) return;
    const next = lines.slice(i + 1).find(Boolean);
    if (!line.text.trim()) {
      out.push(`[${fmt(line.at)}]`);
      return;
    }
    const end = next ? next.at : line.at + 4;
    const span = Math.min(end - line.at, 4.2) * 0.9;
    const words = line.text.split(/(?<=\s)/);
    const weights = words.map((w) => Math.max(2, w.trim().length));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = line.at;
    const parts = words.map((w, wi) => {
      const tag = `<${fmt(t)}>${w}`;
      t += (span * weights[wi]) / total;
      return tag;
    });
    out.push(`[${fmt(line.at)}]${parts.join("")}<${fmt(t)}>`);
  });
  return out.join("\n");
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

/** Search over the sample catalog. Results are always labelled as samples. */
export function searchDemoCatalog(query: string, filter: string): DemoTrack[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t && !["karaoke", "lyrics", "official", "video", "instrumental"].includes(t));
  let list = DEMO_TRACKS.filter((t) => {
    const hay = `${t.title} ${t.artist} ${t.tags.join(" ")}`.toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
  if (filter === "karaoke") list = list.filter((t) => t.kind === "karaoke" || t.lyrics.type === "lrc");
  if (filter === "lyrics") list = list.filter((t) => t.lyrics.type !== "none" || t.lyricsInVideo === "likely");
  if (filter === "official") list = list.filter((t) => t.kind === "official");
  if (filter === "popular") list = [...list].sort((a, b) => b.popularity - a.popularity);
  if (filter === "recent") list = [...list].sort((a, b) => a.addedDaysAgo - b.addedDaysAgo);
  return list;
}
