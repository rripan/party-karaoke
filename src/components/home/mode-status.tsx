"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/client/cn";

interface Config {
  search: "live" | "demo";
  storage: "memory" | "postgres";
  realtime: "sse" | "supabase";
  lyricsProviders: string[];
}

/** Honest status of what's live vs. demo on this deployment. */
export function ModeStatus() {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);
  if (!config) return <div className="skeleton h-9 w-72" />;
  const items = [
    { ok: config.search === "live", on: "Live YouTube search", off: "Demo search (sample songs)" },
    { ok: config.storage === "postgres", on: "Database: Postgres", off: "Storage: this server (local)" },
    { ok: config.realtime === "supabase", on: "Realtime: Supabase", off: "Realtime: server events" },
    { ok: config.lyricsProviders.length > 1, on: "Licensed lyrics provider", off: "Lyrics: sample tracks only" },
  ];
  return (
    <ul className="flex flex-wrap gap-2" data-testid="mode-status">
      {items.map((i) => (
        <li key={i.on} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", i.ok ? "border-success/30 text-success" : "border-warning/30 text-warning")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", i.ok ? "bg-success" : "bg-warning")} aria-hidden />
          {i.ok ? i.on : i.off}
        </li>
      ))}
    </ul>
  );
}
