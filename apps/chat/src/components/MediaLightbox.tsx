"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FileRow } from "@ghost/storage";
import { repo } from "@/lib/identity";
import { getSession } from "@/lib/session";
import { useFileUrl } from "@/hooks/useFileUrl";
import { formatFileSize, formatTime } from "@/lib/format";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { resolveFileBlob } from "@/lib/fileSource";
import { getOutboundSource } from "@/lib/sourceFiles";
import { useApp } from "@/lib/store";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  FileText,
  Pause,
  Play,
  X,
} from "lucide-react";
import ProgressiveVideo from "./ProgressiveVideo";

export interface LightboxItem {
  messageId: string;
  fileId: string;
  isMine: boolean;
  ts: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

interface MediaLightboxProps {
  items: LightboxItem[];
  initialIndex: number;
  onClose: () => void;
}

export default function MediaLightbox({ items, initialIndex, onClose }: MediaLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [swipe, setSwipe] = useState(0);
  const [cloudState, setCloudState] = useState<{
    state: "idle" | "uploading" | "done" | "error";
    url: string | null;
    error: string | null;
  }>({
    state: "idle",
    url: null,
    error: null,
  });

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; startPan: { x: number; y: number } } | null>(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);
  const pushToast = useApp((s) => s.pushToast);

  const item = items[index];
  const file = useLiveQuery(
    () => (item ? repo.getFile(item.fileId) : Promise.resolve(null)),
    [item?.fileId],
    null as FileRow | null,
  );
  const fileUrl = useFileUrl(file);

  const resetTransform = useCallback(() => {
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSwipe(0);
  }, []);

  useEffect(() => {
    resetTransform();
    setCloudState({ state: "idle", url: null, error: null });
  }, [index, resetTransform]);

  const navigate = useCallback(
    (dir: number) => {
      setIndex((i) => Math.max(0, Math.min(items.length - 1, i + dir)));
    },
    [items.length],
  );

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "ArrowLeft") navigate(-1);
      else if (e.key === "Tab") {
        const el = dialogRef.current;
        if (!el) return;
        const focusables = Array.from(
          el.querySelectorAll<HTMLElement>('button, [href], video, audio, [tabindex]:not([tabindex="-1"])'),
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus?.();
    };
  }, [onClose, navigate]);

  const clampPan = useCallback((x: number, y: number) => {
    const s = scaleRef.current;
    if (s <= 1) return { x: 0, y: 0 };
    const el = document.querySelector<HTMLElement>(".lightbox-media");
    const maxX = el ? (el.clientWidth * (s - 1)) / 2 : 400;
    const maxY = el ? (el.clientHeight * (s - 1)) / 2 : 300;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const a = pts[0];
      const b = pts[1];
      if (!a || !b) return;
      pinchRef.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: scaleRef.current,
      };
      dragRef.current = null;
    } else {
      dragRef.current = { x: e.clientX, y: e.clientY, startPan: panRef.current };
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const point = pointers.current.get(e.pointerId);
      if (!point) return;
      point.x = e.clientX;
      point.y = e.clientY;

      if (pinchRef.current && pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const a = pts[0];
        const b = pts[1];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const next = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, (pinchRef.current.startScale * dist) / pinchRef.current.startDist),
        );
        scaleRef.current = next;
        setScale(next);
        if (next <= 1) {
          panRef.current = { x: 0, y: 0 };
          setPan({ x: 0, y: 0 });
        }
        return;
      }

      const drag = dragRef.current;
      if (!drag || pointers.current.size !== 1) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;

      if (scaleRef.current > 1) {
        const next = clampPan(drag.startPan.x + dx, drag.startPan.y + dy);
        panRef.current = next;
        setPan(next);
      } else {
        setSwipe(dx);
      }
    },
    [clampPan],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId);

      if (pointers.current.size === 0) {
        if (pinchRef.current) {
          pinchRef.current = null;
        } else if (dragRef.current) {
          if (scaleRef.current <= 1 && Math.abs(swipe) > 60) {
            navigate(swipe < 0 ? 1 : -1);
          } else {
            setSwipe(0);
          }
          dragRef.current = null;
        }
      }
    },
    [swipe, navigate],
  );

  const handleDoubleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const now = Date.now();
      const last = lastTapRef.current;
      const sameSpot = Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40;
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
      if (now - last.time < 320 && sameSpot) {
        if (scaleRef.current > 1) {
          resetTransform();
        } else {
          scaleRef.current = 2.5;
          panRef.current = { x: 0, y: 0 };
          setScale(2.5);
          setPan({ x: 0, y: 0 });
        }
      }
    },
    [resetTransform],
  );

  const handleSaveToCloud = async () => {
    const blob = await resolveFileBlob(file);
    if (!blob) return;
    setCloudState({ state: "uploading", url: null, error: null });
    try {
      const url = await uploadToCloudinary(blob, file?.name ?? "file", file?.mime ?? "application/octet-stream");
      setCloudState({ state: "done", url, error: null });
      pushToast("Saved to cloud", "☁️");
    } catch (err) {
      setCloudState({
        state: "error",
        url: null,
        error: err instanceof Error ? err.message : "Cloud upload failed",
      });
    }
  };

  const handlePause = useCallback(() => {
    if (!file) return;
    void getSession(file.roomId)?.pauseFile(file.id);
  }, [file]);

  const handleResume = useCallback(() => {
    if (!file) return;
    void getSession(file.roomId)?.resumeFile(file.id);
  }, [file]);

  if (!item) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={handleDoubleTap}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <span className="text-sm text-white/80">
          {index + 1} / {items.length}
        </span>
        <span className="truncate text-sm font-medium">{file?.name ?? "Media"}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-white/20"
          aria-label="Close viewer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(-1);
              }}
              disabled={index === 0}
              className="absolute left-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 disabled:opacity-30"
              aria-label="Previous media"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(1);
              }}
              disabled={index === items.length - 1}
              className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20 disabled:opacity-30"
              aria-label="Next media"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        <div
          className="lightbox-media flex h-full w-full select-none items-center justify-center"
          style={{
            transform: `translateX(${swipe}px)`,
            transition: pointers.current.size === 0 ? "transform 0.2s ease-out" : "none",
            opacity: scaleRef.current > 1 ? 1 : 1 - Math.min(0.6, Math.abs(swipe) / 600),
          }}
        >
          <div
            className="zoom-fade max-h-full max-w-full"
            style={{
              transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
            }}
          >
            <MediaSlide key={item.messageId} file={file} />
          </div>
        </div>

        {/* loading / transferring state */}
        {file && file.status !== "done" && !fileUrl && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-mint" />
            <p className="text-sm text-white/80">
              {file.status === "error"
                ? "Transfer failed"
                : file.status === "paused"
                  ? "Transfer paused"
                  : file.status === "pending"
                    ? "Waiting for transfer…"
                    : file.status === "interrupted"
                      ? "Connection interrupted — resuming…"
                      : `Receiving… ${Math.round(file.progress * 100)}%`}
            </p>
            {file.status === "transferring" && (
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-mint"
                  style={{ width: `${Math.round(file.progress * 100)}%` }}
                />
              </div>
            )}
            {file.status === "paused" ? (
              <button
                type="button"
                onClick={handleResume}
                className="flex items-center gap-1.5 rounded-full bg-mint px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-mint/90"
              >
                <Play className="h-3.5 w-3.5 fill-white" /> Resume
              </button>
            ) : (
              file.status === "transferring" && (
                <button
                  type="button"
                  onClick={handlePause}
                  aria-label="Pause transfer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                >
                  <Pause className="h-4 w-4 fill-white" />
                </button>
              )
            )}
          </div>
        )}
        {file &&
          (file.status === "transferring" || file.status === "interrupted") &&
          fileUrl && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-black/50 px-4 py-2.5 backdrop-blur-sm">
              <span className="shrink-0 text-[11px] font-medium text-white/80">
                {file.status === "interrupted" ? "Reconnecting…" : "Downloading…"}
              </span>
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-mint transition-[width] duration-300"
                  style={{ width: `${Math.max(2, Math.round(file.progress * 100))}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/80">
                {Math.round(file.progress * 100)}% ·{" "}
                {formatFileSize(Math.round(file.size * file.progress))}/{formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={handlePause}
                aria-label="Pause transfer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              >
                <Pause className="h-3.5 w-3.5 fill-white" />
              </button>
            </div>
          )}
        {file && file.status === "paused" && fileUrl && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 bg-black/50 px-4 py-2.5 backdrop-blur-sm">
            <span className="text-[11px] font-medium text-white/80">
              Transfer paused · {Math.round(file.progress * 100)}% received
            </span>
            <button
              type="button"
              onClick={handleResume}
              className="flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-white transition hover:bg-mint/90"
            >
              <Play className="h-3 w-3 fill-white" /> Resume
            </button>
          </div>
        )}
        {file && file.status === "error" && fileUrl && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <p className="rounded-full bg-red-950/90 px-4 py-1.5 text-sm font-medium text-red-300">
              Transfer failed
            </p>
          </div>
        )}
      </div>

      {/* bottom bar */}
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file?.name ?? "Media"}</p>
          <p className="text-xs text-white/60">
            {file ? formatFileSize(file.size) : ""} {file ? "·" : ""} {formatTime(item.ts)} ·{" "}
            {item.isMine ? "You" : "Peer"}
          </p>
        </div>
        {cloudState.state === "done" && cloudState.url ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(cloudState.url ?? "");
              pushToast("Link copied", "🔗");
            }}
            className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
          >
            Copy link
          </button>
        ) : cloudState.state === "uploading" ? (
          <span className="shrink-0 text-sm text-white/60">Uploading…</span>
        ) : cloudState.state === "error" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleSaveToCloud();
            }}
            className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-white/20"
          >
            Retry
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleSaveToCloud();
            }}
            disabled={!file || file.status !== "done" || (!file.blob && !getOutboundSource(file.id) && !file.opfsId)}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20 disabled:opacity-40"
          >
            <Cloud className="h-4 w-4" /> Save to cloud
          </button>
        )}
      </div>
    </div>
  );
}

function MediaSlide({ file }: { file: FileRow | null | undefined }) {
  const url = useFileUrl(file);
  const isImage = file?.mime.startsWith("image/") ?? false;
  const isVideo = file?.mime.startsWith("video/") ?? false;

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-mint" />
      </div>
    );
  }
  if (isImage && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={file.name ?? "image"}
        className="max-h-full max-w-full select-none object-contain"
        draggable={false}
      />
    );
  }
  if (isVideo && url) {
    return <LightboxVideo file={file} url={url} />;
  }
  return (
    <div className="flex flex-col items-center gap-2 text-white/70">
      <FileText className="h-14 w-14" aria-hidden />
      <p className="max-w-xs truncate text-sm">{file.name}</p>
      <p className="text-xs text-white/50">{formatFileSize(file.size)}</p>
    </div>
  );
}

function LightboxVideo({ file, url }: { file: FileRow; url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative flex max-h-full max-w-full items-center justify-center">
      <ProgressiveVideo
        file={file}
        url={url}
        videoRef={videoRef}
        controls
        preload="auto"
        className="max-h-[75vh] max-w-full select-none"
        onPlayChange={setPlaying}
      />
      {!playing && (
        <button
          type="button"
          onClick={() => {
            const v = videoRef.current;
            if (v) void v.play().catch(() => {});
          }}
          aria-label="Play video"
          className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-2xl text-white transition hover:bg-black/70 active:scale-95"
        >
          <Play className="h-8 w-8 fill-white pl-0.5" />
        </button>
      )}
    </div>
  );
}
