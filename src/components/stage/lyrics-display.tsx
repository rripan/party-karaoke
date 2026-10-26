"use client";

import { motion } from "framer-motion";
import { Captions, CaptionsOff, FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LyricsTextSize } from "@/lib/domain/types";
import { cn } from "@/lib/client/cn";
import type { LyricsState } from "@/lib/client/use-lyrics";
import { activeLineIndex, progressWithin } from "@/lib/lyrics/lrc";
import type { LyricLine } from "@/lib/lyrics/types";

/**
 * Karaoke lyrics, driven by `nowMs()` — the real player position. Word
 * highlighting is used only when the source provides word timestamps;
 * line-timed lyrics highlight whole lines. Nothing is interpolated or invented.
 */
export function LyricsDisplay({
  state,
  nowMs,
  textSize,
  showNextLine,
  lyricsInVideo,
  active,
}: {
  state: LyricsState;
  nowMs: () => number;
  textSize: LyricsTextSize;
  showNextLine: boolean;
  lyricsInVideo: boolean;
  /** false when this screen isn't the one playing (no real clock to follow). */
  active: boolean;
}) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <Centered>
        <div className="skeleton h-[8cqmin] w-3/4" />
        <div className="skeleton mt-[3cqmin] h-[5cqmin] w-1/2" />
      </Centered>
    );
  }
  if (state.status !== "ready") {
    return (
      <Centered>
        {lyricsInVideo ? (
          <Notice icon={<Captions className="h-[1.2em] w-[1.2em]" />} title="Lyrics are in the video">
            This looks like a karaoke video, so follow the words on screen.
          </Notice>
        ) : (
          <Notice icon={<CaptionsOff className="h-[1.2em] w-[1.2em]" />} title={state.status === "error" ? "Lyrics service unavailable" : "Separate lyrics unavailable"}>
            {state.status === "error"
              ? "The song keeps playing. Lyrics will be back when the provider is reachable."
              : "No authorised synced lyrics for this song. Sing it from the heart! 🎤"}
          </Notice>
        )}
      </Centered>
    );
  }
  const { payload } = state;
  const attribution = (
    <p className="absolute right-[2cqmin] bottom-[1.5cqmin] max-w-[70%] truncate text-right text-[clamp(0.55rem,1.4cqmin,0.8rem)] text-white/45">
      {payload.sample ? "Sample lyrics · " : "Lyrics: "}
      {payload.providerName} · {payload.licensingReference}
    </p>
  );
  if (payload.kind === "plain") {
    return (
      <div className="relative h-full overflow-hidden">
        <div className="absolute top-[2cqmin] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[clamp(0.6rem,1.7cqmin,0.9rem)] font-bold tracking-wide text-white/80 uppercase">
          <FileText className="h-[1.1em] w-[1.1em]" aria-hidden /> Lyrics · not synchronised
        </div>
        <div className={cn("h-full overflow-y-auto scrollbar-thin px-[5cqmin] pt-[9cqmin] pb-[6cqmin] text-center", `lyric-size-${textSize}`)}>
          <p className="lyric-line text-[length:calc(var(--lyric-size)*0.45)] whitespace-pre-line text-white/90" data-testid="plain-lyrics">
            {payload.text}
          </p>
        </div>
        {attribution}
      </div>
    );
  }
  return (
    <div className={cn("relative h-full", `lyric-size-${textSize}`)}>
      {active ? (
        <SyncedLyrics lines={payload.lines} wordLevel={payload.timing === "word"} nowMs={nowMs} showNextLine={showNextLine} />
      ) : (
        <Centered>
          <Notice icon={<Captions className="h-[1.2em] w-[1.2em]" />} title="Synced lyrics on the TV">
            Lyrics follow the real player on the stage screen.
          </Notice>
        </Centered>
      )}
      <span className="sr-only">{payload.timing === "word" ? "Word-synchronised lyrics" : "Line-synchronised lyrics"}</span>
      {attribution}
    </div>
  );
}

function SyncedLyrics({ lines, wordLevel, nowMs, showNextLine }: { lines: LyricLine[]; wordLevel: boolean; nowMs: () => number; showNextLine: boolean }) {
  const [index, setIndex] = useState(-1);
  const [countdown, setCountdown] = useState<number | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const firstStart = lines.find((l) => l.text)?.startMs ?? 0;

  useEffect(() => {
    let raf = 0;
    let lastIndex = -2;
    let lastCount: number | null = -1;
    const tick = () => {
      const t = nowMs();
      const i = activeLineIndex(lines, t);
      if (i !== lastIndex) {
        lastIndex = i;
        setIndex(i);
      }
      const until = firstStart - t;
      const count = i < 0 && until > 0 && until <= 3500 ? Math.ceil(until / 1000) : null;
      if (count !== lastCount) {
        lastCount = count;
        setCountdown(count);
      }
      if (wordLevel && i >= 0) {
        const words = lines[i]?.words ?? [];
        words.forEach((w, wi) => {
          const el = wordRefs.current[wi];
          if (!el) return;
          const p = progressWithin(w.startMs, w.endMs, t);
          el.style.setProperty("--p", p.toFixed(3));
          el.dataset.state = p >= 1 ? "done" : p > 0 ? "active" : "todo";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, nowMs, wordLevel, firstStart]);

  const current = index >= 0 ? lines[index] : null;
  const next = useMemo(() => lines.slice(Math.max(0, index + 1)).find((l) => l.text) ?? null, [lines, index]);
  const previous = index > 0 ? lines[index - 1] : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3cqmin] px-[5cqmin] text-center" data-testid="synced-lyrics" data-line-index={index}>
      <p className="lyric-line min-h-[1.2em] text-[length:calc(var(--lyric-size)*0.42)] text-white/30" aria-hidden>
        {previous?.text ?? ""}
      </p>
      <div className="relative w-full" aria-live="off">
        {/* Enter-only animation: an exit transition could leave stale lines behind on fast seeks. */}
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="lyric-line text-[length:var(--lyric-size)] [text-shadow:0_4px_30px_rgba(217,70,239,0.45)]"
            data-testid="current-lyric"
          >
            {current && current.text ? (
              wordLevel && current.words?.length ? (
                current.words.map((w, wi) => (
                  <span key={wi} ref={(el) => void (wordRefs.current[wi] = el)} className="lyric-word" data-state="todo">
                    {w.text}
                  </span>
                ))
              ) : (
                <span className="text-white">{current.text}</span>
              )
            ) : countdown ? (
              <span className="text-gradient">{countdown}</span>
            ) : (
              <span className="text-white/60">♪ ♪ ♪</span>
            )}
          </motion.p>
      </div>
      <p className={cn("lyric-line min-h-[1.2em] text-[length:calc(var(--lyric-size)*0.62)] text-[#c9b8ff]/70 transition-opacity", !showNextLine && "opacity-0")} data-testid="next-lyric">
        {showNextLine ? (next?.text ?? "") : ""}
      </p>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center px-[6cqmin] text-center">{children}</div>;
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex max-w-[80cqmin] flex-col items-center gap-[2cqmin]" data-testid="lyrics-notice">
      <span className="grid h-[12cqmin] w-[12cqmin] place-items-center rounded-full bg-white/8 text-[5cqmin] text-white/80">{icon}</span>
      <p className="font-display text-[clamp(1rem,4.6cqmin,3.2rem)] font-extrabold">{title}</p>
      <p className="text-[clamp(0.8rem,2.6cqmin,1.6rem)] text-white/65">{children}</p>
    </div>
  );
}
