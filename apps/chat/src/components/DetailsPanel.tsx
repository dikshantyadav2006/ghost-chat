"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { FileRow, MessageRow } from "@ghost/storage";
import { repo } from "@/lib/identity";
import { getSession } from "@/lib/session";
import { useApp } from "@/lib/store";
import { formatEta, formatFileSize, formatSpeed } from "@/lib/format";
import { transferStateLabel, transferStateTone } from "@/lib/fileStatus";
import { useFileUrl } from "@/hooks/useFileUrl";
import {
  connectionStatus,
  TONE_DOT,
  TONE_TEXT,
} from "./ConnectionHealth";
import MediaLightbox, { type LightboxItem } from "./MediaLightbox";
import ProgressiveVideo from "./ProgressiveVideo";
import Avatar from "./Avatar";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  FileText,
  Images,
  Mic,
  Phone,
  Radio,
  ShieldCheck,
  Video,
  Wifi,
  X,
} from "lucide-react";

/**
 * Right-hand details panel: peer profile, live connection quality, shared
 * media, shared files and transfer history. Fixed 380px column on desktop,
 * full-screen route on mobile (`/c/[code]/details`).
 */
export default function DetailsPanel({
  roomId,
  embedded = false,
}: {
  roomId: string;
  embedded?: boolean;
}) {
  const room = useLiveQuery(() => repo.getRoomById(roomId), [roomId], null);
  const messages = useLiveQuery(() => repo.listMessages(roomId), [roomId], [] as MessageRow[]);
  const files = useLiveQuery(() => repo.listFiles(roomId), [roomId], [] as FileRow[]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const setDetailsOpen = useApp((s) => s.setDetailsOpen);

  const mediaItems = useMemo(() => {
    const byId = new Map(files.map((f) => [f.id, f]));
    const items: LightboxItem[] = [];
    for (const m of messages) {
      if (m.kind === "file" && m.fileId) {
        const f = byId.get(m.fileId);
        if (f && (f.mime.startsWith("image/") || f.mime.startsWith("video/"))) {
          items.push({ messageId: m.id, fileId: f.id, isMine: m.isMine, ts: m.ts });
        }
      }
    }
    return items;
  }, [messages, files]);

  const documentFiles = useMemo(
    () =>
      files.filter(
        (f) =>
          !f.mime.startsWith("image/") &&
          !f.mime.startsWith("video/"),
      ),
    [files],
  );

  const handleCall = async (video: boolean) => {
    const s = getSession(roomId);
    if (!s) return;
    try {
      await s.startCall(video);
    } catch (err) {
      useApp
        .getState()
        .pushToast(err instanceof Error ? err.message : "Could not start call", "📵");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-surface lg:w-[340px] lg:shrink-0 lg:border-l lg:border-line xl:w-[380px]">
      <header className="flex items-center gap-2 bg-raised px-3 py-2.5">
        {!embedded && (
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label="Back to chat"
            className="rounded-full p-1.5 text-soft transition hover:bg-white/5 lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-sm font-bold text-ghost">Chat details</h2>
        {embedded && (
          <button
            type="button"
            onClick={() => setDetailsOpen(false)}
            aria-label="Close chat details"
            title="Close chat details"
            className="ml-auto rounded-full p-1.5 text-soft transition hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <main className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4">
        <ProfileCard roomId={roomId} name={room?.peerName ?? "Peer"} />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleCall(false)}
            className="flex items-center justify-center gap-2 rounded-xl bg-raised py-3 text-sm font-semibold text-ghost transition hover:bg-white/5"
          >
            <Phone className="h-4 w-4 text-mint" />
            Voice
          </button>
          <button
            type="button"
            onClick={() => void handleCall(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-raised py-3 text-sm font-semibold text-ghost transition hover:bg-white/5"
          >
            <Video className="h-4 w-4 text-mint" />
            Video
          </button>
        </div>

        <ConnectionCard roomId={roomId} />

        <section>
          <SectionTitle icon={<Images className="h-3.5 w-3.5" />} label="Shared media" />
          {mediaItems.length === 0 ? (
            <p className="px-1 text-sm text-soft">No media shared yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {mediaItems.map((item, i) => (
                <MediaTile
                  key={item.fileId}
                  file={files.find((f) => f.id === item.fileId) ?? null}
                  onClick={() => setLightboxIndex(i)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle icon={<FileText className="h-3.5 w-3.5" />} label="Files & transfers" />
          {documentFiles.length === 0 ? (
            <p className="px-1 text-sm text-soft">No files shared yet.</p>
          ) : (
            <ul className="space-y-2">
              {documentFiles.map((f) => (
                <DocumentRow key={f.id} file={f} />
              ))}
            </ul>
          )}
        </section>
      </main>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={mediaItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function ProfileCard({ roomId, name }: { roomId: string; name: string }) {
  const online = useApp((s) => s.online[roomId]);
  const peerState = useApp((s) => s.peerState[roomId]);
  const transport = useApp((s) => s.transport[roomId]);
  const st = connectionStatus(online, peerState, transport);

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Avatar emoji="👻" color="#005c4b" size="lg" />
      <div>
        <h3 className="truncate text-lg font-bold text-ghost">{name}</h3>
        <p className={`flex items-center justify-center gap-1.5 text-sm ${TONE_TEXT[st.tone]}`}>
          <span
            className={`h-2 w-2 rounded-full ${TONE_DOT[st.tone]} ${
              st.tone === "warn" || st.tone === "danger" ? "pulse-soft" : ""
            }`}
          />
          {st.label}
        </p>
      </div>
    </div>
  );
}

function ConnectionCard({ roomId }: { roomId: string }) {
  const online = useApp((s) => s.online[roomId]);
  const peerState = useApp((s) => s.peerState[roomId]);
  const transport = useApp((s) => s.transport[roomId]);
  const linkStats = useApp((s) => s.linkStats[roomId]);
  const speeds = useApp((s) => s.transferSpeeds);

  const status = connectionStatus(online, peerState, transport);
  const rtt = linkStats?.rttMs ?? null;
  const quality =
    rtt == null
      ? { label: "Unknown", tone: "muted" as const }
      : rtt < 80
        ? { label: "Excellent", tone: "ok" as const }
        : rtt < 200
          ? { label: "Good", tone: "ok" as const }
          : { label: "Poor", tone: "danger" as const };

  return (
    <section className="rounded-xl border border-line p-3">
      <SectionTitle icon={<Activity className="h-3.5 w-3.5" />} label="Connection quality" />
      <div className="mt-2 space-y-2.5">
        <HealthRow
          icon={<Wifi className="h-4 w-4 text-soft" />}
          label="Link"
          value={
            <span className={`flex items-center gap-1.5 font-medium ${TONE_TEXT[status.tone]}`}>
              <span
                className={`h-2 w-2 rounded-full ${TONE_DOT[status.tone]} ${
                  status.tone === "warn" || status.tone === "danger" ? "pulse-soft" : ""
                }`}
              />
              {status.label}
            </span>
          }
        />
        <HealthRow
          icon={<ShieldCheck className="h-4 w-4 text-soft" />}
          label="Encryption"
          value={<span className="font-medium text-ghost">End-to-end · AES-GCM</span>}
        />
        <HealthRow
          icon={<Radio className="h-4 w-4 text-soft" />}
          label="Route"
          value={
            <span className="font-medium text-ghost">
              {peerState === "connected"
                ? transport === "relay"
                  ? "Relayed via TURN"
                  : "Direct P2P"
                : "—"}
            </span>
          }
        />
        <HealthRow
          icon={<Activity className="h-4 w-4 text-soft" />}
          label="Latency"
          value={
            <span className="font-medium text-ghost">
              {rtt != null ? `${rtt} ms` : "—"}
              <span className={`ml-2 text-xs ${TONE_TEXT[quality.tone]}`}>{quality.label}</span>
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg bg-raised px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-soft">
              <ArrowDown className="h-3.5 w-3.5 text-ok" /> Download
            </p>
            <p className="mt-0.5 font-semibold text-ghost">{formatSpeed(speeds.down)}</p>
          </div>
          <div className="rounded-lg bg-raised px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-soft">
              <ArrowUp className="h-3.5 w-3.5 text-mint" /> Upload
            </p>
            <p className="mt-0.5 font-semibold text-ghost">{formatSpeed(speeds.up)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HealthRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-soft">
        {icon}
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
      {icon}
      {label}
    </h4>
  );
}

function MediaTile({ file, onClick }: { file: FileRow | null; onClick: () => void }) {
  const url = useFileUrl(file);
  if (!file) return null;
  const isVideo = file.mime.startsWith("video/");

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
      {isVideo && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white" aria-hidden>
          <PlayBadge />
        </span>
      )}
    </button>
  );
}

function PlayBadge() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function DocumentRow({ file }: { file: FileRow }) {
  const url = useFileUrl(file);
  const stat = useApp((s) => s.transferStats[file.id]);
  const tone = transferStateTone(file);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
  };

  const pct = Math.round(file.progress * 100);
  const transferring = file.status === "transferring" || file.status === "pending";

  return (
    <li className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2.5">
      {file.mime.startsWith("audio/") ? (
        <Mic className="h-7 w-7 shrink-0 text-soft" aria-hidden />
      ) : (
        <FileText className="h-7 w-7 shrink-0 text-soft" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ghost">{file.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-soft">
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${tone.active ? "pulse-soft" : ""}`} />
          <span className={`font-medium ${tone.text}`}>{transferStateLabel(file)}</span>
          <span>· {formatFileSize(file.size)}</span>
          {stat && stat.speed > 0 && <span>· {formatSpeed(stat.speed)}</span>}
          {stat?.etaS != null && <span>· ETA {formatEta(stat.etaS)}</span>}
        </p>
        {(transferring || file.status === "paused" || file.status === "interrupted") && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                file.status === "paused" || file.status === "interrupted" ? "bg-amber" : "bg-mint"
              }`}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={download}
        disabled={!url}
        aria-label={url ? `Download ${file.name}` : `${file.name} — not available yet`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-mint transition hover:bg-mint/10 disabled:cursor-default disabled:text-soft"
      >
        <Download className="h-4 w-4" />
      </button>
    </li>
  );
}
