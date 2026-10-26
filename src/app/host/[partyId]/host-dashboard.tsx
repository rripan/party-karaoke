"use client";

import {
  Bell,
  BellOff,
  Coffee,
  ExternalLink,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  Pencil,
  Play,
  Power,
  Settings2,
  SkipForward,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { GuestList } from "@/components/party/guest-list";
import { HistoryList } from "@/components/party/history-list";
import { HostRemoteButton, InviteCard } from "@/components/party/invite";
import { Leaderboard } from "@/components/party/leaderboard";
import { PlaybackControls, type PlaybackHandlers } from "@/components/party/playback-controls";
import { ApprovalList, HostQueue } from "@/components/party/queue";
import { DisplaySettingsForm, PartyRulesForm } from "@/components/party/settings-form";
import { SongSearch } from "@/components/party/song-search";
import { Stage, type StageActions } from "@/components/stage/stage";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip, Segmented } from "@/components/ui/controls";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState, FullScreenMessage, LoadingScreen } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { SettingsPatch } from "@/lib/domain/settings";
import type { PartySnapshot, QueueItemView } from "@/lib/domain/snapshot";
import { api, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { usePlaybackEstimate } from "@/lib/client/use-playback-estimate";
import { useNow } from "@/lib/client/use-now";
import { useParty } from "@/lib/client/use-party";
import { OUTPUT_STALE_MS, useStageOutput } from "@/lib/client/use-stage-output";
import { useSoundPreference } from "@/lib/client/sounds";

type Tab = "queue" | "requests" | "guests" | "history" | "stars";

export function HostDashboard({ params }: { params: Promise<{ partyId: string }> }) {
  const { partyId } = use(params);
  // A host remote link carries its key in the URL fragment: trade it for a cookie.
  const [hostKey] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.hash.slice(1)).get("key")));
  const [claimDone, setClaimed] = useState(false);
  const claimed = !hostKey || claimDone;
  const { toast } = useToast();

  useEffect(() => {
    const key = hostKey;
    if (!key) return;
    history.replaceState(null, "", window.location.pathname);
    api(`/api/parties/${partyId}/claim`, { json: { key } })
      .then(() => toast({ title: "Host controls unlocked on this device", tone: "success" }))
      .catch((e) => toast({ title: "Host link didn't work", description: (e as Error).message, tone: "error" }))
      .finally(() => setClaimed(true));
  }, [partyId, toast, hostKey]);

  const party = useParty(claimed ? partyId : null);
  const { snapshot, error } = party;

  if (error && !snapshot) {
    if (error.status === 404) return <FullScreenMessage emoji="🔍" title="Party not found">That party doesn&apos;t exist. It may have been cleaned up after it ended.</FullScreenMessage>;
    if (error.status === 401 || error.status === 403) return <NotHost />;
    return (
      <FullScreenMessage emoji="📡" title="Can't reach the party" action={<Button onClick={() => party.refresh()}>Try again</Button>}>
        {error.message}
      </FullScreenMessage>
    );
  }
  if (!snapshot) return <LoadingScreen label="Setting up the stage…" />;
  if (snapshot.me.role !== "host") return <NotHost joinCode={snapshot.party.joinCode} />;
  return <Dashboard partyId={partyId} party={party} snapshot={snapshot} />;
}

function NotHost({ joinCode }: { joinCode?: string }) {
  return (
    <FullScreenMessage
      emoji="🔒"
      title="Host controls are locked"
      action={
        joinCode ? (
          <Link href={`/p/${joinCode}`} className={buttonClasses("primary", "lg")}>
            Open the guest view
          </Link>
        ) : undefined
      }
    >
      Only the browser that started this party (or a host remote link) can use these controls. Guests can join with the QR code.
    </FullScreenMessage>
  );
}

function Dashboard({ partyId, party, snapshot }: { partyId: string; party: ReturnType<typeof useParty>; snapshot: PartySnapshot }) {
  const { toast } = useToast();
  const { meta, clockOffsetMs, connection } = party;
  const [tab, setTab] = useState<Tab>("queue");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "end" | "clear">(null);
  const [replaceFor, setReplaceFor] = useState<QueueItemView | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [tvMode, setTvMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const stageWrap = useRef<HTMLDivElement>(null);
  const { soundOn, toggleSound } = useSoundPreference();
  const [wide, setWide] = useState(true);
  const now = useNow(5000);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const run = useCallback(
    async (cmd: Record<string, unknown>, success?: string) => {
      try {
        await party.command(cmd);
        if (success) toast({ title: success, tone: "success" });
        return true;
      } catch (e) {
        toast({ title: e instanceof ClientApiError ? e.message : "That didn't work.", tone: "error" });
        void party.refresh();
        return false;
      }
    },
    [party, toast],
  );

  const output = useStageOutput({ snapshot, clockOffsetMs, command: party.command, enabled: true, autoClaim: wide });
  const estimate = usePlaybackEstimate(snapshot.playback, clockOffsetMs, 1000);
  const [liveTime, setLiveTime] = useState({ position: 0, duration: null as number | null });
  useEffect(() => {
    if (!output.isOutput || !output.handle) return;
    const h = output.handle;
    const id = setInterval(() => setLiveTime({ position: h.getCurrentTime(), duration: h.getDuration() }), 500);
    return () => clearInterval(id);
  }, [output.isOutput, output.handle]);
  const position = output.isOutput ? liveTime.position : estimate.position;
  const duration = (output.isOutput ? liveTime.duration : null) ?? snapshot.playback.durationSeconds ?? snapshot.nowPlaying?.song.durationSeconds ?? null;

  const handlers: PlaybackHandlers = useMemo(
    () => ({
      // Calling the local player inside the click keeps the browser's user-gesture for autoplay.
      play: () => {
        if (output.isOutput) output.playNow();
        void run({ type: "play" });
      },
      pause: () => {
        if (output.isOutput) output.handle?.pause();
        void run({ type: "pause" });
      },
      restart: () => {
        if (output.isOutput) {
          output.handle?.seek(0);
          output.playNow();
        }
        void run({ type: "restart" });
      },
      seek: (s) => {
        if (output.isOutput) output.handle?.seek(s);
        void run({ type: "seek", positionSeconds: Math.max(0, s) });
      },
      skip: () => void run({ type: "skip" }),
      finish: () => void run({ type: "finish" }, "Marked as finished 🎉"),
      start: () => void run({ type: "start" }),
      reportUnavailable: () => void run({ type: "report_unavailable" }, "Reported as unavailable and skipped"),
    }),
    [output, run],
  );

  const stageActions: StageActions = {
    play: handlers.play,
    start: handlers.start,
    skip: handlers.skip,
    chooseAnother: (item) => setReplaceFor(item),
  };

  // TV mode = this page's stage in full screen. The same Stage element is reused, so the video never reloads.
  const enterTv = async () => {
    setTvMode(true);
    try {
      await stageWrap.current?.requestFullscreen?.();
    } catch {
      /* fullscreen may be refused; the fixed overlay still works */
    }
  };
  const exitTv = async () => {
    setTvMode(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  };
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setTvMode(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], dialog, [role=slider]")) return;
      if (e.key === " " && !t.closest("button")) {
        e.preventDefault();
        if (snapshot.playback.status === "playing") handlers.pause();
        else if (snapshot.nowPlaying) handlers.play();
      } else if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) {
        void (tvMode ? exitTv() : enterTv());
      } else if (e.key === "Escape" && tvMode) {
        void exitTv();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useHostNotifications(snapshot);

  const changeSettings = (patch: SettingsPatch) => void run({ type: "update_settings", patch });
  const s = snapshot.party.settings;
  const pendingCount = snapshot.pending.length;
  const ended = snapshot.party.status === "ended";
  const outputElsewhere =
    !output.isOutput &&
    !!snapshot.playback.outputClientId &&
    !!snapshot.playback.outputLastSeenAt &&
    now + clockOffsetMs - Date.parse(snapshot.playback.outputLastSeenAt) < OUTPUT_STALE_MS;
  const queuedSongIds = new Set(snapshot.upcoming.map((q) => q.song.id));

  return (
    <div className="min-h-dvh bg-stage-950">
      <header className="sticky top-0 z-40 border-b border-line bg-stage-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Party Karaoke home" className="shrink-0">
            <Logo compact />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {editingName ? (
              <PartyNameEditor initial={snapshot.party.name} onDone={async (name) => (await run({ type: "rename", name })) && setEditingName(false)} onCancel={() => setEditingName(false)} />
            ) : (
              <button type="button" onClick={() => !ended && setEditingName(true)} className="group flex min-w-0 items-center gap-2 text-left" aria-label="Rename party">
                <h1 className="truncate font-display text-lg font-extrabold sm:text-xl" data-testid="party-name">
                  {snapshot.party.name}
                </h1>
                {!ended ? <Pencil className="h-4 w-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden /> : null}
              </button>
            )}
            <StatusPill status={snapshot.party.status} submissionsOpen={s.submissionsOpen} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm text-muted" title={`${snapshot.participants.length} joined, ${snapshot.onlineCount} online`}>
              <Users className="h-4 w-4" aria-hidden /> <span className="font-semibold text-text" data-testid="guest-count">{snapshot.participants.length}</span>
            </span>
            <span className={cn("flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold", connection === "live" ? "text-success" : "text-warning")} role="status" aria-live="polite">
              {connection === "live" ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
              <span className="hidden sm:inline">{connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Reconnecting…"}</span>
            </span>
            <Button size="icon" variant="ghost" onClick={toggleSound} aria-label={soundOn ? "Mute sound effects" : "Turn on sound effects"} title={soundOn ? "Sound effects on" : "Sound effects muted"}>
              {soundOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setSettingsOpen(true)} aria-label="Party settings" data-testid="open-settings">
              <Settings2 className="h-5 w-5" />
            </Button>
            {!ended ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => window.open(`/tv/${partyId}`, `karaoke-tv-${partyId}`, "popup,width=1280,height=720")}>
                  <ExternalLink className="h-4 w-4" aria-hidden /> TV window
                </Button>
                <Button size="sm" onClick={enterTv} data-testid="enter-tv-mode">
                  <Maximize className="h-4 w-4" aria-hidden /> TV mode
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {ended ? (
        <div className="mx-auto max-w-[1800px] px-4 pt-4 sm:px-6">
          <div className="rounded-2xl border border-line bg-white/5 px-4 py-3 text-muted" role="status">
            This party has ended. Guests now see a goodbye screen. History and stats are kept below until cleanup.{" "}
            <Link href="/create" className="font-semibold text-text underline">
              Start a new party
            </Link>
          </div>
        </div>
      ) : null}

      <main className="mx-auto grid max-w-[1800px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="Stage">
          <div
            ref={stageWrap}
            className={cn(tvMode ? "fixed inset-0 z-50 bg-black" : "relative aspect-video w-full")}
            data-testid="stage-wrap"
            data-tv-mode={tvMode}
          >
            <Stage snapshot={snapshot} meta={meta} clockOffsetMs={clockOffsetMs} output={output} actions={stageActions} variant={tvMode ? "tv" : "embedded"} soundOn={soundOn} />
            {tvMode ? <TvDock snapshot={snapshot} handlers={handlers} onExit={exitTv} /> : null}
          </div>

          {outputElsewhere ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-spark/30 bg-spark/10 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-spark">
                <MonitorPlay className="h-5 w-5" aria-hidden /> The video is playing on another screen (TV window or another device). These controls drive it.
              </span>
              <Button size="sm" variant="secondary" onClick={() => void output.claim()}>
                Play on this screen instead
              </Button>
            </div>
          ) : !output.isOutput && !ended ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm text-muted">
              No screen is playing the stage right now.
              <Button size="sm" onClick={() => void output.claim()}>
                Use this screen as the stage
              </Button>
            </div>
          ) : null}

          {!ended ? <PlaybackControls snapshot={snapshot} position={position} duration={duration} handlers={handlers} /> : null}

          {!ended ? (
            <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-muted">Layout</span>
                <Segmented
                  size="sm"
                  label="Stage layout"
                  value={s.display.layout}
                  onChange={(v) => changeSettings({ display: { layout: v } })}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "video", label: "Video" },
                    { value: "split", label: "Split" },
                    { value: "lyrics", label: "Lyrics" },
                  ]}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-muted">Lyrics size</span>
                <Segmented
                  size="sm"
                  label="Lyrics text size"
                  value={s.display.textSize}
                  onChange={(v) => changeSettings({ display: { textSize: v } })}
                  options={[
                    { value: "m", label: "M" },
                    { value: "l", label: "L" },
                    { value: "xl", label: "XL" },
                    { value: "xxl", label: "XXL" },
                  ]}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
                More display options
              </Button>
            </div>
          ) : null}

          <ModeNotices meta={meta} />
        </section>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Party management">
          {meta && !ended ? <InviteCard joinUrl={meta.joinUrl} joinCode={snapshot.party.joinCode} partyName={snapshot.party.name} guestCount={snapshot.participants.length} notice={meta.originNotice} /> : null}

          {!ended ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={s.submissionsOpen ? "secondary" : "primary"} onClick={() => changeSettings({ submissionsOpen: !s.submissionsOpen })} data-testid="toggle-submissions">
                {s.submissionsOpen ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {s.submissionsOpen ? "Pause submissions" : "Resume submissions"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void run({ type: snapshot.party.status === "paused" ? "resume_party" : "pause_party" })} data-testid="toggle-party-pause">
                <Coffee className="h-4 w-4" aria-hidden /> {snapshot.party.status === "paused" ? "End intermission" : "Intermission"}
              </Button>
              <HostRemoteButton partyId={partyId} />
            </div>
          ) : null}

          <div className="card flex min-h-[28rem] flex-col overflow-hidden">
            <div role="tablist" aria-label="Party panels" className="flex gap-1 overflow-x-auto border-b border-line p-2 scrollbar-thin">
              {(
                [
                  ["queue", `Queue (${snapshot.upcoming.length})`],
                  ["requests", `Requests${pendingCount ? ` (${pendingCount})` : ""}`],
                  ["guests", `Guests (${snapshot.participants.length})`],
                  ["history", "History"],
                  ["stars", "Stars"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn("relative shrink-0 rounded-xl px-3 py-2 text-sm font-semibold", tab === id ? "bg-white/12 text-text" : "text-muted hover:text-text")}
                  data-testid={`tab-${id}`}
                >
                  {label}
                  {id === "requests" && pendingCount ? <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-pink" aria-hidden /> : null}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin" role="tabpanel">
              {tab === "queue" ? (
                snapshot.upcoming.length ? (
                  <div className="flex flex-col gap-3">
                    <HostQueue
                      items={snapshot.upcoming}
                      votingMode={s.votingMode}
                      stageIdle={!snapshot.nowPlaying}
                      onReorder={(orderedIds, movedId) => void run({ type: "reorder", orderedIds, movedId })}
                      onTop={(i) => void run({ type: "move_to_top", queueItemId: i.id })}
                      onRemove={(i) => void run({ type: "remove_item", queueItemId: i.id }, "Removed from the queue")}
                      onPlayNow={(i) => void run({ type: "start", queueItemId: i.id })}
                      onUnpin={(i) => void run({ type: "unpin", queueItemId: i.id })}
                    />
                    <Button size="sm" variant="danger" className="self-start" onClick={() => setConfirm("clear")}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Clear queue
                    </Button>
                  </div>
                ) : (
                  <EmptyState icon="🎶" title="The queue is empty">
                    {s.submissionsOpen ? "Songs guests add show up here instantly." : "Submissions are paused. Resume them to let guests add songs."}
                  </EmptyState>
                )
              ) : null}
              {tab === "requests" ? (
                pendingCount ? (
                  <ApprovalList items={snapshot.pending} votingMode={s.votingMode} onApprove={(i) => void run({ type: "approve", queueItemId: i.id })} onReject={(i) => void run({ type: "reject", queueItemId: i.id })} />
                ) : (
                  <EmptyState icon="✅" title="No requests waiting">
                    {s.requireApproval ? "New songs will wait here for your approval." : "Turn on “Require host approval” in settings to review songs first."}
                  </EmptyState>
                )
              ) : null}
              {tab === "guests" ? <GuestList participants={snapshot.participants} onRemove={ended ? undefined : (p) => void run({ type: "remove_participant", participantId: p.id }, `${p.displayName} was removed`)} /> : null}
              {tab === "history" ? <HistoryList history={snapshot.history} exportHref={`/api/parties/${partyId}/export`} onReplay={ended ? undefined : (h) => void run({ type: "replay", historyId: h.id }, "Added back to the queue")} /> : null}
              {tab === "stars" ? <Leaderboard data={snapshot.leaderboard} participants={snapshot.participants} /> : null}
            </div>
          </div>

          {!ended ? (
            <Button variant="danger" onClick={() => setConfirm("end")} data-testid="end-party">
              <Power className="h-4 w-4" aria-hidden /> End party
            </Button>
          ) : null}
        </aside>
      </main>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Party settings" size="lg">
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <h3 className="mb-1 text-xs font-bold tracking-[0.18em] text-faint uppercase">House rules</h3>
            <PartyRulesForm settings={s} onChange={changeSettings} />
          </section>
          <section>
            <h3 className="mb-1 text-xs font-bold tracking-[0.18em] text-faint uppercase">TV display</h3>
            <DisplaySettingsForm settings={s} onChange={changeSettings} />
          </section>
        </div>
      </Dialog>

      <Dialog open={!!replaceFor} onClose={() => setReplaceFor(null)} title="Choose another version" description="Pick a different video for this singer. Their spot in line stays the same." size="lg">
        {replaceFor ? (
          <SongSearch
            partyId={partyId}
            initialQuery={replaceFor.song.title.replace(/\(.*?\)|\[.*?\]/g, "").trim()}
            actionLabel="Use this version"
            busySongId={replacing}
            queuedSongIds={queuedSongIds}
            onPick={async (ref, song) => {
              setReplacing(song.id);
              const ok = await run({ type: "replace_video", queueItemId: replaceFor.id, ref }, "Switched to the new version");
              setReplacing(null);
              if (ok) setReplaceFor(null);
              return ok;
            }}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm === "end"}
        onClose={() => setConfirm(null)}
        title="End the party?"
        description="Playback stops, guests see a goodbye screen and nobody can join or add songs. History is kept for export."
        confirmLabel="End party"
        danger
        onConfirm={async () => {
          setConfirm(null);
          await exitTv();
          await run({ type: "end_party" }, "Party ended — thanks for singing! 🎉");
        }}
      />
      <ConfirmDialog
        open={confirm === "clear"}
        onClose={() => setConfirm(null)}
        title="Clear the whole queue?"
        description={`This removes ${snapshot.upcoming.length + snapshot.pending.length} waiting song(s). The song on stage keeps playing.`}
        confirmLabel="Clear queue"
        danger
        onConfirm={async () => {
          setConfirm(null);
          await run({ type: "clear_queue" }, "Queue cleared");
        }}
      />
    </div>
  );
}

function PartyNameEditor({ initial, onDone, onCancel }: { initial: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value);
      }}
    >
      <label htmlFor="rename" className="sr-only">
        Party name
      </label>
      <input id="rename" autoFocus value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-black/30 px-3 font-display font-bold focus:border-magenta/60 focus:outline-none" data-testid="rename-input" />
      <Button size="sm" type="submit">
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function StatusPill({ status, submissionsOpen }: { status: PartySnapshot["party"]["status"]; submissionsOpen: boolean }) {
  if (status === "ended") return <Chip>Ended</Chip>;
  if (status === "paused") return <Chip tone="warning">Intermission</Chip>;
  return (
    <span className="flex items-center gap-1.5">
      <Chip tone="success">
        <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-success" aria-hidden /> Live
      </Chip>
      {!submissionsOpen ? <Chip tone="warning">Submissions paused</Chip> : null}
    </span>
  );
}

function TvDock({ snapshot, handlers, onExit }: { snapshot: PartySnapshot; handlers: PlaybackHandlers; onExit: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setVisible(false), 3000);
    const show = () => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 3000);
    };
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    window.addEventListener("touchstart", show);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
      window.removeEventListener("touchstart", show);
    };
  }, []);
  const playing = snapshot.playback.status === "playing";
  return (
    <div
      className={cn("absolute top-3 right-3 z-40 flex items-center gap-1 rounded-2xl border border-white/15 bg-black/70 p-1.5 backdrop-blur transition-opacity", visible ? "opacity-100" : "pointer-events-none opacity-0")}
      onFocus={() => setVisible(true)}
    >
      {snapshot.nowPlaying ? (
        <Button size="icon" variant="ghost" onClick={playing ? handlers.pause : handlers.play} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
      ) : null}
      <Button size="icon" variant="ghost" onClick={handlers.skip} aria-label="Skip song">
        <SkipForward className="h-5 w-5" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onExit} aria-label="Exit TV mode" data-testid="exit-tv-mode">
        <Minimize className="h-5 w-5" />
      </Button>
    </div>
  );
}

function ModeNotices({ meta }: { meta: ReturnType<typeof useParty>["meta"] }) {
  if (!meta) return null;
  const notes: { tone: "warning" | "info"; text: string }[] = [];
  if (meta.search === "demo") notes.push({ tone: "warning", text: "Demo mode: guests search a bundled sample catalog (labelled “Sample”). Add YOUTUBE_API_KEY for live YouTube search. Pasted YouTube links still work if this server can reach YouTube." });
  if (!meta.externalLyrics) notes.push({ tone: "info", text: "No licensed lyrics provider is configured, so separate synced lyrics are only available for the sample tracks. Karaoke videos still show their own on-screen lyrics." });
  if (meta.storage === "memory") notes.push({ tone: "info", text: "Parties are stored on this server (local mode). Phones on the same network can join; set DATABASE_URL for a shared Postgres database." });
  if (meta.storageWarning) notes.push({ tone: "warning", text: meta.storageWarning });
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-2 text-sm" data-testid="mode-notices">
      {notes.map((n) => (
        <li key={n.text} className={cn("rounded-2xl border px-4 py-2.5", n.tone === "warning" ? "border-warning/25 bg-warning/8 text-[#fde68a]" : "border-line bg-white/4 text-muted")}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}

/** Light-touch host toasts: new guests and new requests. */
function useHostNotifications(snapshot: PartySnapshot) {
  const { toast } = useToast();
  const seen = useRef<{ people: Set<string>; pending: Set<string> } | null>(null);
  useEffect(() => {
    const people = new Set(snapshot.participants.map((p) => p.id));
    const pending = new Set(snapshot.pending.map((p) => p.id));
    if (seen.current) {
      const newPeople = snapshot.participants.filter((p) => !seen.current!.people.has(p.id));
      if (newPeople.length === 1) toast({ title: `${newPeople[0].avatar} ${newPeople[0].displayName} joined the party`, tone: "party" });
      else if (newPeople.length > 1) toast({ title: `${newPeople.length} guests joined`, tone: "party" });
      const newPending = snapshot.pending.filter((p) => !seen.current!.pending.has(p.id));
      if (newPending.length) toast({ title: `New song request${newPending.length > 1 ? "s" : ""} waiting for approval`, tone: "info", key: "pending" });
    }
    seen.current = { people, pending };
  }, [snapshot.participants, snapshot.pending, toast]);
}
