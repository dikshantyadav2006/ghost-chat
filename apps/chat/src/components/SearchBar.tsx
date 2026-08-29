"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";

interface SearchBarProps {
  query: string;
  resultCount: number;
  onQueryChange: (query: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export default function SearchBar({
  query,
  resultCount,
  onQueryChange,
  onPrev,
  onNext,
  onClose,
}: SearchBarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-raised px-3 py-2">
      <input
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) onPrev();
          else if (e.key === "Enter") onNext();
          else if (e.key === "Escape") onClose();
        }}
        placeholder="Search messages…"
        className="min-h-10 flex-1 rounded-lg bg-white/5 px-4 py-2 text-sm text-ghost outline-none placeholder:text-soft"
        aria-label="Search messages"
      />
      <span className="shrink-0 text-xs tabular-nums text-soft">
        {resultCount} hit{resultCount === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={onPrev}
        disabled={resultCount === 0}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ghost transition hover:bg-white/5 disabled:opacity-40"
        aria-label="Previous match"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={resultCount === 0}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ghost transition hover:bg-white/5 disabled:opacity-40"
        aria-label="Next match"
      >
        <ArrowDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex h-10 w-10 items-center justify-center rounded-full text-soft transition hover:bg-white/5"
        aria-label="Close search"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
