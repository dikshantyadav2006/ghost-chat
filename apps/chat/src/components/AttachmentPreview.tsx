"use client";

import { useEffect, useMemo, useState } from "react";
import { formatFileSize } from "@/lib/format";
import { ChevronLeft, ChevronRight, FileText, Film, X } from "lucide-react";

interface AttachmentPreviewProps {
  files: File[];
  onSend: (files: File[]) => void | Promise<void>;
  onCancel: () => void;
  /** Lets the sheet drop individual files before sending. */
  onChange?: (files: File[]) => void;
}

export default function AttachmentPreview({
  files,
  onSend,
  onCancel,
  onChange,
}: AttachmentPreviewProps) {
  const [index, setIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [urls, setUrls] = useState<Map<File, string>>(new Map());

  useEffect(() => {
    const map = new Map<File, string>();
    for (const f of files) map.set(f, URL.createObjectURL(f));
    setUrls(map);
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
    };
  }, [files]);

  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(i, files.length - 1)));
  }, [files.length]);

  const current = files[Math.min(index, files.length - 1)];
  const url = current ? urls.get(current) ?? null : null;
  const isImage = !!current?.type.startsWith("image/");
  const isVideo = !!current?.type.startsWith("video/");
  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files],
  );

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await onSend(files);
    } finally {
      setSending(false);
    }
  };

  const removeCurrent = () => {
    const next = files.filter((_, i) => i !== index);
    if (next.length === 0) onCancel();
    else onChange?.(next);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        className="zoom-fade flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 pt-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ghost">
              {files.length} file{files.length === 1 ? "" : "s"}
              <span className="ml-2 text-xs font-normal text-soft">
                {formatFileSize(totalSize)}
              </span>
            </p>
            {current && (
              <p className="truncate text-xs text-soft">
                {current.name} · {formatFileSize(current.size)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-soft transition hover:bg-white/5 disabled:opacity-50"
            aria-label="Cancel attachment"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* preview stage */}
        <div className="relative mx-5 mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
          {isImage && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={current?.name ?? "image"} className="max-h-[45vh] object-contain" />
          ) : isVideo && url ? (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[45vh] w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center text-soft">
              <FileText className="h-14 w-14" aria-hidden />
              <span className="max-w-full truncate text-sm">{current?.name}</span>
              <span className="text-xs">{current?.type || "file"}</span>
            </div>
          )}

          {files.length > 1 && !sending && (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-lg text-white transition hover:bg-black/70 disabled:opacity-30"
                aria-label="Previous file"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(files.length - 1, i + 1))}
                disabled={index === files.length - 1}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-lg text-white transition hover:bg-black/70 disabled:opacity-30"
                aria-label="Next file"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {sending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-mint" />
              <span className="text-sm">Sending…</span>
            </div>
          )}
        </div>

        {/* thumbnail strip */}
        {files.length > 1 && !sending && (
          <div className="flex gap-1.5 overflow-x-auto px-5 py-3">
            {files.map((f, i) => {
              const thumb = urls.get(f) ?? null;
              const active = i === index;
              return (
                <button
                  key={`${f.name}-${f.size}-${f.lastModified}`}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-black ring-2 transition ${
                    active ? "ring-mint" : "ring-transparent opacity-70 hover:opacity-100"
                  }`}
                  aria-label={f.name}
                >
                  {thumb && f.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : f.type.startsWith("video/") ? (
                    <span className="flex h-full w-full items-center justify-center text-soft">
                      <Film className="h-5 w-5" />
                    </span>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-soft">
                      <FileText className="h-5 w-5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* actions */}
        <div className="flex items-center gap-2 px-5 pb-4 pt-1">
          {files.length > 1 ? (
            <button
              type="button"
              onClick={removeCurrent}
              disabled={sending}
              className="rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ghost transition hover:bg-raised disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-ghost transition hover:bg-raised disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !current}
            className="flex-1 rounded-xl bg-mint py-2.5 text-sm font-semibold text-white transition hover:bg-mint/90 active:scale-[0.99] disabled:opacity-50"
          >
            Send{files.length > 1 ? ` all (${files.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
