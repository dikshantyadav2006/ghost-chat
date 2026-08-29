import type { Identity } from "./identity.js";

export interface IceCandidateData {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface OfferPayload {
  type: "offer";
  sdp: string;
  ephemeralPub: string;
  /** Dedupe/ACK id assigned by the sender. */
  signalId: string;
  /**
   * Pair-generation id. Signals from a superseded PeerConnection carry the
   * old id and are dropped by the receiver, so a rebuilt session can never be
   * contaminated by stale offers/answers/candidates.
   */
  connectionId?: string;
}

export interface AnswerPayload {
  type: "answer";
  sdp: string;
  ephemeralPub: string;
  signalId: string;
  connectionId?: string;
}

export interface IcePayload {
  type: "ice";
  candidate: IceCandidateData;
  signalId: string;
  connectionId?: string;
}

export type SignalData = OfferPayload | AnswerPayload | IcePayload;

export type PeerRole = "offerer" | "answerer";

/**
 * A session is a single page-load/device generation. A user reloading the app
 * gets a brand-new session id while keeping the same stable identity. Session
 * ids let both the server and the remote peer tell "socket reconnect" from
 * "page reloaded" — the two cases must be handled very differently.
 */
export type SessionId = string;

/** Peer presence as observed in a room, including its current session id. */
export interface PeerPresence extends Identity {
  sessionId: string;
}

/**
 * Deterministic per-session-pair generation id stamped on every signal. Both
 * sides compute the same value from their two session ids, so a reload on
 * either side changes the id and stale signals from the superseded pair are
 * rejected by `PeerSession.acceptsSignal`. Sorted so the two peers agree
 * without knowing who is the offerer.
 */
export function computePairConnectionId(mine: string, theirs: string): string {
  return `conn-${[mine, theirs].sort().join(":")}`;
}

/**
 * Two-level signaling ACK so the sender can tell "the server accepted and
 * forwarded the signal" from "the target actually received/processed it":
 *
 *   stage: "serverAccepted"  — server relayed it to the target's socket
 *   stage: "targetReceived"  — target deduped and processed it
 *
 * Retry stops only on `targetReceived`.
 */
export type SignalAckStage = "serverAccepted" | "targetReceived";

export const SIGNAL_EVENTS = {
  client: {
    identity: "identity",
    roomCreate: "room:create",
    roomJoin: "room:join",
    peerSync: "peer:sync",
    signal: "signal",
    signalAck: "signal:ack",
  },
  server: {
    connected: "connect",
    roomCreated: "room:created",
    roomJoined: "room:joined",
    roomError: "room:error",
    roomState: "room:state",
    peerJoined: "peer:joined",
    peerSessionChanged: "peer:session-changed",
    peerLeft: "peer:left",
    signal: "signal",
    signalAck: "signal:ack",
  },
} as const;

export interface SignalClientEvents {
  [SIGNAL_EVENTS.client.identity]: (payload: Identity) => void;
  [SIGNAL_EVENTS.client.roomCreate]: (
    payload: { selfId: string; code?: string; sessionId: string },
    ack: (
      result: { code: string; peer: PeerPresence | null; role: PeerRole } | { error: string },
    ) => void,
  ) => void;
  [SIGNAL_EVENTS.client.roomJoin]: (
    payload: { code: string; selfId: string; sessionId: string },
    ack: (
      result: { peer: PeerPresence | null; selfId: string; role: PeerRole } | { error: string },
    ) => void,
  ) => void;
  /** Request a fresh snapshot of the room's current peer sessions. */
  [SIGNAL_EVENTS.client.peerSync]: (payload: { roomId: string }) => void;
  [SIGNAL_EVENTS.client.signal]: (payload: { to: string; data: SignalData }) => void;
  /** Target → server → source: "I received and processed signal `signalId`." */
  [SIGNAL_EVENTS.client.signalAck]: (payload: { to: string; signalId: string }) => void;
}

export interface SignalServerEvents {
  [SIGNAL_EVENTS.server.roomCreated]: (payload: { code: string }) => void;
  [SIGNAL_EVENTS.server.roomJoined]: (payload: { peer: Identity }) => void;
  [SIGNAL_EVENTS.server.roomError]: (payload: { message: string }) => void;
  /**
   * Authoritative room membership snapshot (the room's *other* members). Sent
   * in response to `peer:sync` so a freshly connected/reloaded client can
   * converge without depending on any missed join event.
   */
  [SIGNAL_EVENTS.server.roomState]: (payload: { roomId: string; peers: PeerPresence[] }) => void;
  [SIGNAL_EVENTS.server.peerJoined]: (payload: {
    roomId: string;
    peer: PeerPresence;
    role: PeerRole;
  }) => void;
  /** A peer's session was replaced (page reload) — remote peers must rebuild. */
  [SIGNAL_EVENTS.server.peerSessionChanged]: (payload: {
    roomId: string;
    userId: string;
    sessionId: string;
  }) => void;
  [SIGNAL_EVENTS.server.peerLeft]: (payload: {
    roomId: string;
    userId: string;
    sessionId: string;
  }) => void;
  [SIGNAL_EVENTS.server.signal]: (payload: {
    roomId: string;
    from: string;
    data: SignalData;
  }) => void;
  [SIGNAL_EVENTS.server.signalAck]: (payload: {
    roomId: string;
    from: string;
    signalId: string;
    stage: SignalAckStage;
  }) => void;
}
