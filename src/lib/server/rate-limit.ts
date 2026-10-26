/**
 * In-process sliding-window rate limiter. On a multi-instance deployment each
 * instance limits independently, which still bounds abuse per instance; put a
 * shared limiter (e.g. at the edge) in front for stricter guarantees.
 */
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests");
  }
}

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

export const LIMITS = {
  search: { max: 30, windowMs: 60_000 },
  resolve: { max: 20, windowMs: 60_000 },
  addSong: { max: 10, windowMs: 60_000 },
  join: { max: 12, windowMs: 60_000 },
  lookup: { max: 40, windowMs: 60_000 },
  create: { max: 8, windowMs: 10 * 60_000 },
  command: { max: 240, windowMs: 60_000 },
  lyrics: { max: 30, windowMs: 60_000 },
} as const;

/** Test runs drive many "guests" from one IP; RATE_LIMIT_SCALE loosens limits there. */
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1) || 1);

export function rateLimit(key: string, limit: { max: number; windowMs: number }) {
  const now = Date.now();
  const max = limit.max * SCALE;
  if (now - lastSweep > 5 * 60_000) {
    for (const [k, hits] of buckets) if (!hits.length || hits[hits.length - 1] < now - 10 * 60_000) buckets.delete(k);
    lastSweep = now;
  }
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - limit.windowMs);
  if (hits.length >= max) {
    throw new RateLimitError(Math.ceil((hits[0] + limit.windowMs - now) / 1000));
  }
  hits.push(now);
  buckets.set(key, hits);
}

export function resetRateLimits() {
  buckets.clear();
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
