import { Download, History, RotateCcw } from "lucide-react";
import type { HistoryView } from "@/lib/domain/snapshot";
import { Chip } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/states";
import { SongArt } from "./song-art";

const OUTCOME = {
  completed: { label: "Sung", tone: "success" as const },
  skipped: { label: "Skipped", tone: "neutral" as const },
  unavailable: { label: "Unavailable", tone: "danger" as const },
};

export function HistoryList({ history, onReplay, exportHref }: { history: HistoryView[]; onReplay?: (h: HistoryView) => void; exportHref?: string }) {
  if (!history.length) {
    return (
      <EmptyState icon={<History className="h-7 w-7 text-muted" />} title="No songs played yet">
        Finished performances land here, with who sang them.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {exportHref ? (
        <div className="flex gap-2">
          <a href={`${exportHref}?format=csv`} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm font-semibold text-muted hover:text-text" download>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </a>
          <a href={`${exportHref}?format=json`} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm font-semibold text-muted hover:text-text" download>
            <Download className="h-4 w-4" aria-hidden /> JSON
          </a>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2" data-testid="history-list">
        {history.map((h) => (
          <li key={h.id} className="card flex items-center gap-3 p-2.5">
            <SongArt song={h.song} className="w-16" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{h.song.title}</p>
              <p className="truncate text-sm text-muted">
                {h.performer.avatar} {h.performer.displayName} · {new Date(h.playedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </p>
              <div className="mt-1">
                <Chip tone={OUTCOME[h.completionStatus].tone}>{OUTCOME[h.completionStatus].label}</Chip>
              </div>
            </div>
            {onReplay ? (
              <button type="button" onClick={() => onReplay(h)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-faint hover:bg-white/10 hover:text-text" aria-label={`Replay ${h.song.title}`} title="Queue again">
                <RotateCcw className="h-4 w-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
