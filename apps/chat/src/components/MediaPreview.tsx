"use client";

import type { FileRow } from "@ghost/storage";
import { formatFileSize } from "@/lib/format";
import { AlertTriangle, Image as ImageIcon, Pause, Play } from "lucide-react";
import ProgressiveVideo from "./ProgressiveVideo";

interface MediaPreviewProps {
  file: FileRow;
  url: string | null;
  /** When provided, the preview is an interactive button (bubble preview). */
  onClick?: () => void;
  onPause?: (() => void) | undefined;
  onResume?: (() => void) | undefined;
}

/**
 * Bubble preview for image/video messages: shows the media (or a shimmer while
 * it loads), overlays the transfer state, and exposes the play/download
 * affordances. Reused by `FileCard`.
 */
export default function MediaPreview({
  file,
  url,
  onClick,
  onPause,
  onResume,
}: MediaPreviewProps) {
  const isImage = file.mime.startsWith("image/");
  const isVideo = file.mime.startsWith("video/");
  const done = file.status === "done";
  const errored = file.status === "error";
  const transferring =
    file.status === "pending" || file.status === "transferring" || file.status === "interrupted";
  const hasPartial = url !== null && transferring;

  const media = (
    <div className="media-frame relative w-full overflow-hidden bg-black">
      {isImage ? (
        url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={file.name}
            draggable={false}
            className="media-frame-media"
          />
        ) : (
          <MediaPlaceholder transferring={transferring} name={file.name} />
        )
      ) : isVideo ? (
        url ? (
          <ProgressiveVideo
            file={file}
            url={url}
            controls={false}
            preload={done ? "metadata" : "auto"}
            className="media-frame-media"
          />
        ) : (
          <MediaPlaceholder transferring={transferring} name={file.name} />
        )
      ) : null}

      {isVideo && url && (done || transferring) && (
        <span className="media-play-badge" aria-hidden>
          <Play className="h-6 w-6 fill-white" />
        </span>
      )}

      {transferring && hasPartial && (
        <PartialTransferOverlay file={file} onPause={onPause} onResume={onResume} />
      )}

      {transferring && !hasPartial && (
        <WaitingOverlay file={file} onPause={onPause} onResume={onResume} />
      )}

      {errored && <ErrorOverlay />}
    </div>
  );

  if (onClick && url) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-zoom-in"
        aria-label={`Open ${file.name}`}
      >
        {media}
      </button>
    );
  }
  return media;
}

function MediaPlaceholder({ transferring, name }: { transferring: boolean; name: string }) {
  if (transferring) {
    return <div className="media-skeleton aspect-video w-full" role="status" aria-label="Loading" />;
  }
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 bg-ink text-soft">
      <ImageIcon className="h-8 w-8" aria-hidden />
      <span className="max-w-full truncate px-3 text-xs">{name}</span>
      <span className="text-[10px]">Preview not available</span>
    </div>
  );
}

function PartialTransferOverlay({
  file,
  onPause,
  onResume,
}: {
  file: FileRow;
  onPause?: (() => void) | undefined;
  onResume?: (() => void) | undefined;
}) {
  const pct = Math.round(file.progress * 100);
  const received = formatFileSize(Math.round(file.size * file.progress));
  const label =
    file.status === "interrupted" ? "Reconnecting…" : file.status === "pending" ? "Queued…" : null;
  const paused = file.status === "paused";
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
        <div
          className="h-full rounded-r-full bg-mint transition-[width] duration-300"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
        {paused ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResume?.();
            }}
            aria-label="Resume transfer"
            className="flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 transition hover:bg-white/25"
          >
            <Play className="h-3 w-3 fill-white" /> Resume
          </button>
        ) : (
          <>
            {pct}% · {received}
            {label ? ` · ${label}` : ""}
            {onPause && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause();
                }}
                aria-label="Pause transfer"
                className="rounded-full bg-white/15 px-1.5 py-0.5 transition hover:bg-white/25"
              >
                <Pause className="h-3 w-3 fill-white" />
              </button>
            )}
          </>
        )}
      </span>
    </>
  );
}

function WaitingOverlay({
  file,
  onPause,
  onResume,
}: {
  file: FileRow;
  onPause?: (() => void) | undefined;
  onResume?: (() => void) | undefined;
}) {
  const pct = Math.round(file.progress * 100);
  const paused = file.status === "paused";
  const label = paused
    ? "Transfer paused"
    : file.status === "pending"
      ? "Waiting for transfer…"
      : file.status === "interrupted"
        ? "Connection interrupted — resuming…"
        : `Downloading… ${pct}%`;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/55 text-white">
      <div className="relative h-14 w-14">
        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56" aria-hidden>
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
          <circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke={paused ? "#f7c548" : "#00a884"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="150.8"
            strokeDashoffset={150.8 * (1 - file.progress)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
          {paused ? <Pause className="h-5 w-5 fill-white" /> : `${pct}%`}
        </span>
      </div>
      <p className="px-3 text-center text-xs text-white/85">{label}</p>
      {paused ? (
        onResume && (
          <button
            type="button"
            onClick={onResume}
            className="flex items-center gap-1.5 rounded-full bg-mint px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-mint/90"
          >
            <Play className="h-3.5 w-3.5 fill-white" /> Resume
          </button>
        )
      ) : (
        onPause && (
          <button
            type="button"
            onClick={onPause}
            aria-label="Pause transfer"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
          >
            <Pause className="h-4 w-4 fill-white" />
          </button>
        )
      )}
    </div>
  );
}

function ErrorOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white">
      <AlertTriangle className="h-8 w-8 text-amber-400" aria-hidden />
      <p className="text-xs font-medium">Transfer failed</p>
    </div>
  );
}
