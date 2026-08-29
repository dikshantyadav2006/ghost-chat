"use client";

import type { FileRow } from "@ghost/storage";
import { useFileUrl } from "@/hooks/useFileUrl";
import { Play, X } from "lucide-react";
import type { LightboxItem } from "./MediaLightbox";
import ProgressiveVideo from "./ProgressiveVideo";

interface MediaGalleryProps {
  items: LightboxItem[];
  files: FileRow[];
  onOpen: (index: number) => void;
  onClose: () => void;
}

export default function MediaGallery({ items, files, onOpen, onClose }: MediaGalleryProps) {
  const byId = new Map(files.map((f) => [f.id, f]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="zoom-fade flex h-full w-full max-w-3xl flex-col bg-surface sm:h-auto sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <h2 className="font-semibold text-ghost">Media</h2>
          <span className="text-sm text-soft">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full p-1.5 text-soft transition hover:bg-white/5"
            aria-label="Close gallery"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-soft">No media yet</p>
        ) : (
          <div className="grid grid-cols-3 gap-1 overflow-y-auto p-2 sm:grid-cols-4">
            {items.map((item, i) => (
              <Tile
                key={item.fileId}
                file={byId.get(item.fileId) ?? null}
                onClick={() => onOpen(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ file, onClick }: { file: FileRow | null | undefined; onClick: () => void }) {
  const url = useFileUrl(file);
  if (!file) return null;
  const isVideo = file.mime.startsWith("video/");
  const transferring =
    file.status === "pending" || file.status === "transferring" || file.status === "interrupted";
  const pct = Math.round(file.progress * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square overflow-hidden rounded-md bg-black"
      aria-label={file.name}
    >
      {url && file.mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="h-full w-full object-cover" />
      ) : url && isVideo ? (
        <ProgressiveVideo
          file={file}
          url={url}
          controls={false}
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="media-skeleton h-full w-full" role="status" aria-label="Loading" />
      )}

      {transferring && url && (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <span
            className="block h-full rounded-r-full bg-mint"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </span>
      )}
      {transferring && !url && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-[10px] font-semibold text-white">
          {pct}%
        </span>
      )}
      {isVideo && (
        <span
          className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white"
          aria-hidden
        >
          <Play className="h-3 w-3 fill-white" />
        </span>
      )}
    </button>
  );
}
