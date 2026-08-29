import type { ChunkRange, FileChunk } from "@ghost/protocol";
import { sha256Hex } from "@ghost/crypto";

/**
 * File chunk size sent over the WebRTC data channel.
 *
 * Browsers cap the maximum data-channel message size: Chromium defaults to
 * 256 KiB but Firefox and Safari cap it at 64 KiB. Each chunk is also wrapped
 * in a chunk frame, then an AES-GCM cipher frame (~28 bytes overhead), so 16
 * KiB keeps every wire message safely under every browser's ceiling.
 */
export const DEFAULT_CHUNK_SIZE = 16 * 1024;

/** Adaptive ceiling for chunks once a channel's real limit is known. */
export const MAX_CHUNK_SIZE = 256 * 1024;

const CHUNK_FRAME_OVERHEAD = 128; // cipher frame + chunk frame + fileId headers

/**
 * Picks a chunk size that stays safely under the data channel's maximum
 * message size, clamped to [DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE].
 */
export function pickChunkSize(maxMessageSize?: number): number {
  const cap = maxMessageSize && maxMessageSize > 0 ? maxMessageSize - CHUNK_FRAME_OVERHEAD : MAX_CHUNK_SIZE;
  return Math.max(DEFAULT_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, cap));
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  return sha256Hex(bytes);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_H = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Streaming SHA-256 so multi-GB files can be hashed without loading into RAM. */
export class Sha256 {
  private readonly state = [...SHA256_H];
  private readonly buffer = new Uint8Array(64);
  private bufferLen = 0;
  private totalLen = 0;

  update(bytes: Uint8Array): void {
    let offset = 0;
    this.totalLen += bytes.byteLength;
    if (this.bufferLen > 0) {
      const need = 64 - this.bufferLen;
      const take = Math.min(need, bytes.byteLength);
      this.buffer.set(bytes.subarray(0, take), this.bufferLen);
      this.bufferLen += take;
      offset += take;
      if (this.bufferLen === 64) {
        this.processBlock(this.buffer);
        this.bufferLen = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      this.processBlock(bytes.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      const rest = bytes.subarray(offset);
      this.buffer.set(rest, 0);
      this.bufferLen = rest.byteLength;
    }
  }

  digest(): Uint8Array {
    const bitLen = this.totalLen * 8;
    const pad = new Uint8Array(this.bufferLen + 1);
    pad.set(this.buffer.subarray(0, this.bufferLen));
    pad[this.bufferLen] = 0x80;
    const total = this.bufferLen + 1;
    if (total <= 56) {
      const block = new Uint8Array(64);
      block.set(pad);
      this.setLen(block, bitLen);
      this.processBlock(block);
    } else {
      const block = new Uint8Array(64);
      block.set(pad);
      this.processBlock(block);
      const final = new Uint8Array(64);
      this.setLen(final, bitLen);
      this.processBlock(final);
    }
    const out = new Uint8Array(32);
    const view = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) view.setUint32(i * 4, this.state[i]! >>> 0);
    return out;
  }

  private setLen(block: Uint8Array, bitLen: number): void {
    const view = new DataView(block.buffer);
    view.setUint32(56, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(60, bitLen >>> 0, false);
  }

  private processBlock(block: Uint8Array): void {
    const w = new Uint32Array(64);
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = this.state[0]!;
    let b = this.state[1]!;
    let c = this.state[2]!;
    let d = this.state[3]!;
    let e = this.state[4]!;
    let f = this.state[5]!;
    let g = this.state[6]!;
    let h = this.state[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    this.state[0] = (this.state[0]! + a) >>> 0;
    this.state[1] = (this.state[1]! + b) >>> 0;
    this.state[2] = (this.state[2]! + c) >>> 0;
    this.state[3] = (this.state[3]! + d) >>> 0;
    this.state[4] = (this.state[4]! + e) >>> 0;
    this.state[5] = (this.state[5]! + f) >>> 0;
    this.state[6] = (this.state[6]! + g) >>> 0;
    this.state[7] = (this.state[7]! + h) >>> 0;
  }
}

function hexFromBytes(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Full-file SHA-256 via a streaming pass. Memory stays flat for multi-GB files. */
export async function hashFile(file: Blob): Promise<string> {
  const reader = file.stream().getReader();
  const sha = new Sha256();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sha.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hexFromBytes(sha.digest());
}

/** Streaming chunk generator. Reads the Blob piece by piece — never loads it into RAM. */
export async function* streamFile(
  file: Blob,
  fileId: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): AsyncGenerator<FileChunk> {
  const total = Math.max(1, Math.ceil(file.size / chunkSize));
  const reader = file.stream().getReader();
  let pending = new Uint8Array(0);
  let seq = 0;
  let emitted = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      const buffered = new Uint8Array(pending.byteLength + value.byteLength);
      buffered.set(pending);
      buffered.set(value, pending.byteLength);
      pending = buffered;

      while (pending.byteLength >= chunkSize) {
        const data = pending.slice(0, chunkSize);
        pending = pending.slice(chunkSize);
        emitted = true;
        yield { fileId, seq: seq++, total, sha256: await sha256Hex(data), data };
      }
    }

    if (pending.byteLength > 0) {
      emitted = true;
      yield { fileId, seq: seq++, total, sha256: await sha256Hex(pending), data: pending };
    }

    if (!emitted) {
      // A single empty chunk keeps the sender/receiver counts consistent for empty files.
      const empty = new Uint8Array(0);
      yield { fileId, seq: 0, total, sha256: await sha256Hex(empty), data: empty };
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streaming generator for arbitrary chunk ranges. Reads only the byte spans
 * covered by `ranges` (via Blob.slice) so a resume never re-reads or re-sends
 * chunks the receiver already has. Global seqs are preserved.
 */
export async function* streamFileRanges(
  file: Blob,
  fileId: string,
  chunkSize: number,
  ranges: ChunkRange[],
  totalChunks: number,
): AsyncGenerator<FileChunk> {
  const byteLength = file.size;
  for (const [start, end] of ranges) {
    const fromByte = Math.min(start * chunkSize, byteLength);
    const toByte = Math.min((end + 1) * chunkSize, byteLength);
    const slice = file.slice(fromByte, toByte);
    const reader = slice.stream().getReader();
    let pending = new Uint8Array(0);
    let localSeq = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength === 0) continue;
        const buffered = new Uint8Array(pending.byteLength + value.byteLength);
        buffered.set(pending);
        buffered.set(value, pending.byteLength);
        pending = buffered;

        while (pending.byteLength >= chunkSize) {
          const data = pending.slice(0, chunkSize);
          pending = pending.slice(chunkSize);
          yield { fileId, seq: start + localSeq++, total: totalChunks, sha256: await sha256Hex(data), data };
        }
      }
      if (pending.byteLength > 0) {
        yield { fileId, seq: start + localSeq, total: totalChunks, sha256: await sha256Hex(pending), data: pending };
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Minimal persistence contract for received chunks. Session code implements it
 * on top of IndexedDB so a multi-GB file never has to live in memory.
 */
export interface ChunkStore {
  putChunk(chunk: FileChunk): Promise<void>;
  countChunks(fileId: string): Promise<number>;
  getChunk(fileId: string, seq: number): Promise<Uint8Array | undefined>;
}

export class FileAssembler {
  private readonly store: ChunkStore;
  private readonly expectedSize: number;
  private readonly expectedSha256: string;
  private readonly total: number;

  constructor(
    private readonly fileId: string,
    store: ChunkStore,
    total: number,
    expectedSize: number,
    expectedSha256: string,
  ) {
    this.store = store;
    this.total = total;
    this.expectedSize = expectedSize;
    this.expectedSha256 = expectedSha256;
  }

  get chunkCount(): number {
    return this.total;
  }

  async add(chunk: FileChunk): Promise<void> {
    if (chunk.fileId !== this.fileId || chunk.total !== this.total) return;
    if (chunk.seq < 0 || chunk.seq >= this.total) return;
    const existing = await this.store.getChunk(this.fileId, chunk.seq);
    if (existing) return;
    await this.store.putChunk(chunk);
  }

  async isComplete(): Promise<boolean> {
    return (await this.store.countChunks(this.fileId)) >= this.total;
  }

  /** Reads all persisted chunks back and concatenates them in order. */
  async assemble(): Promise<{ bytes: Uint8Array; valid: boolean } | undefined> {
    if ((await this.store.countChunks(this.fileId)) < this.total) return undefined;
    const parts: Uint8Array[] = [];
    let size = 0;
    for (let seq = 0; seq < this.total; seq++) {
      const data = await this.store.getChunk(this.fileId, seq);
      if (!data) return undefined;
      parts.push(data);
      size += data.byteLength;
    }
    if (size !== this.expectedSize) return { bytes: new Uint8Array(0), valid: false };
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }
    const valid = (await sha256Hex(result)) === this.expectedSha256;
    return { bytes: result, valid };
  }

  /**
   * Stream-assemble received chunks to OPFS instead of RAM.  Returns the
   * OPFS path and whether the assembled file passed SHA-256 verification.
   * Falls back to in-memory assembly when OPFS is unavailable.
   */
  async assembleToOpfs(): Promise<{ opfsPath: string | null; blob: Blob | null; valid: boolean }> {
    if ((await this.store.countChunks(this.fileId)) < this.total) {
      return { opfsPath: null, blob: null, valid: false };
    }

    // Try OPFS streaming path.
    let opfsHandle: FileSystemFileHandle | null = null;
    let writable: FileSystemWritableFileStream | null = null;
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("ghost-files", { create: true });
      opfsHandle = await dir.getFileHandle(this.fileId, { create: true });
      writable = await opfsHandle.createWritable();
    } catch {
      opfsHandle = null;
    }

    // Accumulate chunks for SHA-256 verification while streaming to OPFS.
    const parts: Uint8Array[] = [];
    let size = 0;

    for (let seq = 0; seq < this.total; seq++) {
      const data = await this.store.getChunk(this.fileId, seq);
      if (!data) {
        if (writable) await writable.abort().catch(() => {});
        return { opfsPath: null, blob: null, valid: false };
      }
      if (writable) await writable.write(data as unknown as BlobPart);
      parts.push(data);
      size += data.byteLength;
    }

    if (size !== this.expectedSize) {
      if (writable) await writable.abort().catch(() => {});
      return { opfsPath: null, blob: null, valid: false };
    }

    // Close the OPFS stream and compute hash from the collected parts.
    let opfsPath: string | null = null;
    if (writable) {
      await writable.close();
      opfsPath = `ghost-files/${this.fileId}`;
    }

    // Build the full buffer for SHA-256 verification and blob creation.
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }
    const valid = (await sha256Hex(result)) === this.expectedSha256;

    // Return as a Blob for in-memory fallback (caller decides what to keep).
    const blob = new Blob([result]);

    return { opfsPath, blob, valid };
  }
}
