"use client";

import { useCallback, useEffect, useRef } from "react";

interface LongPressOptions {
  delay?: number;
  moveThreshold?: number;
  onLongPress: () => void;
}

export function useLongPress({ delay = 450, moveThreshold = 10, onLongPress }: LongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startRef.current = null;
    firedRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clear();
      startRef.current = { x: e.clientX, y: e.clientY };
      firedRef.current = false;
      timer.current = setTimeout(() => {
        firedRef.current = true;
        onLongPressRef.current();
      }, delay);
    },
    [clear, delay],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  const onPointerUp = useCallback(() => {
    clear();
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave: clear };
}
