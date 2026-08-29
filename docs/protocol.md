# Protocol & storage reference

## Socket.IO signaling (`packages/protocol/src/signal.ts`)

### Client → server

| Event | Payload | Ack |
| --- | --- | --- |
| `identity` | `Identity` (`userId`, `name`, `publicKey`) | none |
| `room:create` | `{ selfId: string; code?: string; sessionId: string }` | `{ code; peer: PeerPresence \| null; role }` \| `{ error }` |
| `room:join` | `{ code: string; selfId: string; sessionId: string }` | `{ peer: PeerPresence \| null; selfId; role }` \| `{ error }` |
| `peer:sync` | `{ roomId }` | none (responds with `room:state`) |
| `signal` | `{ to: string; data: SignalData }` | none |

Validation rules:
- `userId`: `^[a-zA-Z0-9_-]{8,64}$`.
- `publicKey`: raw 32-byte X25519 key, standard base64 (`/^[A-Za-z0-9+/]{43}={0,2}$/`).
- `sessionId`: `^sess-[A-Za-z0-9]{12}$` — a fresh id per page-load/device generation.
- `room:create` with an existing code owned by someone else → `{ error: "code taken" }`.
- `room:join` errors: `invalid room code`, `room not found`, `room is full`.
- First joiner claims the room (`peerUserId`). Same `userId` may rejoin (socket swap).
- Membership is keyed by session: the same `sessionId` on a new socket = **socket reconnect**
  (presence refresh only); a different `sessionId` = **page reload** (peers get
  `peer:session-changed` and must rebuild the P2P link).

### Server → client

| Event | Payload |
| --- | --- |
| `connect` | (socket.io) |
| `room:created` | `{ code }` (reserved) |
| `room:joined` | `{ peer: Identity }` (reserved) |
| `room:error` | `{ message }` |
| `room:state` | `{ roomId; peers: PeerPresence[] }` (room's *other* members, answer to `peer:sync`) |
| `peer:joined` | `{ roomId; peer: PeerPresence; role }` |
| `peer:session-changed` | `{ roomId; userId; sessionId }` — peer reloaded; rebuild the link |
| `peer:left` | `{ roomId; userId; sessionId }` |
| `signal` | `{ from: string; data: SignalData }` |

### `SignalData` (WebRTC signaling)

```ts
type SignalData =
  | { type: "offer";  sdp: string; ephemeralPub: string; signalId: string; connectionId?: string }
  | { type: "answer"; sdp: string; ephemeralPub: string; signalId: string; connectionId?: string }
  | { type: "ice"; candidate: IceCandidateData; signalId: string; connectionId?: string };
```

The `ephemeralPub` field is used by the peer to derive the room key (see architecture).
`signalId` dedupes/ACKs signals; `connectionId` is the session-pair generation
(`computePairConnectionId`) — signals from a superseded pair are rejected.

## Room codes (`packages/protocol/src/room-code.ts`)

- `generateRoomCode()` → 8 chars, alphabet excludes confusing characters.
- `formatRoomCode(code)` → `ABCD-EFGH` display form.
- `normalizeRoomCode(code)` → strips separators / lowercases → canonical 8-char id.
- On the wire, room codes are always in **canonical (normalized) form**; display formatting is
  client-side only.

## Channel messages (`packages/protocol/src/channel.ts`)

Encrypted application frames (JSON inside a `frame`):

```ts
type ChannelMessage =
  | { kind: "hello"; identity: Identity }            // first message on open
  | { kind: "message"; message: ChatMessage }        // text | file metadata
  | { kind: "cipher"; payload: EncryptedPayload }    // nested encrypted frame (double encryption)
  | { kind: "ack"; messageId: string; status: "delivered" | "read" }
  | { kind: "typing"; active: boolean }
  | { kind: "edit"; messageId: string; text: string; ts: number }
  | { kind: "delete"; messageId: string; ts: number }
  | { kind: "file:ready"; fileId: string }
  | { kind: "reaction"; messageId: string; emoji: string; add: boolean };
```

Message statuses: `sending | sent | delivered | read | received | failed`.
Message kinds: `text | file`.

## Frames (`packages/protocol/src/frame.ts`)

Binary framing separates channel messages (type `0`) from raw file chunks (type `1`):
`encodeJSONFrame` / `decodeFrame` / `encodeFileChunkFrame`. File chunks carry `fileId`, `index`,
`total`, `data` and are assembled with `FileAssembler` (SHA-256 verified).

## Storage schema (`packages/storage/src/db.ts`)

Dexie/IndexedDB database `ghostchat`, version 2:

| Table | Indexes |
| --- | --- |
| `identity` | `id` (singleton `"identity"`) |
| `rooms` | `id, code, lastActivity` |
| `messages` | `id, roomId, ts, [roomId+ts]` |
| `files` | `id, roomId` |
| `outbox` | `id, roomId, createdAt` |
| `reactions` | `id, roomId, messageId, [messageId+emoji]` |

Key rows:
- `RoomRow`: `id` (canonical code), `code` (formatted), `mode` (`create`/`join`), `peerUserId`,
  `peerName`, `peerPublicKey`, `safetyCode`, `createdAt`, `lastActivity`.
- `MessageRow`: `id`, `roomId`, `isMine`, `kind`, `ts`, `status`, optional `text`, `fileId`,
  `replyTo`, `edited`, `deletedAt`.
- `ReactionRow`: `id`, `roomId`, `messageId`, `emoji`, `count`, `mine`.
- `OutboxRow`: `id`, `roomId`, `envelope` (Uint8Array), `createdAt`, `attempts`.

## Server persistence file

JSON written by `chat-api` (debounced 200 ms) to `<cwd>/.data/rooms.json` (override `ROOMS_FILE`):

```json
{
  "rooms": [
    {
      "code": "ABCDEFGH",
      "owner": "alice-id-0001",
      "peerUserId": "bob-id-0001",
      "createdAt": 1786429431131,
      "members": {}
    }
  ]
}
```

`members` maps `userId → socketId` for live sockets (emptied on disconnect). Rooms are pruned on
load if `createdAt` is older than 30 days.

## Crypto API (`packages/crypto/src/crypto.ts`)

- `generateKeyPair()` → X25519 `{ publicKey, privateKey }` (base64).
- `deriveRoomKey({ privateKey, peerPublicKey, roomId })` → HKDF over ECDH + roomId → AES-GCM key.
- `encryptBytes(key, bytes)` / `decryptBytes(key, iv, data)` → AES-GCM, base64 `{ iv, data }`.
- `computeSafetyCode({ roomId, myPublicKey, peerPublicKey, sharedSecret })` → comparison code.
- `randomId(prefix)` → random 12-byte id.

## Dev test surface

- Package unit tests via vitest (`pnpm --filter <pkg> run check` or `pnpm -r run check`).
- Signaling integration smoke test: `C:\Users\andik\AppData\Local\Temp\opencode\smoke.mjs`
  (9/9 cases). Run against a `chat-api` instance; persistence test restarts the server and
  verifies rooms reload (`docs/roadmap.md` / `dev-notes.md` for context).
