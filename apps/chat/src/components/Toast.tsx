"use client";

import { useApp } from "@/lib/store";
import { X } from "lucide-react";

export default function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismissToast = useApp((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="toast-in pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-surface/95 px-4 py-2 text-sm font-medium text-ghost shadow-xl backdrop-blur"
        >
          {t.emoji && <span aria-hidden>{t.emoji}</span>}
          <span className="truncate">{t.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="ml-1 shrink-0 text-soft transition hover:text-ghost"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
