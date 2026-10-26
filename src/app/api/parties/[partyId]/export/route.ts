import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { requireHost } from "@/lib/server/membership";

function csvCell(value: unknown): string {
  let s = String(value ?? "");
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Host-only export of the night's song list (history). */
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/export">) => {
  const { partyId } = await ctx.params;
  const { agg } = await requireHost(req, partyId);
  const people = new Map(agg.participants.map((p) => [p.id, p.displayName]));
  const rows = [...agg.history]
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt))
    .map((h) => {
      const song = agg.songs[h.songId];
      return {
        playedAt: h.playedAt,
        performer: people.get(h.participantId) ?? "Former guest",
        title: song?.title ?? "",
        channel: song?.channelName ?? "",
        youtubeVideoId: song?.youtubeVideoId ?? "",
        url: song?.youtubeVideoId ? `https://www.youtube.com/watch?v=${song.youtubeVideoId}` : "",
        status: h.completionStatus,
      };
    });
  const slug = agg.party.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "party";
  if (req.nextUrl.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ party: agg.party.name, exportedAt: new Date().toISOString(), songs: rows }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${slug}-songs.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const header = ["Played at", "Performer", "Title", "Channel", "YouTube video ID", "URL", "Status"];
  const csv = [header, ...rows.map((r) => Object.values(r))].map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-songs.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
