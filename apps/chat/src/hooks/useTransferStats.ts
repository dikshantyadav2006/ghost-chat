"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FileRow } from "@ghost/storage";
import { repo } from "@/lib/identity";
import { useApp } from "@/lib/store";

/**
 * Samples in-flight transfer progress once per second and publishes live
 * per-file speeds/ETA plus aggregate up/down throughput to the app store.
 * Called once per open chat so the connection widget and file cards share a
 * single sampler instead of each running their own interval.
 */
export function useTransferStats(roomId: string): void {
  const files = useLiveQuery(() => repo.listFiles(roomId), [roomId], [] as FileRow[]);

  useEffect(() => {
    const sample: Record<string, { ts: number; received: number }> = {};
    const iv = setInterval(() => {
      const now = Date.now();
      let up = 0;
      let down = 0;
      const perFile: Record<string, { speed: number; etaS: number | null }> = {};
      for (const f of files) {
        if (f.status !== "transferring") continue;
        const received = Math.round(f.size * f.progress);
        const last = sample[f.id];
        let speed = 0;
        if (last && received >= last.received) {
          const dt = (now - last.ts) / 1000;
          if (dt > 0) {
            speed = (received - last.received) / dt;
            if (speed > 0) {
              if (f.direction === "out") up += speed;
              else down += speed;
            }
          }
        }
        sample[f.id] = { ts: now, received };
        const remaining = Math.max(0, f.size - received);
        perFile[f.id] = { speed, etaS: speed > 0 ? remaining / speed : null };
      }
      useApp.getState().setTransferSpeeds({ up, down });
      useApp.getState().setTransferStats(perFile);
    }, 1000);
    return () => clearInterval(iv);
  }, [files]);
}
