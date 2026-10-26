import { NextResponse, type NextRequest } from "next/server";
import { hostCookieName, setPartyCookie } from "@/lib/server/auth";
import { assertSameOrigin, handle, noStore, readJson } from "@/lib/server/http";
import { createPartySchema, partyService } from "@/lib/server/party-service";
import { clientIp, LIMITS, rateLimit } from "@/lib/server/rate-limit";

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  rateLimit(`create:${clientIp(req.headers)}`, LIMITS.create);
  const input = createPartySchema.parse(await readJson(req));
  const { agg, hostToken } = await partyService().createParty(input);
  const res = NextResponse.json(
    { partyId: agg.party.id, joinCode: agg.party.joinCode, name: agg.party.name },
    { status: 201, headers: noStore },
  );
  setPartyCookie(res, req, hostCookieName(agg.party.id), hostToken);
  return res;
});
