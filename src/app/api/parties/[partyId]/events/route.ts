import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/membership";
import { bus, partyTopic } from "@/lib/server/realtime";

/**
 * Server-Sent Events stream of `{ version }` pings for one party. Used when
 * Supabase Realtime isn't configured. `no-transform` keeps compression
 * middleware from buffering the stream.
 */
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/parties/[partyId]/events">) => {
  const { partyId } = await ctx.params;
  const { agg } = await requireMember(req, partyId);
  const encoder = new TextEncoder();
  const topic = partyTopic(partyId);
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onChange = (payload: { version: number }) => send(`event: changed\ndata: ${JSON.stringify(payload)}\n\n`);
      const keepAlive = setInterval(() => send(`: ping\n\n`), 20_000);
      bus().on(topic, onChange);
      cleanup = () => {
        clearInterval(keepAlive);
        bus().off(topic, onChange);
      };
      send(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ version: agg.party.version })}\n\n`);
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
