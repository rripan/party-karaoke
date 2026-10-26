import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Actor, PartyAggregate } from "@/lib/domain/types";

/**
 * Identity model
 *  - Host: a random 256-bit token, stored only as a SHA-256 hash on the party.
 *  - Guest: a random 256-bit token per participant, stored only as a hash.
 * Tokens travel in httpOnly, SameSite=Lax cookies scoped per party, so client
 * JavaScript can't read them and a QR code (which only contains the join
 * code) never grants host rights.
 */

export const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 48;

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export const hostCookieName = (partyId: string) => `kp_h_${partyId}`;
export const guestCookieName = (partyId: string) => `kp_g_${partyId}`;

export function isSecureRequest(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return proto === "https";
}

export function setPartyCookie(res: NextResponse, req: NextRequest, name: string, token: string) {
  res.cookies.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearPartyCookie(res: NextResponse, name: string) {
  res.cookies.set(name, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export type ActorResolution =
  | { kind: "host"; actor: Actor }
  | { kind: "guest"; actor: Actor & { role: "guest" } }
  | { kind: "removed" }
  | { kind: "anonymous" };

/** Resolves who is calling, purely from server-held token hashes. */
export function resolveActor(req: NextRequest, agg: PartyAggregate): ActorResolution {
  const hostToken = req.cookies.get(hostCookieName(agg.party.id))?.value;
  if (hostToken) {
    const hash = hashToken(hostToken);
    if (agg.party.hostTokenHashes.some((h) => safeEqualHex(h, hash))) return { kind: "host", actor: { role: "host" } };
  }
  const guestToken = req.cookies.get(guestCookieName(agg.party.id))?.value;
  if (guestToken) {
    const hash = hashToken(guestToken);
    const p = agg.participants.find((x) => safeEqualHex(x.tokenHash, hash));
    if (p?.removedAt) return { kind: "removed" };
    if (p) return { kind: "guest", actor: { role: "guest", participantId: p.id } };
  }
  return { kind: "anonymous" };
}
