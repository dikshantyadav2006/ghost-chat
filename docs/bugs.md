# Known bugs, edge cases & limitations

Status legend: OPEN = to fix, FIXED = resolved (documented for reference), LIMIT = by design.

## OPEN

1. **Stuck typing indicator** — `typing[roomId]` in the zustand store is never cleared on
   `peer:left` or socket disconnect. If the peer disconnects mid-typing, the banner keeps showing
   "typing…". Fix: reset typing in the `peerLeft`/`disconnect` handlers in
   `apps/chat/src/lib/session.ts` (and on `roomError`).
2. **No explicit "failed" timeout** — messages are now ack-gated: the outbox keeps each message
   until the peer acks it, and the outbox is re-flushed on every channel (re)open, so nothing is
   lost across reconnects/reloads. What's still missing is a timeout that flips an unacked message
   to `failed` and a "tap to retry" affordance; today it retries silently on the next reconnect.
3. **Unread badge timing** — unread counts rely on `markAllRead` running when the room opens; if a
   message arrives while the room is open but the ack round-trips slowly, the badge can briefly
   lag. Cosmetically fixable by optimistic local clear.
4. **Reactions have no un-read receipt** — reaction frames are applied locally and encrypted, but
   there is no ack for reactions; a reaction sent while offline is queued but has no delivery
   confirmation.
5. **Room list preview loads all messages** — `RoomListItem` calls `listMessages(room.id)` for the
   full transcript to render the last line; heavy rooms should use an index query for the last
   message only.
6. **Server crash within the 200 ms save window** — `chat-api` debounces room persistence
   (200 ms); a hard crash in that window loses the most recent room change. Acceptable for dev;
   consider immediate `await save()` on process shutdown (`SIGTERM`/`SIGINT`).
7. **TURN absent** — WebRTC can fail on symmetric NAT / strict corporate networks; no fallback
   relay yet. See roadmap.
8. **Typing frames are firehose** — each keystroke can emit a `typing` frame (Composer debounces
   client-side only via `sendTyping`); consider a shared server-side rate limit.

## LIMIT (by design)

- **1:1 only** — room key is derived for exactly two peers; group chat is a future feature.
- **Both peers must be online** to exchange messages in real time; offline text is queued in the
  local outbox and delivered on the next successful reconnect.
- **Identity is device-bound** — a new install creates a fresh identity; there is no account
  recovery (reset identity = keys are gone). Documented in Settings.
- **Private key in IndexedDB** — standard for web apps; XSS on the origin could exfiltrate it.
  CSP hardening is recommended before any production use.
- **No message retention controls** — transcripts live forever locally until the browser storage
  is cleared.

## FIXED (reference)

- **Reconnect permanently killed the P2P channel** — after any socket glitch or page reload the
  creator never re-initialized a peer (its `roomCreate` ack returned no peer and `reestablish`
  never called `init`), while the joiner raced between `offerer` (roomJoin ack) and `answerer`
  (`peerJoined`). The channel never reopened, presence stayed offline, and queued messages never
  flushed. Fixed by returning `peer` + deterministic `role` in both acks, routing `peerJoined`/
  `peerLeft`/`signal` by `roomId`, idempotent `init(role)` with an incoming-signal buffer, and
  `reestablishSession` re-initializing for both modes.
- **Messages dropped when sent into a dying channel** — outbox removed entries on send instead of
  on ack. Now `message`-kind outbox entries persist until the peer's `ack` arrives (re-sends are
  idempotent: dedupe by message id / chunk index), so no text is lost across reconnect/reload.
- **`peerJoined` matched by `peerUserId`** — null until a peer connected, so a peer joining while
  the room owner was away was ignored forever. Now routed by `roomId`.
- **Chat build failed: extensionless imports** — package-internal relative imports must be
  extensionless (`from "./crypto"`) for webpack/Next resolution; tsup/esbuild/vitest all accept
  them. Do not re-add `.js` extensions to package source.
- **chat-api runtime `ERR_MODULE_NOT_FOUND`** — fixed by `noExternal: [/@ghost\//, "zod"]` in
  `apps/chat-api/tsup.config.ts` so the bundle does not run raw TS sources at runtime.
- **turbo `turbo_json_parse_error`** — `turbo.json` `concurrency` must be a string (`"12"`), not a
  number.
- **TS2345 in `ensureRegistered`** — capture `const id = identity` before the socket closure.
- **One-time join "already in room"** — duplicate memberships now swap sockets (reconnect), and a
  stale socket no longer evicts a newer one (`hub.ts` disconnect checks the socket id).
- **Reactions index** — `reactions` table index includes `roomId` so per-room queries work.
- **Room create ack shape** — success is `{ code }`, failure is `{ error }` (no `ok` field).
- **Formatting** — the server returns formatted codes (`ABCD-EFGH`); always normalize
  (`normalizeRoomCode`) before comparing.

## Environment gotchas (see dev-notes.md)

- Launching `chat-api` via `cmd /c "set VAR=... && node …"` appends a trailing space to the env
  value — quote it (`set "VAR=..." && …`) or the persistence file name gets a trailing space.
- Long-lived dev processes must be spawned detached (`Invoke-CimMethod Win32_Process.Create`)
  because children of the tool shell are killed when the shell exits.
