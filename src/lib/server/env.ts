import "server-only";

/** Server-side configuration. Secrets are read here and never sent to clients. */
export function serverEnv() {
  const e = process.env;
  const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    youtubeApiKey: blank(e.YOUTUBE_API_KEY),
    youtubeRegion: blank(e.YOUTUBE_REGION_CODE)?.toUpperCase(),
    databaseUrl: blank(e.DATABASE_URL),
    supabaseUrl: blank(e.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: blank(e.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: blank(e.SUPABASE_SERVICE_ROLE_KEY),
    appUrl: blank(e.APP_URL) ?? blank(e.NEXT_PUBLIC_APP_URL),
    lyricsProviderUrl: blank(e.LYRICS_PROVIDER_URL),
    lyricsProviderApiKey: blank(e.LYRICS_PROVIDER_API_KEY),
    lyricsProviderName: blank(e.LYRICS_PROVIDER_NAME),
    lyricsDatasetDir: blank(e.LYRICS_DATASET_DIR),
    dataDir: blank(e.DATA_DIR) ?? ".data",
    cronSecret: blank(e.CRON_SECRET),
    partyTtlHours: Number(e.PARTY_TTL_HOURS ?? 24) || 24,
    historyRetentionDays: Number(e.HISTORY_RETENTION_DAYS ?? 7) || 7,
    isVercel: Boolean(e.VERCEL),
    secureCookies: e.NODE_ENV === "production" && !e.INSECURE_COOKIES,
  };
}

export function realtimeKind(): "supabase" | "sse" {
  const env = serverEnv();
  return env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceRoleKey ? "supabase" : "sse";
}
