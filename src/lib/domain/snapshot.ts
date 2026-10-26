/**
 * Builds the role-filtered view of a party that is sent to clients.
 * Secrets (token hashes, output client ids for guests) never leave the server.
 */
import { currentItem, estimatePosition, pendingItems, upcomingItems, voteCounts } from "./party-logic";
import type {
  CompletionStatus,
  LyricsMeta,
  PartyAggregate,
  PartySettings,
  PartyStatus,
  PlaybackState,
  QueueItem,
  QueueStatus,
  Song,
} from "./types";

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const TRANSITION_SECONDS = 20;

export type Viewer = { role: "host" } | { role: "guest"; participantId: string };

export interface PersonRef {
  id: string;
  displayName: string;
  avatar: string;
}

export type BadgeId = "first_to_mic" | "queue_master" | "karaoke_legend" | "crowd_favorite";

export interface ParticipantView extends PersonRef {
  joinedAt: string;
  online: boolean;
  performanceCount: number;
  submittedCount: number;
  votesReceived: number;
  badges: BadgeId[];
  isMe: boolean;
}

export interface QueueItemView {
  id: string;
  position: number;
  status: QueueStatus;
  pinned: boolean;
  statusReason: string | null;
  addedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  song: Song;
  requestedBy: PersonRef;
  votes: number;
  myVote: boolean;
  isMine: boolean;
  /** Seconds until this song is expected to start (approximate). */
  estimatedStartInSeconds: number | null;
  lyrics: LyricsMeta | null;
}

export interface HistoryView {
  id: string;
  queueItemId: string;
  song: Song;
  performer: PersonRef;
  playedAt: string;
  endedAt: string;
  completionStatus: CompletionStatus;
}

export type PlaybackView = Omit<PlaybackState, "partyId">;

export interface LeaderboardRow extends PersonRef {
  value: number;
}

export interface Leaderboard {
  performances: LeaderboardRow[];
  submissions: LeaderboardRow[];
  activity: LeaderboardRow[];
}

export interface PartySnapshot {
  party: {
    id: string;
    name: string;
    joinCode: string;
    status: PartyStatus;
    settings: PartySettings;
    createdAt: string;
    endedAt: string | null;
    endedReason: "host" | "expired" | null;
  };
  me: { role: "host" } | ({ role: "guest" } & PersonRef);
  participants: ParticipantView[];
  onlineCount: number;
  nowPlaying: QueueItemView | null;
  upcoming: QueueItemView[];
  pending: QueueItemView[];
  mine: QueueItemView[];
  history: HistoryView[];
  playback: PlaybackView;
  leaderboard: Leaderboard;
  serverTime: string;
  version: number;
}

const GONE: PersonRef = { id: "gone", displayName: "Former guest", avatar: "👋" };

export function buildSnapshot(agg: PartyAggregate, viewer: Viewer, now: Date): PartySnapshot {
  const nowMs = now.getTime();
  const isHost = viewer.role === "host";
  const myId = viewer.role === "guest" ? viewer.participantId : null;
  const people = new Map(agg.participants.map((p) => [p.id, p]));
  const ref = (id: string): PersonRef => {
    const p = people.get(id);
    return p ? { id: p.id, displayName: p.displayName, avatar: p.avatar } : GONE;
  };
  const counts = voteCounts(agg);
  const myVotes = new Set(agg.votes.filter((v) => v.participantId === myId).map((v) => v.queueItemId));
  const settings = agg.party.settings;
  const fallback = settings.fallbackDurationSeconds;

  const view = (q: QueueItem, eta: number | null): QueueItemView => ({
    id: q.id,
    position: q.position,
    status: q.status,
    pinned: q.pinned,
    statusReason: q.statusReason,
    addedAt: q.addedAt,
    startedAt: q.startedAt,
    completedAt: q.completedAt,
    skippedAt: q.skippedAt,
    song: agg.songs[q.songId] ?? missingSong(q.songId),
    requestedBy: ref(q.participantId),
    votes: counts.get(q.id) ?? 0,
    myVote: myVotes.has(q.id),
    isMine: q.participantId === myId,
    estimatedStartInSeconds: eta,
    lyrics: agg.lyrics[q.songId] ?? null,
  });

  const pb = agg.playback;
  const current = currentItem(agg);
  let clock = 0;
  if (current) {
    const duration = pb.durationSeconds ?? agg.songs[current.songId]?.durationSeconds ?? fallback;
    const introLeft = pb.status === "intro" && pb.introUntil ? Math.max(0, (Date.parse(pb.introUntil) - nowMs) / 1000) : 0;
    clock = Math.max(0, duration - estimatePosition(pb, nowMs)) + introLeft + TRANSITION_SECONDS;
  }
  const upcoming = upcomingItems(agg).map((q) => {
    const eta = clock;
    clock += (agg.songs[q.songId]?.durationSeconds ?? fallback) + TRANSITION_SECONDS;
    return view(q, Math.round(eta));
  });

  const allPending = pendingItems(agg);
  const pendingVisible = isHost || settings.votingMode === "requests" ? allPending : allPending.filter((q) => q.participantId === myId);

  const submitted = new Map<string, number>();
  const received = new Map<string, number>();
  for (const q of agg.queue) {
    if (q.replayOf) continue;
    submitted.set(q.participantId, (submitted.get(q.participantId) ?? 0) + 1);
    const c = counts.get(q.id) ?? 0;
    if (c) received.set(q.participantId, (received.get(q.participantId) ?? 0) + c);
  }
  const votesCast = new Map<string, number>();
  for (const v of agg.votes) votesCast.set(v.participantId, (votesCast.get(v.participantId) ?? 0) + 1);

  const active = agg.participants.filter((p) => !p.removedAt);
  const badges = computeBadges(agg, active.map((p) => p.id), submitted, received);
  const participants: ParticipantView[] = active
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatar: p.avatar,
      joinedAt: p.joinedAt,
      online: nowMs - Date.parse(p.lastSeenAt) < ONLINE_WINDOW_MS,
      performanceCount: p.performanceCount,
      submittedCount: submitted.get(p.id) ?? 0,
      votesReceived: received.get(p.id) ?? 0,
      badges: badges.get(p.id) ?? [],
      isMe: p.id === myId,
    }))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));

  const top = (score: (p: ParticipantView) => number): LeaderboardRow[] =>
    participants
      .map((p) => ({ id: p.id, displayName: p.displayName, avatar: p.avatar, value: score(p) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName))
      .slice(0, 5);

  const me = myId ? people.get(myId) : null;
  const { partyId: _partyId, ...playback } = pb;
  void _partyId;

  return {
    party: {
      id: agg.party.id,
      name: agg.party.name,
      joinCode: agg.party.joinCode,
      status: agg.party.status,
      settings,
      createdAt: agg.party.createdAt,
      endedAt: agg.party.endedAt,
      endedReason: agg.party.endedReason,
    },
    me: isHost
      ? { role: "host" }
      : { role: "guest", ...(me ? { id: me.id, displayName: me.displayName, avatar: me.avatar } : GONE) },
    participants,
    onlineCount: participants.filter((p) => p.online).length,
    nowPlaying: current ? view(current, 0) : null,
    upcoming,
    pending: pendingVisible.map((q) => view(q, null)),
    mine: myId
      ? agg.queue
          .filter((q) => q.participantId === myId)
          .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
          .map((q) => upcoming.find((u) => u.id === q.id) ?? view(q, null))
      : [],
    history: [...agg.history]
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .map((h) => ({
        id: h.id,
        queueItemId: h.queueItemId,
        song: agg.songs[h.songId] ?? missingSong(h.songId),
        performer: ref(h.participantId),
        playedAt: h.playedAt,
        endedAt: h.endedAt,
        completionStatus: h.completionStatus,
      })),
    playback: isHost ? playback : { ...playback, outputClientId: null },
    leaderboard: {
      performances: top((p) => p.performanceCount),
      submissions: top((p) => p.submittedCount),
      activity: top((p) => p.submittedCount + p.performanceCount * 2 + (votesCast.get(p.id) ?? 0)),
    },
    serverTime: now.toISOString(),
    version: agg.party.version,
  };
}

function computeBadges(
  agg: PartyAggregate,
  activeIds: string[],
  submitted: Map<string, number>,
  received: Map<string, number>,
): Map<string, BadgeId[]> {
  const result = new Map<string, BadgeId[]>();
  const give = (id: string | undefined, badge: BadgeId) => {
    if (!id || !activeIds.includes(id)) return;
    result.set(id, [...(result.get(id) ?? []), badge]);
  };
  const firstCompleted = [...agg.history]
    .filter((h) => h.completionStatus === "completed")
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt))[0];
  give(firstCompleted?.participantId, "first_to_mic");

  const leader = (m: Map<string, number>, min: number) => {
    let best: string | undefined;
    let bestValue = min - 1;
    let tie = false;
    for (const [id, value] of m) {
      if (value > bestValue) {
        best = id;
        bestValue = value;
        tie = false;
      } else if (value === bestValue) tie = true;
    }
    return tie ? undefined : best;
  };
  give(leader(submitted, 3), "queue_master");
  give(leader(received, 3), "crowd_favorite");
  for (const p of agg.participants) if (p.performanceCount >= 3) give(p.id, "karaoke_legend");
  return result;
}

function missingSong(songId: string): Song {
  return {
    id: songId,
    source: "youtube",
    youtubeVideoId: null,
    title: "Unknown song",
    channelName: "",
    thumbnailUrl: null,
    durationSeconds: null,
    metadata: { videoKind: "video", lyricsInVideo: "unknown" },
  };
}

export const BADGE_INFO: Record<BadgeId, { label: string; emoji: string; description: string }> = {
  first_to_mic: { label: "First to the Mic", emoji: "🥇", description: "Finished the first performance of the night." },
  queue_master: { label: "Queue Master", emoji: "📜", description: "Submitted the most songs (3+)." },
  karaoke_legend: { label: "Karaoke Legend", emoji: "🌟", description: "Completed 3 or more performances." },
  crowd_favorite: { label: "Crowd Favorite", emoji: "💖", description: "Received the most votes (3+)." },
};
