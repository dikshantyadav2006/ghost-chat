# Features

Current, implemented feature inventory for GhostChat.

## Identity & onboarding
- One-tap identity creation: X25519 keypair + `userId` + name + avatar, stored in IndexedDB.
- Identity never leaves the device; private key is never transmitted.
- Settings screen (`HomeScreen` → gear):
  - Rename yourself (`renameIdentity`).
  - Copy your `userId` and public key (share out-of-band).
  - Reset identity with confirmation (deletes keys/profile, closes all sessions).
- Signal-server status pill in the header (green "signal" / grey "offline").

## Progressive Web App
- Installable: `manifest.ts` (`display: standalone`, SVG icon) + `beforeinstallprompt`
  handling; an "Install app" row appears in settings once the prompt is available.
- Hand-rolled `public/sw.js` caches the app shell (network-first navigations,
  cache-first `/_next/static/`), so the app still opens offline and restores its
  session from IndexedDB. The worker never touches WebRTC or the signaling socket.
- App-icon badge via `navigator.setAppBadge(sumUnread())` with `document.title`
  fallback (`UnreadTitle`).

## Rooms & invites
- Create a room; join by 8-char code (`ABCD-EFGH`), invite link, or **QR scan**.
- **QR scanning**: the header scan button and the "Scan a QR" action in New chat open a live camera
  scanner (`QrScanner`, jsQR). It reads GhostChat join links (`/join/CODE`) or bare codes and joins
  the room immediately — handy on mobile.
- New chat panel (`NewChatModal`): "Create a room", "Scan a QR", or join with a code. After creating,
  the panel shows the room's QR, **Copy code** and **Copy invite link** (one-time, for one person)
  plus an **Open chat** button — no need to leave the panel to share.
- Invite modal (`QrModal`, opened via the header link button or after joining from the join page):
  - QR code scanning to `/join/CODE`.
  - Copy invite link (one-time, for one person).
  - Copy room code.
  - "Already connected / link used" hint once the room is claimed.
- **Persistent rooms**: creator reuses the same code across reconnects and server restarts.
- **One-time join**: the first joiner claims the room; others get `room is full`.
- Rooms list on home: avatar, peer name, last message preview, time, online dot, unread badge.

## Messaging
- Text messages with send state (sending/sent/delivered/read).
- Typing indicator (`typing` frames) shown in the connection banner.
- Read receipts (`ack` frames with `delivered` / `read`); auto-mark-read while the room is open.
- Offline outbox: text queued in IndexedDB and flushed on reconnect.
- Reply-to with quoted preview (`replyTo`).
- Edit messages (own, not deleted); edited marker.
- Delete messages (own) → tombstone shown as "This message was deleted".
- Copy message text / file name (action bar).

## Reactions
- 8 emoji quick-react picker from the message action bar (`REACTION_EMOJIS`).
- Toggle add/remove; aggregated counts per emoji; "mine" highlighting.
- Synced over the wire (`reaction` frames) and persisted per room.

## File transfer
- Send files over the WebRTC DataChannel via `chunkFile` / `FileAssembler`.
- Chunked transfer with progress, integrity check (SHA-256), resume-less retry on failure.
- Receive: inline file message, tap to download blob (`FileRow.blob`), `file:ready` completion.
- Files are E2E-encrypted like any message (chunks ride the encrypted channel).

## Security / privacy
- Per-room AES-GCM key derived from an ephemeral ECDH + HKDF + roomId.
- Safety code comparison to verify peers out-of-band (lock button → `SafetyModal`).
- Unexpected peer identity on `hello` triggers a security warning.
- Server only relays signaling; it never sees plaintext.

## Reliability
- Auto-reconnect with session re-establishment (3 s watchdog) and socket-swap on the server.
- Fast reconciliation triggers: `visibilitychange`, `online`, `pageshow` (bfcache) and `focus`
  all request a fresh `peer:sync` immediately, so returning to the tab/app reconnects in <1 s.
- **App-level presence**: `useIdentity` calls `openAllRooms` on boot, silently opening a session for
  every stored room (no navigation). The socket + server know we are online in all of them for the
  whole app session, so messages/calls/files arrive from any screen. WebRTC links are built lazily —
  only when a peer is actually online — so idle rooms are just registration + presence.
- **Global listeners**: incoming calls render the app-level `CallModal` (root layout) and the
  incoming-message sound plays from the session layer, so a background chat rings even while another
  chat (or the home screen) is open.
- Room persistence server-side (JSON, debounced saves, 30-day retention for unclaimed rooms).
- UI scroll-to-bottom with auto-follow and a jump-to-latest button when scrolled up.
- Day grouping in the transcript.

## Verified by tests
- `@ghost/protocol` — 7 tests (room codes, framing, events).
- `@ghost/crypto` — 10 tests (key agreement, HKDF binding, AES-GCM roundtrip).
- `@ghost/storage` — 8 tests (messages, rooms, unread counts, reactions).
- `@ghost/webrtc` — 6 tests (peer session, chunking/assembly).
- Signaling integration smoke test — 9/9 (stable code reuse, `code taken`, one-time claim,
  socket-swap rejoin, malformed/unknown codes) plus 2/2 restart-persistence checks.
