"use client";

import { useMemo, useState } from "react";
import type { RoomRow } from "@ghost/storage";
import { X } from "lucide-react";

interface ForwardModalProps {
  rooms: RoomRow[];
  onForward: (room: RoomRow) => void;
  onClose: () => void;
}

export default function ForwardModal({ rooms, onForward, onClose }: ForwardModalProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter(
      (r) => r.peerName.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
    );
  }, [rooms, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="zoom-fade w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="shrink-0 font-semibold text-ghost">Forward to…</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 text-sm text-ghost outline-none placeholder:text-soft"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-soft transition hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-soft">No other chats available</p>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {filtered.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => onForward(room)}
                  className="flex w-full items-center gap-3 px-2 py-2.5 text-left transition hover:bg-raised"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-base">
                    👻
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ghost">
                      {room.peerName}
                    </span>
                    <span className="block truncate text-xs text-soft">{room.code}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
