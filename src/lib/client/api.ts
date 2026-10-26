import type { PartySnapshot } from "@/lib/domain/snapshot";
import type { ServerMeta } from "@/lib/server/party-service";

export type { ServerMeta };

export class ClientApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      method: rest.method ?? (json !== undefined ? "POST" : "GET"),
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError("network", "You seem to be offline. Check your connection and try again.", 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ClientApiError(err?.code ?? "http_error", err?.message ?? "Something went wrong. Please try again.", res.status);
  }
  return data as T;
}

export interface StateResponse {
  snapshot: PartySnapshot;
  meta: ServerMeta;
}

export interface CommandResponse {
  ok: true;
  snapshot?: PartySnapshot;
  version?: number;
  result?: { queueItemId?: string };
}

export function sendCommand(partyId: string, command: Record<string, unknown>) {
  return api<CommandResponse>(`/api/parties/${partyId}/commands`, { json: command });
}
