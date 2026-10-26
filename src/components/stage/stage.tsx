"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Mic2, MonitorPlay, Play, RefreshCw, Search, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Visualizer } from "@/components/brand/visualizer";
import { Avatar } from "@/components/party/avatar";
import { SongIndicators } from "@/components/party/indicators";
import { QrCode } from "@/components/party/qr-code";
import { SongArt } from "@/components/party/song-art";
import { Button } from "@/components/ui/button";
import type { PartySnapshot, QueueItemView } from "@/lib/domain/snapshot";
import type { LyricsMeta, Song, StageLayout } from "@/lib/domain/types";
import type { ServerMeta } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatClock } from "@/lib/client/format";
import { useLyrics } from "@/lib/client/use-lyrics";
import { usePlaybackEstimate } from "@/lib/client/use-playback-estimate";
import type { StageOutput } from "@/lib/client/use-stage-output";
import { playChime } from "@/lib/client/sounds";
import type { PlayerHandle } from "@/lib/player/types";
import { LyricsDisplay } from "./lyrics-display";
import { SimulatedSurface } from "./simulated-surface";
import { YouTubeSurface } from "./youtube-surface";

export interface StageActions {
  play: () => void;
  start: () => void;
  skip: () => void;
  chooseAnother: (item: QueueItemView) => void;
}

export function resolveLayout(setting: StageLayout, song: Song, lyrics: LyricsMeta | null): Exclude<StageLayout, "auto"> {
  if (setting !== "auto") return setting;
  if (song.metadata.lyricsInVideo === "likely") return "video";
  if (lyrics?.availabilityStatus === "synced" || lyrics?.availabilityStatus === "plain") return "split";
  if (!lyrics || lyrics.availabilityStatus === "unknown") return "split";
  return "video";
}

function useHandleProgress(handle: PlayerHandle | null, active: boolean) {
  const [state, setState] = useState({ position: 0, duration: null as number | null });
  useEffect(() => {
    if (!handle || !active) return;
    const tick = () => setState({ position: handle.getCurrentTime(), duration: handle.getDuration() });
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [handle, active]);
  return state;
}

export function Stage({
  snapshot,
  meta,
  clockOffsetMs,
  output,
  actions,
  variant,
  soundOn,
}: {
  snapshot: PartySnapshot;
  meta: ServerMeta | null;
  clockOffsetMs: number;
  output: StageOutput | null;
  actions?: StageActions;
  variant: "embedded" | "tv";
  soundOn?: boolean;
}) {
  const { party, playback: pb, nowPlaying: item } = snapshot;
  const display = party.settings.display;
  const isOutput = Boolean(output?.isOutput);
  const estimate = usePlaybackEstimate(pb, clockOffsetMs);
  const live = useHandleProgress(output?.handle ?? null, isOutput);
  const position = isOutput ? live.position : estimate.position;
  const duration = (isOutput ? live.duration : null) ?? pb.durationSeconds ?? item?.song.durationSeconds ?? null;
  const lyricsState = useLyrics(party.id, item?.song ?? null, item?.lyrics);
  const layout = item ? resolveLayout(display.layout, item.song, item.lyrics) : "video";
  const playing = pb.status === "playing" || pb.status === "buffering";
  const showQr = display.showQr && (!playing || party.settings.showQrDuringPerformance);
  const joinUrl = meta?.joinUrl ?? "";
  useCelebrations(snapshot, isOutput, soundOn);

  return (
    <div
      className={cn(
        "lyrics-stage relative isolate flex h-full w-full flex-col overflow-hidden text-white",
        `stage-bg-${display.background}`,
        variant === "embedded" && "rounded-[1.4rem] border border-line",
      )}
      data-testid="stage"
      data-status={pb.status}
      data-layout={layout}
    >
      {display.background === "aurora" ? (
        <div aria-hidden className="pointer-events-none absolute -inset-[20%] -z-10 animate-aurora bg-[radial-gradient(40%_40%_at_30%_30%,rgba(168,85,247,0.35),transparent),radial-gradient(35%_35%_at_70%_60%,rgba(255,46,147,0.25),transparent)]" />
      ) : null}

      {variant === "tv" ? (
        <header className="relative flex items-center px-[3cqmin] pt-[2.2cqmin]">
          <Logo className="origin-left scale-[clamp(0.8,0.25cqmin,1.6)]" />
          <p className="absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate font-display text-[clamp(0.9rem,2.4cqmin,2rem)] font-bold text-white/80">{party.name}</p>
        </header>
      ) : null}

      {party.status === "ended" ? (
        <WrapScreen snapshot={snapshot} />
      ) : !item ? (
        <IdleScreen snapshot={snapshot} joinUrl={joinUrl} actions={actions} isOutput={isOutput} />
      ) : (
        <div className="relative flex min-h-0 flex-1 gap-[2.4cqmin] p-[2.4cqmin]">
          {/* Player column: always the same element so layout switches never reload the video. */}
          <div
            className={cn(
              "relative flex min-w-0 items-center justify-center transition-[flex-basis] duration-500",
              layout === "video" && "flex-[1_1_100%]",
              layout === "split" && "flex-[0_0_52%]",
              layout === "lyrics" && "flex-[0_0_32%] items-start",
            )}
          >
            <div className="relative aspect-video max-h-full w-full overflow-hidden rounded-[1.6cqmin] bg-black shadow-2xl ring-1 ring-white/10">
              {isOutput && output ? (
                item.song.source === "demo" ? (
                  <SimulatedSurface key={item.song.id} song={item.song} onEvent={output.onEvent} onHandle={output.setHandle} />
                ) : (
                  <YouTubeSurface videoId={item.song.youtubeVideoId!} onEvent={output.onEvent} onHandle={output.setHandle} />
                )
              ) : (
                <RemotePreview item={item} />
              )}
              {pb.status === "error" ? <ErrorPanel item={item} message={pb.error?.message ?? "This video can't be played."} actions={isOutput ? actions : undefined} /> : null}
              {isOutput && actions && (pb.status === "ready" || (pb.status === "paused" && pb.interrupted)) ? (
                <PlayPrompt
                  label={pb.interrupted && position > 1 ? `Resume from ${formatClock(position)}` : "Play Next Song"}
                  hint={pb.autoplayBlocked ? "Your browser blocked autoplay — one click starts the song." : pb.interrupted ? "Playback stopped when this screen reloaded." : undefined}
                  onPlay={() => {
                    output?.playNow();
                    actions.play();
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className={cn("relative min-w-0 flex-1 rounded-[1.6cqmin]", layout === "video" && "hidden", layout !== "video" && "bg-black/20 ring-1 ring-white/5")}>
            {layout !== "video" ? (
              <LyricsDisplay
                state={lyricsState}
                nowMs={output?.nowMs ?? (() => 0)}
                textSize={display.textSize}
                showNextLine={display.showNextLine}
                lyricsInVideo={item.song.metadata.lyricsInVideo === "likely"}
                active={isOutput}
              />
            ) : null}
          </div>

          <AnimatePresence>{pb.status === "intro" ? <IntroSplash key={item.id} item={item} introUntil={pb.introUntil} clockOffsetMs={clockOffsetMs} /> : null}</AnimatePresence>
        </div>
      )}

      {party.status === "paused" ? (
        <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-[2cqmin]">
          <div className="rounded-full bg-black/70 px-[3cqmin] py-[1.2cqmin] font-display text-[clamp(0.8rem,2.6cqmin,2rem)] font-bold backdrop-blur" role="status">
            ☕ Intermission — the party will be right back
          </div>
        </div>
      ) : null}

      {item && party.status !== "ended" ? (
        <InfoBar snapshot={snapshot} position={position} duration={duration} showQr={showQr} joinUrl={joinUrl} layout={layout} />
      ) : null}
    </div>
  );
}

function RemotePreview({ item }: { item: QueueItemView }) {
  return (
    <div className="absolute inset-0">
      <SongArt song={item.song} className="h-full w-full opacity-60" rounded="rounded-none" />
      <div className="absolute inset-0 grid place-items-center bg-black/40 p-4 text-center">
        <div>
          <MonitorPlay className="mx-auto mb-2 h-[8cqmin] w-[8cqmin]" aria-hidden />
          <p className="font-display text-[clamp(0.85rem,3cqmin,1.6rem)] font-bold">Playing on the TV screen</p>
          <p className="text-[clamp(0.7rem,2cqmin,1rem)] text-white/70">Progress here is an estimate from the stage&apos;s last report.</p>
        </div>
      </div>
    </div>
  );
}

function InfoBar({ snapshot, position, duration, showQr, joinUrl, layout }: { snapshot: PartySnapshot; position: number; duration: number | null; showQr: boolean; joinUrl: string; layout: string }) {
  const item = snapshot.nowPlaying!;
  const next = snapshot.upcoming[0];
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;
  const playing = snapshot.playback.status === "playing";
  return (
    <footer className="flex items-center gap-[2.4cqmin] border-t border-white/10 bg-black/35 px-[2.6cqmin] py-[1.8cqmin] backdrop-blur-md">
      <Avatar emoji={item.requestedBy.avatar} size="lg" className="h-[8cqmin] max-h-20 min-h-10 w-[8cqmin] max-w-20 min-w-10 text-[4.5cqmin]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[clamp(0.6rem,1.7cqmin,1.1rem)] font-bold tracking-[0.18em] text-[#f5c2ff] uppercase">
          <Visualizer bars={4} playing={playing} className="h-[1.1em]" /> Now singing
        </p>
        <p className="truncate font-display text-[clamp(1rem,3.6cqmin,3rem)] leading-tight font-extrabold" data-testid="now-singing">
          {item.requestedBy.displayName}
        </p>
        <p className="truncate text-[clamp(0.75rem,2cqmin,1.5rem)] text-white/75">
          {item.song.title} <span className="text-white/45">· {item.song.channelName}</span>
        </p>
        <div className="mt-[1cqmin] flex items-center gap-[1.4cqmin]">
          <span className="text-[clamp(0.6rem,1.6cqmin,1.1rem)] text-white/70 tabular-nums" data-testid="elapsed">
            {formatClock(position)}
          </span>
          <div className="h-[0.9cqmin] max-h-2.5 min-h-1 flex-1 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={Math.round(duration ?? 0)} aria-valuenow={Math.round(position)}>
            <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[clamp(0.6rem,1.6cqmin,1.1rem)] text-white/70 tabular-nums">{duration ? `-${formatClock(Math.max(0, duration - position))}` : "–:––"}</span>
        </div>
      </div>
      <div className="hidden min-w-0 max-w-[26%] shrink-0 border-l border-white/10 pl-[2.4cqmin] @[40rem]:block sm:block">
        <p className="text-[clamp(0.6rem,1.6cqmin,1.05rem)] font-bold tracking-[0.18em] text-white/55 uppercase">Next up</p>
        {next ? (
          <>
            <p className="truncate font-display text-[clamp(0.85rem,2.6cqmin,2rem)] font-bold" data-testid="next-up">
              {next.requestedBy.avatar} {next.requestedBy.displayName}
            </p>
            <p className="truncate text-[clamp(0.65rem,1.7cqmin,1.2rem)] text-white/65">{next.song.title}</p>
          </>
        ) : (
          <p className="text-[clamp(0.75rem,2cqmin,1.4rem)] text-white/65">Queue&apos;s open — add a song!</p>
        )}
      </div>
      {showQr && joinUrl ? (
        <div className="flex shrink-0 items-center gap-[1.4cqmin]" data-testid="stage-qr">
          <QrCode value={joinUrl} className="h-[11cqmin] max-h-36 min-h-16 w-[11cqmin] max-w-36 min-w-16 p-0" label="Scan to join the party" />
          <div className={cn("hidden leading-tight", layout !== "lyrics" && "lg:block")}>
            <p className="text-[clamp(0.6rem,1.5cqmin,1rem)] font-bold text-white/60 uppercase">Join</p>
            <p className="font-display text-[clamp(0.8rem,2.2cqmin,1.6rem)] font-extrabold tracking-widest">{snapshot.party.joinCode}</p>
          </div>
        </div>
      ) : null}
    </footer>
  );
}

function IdleScreen({ snapshot, joinUrl, actions, isOutput }: { snapshot: PartySnapshot; joinUrl: string; actions?: StageActions; isOutput: boolean }) {
  const next = snapshot.upcoming.slice(0, 3);
  const last = snapshot.history[0];
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center gap-[6cqmin] p-[4cqmin]" data-testid="stage-idle">
      {snapshot.party.settings.display.showQr && joinUrl ? (
        <div className="flex shrink-0 flex-col items-center gap-[2cqmin]">
          <div className="rounded-[2.5cqmin] bg-white p-[1.4cqmin] shadow-[0_0_80px_rgba(217,70,239,0.45)]">
            <QrCode value={joinUrl} className="h-[42cqmin] w-[42cqmin]" label="Scan to join the party" />
          </div>
          <p className="font-display text-[clamp(1rem,3.4cqmin,2.6rem)] font-extrabold tracking-[0.25em]">{snapshot.party.joinCode}</p>
        </div>
      ) : null}
      <div className="min-w-0 max-w-[60cqmin]">
        <p className="text-[clamp(0.7rem,2cqmin,1.4rem)] font-bold tracking-[0.25em] text-[#f5c2ff] uppercase">{snapshot.party.name}</p>
        <h2 className="mt-[1cqmin] font-display text-[clamp(1.4rem,6.5cqmin,5.5rem)] leading-[1.02] font-extrabold">
          Scan. <span className="text-gradient">Add your song.</span> Grab the mic.
        </h2>
        {last ? (
          <p className="mt-[2cqmin] text-[clamp(0.8rem,2.2cqmin,1.6rem)] text-white/70">
            👏 That was {last.performer.displayName} with “{last.song.title}”
          </p>
        ) : null}
        <div className="mt-[3cqmin] space-y-[1.2cqmin]">
          {next.length ? (
            next.map((q, i) => (
              <div key={q.id} className="flex items-center gap-[1.6cqmin] rounded-[1.6cqmin] bg-white/8 px-[1.6cqmin] py-[1.1cqmin]">
                <span className="font-display text-[clamp(0.8rem,2.4cqmin,1.8rem)] font-extrabold text-white/50">{i + 1}</span>
                <span className="text-[clamp(1rem,3cqmin,2.2rem)]" aria-hidden>
                  {q.requestedBy.avatar}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-[clamp(0.8rem,2.4cqmin,1.7rem)]">{q.requestedBy.displayName}</p>
                  <p className="truncate text-[clamp(0.7rem,1.8cqmin,1.25rem)] text-white/65">{q.song.title}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-[clamp(0.85rem,2.4cqmin,1.7rem)] text-white/70">The queue is empty — be the first to the mic! 🎤</p>
          )}
        </div>
        {actions && isOutput && next.length ? (
          <Button size="xl" className="mt-[3cqmin]" onClick={actions.start} data-testid="stage-start">
            <Play className="h-6 w-6 fill-current" aria-hidden /> {snapshot.history.length ? "Next Song" : "Start the Show"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function IntroSplash({ item, introUntil, clockOffsetMs }: { item: QueueItemView; introUntil: string | null; clockOffsetMs: number }) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    const tick = () => setLeft(introUntil ? Math.max(0, Math.ceil((Date.parse(introUntil) - (Date.now() + clockOffsetMs)) / 1000)) : 0);
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [introUntil, clockOffsetMs]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-stage-950/92 text-center backdrop-blur-xl"
      data-testid="intro-splash"
    >
      <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-[clamp(0.8rem,2.6cqmin,2rem)] font-bold tracking-[0.3em] text-[#f5c2ff] uppercase">
        Next up
      </motion.p>
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }} className="my-[2.4cqmin] text-[16cqmin]" aria-hidden>
        {item.requestedBy.avatar}
      </motion.div>
      <motion.h2 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="font-display text-[clamp(1.6rem,8cqmin,7rem)] leading-none font-extrabold">
        <span className="text-gradient">{item.requestedBy.displayName}</span> <Mic2 className="inline h-[0.8em] w-[0.8em]" aria-hidden />
      </motion.h2>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-[2cqmin] max-w-[80%] truncate text-[clamp(0.9rem,3cqmin,2.4rem)] text-white/80">
        {item.song.title}
      </motion.p>
      <div className="mt-[1.6cqmin]">
        <SongIndicators song={item.song} lyrics={item.lyrics} />
      </div>
      <p className="mt-[3cqmin] font-display text-[clamp(1rem,4cqmin,3rem)] font-extrabold text-white/60 tabular-nums" aria-live="polite">
        {left > 0 ? left : "🎶"}
      </p>
    </motion.div>
  );
}

function PlayPrompt({ label, hint, onPlay }: { label: string; hint?: string; onPlay: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/55 p-4 text-center backdrop-blur-sm">
      <Button size="xl" onClick={onPlay} data-testid="play-next">
        <Play className="h-6 w-6 fill-current" aria-hidden /> {label}
      </Button>
      {hint ? <p className="max-w-sm text-sm text-white/80">{hint}</p> : null}
    </div>
  );
}

function ErrorPanel({ item, message, actions }: { item: QueueItemView; message: string; actions?: StageActions }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stage-950/90 p-5 text-center" role="alert" data-testid="video-error">
      <AlertTriangle className="h-10 w-10 text-warning" aria-hidden />
      <p className="font-display text-xl font-bold">This video can&apos;t play here</p>
      <p className="max-w-md text-sm text-white/75">{message}</p>
      {actions ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => actions.chooseAnother(item)}>
            <Search className="h-4 w-4" aria-hidden /> Choose another version
          </Button>
          <Button variant="secondary" onClick={actions.skip}>
            <SkipForward className="h-4 w-4" aria-hidden /> Skip song
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Reload player
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-white/50">The rest of the queue is safe.</p>
    </div>
  );
}

function WrapScreen({ snapshot }: { snapshot: PartySnapshot }) {
  const completed = snapshot.history.filter((h) => h.completionStatus === "completed").length;
  const star = snapshot.leaderboard.performances[0];
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-[4cqmin] text-center" data-testid="stage-ended">
      <p className="text-[10cqmin]" aria-hidden>
        🎉
      </p>
      <h2 className="font-display text-[clamp(1.6rem,7cqmin,6rem)] font-extrabold">That&apos;s a wrap!</h2>
      <p className="mt-[1.5cqmin] text-[clamp(0.9rem,2.6cqmin,2rem)] text-white/75">
        {completed} song{completed === 1 ? "" : "s"} sung by {snapshot.participants.length} singer{snapshot.participants.length === 1 ? "" : "s"}
        {star ? ` · Star of the night: ${star.avatar} ${star.displayName}` : ""}
      </p>
    </div>
  );
}

/** Confetti + optional chime when a performance completes. Output screen only. */
function useCelebrations(snapshot: PartySnapshot, isOutput: boolean, soundOn?: boolean) {
  const lastHistory = useRef<string | null | undefined>(undefined);
  const latest = snapshot.history[0];
  useEffect(() => {
    const id = latest?.id ?? null;
    if (lastHistory.current === undefined) {
      lastHistory.current = id;
      return;
    }
    if (id && id !== lastHistory.current) {
      lastHistory.current = id;
      if (!isOutput || latest?.completionStatus !== "completed") return;
      void confetti({ particleCount: 140, spread: 90, origin: { y: 0.65 }, colors: ["#a855f7", "#d946ef", "#ff2e93", "#22d3ee", "#fbbf24"], disableForReducedMotion: true });
      if (soundOn) playChime();
    }
  }, [latest?.id, latest?.completionStatus, isOutput, soundOn]);
}
