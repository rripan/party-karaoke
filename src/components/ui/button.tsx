import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/client/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "xl" | "icon" | "icon-lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[var(--shadow-glow-pink)] hover:brightness-110 active:brightness-95 disabled:shadow-none",
  secondary: "bg-white/10 text-text hover:bg-white/15 border border-line",
  outline: "border border-line-strong text-text hover:bg-white/5",
  ghost: "text-muted hover:text-text hover:bg-white/8",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[0.95rem] gap-2 rounded-2xl",
  lg: "h-14 px-7 text-base gap-2.5 rounded-2xl",
  xl: "h-16 px-9 text-lg gap-3 rounded-[1.4rem]",
  icon: "h-11 w-11 rounded-2xl",
  "icon-lg": "h-14 w-14 rounded-[1.1rem]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-all duration-150",
    "disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}
