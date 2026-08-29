import type { Server, Socket } from "socket.io";
import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SIGNAL_EVENTS,
  formatRoomCode,
  generateRoomCode,
  isValidPublicKey,
  isValidSessionId,
  isValidUserId,
  normalizeRoomCode,
  type Identity,
  type PeerPresence,
  type PeerRole,
  type SignalClientEvents,
  type SignalData,
  type SignalServerEvents,
} from "@ghost/protocol";

const EV = SIGNAL_EVENTS;

interface ClientState {
  identity: Identity | null;
  rooms: Set<string>;
}

interface RoomMember {
  socketId: string;
  sessionId: string;
}

interface PersistedRoom {
  code: string;
  owner: string;
  peerUserId: string | null;
  createdAt: number;
  members: Record<string, RoomMember>;
}

interface RoomRecord {
  code: string;
  owner: string;
  peerUserId: string | null;
  createdAt: number;
  members: Map<string, RoomMember>;
}

const ROOM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class SignalHub {
  private readonly clients = new Map<string, ClientState>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly storePath: string;
  private readonly ready: Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    io: Server<SignalClientEvents, SignalServerEvents>,
    private readonly allowUpToTwoPeers = true,
    storePath?: string,
  ) {
    this.storePath = storePath ?? path.join(process.cwd(), ".data", "rooms.json");
    this.ready = this.load();
    io.on("connection", (socket) => {
      this.clients.set(socket.id, { identity: null, rooms: new Set() });
      this.attach(socket, io);
    });
  }

  roomCount(): number {
    return this.rooms.size;
  }

  peerCount(): number {
    return this.clients.size;
  }

  private attach(
    socket: Socket<SignalClientEvents, SignalServerEvents>,
    io: Server<SignalClientEvents, SignalServerEvents>,
  ): void {
    socket.on(EV.client.identity, (payload) => {
      if (!isValidUserId(payload.userId) || !isValidPublicKey(payload.publicKey)) {
        socket.emit(EV.server.roomError, { message: "invalid identity" });
        return;
      }
      const state = this.clients.get(socket.id);
      if (!state) return;
      state.identity = {
        userId: payload.userId,
        name: payload.name.trim().slice(0, 40) || "ghost",
        publicKey: payload.publicKey,
      };
    });

    socket.on(EV.client.roomCreate, async (payload, ack) => {
      await this.ready;
      const identity = this.requireIdentity(socket);
      if (!identity) return;
      if (!isValidSessionId(payload?.sessionId)) {
        ack?.({ error: "invalid session" });
        return;
      }

      const requested = typeof payload?.code === "string" ? normalizeRoomCode(payload.code) : "";
      if (requested) {
        const existing = this.rooms.get(requested);
        if (existing) {
          if (existing.owner !== identity.userId) {
            ack?.({ error: "code taken" });
            return;
          }
          this.upsertMember(io, existing, identity, socket.id, payload.sessionId);
          this.scheduleSave();
          ack?.({
            code: formatRoomCode(requested),
            peer: this.peerOf(existing, identity.userId),
            role: this.roleOf(existing, identity.userId),
          });
          return;
        }
      }

      let code = requested;
      if (!code) {
        do {
          code = generateRoomCode();
        } while (this.rooms.has(code));
      }
      this.rooms.set(code, {
        code,
        owner: identity.userId,
        peerUserId: null,
        createdAt: Date.now(),
        members: new Map([[identity.userId, { socketId: socket.id, sessionId: payload.sessionId }]]),
      });
      this.clients.get(socket.id)?.rooms.add(code);
      this.scheduleSave();
      ack?.({ code: formatRoomCode(code), peer: null, role: "answerer" });
    });

    socket.on(EV.client.roomJoin, async (payload, ack) => {
      await this.ready;
      const identity = this.requireIdentity(socket);
      if (!identity) return;
      const code = normalizeRoomCode(payload.code);
      if (!code) {
        ack?.({ error: "invalid room code" });
        return;
      }
      if (!isValidSessionId(payload?.sessionId)) {
        ack?.({ error: "invalid session" });
        return;
      }
      const room = this.rooms.get(code);
      if (!room) {
        ack?.({ error: "room not found" });
        return;
      }

      const existingMember = room.members.get(identity.userId);
      if (existingMember && existingMember.socketId === socket.id) {
        // already on this exact socket — nothing to do
        const peerIdentity = this.peerOf(room, identity.userId);
        ack?.({
          peer: peerIdentity,
          selfId: identity.userId,
          role: this.roleOf(room, identity.userId),
        });
        return;
      }
      if (existingMember) {
        // same user reconnecting (same sessionId) or reloading (new sessionId)
        this.upsertMember(io, room, identity, socket.id, payload.sessionId);
        this.scheduleSave();
      } else {
        if (room.peerUserId !== null && room.peerUserId !== identity.userId) {
          ack?.({ error: "room is full" });
          return;
        }
        if (this.allowUpToTwoPeers && room.members.size >= 2) {
          ack?.({ error: "room is full" });
          return;
        }
        this.upsertMember(io, room, identity, socket.id, payload.sessionId);
        if (room.peerUserId === null) room.peerUserId = identity.userId;
        this.scheduleSave();
      }

      ack?.({
        peer: this.peerOf(room, identity.userId),
        selfId: identity.userId,
        role: this.roleOf(room, identity.userId),
      });
    });

    socket.on(EV.client.peerSync, (payload) => {
      const state = this.clients.get(socket.id);
      if (!state?.identity) return;
      const code = normalizeRoomCode(payload?.roomId);
      if (!code) return;
      const room = this.rooms.get(code);
      if (!room || !state.rooms.has(code)) return;
      const peers: PeerPresence[] = [];
      for (const [userId, member] of room.members) {
        if (userId === state.identity.userId) continue;
        const identity = this.clients.get(member.socketId)?.identity;
        if (!identity) continue;
        peers.push({ ...identity, sessionId: member.sessionId });
      }
      socket.emit(EV.server.roomState, { roomId: code, peers });
    });

    socket.on(EV.client.signal, (payload) => {
      const state = this.clients.get(socket.id);
      if (!state?.identity) return;
      const data = this.sanitizeSignal(payload.data);
      if (!data) return;
      const target = this.findTarget(socket, payload.to);
      if (!target) return;
      const from = state.identity.userId;
      // Stage 1 ACK: the server accepted and forwarded the signal to the
      // target's live socket. This does NOT mean the receiver processed it.
      socket.emit(EV.server.signalAck, {
        roomId: target.roomId,
        from,
        signalId: data.signalId,
        stage: "serverAccepted",
      });
      io.to(target.socketId).emit(EV.server.signal, { roomId: target.roomId, from, data });
    });

    socket.on(EV.client.signalAck, (payload) => {
      const state = this.clients.get(socket.id);
      if (!state?.identity) return;
      if (typeof payload?.signalId !== "string" || payload.signalId.length === 0) return;
      const target = this.findTarget(socket, payload.to);
      if (!target) return;
      const from = state.identity.userId;
      // Stage 2 ACK: the target received/processed the signal. Retry stops here.
      io.to(target.socketId).emit(EV.server.signalAck, {
        roomId: target.roomId,
        from,
        signalId: payload.signalId,
        stage: "targetReceived",
      });
    });

    socket.on("disconnect", () => {
      const state = this.clients.get(socket.id);
      this.clients.delete(socket.id);
      if (!state?.identity) return;
      for (const code of state.rooms) {
        const room = this.rooms.get(code);
        if (!room) continue;
        const member = room.members.get(state.identity.userId);
        if (!member || member.socketId !== socket.id) continue;
        room.members.delete(state.identity.userId);
        for (const otherMember of room.members.values()) {
          io.to(otherMember.socketId).emit(EV.server.peerLeft, {
            roomId: code,
            userId: state.identity.userId,
            sessionId: member.sessionId,
          });
        }
        this.scheduleSave();
      }
    });
  }

  /**
   * Adds or replaces a user's membership in a room. Emits `peer:session-changed`
   * to the other members when the user's session generation changed (page
   * reload) so they rebuild the P2P link, and `peer:joined` in all cases so
   * presence refreshes even on a plain socket reconnect.
   */
  private upsertMember(
    io: Server<SignalClientEvents, SignalServerEvents>,
    room: RoomRecord,
    joiner: Identity,
    socketId: string,
    sessionId: string,
  ): void {
    const existing = room.members.get(joiner.userId);
    const sessionChanged = !!existing && existing.sessionId !== sessionId;
    room.members.set(joiner.userId, { socketId, sessionId });
    this.clients.get(socketId)?.rooms.add(room.code);
    if (sessionChanged) {
      for (const [userId, otherMember] of room.members) {
        if (userId === joiner.userId) continue;
        io.to(otherMember.socketId).emit(EV.server.peerSessionChanged, {
          roomId: room.code,
          userId: joiner.userId,
          sessionId,
        });
      }
    }
    this.notifyPeerJoined(io, room, joiner);
  }

  private notifyPeerJoined(
    io: Server<SignalClientEvents, SignalServerEvents>,
    room: RoomRecord,
    joiner: Identity,
  ): void {
    const joinerSession = room.members.get(joiner.userId)?.sessionId;
    for (const [userId, member] of room.members) {
      if (userId === joiner.userId) continue;
      io.to(member.socketId).emit(EV.server.peerJoined, {
        roomId: room.code,
        peer: { ...joiner, sessionId: joinerSession ?? "" },
        role: this.roleOf(room, userId),
      });
    }
  }

  private roleOf(room: RoomRecord, userId: string): PeerRole {
    return userId === room.owner ? "answerer" : "offerer";
  }

  private peerOf(room: RoomRecord, userId: string): PeerPresence | null {
    const otherUserId = userId === room.owner ? room.peerUserId : room.owner;
    if (!otherUserId) return null;
    const member = room.members.get(otherUserId);
    if (!member) return null;
    const identity = this.clients.get(member.socketId)?.identity;
    if (!identity) return null;
    return { ...identity, sessionId: member.sessionId };
  }

  private requireIdentity(socket: Socket): Identity | null {
    const state = this.clients.get(socket.id);
    if (!state?.identity) {
      socket.emit(EV.server.roomError, { message: "identity not registered" });
      return null;
    }
    return state.identity;
  }

  private findTarget(
    socket: Socket,
    targetUserId: string,
  ): { roomId: string; socketId: string } | null {
    const state = this.clients.get(socket.id);
    if (!state) return null;
    for (const code of state.rooms) {
      const room = this.rooms.get(code);
      if (!room) continue;
      const member = room.members.get(targetUserId);
      if (member) return { roomId: room.code, socketId: member.socketId };
    }
    return null;
  }

  private sanitizeSignal(data: unknown): SignalData | null {
    if (typeof data !== "object" || data === null) return null;
    const d = data as SignalData;
    if (typeof d.signalId !== "string" || d.signalId.length === 0 || d.signalId.length > 64) {
      return null;
    }
    if (d.type === "offer" || d.type === "answer") {
      if (typeof d.sdp !== "string") return null;
    } else if (d.type === "ice") {
      if (typeof d.candidate !== "object" || d.candidate === null) return null;
    } else {
      return null;
    }
    return d;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as { rooms?: PersistedRoom[] };
      const now = Date.now();
      for (const room of parsed?.rooms ?? []) {
        if (!room || typeof room.code !== "string") continue;
        if (now - room.createdAt > ROOM_RETENTION_MS) continue;
        const members = new Map<string, RoomMember>();
        for (const [userId, value] of Object.entries(room.members ?? {})) {
          if (typeof value === "string") {
            // legacy persisted shape (userId → socketId); sockets are dead on
            // restart anyway, so treat the stale member as an empty session.
            members.set(userId, { socketId: value, sessionId: "" });
          } else if (value && typeof value.socketId === "string") {
            members.set(userId, value);
          }
        }
        this.rooms.set(room.code, {
          code: room.code,
          owner: room.owner,
          peerUserId: room.peerUserId,
          createdAt: room.createdAt,
          members,
        });
      }
    } catch {
      // no persisted rooms yet
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 200);
  }

  private async save(): Promise<void> {
    const data: PersistedRoom[] = [...this.rooms.values()].map((room) => ({
      code: room.code,
      owner: room.owner,
      peerUserId: room.peerUserId,
      createdAt: room.createdAt,
      members: Object.fromEntries(room.members),
    }));
    try {
      await mkdir(path.dirname(this.storePath), { recursive: true });
      await writeFile(this.storePath, JSON.stringify({ rooms: data }, null, 2), "utf8");
    } catch (err) {
      console.error("failed to persist rooms:", err);
    }
  }
}

export function registerHealthRoute(app: FastifyInstance, hub: SignalHub): void {
  app.get("/", async () => ({
    ok: true,
    service: "ghostchat-signal",
    rooms: hub.roomCount(),
    peers: hub.peerCount(),
  }));
}
