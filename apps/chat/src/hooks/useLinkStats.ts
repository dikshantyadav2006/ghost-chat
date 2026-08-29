import { useEffect } from "react";
import { getSession } from "@/lib/session";
import { useApp } from "@/lib/store";

/**
 * Polls WebRTC stats while the P2P link is up and keeps the room's live
 * RTT in the app store. Drives the connection-health widget and the status
 * line in the chat header. Stops when the link drops or the room unmounts.
 */
export function useLinkStats(roomId: string): void {
  const peerState = useApp((s) => s.peerState[roomId]);
  useEffect(() => {
    if (peerState !== "connected") return;
    let stopped = false;
    const poll = async () => {
      const s = getSession(roomId);
      if (!s || stopped) return;
      const stats = await s.getLinkStats();
      if (!stopped) useApp.getState().setLinkStats(roomId, stats);
    };
    void poll();
    const iv = setInterval(poll, 2500);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [roomId, peerState]);
}
