"use client";

import { useParams } from "next/navigation";
import { normalizeRoomCode } from "@ghost/protocol";
import { useIdentity } from "@/lib/useIdentity";
import Onboarding from "@/components/Onboarding";
import DetailsPanel from "@/components/DetailsPanel";

export default function ChatDetailsPage() {
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

  return <DetailsPanel roomId={roomId} />;
}
