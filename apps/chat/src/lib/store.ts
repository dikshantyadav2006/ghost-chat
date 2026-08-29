"use client";

import { create } from "zustand";
import type { LocalIdentity } from "@ghost/protocol";
import { repo } from "./identity";

export interface Prefs {
  sound: boolean;
  haptics: boolean;
  notifications: boolean;
}

export interface ToastItem {
  id: number;
  message: string;
  emoji?: string;
}

export interface CallState {
  roomId: string;
  phase: "ringing" | "active";
  direction: "incoming" | "outgoing";
  video: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

/**
 * P2P connection state for a room. Distinct from presence (`online`): a peer
 * can be online (socket connected) while the WebRTC link is still connecting.
 */
export type PeerUiState =
  | "none"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "failed";

export type PeerTransport = "direct" | "relay" | "unknown";

/** Live link-health metrics for the connection widget (WebRTC stats). */
export interface LinkStats {
  rttMs: number | null;
}

/** Per-file live transfer speed + ETA, sampled once per chat. */
export interface TransferStat {
  speed: number;
  etaS: number | null;
}

const PREF_KEY = "ghostchat:prefs";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw)
      return {
        sound: true,
        haptics: true,
        notifications: true,
        ...(JSON.parse(raw) as Partial<Prefs>),
      };
  } catch {
    // ignore
  }
  return { sound: true, haptics: true, notifications: true };
}

interface AppState {
  identity: LocalIdentity | null;
  ready: boolean;
  activeRoomId: string | null;
  /** Presence: whether the peer's socket is connected & in the room. */
  online: Record<string, boolean>;
  /** P2P link state per room (WebRTC), independent of presence. */
  peerState: Record<string, PeerUiState>;
  /** Direct vs relay (TURN) for the negotiated candidate pair. */
  transport: Record<string, PeerTransport>;
  /** Live link health (RTT) per room. */
  linkStats: Record<string, LinkStats>;
  /** Live transfer speeds/ETA per file, maintained by useTransferStats. */
  transferStats: Record<string, TransferStat>;
  /** Aggregate up/down speeds across in-flight transfers. */
  transferSpeeds: { up: number; down: number };
  typing: Record<string, boolean>;
  roomError: string | null;
  signalOnline: boolean;
  prefs: Prefs;
  toasts: ToastItem[];
  call: CallState | null;
  /** Desktop only: whether the embedded chat-details panel is open. */
  detailsOpen: boolean;
  setIdentity: (identity: LocalIdentity | null) => void;
  setReady: (ready: boolean) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setOnline: (roomId: string, online: boolean) => void;
  setPeerState: (roomId: string, state: PeerUiState) => void;
  setTransport: (roomId: string, transport: PeerTransport) => void;
  setLinkStats: (roomId: string, stats: LinkStats) => void;
  setTransferStats: (stats: Record<string, TransferStat>) => void;
  setTransferSpeeds: (speeds: { up: number; down: number }) => void;
  setTyping: (roomId: string, typing: boolean) => void;
  setRoomError: (message: string | null) => void;
  setSignalOnline: (online: boolean) => void;
  setPrefs: (prefs: Prefs) => void;
  pushToast: (message: string, emoji?: string) => void;
  dismissToast: (id: number) => void;
  setCall: (call: CallState | null) => void;
  setDetailsOpen: (open: boolean) => void;
}

let toastId = 0;

export const useApp = create<AppState>((set) => ({
  identity: null,
  ready: false,
  activeRoomId: null,
  online: {},
  peerState: {},
  transport: {},
  linkStats: {},
  transferStats: {},
  transferSpeeds: { up: 0, down: 0 },
  typing: {},
  roomError: null,
  signalOnline: false,
  prefs:
    typeof window === "undefined"
      ? { sound: true, haptics: true, notifications: true }
      : loadPrefs(),
  toasts: [],
  call: null,
  detailsOpen: true,
  setIdentity: (identity) => set({ identity }),
  setReady: (ready) => set({ ready }),
  setActiveRoomId: (activeRoomId) => {
    set({ activeRoomId });
    void repo.setLastActiveRoom(activeRoomId);
  },
  setOnline: (roomId, online) => set((s) => ({ online: { ...s.online, [roomId]: online } })),
  setPeerState: (roomId, peerState) =>
    set((s) => ({ peerState: { ...s.peerState, [roomId]: peerState } })),
  setTransport: (roomId, transport) =>
    set((s) => ({ transport: { ...s.transport, [roomId]: transport } })),
  setLinkStats: (roomId, stats) =>
    set((s) => ({ linkStats: { ...s.linkStats, [roomId]: stats } })),
  setTransferStats: (transferStats) => set({ transferStats }),
  setTransferSpeeds: (transferSpeeds) => set({ transferSpeeds }),
  setTyping: (roomId, typing) => set((s) => ({ typing: { ...s.typing, [roomId]: typing } })),
  setRoomError: (roomError) => set({ roomError }),
  setSignalOnline: (signalOnline) => set({ signalOnline }),
  setPrefs: (prefs) => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
    set({ prefs });
  },
  pushToast: (message, emoji) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, ...(emoji ? { emoji } : {}) }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setCall: (call) => set({ call }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
}));
