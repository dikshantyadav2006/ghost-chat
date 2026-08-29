import Dexie, { type EntityTable } from "dexie";
import type { Avatar, MessageKind, MessageStatus } from "@ghost/protocol";

export interface IdentityRow {
  id: "identity";
  userId: string;
  name: string;
  avatar: Avatar;
  publicKey: string;
  privateKey: string;
  createdAt: number;
  /** Room that was open when the app last closed — reopened on boot so
   *  reconnect (and session restore) starts instantly. Not indexed. */
  lastActiveRoomId?: string;
}

export interface RoomRow {
  id: string;
  code: string;
  mode: "create" | "join";
  peerUserId: string;
  peerName: string;
  peerPublicKey: string;
  safetyCode: string;
  createdAt: number;
  lastActivity: number;
}

export interface MessageRow {
  id: string;
  roomId: string;
  isMine: boolean;
  kind: MessageKind;
  ts: number;
  status: MessageStatus;
  text?: string;
  fileId?: string;
  replyTo?: string;
  edited?: boolean;
  deletedAt?: number;
  /** When the peer reported delivery/read (outgoing messages only). */
  sentAt?: number;
  deliveredAt?: number;
  readAt?: number;
  forwarded?: boolean;
  voice?: boolean;
}

export type FileDirection = "in" | "out";
export type FileTransferStatus =
  | "pending"
  | "transferring"
  | "interrupted"
  | "paused"
  | "done"
  | "error";

export interface FileRow {
  id: string;
  roomId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  chunkSize: number;
  direction: FileDirection;
  status: FileTransferStatus;
  progress: number;
  receivedChunks: number;
  /** Sender-side resume cursor: highest chunk seq handed to the channel. */
  lastSentChunk?: number;
  /** Total chunk count, fixed at send start so resume ranges stay aligned. */
  totalChunks?: number;
  /** JSON-serialized received chunk ranges (receiver-side resume state). */
  receivedRanges?: string;
  /** OPFS path for large received files (when blob is not stored in IDB). */
  opfsId?: string;
  blob?: Blob;
}

/** A single received (or sent) file chunk persisted to IndexedDB. */
export interface ChunkRow {
  id: string;
  fileId: string;
  seq: number;
  data: Uint8Array;
}

export interface OutboxRow {
  id: string;
  roomId: string;
  envelope: Uint8Array;
  createdAt: number;
  attempts: number;
  kind: "message" | "chunk" | "other";
}

export interface ReactionRow {
  id: string;
  roomId: string;
  messageId: string;
  emoji: string;
  count: number;
  mine: boolean;
}

export function createGhostDB(name = "ghostchat"): Dexie & {
  identity: EntityTable<IdentityRow, "id">;
  rooms: EntityTable<RoomRow, "id">;
  messages: EntityTable<MessageRow, "id">;
  files: EntityTable<FileRow, "id">;
  outbox: EntityTable<OutboxRow, "id">;
  reactions: EntityTable<ReactionRow, "id">;
  chunks: EntityTable<ChunkRow, "id">;
} {
  const db = new Dexie(name) as Dexie & {
    identity: EntityTable<IdentityRow, "id">;
    rooms: EntityTable<RoomRow, "id">;
    messages: EntityTable<MessageRow, "id">;
    files: EntityTable<FileRow, "id">;
    outbox: EntityTable<OutboxRow, "id">;
    reactions: EntityTable<ReactionRow, "id">;
    chunks: EntityTable<ChunkRow, "id">;
  };

  db.version(3).stores({
    identity: "id",
    rooms: "id, code, lastActivity",
    messages: "id, roomId, ts, [roomId+ts]",
    files: "id, roomId",
    outbox: "id, roomId, createdAt",
    reactions: "id, roomId, messageId, [messageId+emoji]",
  });

  db.version(4).stores({
    identity: "id",
    rooms: "id, code, lastActivity",
    messages: "id, roomId, ts, [roomId+ts]",
    files: "id, roomId",
    outbox: "id, roomId, createdAt",
    reactions: "id, roomId, messageId, [messageId+emoji]",
    chunks: "id, fileId, [fileId+seq]",
  });

  return db;
}

export const db = createGhostDB();
