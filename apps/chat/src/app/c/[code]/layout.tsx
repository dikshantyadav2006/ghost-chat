"use client";

import type { ReactNode } from "react";
import { useIdentity } from "@/lib/useIdentity";
import ChatListSidebar from "@/components/ChatListSidebar";

/**
 * Desktop shell for the room routes: a persistent chat-list sidebar on the
 * left (lg+), with the active route (conversation or chat details) beside it.
 * Mobile keeps the previous route-based navigation untouched.
 */
export default function RoomLayout({ children }: { children: ReactNode }) {
  const { identity } = useIdentity();

  return (
    <div className="flex h-full w-full">
      {identity && (
        <div className="hidden lg:block">
          <ChatListSidebar identity={identity} />
        </div>
      )}
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  );
}
