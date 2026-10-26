import { cn } from "@/lib/client/cn";

export function Avatar({ emoji, name, size = "md", online, ring, className }: { emoji: string; name?: string; size?: "sm" | "md" | "lg" | "xl"; online?: boolean; ring?: boolean; className?: string }) {
  const sizes = { sm: "h-8 w-8 text-base", md: "h-10 w-10 text-xl", lg: "h-14 w-14 text-3xl", xl: "h-24 w-24 text-5xl" };
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-stage-600 to-stage-800", sizes[size], ring && "ring-2 ring-magenta ring-offset-2 ring-offset-stage-950", className)} title={name} aria-hidden={!name} aria-label={name}>
      <span aria-hidden>{emoji}</span>
      {online !== undefined ? (
        <span className={cn("absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-stage-900", online ? "bg-success" : "bg-faint")} aria-label={online ? "online" : "away"} />
      ) : null}
    </span>
  );
}
