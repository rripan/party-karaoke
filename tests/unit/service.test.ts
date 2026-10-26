import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSnapshot } from "@/lib/domain/snapshot";
import { generateToken, hashToken } from "@/lib/server/auth";
import { ApiError, generateJoinCode, normalizeJoinCode, PartyService } from "@/lib/server/party-service";
import { rateLimit, RateLimitError, resetRateLimits } from "@/lib/server/rate-limit";
import { getStore } from "@/lib/server/store";

const host = { kind: "host" as const, actor: { role: "host" as const } };
const guest = (participantId: string) => ({ kind: "guest" as const, actor: { role: "guest" as const, participantId } });

describe("party service (server-side permissions and lifecycle)", () => {
  let service: PartyService;
  beforeEach(() => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    resetRateLimits();
    service = new PartyService();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("creates parties with unpredictable ids, readable codes and hashed host tokens", async () => {
    const { agg, hostToken } = await service.createParty({ name: "Birthday Bash" });
    expect(agg.party.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(agg.party.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(hostToken.length).toBeGreaterThanOrEqual(43);
    expect(agg.party.hostTokenHashes).toEqual([hashToken(hostToken)]);
    expect(JSON.stringify(agg)).not.toContain(hostToken);
  });

  it("keeps parties separate", async () => {
    const a = await service.createParty({ name: "Party A" });
    const b = await service.createParty({ name: "Party B" });
    const { participant } = await service.join(a.agg.party.id, { displayName: "Alex" });
    await service.execute(a.agg.party.id, guest(participant.id), { type: "add_song", ref: "demo:neon-heartbeat" });
    // Alex's identity means nothing in party B.
    await expect(service.execute(b.agg.party.id, guest(participant.id), { type: "add_song", ref: "demo:happy-birthday" })).rejects.toMatchObject({ code: "not_a_participant" });
    expect((await service.load(b.agg.party.id)).queue).toHaveLength(0);
    expect((await service.load(a.agg.party.id)).queue).toHaveLength(1);
  });

  it("guests can't run host commands and anonymous callers can't do anything", async () => {
    const { agg } = await service.createParty({ name: "Locked" });
    const { participant } = await service.join(agg.party.id, { displayName: "Sam" });
    await expect(service.execute(agg.party.id, guest(participant.id), { type: "end_party" })).rejects.toMatchObject({ status: 403 });
    await expect(service.execute(agg.party.id, { kind: "anonymous" }, { type: "add_song", ref: "demo:neon-heartbeat" })).rejects.toMatchObject({ status: 403 });
    await expect(service.execute(agg.party.id, host, { type: "nonsense" })).rejects.toBeInstanceOf(ApiError);
    // Unknown fields (e.g. a spoofed participantId) are ignored, never trusted.
    await expect(service.execute(agg.party.id, guest(participant.id), { type: "update_profile", displayName: "Sammy", participantId: "someone-else" })).resolves.toBeTruthy();
  });

  it("host can pause submissions and end the party", async () => {
    const { agg } = await service.createParty({ name: "Rules" });
    const { participant } = await service.join(agg.party.id, { displayName: "Lee" });
    await service.execute(agg.party.id, host, { type: "update_settings", patch: { submissionsOpen: false } });
    await expect(service.execute(agg.party.id, guest(participant.id), { type: "add_song", ref: "demo:neon-heartbeat" })).rejects.toMatchObject({ code: "submissions_closed" });
    await service.execute(agg.party.id, host, { type: "end_party" });
    await expect(service.join(agg.party.id, { displayName: "Late" })).rejects.toMatchObject({ code: "party_ended", status: 410 });
  });

  it("expires idle parties lazily and via cleanup, then purges them after retention", async () => {
    const { agg } = await service.createParty({ name: "Sleepy" });
    await getStore().mutate(agg.party.id, (d) => {
      d.party.lastActivityAt = new Date(Date.now() - 25 * 3600_000).toISOString();
    });
    const expired = await service.load(agg.party.id);
    expect(expired.party.status).toBe("ended");
    expect(expired.party.endedReason).toBe("expired");
    expect(buildSnapshot(expired, { role: "host" }, new Date()).party.endedReason).toBe("expired");
    const later = new Date(Date.now() + 8 * 86400_000);
    const result = await service.cleanup(later);
    expect(result.purged).toBeGreaterThanOrEqual(1);
    await expect(service.load(agg.party.id)).rejects.toMatchObject({ status: 404 });
  });

  it("host remote keys add a second host credential", async () => {
    const { agg } = await service.createParty({ name: "Remote" });
    const key = await service.addHostKey(agg.party.id);
    expect((await service.load(agg.party.id)).party.hostTokenHashes).toContain(hashToken(key));
  });
});

describe("helpers", () => {
  it("join codes avoid ambiguous characters and normalise user input", () => {
    for (let i = 0; i < 200; i++) expect(generateJoinCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(normalizeJoinCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeJoinCode("ABC")).toBeNull();
    expect(normalizeJoinCode("ABC10O")).toBeNull();
  });

  it("tokens are 256-bit random values", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    expect(tokens.size).toBe(100);
    expect(Buffer.from([...tokens][0], "base64url")).toHaveLength(32);
  });

  it("rate limiter blocks bursts per key", () => {
    resetRateLimits();
    const limit = { max: 3, windowMs: 60_000 };
    rateLimit("k", limit);
    rateLimit("k", limit);
    rateLimit("k", limit);
    expect(() => rateLimit("k", limit)).toThrow(RateLimitError);
    expect(() => rateLimit("other", limit)).not.toThrow();
  });
});
