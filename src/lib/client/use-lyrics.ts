"use client";

import { useEffect, useState } from "react";
import type { LyricsMeta, Song } from "@/lib/domain/types";
import type { LyricsPayload } from "@/lib/lyrics/types";

export type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; payload: Exclude<LyricsPayload, { kind: "none" }> }
  | { status: "none" }
  | { status: "error" };

/** Fetches lyrics for the song on stage. A failure never affects playback. */
export function useLyrics(partyId: string, song: Song | null, meta: LyricsMeta | null | undefined): LyricsState {
  const songId = song?.id ?? null;
  const availability = meta?.availabilityStatus ?? "unknown";
  const key = `${songId}|${availability}`;
  const [result, setResult] = useState<{ key: string; state: LyricsState } | null>(null);

  useEffect(() => {
    if (!songId || availability === "unavailable") return;
    const controller = new AbortController();
    const setState = (state: LyricsState) => setResult({ key, state });
    fetch(`/api/lyrics?partyId=${encodeURIComponent(partyId)}&songId=${encodeURIComponent(songId)}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LyricsPayload | { kind: "error" };
        if (data.kind === "synced" || data.kind === "plain") setState({ status: "ready", payload: data });
        else if (data.kind === "error") setState({ status: "error" });
        else setState({ status: "none" });
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setState({ status: "error" });
      });
    return () => controller.abort();
  }, [partyId, songId, availability, key]);

  if (!songId) return { status: "idle" };
  if (availability === "unavailable") return { status: "none" };
  return result?.key === key ? result.state : { status: "loading" };
}
