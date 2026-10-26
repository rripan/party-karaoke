import { Trophy } from "lucide-react";
import { BADGE_INFO, type Leaderboard as LeaderboardData, type ParticipantView } from "@/lib/domain/snapshot";
import { EmptyState } from "@/components/ui/states";

/** Playful stats from real activity only — we don't pretend to score singing. */
export function Leaderboard({ data, participants }: { data: LeaderboardData; participants: ParticipantView[] }) {
  const boards = [
    { title: "Most performances", rows: data.performances, unit: "sung" },
    { title: "Most songs submitted", rows: data.submissions, unit: "added" },
    { title: "Most active", rows: data.activity, unit: "pts" },
  ];
  const badged = participants.filter((p) => p.badges.length);
  if (!boards.some((b) => b.rows.length)) {
    return (
      <EmptyState icon={<Trophy className="h-7 w-7 text-gold" />} title="The leaderboard is warming up">
        Stats appear as people add songs and perform. (We count performances — we don&apos;t judge the singing!)
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-testid="leaderboard">
      {badged.length ? (
        <div className="flex flex-wrap gap-2">
          {badged.flatMap((p) =>
            p.badges.map((b) => (
              <span key={`${p.id}-${b}`} title={BADGE_INFO[b].description} className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-sm font-semibold text-gold">
                {BADGE_INFO[b].emoji} {BADGE_INFO[b].label} · {p.displayName}
              </span>
            )),
          )}
        </div>
      ) : null}
      {boards.map((board) =>
        board.rows.length ? (
          <section key={board.title}>
            <h3 className="mb-2 text-xs font-bold tracking-[0.18em] text-faint uppercase">{board.title}</h3>
            <ol className="flex flex-col gap-1.5">
              {board.rows.map((row, i) => (
                <li key={row.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <span className="w-5 text-center font-display font-extrabold text-faint">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                  <span aria-hidden className="text-lg">
                    {row.avatar}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.displayName}</span>
                  <span className="text-sm text-muted tabular-nums">
                    {row.value} {board.unit}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null,
      )}
    </div>
  );
}
