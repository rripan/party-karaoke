import { Captions, CaptionsOff, Clapperboard, FileText, Mic2, Music, Sparkles } from "lucide-react";
import type { LyricsAvailability, LyricsMeta, Song } from "@/lib/domain/types";
import { Chip } from "@/components/ui/controls";

/**
 * Honest song badges. Video-type badges come from real metadata (title/channel)
 * and say so in their tooltip. "Synced lyrics" appears only after a lyrics
 * provider has actually returned timed lyrics for this exact song.
 */
export function SongIndicators({ song, lyrics, compact }: { song: Song; lyrics?: LyricsAvailability | LyricsMeta | null; compact?: boolean }) {
  const status = typeof lyrics === "string" ? lyrics : lyrics?.availabilityStatus;
  const timing = typeof lyrics === "object" && lyrics ? lyrics.timingFormat : null;
  const kind = song.metadata.videoKind;
  const basis = song.metadata.classificationBasis;
  const chips: React.ReactNode[] = [];

  if (song.source === "demo") chips.push(<Chip key="sample" tone="warning" title="Bundled sample track for demo mode — not a YouTube video">Sample</Chip>);
  if (kind === "karaoke") {
    chips.push(
      <Chip key="k" tone="brand" title={basis ?? "Karaoke version"}>
        <Mic2 className="h-3 w-3" aria-hidden /> Karaoke
      </Chip>,
    );
  }
  if (song.metadata.lyricsInVideo === "likely") {
    chips.push(
      <Chip key="emb" tone="spark" title={`${basis ?? "Metadata"} — lyrics are probably shown in the video itself`}>
        <Captions className="h-3 w-3" aria-hidden /> {compact ? "On-screen" : "Lyrics in video"}
      </Chip>,
    );
  }
  if (kind === "official") {
    chips.push(
      <Chip key="o" title={basis ?? "Official video"}>
        <Clapperboard className="h-3 w-3" aria-hidden /> Music video
      </Chip>,
    );
  }
  if (kind === "instrumental") {
    chips.push(
      <Chip key="i" title={basis ?? "Instrumental"}>
        <Music className="h-3 w-3" aria-hidden /> Instrumental
      </Chip>,
    );
  }
  if (status === "synced") {
    chips.push(
      <Chip key="s" tone="success" title={`Timed lyrics verified (${timing === "word" ? "word-by-word" : "line-by-line"})`}>
        <Sparkles className="h-3 w-3" aria-hidden /> Synced lyrics
      </Chip>,
    );
  } else if (status === "plain") {
    chips.push(
      <Chip key="p" title="Lyrics available without timing — shown unsynchronised">
        <FileText className="h-3 w-3" aria-hidden /> Lyrics (not synced)
      </Chip>,
    );
  } else if ((status === "unavailable" || status === "error") && song.metadata.lyricsInVideo !== "likely" && !compact) {
    chips.push(
      <Chip key="u" title="No authorised separate lyrics found for this song">
        <CaptionsOff className="h-3 w-3" aria-hidden /> No separate lyrics
      </Chip>,
    );
  }
  if (!chips.length) return null;
  return <span className="flex flex-wrap gap-1.5">{chips}</span>;
}
