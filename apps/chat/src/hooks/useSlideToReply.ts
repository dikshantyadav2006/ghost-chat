"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_SLIDE = 64;
const THRESHOLD = 40;

interface SlideToReplyOptions {
  mine: boolean;
  onReply: () => void;
  /** Cleared by parent when reply is cancelled so the bubble springs back. */
  active: boolean;
}

/**
 * Slide a message bubble toward the center to reveal a reply arrow and enter
 * reply mode on release (Instagram-style). Returns handlers + a ref to attach
 * to the bubble element; transform is applied directly for zero re-renders.
 */
export function useSlideToReply({ mine, onReply, active }: SlideToReplyOptions) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const engagedRef = useRef(false);
  const [engaged, setEngaged] = useState(false);

  const reset = useCallback((transition = true) => {
    const el = bubbleRef.current;
    if (el) {
      el.style.transition = transition ? "transform 0.25s cubic-bezier(0.2, 0.8, 0.4, 1)" : "none";
      el.style.transform = "translateX(0px)";
    }
    engagedRef.current = false;
    setEngaged(false);
    draggingRef.current = false;
    startRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    draggingRef.current = false;
    const el = bubbleRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.willChange = "transform";
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!draggingRef.current) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        draggingRef.current = true;
      }
      const rawDx = mine ? -dx : dx;
      const clampDx = Math.max(0, Math.min(MAX_SLIDE, rawDx));
      const el = bubbleRef.current;
      if (el) el.style.transform = `translateX(${clampDx}px)`;
      const nowEngaged = clampDx >= THRESHOLD;
      if (nowEngaged !== engagedRef.current) {
        engagedRef.current = nowEngaged;
        setEngaged(nowEngaged);
      }
    },
    [mine],
  );

  const finish = useCallback(() => {
    const el = bubbleRef.current;
    if (el) el.style.willChange = "auto";
    if (draggingRef.current && el) {
      const transform = el.style.transform;
      const dx = transform ? Number.parseFloat(transform.replace(/[^\d.-]/g, "")) || 0 : 0;
      if (dx >= THRESHOLD) {
        el.style.transition = "transform 0.25s cubic-bezier(0.2, 0.8, 0.4, 1)";
        el.style.transform = `translateX(${MAX_SLIDE}px)`;
        engagedRef.current = true;
        setEngaged(true);
        onReply();
      } else {
        reset();
      }
    } else {
      reset();
    }
    startRef.current = null;
    draggingRef.current = false;
  }, [onReply, reset]);

  const onPointerUp = useCallback(() => finish(), [finish]);
  const onPointerCancel = useCallback(() => reset(false), [reset]);

  useEffect(() => {
    if (!active && engagedRef.current) {
      const el = bubbleRef.current;
      if (el) {
        el.style.transition = "transform 0.25s cubic-bezier(0.2, 0.8, 0.4, 1)";
        el.style.transform = "translateX(0px)";
      }
      engagedRef.current = false;
      setEngaged(false);
    }
  }, [active]);

  return {
    bubbleRef,
    engaged,
    draggingRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
