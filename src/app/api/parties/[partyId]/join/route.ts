import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildSnapshot } from "@/lib/domain/snapshot";
import { guestCookieName, resolveActor, setPartyCookie } from "@/lib/server/auth";
import { assertSameOrigin, handle, noStore, readJson } from "@/lib/server/http";
import { ApiError, buildMeta, partyService } from "@/lib/server/party-service";
import { clientIp, LIMITS, rateLimit } from "@/lib/server/rate-limit";

const joinSchema = z.object({
  displayName: z.string().max(60),
  avatar: z.string().max(16).optional(),
});

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/join">) => {
  assertSameOrigin(req);
  rateLimit(`join:${clientIp(req.headers)}`, LIMITS.join);
  const { partyId } = await ctx.params;
  const input = joinSchema.parse(await readJson(req));
  const existing = await partyService().load(partyId);
  if (existing.party.status === "ended") throw new ApiError("party_ended", "This party has ended.", 410);
  const already = resolveActor(req, existing);
  if (already.kind === "guest") throw new ApiError("already_joined", "You're already in this party.", 409);
  if (already.kind === "removed") throw new ApiError("participant_removed", "The host removed you from this party.", 403);

  const { agg, participant, token } = await partyService().join(partyId, input);
  const snapshot = buildSnapshot(agg, { role: "guest", participantId: participant.id }, new Date());
  const res = NextResponse.json({ snapshot, meta: buildMeta(req, agg, false) }, { status: 201, headers: noStore });
  setPartyCookie(res, req, guestCookieName(partyId), token);
  return res;
});
