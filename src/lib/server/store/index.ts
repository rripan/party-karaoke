import "server-only";
import path from "node:path";
import { serverEnv } from "@/lib/server/env";
import { MemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";
import type { PartyStore } from "./types";

const globalForStore = globalThis as unknown as { __karaokeStore?: PartyStore };

/** One store per server process (survives dev hot reloads). */
export function getStore(): PartyStore {
  if (!globalForStore.__karaokeStore) {
    const env = serverEnv();
    globalForStore.__karaokeStore = env.databaseUrl
      ? new PostgresStore(env.databaseUrl)
      : new MemoryStore(process.env.NODE_ENV === "test" ? null : path.resolve(env.dataDir, "karaoke-local.json"));
  }
  return globalForStore.__karaokeStore;
}

export { JoinCodeTakenError, PartyNotFoundError } from "./types";
export type { PartyStore } from "./types";
