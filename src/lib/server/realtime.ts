import "server-only";
import { EventEmitter } from "node:events";
import type { SupabaseClient } from "@supabase/supabase-js";
import { realtimeKind, serverEnv } from "./env";

/**
 * Realtime fan-out. Messages carry only `{ version }`: clients refetch their
 * own role-filtered snapshot, so nothing private is ever broadcast.
 *  - Always emitted in-process (feeds the Server-Sent Events endpoint).
 *  - Also sent through Supabase Realtime Broadcast when it is configured,
 *    which reaches clients connected to any serverless instance.
 */
const globalForBus = globalThis as unknown as { __karaokeBus?: EventEmitter; __karaokeSupabase?: SupabaseClient };

export function bus(): EventEmitter {
  if (!globalForBus.__karaokeBus) {
    globalForBus.__karaokeBus = new EventEmitter();
    globalForBus.__karaokeBus.setMaxListeners(0);
  }
  return globalForBus.__karaokeBus;
}

export const partyTopic = (partyId: string) => `party:${partyId}`;

async function supabase(): Promise<SupabaseClient> {
  if (!globalForBus.__karaokeSupabase) {
    const env = serverEnv();
    const { createClient } = await import("@supabase/supabase-js");
    globalForBus.__karaokeSupabase = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return globalForBus.__karaokeSupabase;
}

export function publishPartyChange(partyId: string, version: number) {
  bus().emit(partyTopic(partyId), { version });
  if (realtimeKind() === "supabase") {
    void (async () => {
      const client = await supabase();
      const channel = client.channel(partyTopic(partyId));
      try {
        await channel.httpSend("changed", { version });
      } finally {
        await client.removeChannel(channel);
      }
    })().catch((error) => console.warn(`[realtime] broadcast failed: ${(error as Error).message}`));
  }
}
