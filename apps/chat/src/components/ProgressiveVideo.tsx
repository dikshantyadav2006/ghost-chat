"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { FileRow } from "@ghost/storage";

interface ProgressiveVideoProps {
  file: FileRow;
  url: string | null;
  className?: string;
  controls?: boolean;
  /** Start playing automatically once enough data is buffered. */
  autoPlay?: boolean;
  preload?: "none" | "metadata" | "auto";
  videoRef?: RefObject<HTMLVideoElement | null>;
  onPlayChange?: (playing: boolean) => void;
  onCanPlay?: () => void;
}

/**
 * Video element that survives growing blob URLs: as progressive chunks arrive
 * the object URL changes, and this keeps the current playback position and
 * play/pause state across each swap so a partial download stays watchable.
 */
export default function ProgressiveVideo({
  file,
  url,
  className,
  controls = true,
  autoPlay = false,
  preload = "auto",
  videoRef,
  onPlayChange,
  onCanPlay,
}: ProgressiveVideoProps) {
  const innerRef = useRef<HTMLVideoElement>(null);
  const ref = (videoRef ?? innerRef) as RefObject<HTMLVideoElement | null>;
  const appliedUrlRef = useRef<string | null>(null);
  const pendingTimeRef = useRef<number | null>(null);
  const resumeRef = useRef(false);

  // Grow the object URL imperatively. Capturing position/play state BEFORE the
  // new src is assigned keeps a partially-downloaded video watchable across
  // every blob snapshot (each new URL contains all prior data plus more).
  useEffect(() => {
    const video = ref.current;
    if (!video || url === appliedUrlRef.current) return;
    const previous = appliedUrlRef.current;
    appliedUrlRef.current = url;
    if (url) {
      if (previous !== null) {
        pendingTimeRef.current = video.currentTime;
        resumeRef.current = !video.paused;
      }
      video.src = url;
    } else {
      pendingTimeRef.current = null;
      resumeRef.current = false;
      video.removeAttribute("src");
      video.load();
    }
  }, [url, ref]);

  const restorePosition = () => {
    const video = ref.current;
    if (!video || pendingTimeRef.current === null) return;
    const time = pendingTimeRef.current;
    pendingTimeRef.current = null;
    try {
      video.currentTime = time;
    } catch {
      // media may not be seekable that far yet — clamp on next event
    }
    if (resumeRef.current && video.paused) {
      void video.play().catch(() => {
        resumeRef.current = false;
      });
    }
  };

  return (
    <video
      ref={ref}
      controls={controls}
      autoPlay={autoPlay}
      muted={autoPlay}
      playsInline
      preload={preload}
      data-transfer-status={file.status}
      className={className}
      onPlay={() => onPlayChange?.(true)}
      onPause={() => onPlayChange?.(false)}
      onLoadedMetadata={restorePosition}
      onLoadedData={restorePosition}
      onCanPlay={restorePosition}
      onCanPlayThrough={onCanPlay}
    />
  );
}
