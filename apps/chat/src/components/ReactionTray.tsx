"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface ReactionTrayProps {
  emojis: string[];
  /** Viewport coords of the message bubble the tray is anchored to. */
  anchorX: number;
  anchorY: number;
  anchorHeight: number;
  placement: "above" | "below";
  onPick: (emoji: string) => void;
  onMore: () => void;
  onClose: () => void;
}

export default function ReactionTray({
  emojis,
  anchorX,
  anchorY,
  anchorHeight,
  placement,
  onPick,
  onMore,
  onClose,
}: ReactionTrayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchorX, top: anchorY });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(window.innerWidth - rect.width - 8, anchorX - rect.width / 2),
    );
    const top = placement === "above" ? anchorY - rect.height - 8 : anchorY + anchorHeight + 8;
    setPos({ left, top: Math.max(8, top) });
  }, [anchorX, anchorY, anchorHeight, placement]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Quick reactions"
      className={`fixed z-[65] flex items-center gap-0.5 rounded-full bg-surface p-1.5 shadow-2xl ring-1 ring-line ${
        placement === "above" ? "tray-pop" : "tray-pop-below"
      }`}
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {emojis.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={`React with ${e}`}
          className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition hover:scale-125 hover:bg-white/5 active:scale-95"
          onClick={() => onPick(e)}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        aria-label="More reactions"
        className="flex h-11 w-9 items-center justify-center rounded-full text-lg font-bold text-soft transition hover:scale-110 hover:text-ghost"
        onClick={onMore}
      >
        +
      </button>
    </div>
  );
}
