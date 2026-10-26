import { randomUUID } from "node:crypto";
import type { LyricsMeta, Song } from "@/lib/domain/types";
import { serverEnv } from "@/lib/server/env";
import { TtlCache } from "@/lib/server/ttl-cache";
import {
  LicensedDatasetProvider,
  LicensedHttpProvider,
  SampleLyricsProvider,
  type LyricsProvider,
} from "./providers";
import type { LyricsPayload } from "./types";

export function configuredProviders(): LyricsProvider[] {
  const env = serverEnv();
  const providers: LyricsProvider[] = [new SampleLyricsProvider()];
  if (env.lyricsDatasetDir) providers.push(new LicensedDatasetProvider(env.lyricsDatasetDir, env.lyricsProviderName));
  if (env.lyricsProviderUrl) {
    providers.push(new LicensedHttpProvider(env.lyricsProviderUrl, env.lyricsProviderApiKey, env.lyricsProviderName));
  }
  return providers;
}

/** In-memory cache only: lyric text is never written to the database. */
const cache = new TtlCache<LyricsPayload | { kind: "error" }>(400);

export class LyricsService {
  constructor(private providers: LyricsProvider[] = configuredProviders()) {}

  get providerNames() {
    return this.providers.map((p) => p.name);
  }

  hasExternalProviders() {
    return this.providers.some((p) => p.id !== "sample");
  }

  async getLyrics(song: Song, opts: { cheapOnly?: boolean } = {}): Promise<LyricsPayload | { kind: "error" }> {
    const cacheKey = `${song.id}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;
    const controller = new AbortController();
    let sawError = false;
    for (const provider of this.providers) {
      if (!provider.supports(song)) continue;
      if (opts.cheapOnly && !provider.cheap) return { kind: "none", reason: "not_checked" };
      try {
        const payload = await provider.fetch(song, controller.signal);
        if (payload && payload.kind !== "none") {
          cache.set(cacheKey, payload, 60 * 60 * 1000);
          return payload;
        }
      } catch (error) {
        sawError = true;
        console.warn(`[lyrics] provider ${provider.id} failed: ${(error as Error).message}`);
      }
    }
    const result = sawError ? ({ kind: "error" } as const) : ({ kind: "none", reason: "not_found" } as const);
    cache.set(cacheKey, result, sawError ? 60 * 1000 : 10 * 60 * 1000);
    return result;
  }

  /** Builds availability metadata (no lyric text) for storage alongside the song. */
  async check(song: Song, opts: { cheapOnly?: boolean } = {}): Promise<LyricsMeta> {
    const payload = await this.getLyrics(song, opts);
    return lyricsMetaFromPayload(song, payload);
  }
}

export function lyricsMetaFromPayload(song: Song, payload: LyricsPayload | { kind: "error" }): LyricsMeta {
  const base = { id: randomUUID(), songId: song.id, metadata: { checkedAt: new Date().toISOString() } };
  if (payload.kind === "synced") {
    return {
      ...base,
      provider: payload.provider,
      availabilityStatus: "synced",
      timingFormat: payload.timing,
      licensingReference: payload.licensingReference,
      metadata: { ...base.metadata, sample: payload.sample, attribution: payload.attribution },
    };
  }
  if (payload.kind === "plain") {
    return {
      ...base,
      provider: payload.provider,
      availabilityStatus: "plain",
      timingFormat: "none",
      licensingReference: payload.licensingReference,
      metadata: { ...base.metadata, sample: payload.sample, attribution: payload.attribution },
    };
  }
  if (payload.kind === "error") {
    return { ...base, provider: null, availabilityStatus: "error", timingFormat: "none", licensingReference: null };
  }
  return {
    ...base,
    provider: null,
    availabilityStatus: payload.reason === "not_checked" ? "unknown" : "unavailable",
    timingFormat: "none",
    licensingReference: null,
  };
}

let singleton: LyricsService | null = null;
export function lyricsService(): LyricsService {
  singleton ??= new LyricsService();
  return singleton;
}
