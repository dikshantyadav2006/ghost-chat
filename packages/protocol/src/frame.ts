import type { ChannelMessage } from "./index";

export const FRAME_JSON = 0;
export const FRAME_FILE_CHUNK = 1;
export const FRAME_CIPHER = 2;
export const MAX_JSON_FRAME = 1024 * 1024;

export interface FileChunk {
  fileId: string;
  /** Zero-based chunk index (sequence number). Drives ordering and resume. */
  seq: number;
  total: number;
  /** Per-chunk SHA-256 so corruption is caught chunk-by-chunk, not at the end. */
  sha256: string;
  data: Uint8Array;
}

export interface EncryptedFrame {
  iv: Uint8Array;
  data: Uint8Array;
}

export type DecodedFrame =
  | { type: typeof FRAME_JSON; message: ChannelMessage }
  | { type: typeof FRAME_FILE_CHUNK; chunk: FileChunk }
  | { type: typeof FRAME_CIPHER; cipher: EncryptedFrame };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeJSONFrame(message: ChannelMessage): Uint8Array {
  const json = JSON.stringify(message);
  const bytes = textEncoder.encode(json);
  if (bytes.byteLength > MAX_JSON_FRAME) {
    throw new Error("JSON frame exceeds max size");
  }
  const frame = new Uint8Array(bytes.byteLength + 1);
  frame[0] = FRAME_JSON;
  frame.set(bytes, 1);
  return frame;
}

export function decodeJSONFrame(frame: Uint8Array): ChannelMessage {
  if (frame.byteLength === 0) throw new Error("empty frame");
  const payload = frame.subarray(1);
  if (payload.byteLength > MAX_JSON_FRAME) throw new Error("frame too large");
  const parsed = JSON.parse(textDecoder.decode(payload)) as ChannelMessage;
  if (!parsed || typeof parsed !== "object" || typeof parsed.kind !== "string") {
    throw new Error("invalid channel message");
  }
  return parsed;
}

export function encodeFileChunkFrame(chunk: FileChunk): Uint8Array {
  if (!chunk.sha256 || chunk.sha256.length !== 64) throw new Error("chunk sha256 required");
  const fileIdBytes = textEncoder.encode(chunk.fileId);
  if (fileIdBytes.byteLength > 255) throw new Error("fileId too long");
  const frame = new Uint8Array(1 + 1 + fileIdBytes.byteLength + 4 + 4 + 64 + chunk.data.byteLength);
  let offset = 0;
  frame[offset++] = FRAME_FILE_CHUNK;
  frame[offset++] = fileIdBytes.byteLength;
  frame.set(fileIdBytes, offset);
  offset += fileIdBytes.byteLength;
  const view = new DataView(frame.buffer);
  view.setUint32(offset, chunk.seq, false);
  offset += 4;
  view.setUint32(offset, chunk.total, false);
  offset += 4;
  frame.set(textEncoder.encode(chunk.sha256), offset);
  offset += 64;
  frame.set(chunk.data, offset);
  return frame;
}

export function decodeFileChunkFrame(frame: Uint8Array): FileChunk {
  if (frame.byteLength < 74) throw new Error("chunk frame too short");
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const fileIdLen = frame[1]!;
  const fileId = textDecoder.decode(frame.subarray(2, 2 + fileIdLen));
  let offset = 2 + fileIdLen;
  const seq = view.getUint32(offset, false);
  offset += 4;
  const total = view.getUint32(offset, false);
  offset += 4;
  const sha256 = textDecoder.decode(frame.subarray(offset, offset + 64));
  offset += 64;
  const data = frame.subarray(offset);
  return { fileId, seq, total, sha256, data };
}

export function encodeCipherFrame(payload: EncryptedFrame): Uint8Array {
  if (payload.iv.byteLength > 255) throw new Error("cipher iv too long");
  const frame = new Uint8Array(2 + payload.iv.byteLength + payload.data.byteLength);
  frame[0] = FRAME_CIPHER;
  frame[1] = payload.iv.byteLength;
  frame.set(payload.iv, 2);
  frame.set(payload.data, 2 + payload.iv.byteLength);
  return frame;
}

export function decodeCipherFrame(frame: Uint8Array): EncryptedFrame {
  if (frame.byteLength < 3) throw new Error("cipher frame too short");
  const ivLen = frame[1]!;
  if (2 + ivLen > frame.byteLength) throw new Error("cipher frame iv out of bounds");
  const iv = frame.slice(2, 2 + ivLen);
  const data = frame.slice(2 + ivLen);
  if (data.byteLength === 0) throw new Error("cipher frame empty");
  return { iv, data };
}

export function decodeFrame(frame: Uint8Array): DecodedFrame {
  if (frame.byteLength === 0) throw new Error("empty frame");
  const type = frame[0]!;
  if (type === FRAME_JSON) {
    return { type, message: decodeJSONFrame(frame) };
  }
  if (type === FRAME_FILE_CHUNK) {
    return { type, chunk: decodeFileChunkFrame(frame) };
  }
  if (type === FRAME_CIPHER) {
    return { type, cipher: decodeCipherFrame(frame) };
  }
  throw new Error(`unknown frame type: ${type}`);
}
