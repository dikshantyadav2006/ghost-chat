"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(innerWidth - rect.width - 8, x)),
      top: Math.max(8, Math.min(innerHeight - rect.height - 8, y)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onBlur = () => onClose();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const handleKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const btns = ref.current?.querySelectorAll<HTMLButtonElement>("button");
      btns?.[Math.min(index + 1, items.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const btns = ref.current?.querySelectorAll<HTMLButtonElement>("button");
      btns?.[Math.max(index - 1, 0)]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      items[index]?.onClick();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Message actions"
      className="fade-in fixed z-[65] w-48 overflow-hidden rounded-xl bg-surface py-1.5 shadow-2xl ring-1 ring-line"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          ref={i === 0 ? firstRef : undefined}
          type="button"
          role="menuitem"
          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition focus:bg-white/5 focus:outline-none ${
            item.danger ? "text-red-400 hover:bg-red-950/60" : "text-ghost hover:bg-white/5"
          }`}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          onKeyDown={(e) => handleKey(e, i)}
        >
          {item.icon && (
            <span className="w-5 text-center" aria-hidden>
              {item.icon}
            </span>
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
