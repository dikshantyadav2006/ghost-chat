"use client";

import { useParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { normalizeRoomCode } from "@ghost/protocol";
import { useIdentity } from "@/lib/useIdentity";
import { repo } from "@/lib/identity";
import { useApp } from "@/lib/store";
import Onboarding from "@/components/Onboarding";
import ChatScreen from "@/components/ChatScreen";
import DetailsPanel from "@/components/DetailsPanel";

export default function ChatPage() {
  const params = useParams<{ code: string }>();
  const { identity, ready } = useIdentity();
  const roomId = normalizeRoomCode(String(params?.code ?? ""));

  if (!ready) {
    return (
      <div className="chat-bg flex h-full items-center justify-center text-[#8696a0]">
        Loading…
      </div>
    );
  }

  if (!identity) {
    return <Onboarding onDone={() => undefined} />;
  }

  if (!roomId) {
    return (
      <div className="chat-bg flex h-full items-center justify-center text-[#8696a0]">
        Invalid room code
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0">
      <div className="min-w-0 flex-1">
        <ChatScreen key={roomId} roomId={roomId} identity={identity} />
      </div>
      <div className="hidden h-full lg:block">
        <DesktopDetails roomId={roomId} />
      </div>
    </div>
  );
}

/**
 * Shows the right-hand details panel on desktop when the user has it open and
 * the room has been claimed by a peer (a name exists). Mounting/unmounting the
 * panel resizes the conversation beside it automatically.
 */
function DesktopDetails({ roomId }: { roomId: string }) {
  const open = useApp((s) => s.detailsOpen);
  const room = useLiveQuery(() => repo.getRoomById(roomId), [roomId], null);
  if (!open || !room?.peerName) return null;
  return <DetailsPanel roomId={roomId} embedded />;
}
