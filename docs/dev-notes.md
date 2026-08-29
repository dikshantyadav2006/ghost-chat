# Dev notes & environment gotchas

## Running everything

```bash
pnpm install
pnpm dev          # turbo: starts all 5 apps (persistent, blocks the terminal)
pnpm check        # typecheck + lint + tests across all packages
pnpm test
pnpm build
pnpm format       # prettier (ts, tsx, js, json, md, css)
```

`pnpm dev` runs these persistent tasks (turbo `concurrency` must be a **string** in `turbo.json`,
currently `"12"`; a number causes `turbo_json_parse_error`):

| App | Script | Port |
| --- | --- | --- |
| `@ghost/chat` | `next dev --turbopack -p 3003` | 3003 |
| `@ghost/chat-api` | `tsx watch src/index.ts` | 4000 |

## Ports & env

- `chat-api`: `PORT` (default 4000), `HOST` (default `0.0.0.0`), `CORS_ORIGIN` (comma-separated,
  default `http://localhost:3003`), `ROOMS_FILE` (persistence path, default `<cwd>/.data/rooms.json`).
- Next apps read `.env.local` / `.env` from their own app dir.

## PWA / service worker gotchas

- The service worker (`apps/chat/public/sw.js`) and install prompt only work in a **secure context**:
  HTTPS in production, `localhost` in dev. `registerServiceWorker()` is a no-op otherwise.
- The manifest is generated from `apps/chat/src/app/manifest.ts` (served at `/manifest.webmanifest`);
  `metadata.manifest` in `layout.tsx` links it. Keep icon files in `apps/chat/public/`.
- The SW only caches same-origin GETs; cross-origin calls (the signaling socket) are never
  intercepted. After changing `sw.js`, bump `CACHE_NAME` so old caches are pruned on activate.
- Hard-refresh/Clear-site-data is required to see SW changes during development (no dev hot-reload
  for `public/` assets).

## Repository conventions

- **Extensionless relative imports** in packages (`from "./crypto"`, not `"./crypto.js"`).
  Required for webpack/Next; fine for tsup/esbuild/vitest/tsx. Do not revert.
- `chat-api` tsup config must keep `noExternal: [/@ghost\//, "zod"]` so the built
  bundle doesn't try to execute raw TS sources at runtime.
- Server returns room codes in **formatted** form (`ABCD-EFGH`); normalize before comparing.
- Room ack shapes: success `{ code }` / `{ peer, selfId }`; failure `{ error }`. No `ok` field.

## Windows process management

- **Dev processes are persistent**: `pnpm dev` blocks the terminal by design. Run it in your own
  terminal.
- **Detached launch** (e.g. from a tool shell that would otherwise kill children):

  ```powershell
  $inv = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = 'cmd.exe /c cd /d "D:\2026\SONAMYADAV__\TRYTOTRY" && pnpm --filter @ghost/chat-api run dev > C:\Users\andik\AppData\Local\Temp\opencode\api-final.out.log 2>&1'
  }
  ```

- **Env vars in cmd chains pick up a trailing space**: use quoted `set`:

  ```powershell
  cmd.exe /c "cd /d X && set ""ROOMS_FILE=path"" && node apps\chat-api\dist\index.cjs"
  ```

  Unquoted (`set ROOMS_FILE=path && node …`) appends a space to the value; the persistence file
  then has a trailing space in its name and is hard to read from the shell.
- Start-Process/pnpm.ps1 wrappers do not work for detached spawns (pnpm is a `.ps1` shim, not an
  exe); always go through `cmd.exe /c`.

## Testing workflow

- Per package: `pnpm --filter @ghost/<pkg> run check` (vitest + tsc + eslint).
- Full suite: `pnpm -r run check`.
- Signaling integration smoke test: `C:\Users\andik\AppData\Local\Temp\opencode\smoke.mjs`
  (socket.io-client against a running `chat-api`; covers stable codes, code-taken, one-time join,
  socket-swap rejoin, invalid/unknown codes — currently 9/9).
- Persistence check: start `chat-api` with an isolated `ROOMS_FILE`, run the smoke test, restart
  the server, and verify rooms reload (health `GET /` shows `rooms` count; a claimed room still
  returns `room is full` for a new user).

## Troubleshooting

- Nothing listening on a port → check `Get-NetTCPConnection -LocalPort <port> -State Listen` and
  the process list (`Get-CimInstance Win32_Process` filtered by `CommandLine`); kill stale
  `node`/`cmd` processes whose command line contains the repo path.
- `pnpm dev` fails to start one app → read the turbo log (each task is prefixed
  `@app:dev:`); `Ready in …` lines indicate a successful Next boot.
- Rooms not persisting → confirm `ROOMS_FILE` value has no trailing space and that the process
  cwd is where you expect (default path is `<cwd>/.data/rooms.json`).
