import { NextResponse, type NextRequest } from "next/server";
import { resolveActor } from "@/lib/server/auth";
import { handle, noStore } from "@/lib/server/http";
import { ApiError, normalizeJoinCode, partyService } from "@/lib/server/party-service";
import { clientIp, LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { currentItem, upcomingItems } from "@/lib/domain/party-logic";

/** Public preview for the join screen: only what's on the TV anyway. */
export const GET = handle(async (req: NextRequest) => {
  rateLimit(`lookup:${clientIp(req.headers)}`, LIMITS.lookup);
  const code = normalizeJoinCode(req.nextUrl.searchParams.get("code") ?? "");
  if (!code) throw new ApiError("invalid_code", "Party codes are 6 letters and numbers.", 400);
  const agg = await partyService().findByJoinCode(code);
  if (!agg) throw new ApiError("party_not_found", "No party uses that code. Double-check it with the host.", 404);
  const resolution = resolveActor(req, agg);
  const current = currentItem(agg);
  const song = current ? agg.songs[current.songId] : null;
  const performer = current ? agg.participants.find((p) => p.id === current.participantId) : null;
  return NextResponse.json(
    {
      partyId: agg.party.id,
      name: agg.party.name,
      joinCode: agg.party.joinCode,
      status: agg.party.status,
      endedReason: agg.party.endedReason,
      guestCount: agg.participants.filter((p) => !p.removedAt).length,
      queueLength: upcomingItems(agg).length,
      nowPlaying: song ? { title: song.title, performer: performer?.displayName ?? null } : null,
      viewer: resolution.kind,
    },
    { headers: noStore },
  );
});
