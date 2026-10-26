"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { loadYouTubeApi, type YTPlayer } from "@/lib/player/youtube-api";
import type { PlayerEvent, PlayerHandle, PlayerState } from "@/lib/player/types";

const STATE_MAP: Record<number, PlayerState> = { [-1]: "cued", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "cued" };

/**
 * One persistent official YouTube IFrame player. New songs are loaded into
 * the same player (keeps the browser's autoplay permission). We never hide,
 * cover or restyle the player while it plays, and never bypass ads or
 * embedding restrictions.
 */
export function YouTubeSurface({
  videoId,
  onEvent,
  onHandle,
}: {
  videoId: string;
  onEvent: (e: PlayerEvent) => void;
  onHandle: (h: PlayerHandle | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const stateRef = useRef<PlayerState>("loading");
  const videoRef = useRef(videoId);
  const pendingRef = useRef<{ startSeconds: number } | null>(null);
  const loadedVideoRef = useRef<string | null>(null);
  const onEventRef = useRef(onEvent);
  useLayoutEffect(() => {
    onEventRef.current = onEvent;
    videoRef.current = videoId;
  });

  useEffect(() => {
    let disposed = false;
    const emit = (e: PlayerEvent) => !disposed && onEventRef.current(e);
    const setState = (s: PlayerState) => {
      stateRef.current = s;
      emit({ type: "state", state: s });
    };

    const handle: PlayerHandle = {
      kind: "youtube",
      load({ startSeconds }) {
        const p = playerRef.current;
        if (!p || !readyRef.current) {
          pendingRef.current = { startSeconds };
          return;
        }
        loadedVideoRef.current = videoRef.current;
        stateRef.current = "loading";
        p.cueVideoById({ videoId: videoRef.current, startSeconds: Math.max(0, Math.floor(startSeconds)) });
      },
      play() {
        const p = playerRef.current;
        if (!p || !readyRef.current) return;
        if (loadedVideoRef.current !== videoRef.current) {
          loadedVideoRef.current = videoRef.current;
          p.loadVideoById({ videoId: videoRef.current });
          return;
        }
        p.playVideo();
      },
      pause() {
        playerRef.current?.pauseVideo();
      },
      seek(seconds) {
        playerRef.current?.seekTo(Math.max(0, seconds), true);
      },
      getCurrentTime() {
        try {
          return playerRef.current?.getCurrentTime() ?? 0;
        } catch {
          return 0;
        }
      },
      getDuration() {
        try {
          const d = playerRef.current?.getDuration();
          return d && d > 0 ? d : null;
        } catch {
          return null;
        }
      },
      getState() {
        return stateRef.current;
      },
    };

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !hostRef.current) return;
        const mount = document.createElement("div");
        hostRef.current.appendChild(mount);
        playerRef.current = new YT.Player(mount, {
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            iv_load_policy: 3,
            autoplay: 0,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              stateRef.current = "unloaded";
              onHandle(handle);
              const pending = pendingRef.current;
              if (pending) {
                pendingRef.current = null;
                handle.load(pending);
              }
            },
            onStateChange: (e) => {
              const s = STATE_MAP[e.data];
              if (!s) return;
              setState(s);
              const d = handle.getDuration();
              if (d && (s === "playing" || s === "cued")) emit({ type: "duration", seconds: d });
            },
            onError: (e) => {
              stateRef.current = "error";
              emit({ type: "error", code: String(e.data) });
            },
          },
        });
      })
      .catch(() => {
        stateRef.current = "error";
        emit({ type: "error", code: "api_unavailable" });
      });

    return () => {
      disposed = true;
      onHandle(null);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
    // The player is created once; songs are swapped via handle.load/play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" data-testid="youtube-player" />;
}
