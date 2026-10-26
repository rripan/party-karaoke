import { cn } from "@/lib/client/cn";

/** Decorative equalizer bars. Paused bars sit still; reduced motion stops them. */
export function Visualizer({ bars = 5, playing = true, className }: { bars?: number; playing?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-5 items-end gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn("w-[3px] origin-bottom rounded-full bg-brand", playing ? "animate-bar" : "scale-y-[0.3]")}
          style={{ height: "100%", animationDelay: `${(i * 0.17) % 0.9}s`, animationDuration: `${0.8 + ((i * 37) % 5) / 10}s` }}
        />
      ))}
    </span>
  );
}
