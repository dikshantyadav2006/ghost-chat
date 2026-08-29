# 👻 GhostChat

An end-to-end-encrypted 1:1 chat app. Every install generates an X25519 identity keypair stored
only on the device. To chat, one side creates a room and shares an invite link or 8-character code
(QR or copy). The other side joins through a Socket.IO signaling server (`chat-api`), which only
relays WebRTC offer/answer/ICE between the two peers — it never sees message content. Once
connected, a per-room AES-GCM key derived from an ephemeral ECDH exchange encrypts all traffic over
a WebRTC DataChannel.

---

## ✨ Features

- **True E2E encryption** — X25519 identity keys, HKDF-derived per-room AES-GCM keys, safety-code
  comparison.
- **Rooms & invites** — create a room, join by 8-char code, invite link, or QR scan; one-time join;
  rooms persist across reconnects and restarts.
- **Messaging** — text with send state, typing indicator, read receipts, offline outbox, replies,
  edits, deletes.
- **Reactions** — 8-emoji picker, toggle add/remove, aggregated counts, synced and persisted.
- **File transfer** — chunked over the DataChannel with progress, SHA-256 integrity, and
  resumable P2P transfer.
- **Calls** — WebRTC voice/video calls over the existing P2P stack.
- **PWA** — installable, offline shell, app-icon unread badge.

## 🛠️ The stack

| What | Why it's here |
| --- | --- |
| **Turborepo** + pnpm workspaces | One monorepo for the web client, signaling server, and shared packages |
| **Next.js 15** (App Router) + React 19 + TypeScript | The web client |
| **Tailwind CSS v4** | Styling |
| **Fastify 5** + **Socket.IO** | The signaling server (`chat-api`) |
| **WebRTC** + **Dexie** (IndexedDB) | P2P transport and local persistence |
| **ESLint 9** + Prettier + Vitest | Clean, tested code |

## 📦 The family

| Path | Role |
| --- | --- |
| `apps/chat` | GhostChat web client (Next.js, `:3003`) |
| `apps/chat-api` | GhostChat signaling server (Socket.IO/Fastify, `:4000`) |
| `apps/android-chat` | Optional native Android client |
| `packages/protocol` | Shared types, room codes, event names, framing |
| `packages/crypto` | X25519, HKDF key derivation, AES-GCM, safety codes |
| `packages/webrtc` | `PeerSession` (offer/answer/ICE), file chunk/assemble |
| `packages/storage` | Dexie/IndexedDB schema + repository |
| `packages/config-typescript` / `packages/config-eslint` | Shared tsconfig / eslint config |

## 🚀 Quick start

```bash
pnpm install

# 1. Configure env (see each app's .env.example):
#   apps/chat-api/.env.example   -> PORT (4000), HOST, CORS_ORIGIN, ROOMS_FILE

# 2. Run it
pnpm dev
#   chat:      http://localhost:3003  👻
#   chat-api:  http://localhost:4000  ⚙️ (signaling)
```

`pnpm dev` is persistent and blocks the terminal by design; run it in your own terminal.

- `chat-api` `PORT` (default `4000`), `HOST` (default `0.0.0.0`), `CORS_ORIGIN` (comma-separated,
  default `http://localhost:3003`), `ROOMS_FILE` (persistence path, default `<cwd>/.data/rooms.json`).
- Rooms are persisted server-side so invite links survive restarts, and join is one-time per room.

## 📚 Docs

See [`docs/`](./docs/README.md) for the full architecture, protocol, features, roadmap, and dev notes.

## ✅ Keeping it healthy

```bash
pnpm check   # typecheck + lint + test + build (per package)
```

## 🧠 How it works

- **Signaling**: `chat-api` matches two users into a room and relays SDP/ICE. It never sees
  plaintext.
- **Transport**: WebRTC DataChannel, P2P when possible (STUN); no TURN configured by default.
- **E2E**: room traffic is encrypted with a per-room AES-GCM key before it touches the DataChannel,
  so even the P2P link content is double-protected.
- **Identity**: a fresh X25519 keypair per install, stored only on the device. The private key never
  leaves the device.
- **Persistence**: messages, files, reactions, edits, deletes, and room metadata live locally in
  IndexedDB (Dexie). Rooms are also persisted server-side.

---

<p align="center">
  <b>Private by default. Encrypted end to end.</b><br/>
</p>
