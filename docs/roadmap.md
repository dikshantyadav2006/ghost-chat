# Roadmap

## Next todos (short term, highest value first)

1. **Multi-user / group chats** — currently the product is strictly 1:1 by design (encryption keys
   are derived per pair). Redesign the room model so a room can hold N members with per-member keys
   (or a shared room key with member key-wrap). This is the largest change and is explicitly
   deferred; do not start until 1:1 is stable.
2. **Clear typing indicator on disconnect** — `typing[roomId]` is never reset when the peer leaves
   or the socket disconnects, so a stuck "typing…" can persist. Reset typing on `peer:left` and on
   the socket `disconnect` in `apps/chat/src/lib/session.ts`.
3. **TURN / relay fallback** — add coturn (or a managed TURN service) so calls/chat work behind
   symmetric NATs and strict firewalls; expose the server URL via `chat-api` env and wire it into
   the `PeerSession` ICE config.
4. **Push notifications / offline delivery** — when a peer is offline, allow `chat-api` to buffer
   encrypted envelopes per room and deliver on reconnect (server only stores ciphertext), or add a
   web push channel so joiners know someone is waiting.
5. **File transfer resume + large files** — chunk-level retry/resume instead of restart-from-zero;
   backpressure and a max-file-size guard in the UI.
6. **Message search** — add a full-text search over IndexedDB messages per room (or a
   `searchMessages` repo method) and a search bar in the chat header.
7. **Delete room / clear chat** — add per-room actions (delete conversation locally, clear history).
8. **Safety-code comparison UX** — render a human-friendly comparison (blocks + "Same code" /
   "Codes differ") and warn when a room key or peer key changes between sessions.

## Medium term

- **Multi-device / identity sync** — sync the identity keypair to other devices securely (recovery
  phrase, or signed device handshake), and support multiple simultaneous devices per account.
- **Profile pictures & themes** — avatar upload (E2E), light/dark theme toggle, per-chat wallpaper.
- **Media gallery view** — a per-room grid of received/sent files.
- **In-app room pinning & archiving**, message pinning.
- **Voice/video calls** — the WebRTC stack already exists; add media streams (gated on TURN).
- **Link previews** (fetch-then-encrypt) and **stickers/GIFs**.
- **Message history export** (encrypted JSON + human-readable transcript).

## Long term / product

- **Deployment story** — Dockerize `chat-api` + `chat`, deploy to a host (e.g. Fly/Railway/Azure
  Container Apps), add HTTPS + WSS reverse proxy, domain name for stable invite links.
- **Rate limiting & abuse controls** on `chat-api` (per-IP create/join limits, room code entropy).
- **Observability** — structured request logging, metrics (rooms/peers/active sockets), uptime probe.
- **E2E encryption audit** — formal threat model doc, key-rotation policy, forward secrecy review
  (currently the room key is derived from ephemeral keys per connection; verify perfect forward
  secrecy and document it).
- **Native apps** (PWA install already feasible; then Capacitor/Electron wrappers) with the same
  identity model.
- **Monetization** — nothing defined yet; document any plans here.

## Explicit non-goals for now

- Multi-user/group chat (see item 1) until the 1:1 core is hardened.
- Server-side message storage or cloud sync of plaintext history.
- Username/password accounts; identity is device-bound by design.
