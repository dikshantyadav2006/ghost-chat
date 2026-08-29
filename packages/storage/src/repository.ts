import type Dexie from "dexie";
import type { EntityTable } from "dexie";
import type { ChatMessage, MessageStatus } from "@ghost/protocol";
import type {
  ChunkRow,
  FileRow,
  FileTransferStatus,
  IdentityRow,
  MessageRow,
  OutboxRow,
  ReactionRow,
  RoomRow,
} from "./db.js";

export interface GhostDB {
  identity: EntityTable<IdentityRow, "id">;
  rooms: EntityTable<RoomRow, "id">;
  messages: EntityTable<MessageRow, "id">;
  files: EntityTable<FileRow, "id">;
  outbox: EntityTable<OutboxRow, "id">;
  reactions: EntityTable<ReactionRow, "id">;
  chunks: EntityTable<ChunkRow, "id">;
  transaction: Dexie["transaction"];
}

export class GhostRepository {
  constructor(private readonly db: GhostDB) {}

  // ---- identity ----

  async getIdentity(): Promise<IdentityRow | undefined> {
    return this.db.identity.get("identity");
  }

  async saveIdentity(row: IdentityRow): Promise<void> {
    await this.db.identity.put(row);
  }

  /** Persists the room that should be reopened on next boot. */
  async setLastActiveRoom(roomId: string | null): Promise<void> {
    const row = await this.db.identity.get("identity");
    if (!row) return;
    if (roomId) {
      await this.db.identity.put({ ...row, lastActiveRoomId: roomId });
    } else {
      const next = { ...row } as Partial<IdentityRow>;
      delete next.lastActiveRoomId;
      await this.db.identity.put(next as IdentityRow);
    }
  }

  async getLastActiveRoom(): Promise<string | null> {
    const row = await this.db.identity.get("identity");
    return row?.lastActiveRoomId ?? null;
  }

  // ---- rooms ----

  async listRooms(): Promise<RoomRow[]> {
    return this.db.rooms.orderBy("lastActivity").reverse().toArray();
  }

  async getRoomById(id: string): Promise<RoomRow | undefined> {
    return this.db.rooms.get(id);
  }

  async getRoomByCode(code: string): Promise<RoomRow | undefined> {
    return this.db.rooms.where("code").equals(code).first();
  }

  async putRoom(row: RoomRow): Promise<void> {
    await this.db.rooms.put(row);
  }

  async touchRoom(id: string, ts: number): Promise<void> {
    await this.db.rooms.update(id, { lastActivity: ts });
  }

  async deleteRoom(id: string): Promise<void> {
    await this.db.transaction(
      "rw",
      [
        this.db.rooms,
        this.db.messages,
        this.db.files,
        this.db.outbox,
        this.db.reactions,
        this.db.chunks,
      ],
      async () => {
        const fileIds = (await this.db.files.where("roomId").equals(id).toArray()).map((f) => f.id);
        await this.db.rooms.delete(id);
        await this.db.messages.where("roomId").equals(id).delete();
        await this.db.files.where("roomId").equals(id).delete();
        await this.db.outbox.where("roomId").equals(id).delete();
        await this.db.reactions.where("roomId").equals(id).delete();
        for (const fileId of fileIds) {
          await this.db.chunks.where("fileId").equals(fileId).delete();
        }
      },
    );
  }

  /** Deletes every conversation artifact (rooms, messages, files, chunks, outbox,
   *  reactions) while preserving the local identity/profile. */
  async clearAllChats(): Promise<void> {
    await this.db.transaction(
      "rw",
      [
        this.db.rooms,
        this.db.messages,
        this.db.files,
        this.db.outbox,
        this.db.reactions,
        this.db.chunks,
      ],
      async () => {
        await Promise.all([
          this.db.rooms.clear(),
          this.db.messages.clear(),
          this.db.files.clear(),
          this.db.outbox.clear(),
          this.db.reactions.clear(),
          this.db.chunks.clear(),
        ]);
      },
    );
  }

  // ---- messages ----

  async listMessages(roomId: string): Promise<MessageRow[]> {
    const rows = await this.db.messages.where("roomId").equals(roomId).toArray();
    return rows.sort((a, b) => a.ts - b.ts);
  }

  async getMessageById(id: string): Promise<MessageRow | undefined> {
    return this.db.messages.get(id);
  }

  async putMessage(row: MessageRow): Promise<void> {
    await this.db.messages.put(row);
  }

  async updateMessageStatus(id: string, status: MessageStatus, ts?: number): Promise<void> {
    const patch: Partial<MessageRow> = { status };
    if (ts !== undefined) {
      if (status === "sent") patch.sentAt = ts;
      if (status === "delivered") patch.deliveredAt = ts;
      if (status === "read") patch.readAt = ts;
    }
    await this.db.messages.update(id, patch);
  }

  async applyTombstone(id: string, ts: number): Promise<void> {
    const row = await this.db.messages.get(id);
    if (!row) return;
    const next = { ...row, deletedAt: ts } as Partial<MessageRow>;
    delete next.text;
    delete next.fileId;
    await this.db.messages.put(next as MessageRow);
  }

  async applyEdit(id: string, text: string, ts: number): Promise<void> {
    const row = await this.db.messages.get(id);
    if (!row) return;
    await this.db.messages.put({ ...row, text, edited: true, ts });
  }

  async deleteMessagesForRoom(roomId: string): Promise<void> {
    await this.db.messages.where("roomId").equals(roomId).delete();
  }

  async countUnread(roomId: string): Promise<number> {
    const rows = await this.db.messages.where("roomId").equals(roomId).toArray();
    return rows.filter((m) => !m.isMine && m.status !== "read").length;
  }

  async sumUnread(): Promise<number> {
    const rows = await this.db.messages.toArray();
    return rows.filter((m) => !m.isMine && m.status !== "read").length;
  }

  // ---- reactions ----

  reactionId(messageId: string, emoji: string): string {
    return `${messageId}:${emoji}`;
  }

  async listReactions(messageId: string): Promise<ReactionRow[]> {
    return this.db.reactions.where("messageId").equals(messageId).toArray();
  }

  async applyReactionLocal(messageId: string, emoji: string, add: boolean): Promise<void> {
    const id = this.reactionId(messageId, emoji);
    const row = await this.db.reactions.get(id);
    if (add) {
      if (row) {
        const next = { ...row, mine: true, count: Math.min(2, row.count + 1) };
        await this.db.reactions.put(next);
      } else {
        await this.db.reactions.put({ id, roomId: "", messageId, emoji, count: 1, mine: true });
      }
      return;
    }
    if (!row || !row.mine) return;
    if (row.count <= 1) {
      await this.db.reactions.delete(id);
      return;
    }
    await this.db.reactions.put({ ...row, mine: false, count: row.count - 1 });
  }

  async applyReactionRemote(messageId: string, emoji: string, add: boolean): Promise<void> {
    const id = this.reactionId(messageId, emoji);
    const row = await this.db.reactions.get(id);
    if (add) {
      if (row) {
        const next = { ...row, count: Math.min(2, row.count + 1) };
        await this.db.reactions.put(next);
      } else {
        await this.db.reactions.put({ id, roomId: "", messageId, emoji, count: 1, mine: false });
      }
      return;
    }
    if (!row) return;
    const floor = row.mine ? 1 : 0;
    if (row.count <= floor) {
      await this.db.reactions.delete(id);
      return;
    }
    await this.db.reactions.put({ ...row, count: row.count - 1 });
  }

  async setReactionRoomId(messageId: string, roomId: string): Promise<void> {
    const rows = await this.db.reactions.where("messageId").equals(messageId).toArray();
    for (const row of rows) {
      if (!row.roomId) await this.db.reactions.update(row.id, { roomId });
    }
  }

  // ---- files ----

  async putFile(row: FileRow): Promise<void> {
    await this.db.files.put(row);
  }

  async getFile(id: string): Promise<FileRow | undefined> {
    return this.db.files.get(id);
  }

  async listFiles(roomId: string): Promise<FileRow[]> {
    return this.db.files.where("roomId").equals(roomId).toArray();
  }

  async updateFileTransfer(
    id: string,
    status: FileTransferStatus,
    progress: number,
    receivedChunks: number,
  ): Promise<void> {
    await this.db.files.update(id, { status, progress, receivedChunks });
  }

  async setFileDone(id: string, blob: Blob): Promise<void> {
    await this.db.files.update(id, { status: "done", progress: 1, blob });
  }

  async setFileRanges(id: string, ranges: string): Promise<void> {
    await this.db.files.update(id, { receivedRanges: ranges });
  }

  async setFileOpfs(id: string, opfsId: string): Promise<void> {
    await this.db.files.update(id, { opfsId });
  }

  async setFileTotalChunks(id: string, totalChunks: number): Promise<void> {
    await this.db.files.update(id, { totalChunks });
  }

  async deleteFile(id: string): Promise<void> {
    await this.db.transaction("rw", this.db.files, this.db.chunks, async () => {
      await this.db.files.delete(id);
      await this.db.chunks.where("fileId").equals(id).delete();
    });
  }

  async setLastSentChunk(id: string, seq: number): Promise<void> {
    await this.db.files.update(id, { lastSentChunk: seq });
  }

  // ---- chunks (persisted transfer state for resume) ----

  async putChunk(fileId: string, seq: number, data: Uint8Array): Promise<void> {
    await this.db.chunks.put({ id: `${fileId}:${seq}`, fileId, seq, data });
  }

  async getChunk(fileId: string, seq: number): Promise<Uint8Array | undefined> {
    return (await this.db.chunks.get(`${fileId}:${seq}`))?.data;
  }

  async countChunks(fileId: string): Promise<number> {
    return this.db.chunks.where("fileId").equals(fileId).count();
  }

  async lastChunkSeq(fileId: string): Promise<number | undefined> {
    const rows = await this.db.chunks.where("fileId").equals(fileId).sortBy("seq");
    return rows.length > 0 ? (rows[rows.length - 1]!.seq ?? 0) : undefined;
  }

  async listChunks(fileId: string): Promise<ChunkRow[]> {
    const rows = await this.db.chunks.where("fileId").equals(fileId).toArray();
    return rows.sort((a, b) => a.seq - b.seq);
  }

  // ---- outbox ----

  async listOutbox(roomId: string): Promise<OutboxRow[]> {
    const rows = await this.db.outbox.where("roomId").equals(roomId).toArray();
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  }

  async addToOutbox(row: OutboxRow): Promise<void> {
    await this.db.outbox.put(row);
  }

  async removeFromOutbox(id: string): Promise<void> {
    await this.db.outbox.delete(id);
  }

  async clearOutbox(roomId: string): Promise<void> {
    await this.db.outbox.where("roomId").equals(roomId).delete();
  }
}

export function toMessageRow(roomId: string, isMine: boolean, msg: ChatMessage): MessageRow {
  const row: MessageRow = {
    id: msg.id,
    roomId,
    isMine,
    kind: msg.kind,
    ts: msg.ts,
    status: isMine ? "sending" : "received",
  };
  if (msg.text !== undefined) row.text = msg.text;
  if (msg.file !== undefined) row.fileId = msg.file.id;
  if (msg.replyTo !== undefined) row.replyTo = msg.replyTo;
  if (msg.edited !== undefined) row.edited = msg.edited;
  if (msg.voice !== undefined) row.voice = msg.voice;
  if (msg.forwarded !== undefined) row.forwarded = msg.forwarded;
  if (isMine) row.sentAt = msg.ts;
  return row;
}
