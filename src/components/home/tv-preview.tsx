"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Visualizer } from "@/components/brand/visualizer";
import { QrCode } from "@/components/party/qr-code";

const LINES = [
  "Lights are low and the city's awake",
  "Every window is a stage we can take",
  "Turn it up till the ceiling shakes",
  "This is all the noise that we make",
  "Neon heartbeat, beating in time",
];

/** Decorative mock of the TV screen for the homepage (not a live player). */
export function TvPreview({ joinUrl }: { joinUrl: string }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % LINES.length), 2600);
    const p = setInterval(() => setProgress((n) => (n + 0.4) % 100), 100);
    return () => {
      clearInterval(id);
      clearInterval(p);
    };
  }, [reduce]);

  return (
    <div className="relative mx-auto w-full max-w-2xl animate-float" aria-label="Preview of the TV karaoke screen" role="img">
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-brand opacity-30 blur-3xl" aria-hidden />
      <div className="rounded-[1.8rem] border border-white/15 bg-black p-2.5 shadow-2xl">
        <div className="lyrics-stage stage-bg-aurora relative aspect-video overflow-hidden rounded-[1.3rem]">
          <div className="absolute top-[4%] left-[4%] rounded-full bg-black/40 px-[2cqmin] py-[0.8cqmin] text-[2.4cqmin] font-bold tracking-widest text-white/80 uppercase">Friday Night Karaoke</div>
          <div className="absolute inset-x-0 top-[14%] bottom-[26%] flex flex-col items-center justify-center px-[6%] text-center">
            <p className="lyric-line text-[3.6cqmin] text-white/35">{LINES[(i + LINES.length - 1) % LINES.length]}</p>
            <div className="relative my-[2.4cqmin] h-[9cqmin] w-full">
              <AnimatePresence mode="popLayout">
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.35 }}
                  className="lyric-line absolute inset-x-0 text-[6.4cqmin] text-white [text-shadow:0_4px_30px_rgba(217,70,239,0.6)]"
                >
                  {LINES[i]}
                </motion.p>
              </AnimatePresence>
            </div>
            <p className="lyric-line text-[4cqmin] text-[#c9b8ff]/70">{LINES[(i + 1) % LINES.length]}</p>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-[2.4cqmin] bg-black/45 px-[3cqmin] py-[2cqmin] backdrop-blur">
            <span className="grid h-[9cqmin] w-[9cqmin] place-items-center rounded-full bg-stage-700 text-[5cqmin]">🦄</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-[1cqmin] text-[2.2cqmin] font-bold tracking-[0.2em] text-[#f5c2ff] uppercase">
                <Visualizer bars={4} className="h-[2.2cqmin]" /> Now singing
              </p>
              <p className="font-display text-[4.4cqmin] leading-tight font-extrabold">Priya</p>
              <div className="mt-[1cqmin] h-[1cqmin] overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-brand" style={{ width: `${reduce ? 42 : progress}%` }} />
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-[2cqmin] font-bold tracking-[0.2em] text-white/55 uppercase">Next up</p>
              <p className="font-display text-[3cqmin] font-bold">🎸 Alex</p>
            </div>
            <QrCode value={joinUrl} className="h-[13cqmin] w-[13cqmin]" label="Example join QR code" />
          </div>
        </div>
      </div>
      <div className="mx-auto h-4 w-1/3 rounded-b-2xl bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
    </div>
  );
}
