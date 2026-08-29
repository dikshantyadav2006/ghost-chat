"use client";

import { useEffect } from "react";
import type { LocalIdentity } from "@ghost/protocol";
import { loadIdentity } from "@/lib/identity";
import { useApp } from "@/lib/store";
import { openAllRooms } from "@/lib/session";

export function useIdentity(): { identity: LocalIdentity | null; ready: boolean } {
  const identity = useApp((s) => s.identity);
  const ready = useApp((s) => s.ready);
  const setIdentity = useApp((s) => s.setIdentity);
  const setReady = useApp((s) => s.setReady);

  useEffect(() => {
    void (async () => {
      const id = await loadIdentity();
      setIdentity(id);
      if (id) {
        // App-level presence: open every stored room in the background (not
        // awaited) so messages/calls/files arrive no matter which screen is
        // open, without blocking first paint.
        void openAllRooms(id);
      }
    })().finally(() => setReady(true));
  }, [setIdentity, setReady]);

  return { identity, ready };
}
