import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "@/lib/domain/party-logic";
import { YouTubeError } from "@/lib/youtube/service";
import { ApiError } from "./party-service";
import { RateLimitError } from "./rate-limit";
import { PartyNotFoundError } from "./store";

export interface ApiErrorBody {
  error: { code: string; message: string; retryAfterSeconds?: number };
}

export function errorResponse(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } } satisfies ApiErrorBody, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Maps known errors to friendly JSON; never leaks internals for unknown ones. */
export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError || error instanceof DomainError) return errorResponse(error.code, error.message, error.status);
  if (error instanceof YouTubeError) return errorResponse(`youtube_${error.code}`, error.message, error.status);
  if (error instanceof PartyNotFoundError) return errorResponse("party_not_found", "We couldn't find that party.", 404);
  if (error instanceof RateLimitError) {
    return errorResponse("rate_limited", "Whoa, slow down a little! Try again in a moment.", 429, {
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  if (error instanceof ZodError) {
    return errorResponse("invalid_input", error.issues[0]?.message ? `Invalid input: ${error.issues[0].message}` : "Invalid input.", 400);
  }
  if (error instanceof SyntaxError) return errorResponse("invalid_json", "The request body wasn't valid JSON.", 400);
  console.error("[api] unexpected error", error instanceof Error ? `${error.name}: ${error.message}` : error);
  return errorResponse("internal", "Something went wrong on our side. Please try again.", 500);
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function handle<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      unstable_rethrow(error); // let Next.js handle its own control-flow signals (e.g. prerender bail-outs)
      return toErrorResponse(error);
    }
  };
}

export async function readJson(req: NextRequest, maxBytes = 32_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError("payload_too_large", "That request is too large.", 413);
  return text ? JSON.parse(text) : {};
}

/** Light CSRF defence for cookie-authenticated mutations. */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients and same-origin GET-less fetches in some browsers
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new ApiError("bad_origin", "Cross-site requests aren't allowed.", 403);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("bad_origin", "Cross-site requests aren't allowed.", 403);
  }
}

export const noStore = { "Cache-Control": "no-store" };
