import { connection, NextResponse } from "next/server";
import { lyricsService } from "@/lib/lyrics/service";
import { realtimeKind, serverEnv } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";
import { searchMode } from "@/lib/youtube/service";

/** Non-secret capability flags for the UI (what's live vs. demo). */
export async function GET() {
  await connection();
  return NextResponse.json(
    {
      search: searchMode(),
      storage: getStore().kind,
      realtime: realtimeKind(),
      lyricsProviders: lyricsService().providerNames,
      serverless: serverEnv().isVercel,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
