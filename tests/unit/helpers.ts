import { randomUUID } from "node:crypto";
import { demoSong, DEMO_TRACKS } from "@/lib/demo/catalog";
import { createPartyAggregate, joinParty, type Ctx } from "@/lib/domain/party-logic";
import { DEFAULT_SETTINGS, mergeSettings, type SettingsPatch } from "@/lib/domain/settings";
import type { PartyAggregate, Song } from "@/lib/domain/types";

export class Clock {
  t = Date.parse("2026-10-26T20:00:00.000Z");
  ctx = (): Ctx => ({ now: new Date(this.t), newId: randomUUID });
  advance(ms: number) {
    this.t += ms;
  }
}

export function makeParty(patch?: SettingsPatch, clock = new Clock()) {
  const agg = createPartyAggregate({
    id: randomUUID(),
    joinCode: "ABC234",
    name: "Friday Night Karaoke",
    hostTokenHash: "a".repeat(64),
    settings: mergeSettings(structuredClone(DEFAULT_SETTINGS), patch),
    now: new Date(clock.t),
  });
  return { agg, clock };
}

export function addGuest(agg: PartyAggregate, name: string, clock: Clock) {
  return joinParty(agg, { displayName: name, avatar: "🎤", tokenHash: randomUUID().replace(/-/g, "").padEnd(64, "0") }, clock.ctx());
}

export const songs: Song[] = DEMO_TRACKS.map(demoSong);

export function ytSong(videoId: string, title = "Some Song (Karaoke Version)"): Song {
  return {
    id: `yt:${videoId}`,
    source: "youtube",
    youtubeVideoId: videoId,
    title,
    channelName: "Karaoke Channel",
    thumbnailUrl: null,
    durationSeconds: 200,
    metadata: { videoKind: "karaoke", lyricsInVideo: "likely" },
  };
}
