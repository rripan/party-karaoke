import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, handle, noStore } from "@/lib/server/http";
import { requireHost } from "@/lib/server/membership";
import { resolvePublicOrigin } from "@/lib/server/origin";
import { partyService } from "@/lib/server/party-service";

/**
 * Creates a secret "host remote" link so the host can control the party from
 * another device (e.g. their phone). The key is in the URL fragment, which
 * browsers never send to servers or put in Referer headers.
 */
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/host-keys">) => {
  assertSameOrigin(req);
  const { partyId } = await ctx.params;
  await requireHost(req, partyId);
  const key = await partyService().addHostKey(partyId);
  const { origin } = resolvePublicOrigin(req);
  return NextResponse.json({ url: `${origin}/host/${partyId}#key=${key}` }, { headers: noStore });
});
