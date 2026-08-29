# Resumable P2P File Transfer — Implementation Plan

Goal (from user requirement): replace naive `dc.send(chunk)` with a proper **resumable P2P transfer
protocol** so that **connection failure ≠ transfer failure**. Server stays signaling-only + STUN-only;
never stores/relays files, chunks, or chat.

## Ground truth (current code, verified)

- `packages/protocol/src/frame.ts` — binary frames: `FRAME_JSON(0)`, `FRAME_FILE_CHUNK(1)`,
  `FRAME_CIPHER(2)`. `FileChunk { fileId, seq, total, sha256, data }`.
- `packages/protocol/src/channel.ts` — encrypted JSON `ChannelMessage` kinds (incl. `file:ready`).
- `packages/protocol/src/message.ts` — `FileMeta { id, name, mime, size, sha256, chunkSize, totalChunks }`
  (this is the manifest).
- `packages/storage/src/db.ts` — `FileRow` (`status`, `progress`, `receivedChunks`, `lastSentChunk`, `blob`),
  `ChunkRow`, `FileTransferStatus = "pending" | "transferring" | "done" | "error"`.
- `packages/storage/src/repository.ts` — `putChunk/getChunk/countChunks/listChunks`,
  `updateFileTransfer`, `setFileDone`, `setLastSentChunk`.
- `packages/webrtc/src/file-transfer.ts` — `DEFAULT_CHUNK_SIZE = 16KiB`, `streamFile` (RAM-flat),
  `Sha256`/`hashFile` (streaming), `FileAssembler` (+ `ChunkStore` contract).
- `packages/webrtc/src/peer.ts` — `PeerSession` with `createBufferedAmountGate`; `sendFrame` now
  drains backpressure BEFORE `send` (committed `13ef2d2`).
- `apps/chat/src/lib/session.ts` — `RoomSession.sendFile` streams chunks via `sendCipherChunk`;
  receiver `onFileChunk` → `FileAssembler`; `onClose` → `failStuckTransfers` marks inbound as `error`;
  reconnect via `reestablishSession`/`watchReconnect`.
- `apps/chat/src/components/MessageBubble.tsx` — `FileCard` renders progress / Sent / Received /
  Transfer failed.
- `apps/chat/src/hooks/useFileUrl.ts` — object URL from `FileRow.blob`.
- `apps/chat/src/lib/ice.ts` — STUN-only by default; TURN only when env vars set.

## Decisions (from user)

- **Keep 1:1 rooms** (vision #13 multi-peer is out). One peer per `RoomSession`.
- **Sender source retention: in-tab only** (vision #12 reduced) — retain `File` in a Map; resume
  survives connection drops but NOT tab reload. No OPFS sender copy.
- **Single data channel** (vision #14) — control messages reuse encrypted JSON channel; chunks binary.
- **Backpressure**: keep the existing gate (drain-before-send); equivalent to pump loop, race-free.
- **OPFS only on receiver for large files** (>128 MiB) with feature detection; small files keep
  IDB + in-RAM assemble.
- **TURN**: disabled by default (already true). No change.

## New protocol surface (`packages/protocol`)

`src/ranges.ts` (new, pure + tested):
```ts
export type ChunkRange = [start: number, end: number]; // inclusive
export function mergeRanges(ranges: ChunkRange[]): ChunkRange[];
export function rangesFromSeqs(seqs: number[]): ChunkRange[];
export function missingRanges(total: number, received: ChunkRange[]): ChunkRange[];
export function rangeCount(ranges: ChunkRange[]): number;
```

`src/channel.ts` — replace `file:ready` with:
```ts
| { kind: "file:resume";     fileId: string; totalChunks: number; receivedRanges: ChunkRange[] } // receiver→sender on (re)connect
| { kind: "file:sent";       fileId: string }                                                    // sender→receiver, all dispatched
| { kind: "file:ack";        fileId: string; receivedChunks: number }                            // receiver→sender, periodic progress
| { kind: "file:delivered";  fileId: string }                                                    // receiver→sender, verified+persisted
```
`file:delivered` is the ONLY signal that turns a sender row green (solves "sent here, never arrived").

## Storage (`packages/storage`)

- `FileRow` add non-indexed: `totalChunks?: number`, `receivedRanges?: string` (JSON), `opfsId?: string`.
  No Dexie version bump (no new indexes).
- `FileTransferStatus` add `"interrupted"`.
- `repository.ts`: `setFileRanges(id, ranges)`, `setFileOpfs(id, opfsId)`, `setFileTotalChunks(id, n)`.

## Phase 1 — Resume protocol & sender

- `webrtc/file-transfer.ts`: add `streamFileRanges(file, fileId, chunkSize, ranges, total)` yielding
  `FileChunk` with correct global `seq`/`total` (RAM-flat via `file.slice`); add
  `pickChunkSize(maxMessageSize)` → `clamp(min(max−overhead, 256KiB), 16KiB)`.
- `webrtc/peer.ts`: expose `get maxMessageSize(): number | undefined` via `pc.sctp?.maxMessageSize`.
- `session.ts` sender:
  - `senderFiles = Map<fileId, File>`; `sendFile` stores File + chunkSize + totalChunks.
  - `case "file:resume"`: resolve source → `missingRanges` → `resumeSend(...)`; empty ⇒ `file:sent`;
    unknown source ⇒ `error`.
  - `case "file:ack"`: update in-memory remote ack; progress = max(sent, acked)/total.
  - `case "file:delivered"`: mark `done`, drop from `senderFiles`.
  - `onClose`: outbound `transferring` → `interrupted` (keep file).
  - `sendFile` catch → `interrupted` if channel dropped, else `error` + `onError`.

## Phase 2 — Receiver resume & status

- `session.ts` receiver:
  - Track `receivedRanges` in memory per inbound file; persist to `FileRow.receivedRanges` every
    ~128 chunks, on interrupt, on complete.
  - `onOpen` (after hello): for inbound `pending/transferring/interrupted` files send `file:resume`
    with ranges + `totalChunks`.
  - `onClose` `failStuckTransfers` → inbound `pending/transferring` → `interrupted` (not `error`).
  - Verify-then-deliver: on complete+hash-ok → `done` + send `file:delivered`; on `file:sent` when
    already done → re-send `file:delivered` (lost-ack recovery).
  - Periodic `file:ack` every 128 chunks.
- `MessageBubble.tsx` `FileCard`: `interrupted` → "⚠ Connection interrupted — resuming…" + progress;
  `pending/transferring` → bar; `done` → `✓ Delivered`/`✓ Received`; `error` → "Transfer failed".

## Phase 3 — Adaptive chunking

- `sendFile` uses `pickChunkSize(peer.maxMessageSize)`. chunkSize fixed per transfer, carried in
  `FileMeta`/`FileRow.chunkSize` so resume ranges stay aligned. (Adaptive between transfers.)

## Phase 4 — OPFS receiver (large files)

- `webrtc/opfs.ts` (new): `OpfsWriter` — `open()` via `navigator.storage.getDirectory()` →
  `ghost-files/<fileId>` → `createWritable({ keepExistingData: true })`; `add(chunk)` writes at
  `position = seq*chunkSize`, maintains in-order incremental `Sha256`; `isComplete()`; `finish()`
  → close, verify, return `File`; `getFile()`.
- `session.ts` `onFileChunk`: `size > OPFS_MIN && navigator.storage` → `OpfsWriter` path; else
  existing `FileAssembler`.
- `useFileUrl.ts`: `file.opfsId` → read OPFS file → object URL. Update `sendForward`, MediaLightbox,
  cloud-upload blob access to resolve OPFS files via file handle.

## Docs & verification

- Update `docs/protocol.md` (channel messages, storage schema) + `docs/features.md`.
- New tests: protocol `ranges.test.ts`; webrtc `streamFileRanges` + `pickChunkSize`;
  storage repo new fields.
- Verify: `pnpm -r --filter "@ghost/*" test` (direct), `npx tsc --noEmit` per touched package +
  apps/chat, lint. Commit per phase.
