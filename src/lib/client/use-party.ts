"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartySnapshot } from "@/lib/domain/snapshot";
import { api, ClientApiError, sendCommand, type ServerMeta, type StateResponse } from "./api";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export interface PartyConnection {
  snapshot: PartySnapshot | null;
  meta: ServerMeta | null;
  error: ClientApiError | null;
  connection: ConnectionState;
  /** Offset to add to Date.now() to approximate server time. */
  clockOffsetMs: number;
  refresh: () => Promise<void>;
  command: (cmd: Record<string, unknown>) => Promise<PartySnapshot | null>;
  applySnapshot: (snapshot: PartySnapshot, meta?: ServerMeta) => void;
}

const SLOW_POLL_MS = 20_000;
const FAST_POLL_MS = 5_000;

/**
 * Keeps a party snapshot fresh. Realtime messages only carry a version
 * number; on any newer version we refetch our own role-filtered snapshot.
 * Fallbacks: polling (faster when the realtime channel is down), refetch on
 * tab focus and when the browser comes back online.
 */
export function useParty(partyId: string | null, opts: { enabled?: boolean; initial?: StateResponse | null } = {}): PartyConnection {
  const enabled = opts.enabled ?? true;
  const [snapshot, setSnapshot] = useState<PartySnapshot | null>(opts.initial?.snapshot ?? null);
  const [meta, setMeta] = useState<ServerMeta | null>(opts.initial?.meta ?? null);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [clockOffsetMs, setClockOffset] = useState(0);
  const versionRef = useRef(opts.initial?.snapshot.version ?? 0);
  const inflight = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);

  const accept = useCallback((snap: PartySnapshot, m?: ServerMeta, sentAt?: number) => {
    // Never go backwards (an older response can arrive after a newer one).
    if (snap.version < versionRef.current) return;
    versionRef.current = snap.version;
    setSnapshot(snap);
    if (m) setMeta(m);
    if (sentAt !== undefined) {
      const rtt = Date.now() - sentAt;
      setClockOffset(Date.parse(snap.serverTime) - (sentAt + rtt / 2));
    }
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!partyId) return;
    if (inflight.current) {
      dirty.current = true;
      return inflight.current;
    }
    const run = (async () => {
      do {
        dirty.current = false;
        const sentAt = Date.now();
        try {
          const data = await api<StateResponse>(`/api/parties/${partyId}/state`);
          // A refetch may legitimately return the same version with new online counts.
          if (data.snapshot.version >= versionRef.current) {
            versionRef.current = data.snapshot.version;
            setSnapshot(data.snapshot);
            setMeta(data.meta);
            const rtt = Date.now() - sentAt;
            setClockOffset(Date.parse(data.snapshot.serverTime) - (sentAt + rtt / 2));
            setError(null);
          }
        } catch (e) {
          const err = e instanceof ClientApiError ? e : new ClientApiError("unknown", "Couldn't load the party.", 0);
          setError(err);
          if (err.status === 0) setConnection("offline");
        }
      } while (dirty.current);
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
  }, [partyId]);

  const onVersion = useCallback(
    (version: number) => {
      if (version > versionRef.current) void refresh();
    },
    [refresh],
  );

  // Initial load + polling + focus/online handling.
  const realtimeHealthy = connection === "live";
  useEffect(() => {
    if (!partyId || !enabled) return;
    void refresh();
    const interval = setInterval(() => void refresh(), realtimeHealthy ? SLOW_POLL_MS : FAST_POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && void refresh();
    const onOnline = () => void refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [partyId, enabled, refresh, realtimeHealthy]);

  // Realtime subscription (depends on which transport the server advertises).
  const transport = meta?.realtime.kind ?? null;
  const supabaseUrl = meta?.realtime.kind === "supabase" ? meta.realtime.url : null;
  const supabaseKey = meta?.realtime.kind === "supabase" ? meta.realtime.anonKey : null;
  const joined = Boolean(snapshot);
  useEffect(() => {
    if (!partyId || !enabled || !transport || !joined) return;
    let disposed = false;
    let cleanup = () => {};

    if (transport === "sse") {
      const es = new EventSource(`/api/parties/${partyId}/events`);
      es.addEventListener("hello", (e) => {
        setConnection("live");
        onVersion(JSON.parse((e as MessageEvent).data).version);
      });
      es.addEventListener("changed", (e) => onVersion(JSON.parse((e as MessageEvent).data).version));
      es.onerror = () => {
        if (!disposed) setConnection(navigator.onLine ? "reconnecting" : "offline");
      };
      cleanup = () => es.close();
    } else if (supabaseUrl && supabaseKey) {
      void import("@supabase/supabase-js").then(({ createClient }) => {
        if (disposed) return;
        const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
        const channel = client
          .channel(`party:${partyId}`)
          .on("broadcast", { event: "changed" }, (msg) => onVersion(Number((msg.payload as { version?: number })?.version ?? 0)))
          .subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") {
              setConnection("live");
              void refresh(); // catch anything missed while connecting
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              setConnection("reconnecting");
            }
          });
        cleanup = () => {
          void client.removeChannel(channel);
        };
      });
    }
    return () => {
      disposed = true;
      cleanup();
    };
  }, [partyId, enabled, transport, supabaseUrl, supabaseKey, joined, onVersion, refresh]);

  const command = useCallback(
    async (cmd: Record<string, unknown>) => {
      if (!partyId) return null;
      const sentAt = Date.now();
      const res = await sendCommand(partyId, cmd);
      if (res.snapshot) {
        accept(res.snapshot, undefined, sentAt);
        return res.snapshot;
      }
      if (res.version && res.version > versionRef.current) void refresh();
      return null;
    },
    [partyId, accept, refresh],
  );

  const applySnapshot = useCallback((snap: PartySnapshot, m?: ServerMeta) => accept(snap, m), [accept]);

  return { snapshot, meta, error, connection, clockOffsetMs, refresh, command, applySnapshot };
}
