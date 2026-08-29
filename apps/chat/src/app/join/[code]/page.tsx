"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { normalizeRoomCode } from "@ghost/protocol";
import { openRoom } from "@/lib/session";
import { useApp } from "@/lib/store";
import { useIdentity } from "@/lib/useIdentity";
import Onboarding from "@/components/Onboarding";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { identity, ready } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const roomId = normalizeRoomCode(String(params?.code ?? ""));

  useEffect(() => {
    if (!ready || !identity || !roomId) return;
    openRoom({
      roomId,
      mode: "join",
      identity,
      callbacks: { onError: (_id, msg) => useApp.getState().setRoomError(msg) },
    })
      .then(() => router.replace(`/c/${roomId}`))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not join room"));
  }, [ready, identity, roomId, router]);

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

  return (
    <div className="chat-bg flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">🚪</div>
      <p className="text-[#8696a0]">Joining room {roomId ? roomId.slice(0, 4) + "-" + roomId.slice(4) : "…"}</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && <div className="h-2 w-32 animate-pulse rounded-full bg-[#2a3942]" />}
    </div>
  );
}
