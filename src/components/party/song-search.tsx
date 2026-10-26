"use client";

import { Clock3, FlaskConical, Link2, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import type { LyricsAvailability, LyricsMeta, Song } from "@/lib/domain/types";
import { api, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { formatClock } from "@/lib/client/format";
import { looksLikeUrl, parseSongRef } from "@/lib/youtube/url";
import { SongIndicators } from "./indicators";
import { SongArt } from "./song-art";

interface SearchResult {
  song: Song;
  lyrics: LyricsAvailability;
  sample: boolean;
}
interface SearchResponse {
  mode: "live" | "demo";
  results: SearchResult[];
  notice?: string;
}

const FILTERS = [
  { id: "karaoke", label: "Karaoke versions" },
  { id: "all", label: "All" },
  { id: "lyrics", label: "Lyrics videos" },
  { id: "official", label: "Official videos" },
  { id: "popular", label: "Popular" },
  { id: "recent", label: "Recently added" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function songRef(song: Song) {
  return song.source === "demo" ? song.id : (song.youtubeVideoId ?? song.id);
}

export function SongSearch({
  partyId,
  onPick,
  actionLabel = "Add",
  busySongId,
  queuedSongIds,
  initialQuery = "",
  disabledReason,
}: {
  partyId: string;
  onPick: (ref: string, song: Song) => Promise<boolean | void> | void;
  actionLabel?: string;
  busySongId?: string | null;
  queuedSongIds?: Set<string>;
  initialQuery?: string;
  disabledReason?: string | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<FilterId>("karaoke");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ song: Song; lyrics: LyricsAvailability | LyricsMeta } | null>(null);
  const [linkResult, setLinkResult] = useState<{ query: string; status: "ok" | "error"; song?: Song; lyrics?: LyricsMeta; message?: string } | null>(null);
  const reqId = useRef(0);
  const isLink = looksLikeUrl(query);
  const parsedLink = isLink ? parseSongRef(query) : null;
  const link: { status: "idle" | "checking" | "ok" | "error"; song?: Song; lyrics?: LyricsMeta; message?: string } = !parsedLink
    ? { status: "idle" }
    : parsedLink.kind === "invalid"
      ? { status: "error", message: parsedLink.reason }
      : linkResult?.query === query
        ? linkResult
        : { status: "checking" };
  const linkValid = parsedLink !== null && parsedLink.kind !== "invalid";

  // Debounced search (skipped for pasted links, which are validated instead).
  useEffect(() => {
    if (isLink) return;
    const id = ++reqId.current;
    const delay = query.trim() ? 450 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api<SearchResponse>(`/api/search?partyId=${encodeURIComponent(partyId)}&filter=${filter}&q=${encodeURIComponent(query.trim())}`);
        if (id === reqId.current) setData(res);
      } catch (e) {
        if (id === reqId.current) setError(e instanceof ClientApiError ? e.message : "Search failed. Try again.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [query, filter, partyId, isLink]);

  // Validate a pasted YouTube link server-side (deleted/private/embedding-disabled checks).
  useEffect(() => {
    if (!linkValid) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ song: Song; lyrics: LyricsMeta }>(`/api/songs/resolve`, { json: { partyId, ref: query } });
        if (!cancelled) setLinkResult({ query, status: "ok", song: res.song, lyrics: res.lyrics });
      } catch (e) {
        if (!cancelled) setLinkResult({ query, status: "error", message: e instanceof ClientApiError ? e.message : "Couldn't check that link." });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [linkValid, query, partyId]);

  const pick = async (song: Song) => {
    const ok = await onPick(songRef(song), song);
    if (ok !== false) setInspect(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Search songs or paste a YouTube link</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-faint" aria-hidden />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Song, artist, or paste a YouTube link"
          className="h-14 w-full rounded-2xl border border-line-strong bg-black/30 pr-12 pl-12 text-base text-text placeholder:text-faint focus:border-magenta/60 focus:outline-none"
          data-testid="song-search-input"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 text-faint hover:bg-white/10 hover:text-text" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>

      {disabledReason ? <p className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{disabledReason}</p> : null}

      {isLink ? (
        <LinkResult state={link} onAdd={pick} actionLabel={actionLabel} busy={!!link.song && busySongId === link.song.id} disabled={!!disabledReason} />
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin" role="tablist" aria-label="Search filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  filter === f.id ? "border-transparent bg-brand text-white" : "border-line bg-white/5 text-muted hover:text-text",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {data?.mode === "demo" ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-[#fde68a]" data-testid="demo-search-banner">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                <strong>Demo mode · sample songs.</strong> These aren&apos;t live YouTube results. You can still paste a real YouTube link.
              </p>
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <ul className="flex flex-col gap-2" aria-busy={loading} data-testid="search-results">
            {loading && !data
              ? Array.from({ length: 4 }, (_, i) => <li key={i} className="skeleton h-20" />)
              : data?.results.map((r) => (
                  <li key={r.song.id}>
                    <ResultRow
                      result={r}
                      actionLabel={actionLabel}
                      busy={busySongId === r.song.id}
                      queued={queuedSongIds?.has(r.song.id) ?? false}
                      disabled={!!disabledReason}
                      onAdd={() => pick(r.song)}
                      onInspect={() => setInspect({ song: r.song, lyrics: r.lyrics })}
                    />
                  </li>
                ))}
          </ul>
          {loading && data ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-faint" aria-label="Searching" /> : null}
          {!loading && data && !data.results.length ? (
            <EmptyState icon="🔎" title={query ? "No matches" : "Search for a song"}>
              {data.notice ?? (query ? "Try a different spelling, the artist's name, or another filter." : "Try a song title, an artist, or both.")}
            </EmptyState>
          ) : null}
        </>
      )}

      <Dialog open={!!inspect} onClose={() => setInspect(null)} title="Song details" size="md">
        {inspect ? (
          <SongInspector
            song={inspect.song}
            lyrics={inspect.lyrics}
            actionLabel={actionLabel}
            busy={busySongId === inspect.song.id}
            disabled={!!disabledReason}
            onAdd={() => pick(inspect.song)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function ResultRow({ result, actionLabel, busy, queued, disabled, onAdd, onInspect }: { result: SearchResult; actionLabel: string; busy: boolean; queued: boolean; disabled: boolean; onAdd: () => void; onInspect: () => void }) {
  const { song } = result;
  return (
    <div className="card flex items-center gap-3 p-2.5 pr-3" data-testid="search-result">
      <button type="button" onClick={onInspect} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Details for ${song.title}`}>
        <div className="relative">
          <SongArt song={song} className="w-28 sm:w-32" />
          {song.durationSeconds ? (
            <span className="absolute right-1 bottom-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[0.68rem] font-bold tabular-nums">{formatClock(song.durationSeconds)}</span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 leading-snug font-semibold">{song.title}</p>
          <p className="truncate text-sm text-muted">{song.channelName}</p>
          <div className="mt-1.5">
            <SongIndicators song={song} lyrics={result.lyrics} compact />
          </div>
        </div>
      </button>
      <Button size="icon" variant={queued ? "secondary" : "primary"} onClick={onAdd} loading={busy} disabled={disabled || queued} aria-label={queued ? `${song.title} is already queued` : `${actionLabel} ${song.title}`} data-testid="add-song">
        {busy ? null : queued ? <Clock3 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      </Button>
    </div>
  );
}

function LinkResult({ state, onAdd, actionLabel, busy, disabled }: { state: { status: string; song?: Song; lyrics?: LyricsMeta; message?: string }; onAdd: (s: Song) => void; actionLabel: string; busy: boolean; disabled: boolean }) {
  if (state.status === "checking") {
    return (
      <div className="card flex items-center gap-3 p-4 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Checking that link with YouTube…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger" data-testid="link-error">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.message}
      </div>
    );
  }
  if (state.status === "ok" && state.song) {
    return <SongInspector song={state.song} lyrics={state.lyrics ?? null} actionLabel={actionLabel} busy={busy} disabled={disabled} onAdd={() => onAdd(state.song!)} />;
  }
  return null;
}

function SongInspector({ song, lyrics, actionLabel, busy, disabled, onAdd }: { song: Song; lyrics: LyricsAvailability | LyricsMeta | null; actionLabel: string; busy: boolean; disabled: boolean; onAdd: () => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        {preview && song.youtubeVideoId ? (
          <iframe
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${song.youtubeVideoId}?autoplay=1&playsinline=1&rel=0`}
            title={`Preview of ${song.title}`}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <SongArt song={song} className="w-full" rounded="rounded-none" />
        )}
      </div>
      <div>
        <p className="font-display text-lg leading-snug font-bold">{song.title}</p>
        <p className="text-muted">
          {song.channelName}
          {song.durationSeconds ? ` · ${formatClock(song.durationSeconds)}` : " · duration unknown"}
        </p>
        <div className="mt-2">
          <SongIndicators song={song} lyrics={lyrics} />
        </div>
        {song.metadata.classificationBasis ? <p className="mt-2 text-xs text-faint">Why these labels: {song.metadata.classificationBasis}.</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" onClick={onAdd} loading={busy} disabled={disabled} data-testid="inspector-add">
          <Plus className="h-5 w-5" aria-hidden /> {actionLabel}
        </Button>
        {song.youtubeVideoId && !preview ? (
          <Button size="lg" variant="secondary" onClick={() => setPreview(true)}>
            Preview
          </Button>
        ) : null}
      </div>
      {song.source === "demo" ? <p className="text-xs text-faint">Sample track for demo mode. It plays as a labelled simulation on the TV (no audio).</p> : null}
    </div>
  );
}
