"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Visualizer } from "@/components/brand/visualizer";
import { getDemoTrack } from "@/lib/demo/catalog";
import type { Song } from "@/lib/domain/types";
import { activeLineIndex, parseLrc } from "@/lib/lyrics/lrc";
import type { PlayerEvent, PlayerHandle, PlayerState } from "@/lib/player/types";

/**
 * Demo-mode player for the bundled sample tracks. It is clearly labelled as a
 * simulation: there is no audio, and the "video" is drawn by the app. Its
 * clock is the track's real timeline, so play/pause/seek behave like a player.
 */
/** Simulated player engine: its clock *is* the sample track's timeline. */
class SimulatedEngine implements PlayerHandle {
  readonly kind = "simulated" as const;
  private base = 0;
  private startedAt = 0;
  private state: PlayerState = "unloaded";

  private listener: (e: PlayerEvent) => void = () => {};

  constructor(private duration: number) {}

  setListener(fn: (e: PlayerEvent) => void) {
    this.listener = fn;
  }
  private emit(e: PlayerEvent) {
    this.listener(e);
  }

  private set(s: PlayerState) {
    this.state = s;
    this.emit({ type: "state", state: s });
  }
  load({ startSeconds }: { startSeconds: number }) {
    this.base = Math.min(this.duration, Math.max(0, startSeconds));
    this.set("cued");
    this.emit({ type: "duration", seconds: this.duration });
  }
  play() {
    if (this.state === "playing") return;
    if (this.base >= this.duration) this.base = 0;
    this.startedAt = performance.now();
    this.set("playing");
  }
  pause() {
    if (this.state !== "playing") return;
    this.base = this.getCurrentTime();
    this.set("paused");
  }
  seek(seconds: number) {
    this.base = Math.min(this.duration, Math.max(0, seconds));
    this.startedAt = performance.now();
  }
  getCurrentTime() {
    return this.state === "playing" ? Math.min(this.duration, this.base + (performance.now() - this.startedAt) / 1000) : this.base;
  }
  getDuration() {
    return this.duration;
  }
  getState() {
    return this.state;
  }
  /** Called on a timer: fires "ended" when the simulated track runs out. */
  tick() {
    if (this.state === "playing" && this.getCurrentTime() >= this.duration) {
      this.base = this.duration;
      this.set("ended");
    }
  }
}

export function SimulatedSurface({
  song,
  onEvent,
  onHandle,
}: {
  song: Song;
  onEvent: (e: PlayerEvent) => void;
  onHandle: (h: PlayerHandle | null) => void;
}) {
  const track = song.metadata.demoTrackId ? getDemoTrack(song.metadata.demoTrackId) : undefined;
  const duration = song.durationSeconds ?? track?.durationSeconds ?? 60;
  const [playerState, setPlayerState] = useState<PlayerState>("unloaded");
  // The component is keyed per song, so one engine per mount is enough.
  const [engine] = useState(() => new SimulatedEngine(duration));
  useLayoutEffect(() => {
    engine.setListener((e) => {
      if (e.type === "state") setPlayerState(e.state);
      onEvent(e);
    });
  }, [engine, onEvent]);

  useEffect(() => {
    onHandle(engine);
    const id = setInterval(() => engine.tick(), 200);
    return () => {
      clearInterval(id);
      onHandle(null);
    };
  }, [engine, onHandle]);

  const playing = playerState === "playing";
  const [a, b] = track?.colors ?? ["#7c3aed", "#ff2e93"];

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} data-testid="simulated-player" data-state={playerState}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.28),transparent_50%),radial-gradient(circle_at_80%_90%,rgba(0,0,0,0.45),transparent_55%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4cqmin] p-[5cqmin] text-center">
        <Visualizer bars={9} playing={playing} className="h-[12cqmin]" />
        <div>
          <p className="font-display text-[5.5cqmin] leading-tight font-extrabold drop-shadow-lg">{song.title}</p>
          <p className="mt-[1cqmin] text-[3cqmin] font-semibold text-white/85">{song.channelName}</p>
        </div>
        {track?.onScreenLyrics ? <OnScreenLyrics lrc={track.onScreenLyrics} handle={engine} /> : null}
      </div>
      <div className="absolute top-[2.5cqmin] left-[2.5cqmin] flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[clamp(0.6rem,1.9cqmin,0.95rem)] font-bold tracking-wide text-white uppercase backdrop-blur">
        <FlaskConical className="h-[1.2em] w-[1.2em]" aria-hidden /> Simulated playback · sample track · no audio
      </div>
    </div>
  );
}

/** Lyrics "burned into" the simulated karaoke video (demo of the karaoke-video case). */
function OnScreenLyrics({ lrc, handle }: { lrc: string; handle: PlayerHandle }) {
  const lines = useMemo(() => parseLrc(lrc).lines, [lrc]);
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setIndex(activeLineIndex(lines, handle.getCurrentTime() * 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, handle]);
  const current = lines[index]?.text;
  const next = lines[index + 1]?.text;
  return (
    <div className="w-full rounded-[2cqmin] bg-black/45 px-[3cqmin] py-[2.5cqmin] backdrop-blur-sm" aria-label="Lyrics shown in the video">
      <p className="font-display text-[6cqmin] leading-tight font-extrabold text-[#fff59d]">{current || "♪"}</p>
      <p className="mt-[1cqmin] text-[3.6cqmin] font-bold text-white/70">{next ?? ""}</p>
    </div>
  );
}
