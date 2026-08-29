"use client";

import { useApp } from "./store";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  return Notification.requestPermission();
}

/**
 * Shows a desktop notification for an incoming message. Suppressed while the
 * chat for that room is focused and the tab is visible.
 */
export async function notifyIncoming(args: {
  roomId: string;
  peerName: string;
  text: string;
}): Promise<void> {
  if (!notificationsSupported()) return;
  const prefs = useApp.getState().prefs;
  if (!prefs.notifications) return;
  if (Notification.permission !== "granted") return;
  const state = useApp.getState();
  if (!document.hidden && state.activeRoomId === args.roomId) return;
  try {
    const n = new Notification(args.peerName || "Ghost", {
      body: args.text.slice(0, 140),
      tag: args.roomId,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = `/c/${args.roomId}`;
      n.close();
    };
  } catch {
    // notifications unavailable in this context
  }
}
