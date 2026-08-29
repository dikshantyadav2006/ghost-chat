import {
  decodeFrame,
  newId,
  type DecodedFrame,
  type IceCandidateData,
  type IcePayload,
  type OfferPayload,
  type AnswerPayload,
  type SignalData,
} from "@ghost/protocol";

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "failed"
  | "closed";

export type PeerTransportType = "direct" | "relay" | "unknown";

export interface PeerHandlers {
  onOpen: () => void;
  onClose: () => void;
  onFrame: (frame: DecodedFrame) => void;
  onSignal: (signal: SignalData) => void;
  onStateChange: (state: PeerConnectionState) => void;
  /** Called when a remote media track/stream arrives (call). */
  onRemoteStream?: (stream: MediaStream) => void;
  /** Reports the negotiated candidate-pair kind (direct vs relay/TURN). */
  onTransport?: (type: PeerTransportType) => void;
}

export interface PeerConfig {
  role: "offerer" | "answerer";
  /**
   * Stable per-pair flag for perfect negotiation. The polite peer rolls back
   * its own in-flight offer on a collision; the impolite peer ignores the
   * conflicting incoming offer. Accepts a function so the value can be
   * resolved lazily (the peer's identity is unknown while provisioned).
   */
  polite: boolean | (() => boolean);
  ephemeralPub: string;
  handlers: PeerHandlers;
  iceServers?: RTCIceServer[];
  /** ICE candidates to prefetch before negotiation (defaults to 4). */
  iceCandidatePoolSize?: number;
  /**
   * Pair-generation id stamped on every outgoing signal. The offerer's id is
   * adopted by the answerer (and re-seeded across rebuilds) so stale signals
   * from a superseded PeerConnection are rejected on both sides.
   */
  signalConnectionId?: string;
  /**
   * Create the PeerConnection and prefetch ICE candidates now, but suppress
   * negotiation until `arm()` is called. Lets a room pre-gather candidates
   * before its peer comes online so connection establishment is instant.
   */
  provisional?: boolean;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/**
 * Number of ICE candidates the browser prefetches per connection. Lets the
 * stack gather candidates before negotiation starts, so the first
 * offer/answer has candidates ready immediately.
 */
export const DEFAULT_ICE_CANDIDATE_POOL_SIZE = 4;

/** Max automatic ICE restarts per PeerSession before reporting `failed`. */
export const MAX_ICE_RESTARTS = 2;
/** How long to wait on `disconnected` before attempting an ICE restart. */
export const DISCONNECTED_RECOVERY_MS = 5000;

/**
 * Flow-control windows for the data channel.
 * Sending pauses once bufferedAmount exceeds the high-water mark and
 * resumes when it drains below the low-water mark. Kept conservative so
 * bufferedAmount never approaches the browser's internal send-queue cap.
 */
export const BUFFER_HIGH_WATER = 4 * 1024 * 1024;
export const BUFFER_LOW_WATER = 1 * 1024 * 1024;

interface GateChannelLike {
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  addEventListener: (type: "bufferedamountlow", listener: () => void) => void;
  removeEventListener: (type: "bufferedamountlow", listener: () => void) => void;
}

/**
 * Returns an async gate that resolves once the channel's buffered amount
 * has drained below the low-water mark. Callers await it before sending the
 * next batch so large transfers never flood the channel.
 */
export function createBufferedAmountGate(
  channel: GateChannelLike,
  opts: { highWater?: number; lowWater?: number; pollMs?: number } = {},
): { setThreshold: () => void; drain: () => Promise<void> } {
  const highWater = opts.highWater ?? BUFFER_HIGH_WATER;
  const lowWater = opts.lowWater ?? BUFFER_LOW_WATER;
  const pollMs = opts.pollMs ?? 150;

  channel.bufferedAmountLowThreshold = lowWater;

  let gate: { promise: Promise<void>; resolve: () => void } | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPoll = (): void => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const resolveGate = (): void => {
    const g = gate;
    if (!g) return;
    gate = null;
    clearPoll();
    g.resolve();
  };

  const onLow = (): void => {
    if (channel.bufferedAmount <= lowWater) resolveGate();
  };
  channel.addEventListener("bufferedamountlow", onLow);

  const drain = async (): Promise<void> => {
    if (channel.bufferedAmount <= highWater) return;
    if (!gate) {
      let resolve!: () => void;
      gate = { promise: new Promise<void>((r) => (resolve = r)), resolve };
      pollTimer = setTimeout(function pollTick() {
        if (channel.bufferedAmount <= lowWater) {
          resolveGate();
          return;
        }
        pollTimer = setTimeout(pollTick, pollMs);
      }, pollMs);
    }
    await gate.promise;
  };

  return {
    setThreshold: () => {
      channel.bufferedAmountLowThreshold = lowWater;
    },
    drain,
  };
}

/**
 * Encrypted-signaling peer. Drives the offer/answer dance with the MDN
 * perfect-negotiation pattern (polite/impolite collision handling), buffers
 * ICE candidates until a remote description exists, and recovers from
 * `disconnected`/`failed` via ICE restart.
 */
export class PeerSession {
  /** Stable per-session id used in `[CONN]` diagnostics and rebuild tracking. */
  readonly connectionId = newId("conn");
  private readonly pc: RTCPeerConnection;
  private readonly ephemeralPub: string;
  private readonly handlers: PeerHandlers;
  private readonly isPolite: () => boolean;
  private channel: RTCDataChannel | null = null;
  private gate: ReturnType<typeof createBufferedAmountGate> | null = null;
  private remoteStream: MediaStream | null = null;
  private closed = false;
  private readonly pendingCandidates: IceCandidateData[] = [];
  private makingOffer = false;
  private pendingNegotiation = false;
  private restartCount = 0;
  private disconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Generation id stamped on every outgoing signal. Starts as this session's
   * own id; the answerer adopts the offerer's id so both sides agree on the
   * current pair generation and stale signals are rejected.
   */
  private pairConnectionId: string;
  /**
   * True when `signalConnectionId` was supplied at construction (a known
   * session pair). A pinned session rejects offers from any other generation
   * instead of adopting them — a reloaded answerer must never let a superseded
   * offer from the old pair hijack its connection.
   */
  private readonly pinnedConnectionId: boolean;
  /** False while provisioned — negotiation is suppressed until `arm()`. */
  private armed = true;

  constructor(config: PeerConfig) {
    this.handlers = config.handlers;
    this.ephemeralPub = config.ephemeralPub;
    const polite = config.polite;
    this.isPolite = typeof polite === "function" ? polite : () => polite;
    this.pairConnectionId = config.signalConnectionId ?? this.connectionId;
    this.pinnedConnectionId = !!config.signalConnectionId;
    this.armed = !(config.provisional ?? false);
    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers ?? DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: config.iceCandidatePoolSize ?? DEFAULT_ICE_CANDIDATE_POOL_SIZE,
    });

    this.log("createPeer");

    this.pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.remoteStream = stream;
        this.handlers.onRemoteStream?.(stream);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (this.closed || !event.candidate) return;
      const payload: IcePayload = {
        type: "ice",
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment,
        },
        signalId: newId("s"),
        connectionId: this.stampConnectionId(),
      };
      this.log("candidateSent");
      this.handlers.onSignal(payload);
    };

    // Perfect negotiation: createOffer is driven here (data channel creation,
    // track additions and ICE restarts all fire this event).
    this.pc.onnegotiationneeded = () => {
      void this.negotiate();
    };

    this.pc.oniceconnectionstatechange = () => {
      this.onIceConnectionState();
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "closed") this.onIceConnectionState();
    };

    // Renegotiation (e.g. call media added) can be requested while a previous
    // negotiation is still in flight. When the signaling transaction settles
    // back to `stable`, retry any negotiation that was deferred so media
    // m-lines are never silently dropped.
    this.pc.onsignalingstatechange = () => {
      if (this.closed) return;
      if (this.pc.signalingState === "stable" && this.pendingNegotiation) {
        this.pendingNegotiation = false;
        void this.negotiate();
      }
    };

    if (config.role === "offerer") {
      this.channel = this.pc.createDataChannel("ghostchat", { ordered: true });
      this.setupChannel(this.channel);
    } else {
      this.pc.ondatachannel = (event) => {
        this.channel = event.channel;
        this.setupChannel(this.channel);
      };
    }
  }

  private setupChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    this.gate = createBufferedAmountGate(channel, {
      highWater: BUFFER_HIGH_WATER,
      lowWater: BUFFER_LOW_WATER,
    });
    channel.onopen = () => {
      this.gate?.setThreshold();
      this.log("dataChannel=open");
      this.handlers.onOpen();
    };
    channel.onclose = () => {
      this.log("dataChannel=closed");
      this.handlers.onClose();
    };
    channel.onerror = () => {
      this.log("dataChannel=error");
      this.handlers.onClose();
    };
    channel.onmessage = (event) => {
      void this.handleMessageEvent(event);
    };
  }

  private async handleMessageEvent(event: MessageEvent): Promise<void> {
    let bytes: Uint8Array;
    if (typeof event.data === "string") {
      bytes = new TextEncoder().encode(event.data);
    } else if (event.data instanceof ArrayBuffer) {
      bytes = new Uint8Array(event.data);
    } else if (ArrayBuffer.isView(event.data)) {
      bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    } else if (event.data instanceof Blob) {
      bytes = new Uint8Array(await event.data.arrayBuffer());
    } else {
      return;
    }
    try {
      this.handlers.onFrame(decodeFrame(bytes));
    } catch {
      // ignore malformed frames
    }
  }

  private log(stage: string): void {
    if (typeof console !== "undefined") {
      console.debug(`[CONN:${this.connectionId}] ${stage}`);
    }
  }

  private report(state: PeerConnectionState): void {
    if (this.closed) return;
    this.handlers.onStateChange(state);
  }

  private sendSignal(signal: SignalData): void {
    this.handlers.onSignal(signal);
  }

  /**
   * Offerer: send the initial offer now. Idempotent — the perfect-negotiation
   * guard skips if an offer is already in flight (e.g. negotiationneeded beat
   * us to it).
   */
  async start(): Promise<void> {
    await this.negotiate();
  }

  /**
   * Begin negotiation on a provisioned session (created to pre-gather ICE
   * candidates before the peer came online). No-op on a normal session.
   */
  async arm(role: "offerer" | "answerer"): Promise<void> {
    if (this.closed || this.armed) return;
    this.armed = true;
    if (role === "offerer") await this.negotiate();
  }

  /** True while this session is provisioned and not yet negotiating. */
  get provisioned(): boolean {
    return !this.armed && !this.closed;
  }

  /** The generation id stamped on outgoing signals (offerer id, once adopted). */
  private stampConnectionId(): string {
    return this.pairConnectionId;
  }

  /**
   * Rejects signals from a superseded pair generation. Signals without a
   * connectionId (legacy/unknowable) are accepted so first contact still works.
   */
  private acceptsSignal(connectionId: string | undefined): boolean {
    if (!connectionId) return true;
    return connectionId === this.pairConnectionId;
  }

  /** Renegotiation after media tracks were added (call). No-op while negotiating. */
  async sendOffer(): Promise<void> {
    await this.negotiate();
  }

  /** Force a fresh ICE restart. No-op unless the connection is idle/stable. */
  restartIce(): void {
    if (this.closed) return;
    if (this.pc.signalingState === "stable" || this.pc.iceConnectionState === "failed") {
      this.escalateIce();
    }
  }

  private async negotiate(): Promise<void> {
    if (this.closed) return;
    if (!this.armed) return;
    if (this.makingOffer || this.pc.signalingState !== "stable") {
      // A negotiation is already in flight. Remember the request and re-run it
      // once signaling returns to `stable` so it is not silently lost.
      this.pendingNegotiation = true;
      return;
    }
    this.log("createOffer");
    let offer: RTCSessionDescriptionInit | null = null;
    try {
      this.makingOffer = true;
      offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
    } catch (err) {
      this.log(`negotiationFailed=${err instanceof Error ? err.message : "unknown"}`);
      return;
    } finally {
      this.makingOffer = false;
    }
    const desc = this.pc.localDescription;
    if (desc?.type === "offer") {
      this.log("offerSent");
      this.sendSignal({
        type: "offer",
        sdp: desc.sdp ?? offer?.sdp ?? "",
        ephemeralPub: this.ephemeralPub,
        signalId: newId("s"),
        connectionId: this.stampConnectionId(),
      });
    }
  }

  async handleSignal(signal: SignalData): Promise<void> {
    switch (signal.type) {
      case "offer":
        await this.handleOffer(signal);
        break;
      case "answer":
        await this.handleAnswer(signal);
        break;
      case "ice":
        await this.handleIce(signal);
        break;
    }
  }

  private async handleOffer(signal: OfferPayload): Promise<void> {
    this.log("offerReceived");
    // Reject offers from a superseded pair generation. A pinned session knows
    // its expected connectionId and must not adopt a stale offer (e.g. the
    // old session's relayed retry) — that would corrupt the new generation.
    if (this.pinnedConnectionId && signal.connectionId && signal.connectionId !== this.pairConnectionId) {
      this.log("staleSignal=offer");
      return;
    }
    if (this.makingOffer || this.pc.signalingState !== "stable") {
      if (!this.isPolite()) {
        this.log("offerCollisionIgnored");
        return;
      }
      this.log("rollbackForCollision");
      try {
        await this.pc.setLocalDescription({ type: "rollback" });
      } catch {
        // already rolling back — ignore
      }
    }
    // Adopt the offerer's pair generation so every response/candidate we send
    // carries the id the offerer accepts. Re-seeded across rebuilds.
    if (signal.connectionId) this.pairConnectionId = signal.connectionId;
    await this.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
    this.log("remoteDescriptionSet");
    await this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    const desc = this.pc.localDescription;
    if (desc?.type === "answer") {
      this.log("answerSent");
      this.sendSignal({
        type: "answer",
        sdp: desc.sdp ?? answer?.sdp ?? "",
        ephemeralPub: this.ephemeralPub,
        signalId: newId("s"),
        connectionId: this.stampConnectionId(),
      });
    }
  }

  private async handleAnswer(signal: AnswerPayload): Promise<void> {
    this.log("answerReceived");
    if (!this.acceptsSignal(signal.connectionId)) {
      this.log("staleSignal=answer");
      return;
    }
    if (this.pc.signalingState !== "have-local-offer") return;
    await this.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
    this.log("remoteDescriptionSet");
    await this.flushPendingCandidates();
  }

  private async handleIce(signal: IcePayload): Promise<void> {
    if (!this.acceptsSignal(signal.connectionId)) {
      this.log("staleSignal=ice");
      return;
    }
    // Candidates that arrive before a remote description exist must be queued,
    // otherwise addIceCandidate() silently drops them.
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(signal.candidate);
      return;
    }
    this.log("candidateReceived");
    try {
      await this.pc.addIceCandidate(signal.candidate as RTCIceCandidateInit);
    } catch {
      // candidate may already be applied — ignore
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    const queued = this.pendingCandidates.splice(0);
    if (queued.length === 0) return;
    this.log(`candidateFlush=${queued.length}`);
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
      } catch {
        // stale candidate — ignore
      }
    }
  }

  private onIceConnectionState(): void {
    if (this.closed) return;
    const state = this.pc.iceConnectionState;
    this.log(`iceState=${state}`);
    switch (state) {
      case "checking":
        this.report("connecting");
        break;
      case "connected":
      case "completed":
        this.clearDisconnectedTimer();
        this.restartCount = 0;
        // ICE connectivity alone is not chat-readiness: the SCTP data channel
        // may still be negotiating. Keep reporting "connecting" until the
        // channel is open so `channel.onopen` stays the single source of
        // truth — otherwise a session might tear down a live-but-not-ready
        // connection and rebuild it.
        if (this.channel?.readyState === "open") {
          this.report("connected");
        }
        void this.updateTransportType();
        break;
      case "disconnected":
        this.report("disconnected");
        this.armDisconnectedRecovery();
        break;
      case "failed":
        this.escalateIce();
        break;
      case "closed":
        this.clearDisconnectedTimer();
        this.report("closed");
        break;
      default:
        break;
    }
  }

  private armDisconnectedRecovery(): void {
    if (this.disconnectedTimer) return;
    this.disconnectedTimer = setTimeout(() => {
      this.disconnectedTimer = null;
      if (this.closed) return;
      const state = this.pc.iceConnectionState;
      if (state === "disconnected" || state === "failed") this.escalateIce();
    }, DISCONNECTED_RECOVERY_MS);
  }

  private clearDisconnectedTimer(): void {
    if (this.disconnectedTimer) {
      clearTimeout(this.disconnectedTimer);
      this.disconnectedTimer = null;
    }
  }

  private escalateIce(): void {
    this.clearDisconnectedTimer();
    if (this.restartCount >= MAX_ICE_RESTARTS) {
      this.log("iceRestart=max");
      this.report("failed");
      return;
    }
    this.restartCount += 1;
    this.log(`iceRestart=${this.restartCount}`);
    this.report("reconnecting");
    try {
      // Triggers negotiationneeded → a fresh offer with new ICE credentials.
      this.pc.restartIce();
    } catch {
      this.log("iceRestart=notNegotiated");
      this.report("failed");
    }
  }

  private async updateTransportType(): Promise<void> {
    try {
      const stats = await this.pc.getStats();
      let type: PeerTransportType = "unknown";
      for (const report of stats.values()) {
        if (report.type !== "transport") continue;
        const pairId = (report as { selectedCandidatePairId?: string }).selectedCandidatePairId;
        if (!pairId) continue;
        const pair = stats.get(pairId);
        if (!pair) continue;
        const localId = (pair as { localCandidateId?: string }).localCandidateId;
        if (!localId) continue;
        const local = stats.get(localId);
        if (local && "candidateType" in local) {
          type = local.candidateType === "relay" ? "relay" : "direct";
          break;
        }
      }
      this.handlers.onTransport?.(type);
    } catch {
      // stats unavailable — transport stays "unknown"
    }
  }

  /**
   * Measures the negotiated candidate pair's round-trip time (ms) via the
   * WebRTC stats API. Returns `null` while no pair is selected (e.g. not yet
   * connected). Used by the connection-health widget.
   */
  async getConnectionStats(): Promise<{ rttMs: number | null }> {
    if (this.closed) return { rttMs: null };
    try {
      const stats = await this.pc.getStats();
      for (const report of stats.values()) {
        if (report.type !== "candidate-pair") continue;
        const pair = report as { selected?: boolean; currentRoundTripTime?: number };
        if (
          pair.selected &&
          typeof pair.currentRoundTripTime === "number" &&
          pair.currentRoundTripTime > 0
        ) {
          return { rttMs: Math.round(pair.currentRoundTripTime * 1000) };
        }
      }
      return { rttMs: null };
    } catch {
      // stats unavailable — RTT stays "null"
      return { rttMs: null };
    }
  }

  /** Adds local media tracks (call). Safe to call once per track. */
  addMediaStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      try {
        this.pc.addTrack(track, stream);
      } catch {
        // track already added
      }
    }
    // addTrack fires onnegotiationneeded → renegotiation offer.
  }

  async sendFrame(frame: Uint8Array): Promise<void> {
    const channel = this.channel;
    if (!channel || channel.readyState !== "open") {
      throw new Error("channel not open");
    }
    await this.gate?.drain();
    try {
      channel.send(frame as Uint8Array<ArrayBuffer>);
    } catch (error) {
      const isQueueFull = (error as { name?: string } | null)?.name === "OperationError";
      if (!this.gate || !isQueueFull) throw error;
      await this.gate.drain();
      channel.send(frame as Uint8Array<ArrayBuffer>);
    }
  }

  get ready(): boolean {
    return this.channel?.readyState === "open";
  }

  /** The SCTP transport's maximum message size, once negotiated. */
  get maxMessageSize(): number | undefined {
    return this.pc.sctp?.maxMessageSize;
  }

  get receivedRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearDisconnectedTimer();
    try {
      this.channel?.close();
    } catch {
      // already closed
    }
    this.pc.close();
  }
}
