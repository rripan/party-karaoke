import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashToken, hostCookieName, setPartyCookie } from "@/lib/server/auth";
import { assertSameOrigin, handle, noStore, readJson } from "@/lib/server/http";
import { ApiError, partyService } from "@/lib/server/party-service";
import { clientIp, LIMITS, rateLimit } from "@/lib/server/rate-limit";

const schema = z.object({ key: z.string().min(20).max(100) });

/** Exchanges a host remote key (from a host link fragment) for a host cookie. */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/claim">) => {
  assertSameOrigin(req);
  rateLimit(`claim:${clientIp(req.headers)}`, LIMITS.join);
  const { partyId } = await ctx.params;
  const { key } = schema.parse(await readJson(req));
  const agg = await partyService().load(partyId);
  if (agg.party.status === "ended") throw new ApiError("party_ended", "This party has ended.", 410);
  if (!agg.party.hostTokenHashes.includes(hashToken(key))) {
    throw new ApiError("invalid_host_key", "That host link isn't valid for this party.", 403);
  }
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  setPartyCookie(res, req, hostCookieName(partyId), key);
  return res;
});
