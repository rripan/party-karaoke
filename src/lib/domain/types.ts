/**
 * Core domain types shared by the server, the persistence adapters and the UI.
 * The "party aggregate" is the unit of consistency: every mutation loads one
 * party's aggregate, applies a pure domain function and persists the diff.
 */

export type PartyStatus = "active" | "paused" | "ended";

/**
 * off      – no voting.
 * display  – votes are shown but never change the order.
 * reorder  – votes reorder upcoming queued songs (the song that is up next and
 *            host-pinned songs keep their slots).
 * requests – votes only order songs still waiting for host approval.
 */
export type VotingMode = "off" | "display" | "reorder" | "requests";

export type StageLayout = "auto" | "video" | "split" | "lyrics";
export type LyricsTextSize = "m" | "l" | "xl" | "xxl";
export type StageBackground = "aurora" | "midnight" | "sunset";

export interface DisplaySettings {
  layout: StageLayout;
  textSize: LyricsTextSize;
  background: StageBackground;
  showNextLine: boolean;
  showQr: boolean;
}

export interface PartySettings {
  submissionsOpen: boolean;
  requireApproval: boolean;
  votingMode: VotingMode;
  maxPendingPerGuest: number;
  allowGuestRemoval: boolean;
  autoAdvance: boolean;
  preventDuplicates: boolean;
  /** Used for wait estimates when a video has no duration metadata. */
  fallbackDurationSeconds: number;
  showQrDuringPerformance: boolean;
  display: DisplaySettings;
}

export interface Party {
  id: string;
  joinCode: string;
  name: string;
  /** SHA-256 hashes of host tokens. Raw tokens only ever live in host cookies. */
  hostTokenHashes: string[];
  status: PartyStatus;
  settings: PartySettings;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  endedAt: string | null;
  endedReason: "host" | "expired" | null;
  version: number;
}

export interface Participant {
  id: string;
  partyId: string;
  displayName: string;
  avatar: string;
  tokenHash: string;
  joinedAt: string;
  lastSeenAt: string;
  removedAt: string | null;
  performanceCount: number;
}

export type SongSource = "youtube" | "demo";

/**
 * How a video presents itself, derived only from real metadata (title,
 * channel). "sample" is used for the bundled demo catalog.
 */
export type VideoKind =
  | "karaoke"
  | "lyric_video"
  | "official"
  | "instrumental"
  | "video"
  | "sample";

export interface SongMetadata {
  videoKind: VideoKind;
  /** Whether lyrics are probably burned into the video picture. */
  lyricsInVideo: "likely" | "no" | "unknown";
  /** Human readable reason for the classification, e.g. 'Title contains "karaoke"'. */
  classificationBasis?: string;
  publishedAt?: string;
  demoTrackId?: string;
}

export interface Song {
  /** Stable key: `yt:<videoId>` or `demo:<slug>`. */
  id: string;
  source: SongSource;
  youtubeVideoId: string | null;
  title: string;
  channelName: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  metadata: SongMetadata;
}

export type QueueStatus =
  | "pending_approval"
  | "queued"
  | "playing"
  | "completed"
  | "skipped"
  | "removed"
  | "rejected";

export interface QueueItem {
  id: string;
  partyId: string;
  songId: string;
  participantId: string;
  position: number;
  status: QueueStatus;
  pinned: boolean;
  statusReason: string | null;
  addedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  replayOf: string | null;
}

export type PlaybackStatus =
  | "idle"
  | "intro"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "error";

export type PlaybackCommandType = "load" | "play" | "pause" | "seek" | "restart" | "stop";

export interface PlaybackCommand {
  seq: number;
  type: PlaybackCommandType;
  positionSeconds: number;
  issuedAt: string;
}

export interface PlaybackState {
  partyId: string;
  currentQueueItemId: string | null;
  status: PlaybackStatus;
  /** Position at the anchor (`playbackStartedAt`), or the frozen position when not playing. */
  positionSeconds: number;
  /** Wall-clock anchor while playing: position = positionSeconds + (now - anchor). */
  playbackStartedAt: string | null;
  pausedAt: string | null;
  updatedAt: string;
  durationSeconds: number | null;
  command: PlaybackCommand;
  error: { code: string; message: string } | null;
  autoplayBlocked: boolean;
  /** Set when the stage reloaded mid-song and real playback stopped. */
  interrupted: boolean;
  introUntil: string | null;
  outputClientId: string | null;
  outputLastSeenAt: string | null;
}

export type CompletionStatus = "completed" | "skipped" | "unavailable";

export interface HistoryEntry {
  id: string;
  partyId: string;
  songId: string;
  participantId: string;
  queueItemId: string;
  playedAt: string;
  endedAt: string;
  completionStatus: CompletionStatus;
}

export interface Vote {
  id: string;
  partyId: string;
  queueItemId: string;
  participantId: string;
  createdAt: string;
}

export type LyricsAvailability = "synced" | "plain" | "unavailable" | "error" | "unknown";
export type LyricsTiming = "word" | "line" | "none";

export interface LyricsMeta {
  id: string;
  songId: string;
  provider: string | null;
  availabilityStatus: LyricsAvailability;
  timingFormat: LyricsTiming;
  licensingReference: string | null;
  metadata: {
    checkedAt: string;
    sample?: boolean;
    attribution?: string;
    note?: string;
  };
}

export interface PartyAggregate {
  party: Party;
  participants: Participant[];
  queue: QueueItem[];
  songs: Record<string, Song>;
  playback: PlaybackState;
  history: HistoryEntry[];
  votes: Vote[];
  lyrics: Record<string, LyricsMeta>;
}

export type Actor =
  | { role: "host" }
  | { role: "guest"; participantId: string };
