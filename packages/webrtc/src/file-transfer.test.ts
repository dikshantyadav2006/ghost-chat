import { describe, expect, it } from "vitest";
import {
  streamFile,
  streamFileRanges,
  FileAssembler,
  hashBytes,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  pickChunkSize,
  type ChunkStore,
} from "./file-transfer";
import type { FileChunk } from "@ghost/protocol";

async function makeData(size: number): Promise<Uint8Array> {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) % 256;
  return data;
}

function makeBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.buffer as ArrayBuffer]);
}

class MemoryStore implements ChunkStore {
  readonly chunks = new Map<string, Uint8Array>();

  async putChunk(chunk: FileChunk): Promise<void> {
    this.chunks.set(`${chunk.fileId}:${chunk.seq}`, chunk.data);
  }

  async getChunk(fileId: string, seq: number): Promise<Uint8Array | undefined> {
    return this.chunks.get(`${fileId}:${seq}`);
  }

  async countChunks(fileId: string): Promise<number> {
    let count = 0;
    for (const key of this.chunks.keys()) if (key.startsWith(`${fileId}:`)) count++;
    return count;
  }
}

describe("streamFile", () => {
  it("default chunk size stays well under browser data-channel ceilings", () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(16 * 1024);
    expect(DEFAULT_CHUNK_SIZE).toBeLessThanOrEqual(16 * 1024);
  });

  it("chunks a blob without loading it into memory and numbers chunks sequentially", async () => {
    const data = await makeData(150_000);
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFile(makeBlob(data), "f1", 64 * 1024)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.seq)).toEqual([0, 1, 2]);
    expect(chunks.every((c) => c.sha256.length === 64)).toBe(true);
    const recombined = new Uint8Array(150_000);
    let offset = 0;
    for (const chunk of chunks) {
      recombined.set(chunk.data, chunk.seq * 64 * 1024);
      offset += chunk.data.byteLength;
    }
    expect(offset).toBe(150_000);
    expect(Array.from(recombined)).toEqual(Array.from(data));
  });

  it("splits a file into DEFAULT_CHUNK_SIZE pieces with a correct last chunk", async () => {
    const data = await makeData(40_000);
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFile(makeBlob(data), "f4")) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.data.byteLength).toBe(DEFAULT_CHUNK_SIZE);
    expect(chunks[1]!.data.byteLength).toBe(DEFAULT_CHUNK_SIZE);
    expect(chunks[2]!.data.byteLength).toBe(40_000 - 2 * DEFAULT_CHUNK_SIZE);
    expect(chunks[2]!.total).toBe(3);
    const recombined = new Uint8Array(40_000);
    let offset = 0;
    for (const chunk of chunks) {
      recombined.set(chunk.data, offset);
      offset += chunk.data.byteLength;
    }
    expect(Array.from(recombined)).toEqual(Array.from(data));
  });

  it("handles a single tiny chunk", async () => {
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFile(makeBlob(new Uint8Array([9, 8, 7])), "f2")) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.seq).toBe(0);
    expect(chunks[0]?.data).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("handles empty input", async () => {
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFile(makeBlob(new Uint8Array(0)), "f3")) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.data.byteLength).toBe(0);
  });
});

describe("streamFileRanges", () => {
  it("streams only the requested ranges with preserved global seqs", async () => {
    const data = await makeData(200_000);
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFileRanges(makeBlob(data), "f1", 64 * 1024, [[1, 2]], 4)) {
      chunks.push(chunk);
    }
    expect(chunks.map((c) => c.seq)).toEqual([1, 2]);
    expect(chunks.every((c) => c.total === 4)).toBe(true);
    const expected = new Uint8Array(data.buffer.slice(64 * 1024, 2 * 64 * 1024));
    expect(Array.from(chunks[0]!.data)).toEqual(Array.from(expected));
  });

  it("streams multiple non-contiguous ranges in order", async () => {
    const data = await makeData(200_000);
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFileRanges(makeBlob(data), "f1", 64 * 1024, [[0, 0], [2, 2]], 3)) {
      chunks.push(chunk);
    }
    expect(chunks.map((c) => c.seq)).toEqual([0, 2]);
    expect(Array.from(chunks[0]!.data)).toEqual(Array.from(new Uint8Array(data.buffer.slice(0, 64 * 1024))));
    expect(Array.from(chunks[1]!.data)).toEqual(Array.from(new Uint8Array(data.buffer.slice(2 * 64 * 1024, 3 * 64 * 1024))));
  });

  it("handles an empty missing set", async () => {
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFileRanges(makeBlob(await makeData(100)), "f1", 64, [], 2)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });
});

describe("pickChunkSize", () => {
  it("clamps to the safe window when the channel cap is unknown", () => {
    expect(pickChunkSize(undefined)).toBe(MAX_CHUNK_SIZE);
    expect(pickChunkSize(0)).toBe(MAX_CHUNK_SIZE);
  });

  it("stays under a small channel cap", () => {
    expect(pickChunkSize(64 * 1024)).toBe(64 * 1024 - 128);
  });

  it("never goes below the default chunk size", () => {
    expect(pickChunkSize(16 * 1024)).toBe(DEFAULT_CHUNK_SIZE);
    expect(pickChunkSize(1)).toBe(DEFAULT_CHUNK_SIZE);
  });

  it("caps at the adaptive ceiling", () => {
    expect(pickChunkSize(1024 * 1024)).toBe(MAX_CHUNK_SIZE);
  });
});

describe("FileAssembler", () => {
  it("persists out-of-order chunks, assembles and verifies the hash", async () => {
    const data = await makeData(100_000);
    const sha = await hashBytes(data);
    const store = new MemoryStore();
    const assembler = new FileAssembler("f1", store, 2, data.byteLength, sha);
    const chunks: FileChunk[] = [];
    for await (const chunk of streamFile(makeBlob(data), "f1", 64 * 1024)) {
      chunks.push(chunk);
    }
    // add in reverse order
    for (const chunk of [...chunks].reverse()) {
      await assembler.add(chunk);
    }
    expect(await assembler.isComplete()).toBe(true);
    const result = await assembler.assemble();
    expect(result?.valid).toBe(true);
    expect(Array.from(result!.bytes)).toEqual(Array.from(data));
  });

  it("fails verification on tampered data", async () => {
    const data = await makeData(1000);
    const sha = await hashBytes(data);
    const store = new MemoryStore();
    const assembler = new FileAssembler("f2", store, 1, data.byteLength, sha);
    await assembler.add({ fileId: "f2", seq: 0, total: 1, sha256: sha, data: new Uint8Array(data) });
    store.chunks.set("f2:0", new Uint8Array(data.slice(0)));
    const result = await assembler.assemble();
    expect(result).toBeDefined();
    // tamper
    const tampered = new Uint8Array(data);
    tampered[5] = (tampered[5]! + 1) % 256;
    store.chunks.set("f2:0", tampered);
    const bad = await assembler.assemble();
    expect(bad?.valid).toBe(false);
  });

  it("rejects chunks with the wrong file id or seq", async () => {
    const store = new MemoryStore();
    const assembler = new FileAssembler("f3", store, 2, 10, "x".repeat(64));
    await assembler.add({ fileId: "other", seq: 0, total: 2, sha256: "y".repeat(64), data: new Uint8Array(5) });
    await assembler.add({ fileId: "f3", seq: 5, total: 2, sha256: "y".repeat(64), data: new Uint8Array(5) });
    expect(await store.countChunks("f3")).toBe(0);
  });
});
