import { UserMinus, Users } from "lucide-react";
import { BADGE_INFO, type ParticipantView } from "@/lib/domain/snapshot";
import { EmptyState } from "@/components/ui/states";
import { Avatar } from "./avatar";

export function GuestList({ participants, onRemove }: { participants: ParticipantView[]; onRemove?: (p: ParticipantView) => void }) {
  if (!participants.length) {
    return (
      <EmptyState icon={<Users className="h-7 w-7 text-muted" />} title="Waiting for guests">
        Share the QR code — guests appear here the moment they join.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5" data-testid="guest-list">
      {participants.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2">
          <Avatar emoji={p.avatar} online={p.online} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {p.displayName} {p.badges.map((b) => <span key={b} title={BADGE_INFO[b].label}>{BADGE_INFO[b].emoji}</span>)}
            </p>
            <p className="text-xs text-muted">
              {p.submittedCount} added · {p.performanceCount} sung · {p.online ? "online" : "away"}
            </p>
          </div>
          {onRemove ? (
            <button type="button" onClick={() => onRemove(p)} className="grid h-9 w-9 place-items-center rounded-xl text-faint hover:bg-danger/15 hover:text-danger" aria-label={`Remove ${p.displayName} from the party`} title="Remove guest">
              <UserMinus className="h-4 w-4" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
