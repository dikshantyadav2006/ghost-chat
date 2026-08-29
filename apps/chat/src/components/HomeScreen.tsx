"use client";

import type { LocalIdentity } from "@ghost/protocol";
import ChatListSidebar from "./ChatListSidebar";

export default function HomeScreen({ identity }: { identity: LocalIdentity }) {
  return (
    <div className="flex h-full w-full">
      <ChatListSidebar identity={identity} />
      <div className="chat-bg hidden flex-1 flex-col items-center justify-center gap-4 px-8 text-center lg:flex">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-mint/10 text-6xl">
          <span aria-hidden>👻</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-ghost">GhostChat</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-soft">
            Select a conversation on the left to start chatting. Every message is end-to-end
            encrypted and travels directly between devices.
          </p>
        </div>
      </div>
    </div>
  );
}
