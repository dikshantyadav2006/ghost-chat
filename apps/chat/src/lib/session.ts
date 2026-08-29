"use client";

import {
  computeSafetyCode,
  decryptBytes,
  decryptRaw,
  deriveRoomKey,
  encryptBytes,
  encryptRaw,
  generateKeyPair,
  randomId,
  type KeyPair,
  type RoomKey,
} from "@ghost/crypto";
import {
  SIGNAL_EVENTS,
  computePairConnectionId,
  decodeFrame,
  encodeCipherFrame,
  encodeFileChunkFrame,
  encodeJSONFrame,
  formatRoomCode,
  newId,
  normalizeRoomCode,
  missingRanges,
  rangeCount,
  rangesFromSeqs,
  FRAME_CIPHER,
  type CallPhase,
  type ChannelMessage,
  type ChatMessage,
  type ChunkRange,
  type DecodedFrame,
  type FileChunk,
  type FileMeta,
  type Identity,
  type PeerPresence,
  type PeerRole,
  type SignalAckStage,
  type SignalData,
} from "@ghost/protocol";
import { toMessageRow, type MessageRow, type OutboxRow, type RoomRow, opfsWrite, opfsRead } from "@ghost/storage";
import {
  DEFAULT_CHUNK_SIZE,
  FileAssembler,
  PeerSession,
  hashFile,
  pickChunkSize,
  streamFileRanges,
  type ChunkStore,
  type PeerConfig,
  type PeerConnectionState,
} from "@ghost/webrtc";
import { emitIdentity, emitPeerSync, getSocket } from "./signal";
import { getIceServers } from "./ice";
import { repo } from "./identity";
import { useApp, type PeerUiState } from "./store";
import { notifyIncoming } from "./notify";
import { playReceiveSound, playRingtone, stopRingtone } from "./sound";
import { registerOutboundSource, getOutboundSource, unregisterAllOutboundSources } from "./sourceFiles";
import {
  clearProgressiveMedia,
  pushProgressivePart,
  releaseProgressive,
} from "./progressiveMedia";

const EV = SIGNAL_EVENTS;

const SIGNAL_RETRY_MS = 800;
const MAX_SIGNAL_ATTEMPTS = 5;
const MAX_PEER_REBUILDS = 2;
/**
 * Backoff before a fresh PeerConnection after `failed`: attempt 1 immediate,
 * attempt 2 ~1.2s, attempt 3 ~3.5s. Recovery is driven by ICE state events,
 * not by a fixed timeout ladder.
 */
const PEER_REBUILD_BACKOFF_MS = [0, 1200, 3500];

/**
 * A session id is generated once per page load. It changes only when the app
 * is reloaded, so the server (and the remote peer) can tell "socket reconnect"
 * from "page reload". A reload is a brand-new WebRTC generation; a plain
 * socket reconnect must preserve the existing P2P link.
 */
const SESSION_ID = newId("sess");

export interface SessionPeer {
  userId: string;
  name: string;
  publicKey: string;
}

export interface SessionCallbacks {
  onError: (roomId: string, message: string) => void;
}

interface PendingSignal {
  signal: SignalData;
  attempts: number;
  serverAccepted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

function createChunkStore(): ChunkStore {
  return {
    putChunk: (chunk) => repo.putChunk(chunk.fileId, chunk.seq, chunk.data),
    countChunks: (fileId) => repo.countChunks(fileId),
    getChunk: (fileId, seq) => repo.getChunk(fileId, seq),
  };
}

export class RoomSession {
  roomId: string;
  readonly mode: "create" | "join";
  private readonly identity: Identity;
  private readonly callbacks: SessionCallbacks;
  private peer: PeerSession | null = null;
  private role: PeerRole | null = null;
  private roomKey: RoomKey | null = null;
  /** The peer `ephemeralPub` the current roomKey was derived from. */
  private roomKeyPeerPub: string | null = null;
  private readonly eph: KeyPair = generateKeyPair();
  private peerInfo: SessionPeer | null = null;
  /** The peer's current session generation (see `SESSION_ID`). */
  private peerSessionId: string | null = null;
  private readonly assemblers = new Map<string, FileAssembler>();
  /** In-flight outbound send loops, keyed by fileId. Cancelled to pause. */
  private readonly activeSends = new Map<string, { cancelled: boolean }>();
  /** Receiver-side set of persisted chunk seqs per inbound file (for resume). */
  private readonly receivedChunks = new Map<string, Set<number>>();
  private readonly signalBuffer: SignalData[] = [];
  private localCallStream: MediaStream | null = null;
  private activeCallId: string | null = null;
  private ringTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly seenSignals = new Set<string>();
  private readonly pendingSignals = new Map<string, PendingSignal>();
  private rebuildCount = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;

  constructor(
    roomId: string,
    mode: "create" | "join",
    identity: Identity,
    callbacks: SessionCallbacks,
  ) {
    this.roomId = roomId;
    this.mode = mode;
    this.identity = identity;
    this.callbacks = callbacks;
  }

  get peerUserId(): string | null {
    return this.peerInfo?.userId ?? null;
  }

  get peerPresence(): SessionPeer | null {
    return this.peerInfo;
  }

  get peerRole(): PeerRole | null {
    return this.role;
  }

  get peerSession(): string | null {
    return this.peerSessionId;
  }

  get connected(): boolean {
    return this.peer?.ready ?? false;
  }

  private log(stage: string): void {
    if (typeof console !== "undefined") {
      console.debug(`[CONN:${this.roomId}] ${stage}`);
    }
  }

  /**
   * Peer socket is present in the room → presence goes online. Records the
   * peer's current session generation; returns true when it changed (reload).
   */
  onPeerPresence(peer: SessionPeer, sessionId: string | undefined): boolean {
    const previous = this.peerSessionId;
    this.peerInfo = peer;
    if (sessionId) this.peerSessionId = sessionId;
    useApp.getState().setOnline(this.roomId, true);
    void this.persistRoom(peer);
    const changed = previous !== null && !!sessionId && sessionId !== previous;
    if (changed) {
      this.log(`peerSessionChanged=${previous}->${sessionId}`);
    }
    return changed;
  }

  setPeer(peer: SessionPeer, sessionId?: string): void {
    this.onPeerPresence(peer, sessionId);
  }

  /** Ask the server for a fresh snapshot of this room's peer sessions. */
  requestPeerSync(): void {
    if (!getSocket().connected) return;
    emitPeerSync(this.roomId);
  }

  /** Forget the rebuild budget so a reconciliation can attempt a fresh link. */
  resetRebuildBudget(): void {
    this.rebuildCount = 0;
  }

  async persistRoom(peer: SessionPeer | null): Promise<void> {
    const existing = await repo.getRoomById(this.roomId);
    const row: RoomRow = {
      id: this.roomId,
      code: formatRoomCode(this.roomId),
      mode: this.mode,
      peerUserId: peer?.userId ?? existing?.peerUserId ?? "",
      peerName: peer?.name ?? existing?.peerName ?? "",
      peerPublicKey: peer?.publicKey ?? existing?.peerPublicKey ?? "",
      safetyCode: existing?.safetyCode ?? "",
      createdAt: existing?.createdAt ?? Date.now(),
      lastActivity: Date.now(),
    };
    await repo.putRoom(row);
  }

  /**
   * Creates or arms the P2P link. Idempotent: no-op while a healthy peer
   * exists or a connection/recovery attempt is already in flight. If a
   * provisioned (pre-gathered) PeerSession is waiting, it is armed here so
   * negotiation starts immediately instead of building a fresh PC.
   *
   * `force` is for peer session changes (a reload): it bypasses the healthy/
   * in-flight guards, closes any existing PeerConnection and builds a fresh
   * generation immediately — recovery must not wait for ICE to time out.
   */
  async ensurePeerConnection(role: PeerRole, force = false): Promise<void> {
    this.role = role;
    if (!force) {
      if (this.peer?.ready) return;
      const state = useApp.getState().peerState[this.roomId];
      if (state === "connecting" || state === "reconnecting" || state === "disconnected") {
        return;
      }
      if (this.peer?.provisioned) {
        this.log("armProvisionedPeer");
        await this.peer.arm(role);
        return;
      }
    } else {
      this.log("forceRebuild=sessionChanged");
      this.resetRebuildBudget();
      this.closePeer();
    }
    await this.initPeer(role);
  }

  /** Shared PeerSession wiring for both provisional and rebuild paths. */
  private buildPeerConfig(role: PeerRole): PeerConfig {
    const config: PeerConfig = {
      role,
      polite: () => this.identity.userId > (this.peerInfo?.userId ?? ""),
      ephemeralPub: this.eph.publicKey,
      iceServers: getIceServers(),
      handlers: {
        onOpen: () => void this.onOpen(),
        onClose: () => this.onPeerClosed(),
        onFrame: (frame) => void this.onFrame(frame),
        onSignal: (signal) => this.relay(signal),
        onRemoteStream: (stream) => {
          const call = useApp.getState().call;
          if (call?.roomId === this.roomId) {
            useApp.getState().setCall({ ...call, remoteStream: stream });
          }
        },
        onStateChange: (state) => this.onPeerState(state),
        onTransport: (transport) => useApp.getState().setTransport(this.roomId, transport),
      },
    };
    if (this.peerSessionId) {
      config.signalConnectionId = computePairConnectionId(SESSION_ID, this.peerSessionId);
    }
    return config;
  }

  /**
   * Connection accelerator: opens a PeerConnection the moment the room is
   * opened (before the peer is online) so ICE candidates pre-gather during the
   * wait. `peer:joined` then arms it and negotiation is instant.
   */
  provisionPeer(role: PeerRole): void {
    if (this.peer) return;
    const state = useApp.getState().peerState[this.roomId];
    if (state === "connecting" || state === "reconnecting" || state === "disconnected") {
      return;
    }
    this.role = role;
    this.log("provisionPeer");
    this.peer = new PeerSession({
      ...this.buildPeerConfig(role),
      provisional: true,
    });
  }

  private async initPeer(role: PeerRole): Promise<void> {
    if (this.rebuildCount >= MAX_PEER_REBUILDS) {
      this.log("rebuild=maxReached");
      useApp.getState().setPeerState(this.roomId, "failed");
      return;
    }
    this.role = role;
    this.rebuildCount += 1;
    this.clearRebuildTimer();
    this.closePeer();
    useApp.getState().setPeerState(this.roomId, "connecting");
    this.log(`initPeer#${this.rebuildCount}`);

    this.peer = new PeerSession(this.buildPeerConfig(role));
    if (role === "offerer") {
      await this.peer.start();
    }
    const buffered = this.signalBuffer.splice(0);
    for (const signal of buffered) {
      await this.peer.handleSignal(signal).catch(() => {});
    }
  }

  closePeer(): void {
    this.clearRebuildTimer();
    this.cleanupCall();
    for (const [, entry] of this.pendingSignals) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.pendingSignals.clear();
    if (this.peer) {
      this.closing = true;
      this.peer.close();
      this.peer = null;
      this.closing = false;
    }
    useApp.getState().setPeerState(this.roomId, "none");
  }

  /** Called when the signaling socket drops. A healthy P2P link is preserved. */
  onSocketDown(): void {
    for (const [, entry] of this.pendingSignals) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.pendingSignals.clear();
    this.log("socketDown;pendingSignalsCleared;peerPreserved");
  }

  private onPeerState(state: PeerConnectionState): void {
    this.log(`peerState=${state}`);
    const ui: PeerUiState =
      state === "new" ? "connecting" : state === "closed" ? "none" : state;
    useApp.getState().setPeerState(this.roomId, ui);
    if (state === "connected") {
      this.clearRebuildTimer();
      this.rebuildCount = 0;
    } else if (state === "failed") {
      this.clearRebuildTimer();
      if (useApp.getState().online[this.roomId]) {
        this.scheduleRebuild();
      }
    }
  }

  private onPeerClosed(): void {
    if (this.closing) return;
    this.clearRebuildTimer();
    useApp.getState().setPeerState(this.roomId, "none");
    if (useApp.getState().online[this.roomId]) {
      void this.ensurePeerConnection(this.role ?? "answerer");
    }
    void this.failStuckTransfers();
    this.cleanupCall();
  }

  /**
   * Event-driven rebuild: after `failed` (ICE restarts exhausted), replace the
   * PeerConnection with a fresh one. Short escalating backoff, then stop and
   * surface `failed` in the UI.
   */
  private scheduleRebuild(): void {
    if (this.rebuildTimer) return;
    if (this.rebuildCount >= MAX_PEER_REBUILDS) {
      this.log("rebuild=maxReached");
      useApp.getState().setPeerState(this.roomId, "failed");
      return;
    }
    const delay = PEER_REBUILD_BACKOFF_MS[this.rebuildCount] ?? 0;
    this.log(`rebuild=scheduledIn${delay}ms`);
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      void this.ensurePeerConnection(this.role ?? "answerer");
    }, delay);
  }

  private clearRebuildTimer(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
  }

  private relay(signal: SignalData): void {
    const peerId = this.peerInfo?.userId;
    if (!peerId) return;
    const signalId = signal.signalId;
    if (!signalId || signalId.length === 0) return;
    if (this.pendingSignals.has(signalId)) return;
    this.pendingSignals.set(signalId, {
      signal,
      attempts: 0,
      serverAccepted: false,
      timer: null,
    });
    this.sendSignal(signalId);
  }

  private sendSignal(signalId: string): void {
    const entry = this.pendingSignals.get(signalId);
    const peerId = this.peerInfo?.userId;
    if (!entry || !peerId) return;
    if (!getSocket().connected) return;
    getSocket().emit(EV.client.signal, { to: peerId, data: entry.signal });
    entry.attempts += 1;
    this.log(`signalSent=${entry.signal.type}#${signalId} attempt=${entry.attempts}`);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.attempts > MAX_SIGNAL_ATTEMPTS) {
      this.pendingSignals.delete(signalId);
      this.log(`signalRetryExhausted=${signalId}`);
      return;
    }
    entry.timer = setTimeout(() => {
      if (this.pendingSignals.has(signalId)) this.sendSignal(signalId);
    }, SIGNAL_RETRY_MS);
  }

  onSignalAck(signalId: string, stage: SignalAckStage): void {
    const entry = this.pendingSignals.get(signalId);
    if (!entry) return;
    if (stage === "serverAccepted") {
      entry.serverAccepted = true;
      this.log(`signalServerAck=${signalId}`);
      return;
    }
    if (entry.timer) clearTimeout(entry.timer);
    this.pendingSignals.delete(signalId);
    this.log(`signalTargetAck=${signalId}`);
  }

  async handleSignal(signal: SignalData, from: string): Promise<void> {
    const signalId = signal.signalId;
    if (!signalId || signalId.length === 0) return;
    if (this.seenSignals.has(signalId)) {
      // Duplicate from a retry — ack idempotently, don't re-process.
      this.sendSignalAck(from, signalId);
      return;
    }
    this.seenSignals.add(signalId);
    if (this.seenSignals.size > 512) {
      const first = this.seenSignals.values().next().value;
      if (first) this.seenSignals.delete(first);
    }
    this.log(`signalReceived=${signal.type}#${signalId}`);
    this.sendSignalAck(from, signalId);

    if ((signal.type === "offer" || signal.type === "answer") && signal.ephemeralPub) {
      // A reload spins up a fresh RoomSession with a new ephemeral key, so the
      // peer's ephemeralPub changes across a rebuild. Re-derive the room key
      // whenever it does — caching on !this.roomKey alone leaves the surviving
      // peer encrypting with the old generation's key, so every frame fails
      // MAC and is silently dropped.
      if (!this.roomKey || signal.ephemeralPub !== this.roomKeyPeerPub) {
        this.roomKey = await deriveRoomKey({
          privateKey: this.eph.privateKey,
          peerPublicKey: signal.ephemeralPub,
          roomId: this.roomId,
        });
        this.roomKeyPeerPub = signal.ephemeralPub;
        await this.updateSafetyCode();
      }
    }
    if (!this.peer) {
      this.signalBuffer.push(signal);
      return;
    }
    await this.peer.handleSignal(signal);
  }

  private sendSignalAck(to: string, signalId: string): void {
    getSocket().emit(EV.client.signalAck, { to, signalId });
  }

  private async updateSafetyCode(): Promise<void> {
    const peer = this.peerInfo;
    if (!peer || !this.roomKey) return;
    const code = await computeSafetyCode({
      roomId: this.roomId,
      myPublicKey: this.identity.publicKey,
      peerPublicKey: peer.publicKey,
      sharedSecret: this.roomKey.raw,
    });
    const row = await repo.getRoomById(this.roomId);
    if (row) await repo.putRoom({ ...row, safetyCode: code });
  }

  private async onOpen(): Promise<void> {
    this.clearRebuildTimer();
    this.rebuildCount = 0;
    useApp.getState().setOnline(this.roomId, true);
    useApp.getState().setPeerState(this.roomId, "connected");
    await this.sendEncrypted(encodeJSONFrame({ kind: "hello", identity: this.identity }));
    await this.resumeInboundFiles();
    await this.flushOutbox();
  }

  private async sendEncrypted(
    frame: Uint8Array,
    kind: OutboxRow["kind"] = "other",
    queue = true,
  ): Promise<"sent" | "queued" | "skipped"> {
    if (this.peer?.ready && this.roomKey) {
      const enc = await encryptBytes(this.roomKey.key, frame);
      const out = encodeJSONFrame({ kind: "cipher", payload: enc });
      await this.peer.sendFrame(out);
      return "sent";
    }
    if (!this.roomKey) return "skipped";
    if (!queue) return "queued";
    await repo.addToOutbox({
      id: randomId("o"),
      roomId: this.roomId,
      envelope: frame,
      createdAt: Date.now(),
      attempts: 0,
      kind,
    });
    return "queued";
  }

  async flushOutbox(): Promise<void> {
    if (!this.peer?.ready || !this.roomKey) return;
    const items = await repo.listOutbox(this.roomId);
    for (const item of items) {
      try {
        const enc = await encryptBytes(this.roomKey.key, item.envelope);
        await this.peer.sendFrame(encodeJSONFrame({ kind: "cipher", payload: enc }));
        if (item.kind === "message") {
          await repo.updateMessageStatus(item.id, "sent", Date.now());
        } else {
          await repo.removeFromOutbox(item.id);
        }
      } catch {
        return;
      }
    }
  }

  private async enqueueMessage(message: ChatMessage): Promise<void> {
    await repo.putMessage(toMessageRow(this.roomId, true, message));
    await repo.touchRoom(this.roomId, Date.now());
    await repo.addToOutbox({
      id: message.id,
      roomId: this.roomId,
      envelope: encodeJSONFrame({ kind: "message", message }),
      createdAt: message.ts,
      attempts: 0,
      kind: "message",
    });
    await this.flushOutbox();
  }

  async sendText(text: string, replyTo?: string, opts?: { forwarded?: boolean }): Promise<void> {
    const message: ChatMessage = {
      id: randomId("m"),
      kind: "text",
      ts: Date.now(),
      text,
      ...(replyTo !== undefined ? { replyTo } : {}),
      ...(opts?.forwarded ? { forwarded: true } : {}),
    };
    await this.enqueueMessage(message);
  }

  async sendFile(
    file: File,
    replyTo?: string,
    opts?: { voice?: boolean; forwarded?: boolean },
  ): Promise<void> {
    const sha256 = await hashFile(file);
    const fileId = randomId("f");
    const chunkSize = pickChunkSize(this.peer?.maxMessageSize);
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    // Keep the sender's own File in memory so its bubbles can preview the media
    // until a durable source exists (in-tab retention; cleared on identity reset).
    registerOutboundSource(fileId, file);
    // Also persist to OPFS so the preview survives page reloads.
    void opfsWrite(fileId, file).then((opfsId) => {
      if (opfsId) repo.setFileOpfs(fileId, opfsId);
    });
    const fileMeta: FileMeta = {
      id: fileId,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      sha256,
      chunkSize,
      totalChunks,
    };
    const message: ChatMessage = {
      id: randomId("m"),
      kind: "file",
      ts: Date.now(),
      file: fileMeta,
      ...(replyTo !== undefined ? { replyTo } : {}),
      ...(opts?.voice ? { voice: true } : {}),
      ...(opts?.forwarded ? { forwarded: true } : {}),
    };
    await repo.putFile({
      id: fileId,
      roomId: this.roomId,
      name: file.name,
      mime: fileMeta.mime,
      size: fileMeta.size,
      sha256,
      chunkSize,
      totalChunks,
      direction: "out",
      status: "transferring",
      progress: 0,
      receivedChunks: 0,
    });
    await this.enqueueMessage(message);

    await this.runOutboundSend(fileId, file, chunkSize, totalChunks, [[0, totalChunks - 1]], 0);
  }

  /**
   * Streams a chunk range set for an outbound file while honouring pause
   * (cancelled) requests. Chunk send is idempotent — the receiver dedupes — so
   * resume can restart from a receiver-provided range set safely.
   */
  private async runOutboundSend(
    fileId: string,
    file: File | Blob,
    chunkSize: number,
    totalChunks: number,
    ranges: ChunkRange[],
    startCount: number,
  ): Promise<void> {
    const control = { cancelled: false };
    const existing = this.activeSends.get(fileId);
    if (existing) existing.cancelled = true;
    this.activeSends.set(fileId, control);
    let count = startCount;
    try {
      for await (const chunk of streamFileRanges(file, fileId, chunkSize, ranges, totalChunks)) {
        if (control.cancelled) return;
        await this.sendCipherChunk(chunk);
        count = chunk.seq + 1;
        await repo.setLastSentChunk(fileId, chunk.seq);
        await repo.updateFileTransfer(fileId, "transferring", count / totalChunks, count);
      }
      if (control.cancelled) return;
      await this.sendEncrypted(encodeJSONFrame({ kind: "file:ready", fileId }));
      await repo.updateFileTransfer(fileId, "done", 1, count);
    } catch (err) {
      if (control.cancelled) {
        await repo.updateFileTransfer(fileId, "paused", count / totalChunks, count);
        return;
      }
      const reason = err instanceof Error ? err.message : "connection dropped";
      await repo.updateFileTransfer(fileId, "interrupted", count / totalChunks, count);
      this.callbacks.onError(this.roomId, `File send interrupted: ${reason}`);
    } finally {
      if (this.activeSends.get(fileId) === control) this.activeSends.delete(fileId);
    }
  }

  /** Pauses an in-flight transfer (sender or receiver). */
  async pauseFile(fileId: string): Promise<void> {
    const file = await repo.getFile(fileId);
    if (!file || file.status === "done" || file.status === "error") return;
    if (file.direction === "out") {
      const control = this.activeSends.get(fileId);
      if (control) control.cancelled = true;
    }
    await repo.updateFileTransfer(fileId, "paused", file.progress, file.receivedChunks);
    await this.sendEncrypted(encodeJSONFrame({ kind: "file:pause", fileId }));
  }

  /** Resumes a paused/interrupted transfer (sender or receiver). */
  async resumeFile(fileId: string): Promise<void> {
    const file = await repo.getFile(fileId);
    if (!file || file.status === "done") return;
    if (file.direction === "out") {
      const source = getOutboundSource(fileId) ?? (file.opfsId ? await opfsRead(file.opfsId) : null) as File | Blob | null;
      if (!source) {
        this.callbacks.onError(this.roomId, "File no longer on this device — peer can request resend");
        return;
      }
      const chunkSize = file.chunkSize || DEFAULT_CHUNK_SIZE;
      const total = file.totalChunks ?? Math.max(1, Math.ceil(file.size / chunkSize));
      // Sender-side cursor may overshoot what the receiver actually got, so ask
      // the receiver for its ranges first; fall back to the sender cursor.
      const control = this.activeSends.get(fileId);
      if (control) control.cancelled = true;
      const startSeq = (file.lastSentChunk ?? -1) + 1;
      await repo.updateFileTransfer(fileId, "transferring", file.progress, file.receivedChunks);
      await this.runOutboundSend(
        fileId,
        source as File,
        chunkSize,
        total,
        [[startSeq, total - 1]],
        startSeq,
      );
      return;
    }
    // Receiver: ask the sender to resume with our exact received ranges.
    const ranges = await this.getReceivedRanges(fileId);
    const row = await repo.getFile(fileId);
    await repo.updateFileTransfer(fileId, "transferring", file.progress, file.receivedChunks);
    await this.sendEncrypted(
      encodeJSONFrame({
        kind: "file:resume",
        fileId,
        totalChunks: row?.totalChunks ?? 0,
        receivedRanges: ranges,
      }),
    );
  }

  /** Live link health (RTT) for the connection-health widget. */
  async getLinkStats(): Promise<{ rttMs: number | null }> {
    return (await this.peer?.getConnectionStats()) ?? { rttMs: null };
  }

  private async resumeInboundFiles(): Promise<void> {
    const files = await repo.listFiles(this.roomId);
    for (const file of files) {
      if (
        file.direction === "in" &&
        (file.status === "pending" ||
          file.status === "transferring" ||
          file.status === "interrupted")
      ) {
        const ranges = await this.getReceivedRanges(file.id);
        await this.sendEncrypted(
          encodeJSONFrame({
            kind: "file:resume",
            fileId: file.id,
            totalChunks: file.totalChunks ?? 0,
            receivedRanges: ranges,
          }),
        );
      }
    }
  }

  private async getReceivedRanges(fileId: string): Promise<ChunkRange[]> {
    const set = this.receivedChunks.get(fileId);
    if (set && set.size > 0) {
      const ranges = rangesFromSeqs([...set].sort((a, b) => a - b));
      await repo.setFileRanges(fileId, JSON.stringify(ranges));
      return ranges;
    }
    const row = await repo.getFile(fileId);
    return row?.receivedRanges ? (JSON.parse(row.receivedRanges) as ChunkRange[]) : [];
  }

  private async persistRanges(fileId: string): Promise<void> {
    const set = this.receivedChunks.get(fileId);
    if (!set || set.size === 0) return;
    const ranges = rangesFromSeqs([...set].sort((a, b) => a - b));
    await repo.setFileRanges(fileId, JSON.stringify(ranges));
  }

  /** Peer asked us (the sender) to resume sending missing chunks. */
  private async handlePeerResume(
    fileId: string,
    receivedRanges: ChunkRange[],
    totalChunks: number,
  ): Promise<void> {
    const file = await repo.getFile(fileId);
    if (!file || file.direction !== "out") return;
    if (file.status === "done") {
      await this.sendEncrypted(encodeJSONFrame({ kind: "file:ready", fileId }));
      return;
    }
    const source = getOutboundSource(fileId) ?? (file.opfsId ? await opfsRead(file.opfsId) : null) as File | Blob | null;
    if (!source) {
      this.callbacks.onError(
        this.roomId,
        "File no longer on this device — unable to resume transfer",
      );
      return;
    }
    const chunkSize = file.chunkSize || DEFAULT_CHUNK_SIZE;
    const total = totalChunks || file.totalChunks || Math.max(1, Math.ceil(file.size / chunkSize));
    const ranges: ChunkRange[] =
      receivedRanges && receivedRanges.length > 0
        ? missingRanges(total, receivedRanges)
        : [[0, total - 1]];
    const startCount = total - rangeCount(ranges);
    await repo.updateFileTransfer(fileId, "transferring", file.progress, file.receivedChunks);
    await this.runOutboundSend(fileId, source as File, chunkSize, total, ranges, startCount);
  }

  /** Peer paused an inbound transfer — stop streaming it. */
  private async handlePeerPause(fileId: string): Promise<void> {
    const file = await repo.getFile(fileId);
    if (!file) return;
    if (file.direction === "out") {
      const control = this.activeSends.get(fileId);
      if (control) control.cancelled = true;
    }
    await repo.updateFileTransfer(fileId, "paused", file.progress, file.receivedChunks);
  }

  async sendVoice(blob: Blob): Promise<void> {
    const mime = blob.type || "audio/webm";
    const ext = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm";
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
    await this.sendFile(file, undefined, { voice: true });
  }

  async startCall(video: boolean): Promise<void> {
    if (!this.peer?.ready) throw new Error("Peer not connected");
    if (useApp.getState().call) throw new Error("Call already in progress");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    this.localCallStream = stream;
    this.activeCallId = randomId("c");
    useApp.getState().setCall({
      roomId: this.roomId,
      phase: "ringing",
      direction: "outgoing",
      video,
      localStream: stream,
      remoteStream: null,
    });
    await this.sendEncrypted(
      encodeJSONFrame({ kind: "call", phase: "ring", callId: this.activeCallId, video }),
    );
    if (useApp.getState().prefs.sound) playRingtone();
  }

  async acceptCall(): Promise<void> {
    const call = useApp.getState().call;
    if (!call || call.roomId !== this.roomId) return;
    stopRingtone();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.video });
    this.localCallStream = stream;
    this.peer?.addMediaStream(stream);
    useApp.getState().setCall({ ...call, phase: "active", localStream: stream });
    await this.sendEncrypted(
      encodeJSONFrame({ kind: "call", phase: "accept", callId: this.activeCallId ?? "" }),
    );
  }

  async rejectCall(): Promise<void> {
    stopRingtone();
    await this.sendEncrypted(
      encodeJSONFrame({ kind: "call", phase: "reject", callId: this.activeCallId ?? "" }),
    );
    this.cleanupCall();
  }

  async endCall(): Promise<void> {
    stopRingtone();
    await this.sendEncrypted(
      encodeJSONFrame({ kind: "call", phase: "end", callId: this.activeCallId ?? "" }),
    );
    this.cleanupCall();
  }

  toggleMute(): void {
    const track = this.localCallStream?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
  }

  toggleVideo(): void {
    const track = this.localCallStream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
  }

  private cleanupCall(): void {
    stopRingtone();
    if (this.ringTimeout) {
      clearTimeout(this.ringTimeout);
      this.ringTimeout = null;
    }
    this.localCallStream?.getTracks().forEach((t) => t.stop());
    this.localCallStream = null;
    this.activeCallId = null;
    const call = useApp.getState().call;
    if (call?.roomId === this.roomId) useApp.getState().setCall(null);
  }

  private async sendCipherChunk(chunk: FileChunk): Promise<void> {
    if (!this.peer?.ready || !this.roomKey) throw new Error("channel not ready");
    const inner = encodeFileChunkFrame(chunk);
    const enc = await encryptRaw(this.roomKey.key, inner);
    await this.peer.sendFrame(encodeCipherFrame(enc));
  }

  private async failStuckTransfers(): Promise<void> {
    const files = await repo.listFiles(this.roomId);
    for (const file of files) {
      if (file.status === "pending" || file.status === "transferring") {
        if (file.direction === "in") {
          releaseProgressive(file.id);
          await this.persistRanges(file.id);
        }
        await repo.updateFileTransfer(file.id, "interrupted", file.progress, file.receivedChunks);
      }
    }
  }

  async sendTyping(active: boolean): Promise<void> {
    if (!this.peer?.ready || !this.roomKey) return;
    await this.sendEncrypted(encodeJSONFrame({ kind: "typing", active }));
  }

  async sendReaction(messageId: string, emoji: string, add: boolean): Promise<void> {
    await repo.applyReactionLocal(messageId, emoji, add);
    await repo.setReactionRoomId(messageId, this.roomId);
    await this.sendEncrypted(encodeJSONFrame({ kind: "reaction", messageId, emoji, add }));
  }

  async sendEdit(messageId: string, text: string): Promise<void> {
    await repo.applyEdit(messageId, text, Date.now());
    await this.sendEncrypted(encodeJSONFrame({ kind: "edit", messageId, text, ts: Date.now() }));
  }

  async sendDelete(messageId: string): Promise<void> {
    await repo.applyTombstone(messageId, Date.now());
    await this.sendEncrypted(encodeJSONFrame({ kind: "delete", messageId, ts: Date.now() }));
  }

  async markAllRead(): Promise<void> {
    const messages = await repo.listMessages(this.roomId);
    for (const m of messages) {
      if (!m.isMine && (m.status === "received" || m.status === "delivered")) {
        await this.sendEncrypted(
          encodeJSONFrame({ kind: "ack", messageId: m.id, status: "read", ts: Date.now() }),
        );
        await repo.updateMessageStatus(m.id, "read", Date.now());
      }
    }
  }

  private async onFrame(frame: DecodedFrame): Promise<void> {
    if (frame.type === FRAME_CIPHER) {
      if (!this.roomKey) return;
      try {
        const inner = await decryptRaw(this.roomKey.key, frame.cipher);
        await this.onFrame(decodeFrame(inner));
      } catch {
        // bad MAC or malformed payload — drop silently
      }
      return;
    }
    if (frame.type === 0) {
      await this.onChannelMessage(frame.message);
      return;
    }
    await this.onFileChunk(frame.chunk);
  }

  private async onChannelMessage(msg: ChannelMessage): Promise<void> {
    switch (msg.kind) {
      case "hello": {
        const peer = this.peerInfo;
        const match =
          !!peer &&
          msg.identity.userId === peer.userId &&
          msg.identity.publicKey === peer.publicKey;
        if (!match) {
          this.callbacks.onError(this.roomId, "Security warning: unexpected peer identity");
        }
        await this.flushOutbox();
        break;
      }
      case "cipher": {
        if (!this.roomKey) return;
        try {
          const inner = await decryptBytes(this.roomKey.key, msg.payload);
          await this.onFrame(decodeFrame(inner));
        } catch {
          // bad MAC or malformed payload — drop silently
        }
        break;
      }
      case "message": {
        const m = msg.message;
        await repo.putMessage(toMessageRow(this.roomId, false, m));
        if (m.kind === "file" && m.file) {
          const meta = m.file;
          if (!(await repo.getFile(meta.id))) {
            await repo.putFile({
              id: meta.id,
              roomId: this.roomId,
              name: meta.name,
              mime: meta.mime,
              size: meta.size,
              sha256: meta.sha256,
              chunkSize: meta.chunkSize,
              totalChunks: meta.totalChunks,
              direction: "in",
              status: "pending",
              progress: 0,
              receivedChunks: 0,
            });
          }
          this.assemblers.set(
            meta.id,
            new FileAssembler(
              meta.id,
              createChunkStore(),
              meta.totalChunks,
              meta.size,
              meta.sha256,
            ),
          );
        }
        await repo.touchRoom(this.roomId, Date.now());
        const visible = useApp.getState().activeRoomId === this.roomId;
        const peerName = this.peerInfo?.name ?? "";
        const preview =
          m.kind === "file"
            ? `📎 ${m.file?.name ?? "file"}${m.voice ? " (voice note)" : ""}`
            : (m.text ?? "");
        void notifyIncoming({ roomId: this.roomId, peerName, text: preview });
        if (useApp.getState().prefs.sound && !document.hidden) playReceiveSound();
        await this.sendEncrypted(
          encodeJSONFrame({
            kind: "ack",
            messageId: m.id,
            status: visible ? "read" : "delivered",
            ts: Date.now(),
          }),
        );
        await repo.updateMessageStatus(m.id, visible ? "read" : "received", Date.now());
        break;
      }
      case "ack": {
        await repo.updateMessageStatus(msg.messageId, msg.status, msg.ts);
        await repo.removeFromOutbox(msg.messageId);
        break;
      }
      case "typing": {
        useApp.getState().setTyping(this.roomId, msg.active);
        break;
      }
      case "edit": {
        await repo.applyEdit(msg.messageId, msg.text, msg.ts);
        break;
      }
      case "delete": {
        await repo.applyTombstone(msg.messageId, msg.ts);
        break;
      }
      case "file:ready": {
        const file = await repo.getFile(msg.fileId);
        if (file && file.status !== "done") {
          await repo.updateFileTransfer(msg.fileId, "done", 1, file.receivedChunks);
        }
        break;
      }
      case "file:resume": {
        await this.handlePeerResume(msg.fileId, msg.receivedRanges, msg.totalChunks);
        break;
      }
      case "file:pause": {
        await this.handlePeerPause(msg.fileId);
        break;
      }
      case "reaction": {
        await repo.applyReactionRemote(msg.messageId, msg.emoji, msg.add);
        await repo.setReactionRoomId(msg.messageId, this.roomId);
        break;
      }
      case "call": {
        await this.onCallMessage(msg);
        break;
      }
    }
  }

  private async onCallMessage(msg: { phase: CallPhase; callId: string; video?: boolean }): Promise<void> {
    if (msg.callId !== this.activeCallId && msg.phase !== "ring") return;
    switch (msg.phase) {
      case "ring": {
        if (this.activeCallId) break;
        if (useApp.getState().call) {
          await this.sendEncrypted(
            encodeJSONFrame({ kind: "call", phase: "reject", callId: msg.callId }),
          );
          break;
        }
        this.activeCallId = msg.callId;
        useApp.getState().setCall({
          roomId: this.roomId,
          phase: "ringing",
          direction: "incoming",
          video: msg.video ?? false,
          localStream: null,
          remoteStream: null,
        });
        if (useApp.getState().prefs.sound) playRingtone();
        this.ringTimeout = setTimeout(() => {
          const call = useApp.getState().call;
          if (call?.roomId === this.roomId && call.phase === "ringing") {
            void this.rejectCall();
            useApp.getState().pushToast("Missed call", "📵");
          }
        }, 30000);
        break;
      }
      case "accept": {
        stopRingtone();
        const stream = this.localCallStream;
        if (stream) this.peer?.addMediaStream(stream);
        await this.peer?.sendOffer();
        const call = useApp.getState().call;
        if (call?.roomId === this.roomId) {
          useApp.getState().setCall({ ...call, phase: "active" });
        }
        break;
      }
      case "reject": {
        if (msg.callId === this.activeCallId) {
          this.cleanupCall();
          useApp.getState().pushToast("Call declined", "📵");
        }
        break;
      }
      case "end": {
        if (msg.callId === this.activeCallId) {
          this.cleanupCall();
          useApp.getState().pushToast("Call ended", "📞");
        }
        break;
      }
    }
  }

  private async onFileChunk(chunk: FileChunk): Promise<void> {
    let assembler = this.assemblers.get(chunk.fileId);
    if (!assembler) {
      // Rebuild after a reload/reconnect from the persisted file row so resume still works.
      const row = await repo.getFile(chunk.fileId);
      if (!row || row.direction !== "in") return;
      assembler = new FileAssembler(
        chunk.fileId,
        createChunkStore(),
        chunk.total,
        row.size,
        row.sha256,
      );
      this.assemblers.set(chunk.fileId, assembler);
    }
    await assembler.add(chunk);
    let receivedSet = this.receivedChunks.get(chunk.fileId);
    if (!receivedSet) {
      receivedSet = new Set<number>();
      const existing = await repo.listChunks(chunk.fileId);
      for (const c of existing) receivedSet.add(c.seq);
      this.receivedChunks.set(chunk.fileId, receivedSet);
    }
    receivedSet.add(chunk.seq);
    const fileRow = await repo.getFile(chunk.fileId);
    if (fileRow) {
      if (
        fileRow.mime.startsWith("image/") ||
        fileRow.mime.startsWith("video/") ||
        fileRow.mime.startsWith("audio/")
      ) {
        pushProgressivePart(chunk.fileId, chunk.data);
      }
      const received = await repo.countChunks(chunk.fileId);
      await repo.updateFileTransfer(chunk.fileId, "transferring", received / chunk.total, received);
      if (received % 128 === 0) await this.persistRanges(chunk.fileId);
    }
    if (!(await assembler.isComplete())) return;
    await this.persistRanges(chunk.fileId);
    const assembled = await assembler.assembleToOpfs();
    if (assembled.valid) {
      if (assembled.opfsPath) {
        await repo.setFileOpfs(chunk.fileId, assembled.opfsPath);
      }
      // Keep the blob in IndexedDB for quick access (small/medium files).
      if (assembled.blob) {
        await repo.setFileDone(chunk.fileId, assembled.blob);
      }
      releaseProgressive(chunk.fileId);
      await this.sendEncrypted(encodeJSONFrame({ kind: "file:ready", fileId: chunk.fileId }));
    } else if (fileRow) {
      releaseProgressive(chunk.fileId);
      await repo.updateFileTransfer(
        chunk.fileId,
        "error",
        fileRow.progress,
        fileRow.receivedChunks,
      );
    }
    this.assemblers.delete(chunk.fileId);
    this.receivedChunks.delete(chunk.fileId);
  }
}

const sessions = new Map<string, RoomSession>();
const pendingOpens = new Map<string, Promise<RoomSession>>();
const reconnectTimers = new Map<string, ReturnType<typeof setInterval>>();
let initialized = false;
let identity: Identity | null = null;

export function setSessionIdentity(id: Identity | null): void {
  identity = id;
}

export function getSession(roomId: string): RoomSession | undefined {
  return sessions.get(roomId);
}

/**
 * Forwards an existing message into another room. Opens that room's session if
 * needed. Files are re-sent from the locally stored blob.
 */
export async function sendForward(opts: {
  room: RoomRow;
  identity: Identity;
  message: MessageRow;
}): Promise<void> {
  let target = sessions.get(opts.room.id);
  if (!target) {
    target = await openRoom({
      roomId: opts.room.id,
      mode: opts.room.mode,
      identity: opts.identity,
      callbacks: { onError: (_id, msg) => useApp.getState().setRoomError(msg) },
    });
  }
  if (opts.message.kind === "text") {
    await target.sendText(opts.message.text ?? "", undefined, { forwarded: true });
    return;
  }
  const file = await repo.getFile(opts.message.fileId ?? "");
  let source: Blob | null = file?.blob ?? null;
  if (!source && file) {
    source = getOutboundSource(file.id) ?? null;
  }
  if (!source || !file) throw new Error("File not downloaded yet");
  const f = new File([source], file.name, { type: file.mime });
  await target.sendFile(f, undefined, {
    forwarded: true,
    ...(opts.message.voice ? { voice: true } : {}),
  });
}

export function closeSession(roomId: string): void {
  sessions.get(roomId)?.closePeer();
  clearWatch(roomId);
  sessions.delete(roomId);
}

export function closeAllSessions(): void {
  for (const roomId of [...sessions.keys()]) closeSession(roomId);
  identity = null;
  unregisterAllOutboundSources();
  clearProgressiveMedia();
}

export function initSessionManager(): void {
  if (initialized) return;
  initialized = true;
  const s = getSocket();

  s.on(EV.server.roomError, ({ message }) => {
    for (const roomId of sessions.keys()) useApp.getState().setTyping(roomId, false);
    useApp.getState().setRoomError(message);
  });

  s.on(EV.server.signalAck, ({ signalId, stage }) => {
    for (const session of sessions.values()) {
      session.onSignalAck(signalId, stage);
    }
  });

  s.on(EV.server.signal, ({ roomId, from, data }) => {
    const session = sessions.get(roomId) ?? findSessionByPeer(from);
    if (session) void session.handleSignal(data, from).catch(() => {});
  });

  s.on(EV.server.peerJoined, ({ roomId, peer, role }) => {
    const session = sessions.get(roomId);
    if (!session) return;
    useApp.getState().setTyping(roomId, false);
    const changed = session.onPeerPresence(
      { userId: peer.userId, name: peer.name, publicKey: peer.publicKey },
      peer.sessionId,
    );
    void session.ensurePeerConnection(role, changed);
    if (session.connected) clearWatch(roomId);
  });

  // A peer reloaded: its session generation changed. Rebuild immediately.
  s.on(EV.server.peerSessionChanged, ({ roomId, userId, sessionId }) => {
    const session = sessions.get(roomId);
    if (!session) return;
    const info = session.peerPresence;
    if (!info || info.userId !== userId) return;
    const changed = session.onPeerPresence(info, sessionId);
    if (changed) {
      void session.ensurePeerConnection(session.peerRole ?? "offerer", true);
    }
  });

  // Authoritative membership snapshot from `peer:sync` — converge on it
  // regardless of any join event we might have missed.
  s.on(EV.server.roomState, ({ roomId, peers }) => {
    const session = sessions.get(roomId);
    if (!session) return;
    const peer = peers[0];
    if (!peer) {
      useApp.getState().setOnline(roomId, false);
      useApp.getState().setTyping(roomId, false);
      return;
    }
    const changed = session.onPeerPresence(
      { userId: peer.userId, name: peer.name, publicKey: peer.publicKey },
      peer.sessionId,
    );
    const state = useApp.getState().peerState[roomId];
    const force = changed || state === "failed";
    if (force) session.resetRebuildBudget();
    void session.ensurePeerConnection(session.peerRole ?? "answerer", force);
    if (session.connected) clearWatch(roomId);
  });

  s.on(EV.server.peerLeft, ({ roomId, userId: _userId, sessionId }) => {
    const session = sessions.get(roomId);
    if (!session) return;
    // Ignore a stale peer:left for a superseded session (reload already
    // replaced it). The server only emits peer:left for the current session,
    // but this guards against out-of-order delivery.
    if (session.peerSession && sessionId && sessionId !== session.peerSession) return;
    useApp.getState().setOnline(roomId, false);
    useApp.getState().setTyping(roomId, false);
    session.closePeer();
    // Re-sync right away: a fast reload re-announces quickly, so don't wait
    // for the watchdog to notice the peer is back.
    session.requestPeerSync();
    watchReconnect(roomId);
  });

  s.on("disconnect", () => {
    for (const session of sessions.values()) {
      useApp.getState().setOnline(session.roomId, false);
      useApp.getState().setTyping(session.roomId, false);
      session.onSocketDown();
    }
  });

  s.on(EV.server.connected, () => {
    if (identity) {
      emitIdentity(identity);
      void reestablishAll();
      // Start the watchdog for rooms where the peer may be stale after a
      // socket reconnect (mirrors the Android fix).
      for (const [roomId, session] of sessions) {
        if (!session.connected) watchReconnect(roomId);
      }
    }
  });

  // Cheap reconciliation triggers: coming back to the tab, back on the
  // network, restored from bfcache, or re-focusing the window may mean the
  // peer's session changed while we were away. All funnel into a peer:sync,
  // which drives the authoritative rebuild.
  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      for (const session of sessions.values()) session.requestPeerSync();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onNetwork = () => {
    for (const session of sessions.values()) session.requestPeerSync();
  };
  window.addEventListener("online", onNetwork);
  const onPageshow = (e: PageTransitionEvent) => {
    if (e.persisted || document.visibilityState === "visible") {
      for (const session of sessions.values()) session.requestPeerSync();
    }
  };
  window.addEventListener("pageshow", onPageshow);
  const onFocus = () => {
    for (const session of sessions.values()) session.requestPeerSync();
  };
  window.addEventListener("focus", onFocus);
}

export async function openRoom(opts: {
  roomId: string;
  mode: "create" | "join";
  identity: Identity;
  callbacks: SessionCallbacks;
  /**
   * When false, the room is registered with the server (presence online) but
   * no WebRTC link is pre-built until a peer is actually present. Used by the
   * app-level background opener so idle rooms stay lightweight.
   */
  preload?: boolean;
}): Promise<RoomSession> {
  initSessionManager();
  identity = opts.identity;
  await ensureRegistered();

  const existing = sessions.get(opts.roomId);
  if (existing) return existing;

  const inFlight = pendingOpens.get(opts.roomId);
  if (inFlight) return inFlight;

  const promise = doOpenRoom(opts);
  pendingOpens.set(opts.roomId, promise);
  try {
    return await promise;
  } finally {
    if (pendingOpens.get(opts.roomId) === promise) pendingOpens.delete(opts.roomId);
  }
}

async function doOpenRoom(opts: {
  roomId: string;
  mode: "create" | "join";
  identity: Identity;
  callbacks: SessionCallbacks;
  preload?: boolean;
}): Promise<RoomSession> {
  const s = getSocket();
  const session = new RoomSession(opts.roomId, opts.mode, opts.identity, opts.callbacks);
  sessions.set(opts.roomId, session);

  if (opts.mode === "create") {
    let peer: SessionPeer | null = null;
    let peerSessionId: string | undefined;
    let role: PeerRole = "answerer";
    await new Promise<void>((resolve, reject) => {
      s.emit(
        EV.client.roomCreate,
        { selfId: opts.identity.userId, code: opts.roomId, sessionId: SESSION_ID },
        (res) => {
          if ("error" in res) {
            sessions.delete(opts.roomId);
            reject(new Error(res.error));
            return;
          }
          const roomId = normalizeRoomCode(res.code);
          if (roomId && roomId !== opts.roomId) {
            sessions.delete(opts.roomId);
            sessions.set(roomId, session);
            session.roomId = roomId;
          }
          peer = res.peer;
          peerSessionId = res.peer?.sessionId;
          role = res.role;
          resolve();
        },
      );
    });
    if (peer) {
      session.setPeer(peer, peerSessionId);
      void session.ensurePeerConnection(role);
      clearWatch(session.roomId);
    } else {
      await session.persistRoom(null);
      if (opts.preload !== false) session.provisionPeer(role);
    }
    return session;
  }

  let joinedPeer: SessionPeer | null = null;
  let joinedSessionId: string | undefined;
  let joinedRole: PeerRole = "offerer";
  await new Promise<void>((resolve, reject) => {
    s.emit(
      EV.client.roomJoin,
      { code: opts.roomId, selfId: opts.identity.userId, sessionId: SESSION_ID },
      (res) => {
        if ("error" in res) {
          sessions.delete(opts.roomId);
          reject(new Error(res.error));
          return;
        }
        joinedRole = res.role;
        if (res.peer) {
          joinedPeer = res.peer;
          joinedSessionId = res.peer.sessionId;
          session.setPeer(joinedPeer, joinedSessionId);
          void session.ensurePeerConnection(res.role);
          clearWatch(session.roomId);
        }
        resolve();
      },
    );
  });
  if (!joinedPeer) {
    await session.persistRoom(null);
    if (opts.preload !== false) session.provisionPeer(joinedRole);
  }
  return session;
}

/**
 * App-level session manager: silently opens a session for every room stored on
 * this device so the socket + server know we are online in all of them for the
 * whole app session. WebRTC links are built lazily (only when a peer is
 * actually present), so idle rooms stay lightweight. This is what makes
 * messages/calls/files arrive no matter which screen is open — "chat open" is
 * pure UI state, connectivity is app-level.
 */
export async function openAllRooms(identity: Identity): Promise<void> {
  initSessionManager();
  setSessionIdentity(identity);
  await ensureRegistered();
  const rooms = await repo.listRooms();
  for (const room of rooms) {
    try {
      await openRoom({
        roomId: room.id,
        mode: room.mode,
        identity,
        preload: false,
        callbacks: { onError: (_roomId, msg) => console.debug(`[bg:${room.id}] ${msg}`) },
      });
    } catch (err) {
      console.debug(`[bg:${room.id}] open failed`, err);
    }
  }
  const last = await repo.getLastActiveRoom();
  if (last && !rooms.some((r) => r.id === last)) {
    await repo.setLastActiveRoom(null);
  }
}

function findSessionByPeer(userId: string): RoomSession | undefined {
  for (const session of sessions.values()) {
    if (session.peerUserId === userId) return session;
  }
  return undefined;
}

function ensureRegistered(): Promise<void> {
  const id = identity;
  if (!id) return Promise.resolve();
  const s = getSocket();
  return new Promise((resolve) => {
    if (s.connected) {
      emitIdentity(id);
      resolve();
    } else {
      const onConnect = () => {
        emitIdentity(id);
        s.off(EV.server.connected, onConnect);
        resolve();
      };
      s.on(EV.server.connected, onConnect);
    }
  });
}

async function reestablishAll(): Promise<void> {
  for (const session of [...sessions.values()]) {
    void reestablishSession(session);
    session.requestPeerSync();
  }
}

/**
 * Re-registers a room after a signaling reconnect to refresh presence/peer
 * info. Uses the same `sessionId` as the original load, so the server treats
 * it as a socket reconnect — NOT a page reload — and the remote peer keeps its
 * healthy P2P link. `ensurePeerConnection` is a no-op while the channel is
 * open or a recovery attempt is in flight.
 */
function reestablishSession(session: RoomSession): Promise<boolean> {
  const s = getSocket();
  const id = identity;
  if (!id) return Promise.resolve(false);

  const onAck = (
    res: { peer: PeerPresence | null; role: PeerRole } | { error: string },
  ): boolean => {
    if ("error" in res) return false;
    if (res.peer) {
      const changed = session.onPeerPresence(
        { userId: res.peer.userId, name: res.peer.name, publicKey: res.peer.publicKey },
        res.peer.sessionId,
      );
      void session.ensurePeerConnection(res.role, changed);
    } else {
      useApp.getState().setOnline(session.roomId, false);
    }
    return true;
  };

  return new Promise((resolve) => {
    if (session.mode === "create") {
      s.emit(
        EV.client.roomCreate,
        { selfId: id.userId, code: session.roomId, sessionId: SESSION_ID },
        (res) => {
          resolve(onAck(res));
        },
      );
    } else {
      s.emit(
        EV.client.roomJoin,
        { code: session.roomId, selfId: id.userId, sessionId: SESSION_ID },
        (res) => {
          resolve(onAck(res));
        },
      );
    }
  });
}

/**
 * Lightweight reconciliation watchdog: while a room is not P2P-connected,
 * periodically ask the server for the authoritative peer snapshot. The
 * `room:state` handler drives the rebuild, so we only need the peer to be
 * present — no join-event timing dependency. Stops once connected.
 */
function watchReconnect(roomId: string): void {
  if (reconnectTimers.has(roomId)) return;
  let stuckSince = Date.now();
  const timer = setInterval(() => {
    const session = sessions.get(roomId);
    if (!session) {
      clearWatch(roomId);
      return;
    }
    if (getSocket().disconnected) return;
    if (session.connected) {
      clearWatch(roomId);
      return;
    }
    // Reset timer when the state is actively progressing (not stuck).
    const state = useApp.getState().peerState[roomId];
    if (state !== "none" && state !== "connecting") {
      stuckSince = Date.now();
    }
    // If stuck in "none" or "connecting" for >10 s while signal is
    // connected, force-destroy the peer and rebuild from scratch.
    if (Date.now() - stuckSince > 10_000) {
      stuckSince = Date.now();
      void session.ensurePeerConnection((session.peerRole ?? "answerer") as PeerRole, true);
    }
    session.requestPeerSync();
  }, 3000);
  reconnectTimers.set(roomId, timer);
}

function clearWatch(roomId: string): void {
  const timer = reconnectTimers.get(roomId);
  if (timer) {
    clearInterval(timer);
    reconnectTimers.delete(roomId);
  }
}
