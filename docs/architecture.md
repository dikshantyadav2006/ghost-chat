# Architecture

## System overview

```
        ┌──────────────────────────┐
        │      chat-api (:4000)     │   Socket.IO signaling hub
        │  SignalHub                │   • relays identity + WebRTC signals
        │  room persistence (JSON)  │   • never sees message content
        └────────────┬─────────────┘
                     │  Socket.IO (room:create / room:join / signal)
       ┌─────────────┴─────────────┐
       │                           │
┌──────▼──────┐             ┌──────▼──────┐
│  Peer A     │             │  Peer B     │
│ chat (:3003)│             │ chat (:3003)│
│             │◄───────────►│             │
│ WebRTC DataChannel        │             │
│ (DTLS, then AES-GCM)      │             │
└─────────────┘             └─────────────┘
     │  IndexedDB (Dexie)         │  IndexedDB (Dexie)
```

- Signaling: `chat-api` matches two users into a room and relays SDP/ICE.
- Transport: WebRTC DataChannel, P2P when possible (STUN); no TURN configured yet.
- E2E: room traffic is encrypted with a per-room AES-GCM key before it touches the DataChannel,
  so even the P2P link content is double-protected and the signaling server can never decrypt it.

## Monorepo layout

Workspace root: `D:\2026\SONAMYADAV__\TRYTOTRY` (`packageManager: pnpm@10.28.2`, turbo).

| Path | Package | Role |
| --- | --- | --- |
| `apps/chat` | `@ghost/chat` | Next.js 15.5 web client (Turbopack, port 3003) |
| `apps/chat-api` | `@ghost/chat-api` | Socket.IO signaling server (Fastify, port 4000) |
| `packages/protocol` | `@ghost/protocol` | Shared types, room codes, event names, framing |
| `packages/crypto` | `@ghost/crypto` | X25519, HKDF key derivation, AES-GCM, safety codes |
| `packages/webrtc` | `@ghost/webrtc` | `PeerSession` (offer/answer/ICE), file chunk/assemble |
| `packages/storage` | `@ghost/storage` | Dexie/IndexedDB schema + repository |
| `packages/config-typescript`, `config-eslint` | | Shared tsconfig / eslint config |

## Crypto model

- **Identity keypair**: X25519 (`@noble/curves/ed25519`), generated per install. `publicKey`,
  `privateKey`, `userId`, `name`, `avatar` live in IndexedDB; the private key never leaves the device.
- **Per-room session key**: each connection generates a fresh ephemeral X25519 keypair. Room key =
  `HKDF(ECDH(ephPrivate, peerEphPublic), roomId)` (see `deriveRoomKey`).
- **Encryption**: AES-GCM (12-byte IV, base64 wire format) via WebCrypto.
- **Safety code**: `computeSafetyCode(roomId, myPub, peerPub, sharedSecret)` — a fingerprint both
  sides can compare out-of-band to detect MITM (shown via the lock button in the chat header).
- **Message integrity**: AES-GCM authenticates ciphertext; bad MACs are silently dropped.

## Client flow

1. `Onboarding` generates an identity keypair.
2. On every page, `useIdentity` loads the identity then calls `openAllRooms` — the **app-level
   session manager** silently opens a session for *every* room stored on the device (no
   navigation). Presence is device-level: socket connected → online in all rooms.
3. `HomeScreen` lists persisted rooms (`RoomRow`), shows unread badges, signal status, settings.
4. Create room → `openRoom({ mode: "create" })` → `room:create` with a stable `code` → invite UI
   shares the join link `/join/CODE` (QR + copy + scan).
5. Join room → `/join/[code]` → `openRoom({ mode: "join" })` → `room:join`; first joiner claims
   the room (one-time link).
6. Both sides exchange SDP/ICE via `signal`. The join side is `offerer`, the creator is `answerer`.
   WebRTC links are **lazy**: a peer connection is only built once the peer is actually present
   (`peer:joined`/`room:state`), so idle rooms stay lightweight — registration + presence only.
7. On `peer:joined` both run `PeerSession`; `hello` verifies the peer identity matches the claimed
   `peerUserId`/`publicKey`; the room key is derived from the SDP `ephemeralPub`.
8. Messages are encrypted, framed, sent over the DataChannel, stored locally, and acked
   (`delivered` / `read`). Offline sends go to an IndexedDB `outbox` and flush on reconnect.
9. Incoming messages/calls arrive for **any** open room regardless of the active screen: persisted,
   unread++, desktop notification (when tab hidden or another room active), sound when the tab is
   visible. Incoming calls render the global `CallModal` (mounted in the root layout).

## Server (chat-api) flow

- `SignalHub` (`apps/chat-api/src/hub.ts`) keeps `clients` (socket → identity/rooms) and `rooms`
  (code → owner, peerUserId, createdAt, members).
- **Persistence**: rooms are written to JSON (`<cwd>/.data/rooms.json` by default, override with
  `ROOMS_FILE`), loaded at startup, saved debounced (200 ms). Rooms survive restarts and are never
  deleted on disconnect. Unclaimed rooms older than 30 days are pruned on load.
- **Stable codes**: `room:create` accepts an optional `code`; the owner re-creates the same room
  after reconnect; a different user gets `code taken`.
- **One-time join**: the first joiner becomes `peerUserId`; later different users get
  `room is full`; the claimed peer may rejoin (socket membership is swapped on reconnect).
- Health: `GET /` returns `{ ok, service, rooms, peers }`.

## Presence model

- **Device presence**: the socket is connected (`signalOnline` in the header). The identity is
  registered with the server at the socket level; while the app is open the server treats the user
  as online in every room stored on the device.
- **Room presence** (`online[roomId]`): whether the *peer* is socket-connected and in that room.
  Updated by `peer:joined` / `peer:left` / `room:state` for all background rooms, not just the
  active chat.
- **Connectivity** (`peerState[roomId]`): the WebRTC link health for a room, independent of
  presence. A peer can be online while the data channel is still negotiating.
- **"Chat open" is pure UI state** (`activeRoomId`). It only affects read receipts, sound/desktop
  notification suppression, and where unread counts are cleared — never connectivity.

## State management

- `apps/chat/src/lib/store.ts` (zustand): `signalOnline`, `online[roomId]`, `typing[roomId]`,
  `activeRoomId`, `identity`, `setRoomError`, `setActiveRoomId`, `setIdentity`.
- `apps/chat/src/lib/session.ts`: `RoomSession` owns the `PeerSession`, room key, outbox flush,
  and every send/receive handler. Module-level `sessions` map keyed by roomId; reconnection
  watchdog (`watchReconnect`) re-establishes sessions every 3 s while offline.
  `openAllRooms(identity)` is the app-level opener (called from `useIdentity` on every page).
- `apps/chat/src/lib/identity.ts`: loads/saves the local identity and exposes the `repo`
  (repository over the storage package).

## Offline & PWA

- Installability: `app/manifest.ts` (standalone, SVG icon) + `beforeinstallprompt` captured in
  `lib/pwa.ts`; a custom "Install app" row in the settings modal triggers the prompt.
- `public/sw.js` (hand-rolled, no build step): precaches the app shell; network-first for
  navigations with cached-shell fallback; cache-first for immutable `/_next/static/` assets.
  Cross-origin requests (signaling socket, any future push API) are never intercepted, and the
  worker contains no WebRTC/socket logic — it is purely shell + offline bootstrapping.
- Session restore: `store.setActiveRoomId` persists the open room to `IdentityRow.lastActiveRoomId`
  (Dexie field, not indexed — no schema migration). On boot, `useIdentity` calls `openAllRooms`,
  which opens every persisted room silently in the background so all sessions re-register and P2P
  reconnects while the UI hydrates from IndexedDB. A stale last-active pointer is cleared if it no
  longer matches a real room.
- Global listeners: incoming calls render the app-level `CallModal` (root layout), and the
  incoming-message sound is played from the session layer — so messages/calls ring from any screen
  while the app is open.
- Unread badge: `UnreadTitle` sets `navigator.setAppBadge(sumUnread())` (with `document.title`
  fallback), so a PWA-installed client shows unread counts on the app icon without any server.
