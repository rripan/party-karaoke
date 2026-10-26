import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/client/cn";
import { buttonClasses } from "./button";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-block h-6 w-6 animate-spin rounded-full border-[3px] border-white/20 border-t-magenta", className)} />
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-white/6 text-3xl">{icon}</div> : null}
      <p className="font-display text-lg font-bold">{title}</p>
      {children ? <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function FullScreenMessage({
  emoji,
  title,
  children,
  action,
}: {
  emoji: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <main className="stage-bg-aurora flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <Link href="/" className="mb-10" aria-label="Party Karaoke home">
        <Logo />
      </Link>
      <div className="mb-6 text-6xl" aria-hidden>
        {emoji}
      </div>
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{title}</h1>
      {children ? <div className="mt-3 max-w-md text-muted">{children}</div> : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {action ?? (
          <Link href="/" className={buttonClasses("secondary", "lg")}>
            Back to home
          </Link>
        )}
      </div>
    </main>
  );
}

export function LoadingScreen({ label = "Warming up the mic…" }: { label?: string }) {
  return (
    <main className="stage-bg-midnight flex min-h-dvh flex-col items-center justify-center gap-5">
      <Spinner className="h-10 w-10" />
      <p className="text-muted">{label}</p>
    </main>
  );
}
