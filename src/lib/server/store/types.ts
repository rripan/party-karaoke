import type { PartyAggregate } from "@/lib/domain/types";

export class JoinCodeTakenError extends Error {
  constructor() {
    super("join code already in use");
  }
}

export class PartyNotFoundError extends Error {
  constructor() {
    super("party not found");
  }
}

/**
 * Persistence boundary. `mutate` must run `fn` with exclusive access to the
 * party (a row lock in Postgres, synchronous execution in memory) so that
 * concurrent submissions can never lose entries or collide on positions.
 * `fn` must be synchronous and must only touch the aggregate it is given.
 */
export interface PartyStore {
  readonly kind: "memory" | "postgres";
  insertParty(agg: PartyAggregate): Promise<void>;
  load(partyId: string): Promise<PartyAggregate | null>;
  findPartyIdByJoinCode(joinCode: string): Promise<string | null>;
  mutate<T>(partyId: string, fn: (agg: PartyAggregate) => T): Promise<{ agg: PartyAggregate; result: T }>;
  touchParticipant(partyId: string, participantId: string, at: string): Promise<void>;
  /** Parties that are not ended and have been inactive since `before`. */
  listInactive(before: string): Promise<string[]>;
  /** Permanently deletes parties that ended before `before`. Returns the count. */
  purgeEnded(before: string): Promise<number>;
}
