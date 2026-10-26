"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ListMusic, Mic2, Search, Trash2, UserRound, Users, WifiOff } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Visualizer } from "@/components/brand/visualizer";
import { Avatar } from "@/components/party/avatar";
import { Leaderboard } from "@/components/party/leaderboard";
import { QueueCard } from "@/components/party/queue";
import { SongArt } from "@/components/party/song-art";
import { SongSearch } from "@/components/party/song-search";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, FullScreenMessage, LoadingScreen } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AVATARS } from "@/lib/domain/settings";
import type { PartySnapshot } from "@/lib/domain/snapshot";
import { api, ClientApiError, type StateResponse } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatClock, formatWait, ordinal } from "@/lib/client/format";
import { songsAhead, useGuestNotifications } from "@/lib/client/use-guest-notifications";
import { usePlaybackEstimate } from "@/lib/client/use-playback-estimate";
import { useParty } from "@/lib/client/use-party";

interface Lookup {
  partyId: string;
  name: string;
  joinCode: string;
  status: "active" | "paused" | "ended";
  endedReason: "host" | "expired" | null;
  guestCount: number;
  queueLength: number;
  nowPlaying: { title: string; performer: string | null } | null;
  viewer: "host" | "guest" | "removed" | "anonymous";
}

export function GuestApp({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<ClientApiError | null>(null);
  const [joinedState, setJoinedState] = useState<StateResponse | null>(null);

  useEffect(() => {
    api<Lookup>(`/api/parties/lookup?code=${encodeURIComponent(code)}`)
      .then(setLookup)
      .catch((e) => setLookupError(e instanceof ClientApiError ? e : new ClientApiError("unknown", "Couldn't load the party.", 0)));
  }, [code]);

  if (lookupError) {
    if (lookupError.status === 404 || lookupError.status === 400) {
      return (
        <FullScreenMessage emoji="🔍" title="We couldn't find that party" action={<Link href="/join" className={buttonClasses("primary", "lg")}>Enter a code</Link>}>
          Double-check the code on the TV. Codes are 6 letters and numbers.
        </FullScreenMessage>
      );
    }
    return <FullScreenMessage emoji="📡" title="Can't reach the party" action={<Button onClick={() => location.reload()}>Try again</Button>}>{lookupError.message}</FullScreenMessage>;
  }
  if (!lookup) return <LoadingScreen label="Finding the party…" />;
  if (lookup.status === "ended") return <EndedScreen name={lookup.name} expired={lookup.endedReason === "expired"} />;
  if (lookup.viewer === "removed") return <RemovedScreen />;
  if (lookup.viewer === "guest" || joinedState) return <JoinedApp partyId={lookup.partyId} initial={joinedState} />;
  return <JoinForm lookup={lookup} onJoined={setJoinedState} />;
}

function EndedScreen({ name, expired, snapshot }: { name: string; expired?: boolean; snapshot?: PartySnapshot }) {
  const mine = snapshot?.participants.find((p) => p.isMe);
  return (
    <FullScreenMessage emoji="🎉" title={expired ? "This party is no longer active" : "That's a wrap!"} action={<Link href="/" className={buttonClasses("secondary", "lg")}>Start your own party</Link>}>
      {expired ? `“${name}” expired after a long quiet spell. Ask the host to start a new one.` : `“${name}” has ended. Thanks for singing!`}
      {mine ? (
        <span className="mt-3 block text-text">
          You sang {mine.performanceCount} song{mine.performanceCount === 1 ? "" : "s"} tonight {mine.performanceCount ? "🌟" : "— next time!"}
        </span>
      ) : null}
    </FullScreenMessage>
  );
}

function RemovedScreen() {
  return <FullScreenMessage emoji="👋" title="You've left this party">The host removed you from this party. If that was a mistake, ask them to let you back in.</FullScreenMessage>;
}

function JoinForm({ lookup, onJoined }: { lookup: Lookup; onJoined: (s: StateResponse) => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<StateResponse>(`/api/parties/${lookup.partyId}/join`, { json: { displayName: name, avatar } });
      toast({ title: `You're in! Welcome to ${lookup.name} 🎤`, tone: "party", durationMs: 5000 });
      onJoined(res);
    } catch (err) {
      if (err instanceof ClientApiError && err.code === "already_joined") return location.reload();
      setError(err instanceof ClientApiError ? err.message : "Couldn't join. Try again.");
      setBusy(false);
    }
  };

  return (
    <main className="stage-bg-aurora min-h-dvh px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <div className="mx-auto flex max-w-md flex-col">
        <Logo className="self-center" />
        <div className="mt-10 text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-[#f5c2ff] uppercase">You&apos;re invited to</p>
          <h1 className="mt-2 font-display text-3xl leading-tight font-extrabold" data-testid="join-party-name">
            {lookup.name}
          </h1>
          <p className="mt-2 text-muted">
            {lookup.guestCount} guest{lookup.guestCount === 1 ? "" : "s"} here · {lookup.queueLength} song{lookup.queueLength === 1 ? "" : "s"} in the queue
          </p>
          {lookup.nowPlaying ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-sm">
              <Visualizer bars={3} className="h-3.5" /> {lookup.nowPlaying.performer ?? "Someone"} is singing “{lookup.nowPlaying.title}”
            </p>
          ) : null}
          {lookup.status === "paused" ? <p className="mt-3 text-sm text-warning">☕ The party is on an intermission — you can still join.</p> : null}
        </div>

        <form onSubmit={submit} className="card mt-8 p-5">
          <label htmlFor="display-name" className="font-semibold">
            Your stage name
          </label>
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            placeholder="e.g. Alex"
            required
            className="mt-2 h-14 w-full rounded-2xl border border-line-strong bg-black/30 px-4 text-lg placeholder:text-faint focus:border-magenta/60 focus:outline-none"
            data-testid="display-name-input"
          />
          <fieldset className="mt-5">
            <legend className="font-semibold">Pick an avatar</legend>
            <div className="mt-2 grid grid-cols-8 gap-1.5">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  aria-pressed={avatar === a}
                  aria-label={`Avatar ${a}`}
                  className={cn("grid aspect-square place-items-center rounded-xl text-2xl transition-all", avatar === a ? "scale-110 bg-brand shadow-[var(--shadow-glow-pink)]" : "bg-white/6 hover:bg-white/12")}
                >
                  {a}
                </button>
              ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="mt-4 text-danger" data-testid="join-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="xl" className="mt-6 w-full" loading={busy} disabled={!name.trim()} data-testid="join-submit">
            <Mic2 className="h-5 w-5" aria-hidden /> Join the party
          </Button>
          <p className="mt-3 text-center text-xs text-faint">No account needed. We only keep your stage name for this party.</p>
        </form>
        {lookup.viewer === "host" ? (
          <Link href={`/host/${lookup.partyId}`} className="mt-5 text-center text-sm text-muted underline">
            You&apos;re the host — open the dashboard
          </Link>
        ) : null}
      </div>
    </main>
  );
}

type GuestTab = "search" | "queue" | "mine";

function JoinedApp({ partyId, initial }: { partyId: string; initial: StateResponse | null }) {
  const party = useParty(partyId, { initial });
  const { snapshot, error, connection } = party;
  const [tab, setTab] = useState<GuestTab>("search");
  const [adding, setAdding] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const { toast } = useToast();
  useGuestNotifications(snapshot);

  const run = useCallback(
    async (cmd: Record<string, unknown>) => {
      try {
        await party.command(cmd);
        return true;
      } catch (e) {
        toast({ title: e instanceof ClientApiError ? e.message : "That didn't work. Try again.", tone: "error" });
        if (e instanceof ClientApiError && (e.status === 403 || e.status === 410)) void party.refresh();
        return false;
      }
    },
    [party, toast],
  );

  if (error && !snapshot) {
    if (error.code === "participant_removed") return <RemovedScreen />;
    if (error.status === 410) return <EndedScreen name="This party" expired />;
    if (error.status === 401) return <FullScreenMessage emoji="🎟️" title="Please join again" action={<Button onClick={() => location.reload()}>Join</Button>}>Your session for this party wasn&apos;t found on this device.</FullScreenMessage>;
    return <FullScreenMessage emoji="📡" title="Can't reach the party" action={<Button onClick={() => party.refresh()}>Try again</Button>}>{error.message}</FullScreenMessage>;
  }
  if (error?.code === "participant_removed") return <RemovedScreen />;
  if (!snapshot) return <LoadingScreen label="Joining…" />;
  if (snapshot.party.status === "ended") return <EndedScreen name={snapshot.party.name} expired={snapshot.party.endedReason === "expired"} snapshot={snapshot} />;
  if (snapshot.me.role !== "guest") return <LoadingScreen />;

  const me = snapshot.me;
  const s = snapshot.party.settings;
  const waiting = snapshot.mine.filter((q) => q.status === "queued" || q.status === "pending_approval").length;
  const disabledReason = !s.submissionsOpen
    ? "The host has paused song submissions for now. You can still browse."
    : waiting >= s.maxPendingPerGuest
      ? `You have ${waiting} song${waiting === 1 ? "" : "s"} waiting (the limit is ${s.maxPendingPerGuest}). Sing one first!`
      : null;
  const ahead = songsAhead(snapshot);
  const queuedSongIds = new Set([...snapshot.upcoming, ...snapshot.pending].map((q) => q.song.id));
  if (snapshot.nowPlaying) queuedSongIds.add(snapshot.nowPlaying.song.id);

  return (
    <div className="min-h-dvh bg-stage-950 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-line bg-stage-950/85 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-extrabold" data-testid="guest-party-name">
              {snapshot.party.name}
            </p>
            <p className="flex items-center gap-2 text-xs text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden /> {snapshot.participants.length} here
              {connection !== "live" && connection !== "connecting" ? (
                <span className="flex items-center gap-1 text-warning">
                  <WifiOff className="h-3.5 w-3.5" aria-hidden /> reconnecting…
                </span>
              ) : null}
              {snapshot.party.status === "paused" ? <span className="text-warning">☕ intermission</span> : null}
            </p>
          </div>
          <button type="button" onClick={() => setProfileOpen(true)} className="flex items-center gap-2 rounded-full bg-white/6 py-1 pr-3 pl-1" aria-label="Edit your profile">
            <Avatar emoji={me.avatar} size="sm" />
            <span className="max-w-24 truncate text-sm font-semibold" data-testid="guest-name">
              {me.displayName}
            </span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-4">
        <NowPlayingCard snapshot={snapshot} clockOffsetMs={party.clockOffsetMs} />
        <TurnBanner snapshot={snapshot} ahead={ahead} />

        {tab === "search" ? (
          <section aria-label="Search songs">
            <SongSearch
              partyId={partyId}
              busySongId={adding}
              queuedSongIds={queuedSongIds}
              disabledReason={disabledReason}
              actionLabel="Add to queue"
              onPick={async (ref, song) => {
                setAdding(song.id);
                const ok = await run({ type: "add_song", ref });
                setAdding(null);
                if (ok) toast({ title: s.requireApproval ? "Sent to the host for approval 🎶" : "Your song was added! 🎤", description: song.title, tone: "success" });
                return ok;
              }}
            />
          </section>
        ) : null}

        {tab === "queue" ? <QueueTab snapshot={snapshot} onVote={(item) => void run({ type: item.myVote ? "unvote" : "vote", queueItemId: item.id })} /> : null}

        {tab === "mine" ? <MySongs snapshot={snapshot} onRemove={(id) => void run({ type: "remove_own", queueItemId: id }).then((ok) => ok && toast({ title: "Removed from the queue", tone: "info" }))} onSearch={() => setTab("search")} /> : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-stage-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label="Guest sections">
        <div className="mx-auto grid max-w-xl grid-cols-3">
          {(
            [
              ["search", "Search", Search],
              ["queue", `Queue${snapshot.upcoming.length ? ` · ${snapshot.upcoming.length}` : ""}`, ListMusic],
              ["mine", `My Songs${waiting ? ` · ${waiting}` : ""}`, UserRound],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold", tab === id ? "text-text" : "text-faint")}
              data-testid={`guest-tab-${id}`}
            >
              <Icon className={cn("h-6 w-6", tab === id && "text-magenta")} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} me={me} onSave={async (patch) => (await run({ type: "update_profile", ...patch })) && setProfileOpen(false)} />
    </div>
  );
}

function NowPlayingCard({ snapshot, clockOffsetMs }: { snapshot: PartySnapshot; clockOffsetMs: number }) {
  const item = snapshot.nowPlaying;
  const { position, duration } = usePlaybackEstimate(snapshot.playback, clockOffsetMs, 1000);
  const total = duration ?? item?.song.durationSeconds ?? null;
  if (!item) {
    const next = snapshot.upcoming[0];
    return (
      <div className="card flex items-center gap-3 p-4" data-testid="guest-now-playing">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6 text-2xl" aria-hidden>
          🎤
        </div>
        <div>
          <p className="font-semibold">{next ? "The stage is warming up" : "Nobody's singing yet"}</p>
          <p className="text-sm text-muted">{next ? `${next.requestedBy.displayName} is first up.` : "Add a song and be the first to the mic!"}</p>
        </div>
      </div>
    );
  }
  const label = snapshot.playback.status === "intro" ? "Coming up now" : snapshot.playback.status === "paused" ? "Paused" : snapshot.playback.status === "error" ? "Having trouble" : "Now singing";
  return (
    <div className={cn("card overflow-hidden p-0", item.isMine && "border-magenta/50 shadow-[var(--shadow-glow)]")} data-testid="guest-now-playing">
      <div className="flex items-center gap-3 p-3">
        <SongArt song={item.song} className="w-20" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-bold tracking-[0.18em] text-[#f5c2ff] uppercase">
            <Visualizer bars={3} playing={snapshot.playback.status === "playing"} className="h-3" /> {label}
          </p>
          <p className="truncate font-display font-bold">
            {item.requestedBy.avatar} {item.isMine ? "You!" : item.requestedBy.displayName}
          </p>
          <p className="truncate text-sm text-muted">{item.song.title}</p>
        </div>
      </div>
      <div className="h-1 bg-white/10">
        <div className="h-full bg-brand transition-[width] duration-1000 ease-linear" style={{ width: total ? `${Math.min(100, (position / total) * 100)}%` : "0%" }} />
      </div>
      <p className="sr-only">
        {formatClock(position)} of {formatClock(total)}
      </p>
    </div>
  );
}

function TurnBanner({ snapshot, ahead }: { snapshot: PartySnapshot; ahead: number | null }) {
  const index = snapshot.upcoming.findIndex((q) => q.isMine);
  const mine = index >= 0 ? snapshot.upcoming[index] : null;
  const upNext = index === 0;
  const text = snapshot.nowPlaying?.isMine
    ? "It's your turn — grab the mic! 🎤"
    : upNext
      ? "You're up next! Get ready 🎤"
      : mine && ahead !== null
        ? `You're ${ordinal(index + 1)} in line · ${ahead} song${ahead === 1 ? "" : "s"} ahead · ${formatWait(mine.estimatedStartInSeconds) ?? ""}`
        : null;
  return (
    <AnimatePresence>
      {text ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={cn("rounded-2xl px-4 py-3 font-semibold", upNext || snapshot.nowPlaying?.isMine ? "bg-brand text-white shadow-[var(--shadow-glow-pink)]" : "border border-line bg-white/5")}
          role="status"
          data-testid="turn-banner"
        >
          {text}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function QueueTab({ snapshot, onVote }: { snapshot: PartySnapshot; onVote: Parameters<typeof QueueCard>[0]["onVote"] }) {
  const s = snapshot.party.settings;
  return (
    <section className="flex flex-col gap-5" aria-label="Queue">
      {s.votingMode !== "off" ? (
        <p className="text-sm text-muted">
          {s.votingMode === "reorder" ? "❤️ Vote for songs you want to hear — the most-voted move up (the next song stays put)." : s.votingMode === "requests" ? "❤️ Vote on requests to help the host pick." : "❤️ Upvote your favourites. The host sets the order."}
        </p>
      ) : null}
      <div>
        <h2 className="mb-2 text-xs font-bold tracking-[0.18em] text-faint uppercase">Up next</h2>
        {snapshot.upcoming.length ? (
          <ol className="flex flex-col gap-2" data-testid="guest-queue">
            {snapshot.upcoming.map((item, i) => (
              <li key={item.id}>
                <QueueCard item={item} index={i + 1} votingMode={s.votingMode} onVote={onVote} highlight={item.isMine} compact />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon="🎶" title="The queue is empty">
            Be the first — search for a song and add it!
          </EmptyState>
        )}
      </div>
      {s.votingMode === "requests" && snapshot.pending.length ? (
        <div>
          <h2 className="mb-2 text-xs font-bold tracking-[0.18em] text-faint uppercase">Requests awaiting approval</h2>
          <ul className="flex flex-col gap-2">
            {snapshot.pending.map((item) => (
              <li key={item.id}>
                <QueueCard item={item} votingMode={s.votingMode} onVote={onVote} highlight={item.isMine} showStatus compact />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h2 className="mb-2 text-xs font-bold tracking-[0.18em] text-faint uppercase">Party stars</h2>
        <Leaderboard data={snapshot.leaderboard} participants={snapshot.participants} />
      </div>
    </section>
  );
}

function MySongs({ snapshot, onRemove, onSearch }: { snapshot: PartySnapshot; onRemove: (id: string) => void; onSearch: () => void }) {
  const allow = snapshot.party.settings.allowGuestRemoval;
  const me = snapshot.participants.find((p) => p.isMe);
  if (!snapshot.mine.length) {
    return (
      <EmptyState icon="🎤" title="No songs yet" action={<Button onClick={onSearch}>Find a song</Button>}>
        Songs you add show up here with your place in line.
      </EmptyState>
    );
  }
  return (
    <section aria-label="My songs" className="flex flex-col gap-3">
      {me ? (
        <p className="text-sm text-muted">
          {me.submittedCount} added · {me.performanceCount} performed
        </p>
      ) : null}
      <ul className="flex flex-col gap-2" data-testid="my-songs">
        {snapshot.mine.map((item) => {
          const pos = snapshot.upcoming.findIndex((q) => q.id === item.id);
          const removable = allow && (item.status === "queued" || item.status === "pending_approval");
          return (
            <li key={item.id}>
              <QueueCard
                item={item}
                index={pos >= 0 ? pos + 1 : undefined}
                showStatus
                compact
                highlight={item.status === "playing"}
                actions={
                  removable ? (
                    <button type="button" onClick={() => onRemove(item.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-faint hover:bg-danger/15 hover:text-danger" aria-label={`Remove ${item.song.title}`} data-testid="remove-own">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProfileDialog({ open, onClose, me, onSave }: { open: boolean; onClose: () => void; me: { displayName: string; avatar: string }; onSave: (p: { displayName: string; avatar: string }) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Your profile" size="sm">
      <ProfileForm me={me} onSave={onSave} />
    </Dialog>
  );
}

/** Mounted fresh each time the dialog opens, so it starts from the current profile. */
function ProfileForm({ me, onSave }: { me: { displayName: string; avatar: string }; onSave: (p: { displayName: string; avatar: string }) => void }) {
  const [name, setName] = useState(me.displayName);
  const [avatar, setAvatar] = useState(me.avatar);
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ displayName: name, avatar });
        }}
        className="flex flex-col gap-4"
      >
        <label className="font-semibold" htmlFor="profile-name">
          Stage name
        </label>
        <input id="profile-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} className="h-12 rounded-2xl border border-line-strong bg-black/30 px-4 focus:border-magenta/60 focus:outline-none" />
        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => (
            <button key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={`Avatar ${a}`} className={cn("grid aspect-square place-items-center rounded-xl text-xl", avatar === a ? "bg-brand" : "bg-white/6")}>
              {a}
            </button>
          ))}
        </div>
        <Button type="submit">Save</Button>
      </form>
    </>
  );
}
