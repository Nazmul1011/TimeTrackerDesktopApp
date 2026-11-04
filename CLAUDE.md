# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gr8r Time Tracker desktop client (Electron 37 + Next.js 15 App Router + React 19). It is one of three separate git repos in the `E:\Timetracker` workspace:

- `TimeTrackerBackend`: NestJS API on port 3001
- `TimeTrackerFrontendGr8r`: web dashboard

Workspace-wide rules live in `../.cursor/*.md` (`workflow_rules.md`, `frontend_rules.md`, `project_context.md`). After changing timer, idle, auth, tray or notification behavior, update those files in the same task.

## Commands

```bash
npm run dev            # compile electron/ → dist-electron/, start Next on :3000, launch Electron when ready
npm run dev:web        # renderer only in a browser (no native tracking, window.electronAPI is undefined)
npm run typecheck      # tsc for renderer (tsconfig.json) AND main (tsconfig.electron.json)
npm run lint           # eslint, --max-warnings 0
npm test               # Vitest, all tests in tests/
npm test -- tests/electron/outbox.test.ts   # one file (add -t "name" for one test)
npm run test:watch
npm run electron:compile   # rebuild main process only (needed after editing electron/**)
npm run electron:build:win | electron:build:mac   # next build (static export to out/) + electron-builder → release/
```

Tests live in `tests/electron/` (main process) and `tests/renderer/` (src/). `npm test` runs Vitest through `scripts/run-tests.cjs` with `ELECTRON_RUN_AS_NODE=1`, because `better-sqlite3` is built for Electron's ABI and plain `node` cannot load it. Do not rebuild it for Node to make tests pass. Main-process tests mock `electron-log/main` and `electron/database/sqlite` and use an in-memory SQLite DB.

CI (`.github/workflows/ci.yml`, Windows) runs install, `electron-builder install-app-deps` (Electron build of better-sqlite3), typecheck, lint, test and `next build` on every push to main and every PR. Lint uses `--max-warnings 0`, so unused imports fail CI.

Before a release, run the manual checklist in `docs/release-checklist.md`.

`npm run dev` does not watch `electron/`: after editing main-process code, restart it. The husky pre-commit hook runs lint-staged (eslint --fix + prettier).

Setup: copy `.env.example` to `.env`. The API URL variable is `NEXT_PUBLIC_API_BASE_URL`. Packaged builds with no env fall back to `https://gr8rtrackerapp.gr8rdesign.com` (`electron/api-url.ts`). Seed login: `admin@gr8r.studio` / `Password123!`.

`better-sqlite3` must be the Electron build of the native module, not the plain Node build. If SQLite fails to load, rebuild it for Electron.

## Architecture

### Two processes, one bridge

- `electron/`: main process (CommonJS, compiled by `tsconfig.electron.json` to `dist-electron/`). Owns the OS: window, tray, updater, SQLite, screen capture, idle detection and active-window sampling.
- `src/`: Next.js renderer, built as a static export (`output: "export"`). In dev it loads from `http://localhost:3000` (`ELECTRON_RENDERER_URL`). In production `electron/main/renderer-server.ts` serves `out/` on 127.0.0.1.
- `electron/preload/index.ts` exposes `window.electronAPI` through `contextBridge` (sandbox and contextIsolation are on). The renderer reaches native code only through `src/services/electron/` (`getElectronAPI()` / `isElectron()`), never with `require`.
- To add a native feature: add an Electron service, register the IPC handler in `electron/ipc/` (wired through `electron/ipc/index.ts`), expose it in preload, type it in `src/types/electron.d.ts`, and add the channel to `src/constants/ipc.ts` if used. Do all of this before writing the UI.
- IPC security (`electron/security/`):
  - `installIpcSenderGuard` runs first in `registerIpcHandlers` and wraps `ipcMain.handle`, so every handler rejects callers that are not the renderer or a loopback host. Register handlers only after it runs.
  - Handlers that take a payload validate it with a zod schema from `ipc-schemas.ts` via `parseIpcPayload`. Schemas must accept everything the renderer sends today, including `null` and missing fields. `tests/electron/ipc-security.test.ts` holds real payload fixtures, so add yours there.
  - `shell.openExternal` only accepts http, https and mailto (`isSafeExternalUrl`).

Note: `electron/ipc/timer.ts` handlers are stubs that return "Not implemented". The real timer logic is in the renderer (below). Several `FOLDER.md` files still say "stubs" but most services are implemented.

### Who owns what

- **Timer state and timer/activity uploads: renderer.** `src/lib/timer-actions.ts` changes the clock immediately on a click, then uploads through a serialized chain (`enqueueUpload`) with a sequence guard. `src/store/timer.store.ts` (Zustand) holds the session. `src/hooks/useTimer.ts` drives the UI and today's total.
- **Tracking agent: main.** `electron/services/tracking/index.ts` (`TrackingService` singleton) runs the screenshot loop, a 60s heartbeat to the server (the server auto-stops a timer after 5 minutes of silence), idle auto-pause and auto-resume, and screenshot upload. It runs in main so it keeps working when the window is hidden. The renderer starts and stops it through `tracking:start` / `tracking:stop` and pushes tokens with `tracking:updateAuth`.
- `src/providers/tracking-agent-provider.tsx` mounts the cross-route hooks (`useTrackingAgent`, `useOfflineSync`, `useTimerSync`, tray hooks). These must stay mounted on every route.

### Auth

`src/services/api/client.ts` (Axios) attaches `Authorization`, `x-organization-id`, `x-device-type: desktop`, `x-device-id` and `x-session-token`. On 401 it refreshes through `POST /auth/refresh` with a single in-flight promise. Tokens are kept in localStorage via `src/store/auth.store.ts` and mirrored to main.

In main, `StorageService` (`electron/services/storage/`) keeps the session in electron-store, encrypted with `safeStorage` under the `authSessionEnc` key. A plaintext `authSession` from an older version is migrated on first read. If OS encryption is unavailable, it falls back to plaintext. Renderer localStorage still holds tokens; moving them out is planned for Phase 3.

`TrackingService` has its own refresh path and reports back through `tracking:token-refreshed` / `tracking:auth-expired`. Keep the two in sync.

Rules:

- Only a 401 from refresh logs the user out. Do not clear tokens when refresh fails because of the network.
- A missing access token with a refresh token still present does not mean logged out.
- Home waits for `hasHydrated` before deciding the user is logged out.

API responses use the envelope `response.data.data`. For multipart screenshot uploads, drop the `Content-Type` header so the boundary is set automatically.

### Offline outbox

`electron/database/outbox.ts` (SQLite, path from `electron/database/sqlite.ts`) holds two tables:

- `outbox`: rows of kind `timer` | `activity` | `screenshot`
- `offline_session`: the last known session per organization

Flow:

1. When an upload fails or times out (about 4s), the renderer (`src/lib/offline-sync.ts`, `src/lib/timer-outbox.ts`) enqueues the event over `sync:*` IPC.
2. `flushOfflineQueue` replays the events in order with their original timestamps through `POST /timer/replay`.
3. Screenshots are saved as files in the offline screenshot directory and flushed by `TrackingService`.

A crash or shutdown does not keep tracking. The next launch closes the session at the last saved moment, matched by `bootId`.

### Offline screens

- `src/store/connection.store.ts`: `online`, `pending` counts and `restoredAt`. The axios response interceptor feeds it: any HTTP answer means online; no answer or 502/503/504 means offline. `src/hooks/useConnectionMonitor.ts` (mounted in `TrackingAgentProvider`) polls `/health/live` while offline, counts the outbox, and on reconnect flushes the queue and then fires `CONNECTION_RESTORED_EVENT`. Screens reload on that event.
- `src/components/layout/connection-banner.tsx`: the banner on every route.
- `src/lib/view-cache.ts`: each screen's last server load, kept in localStorage per user and org, dropped after 8 days, and cleared in `clearSession` (logout). On failure, a screen falls back to it and shows `SavedCopyNote`. Write it only when the full load succeeded.
- `src/lib/offline-time.ts`: sessions stopped offline (recorded in `stopTimer` and `recoverInterruptedSession`). Today's total and the summary add them on top of the server's number. An entry is dropped as soon as the timer outbox no longer holds its `sessionStartedAt`, so it is never counted twice.
- `src/lib/offline-overlay.ts`: offline sessions, queued activity and queued screenshots, shaped like server rows. Ids start with `pending-offline-`, and screens keep these rows out of edit and delete.
- While `online` is false, editing time, screenshot deletion requests and profile save are turned off.
- Tests: `tests/renderer/{view-cache,offline-time,offline-overlay}.test.ts` and the reachability cases in `api-client.test.ts`.

### Behaviors not to regress

- Closing or minimizing the window hides it to the tray (`event.preventDefault()` + `hide()`), and tracking continues. Only tray Quit exits. `before-quit` sends `tray:command { action: "stopAndQuit" }` to the renderer and waits up to 2.5s before `app.exit`.
- After an idle auto-pause, the next mouse or keyboard input auto-resumes (`tracking:idle-resume`), however long the break. A manual Pause still needs Resume. Details:
  - Waking from sleep alone does not resume, because Windows can wake on its own. Unlocking the screen does resume.
  - `src/lib/idle-pause-state.ts` remembers that a pause came from idle. While the window shows that pause, `useTrackingAgent` keeps the main watcher on with `tracking:armIdleResume`, and main restarts a dead watcher every minute.
  - Every `disarmIdleResume(reason)` call is logged with its reason.
  - If the window is not "paused" when the resume arrives, `handleIdleResume` checks the server instead of skipping.
  - Tests: `tests/electron/idle-service.test.ts`, `tests/electron/tracking-idle-resume.test.ts`, `tests/renderer/idle-timer-sync.test.ts`.
- Idle timeout is **2 minutes** (`DEFAULT_IDLE_TIMEOUT_MINUTES` in `src/store/settings.store.ts`), confirmed by the product owner.
- Today's total (`refreshTodayTotal`) reloads on start/resume, window focus/visible, and stop, and retries until one load succeeds. Do not change it to load once on mount.
- On `/notifications`, clicking a card only marks it read and does not navigate.

### Renderer conventions

- Compact window (about 446×640) with a light theme. UI is shadcn/ui (`src/components/ui/`) + Tailwind 3 + `lucide-react`.
- Domain UI goes in `src/components/<feature>/`.
- Loading states use the skeletons in `src/components/layout/section-skeletons.tsx`, shaped like the section, not "Loading…" text. Show them only until the first data, from the server or the saved copy. Reloads keep the current content on screen.
- API calls go only in `src/services/api/*.api.ts`, with shared types in `src/services/api/types.ts`.
- React Query caches server lists (timesheet, screenshots, notifications); invalidate after mutations. Zustand is only for state shared across pages.
- Org context (`x-organization-id`) goes on every org-scoped request, and switching org must refetch.
- Realtime uses Socket.IO namespace `/realtime` (`src/services/realtime/socket.ts`).
- Path alias: `@/*` points to `src/*`.
