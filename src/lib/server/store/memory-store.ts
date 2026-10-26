import { promises as fs, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PartyAggregate } from "@/lib/domain/types";
import { JoinCodeTakenError, PartyNotFoundError, type PartyStore } from "./types";

/**
 * Local store: aggregates live in memory and are snapshotted to a JSON file so
 * that a dev-server restart keeps parties alive. JavaScript runs `mutate`
 * synchronously between load and save, which makes every mutation atomic in a
 * single Node process. It does not work across serverless instances — use the
 * Postgres store for deployments.
 */
export class MemoryStore implements PartyStore {
  readonly kind = "memory" as const;
  private parties = new Map<string, PartyAggregate>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private file: string | null) {
    if (file) this.restore(file);
  }

  private restore(file: string) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { parties?: PartyAggregate[] };
      for (const agg of data.parties ?? []) this.parties.set(agg.party.id, agg);
    } catch {
      /* first run or unreadable file: start empty */
    }
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 250);
  }

  async flush() {
    if (!this.file) return;
    const tmp = `${this.file}.${process.pid}.tmp`;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify({ parties: [...this.parties.values()] }));
      await fs.rename(tmp, this.file);
    } catch (error) {
      console.warn(`[store] could not persist local data: ${(error as Error).message}`);
    }
  }

  async insertParty(agg: PartyAggregate) {
    const code = agg.party.joinCode;
    for (const existing of this.parties.values()) {
      if (existing.party.joinCode === code && existing.party.status !== "ended") throw new JoinCodeTakenError();
    }
    this.parties.set(agg.party.id, structuredClone(agg));
    this.scheduleSave();
  }

  async load(partyId: string) {
    const agg = this.parties.get(partyId);
    return agg ? structuredClone(agg) : null;
  }

  async findPartyIdByJoinCode(joinCode: string) {
    let ended: string | null = null;
    for (const agg of this.parties.values()) {
      if (agg.party.joinCode !== joinCode) continue;
      if (agg.party.status !== "ended") return agg.party.id;
      ended = agg.party.id;
    }
    return ended;
  }

  async mutate<T>(partyId: string, fn: (agg: PartyAggregate) => T) {
    const current = this.parties.get(partyId);
    if (!current) throw new PartyNotFoundError();
    const draft = structuredClone(current);
    const result = fn(draft); // throws leave the stored aggregate untouched
    this.parties.set(partyId, draft);
    this.scheduleSave();
    return { agg: structuredClone(draft), result };
  }

  async touchParticipant(partyId: string, participantId: string, at: string) {
    const p = this.parties.get(partyId)?.participants.find((x) => x.id === participantId);
    if (p) {
      p.lastSeenAt = at;
      this.scheduleSave();
    }
  }

  async listInactive(before: string) {
    return [...this.parties.values()]
      .filter((a) => a.party.status !== "ended" && a.party.lastActivityAt < before)
      .map((a) => a.party.id);
  }

  async purgeEnded(before: string) {
    let count = 0;
    for (const [id, agg] of this.parties) {
      if (agg.party.status === "ended" && agg.party.endedAt && agg.party.endedAt < before) {
        this.parties.delete(id);
        count++;
      }
    }
    if (count) this.scheduleSave();
    return count;
  }
}
