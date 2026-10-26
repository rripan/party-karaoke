import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoSong, DEMO_TRACKS } from "@/lib/demo/catalog";
import { applyGuestCommand, applyHostCommand, createPartyAggregate, DomainError, joinParty } from "@/lib/domain/party-logic";
import type { PartyAggregate } from "@/lib/domain/types";
import { MemoryStore } from "@/lib/server/store/memory-store";
import { PostgresStore } from "@/lib/server/store/postgres-store";
import type { PartyStore } from "@/lib/server/store/types";
import { JoinCodeTakenError } from "@/lib/server/store/types";

const ctx = () => ({ now: new Date(), newId: randomUUID });
const hash = () => randomUUID().replace(/-/g, "").padEnd(64, "a").slice(0, 64);

function freshParty(code = randomCode()) {
  return createPartyAggregate({ id: randomUUID(), joinCode: code, name: "Store Test", hostTokenHash: hash(), now: new Date() });
}
function randomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

/** Shared contract every store must satisfy. */
function storeContract(name: string, getStore: () => PartyStore) {
  describe(`${name} store contract`, () => {
    it("persists a full party round-trip", async () => {
      const store = getStore();
      const agg = freshParty();
      await store.insertParty(agg);
      expect(await store.findPartyIdByJoinCode(agg.party.joinCode)).toBe(agg.party.id);
      const { agg: after } = await store.mutate(agg.party.id, (d) => {
        const p = joinParty(d, { displayName: "Alex", tokenHash: hash() }, ctx());
        const q = joinParty(d, { displayName: "Bea", tokenHash: hash() }, ctx());
        const a = applyGuestCommand(d, p.id, { type: "add_song", song: demoSong(DEMO_TRACKS[0]) }, ctx());
        applyGuestCommand(d, q.id, { type: "add_song", song: demoSong(DEMO_TRACKS[2]) }, ctx());
        applyGuestCommand(d, q.id, { type: "vote", queueItemId: a.queueItemId! }, ctx());
        applyHostCommand(d, { type: "start" }, ctx());
        applyHostCommand(d, { type: "finish" }, ctx());
        d.party.version += 1;
      });
      const loaded = (await store.load(agg.party.id))!;
      expect(normalize(loaded)).toEqual(normalize(after));
      expect(loaded.history).toHaveLength(1);
      expect(loaded.playback.currentQueueItemId).not.toBeNull();
    });

    it("rejects a duplicate live join code", async () => {
      const store = getStore();
      const a = freshParty();
      await store.insertParty(a);
      await expect(store.insertParty(freshParty(a.party.joinCode))).rejects.toBeInstanceOf(JoinCodeTakenError);
    });

    it("serialises simultaneous submissions: no lost songs, unique positions", async () => {
      const store = getStore();
      const agg = freshParty();
      await store.insertParty(agg);
      const guests = await store.mutate(agg.party.id, (d) =>
        Array.from({ length: 8 }, (_, i) => joinParty(d, { displayName: `Guest ${i}`, tokenHash: hash() }, ctx()).id),
      );
      await Promise.all(
        guests.result.map((pid, i) =>
          store.mutate(agg.party.id, (d) => applyGuestCommand(d, pid, { type: "add_song", song: demoSong(DEMO_TRACKS[i]) }, ctx())),
        ),
      );
      const loaded = (await store.load(agg.party.id))!;
      const positions = loaded.queue.filter((q) => q.status === "queued").map((q) => q.position).sort((a, b) => a - b);
      expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("a failed mutation changes nothing", async () => {
      const store = getStore();
      const agg = freshParty();
      await store.insertParty(agg);
      await expect(
        store.mutate(agg.party.id, (d) => {
          d.party.name = "Changed";
          throw new DomainError("nope", "nope");
        }),
      ).rejects.toBeInstanceOf(DomainError);
      expect((await store.load(agg.party.id))!.party.name).toBe("Store Test");
    });

    it("lists inactive parties and purges ended ones", async () => {
      const store = getStore();
      const agg = freshParty();
      await store.insertParty(agg);
      const future = new Date(Date.now() + 1000 * 60).toISOString();
      expect(await store.listInactive(future)).toContain(agg.party.id);
      await store.mutate(agg.party.id, (d) => applyHostCommand(d, { type: "end_party" }, ctx()));
      expect(await store.purgeEnded(future)).toBeGreaterThanOrEqual(1);
      expect(await store.load(agg.party.id)).toBeNull();
    });
  });
}

/** Sort arrays so DB row order doesn't matter in comparisons. */
function normalize(agg: PartyAggregate) {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return { ...agg, participants: byId(agg.participants), queue: byId(agg.queue), history: byId(agg.history), votes: byId(agg.votes) };
}

storeContract("memory", () => new MemoryStore(null));

const pgUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!pgUrl)("postgres", () => {
  let store: PostgresStore;
  beforeAll(async () => {
    store = new PostgresStore(pgUrl!);
    await store.sql.unsafe("drop schema public cascade; create schema public;");
    await store.sql.unsafe(readFileSync(path.join(__dirname, "../../supabase/migrations/20261026000000_party_karaoke.sql"), "utf8"));
  });
  afterAll(async () => {
    await store?.sql.end();
  });
  storeContract("postgres", () => store);

  it("enforces one vote per participant per song at the database level", async () => {
    const agg = freshParty();
    await store.insertParty(agg);
    const { result } = await store.mutate(agg.party.id, (d) => {
      const a = joinParty(d, { displayName: "A", tokenHash: hash() }, ctx());
      const b = joinParty(d, { displayName: "B", tokenHash: hash() }, ctx());
      const item = applyGuestCommand(d, a.id, { type: "add_song", song: demoSong(DEMO_TRACKS[1]) }, ctx());
      return { b: b.id, item: item.queueItemId! };
    });
    await expect(
      store.sql`insert into votes (id, session_id, queue_item_id, participant_id, created_at) values
        (${randomUUID()}, ${agg.party.id}, ${result.item}, ${result.b}, now()), (${randomUUID()}, ${agg.party.id}, ${result.item}, ${result.b}, now())`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("row level security is enabled on every table, with no public policies", async () => {
    const rows = await store.sql`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'app_migrations'`;
    expect(rows.length).toBe(8);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await store.sql`select count(*)::int as n from pg_policies where schemaname = 'public'`;
    expect(policies[0].n).toBe(0);
  });

  it("never stores raw tokens or lyric text", async () => {
    const cols = await store.sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`;
    const names = cols.map((c) => `${c.table_name}.${c.column_name}`);
    expect(names).toContain("participants.token_hash");
    expect(names.some((n) => /lyrics_metadata\.(text|lines|lrc|content)/.test(n))).toBe(false);
  });
});
