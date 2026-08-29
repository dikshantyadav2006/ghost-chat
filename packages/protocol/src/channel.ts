import type { ChatMessage, Identity } from "./index";
import type { ChunkRange } from "./ranges";

export interface EncryptedPayload {
  iv: string;
  data: string;
}

export type CallPhase = "ring" | "accept" | "reject" | "end";

export type ChannelMessage =
  | { kind: "hello"; identity: Identity }
  | { kind: "message"; message: ChatMessage }
  | { kind: "cipher"; payload: EncryptedPayload }
  | { kind: "ack"; messageId: string; status: "delivered" | "read"; ts?: number }
  | { kind: "typing"; active: boolean }
  | { kind: "edit"; messageId: string; text: string; ts: number }
  | { kind: "delete"; messageId: string; ts: number }
  | { kind: "file:resume"; fileId: string; totalChunks: number; receivedRanges: ChunkRange[] }
  | { kind: "file:pause"; fileId: string }
  | { kind: "file:sent"; fileId: string }
  | { kind: "file:ready"; fileId: string }
  | { kind: "file:ack"; fileId: string; receivedChunks: number }
  | { kind: "file:delivered"; fileId: string }
  | { kind: "reaction"; messageId: string; emoji: string; add: boolean }
  | { kind: "call"; phase: CallPhase; callId: string; video?: boolean };
