import { NextResponse, type NextRequest } from "next/server";
import { buildSnapshot } from "@/lib/domain/snapshot";
import { resolveActor } from "@/lib/server/auth";
import { assertSameOrigin, handle, noStore, readJson } from "@/lib/server/http";
import { partyService } from "@/lib/server/party-service";

/**
 * Single command endpoint. The actor is derived from server-held token hashes
 * only — the body can't claim to be the host or another participant.
 */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/commands">) => {
  assertSameOrigin(req);
  const { partyId } = await ctx.params;
  const body = await readJson(req);
  const service = partyService();
  const current = await service.load(partyId);
  const resolution = resolveActor(req, current);
  const { agg, result } = await service.execute(partyId, resolution, body);
  if (result.silent && (body as { type?: string }).type === "player_report") {
    // Frequent player heartbeats: skip rebuilding the snapshot.
    return NextResponse.json({ ok: true, version: agg.party.version }, { headers: noStore });
  }
  const viewer = resolution.kind === "guest" ? resolution.actor : { role: "host" as const };
  return NextResponse.json({ ok: true, result, snapshot: buildSnapshot(agg, viewer, new Date()) }, { headers: noStore });
});
