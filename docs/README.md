# Docs

Documentation for the **GhostChat** end-to-end-encrypted 1:1 chat app, which lives in this monorepo.

## Contents

| File | What it covers |
| --- | --- |
| [README.md](./README.md) | Overview, quick start, ports |
| [architecture.md](./architecture.md) | How the chat works end to end |
| [features.md](./features.md) | Every implemented chat feature |
| [roadmap.md](./roadmap.md) | Next todos and long-term plans |
| [bugs.md](./bugs.md) | Known bugs, edge cases, limitations |
| [protocol.md](./protocol.md) | Wire protocol and storage schema reference |
| [dev-notes.md](./dev-notes.md) | Environment gotchas and testing workflow |
| [mobile.md](./mobile.md) | React Native client: plan, platform constraints, spike status |

## Quick start

```bash
pnpm install
pnpm dev        # starts the chat apps (see ports below)
pnpm check      # typecheck + lint + tests for every package
pnpm test
pnpm build
```

| App | Port | Purpose |
| --- | --- | --- |
| `@ghost/chat` | 3003 | GhostChat web client (Next.js) |
| `@ghost/chat-api` | 4000 | GhostChat signaling server (Socket.IO) |

`pnpm dev` is persistent and blocks the terminal by design; run it in your own terminal.

## GhostChat in one paragraph

GhostChat is a WhatsApp-style chat web app with true end-to-end encryption. Every install generates
an X25519 identity keypair stored only on the device. To chat, one side creates a room and shares an
invite link or 8-character code (QR or copy). The other side joins through a Socket.IO signaling
server (`chat-api`), which only relays WebRTC offer/answer/ICE between the two peers — it never sees
message content. Once connected, a per-room AES-GCM key derived from an ephemeral ECDH exchange
encrypts all traffic over a WebRTC DataChannel. Messages, files, reactions, edits, deletes, and
room metadata persist locally in IndexedDB (Dexie). Rooms are also persisted server-side so invite
links survive restarts, and join is one-time per room.
