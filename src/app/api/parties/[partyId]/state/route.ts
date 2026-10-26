import { NextResponse, type NextRequest } from "next/server";
import { handle, noStore } from "@/lib/server/http";
import { partyService } from "@/lib/server/party-service";

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/state">) => {
  const { partyId } = await ctx.params;
  const { snapshot, meta } = await partyService().snapshotFor(req, partyId);
  return NextResponse.json({ snapshot, meta }, { headers: noStore });
});
