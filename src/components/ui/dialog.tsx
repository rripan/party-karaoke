"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/client/cn";

/**
 * Accessible modal built on the native <dialog> element: focus trapping,
 * Escape-to-close and the top layer come for free.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-[1.6rem] border border-line-strong bg-stage-900 p-0 text-text shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-lg",
        size === "lg" && "max-w-2xl",
        size === "xl" && "max-w-4xl",
        className,
      )}
    >
      {open ? (
        <div className="max-h-[85dvh] overflow-y-auto scrollbar-thin p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="dialog-title" className="font-display text-xl font-bold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-xl p-2 text-muted hover:bg-white/10 hover:text-text"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex justify-end gap-3">
        <button type="button" className="h-11 rounded-2xl px-5 font-semibold text-muted hover:bg-white/10 hover:text-text" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={cn(
            "h-11 rounded-2xl px-5 font-semibold disabled:opacity-50",
            danger ? "bg-danger text-stage-950 hover:brightness-110" : "bg-brand text-white",
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
