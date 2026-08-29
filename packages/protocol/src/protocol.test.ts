import { describe, expect, it } from "vitest";
import {
  decodeCipherFrame,
  decodeFileChunkFrame,
  decodeFrame,
  decodeJSONFrame,
  encodeCipherFrame,
  encodeFileChunkFrame,
  encodeJSONFrame,
  formatRoomCode,
  generateRoomCode,
  computePairConnectionId,
  normalizeRoomCode,
  type ChatMessage,
} from "./index";

describe("pair connection id", () => {
  it("is deterministic and order-independent (both peers agree)", () => {
    const a = computePairConnectionId("sess-AAAAAAAAAAAA", "sess-BBBBBBBBBBBB");
    const b = computePairConnectionId("sess-BBBBBBBBBBBB", "sess-AAAAAAAAAAAA");
    expect(a).toBe(b);
    expect(a).toMatch(/^conn-sess-/);
  });

  it("changes when either side reloads (new session)", () => {
    const before = computePairConnectionId("sess-AAAAAAAAAAAA", "sess-BBBBBBBBBBBB");
    const after = computePairConnectionId("sess-CCCCCCCCCCCC", "sess-BBBBBBBBBBBB");
    expect(after).not.toBe(before);
  });
});

describe("room codes", () => {
  it("generates a code of the right length from the safe alphabet", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("normalizes pasted codes (dashes, lowercase, spaces)", () => {
    expect(normalizeRoomCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeRoomCode(" abcd efgh ")).toBe("ABCDEFGH");
    expect(normalizeRoomCode("abc-efgh")).toBe("");
    expect(normalizeRoomCode("abc1efgh")).toBe("");
    expect(formatRoomCode("abcdefgh")).toBe("ABCD-EFGH");
  });

  it("rejects characters outside the alphabet", () => {
    expect(normalizeRoomCode("ABCDEFGO")).toBe(""); // O excluded
    expect(normalizeRoomCode("ABCDEFGI")).toBe(""); // I excluded
    expect(normalizeRoomCode("ABCDEFG0")).toBe(""); // 0 excluded
    expect(normalizeRoomCode("ABCDEFG1")).toBe(""); // 1 excluded
  });
});

describe("frame codec", () => {
  it("roundtrips a JSON channel message", () => {
    const msg: ChatMessage = {
      id: "m1",
      kind: "text",
      ts: 123,
      text: "hello 👋",
    };
    const frame = encodeJSONFrame({ kind: "message", message: msg });
    expect(frame[0]).toBe(0);
    const decoded = decodeFrame(frame);
    expect(decoded.type).toBe(0);
    if (decoded.type !== 0) throw new Error("expected json frame");
    expect(decoded.message).toEqual({ kind: "message", message: msg });
  });

  it("roundtrips a file chunk with binary payload", () => {
    const data = new Uint8Array([1, 2, 3, 4, 255, 0, 128]);
    const chunk = {
      fileId: "file-abc",
      seq: 3,
      total: 10,
      sha256: "a".repeat(64),
      data,
    };
    const frame = encodeFileChunkFrame(chunk);
    const decoded = decodeFileChunkFrame(frame);
    expect(decoded).toEqual(chunk);
    expect(decoded.seq).toBe(3);
    expect(decoded.sha256).toBe("a".repeat(64));
  });

  it("roundtrips a cipher frame with raw binary payload", () => {
    const iv = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 10, 11]);
    const data = new Uint8Array([200, 150, 100, 50, 1, 255]);
    const frame = encodeCipherFrame({ iv, data });
    expect(frame[0]).toBe(2);
    const decoded = decodeCipherFrame(frame);
    expect(Array.from(decoded.iv)).toEqual(Array.from(iv));
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it("decodes a cipher frame after a subarray (respects byteOffset)", () => {
    const iv = new Uint8Array(12).fill(1);
    const data = new Uint8Array([7, 8, 9]);
    const frame = encodeCipherFrame({ iv, data });
    const wrapped = new Uint8Array([99, ...frame]); // frame starts at offset 1
    const sub = wrapped.subarray(1);
    const decoded = decodeFrame(sub);
    expect(decoded.type).toBe(2);
    if (decoded.type !== 2) throw new Error("expected cipher frame");
    expect(Array.from(decoded.cipher.data)).toEqual(Array.from(data));
  });

  it("decodes a file chunk after a subarray (respects byteOffset)", () => {
    const data = new Uint8Array([1, 2, 3]);
    const chunk = {
      fileId: "file-sub",
      seq: 1,
      total: 2,
      sha256: "b".repeat(64),
      data,
    };
    const frame = encodeFileChunkFrame(chunk);
    const wrapped = new Uint8Array([77, 88, ...frame]);
    const sub = wrapped.subarray(2);
    const decoded = decodeFileChunkFrame(sub);
    expect(decoded.seq).toBe(1);
    expect(decoded.fileId).toBe("file-sub");
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it("throws on unknown frame types", () => {
    expect(() => decodeFrame(new Uint8Array([42, 1, 2, 3]))).toThrow();
  });

  it("throws on invalid json payloads", () => {
    const frame = new Uint8Array([0, 123, 123]); // "{{"
    expect(() => decodeJSONFrame(frame)).toThrow();
  });
});
