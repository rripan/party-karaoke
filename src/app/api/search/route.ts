import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/lib/server/party-service";
import { handle, noStore } from "@/lib/server/http";
import { requireMember } from "@/lib/server/membership";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { SEARCH_FILTERS, searchSongs, type SearchFilter } from "@/lib/youtube/service";

/** Song search, restricted to party members so the API key can't be farmed. */
export const GET = handle(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const partyId = params.get("partyId") ?? "";
  const { actorKey } = await requireMember(req, partyId);
  rateLimit(`search:${actorKey}`, LIMITS.search);
  const q = (params.get("q") ?? "").slice(0, 120);
  const filterParam = params.get("filter") ?? "karaoke";
  if (!SEARCH_FILTERS.includes(filterParam as SearchFilter)) throw new ApiError("invalid_filter", "Unknown search filter.", 400);
  const response = await searchSongs(q, filterParam as SearchFilter);
  return NextResponse.json(response, { headers: noStore });
});
