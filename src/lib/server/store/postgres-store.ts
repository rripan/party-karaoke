import postgres from "postgres";
import type {
  HistoryEntry,
  LyricsMeta,
  Participant,
  PartyAggregate,
  PlaybackState,
  QueueItem,
  Song,
  Vote,
} from "@/lib/domain/types";
import { JoinCodeTakenError, PartyNotFoundError, type PartyStore } from "./types";

type Sql = postgres.Sql | postgres.TransactionSql;
type Row = Record<string, unknown>;

const ts = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const tsReq = (v: unknown): string => ts(v)!;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

// --- row <-> domain mappers -------------------------------------------------

function partyToRow(p: PartyAggregate["party"]): Row {
  return {
    id: p.id,
    join_code: p.joinCode,
    name: p.name,
    host_identity: { tokenHashes: p.hostTokenHashes },
    status: p.status,
    settings: p.settings,
    version: p.version,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    last_activity_at: p.lastActivityAt,
    ended_at: p.endedAt,
    ended_reason: p.endedReason,
  };
}
function partyFromRow(r: Row): PartyAggregate["party"] {
  return {
    id: String(r.id),
    joinCode: String(r.join_code),
    name: String(r.name),
    hostTokenHashes: ((r.host_identity as { tokenHashes?: string[] })?.tokenHashes ?? []).map(String),
    status: r.status as PartyAggregate["party"]["status"],
    settings: r.settings as PartyAggregate["party"]["settings"],
    version: Number(r.version),
    createdAt: tsReq(r.created_at),
    updatedAt: tsReq(r.updated_at),
    lastActivityAt: tsReq(r.last_activity_at),
    endedAt: ts(r.ended_at),
    endedReason: (r.ended_reason as PartyAggregate["party"]["endedReason"]) ?? null,
  };
}

function participantToRow(p: Participant): Row {
  return {
    id: p.id,
    session_id: p.partyId,
    display_name: p.displayName,
    avatar: p.avatar,
    token_hash: p.tokenHash,
    joined_at: p.joinedAt,
    last_seen_at: p.lastSeenAt,
    removed_at: p.removedAt,
    performance_count: p.performanceCount,
  };
}
function participantFromRow(r: Row): Participant {
  return {
    id: String(r.id),
    partyId: String(r.session_id),
    displayName: String(r.display_name),
    avatar: String(r.avatar),
    tokenHash: String(r.token_hash),
    joinedAt: tsReq(r.joined_at),
    lastSeenAt: tsReq(r.last_seen_at),
    removedAt: ts(r.removed_at),
    performanceCount: Number(r.performance_count),
  };
}

function songToRow(s: Song): Row {
  return {
    id: s.id,
    source: s.source,
    youtube_video_id: s.youtubeVideoId,
    title: s.title,
    channel_name: s.channelName,
    thumbnail_url: s.thumbnailUrl,
    duration_seconds: s.durationSeconds,
    metadata: s.metadata,
  };
}
function songFromRow(r: Row): Song {
  return {
    id: String(r.id),
    source: r.source as Song["source"],
    youtubeVideoId: (r.youtube_video_id as string) ?? null,
    title: String(r.title),
    channelName: String(r.channel_name),
    thumbnailUrl: (r.thumbnail_url as string) ?? null,
    durationSeconds: num(r.duration_seconds),
    metadata: r.metadata as Song["metadata"],
  };
}

function queueToRow(q: QueueItem): Row {
  return {
    id: q.id,
    session_id: q.partyId,
    song_id: q.songId,
    participant_id: q.participantId,
    position: q.position,
    status: q.status,
    pinned: q.pinned,
    status_reason: q.statusReason,
    replay_of: q.replayOf,
    added_at: q.addedAt,
    started_at: q.startedAt,
    completed_at: q.completedAt,
    skipped_at: q.skippedAt,
  };
}
function queueFromRow(r: Row): QueueItem {
  return {
    id: String(r.id),
    partyId: String(r.session_id),
    songId: String(r.song_id),
    participantId: String(r.participant_id),
    position: Number(r.position),
    status: r.status as QueueItem["status"],
    pinned: Boolean(r.pinned),
    statusReason: (r.status_reason as string) ?? null,
    replayOf: (r.replay_of as string) ?? null,
    addedAt: tsReq(r.added_at),
    startedAt: ts(r.started_at),
    completedAt: ts(r.completed_at),
    skippedAt: ts(r.skipped_at),
  };
}

function playbackToRow(p: PlaybackState): Row {
  return {
    session_id: p.partyId,
    current_queue_item_id: p.currentQueueItemId,
    playback_status: p.status,
    current_time_seconds: p.positionSeconds,
    playback_started_at: p.playbackStartedAt,
    paused_at: p.pausedAt,
    duration_seconds: p.durationSeconds,
    command: p.command,
    error: p.error,
    autoplay_blocked: p.autoplayBlocked,
    interrupted: p.interrupted,
    intro_until: p.introUntil,
    output_client_id: p.outputClientId,
    output_last_seen_at: p.outputLastSeenAt,
    updated_at: p.updatedAt,
  };
}
function playbackFromRow(r: Row): PlaybackState {
  return {
    partyId: String(r.session_id),
    currentQueueItemId: (r.current_queue_item_id as string) ?? null,
    status: r.playback_status as PlaybackState["status"],
    positionSeconds: Number(r.current_time_seconds),
    playbackStartedAt: ts(r.playback_started_at),
    pausedAt: ts(r.paused_at),
    durationSeconds: num(r.duration_seconds),
    command: r.command as PlaybackState["command"],
    error: (r.error as PlaybackState["error"]) ?? null,
    autoplayBlocked: Boolean(r.autoplay_blocked),
    interrupted: Boolean(r.interrupted),
    introUntil: ts(r.intro_until),
    outputClientId: (r.output_client_id as string) ?? null,
    outputLastSeenAt: ts(r.output_last_seen_at),
    updatedAt: tsReq(r.updated_at),
  };
}

function historyToRow(h: HistoryEntry): Row {
  return {
    id: h.id,
    session_id: h.partyId,
    song_id: h.songId,
    participant_id: h.participantId,
    queue_item_id: h.queueItemId,
    played_at: h.playedAt,
    ended_at: h.endedAt,
    completion_status: h.completionStatus,
  };
}
function historyFromRow(r: Row): HistoryEntry {
  return {
    id: String(r.id),
    partyId: String(r.session_id),
    songId: String(r.song_id),
    participantId: String(r.participant_id),
    queueItemId: String(r.queue_item_id ?? ""),
    playedAt: tsReq(r.played_at),
    endedAt: tsReq(r.ended_at),
    completionStatus: r.completion_status as HistoryEntry["completionStatus"],
  };
}

function voteToRow(v: Vote): Row {
  return { id: v.id, session_id: v.partyId, queue_item_id: v.queueItemId, participant_id: v.participantId, created_at: v.createdAt };
}
function voteFromRow(r: Row): Vote {
  return {
    id: String(r.id),
    partyId: String(r.session_id),
    queueItemId: String(r.queue_item_id),
    participantId: String(r.participant_id),
    createdAt: tsReq(r.created_at),
  };
}

function lyricsToRow(l: LyricsMeta): Row {
  return {
    id: l.id,
    song_id: l.songId,
    provider: l.provider,
    availability_status: l.availabilityStatus,
    timing_format: l.timingFormat,
    licensing_reference: l.licensingReference,
    metadata: l.metadata,
  };
}
function lyricsFromRow(r: Row): LyricsMeta {
  return {
    id: String(r.id),
    songId: String(r.song_id),
    provider: (r.provider as string) ?? null,
    availabilityStatus: r.availability_status as LyricsMeta["availabilityStatus"],
    timingFormat: r.timing_format as LyricsMeta["timingFormat"],
    licensingReference: (r.licensing_reference as string) ?? null,
    metadata: r.metadata as LyricsMeta["metadata"],
  };
}

const JSON_COLUMNS = new Set(["host_identity", "settings", "metadata", "command", "error"]);

/** Diff helper: rows of `after` that are new or changed compared to `before`. */
function changed<T>(before: T[], after: T[], key: (x: T) => string, toRow: (x: T) => Row): Row[] {
  const prev = new Map(before.map((x) => [key(x), JSON.stringify(toRow(x))]));
  return after.filter((x) => prev.get(key(x)) !== JSON.stringify(toRow(x))).map(toRow);
}

export class PostgresStore implements PartyStore {
  readonly kind = "postgres" as const;
  readonly sql: postgres.Sql;

  constructor(url: string) {
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
    this.sql = postgres(url, {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: process.env.DATABASE_SSL === "disable" || local ? false : "require",
      onnotice: () => {},
    });
  }

  private async upsert(tx: Sql, table: string, rows: Row[], conflict = "id") {
    if (!rows.length) return;
    const columns = Object.keys(rows[0]);
    const prepared = rows.map((r) => {
      const out: Row = {};
      for (const c of columns) {
        const v = r[c];
        out[c] = JSON_COLUMNS.has(c) && v != null ? tx.json(v as postgres.JSONValue) : v;
      }
      return out;
    });
    // Table/column names come from the static mappers above, never from user input.
    const updates = columns
      .filter((c) => c !== conflict)
      .map((c) => `${c} = excluded.${c}`)
      .join(", ");
    await tx`insert into ${tx(table)} ${tx(prepared as never, columns)} on conflict (${tx(conflict)}) do update set ${tx.unsafe(updates)}`;
  }

  async insertParty(agg: PartyAggregate) {
    try {
      await this.sql.begin(async (tx) => {
        await this.upsert(tx, "party_sessions", [partyToRow(agg.party)]);
        await this.upsert(tx, "playback_state", [playbackToRow(agg.playback)], "session_id");
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new JoinCodeTakenError();
      throw error;
    }
  }

  private async loadWith(tx: Sql, partyId: string, lock: boolean): Promise<PartyAggregate | null> {
    const parties = lock
      ? await tx`select * from party_sessions where id = ${partyId} for update`
      : await tx`select * from party_sessions where id = ${partyId}`;
    if (!parties.length) return null;
    const [participants, queue, playback, history, votes] = await Promise.all([
      tx`select * from participants where session_id = ${partyId}`,
      tx`select * from queue_items where session_id = ${partyId}`,
      tx`select * from playback_state where session_id = ${partyId}`,
      tx`select * from song_history where session_id = ${partyId}`,
      tx`select * from votes where session_id = ${partyId}`,
    ]);
    const songs = await tx`
      select * from songs where id in (
        select song_id from queue_items where session_id = ${partyId}
        union select song_id from song_history where session_id = ${partyId})`;
    const lyrics = songs.length
      ? await tx`select * from lyrics_metadata where song_id in ${tx(songs.map((s) => s.id as string))}`
      : [];
    const party = partyFromRow(parties[0]);
    return {
      party,
      participants: participants.map(participantFromRow),
      queue: queue.map(queueFromRow),
      songs: Object.fromEntries(songs.map((r) => [String(r.id), songFromRow(r)])),
      playback: playback.length
        ? playbackFromRow(playback[0])
        : ({ partyId, currentQueueItemId: null, status: "idle", positionSeconds: 0, playbackStartedAt: null, pausedAt: null, updatedAt: party.updatedAt, durationSeconds: null, command: { seq: 0, type: "stop", positionSeconds: 0, issuedAt: party.updatedAt }, error: null, autoplayBlocked: false, interrupted: false, introUntil: null, outputClientId: null, outputLastSeenAt: null } satisfies PlaybackState),
      history: history.map(historyFromRow),
      votes: votes.map(voteFromRow),
      lyrics: Object.fromEntries(lyrics.map((r) => [String(r.song_id), lyricsFromRow(r)])),
    };
  }

  async load(partyId: string) {
    if (!isUuid(partyId)) return null;
    return this.loadWith(this.sql, partyId, false);
  }

  async findPartyIdByJoinCode(joinCode: string) {
    const rows = await this.sql`
      select id from party_sessions where join_code = ${joinCode}
      order by (status <> 'ended') desc, created_at desc limit 1`;
    return rows.length ? String(rows[0].id) : null;
  }

  async mutate<T>(partyId: string, fn: (agg: PartyAggregate) => T) {
    if (!isUuid(partyId)) throw new PartyNotFoundError();
    return this.sql.begin(async (tx) => {
      const before = await this.loadWith(tx, partyId, true);
      if (!before) throw new PartyNotFoundError();
      const after = structuredClone(before);
      const result = fn(after);
      await this.persistDiff(tx, before, after);
      return { agg: after, result };
    }) as Promise<{ agg: PartyAggregate; result: T }>;
  }

  /** Writes only what changed, in foreign-key order. */
  private async persistDiff(tx: Sql, before: PartyAggregate, after: PartyAggregate) {
    if (JSON.stringify(partyToRow(before.party)) !== JSON.stringify(partyToRow(after.party))) {
      await this.upsert(tx, "party_sessions", [partyToRow(after.party)]);
    }
    await this.upsert(tx, "participants", changed(before.participants, after.participants, (p) => p.id, participantToRow));
    await this.upsert(tx, "songs", changed(Object.values(before.songs), Object.values(after.songs), (s) => s.id, songToRow));
    await this.upsert(tx, "lyrics_metadata", changed(Object.values(before.lyrics), Object.values(after.lyrics), (l) => l.songId, lyricsToRow), "song_id");

    // Rows leaving 'playing' must be written before the new 'playing' row (unique index).
    const queueRows = changed(before.queue, after.queue, (q) => q.id, queueToRow).sort(
      (a, b) => Number(a.status === "playing") - Number(b.status === "playing"),
    );
    for (const row of queueRows.filter((r) => r.status !== "playing")) await this.upsert(tx, "queue_items", [row]);
    await this.upsert(tx, "queue_items", queueRows.filter((r) => r.status === "playing"));

    if (JSON.stringify(playbackToRow(before.playback)) !== JSON.stringify(playbackToRow(after.playback))) {
      await this.upsert(tx, "playback_state", [playbackToRow(after.playback)], "session_id");
    }
    await this.upsert(tx, "song_history", changed(before.history, after.history, (h) => h.id, historyToRow));

    const keptVotes = new Set(after.votes.map((v) => v.id));
    const removedVotes = before.votes.filter((v) => !keptVotes.has(v.id)).map((v) => v.id);
    if (removedVotes.length) await tx`delete from votes where id in ${tx(removedVotes)}`;
    await this.upsert(tx, "votes", changed(before.votes, after.votes, (v) => v.id, voteToRow));
  }

  async touchParticipant(partyId: string, participantId: string, at: string) {
    if (!isUuid(partyId) || !isUuid(participantId)) return;
    await this.sql`update participants set last_seen_at = ${at} where id = ${participantId} and session_id = ${partyId}`;
  }

  async listInactive(before: string) {
    const rows = await this.sql`select id from party_sessions where status <> 'ended' and last_activity_at < ${before} limit 200`;
    return rows.map((r) => String(r.id));
  }

  async purgeEnded(before: string) {
    const rows = await this.sql`delete from party_sessions where status = 'ended' and ended_at < ${before} returning id`;
    return rows.length;
  }
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
