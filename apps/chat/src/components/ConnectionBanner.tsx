"use client";

import { useApp } from "@/lib/store";
import { AlertTriangle } from "lucide-react";

export default function ConnectionBanner({ roomId }: { roomId: string }) {
  const online = useApp((s) => s.online[roomId]);
  const peerState = useApp((s) => s.peerState[roomId]);
  const transport = useApp((s) => s.transport[roomId]);
  const typing = useApp((s) => s.typing[roomId]);
  const roomError = useApp((s) => s.roomError);
  const setRoomError = useApp((s) => s.setRoomError);

  if (typing) {
    return (
      <div className="flex items-center gap-2 bg-raised px-4 py-1.5 text-sm text-mint">
        <span className="inline-flex items-center leading-none">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
        typing
      </div>
    );
  }

  if (roomError) {
    return (
      <div className="flex items-center gap-2 bg-red-950 px-4 py-1.5 text-sm text-red-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{roomError}</span>
        <button
          type="button"
          className="ml-auto text-xs underline"
          onClick={() => setRoomError(null)}
        >
          dismiss
        </button>
      </div>
    );
  }

  if (peerState === "failed") {
    return (
      <div className="flex items-center gap-2 bg-red-950 px-4 py-1.5 text-sm text-red-300">
        <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
        Peer connection failed — retrying…
      </div>
    );
  }

  if (peerState === "disconnected" || peerState === "reconnecting") {
    return (
      <div className="flex items-center gap-2 bg-raised px-4 py-1.5 text-sm text-amber">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber" />
        Peer connection lost — reconnecting…
      </div>
    );
  }

  if (peerState === "connecting") {
    return (
      <div className="flex items-center gap-2 bg-raised px-4 py-1.5 text-sm text-amber">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber" />
        Connecting securely…
      </div>
    );
  }

  if (!online) {
    return (
      <div className="flex items-center gap-2 bg-raised px-4 py-1.5 text-sm text-soft">
        <span className="inline-block h-2 w-2 rounded-full bg-soft" />
        Peer offline — messages will sync when you&apos;re both online
      </div>
    );
  }

  const transportLabel =
    transport === "relay" ? " · relayed via TURN" : transport === "direct" ? " · direct" : "";

  return (
    <div className="flex items-center gap-2 bg-raised px-4 py-1.5 text-sm text-mint">
      <span className="inline-block h-2 w-2 rounded-full bg-mint" />
      Encrypted · peer online{transportLabel}
    </div>
  );
}
