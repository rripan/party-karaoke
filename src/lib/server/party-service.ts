import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  GUEST_COMMAND_TYPES,
  HOST_COMMAND_TYPES,
  guestCommandSchema,
  hostCommandSchema,
} from "@/lib/domain/commands";
import {
  applyGuestCommand,
  applyHostCommand,
  createPartyAggregate,
  DomainError,
  expireParty,
  joinParty,
  type CommandResult,
  type Ctx,
} from "@/lib/domain/party-logic";
import { DEFAULT_SETTINGS, mergeSettings, settingsPatchSchema } from "@/lib/domain/settings";
import { buildSnapshot, type PartySnapshot, type Viewer } from "@/lib/domain/snapshot";
import type { LyricsMeta, PartyAggregate, Song } from "@/lib/domain/types";
import { lyricsService, lyricsMetaFromPayload } from "@/lib/lyrics/service";
import { resolveSongRef, searchMode } from "@/lib/youtube/service";
import { generateToken, hashToken, resolveActor, type ActorResolution } from "./auth";
import { realtimeKind, serverEnv } from "./env";
import { resolvePublicOrigin } from "./origin";
import { LIMITS, rateLimit } from "./rate-limit";
import { publishPartyChange } from "./realtime";
import { getStore, JoinCodeTakenError, PartyNotFoundError } from "./store";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += JOIN_ALPHABET[randomInt(JOIN_ALPHABET.length)];
  return code;
}

export function normalizeJoinCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

const ctx = (): Ctx => ({ now: new Date(), newId: randomUUID });

export interface ServerMeta {
  search: "live" | "demo";
  storage: "memory" | "postgres";
  realtime: { kind: "sse" } | { kind: "supabase"; url: string; anonKey: string };
  joinUrl: string;
  originNotice: string | null;
  lyricsProviders: string[];
  externalLyrics: boolean;
  storageWarning: string | null;
}

export function buildMeta(req: NextRequest, agg: PartyAggregate, isHost: boolean): ServerMeta {
  const env = serverEnv();
  const { origin, notice } = resolvePublicOrigin(req);
  const kind = realtimeKind();
  const lyrics = lyricsService();
  return {
    search: searchMode(),
    storage: getStore().kind,
    realtime: kind === "supabase" ? { kind, url: env.supabaseUrl!, anonKey: env.supabaseAnonKey! } : { kind: "sse" },
    joinUrl: `${origin}/p/${agg.party.joinCode}`,
    originNotice: isHost ? notice : null,
    lyricsProviders: lyrics.providerNames,
    externalLyrics: lyrics.hasExternalProviders(),
    storageWarning:
      isHost && getStore().kind === "memory" && env.isVercel
        ? "Local storage on a serverless host: parties can disappear between requests. Configure DATABASE_URL."
        : null,
  };
}

function finalize(agg: PartyAggregate, result: CommandResult, now: Date) {
  agg.party.lastActivityAt = now.toISOString();
  if (!result.silent) {
    agg.party.version += 1;
    agg.party.updatedAt = now.toISOString();
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function songWithLyrics(ref: string): Promise<{ song: Song; lyrics: LyricsMeta }> {
  const song = await resolveSongRef(ref);
  const lyrics = await withTimeout(
    lyricsService().check(song),
    3000,
    lyricsMetaFromPayload(song, { kind: "none", reason: "not_checked" }),
  );
  return { song, lyrics };
}

export const createPartySchema = z.object({
  name: z.string().max(120),
  settings: settingsPatchSchema.optional(),
});

export class PartyService {
  private store = getStore();

  async createParty(input: z.infer<typeof createPartySchema>) {
    const hostToken = generateToken();
    const settings = mergeSettings(structuredClone(DEFAULT_SETTINGS), input.settings);
    for (let attempt = 0; attempt < 8; attempt++) {
      const agg = createPartyAggregate({
        id: randomUUID(),
        joinCode: generateJoinCode(),
        name: input.name,
        hostTokenHash: hashToken(hostToken),
        settings,
        now: new Date(),
      });
      try {
        await this.store.insertParty(agg);
        return { agg, hostToken };
      } catch (error) {
        if (!(error instanceof JoinCodeTakenError)) throw error;
      }
    }
    throw new ApiError("join_code_exhausted", "Couldn't create a party right now. Please try again.", 503);
  }

  /** Loads a party, expiring it lazily if it has been idle past its lifetime. */
  async load(partyId: string): Promise<PartyAggregate> {
    const agg = await this.store.load(partyId);
    if (!agg) throw new ApiError("party_not_found", "We couldn't find that party. Check the link or code.", 404);
    const ttlMs = serverEnv().partyTtlHours * 3600_000;
    if (agg.party.status !== "ended" && Date.now() - Date.parse(agg.party.lastActivityAt) > ttlMs) {
      return this.expire(partyId);
    }
    return agg;
  }

  async expire(partyId: string): Promise<PartyAggregate> {
    const { agg } = await this.store.mutate(partyId, (draft) => {
      const c = ctx();
      expireParty(draft, c);
      finalize(draft, {}, c.now);
    });
    publishPartyChange(partyId, agg.party.version);
    return agg;
  }

  async findByJoinCode(code: string) {
    const id = await this.store.findPartyIdByJoinCode(code);
    if (!id) return null;
    return this.load(id);
  }

  async snapshotFor(req: NextRequest, partyId: string): Promise<{ snapshot: PartySnapshot; meta: ServerMeta; resolution: ActorResolution }> {
    const agg = await this.load(partyId);
    const resolution = resolveActor(req, agg);
    if (resolution.kind === "removed") throw new ApiError("participant_removed", "The host removed you from this party.", 403);
    if (resolution.kind === "anonymous") throw new ApiError("not_joined", "Join the party to see what's playing.", 401);
    const viewer: Viewer = resolution.kind === "host" ? { role: "host" } : resolution.actor;
    if (resolution.kind === "guest") {
      const p = agg.participants.find((x) => x.id === resolution.actor.participantId);
      if (p && Date.now() - Date.parse(p.lastSeenAt) > 30_000) {
        p.lastSeenAt = new Date().toISOString();
        await this.store.touchParticipant(partyId, p.id, p.lastSeenAt);
      }
    }
    return {
      snapshot: buildSnapshot(agg, viewer, new Date()),
      meta: buildMeta(req, agg, resolution.kind === "host"),
      resolution,
    };
  }

  async join(partyId: string, input: { displayName: string; avatar?: string }) {
    const token = generateToken();
    const { agg, result } = await this.store.mutate(partyId, (draft) => {
      const c = ctx();
      const participant = joinParty(draft, { ...input, tokenHash: hashToken(token) }, c);
      finalize(draft, {}, c.now);
      return participant;
    });
    publishPartyChange(partyId, agg.party.version);
    return { agg, participant: result, token };
  }

  /** Issues an additional host key, e.g. for a "control from my phone" link. */
  async addHostKey(partyId: string) {
    const token = generateToken();
    await this.store.mutate(partyId, (draft) => {
      if (draft.party.status === "ended") throw new DomainError("party_ended", "This party has ended.", 410);
      draft.party.hostTokenHashes = [...draft.party.hostTokenHashes, hashToken(token)].slice(-6);
    });
    return token;
  }

  async execute(partyId: string, resolution: ActorResolution, body: unknown) {
    const type = (body as { type?: unknown })?.type;
    if (typeof type !== "string") throw new ApiError("invalid_command", "Unknown action.", 400);

    if (HOST_COMMAND_TYPES.has(type as never)) {
      if (resolution.kind !== "host") throw new ApiError("forbidden", "Only the host can do that.", 403);
      rateLimit(`cmd:host:${partyId}`, LIMITS.command);
      const cmd = hostCommandSchema.parse(body);
      let domainCmd;
      if (cmd.type === "replace_video") {
        const { song, lyrics } = await songWithLyrics(cmd.ref);
        domainCmd = { type: "replace_video" as const, queueItemId: cmd.queueItemId, song, lyrics };
      } else domainCmd = cmd;
      return this.commit(partyId, (draft, c) => applyHostCommand(draft, domainCmd, c));
    }

    if (GUEST_COMMAND_TYPES.has(type as never)) {
      if (resolution.kind === "removed") throw new ApiError("participant_removed", "The host removed you from this party.", 403);
      if (resolution.kind !== "guest") {
        throw new ApiError("not_joined", resolution.kind === "host" ? "Join as a guest to add songs or vote." : "Join the party first.", 403);
      }
      const participantId = resolution.actor.participantId;
      rateLimit(`cmd:guest:${participantId}`, LIMITS.command);
      const cmd = guestCommandSchema.parse(body);
      if (cmd.type === "add_song") {
        rateLimit(`add:${participantId}`, LIMITS.addSong);
        // Fail fast on rules that don't need YouTube before spending API quota.
        const pre = await this.load(partyId);
        if (pre.party.status === "ended") throw new DomainError("party_ended", "This party has ended.", 410);
        if (!pre.party.settings.submissionsOpen) {
          throw new DomainError("submissions_closed", "The host has paused song submissions for now.", 403);
        }
        const { song, lyrics } = await songWithLyrics(cmd.ref);
        return this.commit(partyId, (draft, c) => applyGuestCommand(draft, participantId, { type: "add_song", song, lyrics }, c));
      }
      return this.commit(partyId, (draft, c) => applyGuestCommand(draft, participantId, cmd, c));
    }

    throw new ApiError("invalid_command", "Unknown action.", 400);
  }

  private async commit(partyId: string, apply: (draft: PartyAggregate, c: Ctx) => CommandResult) {
    const { agg, result } = await this.store.mutate(partyId, (draft) => {
      const c = ctx();
      const r = apply(draft, c);
      finalize(draft, r, c.now);
      return r;
    });
    if (!result.silent) publishPartyChange(partyId, agg.party.version);
    return { agg, result };
  }

  async cleanup(now = new Date()) {
    const env = serverEnv();
    const inactiveBefore = new Date(now.getTime() - env.partyTtlHours * 3600_000).toISOString();
    const ids = await this.store.listInactive(inactiveBefore);
    for (const id of ids) {
      try {
        await this.expire(id);
      } catch (error) {
        if (!(error instanceof PartyNotFoundError)) throw error;
      }
    }
    const purgeBefore = new Date(now.getTime() - env.historyRetentionDays * 86400_000).toISOString();
    const purged = await this.store.purgeEnded(purgeBefore);
    return { expired: ids.length, purged };
  }
}

let service: PartyService | null = null;
export function partyService() {
  service ??= new PartyService();
  return service;
}
