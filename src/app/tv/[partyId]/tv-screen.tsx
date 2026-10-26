"use client";

import { Maximize, MonitorPlay } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Stage, type StageActions } from "@/components/stage/stage";
import { Button } from "@/components/ui/button";
import { FullScreenMessage, LoadingScreen } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ClientApiError } from "@/lib/client/api";
import { useParty } from "@/lib/client/use-party";
import { useStageOutput } from "@/lib/client/use-stage-output";
import { useSoundPreference } from "@/lib/client/sounds";

/**
 * Dedicated TV window: full-screen stage, no management UI. Opened from the
 * host's browser (it needs the host cookie). One click is required to start,
 * which also unlocks autoplay with sound for the rest of the night.
 */
export function TvScreen({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = use(params);
  const party = useParty(partyId);
  const { snapshot, meta, error, clockOffsetMs } = party;
  const [armed, setArmed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { soundOn } = useSoundPreference();
  const isHost = snapshot?.me.role === "host";

  const output = useStageOutput({ snapshot: isHost ? snapshot : null, clockOffsetMs, command: party.command, enabled: armed && isHost, autoClaim: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") void root.current?.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error && !snapshot) {
    if (error.status === 404) return <FullScreenMessage emoji="🔍" title="Party not found" />;
    return <FullScreenMessage emoji="🔒" title="Open the TV screen from the host's browser">The TV screen plays the videos, so it needs host access. Use “TV window” on the host dashboard.</FullScreenMessage>;
  }
  if (!snapshot) return <LoadingScreen label="Tuning the TV…" />;
  if (!isHost) return <FullScreenMessage emoji="🔒" title="Open the TV screen from the host's browser">Use “TV window” on the host dashboard, or the host remote link.</FullScreenMessage>;

  const run = async (cmd: Record<string, unknown>) => {
    try {
      await party.command(cmd);
    } catch (e) {
      toast({ title: e instanceof ClientApiError ? e.message : "That didn't work.", tone: "error" });
    }
  };
  const actions: StageActions = {
    play: () => void run({ type: "play" }),
    start: () => void run({ type: "start" }),
    skip: () => void run({ type: "skip" }),
    chooseAnother: () => toast({ title: "Pick another version from the host dashboard", tone: "info" }),
  };

  return (
    <div ref={root} className="h-dvh w-screen overflow-hidden bg-black" data-testid="tv-screen">
      <Stage snapshot={snapshot} meta={meta} clockOffsetMs={clockOffsetMs} output={armed ? output : null} actions={actions} variant="tv" soundOn={soundOn} />
      {!armed ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-stage-950/90 p-6 text-center backdrop-blur-xl">
          <Logo />
          <MonitorPlay className="h-16 w-16 text-magenta" aria-hidden />
          <h1 className="font-display text-3xl font-extrabold sm:text-5xl">Ready for the big screen?</h1>
          <p className="max-w-lg text-muted">This window will play the videos. The host dashboard will switch to remote control. Browsers need one click before videos can play with sound.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              size="xl"
              onClick={async () => {
                setArmed(true);
                await output.claim();
                await root.current?.requestFullscreen?.().catch(() => {});
              }}
              data-testid="arm-tv"
            >
              <Maximize className="h-5 w-5" aria-hidden /> Start the TV screen
            </Button>
          </div>
          <p className="text-sm text-faint">Tip: press F for full screen.</p>
        </div>
      ) : null}
    </div>
  );
}
