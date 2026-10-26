import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/server/env";
import { errorResponse, handle, noStore } from "@/lib/server/http";
import { partyService } from "@/lib/server/party-service";

/**
 * Expires idle parties and purges ended ones past the retention window.
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
 */
async function run(req: NextRequest) {
  const secret = serverEnv().cronSecret;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return errorResponse("unauthorized", "Missing or invalid cron secret.", 401);
  const result = await partyService().cleanup();
  return NextResponse.json({ ok: true, ...result }, { headers: noStore });
}

export const GET = handle(run);
export const POST = handle(run);
