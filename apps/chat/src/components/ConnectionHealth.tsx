"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { FileRow } from "@ghost/storage";
import { repo } from "@/lib/identity";
import { useApp, type PeerTransport, type PeerUiState } from "@/lib/store";
import { formatEta, formatFileSize, formatSpeed } from "@/lib/format";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Radio,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";

export type ConnectionTone = "ok" | "warn" | "danger" | "muted";

export const TONE_DOT: Record<ConnectionTone, string> = {
  ok: "bg-ok",
  warn: "bg-amber",
  danger: "bg-alert",
  muted: "bg-soft/40",
};

export const TONE_TEXT: Record<ConnectionTone, string> = {
  ok: "text-ok",
  warn: "text-amber",
  danger: "text-alert",
  muted: "text-soft",
};

/**
 * Live connection status for a room. Presence (online), the WebRTC link state
 * and the negotiated transport are separate concepts and combined here into a
 * single honest label.
 */
export function connectionStatus(
  online: boolean | undefined,
  peerState: PeerUiState | undefined,
  transport: PeerTransport | undefined,
): { label: string; tone: ConnectionTone } {
  const state = peerState ?? "none";
  if (!online) return { label: "Offline", tone: "muted" };
  if (state === "connected") {
    return {
      label: transport === "relay" ? "Relay Connection" : "Direct Encrypted",
      tone: transport === "relay" ? "warn" : "ok",
    };
  }
  if (state === "reconnecting" || state === "disconnected")
    return { label: "Reconnecting…", tone: "warn" };
  if (state === "connecting") return { label: "Connecting…", tone: "warn" };
  if (state === "failed") return { label: "Peer connection failed", tone: "danger" };
  return { label: "Peer Online", tone: "muted" };
}

function qualityFor(rttMs: number | null): { label: string; tone: ConnectionTone } {
  if (rttMs == null) return { label: "Unknown", tone: "muted" };
  if (rttMs < 80) return { label: "Excellent", tone: "ok" };
  if (rttMs < 200) return { label: "Good", tone: "ok" };
  return { label: "Poor", tone: "danger" };
}

/**
 * Connection & transfer health widget — the app's hero feature. Shows live
 * RTT, transport type (direct vs TURN relay), aggregate transfer speeds and
 * the state of any in-flight transfers.
 */
export default function ConnectionHealthPanel({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose: () => void;
}) {
  const online = useApp((s) => s.online[roomId]);
  const peerState = useApp((s) => s.peerState[roomId]);
  const transport = useApp((s) => s.transport[roomId]);
  const linkStats = useApp((s) => s.linkStats[roomId]);
  const files = useLiveQuery(() => repo.listFiles(roomId), [roomId], [] as FileRow[]);
  const speeds = useApp((s) => s.transferSpeeds);
  const perFile = useApp((s) => s.transferStats);

  const status = connectionStatus(online, peerState, transport);
  const quality = qualityFor(linkStats?.rttMs ?? null);
  const active = files.filter((f) => f.status !== "done" && f.status !== "error");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Connection details"
        className="safe-bottom w-full max-w-sm rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-ghost">
            <Activity className="h-4 w-4 text-mint" />
            Connection
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close connection details"
            className="rounded-full p-1.5 text-soft transition hover:bg-raised"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Row
            icon={<Wifi className="h-4 w-4 text-soft" />}
            label="Link"
            value={
              <span className={`flex items-center gap-1.5 font-medium ${TONE_TEXT[status.tone]}`}>
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[status.tone]} ${status.tone === "warn" || status.tone === "danger" ? "pulse-soft" : ""}`} />
                {status.label}
              </span>
            }
          />

          <Row
            icon={<ShieldCheck className="h-4 w-4 text-soft" />}
            label="Encryption"
            value={<span className="font-medium text-ghost">End-to-end · AES-GCM</span>}
          />

          <Row
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

          <Row
            icon={<Activity className="h-4 w-4 text-soft" />}
            label="Latency"
            value={
              <span className="font-medium text-ghost">
                {linkStats?.rttMs != null ? `${linkStats.rttMs} ms` : "—"}
                <span className={`ml-2 text-xs ${TONE_TEXT[quality.tone]}`}>{quality.label}</span>
              </span>
            }
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-raised px-3 py-2.5">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-soft">
                <ArrowDown className="h-3.5 w-3.5 text-ok" /> Download
              </p>
              <p className="mt-0.5 font-semibold text-ghost">{formatSpeed(speeds.down)}</p>
            </div>
            <div className="rounded-xl bg-raised px-3 py-2.5">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-soft">
                <ArrowUp className="h-3.5 w-3.5 text-mint" /> Upload
              </p>
              <p className="mt-0.5 font-semibold text-ghost">{formatSpeed(speeds.up)}</p>
            </div>
          </div>

          {active.length > 0 && (
            <div className="rounded-xl bg-raised p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
                Transfers ({active.length})
              </p>
              <ul className="space-y-2">
                {active.map((f) => {
                  const m = perFile[f.id];
                  const pct = Math.round(f.progress * 100);
                  const stateLabel =
                    f.status === "paused"
                      ? "Paused"
                      : f.status === "interrupted"
                        ? "Reconnecting…"
                        : f.status === "pending"
                          ? "Waiting…"
                          : "Transferring";
                  return (
                    <li key={f.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium text-ghost">{f.name}</span>
                        <span className="shrink-0 text-soft">
                          {m && m.speed > 0 ? formatSpeed(m.speed) : stateLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ${
                              f.status === "paused" ? "bg-amber" : "bg-mint"
                            }`}
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[10px] text-soft">
                          {pct}% · {formatFileSize(Math.round(f.size * f.progress))}
                          {m?.etaS != null ? ` · ETA ${formatEta(m.etaS)}` : ""}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-soft/70">
          Direct links keep traffic between the two devices. If a direct link isn&apos;t possible
          (symmetric NAT), traffic is relayed through a TURN server — still end-to-end encrypted.
        </p>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
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
