import { NextResponse, type NextRequest } from "next/server";
import { lyricsService } from "@/lib/lyrics/service";
import { ApiError } from "@/lib/server/party-service";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/membership";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";

/**
 * Returns lyrics for a song in this party, from an authorised provider only.
 * Restricted to members, and only for songs the party actually queued, so the
 * app can't be used as an open lyrics proxy.
 */
export const GET = handle(async (req: NextRequest) => {
  const partyId = req.nextUrl.searchParams.get("partyId") ?? "";
  const songId = req.nextUrl.searchParams.get("songId") ?? "";
  const { agg, actorKey } = await requireMember(req, partyId);
  rateLimit(`lyrics:${actorKey}`, LIMITS.lyrics);
  const song = agg.songs[songId];
  if (!song) throw new ApiError("not_found", "That song isn't part of this party.", 404);
  const payload = await lyricsService().getLyrics(song);
  return NextResponse.json(
    payload.kind === "error" ? { kind: "error", reason: "The lyrics provider is unavailable right now." } : payload,
    // Licensed content: don't let shared caches keep it.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
});
