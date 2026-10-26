import { Music2 } from "lucide-react";
import { getDemoTrack } from "@/lib/demo/catalog";
import type { Song } from "@/lib/domain/types";
import { cn } from "@/lib/client/cn";

function hashHue(input: string) {
  let h = 0;
  for (const c of input) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Thumbnail, or a colourful generated cover for sample songs / missing art. */
export function SongArt({ song, className, rounded = "rounded-xl" }: { song: Song; className?: string; rounded?: string }) {
  if (song.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnails are already optimised; avoid proxying them
      <img
        src={song.thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="strict-origin-when-cross-origin"
        className={cn("aspect-video shrink-0 bg-stage-800 object-cover", rounded, className)}
      />
    );
  }
  const track = song.metadata.demoTrackId ? getDemoTrack(song.metadata.demoTrackId) : undefined;
  const hue = hashHue(song.id);
  const [a, b] = track?.colors ?? [`hsl(${hue} 80% 55%)`, `hsl(${(hue + 70) % 360} 85% 55%)`];
  return (
    <div
      aria-hidden
      className={cn("relative grid aspect-video shrink-0 place-items-center overflow-hidden", rounded, className)}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_45%)]" />
      <Music2 className="relative h-1/3 w-1/3 text-white/90 drop-shadow" />
    </div>
  );
}
