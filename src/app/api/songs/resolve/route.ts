import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { lyricsService } from "@/lib/lyrics/service";
import { handle, noStore, readJson } from "@/lib/server/http";
import { requireMember } from "@/lib/server/membership";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { resolveSongRef } from "@/lib/youtube/service";

const schema = z.object({ partyId: z.string().max(64), ref: z.string().trim().min(1).max(300) });

/** Validates a pasted YouTube link (or inspects a result) before queueing it. */
export const POST = handle(async (req: NextRequest) => {
  const { partyId, ref } = schema.parse(await readJson(req));
  const { actorKey } = await requireMember(req, partyId);
  rateLimit(`resolve:${actorKey}`, LIMITS.resolve);
  const song = await resolveSongRef(ref);
  const lyrics = await lyricsService().check(song);
  return NextResponse.json({ song, lyrics }, { headers: noStore });
});
