"use client";

import { useApp } from "@/lib/store";

export function useHaptics() {
  const enabled = useApp((s) => s.prefs.haptics);
  return (pattern: number | number[]): void => {
    if (!enabled || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  };
}
