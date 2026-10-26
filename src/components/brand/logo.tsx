import { cn } from "@/lib/client/cn";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand shadow-[var(--shadow-glow-pink)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
        </svg>
      </span>
      {!compact ? (
        <span className="font-display text-lg leading-none font-extrabold tracking-tight">
          Party<span className="text-gradient">Karaoke</span>
        </span>
      ) : null}
    </span>
  );
}
