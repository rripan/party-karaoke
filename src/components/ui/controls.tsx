"use client";

import { useId } from "react";
import { cn } from "@/lib/client/cn";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-semibold text-text">
          {label}
        </label>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-50",
          checked ? "border-transparent bg-brand" : "border-line-strong bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-[1.375rem] w-[1.375rem] rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[1.35rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-black/25 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-xl font-semibold transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            value === o.value ? "bg-white/15 text-text shadow-inner" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="mb-2">
        <p className="font-semibold">{label}</p>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v: number) => String(v),
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
}) {
  return (
    <div className="inline-flex items-center rounded-2xl border border-line bg-black/25" role="group" aria-label={label}>
      <button type="button" className="h-10 w-10 text-lg font-bold text-muted hover:text-text disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={`Decrease ${label}`}>
        −
      </button>
      <output className="min-w-20 text-center font-semibold tabular-nums" aria-live="polite">
        {format(value)}
      </output>
      <button type="button" className="h-10 w-10 text-lg font-bold text-muted hover:text-text disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

export function Chip({ children, tone = "neutral", className, title }: { children: React.ReactNode; tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "spark"; className?: string; title?: string }) {
  const tones = {
    neutral: "bg-white/8 text-muted border-line",
    brand: "bg-magenta/15 text-[#f5c2ff] border-magenta/30",
    success: "bg-success/12 text-success border-success/30",
    warning: "bg-warning/12 text-warning border-warning/30",
    danger: "bg-danger/12 text-danger border-danger/30",
    spark: "bg-spark/12 text-spark border-spark/30",
  };
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-bold tracking-wide uppercase", tones[tone], className)}>
      {children}
    </span>
  );
}
