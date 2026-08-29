"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { usePathname } from "next/navigation";
import { repo } from "@/lib/identity";

export default function UnreadTitle() {
  const unread = useLiveQuery(() => repo.sumUnread(), [], 0);
  const pathname = usePathname();

  useEffect(() => {
    const inApp =
      pathname === "/start" ||
      pathname.startsWith("/c/") ||
      pathname.startsWith("/join/");
    if (!inApp) return;
    document.title = unread > 0 ? `(${unread}) GhostChat` : "GhostChat";
  }, [unread, pathname]);

  // App-icon badge (Android / desktop PWA). Falls back to the document title
  // counter above where the platform has no badge API.
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (unread > 0) {
      void navigator.setAppBadge(unread).catch(() => {});
    } else {
      void navigator.clearAppBadge().catch(() => {});
    }
  }, [unread]);

  return null;
}
