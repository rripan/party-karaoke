/**
 * Long-running servers (local / self-hosted) expire idle parties and purge old
 * ones hourly. Serverless deployments use the cron route instead (vercel.json).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL || process.env.NODE_ENV === "test") return;
  const { partyService } = await import("@/lib/server/party-service");
  const run = () =>
    partyService()
      .cleanup()
      .then((r) => (r.expired || r.purged) && console.log(`[cleanup] expired ${r.expired}, purged ${r.purged}`))
      .catch((e) => console.warn(`[cleanup] failed: ${(e as Error).message}`));
  setInterval(run, 60 * 60 * 1000).unref();
}
