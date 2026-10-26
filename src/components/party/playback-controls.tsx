"use client";

import { CheckCheck, Flag, Pause, Play, RotateCcw, SkipForward, StepBack, StepForward } from "lucide-react";
import { useState } from "react";
import type { PartySnapshot } from "@/lib/domain/snapshot";
import { cn } from "@/lib/client/cn";
import { formatClock } from "@/lib/client/format";

export interface PlaybackHandlers {
  play: () => void;
  pause: () => void;
  restart: () => void;
  seek: (seconds: number) => void;
  skip: () => void;
  finish: () => void;
  start: () => void;
  reportUnavailable: () => void;
}

function Ctl({ label, onClick, children, primary, disabled, testId }: { label: string; onClick: () => void; children: React.ReactNode; primary?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn(
        "grid place-items-center rounded-2xl transition-all active:scale-95 disabled:opacity-35",
        primary ? "h-14 w-14 bg-brand text-white shadow-[var(--shadow-glow-pink)] hover:brightness-110" : "h-11 w-11 text-muted hover:bg-white/10 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

export function PlaybackControls({ snapshot, position, duration, handlers, compact }: { snapshot: PartySnapshot; position: number; duration: number | null; handlers: PlaybackHandlers; compact?: boolean }) {
  const pb = snapshot.playback;
  const hasItem = Boolean(snapshot.nowPlaying);
  const playing = pb.status === "playing" || pb.status === "buffering";
  const canStart = !hasItem && snapshot.upcoming.length > 0;
  const error = pb.status === "error";
  const max = duration ?? 0;
  // Local value while dragging; the seek is sent once, on release.
  const [drag, setDrag] = useState<number | null>(null);
  const commit = () => {
    if (drag !== null) handlers.seek(drag);
    setDrag(null);
  };

  return (
    <div className={cn("flex flex-col gap-2", !compact && "card px-4 py-3")} data-testid="playback-controls">
      {!compact ? (
        <div className="flex items-center gap-3">
          <span className="w-12 text-right text-xs text-muted tabular-nums">{formatClock(drag ?? position)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(max))}
            step={1}
            value={drag ?? Math.min(Math.round(position), Math.round(max))}
            disabled={!hasItem || !duration || error}
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            aria-label="Seek"
            className="h-2 flex-1 cursor-pointer accent-[#d946ef] disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="w-12 text-xs text-muted tabular-nums">{formatClock(duration)}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
        <Ctl label="Restart song" onClick={handlers.restart} disabled={!hasItem || error}>
          <RotateCcw className="h-5 w-5" />
        </Ctl>
        <Ctl label="Back 10 seconds" onClick={() => handlers.seek(Math.max(0, position - 10))} disabled={!hasItem || error}>
          <StepBack className="h-5 w-5" />
        </Ctl>
        {canStart ? (
          <Ctl label="Start next song" onClick={handlers.start} primary testId="control-start">
            <Play className="h-6 w-6 fill-current" />
          </Ctl>
        ) : playing ? (
          <Ctl label="Pause" onClick={handlers.pause} primary disabled={!hasItem} testId="control-pause">
            <Pause className="h-6 w-6 fill-current" />
          </Ctl>
        ) : (
          <Ctl label="Play" onClick={handlers.play} primary disabled={!hasItem || error} testId="control-play">
            <Play className="h-6 w-6 fill-current" />
          </Ctl>
        )}
        <Ctl label="Forward 10 seconds" onClick={() => handlers.seek(position + 10)} disabled={!hasItem || error}>
          <StepForward className="h-5 w-5" />
        </Ctl>
        <Ctl label="Skip song" onClick={handlers.skip} disabled={!hasItem && !canStart} testId="control-skip">
          <SkipForward className="h-5 w-5" />
        </Ctl>
        {!compact ? (
          <>
            <Ctl label="Mark as finished (counts as a performance)" onClick={handlers.finish} disabled={!hasItem} testId="control-finish">
              <CheckCheck className="h-5 w-5" />
            </Ctl>
            <Ctl label="Report video unavailable and skip" onClick={handlers.reportUnavailable} disabled={!hasItem} testId="control-unavailable">
              <Flag className="h-5 w-5" />
            </Ctl>
          </>
        ) : null}
      </div>
    </div>
  );
}
