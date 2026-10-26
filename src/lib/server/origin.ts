import "server-only";
import os from "node:os";
import type { NextRequest } from "next/server";
import { serverEnv } from "./env";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function lanAddress(): string | null {
  const nets = os.networkInterfaces();
  const candidates: string[] = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) candidates.push(net.address);
    }
  }
  // Prefer typical home-network ranges.
  return candidates.find((a) => a.startsWith("192.168.")) ?? candidates.find((a) => a.startsWith("10.")) ?? candidates[0] ?? null;
}

/**
 * The origin guests' phones should use. A QR code pointing at "localhost"
 * would open the phone's own localhost, so when the host is on loopback we
 * substitute the machine's LAN address and tell the host.
 */
export function resolvePublicOrigin(req: NextRequest): { origin: string; notice: string | null } {
  const env = serverEnv();
  if (env.appUrl) return { origin: env.appUrl.replace(/\/$/, ""), notice: null };
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const url = new URL(`${proto}://${host}`);
  if (LOOPBACK.has(url.hostname)) {
    const lan = lanAddress();
    if (lan) {
      const origin = `${url.protocol}//${lan}${url.port ? `:${url.port}` : ""}`;
      return {
        origin,
        notice: `You're on localhost, so the QR code uses your network address (${origin}). Guests' phones must be on the same Wi-Fi.`,
      };
    }
    return { origin: url.origin, notice: "This server is only reachable on localhost — phones won't be able to join. Set APP_URL or open the app via its network address." };
  }
  return { origin: url.origin, notice: null };
}
