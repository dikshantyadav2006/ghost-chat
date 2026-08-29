export type MessageKind = "text" | "file";

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "received" | "failed";

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  chunkSize: number;
  totalChunks: number;
}

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  /** Sender's clock timestamp in ms */
  ts: number;
  text?: string;
  file?: FileMeta;
  replyTo?: string;
  edited?: boolean;
  deleted?: boolean;
  /** True when this is a voice note (audio file). */
  voice?: boolean;
  /** True when this message was forwarded from another room. */
  forwarded?: boolean;
}
