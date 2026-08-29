import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@ghost/protocol";
import { createGhostDB } from "./db.js";
import { GhostRepository, toMessageRow } from "./repository.js";

describe("GhostRepository", () => {
  let repo: GhostRepository;

  beforeEach(() => {
    const db = createGhostDB(`test-${Math.random().toString(36).slice(2)}`);
    repo = new GhostRepository(db);
  });

  it("saves and loads identity", async () => {
    await repo.saveIdentity({
      id: "identity",
      userId: "user-abc",
      name: "Ghost",
      avatar: { emoji: "👻", color: "#10b981" },
      publicKey: "AAAAAAAA",
      privateKey: "BBBBBBBB",
      createdAt: 1,
    });
    const loaded = await repo.getIdentity();
    expect(loaded?.name).toBe("Ghost");
    expect(loaded?.avatar.emoji).toBe("👻");
  });

  it("persists and clears the last active room for session restore", async () => {
    expect(await repo.getLastActiveRoom()).toBeNull();
    await repo.saveIdentity({
      id: "identity",
      userId: "user-abc",
      name: "Ghost",
      avatar: { emoji: "👻", color: "#10b981" },
      publicKey: "AAAAAAAA",
      privateKey: "BBBBBBBB",
      createdAt: 1,
    });
    await repo.setLastActiveRoom("ROOM1AAA");
    expect(await repo.getLastActiveRoom()).toBe("ROOM1AAA");
    await repo.setLastActiveRoom(null);
    expect(await repo.getLastActiveRoom()).toBeNull();
  });

  it("upserts and lists rooms ordered by activity", async () => {
    await repo.putRoom({
      id: "ROOM1AAA",
      code: "ROOM-1AAA",
      mode: "create",
      peerUserId: "peer-1",
      peerName: "A",
      peerPublicKey: "PP",
      safetyCode: "12345-67890",
      createdAt: 1,
      lastActivity: 1,
    });
    await repo.putRoom({
      id: "ROOM2BBB",
      code: "ROOM-2BBB",
      mode: "join",
      peerUserId: "peer-2",
      peerName: "B",
      peerPublicKey: "QQ",
      safetyCode: "11111-22222",
      createdAt: 2,
      lastActivity: 5,
    });
    await repo.touchRoom("ROOM1AAA", 10);
    const rooms = await repo.listRooms();
    expect(rooms.map((r) => r.id)).toEqual(["ROOM1AAA", "ROOM2BBB"]);
  });

  it("stores and orders messages by ts, and tombstones edits/deletes", async () => {
    const roomId = "ROOM1AAA";
    const mk = (partial: Partial<ChatMessage>): ChatMessage => ({
      id: partial.id ?? "m",
      kind: "text",
      ts: 0,
      ...partial,
    } as ChatMessage);
    await repo.putMessage(toMessageRow(roomId, true, mk({ id: "m1", ts: 1, text: "first" })));
    await repo.putMessage(toMessageRow(roomId, false, mk({ id: "m2", ts: 3, text: "second" })));
    await repo.putMessage(toMessageRow(roomId, true, mk({ id: "m3", ts: 2, text: "third" })));

    const messages = await repo.listMessages(roomId);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m3", "m2"]);
    expect(messages[1]?.isMine).toBe(true);
    expect(messages[1]?.status).toBe("sending");

    await repo.updateMessageStatus("m3", "read");
    expect((await repo.getMessageById("m3"))?.status).toBe("read");

    await repo.applyTombstone("m1", 99);
    const t = await repo.getMessageById("m1");
    expect(t?.deletedAt).toBe(99);
    expect(t?.text).toBeUndefined();

    await repo.applyEdit("m2", "edited text", 100);
    const e = await repo.getMessageById("m2");
    expect(e?.text).toBe("edited text");
    expect(e?.edited).toBe(true);
  });

  it("tracks file transfer state", async () => {
    await repo.putFile({
      id: "f1",
      roomId: "ROOM1AAA",
      name: "cat.png",
      mime: "image/png",
      size: 100,
      sha256: "aa",
      chunkSize: 10,
      direction: "in",
      status: "pending",
      progress: 0,
      receivedChunks: 0,
    });
    await repo.updateFileTransfer("f1", "transferring", 0.5, 5);
    await repo.setFileRanges("f1", JSON.stringify([[0, 4]]));
    await repo.setFileTotalChunks("f1", 10);
    await repo.setFileOpfs("f1", "ghost-files/f1");
    await repo.setFileDone("f1", new Blob(["x"]));
    const file = await repo.getFile("f1");
    expect(file?.status).toBe("done");
    expect(file?.progress).toBe(1);
    expect(file?.receivedRanges).toBe(JSON.stringify([[0, 4]]));
    expect(file?.totalChunks).toBe(10);
    expect(file?.opfsId).toBe("ghost-files/f1");
  });

  it("persists chunks for resume and tracks the sender cursor", async () => {
    await repo.putFile({
      id: "f1",
      roomId: "ROOM1AAA",
      name: "big.bin",
      mime: "application/octet-stream",
      size: 300,
      sha256: "bb",
      chunkSize: 100,
      direction: "out",
      status: "transferring",
      progress: 0,
      receivedChunks: 0,
    });

    await repo.putChunk("f1", 0, new Uint8Array([1, 2, 3]));
    await repo.putChunk("f1", 2, new Uint8Array([7, 8, 9]));
    expect(await repo.countChunks("f1")).toBe(2);
    expect(await repo.lastChunkSeq("f1")).toBe(2);
    expect(await repo.getChunk("f1", 0)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await repo.getChunk("f1", 1)).toBeUndefined();
    expect((await repo.listChunks("f1")).map((c) => c.seq)).toEqual([0, 2]);

    await repo.setLastSentChunk("f1", 2);
    expect((await repo.getFile("f1"))?.lastSentChunk).toBe(2);
  });

  it("queues and drains the outbox per room", async () => {
    await repo.addToOutbox({
      id: "o1",
      roomId: "ROOM1AAA",
      envelope: new Uint8Array([1]),
      createdAt: 1,
      attempts: 0,
      kind: "other",
    });
    await repo.addToOutbox({
      id: "o2",
      roomId: "ROOM1AAA",
      envelope: new Uint8Array([2]),
      createdAt: 2,
      attempts: 0,
      kind: "message",
    });
    await repo.addToOutbox({
      id: "o3",
      roomId: "ROOM2BBB",
      envelope: new Uint8Array([3]),
      createdAt: 3,
      attempts: 0,
      kind: "chunk",
    });

    const queued = await repo.listOutbox("ROOM1AAA");
    expect(queued.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(queued.find((o) => o.id === "o2")?.kind).toBe("message");

    await repo.removeFromOutbox("o1");
    expect((await repo.listOutbox("ROOM1AAA")).map((o) => o.id)).toEqual(["o2"]);
  });

  it("cascades deletion of a room", async () => {
    const roomId = "ROOM1AAA";
    await repo.putRoom({
      id: roomId,
      code: "ROOM-1AAA",
      mode: "create",
      peerUserId: "p",
      peerName: "A",
      peerPublicKey: "P",
      safetyCode: "s",
      createdAt: 1,
      lastActivity: 1,
    });
    await repo.putMessage(toMessageRow(roomId, true, { id: "m1", kind: "text", ts: 1, text: "hi" }));
    await repo.addToOutbox({
      id: "o1",
      roomId,
      envelope: new Uint8Array([1]),
      createdAt: 1,
      attempts: 0,
      kind: "message",
    });
    await repo.putFile({
      id: "f1",
      roomId,
      name: "f.bin",
      mime: "application/octet-stream",
      size: 10,
      sha256: "aa",
      chunkSize: 5,
      direction: "in",
      status: "pending",
      progress: 0,
      receivedChunks: 0,
    });
    await repo.putChunk("f1", 0, new Uint8Array([1]));
    await repo.deleteRoom(roomId);

    expect(await repo.getRoomById(roomId)).toBeUndefined();
    expect(await repo.listMessages(roomId)).toEqual([]);
    expect(await repo.listOutbox(roomId)).toEqual([]);
    expect(await repo.countChunks("f1")).toBe(0);
  });

  it("counts unread incoming messages per room", async () => {
    const roomId = "ROOM1AAA";
    await repo.putMessage(toMessageRow(roomId, false, { id: "m1", kind: "text", ts: 1, text: "a" }));
    await repo.putMessage(toMessageRow(roomId, false, { id: "m2", kind: "text", ts: 2, text: "b" }));
    await repo.putMessage(toMessageRow(roomId, true, { id: "m3", kind: "text", ts: 3, text: "c" }));
    await repo.putMessage(toMessageRow(roomId, false, { id: "m4", kind: "text", ts: 4, text: "d" }));
    await repo.updateMessageStatus("m1", "read");

    expect(await repo.countUnread(roomId)).toBe(2);
  });

  it("tracks local and remote reactions without double counting", async () => {
    const messageId = "m1";
    await repo.applyReactionLocal(messageId, "❤️", true);
    expect(await repo.listReactions(messageId)).toEqual([
      { id: `${messageId}:❤️`, roomId: "", messageId, emoji: "❤️", count: 1, mine: true },
    ]);

    await repo.applyReactionRemote(messageId, "❤️", true);
    let rows = await repo.listReactions(messageId);
    expect(rows[0]?.count).toBe(2);
    expect(rows[0]?.mine).toBe(true);

    await repo.applyReactionRemote(messageId, "❤️", false);
    rows = await repo.listReactions(messageId);
    expect(rows[0]?.count).toBe(1);
    expect(rows[0]?.mine).toBe(true);

    await repo.applyReactionLocal(messageId, "❤️", false);
    expect(await repo.listReactions(messageId)).toEqual([]);

    await repo.applyReactionRemote(messageId, "😂", true);
    await repo.setReactionRoomId(messageId, "ROOM1AAA");
    rows = await repo.listReactions(messageId);
    expect(rows[0]?.roomId).toBe("ROOM1AAA");
  });
});
