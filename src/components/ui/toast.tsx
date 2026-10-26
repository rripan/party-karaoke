"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, PartyPopper, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/client/cn";

type Tone = "success" | "info" | "warning" | "error" | "party";

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}

interface ToastApi {
  toast: (t: { title: string; description?: string; tone?: Tone; key?: string; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const icons = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: TriangleAlert,
  party: PartyPopper,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const recent = useRef(new Map<string, number>());

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastApi["toast"]>(
    ({ title, description, tone = "info", key, durationMs = 4200 }) => {
      // De-duplicate bursts of the same message so the party isn't spammed.
      const dedupe = key ?? `${tone}:${title}`;
      const last = recent.current.get(dedupe);
      if (last && Date.now() - last < 4000) return;
      recent.current.set(dedupe, Date.now());
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-2), { id, title, description, tone }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-3 sm:items-end sm:p-5">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                role={t.tone === "error" ? "alert" : "status"}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-stage-850/95 px-4 py-3 shadow-2xl backdrop-blur-xl",
                  t.tone === "success" && "border-success/35",
                  t.tone === "info" && "border-line-strong",
                  t.tone === "warning" && "border-warning/40",
                  t.tone === "error" && "border-danger/45",
                  t.tone === "party" && "border-magenta/50 shadow-[var(--shadow-glow)]",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    t.tone === "success" && "text-success",
                    t.tone === "info" && "text-spark",
                    t.tone === "warning" && "text-warning",
                    t.tone === "error" && "text-danger",
                    t.tone === "party" && "text-magenta",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{t.title}</p>
                  {t.description ? <p className="mt-0.5 text-sm text-muted">{t.description}</p> : null}
                </div>
                <button type="button" onClick={() => dismiss(t.id)} className="-mr-1 rounded-lg p-1 text-faint hover:text-text" aria-label="Dismiss notification">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
