"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import type { FileRow, MessageRow, ReactionRow } from "@ghost/storage";
import { repo } from "@/lib/identity";
import { getSession } from "@/lib/session";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { formatEta, formatFileSize, formatSpeed, formatTime } from "@/lib/format";
import { transferStateLabel, transferStateTone } from "@/lib/fileStatus";
import { positionInGroup, type MessageGroup } from "@/lib/groupMessages";
import { useLongPress } from "@/hooks/useLongPress";
import { useSlideToReply } from "@/hooks/useSlideToReply";
import { useFileUrl } from "@/hooks/useFileUrl";
import { useHaptics } from "@/hooks/useHaptics";
import { useApp } from "@/lib/store";
import { resolveFileBlob } from "@/lib/fileSource";
import { getOutboundSource } from "@/lib/sourceFiles";
import { playReactSound } from "@/lib/sound";
import {
  AlertTriangle,
  Clock,
  Cloud,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  Download,
  FileText,
  Mic,
  Pause,
  Pencil,
  Play,
  Reply,
  Smile,
  Trash2,
} from "lucide-react";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import ReactionTray from "./ReactionTray";
import MediaPreview from "./MediaPreview";

const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "👎", "🔥", "🎉"];

interface MessageBubbleProps {
  message: MessageRow;
  group: MessageGroup;
  selected: boolean;
  isReplyActive: boolean;
  query: string | null;
  matchActive: boolean;
  onSelect: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLightbox: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onForward: () => void;
}

interface TrayAnchor {
  x: number;
  y: number;
  height: number;
  placement: "above" | "below";
}

export default function MessageBubble({
  message,
  group,
  selected,
  isReplyActive,
  query,
  matchActive,
  onSelect,
  onReply,
  onEdit,
  onDelete,
  onOpenLightbox,
  onReact,
  onForward,
}: MessageBubbleProps) {
  const mine = message.isMine;
  const vibrate = useHaptics();
  const reducedMotion = useReducedMotion();
  const file = useLiveQuery(
    () =>
      message.kind === "file" && message.fileId
        ? repo.getFile(message.fileId)
        : Promise.resolve(null),
    [message.id],
    null as FileRow | null,
  );
  const reactions = useLiveQuery(
    () => repo.listReactions(message.id),
    [message.id],
    [] as ReactionRow[],
  );
  const fileUrl = useFileUrl(file);

  const [tray, setTray] = useState<TrayAnchor | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [burst, setBurst] = useState(false);
  const [cloud, setCloud] = useState<{
    state: "idle" | "uploading" | "done" | "error";
    url: string | null;
    error: string | null;
  }>({
    state: "idle",
    url: null,
    error: null,
  });

  const suppressClickRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const pos = positionInGroup(group, message.id);

  const slide = useSlideToReply({
    mine,
    onReply: () => {
      suppressClickRef.current = true;
      onReply();
    },
    active: isReplyActive,
  });

  const handleLongPress = useCallback(() => {
    if (message.deletedAt) return;
    const el = slide.bubbleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const placement = rect.top < 200 ? "below" : "above";
    suppressClickRef.current = true;
    vibrate(25);
    setMenu(null);
    setTray({ x: rect.left + rect.width / 2, y: rect.top, height: rect.height, placement });
  }, [message.deletedAt, slide.bubbleRef, vibrate]);

  const longPress = useLongPress({ delay: 450, moveThreshold: 12, onLongPress: handleLongPress });

  const toggleHeart = useCallback(() => {
    if (message.deletedAt) return;
    onReact(message.id, "❤️");
    setBurst(true);
    vibrate(15);
    playReactSound();
  }, [message.id, message.deletedAt, onReact, vibrate]);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (slide.draggingRef.current) return;
    if (message.deletedAt) return;
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      toggleHeart();
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onSelect();
    }, 260);
  }, [message.deletedAt, onSelect, slide.draggingRef, toggleHeart]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (message.deletedAt) return;
      e.preventDefault();
      suppressClickRef.current = true;
      setTray(null);
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [message.deletedAt],
  );

  const handleCopy = useCallback(async () => {
    const text = message.kind === "file" ? (file?.name ?? "file") : (message.text ?? "");
    if (text) await navigator.clipboard?.writeText(text);
    onSelect();
  }, [message, file, onSelect]);

  const handleDownload = useCallback(() => {
    if (!fileUrl || !file) return;
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = file.name;
    a.click();
  }, [fileUrl, file]);

  const handleSaveToCloud = useCallback(async () => {
    const blob = await resolveFileBlob(file);
    if (!blob) return;
    setCloud({ state: "uploading", url: null, error: null });
    try {
      const url = await uploadToCloudinary(blob, file?.name ?? "file", file?.mime ?? "application/octet-stream");
      setCloud({ state: "done", url, error: null });
    } catch (err) {
      setCloud({
        state: "error",
        url: null,
        error: err instanceof Error ? err.message : "Cloud upload failed",
      });
    }
  }, [file]);

  const handlePauseFile = useCallback(() => {
    if (!message.fileId) return;
    void getSession(message.roomId)?.pauseFile(message.fileId);
  }, [message.roomId, message.fileId]);

  const handleResumeFile = useCallback(() => {
    if (!message.fileId) return;
    void getSession(message.roomId)?.resumeFile(message.fileId);
  }, [message.roomId, message.fileId]);

  const menuItems: ContextMenuItem[] = [
    {
      label: "React",
      icon: <Smile className="h-4 w-4" />,
      onClick: () =>
        setTray({
          x: menu?.x ?? 0,
          y: menu?.y ?? 0,
          height: 0,
          placement: menu && menu.y < 200 ? "below" : "above",
        }),
    },
    { label: "Reply", icon: <Reply className="h-4 w-4" />, onClick: () => onReply() },
    { label: "Forward", icon: <CornerUpRight className="h-4 w-4" />, onClick: onForward },
    { label: "Copy", icon: <Copy className="h-4 w-4" />, onClick: () => void handleCopy() },
    ...(mine && !message.deletedAt
      ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit() }]
      : []),
    ...(mine && !message.deletedAt
      ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true as const, onClick: () => onDelete() }]
      : []),
    ...(message.kind === "file" && fileUrl
      ? [{ label: "Download", icon: <Download className="h-4 w-4" />, onClick: handleDownload }]
      : []),
  ];

  const deleted = !!message.deletedAt;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`my-0.5 flex ${mine ? "justify-end" : "justify-start"} group/item relative`}
    >
      {/* reply arrow revealed behind the bubble while sliding */}
      <div
        className={`absolute top-1/2 flex -translate-y-1/2 items-center transition-opacity duration-200 ${
          slide.engaged ? "opacity-100" : "opacity-0"
        } ${mine ? "right-3" : "left-3"}`}
        aria-hidden
      >
        <CornerUpLeft className="text-xl text-mint" />
      </div>

      <div
        ref={slide.bubbleRef}
        data-message-id={message.id}
        onPointerDown={(e) => {
          longPress.onPointerDown(e);
          slide.onPointerDown(e);
        }}
        onPointerMove={(e) => {
          longPress.onPointerMove(e);
          slide.onPointerMove(e);
        }}
        onPointerUp={() => {
          longPress.onPointerUp();
          slide.onPointerUp();
        }}
        onPointerCancel={() => {
          longPress.onPointerUp();
          slide.onPointerCancel();
        }}
        onPointerLeave={longPress.onPointerLeave}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`relative cursor-pointer touch-pan-y select-none shadow-sm ${
          mine ? "bg-mint/15 text-ghost" : "bg-surface text-ghost"
        } ${bubbleCorners(mine, pos)} ${
          mine ? "max-w-[85%] sm:max-w-[75%]" : "max-w-[85%] sm:max-w-[75%]"
        } ${
          selected || isReplyActive ? "ring-2 ring-mint" : ""
        } ${matchActive && query ? "search-match" : ""}`}
      >
        {message.replyTo && <ReplyQuote replyToId={message.replyTo} />}

        {message.forwarded && (
          <p className="flex items-center gap-1 px-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-soft">
            <CornerUpRight className="h-3.5 w-3.5" /> Forwarded
          </p>
        )}

        {deleted ? (
          <p className="px-2.5 py-1.5 text-sm italic text-soft">This message was deleted</p>
        ) : message.kind === "file" ? (
          <FileCard
            file={file}
            fileUrl={fileUrl}
            mine={mine}
            voice={!!message.voice}
            cloud={cloud}
            onOpenLightbox={onOpenLightbox}
            onSaveToCloud={() => void handleSaveToCloud()}
            onPause={handlePauseFile}
            onResume={handleResumeFile}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words px-2.5 pt-1.5 text-[15px] leading-snug">
            <HighlightedText text={message.text ?? ""} query={query} />
            {message.edited && <span className="ml-1 text-xs text-soft">(edited)</span>}
          </p>
        )}

        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2.5 pb-0.5 pt-1">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                aria-label={`${r.count} reaction ${r.emoji}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(message.id, r.emoji);
                }}
                className={`rounded-full border px-1.5 py-0.5 text-xs transition active:scale-90 ${
                  r.mine
                    ? "border-mint bg-mint/10 font-semibold text-mint"
                    : "border-black/5 bg-black/5"
                }`}
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="ml-0.5">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo((v) => !v);
          }}
          aria-label="Message info"
          className={`flex items-center justify-end gap-1 px-2.5 pb-1 pt-0.5 text-[11px] ${mine ? "text-soft" : "text-soft"} transition hover:opacity-80`}
        >
          <span>{formatTime(message.ts)}</span>
          {mine && <Ticks status={message.status} />}
        </button>

        {showInfo && (
          <div
            className={`absolute bottom-7 z-20 w-48 rounded-lg bg-surface p-3 text-xs text-ghost shadow-xl ring-1 ring-black/30 ${
              mine ? "right-1" : "left-1"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1.5 font-semibold text-soft">Message info</p>
            <InfoRow label="Sent" value={message.sentAt ? formatTime(message.sentAt) : "—"} />
            <InfoRow
              label="Delivered"
              value={message.deliveredAt ? formatTime(message.deliveredAt) : "—"}
            />
            <InfoRow label="Read" value={message.readAt ? formatTime(message.readAt) : "—"} />
          </div>
        )}

        {burst && (
          <span
            className="heart-burst absolute left-1/2 top-1/2 z-10 text-5xl"
            onAnimationEnd={() => setBurst(false)}
            aria-hidden
          >
            ❤️
          </span>
        )}
      </div>

      {tray && (
        <ReactionTray
          emojis={REACTION_EMOJIS}
          anchorX={tray.x}
          anchorY={tray.y}
          anchorHeight={tray.height}
          placement={tray.placement}
          onPick={(emoji) => {
            onReact(message.id, emoji);
            setTray(null);
          }}
          onMore={() => {
            setTray(null);
            onSelect();
          }}
          onClose={() => setTray(null)}
        />
      )}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </motion.div>
  );
}

function bubbleCorners(
  mine: boolean,
  pos: { first: boolean; last: boolean; single: boolean },
): string {
  if (mine) {
    if (pos.single || pos.last) return "rounded-t-[16px] rounded-bl-[16px] rounded-br-none tail-mine";
    if (pos.first) return "rounded-t-[16px] rounded-bl-[16px] rounded-br-none";
    return "rounded-l-[16px] rounded-r-none";
  }
  if (pos.single || pos.last) return "rounded-t-[16px] rounded-br-[16px] rounded-bl-none tail-theirs";
  if (pos.first) return "rounded-t-[16px] rounded-br-[16px] rounded-bl-none";
  return "rounded-r-[16px] rounded-l-none";
}

function HighlightedText({ text, query }: { text: string; query: string | null }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q || !lower.includes(q)) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let i = 0;
  let index = 0;
  while ((i = lower.indexOf(q, index)) !== -1) {
    if (i > index) parts.push(text.slice(index, i));
    parts.push(
      <span key={i} className="rounded-sm bg-mint/25">
        {text.slice(i, i + q.length)}
      </span>,
    );
    index = i + q.length;
  }
  if (index < text.length) parts.push(text.slice(index));
  return <>{parts}</>;
}

function ReplyQuote({ replyToId }: { replyToId: string }) {
  const replied = useLiveQuery(() => repo.getMessageById(replyToId), [replyToId], null);
  if (!replied) return null;
  return (
    <div className="mb-1 rounded-md border-l-4 border-mint bg-black/5 px-2 py-1 text-xs text-soft">
      <span className="font-semibold">{replied.isMine ? "You" : "Peer"}: </span>
      <span className="line-clamp-1">
        {replied.deletedAt ? (
          "deleted message"
        ) : replied.kind === "file" ? (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> file
          </span>
        ) : (
          replied.text
        )}
      </span>
    </div>
  );
}

function VoiceCard({
  fileUrl,
  name,
  size,
}: {
  fileUrl: string | null;
  name: string;
  size: number;
}) {
  return (
    <div className="mx-2.5 mb-1 flex items-center gap-2 rounded-md bg-black/5 px-2 py-1.5">
      <Mic className="text-lg text-soft" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-soft">{name}</p>
        {fileUrl ? (
          <audio src={fileUrl} controls preload="metadata" className="h-10 w-52 max-w-full" />
        ) : (
          <p className="text-xs text-soft">{size > 0 ? formatFileSize(size) : "Voice note"}</p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-soft">{label}</span>
      <span className={value === "—" ? "text-soft" : "font-medium text-ghost"}>
        {value}
      </span>
    </div>
  );
}

function Ticks({ status }: { status: MessageRow["status"] }) {
  if (status === "sending") return <Clock className="h-3.5 w-3.5 text-soft" />;
  if (status === "failed") return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
  const read = status === "read";
  const double = status === "delivered" || read;
  return (
    <svg viewBox="0 0 24 24" className="inline-block h-4 w-4" fill="none" aria-label={status}>
      {double && (
        <path
          d="M1.5 12.5l4 4 8-9"
          stroke={read ? "#53bdeb" : "#8696a0"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d="M11 12.5l4 4 8-9"
        stroke={read ? "#53bdeb" : "#8696a0"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface FileCardProps {
  file: FileRow | null | undefined;
  fileUrl: string | null;
  mine: boolean;
  voice: boolean;
  cloud: {
    state: "idle" | "uploading" | "done" | "error";
    url: string | null;
    error: string | null;
  };
  onOpenLightbox: () => void;
  onSaveToCloud: () => void;
  onPause: () => void;
  onResume: () => void;
}

function FileCard({
  file,
  fileUrl,
  voice,
  cloud,
  onOpenLightbox,
  onSaveToCloud,
  onPause,
  onResume,
}: FileCardProps) {
  if (!file) return <p className="px-2.5 py-1.5 text-sm text-soft">File metadata pending…</p>;

  const isMedia = file.mime.startsWith("image/") || file.mime.startsWith("video/");
  const done = file.status === "done";
  const errored = file.status === "error";
  const hasSource = !!file.blob || !!getOutboundSource(file.id) || !!file.opfsId;

  return (
    <div className="max-w-[300px]">
      {voice ? (
        <VoiceCard fileUrl={fileUrl} name={file.name} size={file.size} />
      ) : isMedia ? (
        <MediaPreview file={file} url={fileUrl} onClick={onOpenLightbox} onPause={onPause} onResume={onResume} />
      ) : (
        <GenericFileCard file={file} fileUrl={fileUrl} onPause={onPause} onResume={onResume} />
      )}

      {errored && !isMedia && (
        <p className="mx-2.5 mb-1 mt-1 text-xs font-medium text-red-500">Transfer failed</p>
      )}

      {done && !errored && isMedia && hasSource && (
        <div className="mb-1.5 flex items-center justify-end gap-2 px-2.5 pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSaveToCloud();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-mint bg-mint/10 px-2.5 py-1.5 text-xs font-semibold text-mint transition hover:bg-mint/20 active:scale-95"
          >
            <Cloud className="h-3.5 w-3.5" /> Save to cloud
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (fileUrl) {
                const a = document.createElement("a");
                a.href = fileUrl;
                a.download = file.name;
                a.click();
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-soft/30 bg-black/5 px-2.5 py-1.5 text-xs font-semibold text-soft transition hover:bg-black/10 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>
      )}
      {cloud.state === "uploading" && (
        <p className="px-2.5 pb-1 text-xs text-soft">Uploading to cloud…</p>
      )}
      {cloud.state === "done" && cloud.url && (
        <div className="flex flex-wrap items-center gap-2 px-2.5 pb-1 text-xs">
          <a
            href={cloud.url}
            target="_blank"
            rel="noreferrer"
            className="truncate font-semibold text-mint underline"
          >
            Cloud link
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(cloud.url ?? "");
            }}
            className="rounded-lg bg-black/5 px-2 py-0.5 font-semibold text-soft transition hover:bg-black/10"
          >
            Copy
          </button>
        </div>
      )}
      {cloud.state === "error" && (
        <div className="flex flex-wrap items-center gap-2 px-2.5 pb-1 text-xs">
          <span className="text-red-500">{cloud.error}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSaveToCloud();
            }}
            className="font-semibold text-mint underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function GenericFileCard({
  file,
  fileUrl,
  onPause,
  onResume,
}: {
  file: FileRow;
  fileUrl: string | null;
  onPause: () => void;
  onResume: () => void;
}) {
  const stat = useApp((s) => s.transferStats[file.id]);
  const transferring =
    file.status === "pending" || file.status === "transferring" || file.status === "interrupted";
  const pct = Math.round(file.progress * 100);
  const transferred = Math.round(file.size * file.progress);
  const tone = transferStateTone(file);
  const label = transferStateLabel(file);

  const download = () => {
    if (!fileUrl) return;
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = file.name;
    a.click();
  };

  return (
    <div className="mx-2.5 mb-1 flex w-[calc(100%-20px)] items-center gap-3 rounded-xl bg-black/5 px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint/10 text-mint">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-soft">
          <span className={`inline-flex items-center gap-1 font-medium ${tone.text}`}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${tone.active ? "pulse-soft" : ""}`}
            />
            {label}
          </span>
          <span>· {formatFileSize(file.size)}</span>
          {transferring && (
            <>
              <span>· {formatFileSize(transferred)}</span>
              {stat && stat.speed > 0 && <span>· {formatSpeed(stat.speed)}</span>}
              {stat?.etaS != null && <span>· ETA {formatEta(stat.etaS)}</span>}
            </>
          )}
        </p>
        {(transferring || file.status === "paused") && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                file.status === "paused" ? "bg-amber" : "bg-mint"
              }`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        )}
      </div>
      {file.status === "paused" || file.status === "interrupted" ? (
        <button
          type="button"
          onClick={onResume}
          aria-label="Resume transfer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10 text-soft transition hover:bg-black/20"
        >
          <Play className="h-4 w-4" />
        </button>
      ) : transferring ? (
        <button
          type="button"
          onClick={onPause}
          aria-label="Pause transfer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10 text-soft transition hover:bg-black/20"
        >
          <Pause className="h-4 w-4" />
        </button>
      ) : fileUrl ? (
        <button
          type="button"
          onClick={download}
          aria-label={`Download ${file.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-mint transition hover:bg-mint/10"
        >
          <Download className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
